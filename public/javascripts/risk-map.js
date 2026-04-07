// Initialize Leaflet risk map when the user clicks "Open Live Risk Map"
(function () {
  if (typeof window === "undefined") return;

  let map; // Leaflet instance
  let userMarker; // live location marker
  let userAccuracyCircle;
  let criticalLayer;
  let severeLayer;
  let watchLayer;
  let cityLayer;
  let userLayer; // group for user marker + accuracy circle

  const openBtn = document.getElementById("open-risk-map");
  const configureBtn = document.getElementById("configure-layers");
  const mapSection = document.getElementById("live-risk-map-section");

  if (!openBtn || !mapSection) return;

  function updatePrediction(lat, lng) {
    const nameEl = document.getElementById("prediction-disaster-name");
    const confEl = document.getElementById("prediction-confidence");
    const riskEl = document.getElementById("prediction-risk-label");
    const alertBanner = document.getElementById("live-alert-banner");
    const alertText = document.getElementById("live-alert-text");

    if (!nameEl || !confEl || !riskEl) {
      return;
    }

    // Show loading state while the model runs
    riskEl.textContent = "Running VORTEX AI model for your location…";

    const now = new Date();
    const payload = {
      lat: lat,
      lon: lng,
      hour: now.getUTCHours(),
      day: now.getUTCDate(),
      month: now.getUTCMonth() + 1,
    };

    fetch("/api/disaster-predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Prediction API error");
        }
        return res.json();
      })
      .then(function (data) {
        var disasterName =
          data && data.disaster ? data.disaster : "Not classified";
        var confidence =
          typeof data.confidence === "number" ? data.confidence : null;

        var riskLabel = "LOW RISK";
        if (confidence != null) {
          if (confidence >= 80) {
            riskLabel = "CRITICAL IMPACT ZONE";
          } else if (confidence >= 60) {
            riskLabel = "SEVERE WARNING ZONE";
          } else if (confidence >= 40) {
            riskLabel = "WATCH ZONE";
          }
        }

        nameEl.textContent = disasterName;
        confEl.textContent =
          confidence != null ? Math.round(confidence) + "%" : "–";
        riskEl.textContent = riskLabel;

        // Show a live alert banner when conditions are harmful
        if (
          alertBanner &&
          alertText &&
          confidence != null &&
          confidence >= 60
        ) {
          alertText.textContent =
            riskLabel + " — " + disasterName + " near your current location.";
          alertBanner.style.display = "flex";
        } else if (alertBanner) {
          alertBanner.style.display = "none";
        }
      })
      .catch(function () {
        // If anything goes wrong, show a graceful fallback message
        riskEl.textContent =
          "Live model not reachable — showing static map only.";
        if (alertBanner) {
          alertBanner.style.display = "none";
        }
      });
  }

  function placeUserMarker(lat, lng, accuracyMeters, label) {
    if (!map || !userLayer) return;

    if (userMarker) {
      userLayer.removeLayer(userMarker);
    }
    if (userAccuracyCircle) {
      userLayer.removeLayer(userAccuracyCircle);
    }

    userMarker = L.circleMarker([lat, lng], {
      radius: 6,
      color: "#22c55e",
      fillColor: "#22c55e",
      fillOpacity: 0.9,
    })
      .addTo(userLayer)
      .bindPopup(label || "Your live location");

    try {
      userMarker.openPopup();
    } catch (e) {}

    if (accuracyMeters && accuracyMeters > 0) {
      userAccuracyCircle = L.circle([lat, lng], {
        color: "rgba(34,197,94,0.6)",
        fillColor: "rgba(34,197,94,0.3)",
        fillOpacity: 0.3,
        radius: accuracyMeters,
      }).addTo(userLayer);
    }

    const bounds = L.latLngBounds([
      [lat, lng],
      [20.5, 92.0],
    ]);
    map.fitBounds(bounds.pad(0.4));

    updatePrediction(lat, lng);
  }

  function initMap() {
    if (map) return; // already initialized

    const mapElement = document.getElementById("risk-map-view");
    if (!mapElement) return;

    map = L.map(mapElement, {
      zoomControl: false,
      attributionControl: true,
    }).setView([20.5, 92.0], 5); // Bay of Bengal / cyclone context

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Layer groups for toggling
    criticalLayer = L.layerGroup().addTo(map);
    severeLayer = L.layerGroup().addTo(map);
    watchLayer = L.layerGroup().addTo(map);
    cityLayer = L.layerGroup().addTo(map);
    userLayer = L.layerGroup().addTo(map);

    // Example high-risk zone (red)
    L.circle([19.8, 92.5], {
      color: "#ff4030",
      fillColor: "#ff4030",
      fillOpacity: 0.35,
      radius: 180000,
    })
      .addTo(criticalLayer)
      .bindPopup("Critical impact zone");

    // Example severe-warning ring (orange)
    L.circle([20.8, 92.2], {
      color: "#ff8800",
      fillColor: "#ff8800",
      fillOpacity: 0.2,
      radius: 260000,
    })
      .addTo(severeLayer)
      .bindPopup("Severe warning zone");

    // Example watch zone (yellow)
    L.circle([21.5, 93.2], {
      color: "#ffcc00",
      fillColor: "#ffcc00",
      fillOpacity: 0.18,
      radius: 320000,
    })
      .addTo(watchLayer)
      .bindPopup("Watch zone");

    // Example coastal city markers
    const cities = [
      { name: "Chattogram", coords: [22.335, 91.832], risk: "High" },
      { name: "Cox's Bazar", coords: [21.45, 91.97], risk: "Critical" },
      { name: "Sittwe", coords: [20.15, 92.9], risk: "Severe" },
    ];

    cities.forEach(function (c) {
      L.circleMarker(c.coords, {
        radius: 5,
        color: "#00b4ff",
        fillColor: "#00b4ff",
        fillOpacity: 0.8,
      })
        .addTo(cityLayer)
        .bindPopup(c.name + " — " + c.risk + " risk");
    });

    // slight delay to ensure container is visible before invalidateSize
    setTimeout(function () {
      map.invalidateSize();
    }, 300);

    // Manual location mode: click on map when checkbox is enabled
    const manualToggle = document.getElementById("manual-location");
    map.on("click", function (e) {
      if (!manualToggle || !manualToggle.checked) return;
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      placeUserMarker(lat, lng, 0, "Manual location override");
    });

    // Try to add user's live location on the risk map
    const nameEl = document.getElementById("prediction-disaster-name");
    const confEl = document.getElementById("prediction-confidence");
    const riskEl = document.getElementById("prediction-risk-label");

    if ("geolocation" in navigator) {
      // Use watchPosition so the marker follows your real-time location
      navigator.geolocation.watchPosition(
        function (pos) {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const acc = pos.coords.accuracy || 0;

          placeUserMarker(lat, lng, acc, "Your live location");
        },
        function (err) {
          // If user denies or there is an error, reflect it in the UI
          if (riskEl) {
            if (err && err.code === 1) {
              riskEl.textContent =
                "Location access blocked — enable location for VORTEX AI in your browser settings.";
            } else {
              riskEl.textContent =
                "Unable to read live location — check GPS / browser settings.";
            }
          }
          if (nameEl) {
            nameEl.textContent = "Unknown — live fix not available";
          }
          if (confEl) {
            confEl.textContent = "–";
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
      );
    } else {
      // Browser blocked geolocation (likely because the page is not in a secure context)
      if (riskEl) {
        riskEl.textContent =
          "Live location not available — open VORTEX AI on https:// or http://localhost and enable location, or use Manual location mode.";
      }
      if (nameEl) {
        nameEl.textContent = "Not available in this browser context";
      }
      if (confEl) {
        confEl.textContent = "–";
      }
    }
  }

  // Auto-open the live map and trigger live-location detection on page load
  mapSection.classList.add("live-map-visible");
  initMap();

  openBtn.addEventListener("click", function (e) {
    e.preventDefault();
    mapSection.classList.add("live-map-visible");
    initMap();
    mapSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  if (configureBtn) {
    configureBtn.addEventListener("click", function (e) {
      e.preventDefault();
      // ensure map is visible/initialized
      mapSection.classList.add("live-map-visible");
      initMap();
      mapSection.scrollIntoView({ behavior: "smooth", block: "start" });

      const criticalToggle = document.getElementById("toggle-critical");
      const severeToggle = document.getElementById("toggle-severe");
      const watchToggle = document.getElementById("toggle-watch");
      const citiesToggle = document.getElementById("toggle-cities");
      const meToggle = document.getElementById("toggle-me");

      function bindToggle(checkbox, layer, groupName) {
        if (!checkbox || !layer) return;
        checkbox.addEventListener("change", function () {
          if (!map) return;
          if (checkbox.checked) {
            map.addLayer(layer);
          } else {
            map.removeLayer(layer);
          }
        });
      }

      // Bind once per click; cheap, and idempotent enough for this UI size
      bindToggle(criticalToggle, criticalLayer);
      bindToggle(severeToggle, severeLayer);
      bindToggle(watchToggle, watchLayer);
      bindToggle(citiesToggle, cityLayer);
      bindToggle(meToggle, userLayer);
    });
  }
})();
