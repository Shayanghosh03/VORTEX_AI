from flask import Flask, request, jsonify
import joblib
import numpy as np
import pandas as pd
import os


app = Flask(__name__)


##############################
# Model loading
##############################

try:
	earthquake_model = joblib.load("earthquake_xgb_model.pkl")
except Exception:
	earthquake_model = None

try:
	cyclone_model = joblib.load("cyclone_xgb_model.pkl")
except Exception:
	cyclone_model = None

try:
	flood_model = joblib.load("flood_model.pkl")
except Exception:
	flood_model = None


##############################
# Helper functions
##############################


def encode_mag_type(mag_type: str | None, mag_type_encoded: float | None = None) -> float:
	"""Best-effort encoder for earthquake magnitude type.

	If the caller already provides mag_type_encoded, use that.
	Otherwise, map common magnitude-type strings to a stable index.
	"""

	if mag_type_encoded is not None:
		return float(mag_type_encoded)

	if not mag_type:
		return 0.0

	mag_type = mag_type.strip().upper()

	# Approximate mapping of common magnitude types, sorted alphabetically
	classes = [
		"MB",
		"MB_LG",
		"MC",
		"MD",
		"ME",
		"MI",
		"ML",
		"MN",
		"MS",
		"MW",
		"UNK",  # Unknown / other
	]

	if mag_type not in classes:
		mag_type = "UNK"

	return float(classes.index(mag_type))


def predict_earthquake_from_payload(payload: dict) -> dict:
	if earthquake_model is None:
		raise RuntimeError("Earthquake model not loaded. Check earthquake_xgb_model.pkl")

	try:
		magnitude = float(payload["magnitude"])
		depth_km = float(payload["depth_km"])
		latitude = float(payload["latitude"])
		longitude = float(payload["longitude"])
	except KeyError as exc:
		raise ValueError(f"Missing required field: {exc.args[0]}") from exc
	except (TypeError, ValueError) as exc:
		raise ValueError("magnitude, depth_km, latitude, longitude must be numeric") from exc

	depth_error = float(payload.get("depth_error", 5.0))
	mag_error = float(payload.get("mag_error", 0.1))
	azimuthal_gap = float(payload.get("azimuthal_gap", 50.0))
	horizontal_distance = float(payload.get("horizontal_distance", 1.0))
	rms = float(payload.get("rms", 0.8))

	mag_type_str = payload.get("mag_type")
	mag_type_enc_in = payload.get("mag_type_encoded")
	mag_type_encoded = encode_mag_type(mag_type_str, mag_type_enc_in)

	abs_latitude = abs(latitude)
	mag_depth_ratio = magnitude / (depth_km + 1.0)
	log_depth = np.log1p(depth_km)
	mag_squared = magnitude ** 2

	input_data = pd.DataFrame([
		{
			"magnitude": magnitude,
			"depth_km": depth_km,
			"latitude": latitude,
			"longitude": longitude,
			"abs_latitude": abs_latitude,
			"mag_depth_ratio": mag_depth_ratio,
			"log_depth": log_depth,
			"mag_squared": mag_squared,
			"depth_error": depth_error,
			"mag_error": mag_error,
			"azimuthal_gap": azimuthal_gap,
			"horizontal_distance": horizontal_distance,
			"rms": rms,
			"mag_type_encoded": mag_type_encoded,
		}
	])

	# Ensure column order matches the trained model if available
	if hasattr(earthquake_model, "feature_names_in_"):
		cols = list(earthquake_model.feature_names_in_)
		input_data = input_data[cols]

	pred_class = int(earthquake_model.predict(input_data)[0])

	if hasattr(earthquake_model, "predict_proba"):
		proba = earthquake_model.predict_proba(input_data)[0]
	else:
		proba = None

	labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}

	result: dict = {
		"damage_level_index": pred_class,
		"damage_level_label": labels.get(pred_class, "UNKNOWN"),
	}

	if proba is not None and len(proba) == 3:
		result["probabilities"] = {
			"low": float(proba[0]),
			"medium": float(proba[1]),
			"high": float(proba[2]),
		}

	return result


