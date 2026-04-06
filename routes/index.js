var express = require("express");
var http = require("http");
var router = express.Router();

// Require login for application feature pages
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect("/login");
}

// Map internal hazard codes to human-readable labels
function mapHazardToLabel(hazardType) {
  switch (hazardType) {
    case "cyclone":
      return "Cyclone / Typhoon";
    case "flood":
      return "River / Flash Flooding";
    case "earthquake":
      return "Earthquake & Aftershocks";
    case "landslide":
      return "Landslide / Slope Failure";
    default:
      return "Multi-hazard event";
  }
}

/* GET landing page (Dashboard). */
router.get("/", function (req, res, next) {
  res.render("index", {
    title: "Geonex AI | Disaster Damage Analysis",
    activePage: "dashboard",
  });
});

router.get("/damage-model", requireAuth, function (req, res, next) {
  res.render("damage-model", {
    title: "Geonex AI | Damage Model",
    activePage: "dashboard",
    input: {},
    result: null,
  });
});

router.post("/damage-model", requireAuth, function (req, res, next) {
  const {
    hazardType,
    windSpeed,
    rainfall,
    populationDensity,
    infrastructureScore,
    latitude,
    longitude,
  } = req.body || {};

  const w = Math.max(0, parseFloat(windSpeed) || 0);
  const r = Math.max(0, parseFloat(rainfall) || 0);
  const p = Math.max(0, parseFloat(populationDensity) || 0);
  const infra = Math.min(
    100,
    Math.max(0, parseFloat(infrastructureScore) || 0),
  );

  let base = 0;
  let disasterName = mapHazardToLabel(hazardType);

  switch (hazardType) {
    case "cyclone":
      base += 0.3;
      break;
    case "flood":
      base += 0.25;
      break;
    case "earthquake":
      base += 0.28;
      break;
    case "landslide":
      base += 0.22;
      break;
    default:
      base += 0.2;
  }

  base += Math.min(w / 200, 1) * 0.3;
  base += Math.min(r / 300, 1) * 0.2;
  base += Math.min(p / 2000, 1) * 0.15;
  base += (1 - infra / 100) * 0.15;

  const score = Math.max(0, Math.min(100, Math.round(base * 100)));

  let label = "LOW";
  let windowText = "Next 72 hours";

  if (score >= 80) {
    label = "CRITICAL";
    windowText = "Next 12–24 hours";
  } else if (score >= 60) {
    label = "HIGH";
    windowText = "Next 24–48 hours";
  } else if (score >= 40) {
    label = "MODERATE";
    windowText = "Next 48–72 hours";
  }

  const result = {
    score,
    label,
    disasterName,
    windowText,
    latitude: latitude || null,
    longitude: longitude || null,
  };

  const input = {
    hazardType,
    windSpeed,
    rainfall,
    populationDensity,
    infrastructureScore,
    latitude,
    longitude,
  };

  const latNum = parseFloat(latitude);
  const lonNum = parseFloat(longitude);

  if (!isFinite(latNum) || !isFinite(lonNum)) {
    // No usable location; render with scenario-only result
    result.disasterName = mapHazardToLabel(hazardType);
    return res.render("damage-model", {
      title: "Geonex AI | Damage Model",
      activePage: "dashboard",
      input,
      result,
    });
  }

  const now = new Date();
  const payload = JSON.stringify({
    lat: latNum,
    lon: lonNum,
    hour: now.getUTCHours(),
    day: now.getUTCDate(),
    month: now.getUTCMonth() + 1,
    hazardType: hazardType || null,
  });

  const mlHost = process.env.ML_HOST || "127.0.0.1";
  const mlPort = parseInt(process.env.ML_PORT, 10) || 5000;

  const options = {
    hostname: mlHost,
    port: mlPort,
    path: "/predict",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
    timeout: 5000,
  };

  const modelReq = http.request(options, function (modelRes) {
    let data = "";

    modelRes.on("data", function (chunk) {
      data += chunk;
    });

    modelRes.on("end", function () {
      if (modelRes.statusCode >= 400) {
        result.mlError = "ML service returned an error for this location.";
        result.disasterName = mapHazardToLabel(hazardType);
        return res.render("damage-model", {
          title: "Geonex AI | Damage Model",
          activePage: "dashboard",
          input,
          result,
        });
      }

      try {
        const parsed = JSON.parse(data);
        result.mlDisaster = parsed.disaster || null;
        result.mlConfidence =
          typeof parsed.confidence === "number" ? parsed.confidence : null;

        // If we have a valid confidence score from the ML model,
        // use it to drive the main risk label/score for this scenario.
        if (typeof result.mlConfidence === "number") {
          const conf = Math.max(0, Math.min(100, result.mlConfidence));
          result.score = Math.round(conf);

          let newLabel = "LOW";
          let newWindow = "Next 72 hours";

          if (conf >= 85) {
            newLabel = "CRITICAL";
            newWindow = "Next 12–24 hours";
          } else if (conf >= 65) {
            newLabel = "HIGH";
            newWindow = "Next 24–48 hours";
          } else if (conf >= 45) {
            newLabel = "MODERATE";
            newWindow = "Next 48–72 hours";
          }

          result.label = newLabel;
          result.windowText = newWindow;
        }

        // Keep the UI disaster name aligned with the
        // user-selected hazard type. The ML service
        // may return a more generic label (e.g.
        // "Multi-hazard event"), but we only use its
        // confidence score here so the scenario
        // headline always reflects the chosen hazard.
        result.disasterName = mapHazardToLabel(hazardType);
      } catch (e) {
        result.mlError = "Invalid response from ML service for this location.";
      }

      return res.render("damage-model", {
        title: "Geonex AI | Damage Model",
        activePage: "dashboard",
        input,
        result,
      });
    });
  });

  modelReq.on("error", function () {
    result.mlError = "Unable to reach ML service for this location.";
    result.disasterName = mapHazardToLabel(hazardType);
    return res.render("damage-model", {
      title: "Geonex AI | Damage Model",
      activePage: "dashboard",
      input,
      result,
    });
  });

  modelReq.on("timeout", function () {
    modelReq.destroy();
    result.mlError = "ML service timed out for this location.";
    result.disasterName = mapHazardToLabel(hazardType);
    return res.render("damage-model", {
      title: "Geonex AI | Damage Model",
      activePage: "dashboard",
      input,
      result,
    });
  });

  modelReq.write(payload);
  modelReq.end();
});

