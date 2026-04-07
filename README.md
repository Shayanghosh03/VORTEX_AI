# VORTEX AI Web

<img width="1919" height="865" alt="Image" src="https://github.com/user-attachments/assets/fb646a5b-0e1f-409e-b7c6-a3eea9fc863a"/>
GeoNex AI Web is a disaster damage analysis and risk intelligence dashboard. It combines a Node.js/Express web application with a Python/Flask machine‑learning microservice to estimate multi‑hazard risk (cyclone, flood, earthquake, landslide) for a given scenario and location.

The web app provides:

- A damage model console that scores risk based on hazard type and scenario inputs
- Optional live geo‑tagging via browser GPS for location‑aware predictions
- A risk map and forecast views for situational awareness
- User authentication (email/password + optional Google OAuth) backed by MongoDB

---

## Architecture

**Web application (Node.js / Express)**

- Serves the UI using EJS templates (views/)
- Handles routing, forms, and session‑based authentication
- Persists users in MongoDB via Mongoose
- Calls the Python ML service over HTTP to refine risk estimates when latitude/longitude are available

**ML microservice (Python / Flask)**

- Lives in `mlmodel/app.py`
- Loads pre‑trained models for:
  - Earthquake damage classification (`earthquake_xgb_model.pkl`)
  - Cyclone strike prediction (`cyclone_xgb_model.pkl`)
  - Flood risk estimation (`flood_model.pkl`)
- Exposes JSON APIs:
  - `POST /predict/earthquake`
  - `POST /predict/cyclone`
  - `POST /predict/flood`
  - `POST /predict` — high‑level multi‑hazard endpoint used by the Node app

---

## Prerequisites

- Node.js 16+ and npm
- Python 3.9+ (for the ML service)
- A running MongoDB instance (local or remote)
- (Optional) Google Cloud OAuth 2.0 credentials for Google Sign‑In

---

## Installation

Clone the repository and install Node dependencies:

```bash
cd VORTEX_AI_WEB
npm install
```

Set up the Python environment for the ML service (from the `mlmodel` directory):

```bash
cd mlmodel
python -m venv .venv
# Windows PowerShell
. .venv/Scripts/Activate.ps1
# or Command Prompt
.venv\Scripts\activate.bat

pip install flask joblib numpy pandas scikit-learn xgboost
```

Place the trained model files in `mlmodel/`:

- `earthquake_xgb_model.pkl`
- `cyclone_xgb_model.pkl`
- `flood_model.pkl`

> If any model file is missing, the corresponding route will return a 500 error when invoked.

---

## Configuration

Create a `.env` file in the project root (`VORTEX_AI_WEB/.env`) to configure the web app:

```env
# MongoDB connection used by Mongoose
MONGO_URL=mongodb://127.0.0.1:27017/vortex_ai

# Express session secret (change this in production)
SESSION_SECRET=change_me_to_a_long_random_string

# Port for the Node.js server (optional, defaults to 3000)
PORT=3000

# Google OAuth (optional, but strongly recommended to override defaults in code)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Location of the ML microservice used by /damage-model
ML_HOST=127.0.0.1
ML_PORT=5000
```

> Security note: never commit real Google OAuth secrets or production MongoDB URLs into version control. Use environment variables instead.

---

## Running the application

### 1. Start the ML microservice

From the `mlmodel` directory:

```bash
cd mlmodel
python app.py
```

By default this starts Flask on `http://0.0.0.0:5000`. You can also use `flask run` if you prefer a Flask CLI workflow.

### 2. Start the Node.js web server

From the project root:

```bash
npm start
```

This runs `node ./bin/www`, which starts the Express app on `PORT` (3000 by default). Visit:

- http://localhost:3000

---

## Features & Pages

- **Dashboard / Landing**
  - High‑level entry point into the application.