def predict_cyclone_from_payload(payload: dict) -> dict:
	if cyclone_model is None:
		raise RuntimeError("Cyclone model not loaded. Check cyclone_xgb_model.pkl")

	try:
		wind_speed = float(payload["wind_speed_kmh"])
		pressure = float(payload["pressure_hpa"])
		sea_surface_temp = float(payload["sea_surface_temp"])
		coast_distance = float(payload["coast_distance_km"])
		category = float(payload["category"])
		latitude = float(payload["latitude"])
	except KeyError as exc:
		raise ValueError(f"Missing required field: {exc.args[0]}") from exc
	except (TypeError, ValueError) as exc:
		raise ValueError(
			"wind_speed_kmh, pressure_hpa, sea_surface_temp, coast_distance_km, "
			"category and latitude must be numeric"
		) from exc

	pressure_wind_ratio = pressure / (wind_speed + 0.001)
	lat_abs = abs(latitude)
	wind_squared = wind_speed ** 2
	pressure_wind_interaction = wind_speed / (pressure - 870.0 + 1.0)
	coast_category_risk = category / (coast_distance / 100.0 + 1.0)
	energy_index = sea_surface_temp * wind_speed / 1000.0

	input_data = pd.DataFrame([
		{
			"wind_speed_kmh": wind_speed,
			"pressure_hpa": pressure,
			"sea_surface_temp": sea_surface_temp,
			"coast_distance_km": coast_distance,
			"category": category,
			"lat_abs": lat_abs,
			"wind_squared": wind_squared,
			"pressure_wind_ratio": pressure_wind_ratio,
			"pressure_wind_interaction": pressure_wind_interaction,
			"coast_category_risk": coast_category_risk,
			"energy_index": energy_index,
		}
	])

	if hasattr(cyclone_model, "feature_names_in_"):
		cols = list(cyclone_model.feature_names_in_)
		input_data = input_data[cols]

	pred_class = int(cyclone_model.predict(input_data)[0])

	if hasattr(cyclone_model, "predict_proba"):
		proba = cyclone_model.predict_proba(input_data)[0]
	else:
		proba = None

	result: dict = {
		"strike": bool(pred_class == 1),
		"strike_label": "STRIKE" if pred_class == 1 else "NO_STRIKE",
		"strike_index": pred_class,
	}

	if proba is not None and len(proba) == 2:
		result["probabilities"] = {
			"no_strike": float(proba[0]),
			"strike": float(proba[1]),
		}

	return result


def convert_api_to_flood_features(temp: float, humidity: float, pressure: float, wind: float, rainfall: float) -> list[float]:
	"""Replicate the feature mapping from FloodModel.ipynb."""

	return [
		rainfall / 50.0,  # MonsoonIntensity
		5.0,              # TopographyDrainage
		5.0,              # RiverManagement
		5.0,              # Deforestation
		5.0,              # Urbanization
		temp / 10.0,      # ClimateChange
		5.0,              # DamsQuality
		rainfall / 100.0, # Siltation
		5.0,              # AgriculturalPractices
		5.0,              # Encroachments
		5.0,              # IneffectiveDisasterPreparedness
		5.0,              # DrainageSystems
		5.0,              # CoastalVulnerability
		5.0,              # Landslides
		5.0,              # Watersheds
		5.0,              # DeterioratingInfrastructure
		humidity / 20.0,  # PopulationScore
		5.0,              # WetlandLoss
		5.0,              # InadequatePlanning
		5.0,              # PoliticalFactors
	]


def classify_flood_risk(prob: float) -> str:
	if prob > 0.7:
		return "High Risk"
	if prob > 0.3:
		return "Medium Risk"
	return "Low Risk"


def predict_flood_from_payload(payload: dict) -> dict:
	if flood_model is None:
		raise RuntimeError("Flood model not loaded. Check flood_model.pkl")

	try:
		temp = float(payload["temp"])
		humidity = float(payload["humidity"])
		pressure = float(payload["pressure"])
		wind = float(payload["wind"])
		rainfall = float(payload.get("rainfall", 0.0))
	except KeyError as exc:
		raise ValueError(f"Missing required field: {exc.args[0]}") from exc
	except (TypeError, ValueError) as exc:
		raise ValueError("temp, humidity, pressure, wind, rainfall must be numeric") from exc

	features = convert_api_to_flood_features(temp, humidity, pressure, wind, rainfall)
	x = np.array([features])

	prob = float(flood_model.predict(x)[0])
	risk_label = classify_flood_risk(prob)

	return {
		"flood_probability": prob,
		"risk_level": risk_label,
	}