router.get("/risk-map", requireAuth, function (req, res, next) {
  res.render("risk-map", {
    title: "Geonex AI | Risk Map",
    activePage: "risk-map",
  });
});

router.get("/forecasts", requireAuth, function (req, res, next) {
  res.render("forecasts", {
    title: "Geonex AI | Forecasts",
    activePage: "forecasts",
  });
});

router.get("/forecasts/72h", requireAuth, function (req, res, next) {
  res.render("forecasts-72h", {
    title: "Geonex AI | 72h Forecast",
    activePage: "forecasts",
  });
});

router.get("/forecasts/download", requireAuth, function (req, res, next) {
  const rows = [
    "hour,wind_speed_kts,rain_mm,impact_index",
    "0,45,12,0.62",
    "6,55,18,0.71",
    "12,60,22,0.78",
    "18,70,30,0.84",
    "24,80,40,0.89",
    "30,85,52,0.91",
    "36,90,60,0.93",
    "42,82,38,0.86",
    "48,70,26,0.79",
    "54,62,18,0.73",
    "60,55,12,0.68",
    "66,48,8,0.61",
    "72,40,4,0.55",
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="vortex_72h_forecast.csv"',
  );
  res.send(rows);
});

router.get("/response", requireAuth, function (req, res, next) {
  res.render("response", {
    title: "Geonex AI | Response",
    activePage: "response",
  });
});

router.get("/response/tasks", requireAuth, function (req, res, next) {
  res.render("response-tasks", {
    title: "Geonex AI | Task Queue",
    activePage: "response",
  });
});

router.get("/response-console", requireAuth, function (req, res, next) {
  res.render("response-console", {
    title: "Geonex AI | Response Console",
    activePage: "response",
  });
});

