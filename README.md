Your Number 1 Boda Boda Security System

## Security and IoT configuration

Set these backend environment variables before running:

- `DATABASE_URL` - PostgreSQL connection string (Supabase is recommended in production)
- `SUPABASE_DATABASE_URL` - optional fallback if `DATABASE_URL` is not set
- `TAASA_REQUIRE_EXTERNAL_DB` - set to `true` in production to fail fast if app falls back to SQLite
- `TAASA_SECRET_KEY` - JWT signing key
- `TAASA_POLICE_USERNAME` - police login username
- `TAASA_POLICE_PASSWORD` - police login password
- `TAASA_IOT_DEVICE_TOKEN` - token expected in `X-Device-Token` header for `/iot/ingest`

### Supabase setup (fixes account reset on redeploy)

If your deployed app keeps "forgetting" riders, it is usually running on local SQLite storage.
Set `DATABASE_URL` to your Supabase Postgres connection string so data persists across restarts.

Example:

```bash
export DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

The backend now automatically:
- normalizes Postgres URLs for SQLAlchemy
- enables `sslmode=require` for Postgres/Supabase connections
- uses connection health checks (`pool_pre_ping`)

You can verify the live DB with:

```bash
curl https://<your-backend-domain>/health/database
```

Expected signal:
- `"using_external_database": true`
- `"backend": "postgresql"`
- `rider_count` should remain after restart/redeploy

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