##############################
# Routes
##############################


@app.route("/")
def index() -> tuple[dict, int]:
	return {
		"status": "ok",
		"message": "Disaster prediction API (earthquake, cyclone, flood)",
	}, 200


@app.route("/predict/earthquake", methods=["POST"])
def predict_earthquake() -> tuple[dict, int]:
	payload = request.get_json(silent=True) or {}
	try:
		result = predict_earthquake_from_payload(payload)
		return result, 200
	except ValueError as exc:
		return {"error": str(exc)}, 400
	except RuntimeError as exc:
		return {"error": str(exc)}, 500


@app.route("/predict/cyclone", methods=["POST"])
def predict_cyclone() -> tuple[dict, int]:
	payload = request.get_json(silent=True) or {}
	try:
		result = predict_cyclone_from_payload(payload)
		return result, 200
	except ValueError as exc:
		return {"error": str(exc)}, 400
	except RuntimeError as exc:
		return {"error": str(exc)}, 500


@app.route("/predict/flood", methods=["POST"])
def predict_flood() -> tuple[dict, int]:
	payload = request.get_json(silent=True) or {}
	try:
		result = predict_flood_from_payload(payload)
		return result, 200
	except ValueError as exc:
		return {"error": str(exc)}, 400
	except RuntimeError as exc:
		return {"error": str(exc)}, 500