router.get("/response/tasks/export", requireAuth, function (req, res, next) {
  const rows = [
    "id,zone,type,teams,status",
    "C-214,Delta-3,Cyclone surge,4 deployed,CRITICAL",
    "F-088,Bridge North,Flooding,2 en route,HIGH",
    "L-032,Sector 7,Landslide,1 staging,MEDIUM",
    "C-221,Coastal ring,Cyclone wind,3 cleared,CLEARED",
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'inline; filename="vortex_tasking_log.csv"',
  );
  res.send(rows);
});

// Simpler alias path for tasking log export
router.get("/response-export", requireAuth, function (req, res, next) {
  const rows = [
    "id,zone,type,teams,status",
    "C-214,Delta-3,Cyclone surge,4 deployed,CRITICAL",
    "F-088,Bridge North,Flooding,2 en route,HIGH",
    "L-032,Sector 7,Landslide,1 staging,MEDIUM",
    "C-221,Coastal ring,Cyclone wind,3 cleared,CLEARED",
  ].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'inline; filename="vortex_tasking_log.csv"',
  );
  res.send(rows);
});

router.get("/reports", requireAuth, function (req, res, next) {
  res.render("reports", {
    title: "Geonex AI | Reports",
    activePage: "reports",
  });
});

router.post("/reports/new", requireAuth, function (req, res, next) {
  const { title, incident, region, window, format, audience, notes } =
    req.body || {};

  const payload = {
    title: title || "Untitled report",
    incident: incident || "unknown",
    region: region || "unspecified",
    window: window || "event",
    format: format || "pdf",
    audience: audience || "agency",
    notes: notes || "",
    generatedAt: new Date().toISOString(),
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="vortex_report_payload.json"',
  );
  res.send(JSON.stringify(payload, null, 2));
});

router.get("/reports/exports", requireAuth, function (req, res, next) {
  res.render("reports-exports", {
    title: "Geonex AI | All Exports",
    activePage: "reports",
  });
});

router.get("/reports/new", requireAuth, function (req, res, next) {
  res.render("reports-new", {
    title: "Geonex AI | New Report",
    activePage: "reports",
  });
});

// Proxy API to call the Python ML model for disaster prediction
router.post("/api/disaster-predict", requireAuth, function (req, res, next) {
  var body = req.body || {};

  var lat = Number(body.lat);
  var lon = Number(body.lon);

  if (!isFinite(lat) || !isFinite(lon)) {
    return res
      .status(400)
      .json({ error: "lat and lon are required numeric values" });
  }

  var now = new Date();
  var hour = body.hour != null ? Number(body.hour) : now.getUTCHours();
  var day = body.day != null ? Number(body.day) : now.getUTCDate();
  var month = body.month != null ? Number(body.month) : now.getUTCMonth() + 1;
  var hazardType = body.hazardType || body.hazard || null;

  var payload = JSON.stringify({
    lat: lat,
    lon: lon,
    hour: hour,
    day: day,
    month: month,
    hazardType: hazardType,
  });

  var mlHost = process.env.ML_HOST || "127.0.0.1";
  var mlPort = parseInt(process.env.ML_PORT, 10) || 5000;

  var options = {
    hostname: mlHost,
    port: mlPort,
    path: "/predict",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
    timeout: 5000,
  };

  var modelReq = http.request(options, function (modelRes) {
    var data = "";

    modelRes.on("data", function (chunk) {
      data += chunk;
    });

    modelRes.on("end", function () {
      if (modelRes.statusCode >= 400) {
        return res.status(502).json({
          error: "ML service returned error",
          statusCode: modelRes.statusCode,
        });
      }

      try {
        var parsed = JSON.parse(data);
        return res.json(parsed);
      } catch (e) {
        return res.status(502).json({
          error: "Invalid response from ML service",
        });
      }
    });
  });

  modelReq.on("error", function (err) {
    return res.status(502).json({
      error: "Unable to reach ML service",
    });
  });

  modelReq.on("timeout", function () {
    modelReq.destroy();
    return res.status(504).json({
      error: "ML service timed out",
    });
  });

  modelReq.write(payload);
  modelReq.end();
});

module.exports = router;