- **Damage Model (`/damage-model`)**
  - Requires login.
  - Accepts hazard type (cyclone, flood, earthquake, landslide) and scenario inputs such as wind speed, rainfall, population density, and infrastructure score.
  - Attempts to auto‑detect the user’s location via browser geolocation; if successful, the scenario is geo‑tagged and sent to the ML service.
  - Produces a risk score (0–100) and label: `LOW`, `MODERATE`, `HIGH`, or `CRITICAL` with a recommended action window (e.g. "Next 12–24 hours").
  - When coordinates are provided, the Node app POSTs JSON to the ML `/predict` endpoint and uses the returned confidence to refine the risk label.

- **Risk Map (`/risk-map`)**
  - Map‑based visualization of risk using Leaflet and base tiles from OpenStreetMap.

- **Forecasts (`/forecasts`)**
  - Placeholder for short‑range hazard/impact forecasts.

- **Authentication**
  - Email/password signup and login backed by MongoDB (model in `models/User.js`).
  - Optional Google OAuth 2.0 login (via `passport-google-oauth20`).

---

## Authentication details

The authentication flow is implemented in `routes/auth.js`:

- **Local accounts**
  - `POST /signup` creates a user with `name`, `email`, and a hashed password (bcrypt).
  - `POST /login` verifies the email and password, then stores a minimal user object in `req.session.user`.
  - `POST /logout` destroys the session.

- **Google OAuth**
  - `GET /auth/google` starts the OAuth flow.
  - `GET /auth/google/callback` completes the login and populates `req.session.user` with the Google account.

The app uses `express-session` with an in‑memory store by default. For production use you should:

- Switch to a persistent session store (e.g. Redis, MongoDB store).
- Serve the app over HTTPS.
- Use a strong, secret `SESSION_SECRET` and secure cookie settings.

---

## ML API: `/predict`

The high‑level endpoint used by the Node app is `POST /predict` on the Flask service. It expects JSON like:

```json
{
  "lat": 23.5,
  "lon": 88.3,
  "hour": 14,
  "day": 29,
  "month": 3,
  "hazardType": "cyclone" // optional
}
```

Response:

```json
{
  "disaster": "Cyclone / Typhoon",
  "confidence": 78.4
}
```

- `disaster` is a human‑readable label for the dominant hazard at that location.
- `confidence` is a 0–100 measure derived from the underlying models and heuristics.

You can also call the lower‑level per‑hazard endpoints directly when testing:

- `POST /predict/earthquake`
- `POST /predict/cyclone`
- `POST /predict/flood`

Each of these expects a richer set of numeric features (see `mlmodel/app.py` for the exact payloads).

Example `curl` for the high‑level endpoint:

```bash
curl -X POST http://127.0.0.1:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"lat": 23.5, "lon": 88.3, "hour": 14, "day": 29, "month": 3, "hazardType": "flood"}'
```

---

## Project structure

High‑level layout (not exhaustive):

- `app.js` — Express app setup (views, middleware, MongoDB connection, routes).
- `bin/www` — HTTP server bootstrap for the Node app.
- `routes/`
  - `index.js` — core pages (dashboard, damage model, risk map, forecasts) and ML service integration.
  - `auth.js` — signup/login/logout and Google OAuth routes.
  - `users.js` — placeholder for user‑specific routes.
- `models/User.js` — Mongoose user schema.
- `views/` — EJS templates for all pages and partials.
- `public/` — static assets (CSS, JS, images).
  - `javascripts/damage-model.js` — browser geolocation + map rendering for the damage model view.
  - `javascripts/main.js` — page transition effects.
  - `javascripts/risk-map.js` — risk map client logic.
- `mlmodel/app.py` — Flask app exposing ML prediction endpoints.

---

## Development notes

- Error pages are rendered via `views/error.ejs` using Express error middleware.
- The current configuration is suitable for local development and demos.
- For production deployments you should additionally:
  - Use a production‑grade process manager (PM2, systemd, Docker, etc.).
  - Harden session and cookie settings.
  - Add logging, monitoring, and rate‑limiting as appropriate.

---

## License

Specify your project license here (e.g. MIT, Apache‑2.0) if applicable.