@app.route("/predict", methods=["POST"])
def predict_disaster() -> tuple[dict, int]:
	"""High-level disaster prediction endpoint used by the Node app.

	Expected JSON payload (from the Express app):
	{
	  "lat": float,
	  "lon": float,
	  "hour": int,   # optional
	  "day": int,    # optional
	  "month": int,  # optional
	}

	Response shape:
	{
	  "disaster": str,
	  "confidence": float   # 0–100
	}
	"""

	payload = request.get_json(silent=True) or {}

	try:
		lat = float(payload["lat"])
		lon = float(payload["lon"])
	except KeyError as exc:
		return {"error": f"Missing required field: {exc.args[0]}"}, 400
	except (TypeError, ValueError):
		return {"error": "lat and lon must be numeric"}, 400

	hour = int(payload.get("hour", 0))
	day = int(payload.get("day", 1))
	month = int(payload.get("month", 1))
	hazard_raw = (
		payload.get("hazardType")
		or payload.get("hazard")
		or payload.get("hazard_type")
		or ""
	)
	hazard = str(hazard_raw).strip().lower() if hazard_raw else ""

	hazard_label_map = {
		"cyclone": "Cyclone / Typhoon",
		"flood": "River / Flash Flooding",
		"earthquake": "Earthquake & Aftershocks",
		"landslide": "Landslide / Slope Failure",
	}

	lat_abs = abs(lat)
	seasonal_factor = (month % 12) / 12.0
	diurnal_factor = (hour % 24) / 24.0
	coastal_proxy = max(0.0, 1.0 - lat_abs / 60.0)

	disaster = hazard_label_map.get(hazard, "Multi-hazard event")
	confidence = 0.0
	auto_mode = not bool(hazard)

	# Collect model-based candidates so we can either
	# respect an explicit hazard or auto-select the
	# highest-risk hazard when none is specified.
	candidates: dict[str, float] = {}

	# Cyclone model
	if cyclone_model is not None and (auto_mode or hazard == "cyclone"):
		wind_speed = 60.0 + 80.0 * coastal_proxy * seasonal_factor
		pressure = 1010.0 - 40.0 * coastal_proxy * seasonal_factor
		sea_surface_temp = 26.0 + 4.0 * seasonal_factor
		coast_distance = 50.0 + (1.0 - coastal_proxy) * 250.0
		category = max(1.0, min(5.0, wind_speed / 35.0))

		try:
			res = predict_cyclone_from_payload(
				{
					"wind_speed_kmh": wind_speed,
					"pressure_hpa": pressure,
					"sea_surface_temp": sea_surface_temp,
					"coast_distance_km": coast_distance,
					"category": category,
					"latitude": lat,
				}
			)
			probs = res.get("probabilities") or {}
			strike_prob = probs.get("strike")
			if isinstance(strike_prob, (int, float)):
				candidates["cyclone"] = float(strike_prob) * 100.0
		except Exception:
			pass

	# Earthquake model
	if earthquake_model is not None and (auto_mode or hazard == "earthquake"):
		magnitude = 5.0 + 1.5 * (1.0 - abs(lat_abs - 30.0) / 60.0)
		depth_km = 10.0 + 40.0 * (1.0 - seasonal_factor)

		try:
			res = predict_earthquake_from_payload(
				{
					"magnitude": magnitude,
					"depth_km": depth_km,
					"latitude": lat,
					"longitude": lon,
				}
			)
			probs = res.get("probabilities") or {}
			if probs:
				max_prob = max(float(v) for v in probs.values())
				candidates["earthquake"] = max_prob * 100.0
		except Exception:
			pass

	# Flood model
	if flood_model is not None and (auto_mode or hazard == "flood"):
		temp = 26.0 + 8.0 * coastal_proxy * seasonal_factor
		humidity = 60.0 + 30.0 * coastal_proxy
		pressure = 1000.0 - 10.0 * coastal_proxy
		wind = 10.0 + 40.0 * diurnal_factor
		rainfall = 5.0 + 50.0 * seasonal_factor * coastal_proxy

		try:
			res = predict_flood_from_payload(
				{
					"temp": temp,
					"humidity": humidity,
					"pressure": pressure,
					"wind": wind,
					"rainfall": rainfall,
				}
			)
			prob = res.get("flood_probability")
			if isinstance(prob, (int, float)):
				candidates["flood"] = float(prob) * 100.0
		except Exception:
			pass

	if candidates:
		# Apply simple geographic weighting so that different
		# hazards win in more realistic regions.
		weighted: dict[str, float] = {}
		for hz, base_conf in candidates.items():
			weight = 1.0

			if hz == "cyclone":
				# Stronger near coasts and in lower latitudes
				weight *= 0.5 + 0.5 * coastal_proxy
				weight *= 0.7 + 0.6 * max(0.0, 1.0 - lat_abs / 40.0)
			elif hz == "flood":
				# Favoured in tropical/subtropical belts and
				# moderately inland where river flooding is common.
				lat_band = max(0.0, 1.0 - abs(lat_abs - 20.0) / 25.0)
				inland_factor = 0.7 + 0.6 * (1.0 - coastal_proxy)
				season_factor = 0.6 + 0.6 * seasonal_factor
				weight *= lat_band * inland_factor * season_factor
			elif hz == "earthquake":
				# Boosted in mid‑latitude seismic belts
				belt = max(0.0, 1.0 - abs(lat_abs - 30.0) / 25.0)
				weight *= 0.6 + 0.8 * belt

			weighted[hz] = base_conf * weight

		best_hazard = max(weighted, key=weighted.get)
		confidence = weighted[best_hazard]
		hazard = best_hazard
		disaster = hazard_label_map.get(best_hazard, "Multi-hazard event")

	# If no model-based confidence, fall back to a
	# lightweight heuristic so the API still responds
	# sensibly for the frontend.
	if confidence <= 0.0:
		base = 20.0

		# Core drivers shared across hazards
		base += 40.0 * (1.0 - lat_abs / 90.0)
		base += 20.0 * seasonal_factor
		base += 20.0 * coastal_proxy

		# Small hazard-specific adjustments
		if hazard == "cyclone":
			base += 10.0 * coastal_proxy
		elif hazard == "earthquake":
			# earthquakes less tied to season/coast; weight latitude more
			base += 5.0 * (1.0 - abs(lat_abs - 30.0) / 60.0)
		elif hazard == "landslide":
			base += 5.0 * seasonal_factor

		confidence = max(5.0, min(95.0, base))

		if not disaster or disaster == "Multi-hazard event":
			if hazard and hazard in hazard_label_map:
				disaster = hazard_label_map[hazard]
			else:
				if coastal_proxy > 0.6:
					disaster = "Tropical Cyclone / Coastal Flooding"
				elif lat_abs < 30.0:
					disaster = "Severe Convective Storms"
				else:
					disaster = "Heavy Rain / Localized Flooding"

	return {
		"disaster": disaster,
		"confidence": round(confidence, 1),
	}, 200


if __name__ == "__main__":
	# Port can be overridden via ML_PORT environment variable (default 8000 for hosting platforms)
	port = int(os.environ.get('ML_PORT', 8000))
	app.run(host="0.0.0.0", port=port, debug=True)
