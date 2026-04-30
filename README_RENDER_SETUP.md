# Render Backend Setup (TAASA)

Use this file to copy/paste everything needed when creating a new Render Web Service for the backend.

## 1) Build Command

```bash
pip install -r backend/requirements.txt
```

## 2) Start Command

```bash
cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT --workers ${WEB_CONCURRENCY:-2}
```

## 3) Environment Variables (Render → Environment)

Set these exactly (replace placeholder values):

```bash
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
TAASA_REQUIRE_EXTERNAL_DB=true
TAASA_SECRET_KEY=<your-long-random-secret>
TAASA_POLICE_USERNAME=<your-police-username>
TAASA_POLICE_PASSWORD=<your-police-password>
TAASA_IOT_DEVICE_TOKEN=<your-iot-device-token>
WEB_CONCURRENCY=2
LOG_LEVEL=INFO
TAASA_LOCATION_MIN_INTERVAL_SECONDS=7
```

Notes:
- `DATABASE_URL` is enough for Supabase.
- `SUPABASE_DATABASE_URL` is optional fallback only if you don’t use `DATABASE_URL`.

## 4) Verify After Deploy

Replace the URL and run:

```bash
curl https://<your-render-backend-url>/health/database
```

Expected response should include:

```json
{
  "status": "ok",
  "using_external_database": true,
  "backend": "postgresql"
}
```

## 5) Quick Health Check

```bash
curl https://<your-render-backend-url>/
```

Expected:

```json
{"status":"ok"}
```

## 6) Wokwi IoT Test (end-to-end)

In `wokwi/main.py`, set:

```python
BASE_URL = "https://tassa-web-version.onrender.com"
IOT_DEVICE_TOKEN = "<same value as TAASA_IOT_DEVICE_TOKEN on Render>"
RIDER_LOGIN_NAME = "<existing rider name already registered in web app>"
RIDER_LOGIN_PASSWORD = "<that rider password>"
```

Then run the Wokwi simulation and check backend logs:
- periodic events: `POST /iot/ingest` with `"event":"location"`
- SOS button press: `POST /iot/ingest` with `"event":"sos"`
- pushbutton acts as physical SOS trigger and LED stays ON for 2 minutes after each press

You can also verify rider alerts from API:

```bash
curl https://tassa-web-version.onrender.com/health/database
```
