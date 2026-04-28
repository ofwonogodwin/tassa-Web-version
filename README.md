Your Number 1 Boda Boda Security System

## Security and IoT configuration

Set these backend environment variables before running:

- `DATABASE_URL` - PostgreSQL connection string (example: `postgresql+psycopg2://user:password@host:5432/dbname`)
- `TAASA_SECRET_KEY` - JWT signing key
- `TAASA_POLICE_USERNAME` - police login username
- `TAASA_POLICE_PASSWORD` - police login password
- `TAASA_IOT_DEVICE_TOKEN` - token expected in `X-Device-Token` header for `/iot/ingest`

## Auth and RBAC

- Rider login: `POST /login`
- Police login: `POST /police/login`
- Rider and police routes are protected using Bearer tokens.

## IoT ingestion

Send telemetry to `POST /iot/ingest`:

```json
{
  "rider_id": 1,
  "latitude": 0.3476,
  "longitude": 32.5825,
  "event": "location",
  "device_id": "esp32-001"
}
```
