"""
TAASA - Smart Boda Boda Rider Tracking and Safety System
Main FastAPI application with all API endpoints.

Community Policing: Alerts go to fellow riders first, then police after delay.
"""

import os
import time
import logging
from threading import Lock
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import engine, get_db, Base, get_database_info
from models import Rider, Alert, AlertStatus
import crud
import schemas
from anomaly import check_for_anomaly
from geocoding import get_place_name
from security import (
    authenticate_police,
    create_access_token,
    ensure_rider_access,
    require_role,
    UserContext,
)

# Structured logging for production visibility (Render/Uvicorn stdout)
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("taasa.api")
tassa-iot-device-token123
# Data retention policy for police analytics window
RETENTION_DAYS = 180
IOT_DEVICE_TOKEN = os.getenv("IOT_DEVICE_TOKEN", "tassa-iot-device-token123")

# /location stability controls
LOCATION_MIN_INTERVAL_SECONDS = float(os.getenv("TAASA_LOCATION_MIN_INTERVAL_SECONDS", "7"))
LOCATION_RATE_LIMIT_MAX_TRACKED = int(os.getenv("TAASA_LOCATION_RATE_LIMIT_MAX_TRACKED", "10000"))
_location_last_seen: dict[int, float] = {}
_location_rate_lock = Lock()

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="TAASA API",
    description="Smart Boda Boda Rider Tracking and Safety System",
    version="1.0.0"
)

# Enable CORS for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for MVP
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _enforce_location_rate_limit(rider_id: int) -> float:
    """
    Simple in-memory per-rider limiter for /location.
    Returns retry-after seconds when throttled, else 0.
    """
    now = time.monotonic()
    retry_after = 0.0
    with _location_rate_lock:
        last_seen = _location_last_seen.get(rider_id)
        if last_seen is not None:
            elapsed = now - last_seen
            if elapsed < LOCATION_MIN_INTERVAL_SECONDS:
                retry_after = LOCATION_MIN_INTERVAL_SECONDS - elapsed
            else:
                _location_last_seen[rider_id] = now
        else:
            _location_last_seen[rider_id] = now

        # Prevent unbounded memory growth for long-running processes.
        if len(_location_last_seen) > LOCATION_RATE_LIMIT_MAX_TRACKED:
            cutoff = now - (LOCATION_MIN_INTERVAL_SECONDS * 5)
            stale_ids = [rid for rid, ts in _location_last_seen.items() if ts < cutoff]
            for rid in stale_ids:
                _location_last_seen.pop(rid, None)

    return retry_after


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(
        "HTTP error %s on %s %s: %s",
        exc.status_code,
        request.method,
        request.url.path,
        exc.detail,
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Catch-all safety net so unexpected errors are logged consistently.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning("Validation error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.get("/")
def root():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/health/database")
def database_health(db: Session = Depends(get_db)):
    """
    Database connectivity and persistence diagnostics.
    Helps confirm that production is using external Postgres (e.g., Supabase).
    """
    try:
        db.execute(text("SELECT 1"))
        rider_count = db.query(Rider).count()
        return {
            "status": "ok",
            "rider_count": rider_count,
            **get_database_info(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database connection failed: {exc}") from exc


# Registration endpoint
@app.post("/register", response_model=schemas.RiderResponse)
def register_rider(rider: schemas.RiderCreate, db: Session = Depends(get_db)):
    """
    Register a new rider.
    Checks for duplicate name and plate number.
    """
    # Check if name already exists
    existing_rider = crud.get_rider_by_name(db, rider.name)
    if existing_rider:
        raise HTTPException(status_code=400, detail="Rider name already registered")
    
    # Check if plate number already exists
    existing_plate = db.query(Rider).filter(Rider.plate_number == rider.plate_number).first()
    if existing_plate:
        raise HTTPException(status_code=400, detail="Plate number already registered")
    
    return crud.create_rider(db, rider)


# Login endpoint
@app.post("/login", response_model=schemas.LoginResponse)
def login_rider(credentials: schemas.RiderLogin, db: Session = Depends(get_db)):
    """
    Authenticate rider with name and password.
    Returns rider data on success.
    """
    rider = crud.authenticate_rider(db, credentials.name, credentials.password)
    
    if not rider:
        return schemas.LoginResponse(
            success=False,
            message="Invalid name or password",
            rider=None,
            access_token=None,
            role=None,
        )

    token = create_access_token(
        role="RIDER",
        rider_id=rider.id,
        rider_name=rider.name,
    )
    
    return schemas.LoginResponse(
        success=True,
        message="Login successful",
        rider=schemas.RiderResponse.model_validate(rider),
        access_token=token,
        role="RIDER",
    )


@app.post("/police/login", response_model=schemas.LoginResponse)
def login_police(credentials: schemas.PoliceLogin):
    """Authenticate police operator and issue a POLICE token."""
    if not authenticate_police(credentials.username, credentials.password):
        return schemas.LoginResponse(
            success=False,
            message="Invalid police credentials",
            rider=None,
            access_token=None,
            role=None,
        )

    token = create_access_token(role="POLICE")
    return schemas.LoginResponse(
        success=True,
        message="Police login successful",
        rider=None,
        access_token=token,
        role="POLICE",
    )


# Location tracking endpoint
@app.post("/location", response_model=schemas.LocationResponse)
def create_location(
    location: schemas.LocationCreate,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER")),
):
    """
    Record rider's current location.
    Also checks for anomaly conditions and creates alert if needed.
    """
    rider_id = current_user.rider_id or location.rider_id
    retry_after = _enforce_location_rate_limit(rider_id)
    if retry_after > 0:
        rounded_retry = max(1, int(retry_after))
        logger.warning(
            "Rate limit hit for rider_id=%s on /location (retry_after=%ss)",
            rider_id,
            rounded_retry,
        )
        return JSONResponse(
            status_code=429,
            content={
                "success": False,
                "message": "Too many location updates. Please slow down.",
                "retry_after_seconds": rounded_retry,
            },
        )

    try:
        # Verify rider exists
        rider = crud.get_rider_by_id(db, location.rider_id)
        if not rider:
            raise HTTPException(status_code=404, detail="Rider not found")
        ensure_rider_access(current_user, location.rider_id)

        # Save location
        db_location = crud.create_location(db, location)

        # Check for anomaly (stationary at night)
        check_for_anomaly(db, location.rider_id, location.latitude, location.longitude)

        logger.info(
            "Location ingested for rider_id=%s (lat=%.6f, lon=%.6f)",
            location.rider_id,
            location.latitude,
            location.longitude,
        )
        return db_location
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Location ingestion failed for rider_id=%s", location.rider_id)
        raise HTTPException(status_code=500, detail="Failed to process location update") from exc


# SOS alert endpoint
@app.post("/sos", response_model=schemas.AlertResponse)
def create_sos(
    sos: schemas.SOSCreate,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER")),
):
    """
    Create an SOS emergency alert.
    
    Community Policing: Alert goes to fellow riders first (RIDER_PENDING status).
    If no rider responds within 3 minutes, it auto-escalates to police.
    """
    # Verify rider exists
    rider = crud.get_rider_by_id(db, sos.rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    ensure_rider_access(current_user, sos.rider_id)
    
    alert = crud.create_sos_alert(db, sos)
    place_name = get_place_name(alert.latitude, alert.longitude)
    responders = crud.get_alert_responders(db, alert.id)
    
    return schemas.AlertResponse(
        id=alert.id,
        rider_id=alert.rider_id,
        latitude=alert.latitude,
        longitude=alert.longitude,
        alert_type=alert.alert_type,
        timestamp=alert.timestamp,
        rider_name=rider.name,
        plate_number=rider.plate_number,
        location_name=place_name,
        status=alert.status,
        response_count=alert.response_count,
        escalated_at=alert.escalated_at,
        resolved_at=alert.resolved_at,
        time_until_escalation=crud.get_time_until_escalation(alert),
        responders=responders
    )

#Wokwi IOT Endpoint
@app.post("/iot/ingest")
def ingest_iot_telemetry(
    payload: schemas.IoTTelemetryCreate,
    x_device_token: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """
    Ingest telemetry from IoT devices (e.g., Wokwi ESP32 simulation).
    """
    if x_device_token != IOT_DEVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid device token")

    rider = crud.get_rider_by_id(db, payload.rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")

    if payload.event == "sos":
        alert = crud.create_sos_alert(
            db,
            schemas.SOSCreate(
                rider_id=payload.rider_id,
                latitude=payload.latitude,
                longitude=payload.longitude,
            ),
        )
        return {
            "success": True,
            "event": "sos",
            "alert_id": alert.id,
            "rider_id": payload.rider_id,
            "device_id": payload.device_id,
        }

    location = crud.create_location(
        db,
        schemas.LocationCreate(
            rider_id=payload.rider_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
        ),
    )
    check_for_anomaly(db, payload.rider_id, payload.latitude, payload.longitude)
    return {
        "success": True,
        "event": "location",
        "location_id": location.id,
        "rider_id": payload.rider_id,
        "device_id": payload.device_id,
    }


# Get all alerts endpoint (Police Dashboard)
@app.get("/alerts", response_model=list[schemas.AlertResponse])
def get_alerts(
    status: Optional[str] = Query(None, description="Filter by status: RIDER_PENDING, ESCALATED, RESOLVED"),
    escalated_only: bool = Query(False, description="Only show escalated alerts"),
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("POLICE")),
):
    """
    Get all alerts for police dashboard.
    
    Community Policing: By default shows ESCALATED alerts.
    Set escalated_only=false to see all alerts.
    Auto-escalates pending alerts that have exceeded the time limit.
    """
    # First, auto-escalate any old pending alerts
    crud.auto_escalate_old_alerts(db)
    
    # Get alerts based on filter
    if escalated_only:
        alerts = crud.get_escalated_alerts(db)
    elif status:
        alerts = crud.get_all_alerts(db)
        alerts = [a for a in alerts if a.status == status]
    else:
        alerts = crud.get_all_alerts(db)
    
    # Add rider name, plate number, and location name to each alert
    result = []
    for alert in alerts:
        rider = crud.get_rider_by_id(db, alert.rider_id)
        place_name = get_place_name(alert.latitude, alert.longitude)
        responders = crud.get_alert_responders(db, alert.id)
        alert_data = schemas.AlertResponse(
            id=alert.id,
            rider_id=alert.rider_id,
            latitude=alert.latitude,
            longitude=alert.longitude,
            alert_type=alert.alert_type,
            timestamp=alert.timestamp,
            rider_name=rider.name if rider else "Unknown",
            plate_number=rider.plate_number if rider else "Unknown",
            location_name=place_name,
            status=alert.status,
            response_count=alert.response_count,
            escalated_at=alert.escalated_at,
            resolved_at=alert.resolved_at,
            time_until_escalation=crud.get_time_until_escalation(alert),
            responders=responders
        )
        result.append(alert_data)
    
    return result


# Get all riders endpoint
@app.get("/riders", response_model=list[schemas.RiderResponse])
def get_riders(
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("POLICE")),
):
    """
    Get all registered riders.
    """
    return crud.get_all_riders(db)


# Get rider locations endpoint
@app.get("/rider/{rider_id}/locations", response_model=list[schemas.LocationResponse])
def get_rider_locations(
    rider_id: int,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER", "POLICE")),
):
    """
    Get recent locations for a specific rider.
    """
    rider = crud.get_rider_by_id(db, rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    ensure_rider_access(current_user, rider_id)
    
    return crud.get_rider_locations(db, rider_id)


# Get rider alerts endpoint
@app.get("/rider/{rider_id}/alerts", response_model=list[schemas.AlertResponse])
def get_rider_alerts(
    rider_id: int,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER", "POLICE")),
):
    """
    Get alerts for a specific rider.
    """
    rider = crud.get_rider_by_id(db, rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    ensure_rider_access(current_user, rider_id)
    
    alerts = crud.get_rider_alerts(db, rider_id)
    
    result = []
    for alert in alerts:
        place_name = get_place_name(alert.latitude, alert.longitude)
        responders = crud.get_alert_responders(db, alert.id)
        alert_data = schemas.AlertResponse(
            id=alert.id,
            rider_id=alert.rider_id,
            latitude=alert.latitude,
            longitude=alert.longitude,
            alert_type=alert.alert_type,
            timestamp=alert.timestamp,
            rider_name=rider.name,
            plate_number=rider.plate_number,
            location_name=place_name,
            status=alert.status,
            response_count=alert.response_count,
            escalated_at=alert.escalated_at,
            resolved_at=alert.resolved_at,
            time_until_escalation=crud.get_time_until_escalation(alert),
            responders=responders
        )
        result.append(alert_data)
    
    return result


# ============== Community Policing Endpoints ==============

@app.get("/community-alerts", response_model=list[schemas.AlertResponse])
def get_community_alerts(
    rider_id: int = Query(..., description="Current rider's ID (to exclude their own alerts)"),
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER")),
):
    """
    Get alerts from fellow riders that need community response.
    
    Community Policing: Fellow riders are the first point of contact.
    Returns only RIDER_PENDING alerts from other riders.
    """
    ensure_rider_access(current_user, rider_id)

    # First, auto-escalate any old pending alerts
    crud.auto_escalate_old_alerts(db)
    
    # Get community alerts (excludes the requesting rider's own alerts)
    alerts = crud.get_community_alerts(db, exclude_rider_id=rider_id)
    
    result = []
    for alert in alerts:
        rider = crud.get_rider_by_id(db, alert.rider_id)
        place_name = get_place_name(alert.latitude, alert.longitude)
        responders = crud.get_alert_responders(db, alert.id)
        alert_data = schemas.AlertResponse(
            id=alert.id,
            rider_id=alert.rider_id,
            latitude=alert.latitude,
            longitude=alert.longitude,
            alert_type=alert.alert_type,
            timestamp=alert.timestamp,
            rider_name=rider.name if rider else "Unknown",
            plate_number=rider.plate_number if rider else "Unknown",
            location_name=place_name,
            status=alert.status,
            response_count=alert.response_count,
            escalated_at=alert.escalated_at,
            resolved_at=alert.resolved_at,
            time_until_escalation=crud.get_time_until_escalation(alert),
            responders=responders
        )
        result.append(alert_data)
    
    return result


@app.post("/alerts/{alert_id}/respond", response_model=schemas.AlertResponse)
def respond_to_alert(
    alert_id: int, 
    request: schemas.AlertRespondRequest, 
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER")),
):
    """
    Record that a fellow rider is responding to an alert.
    
    Community Policing: When riders respond, it shows community engagement
    and may prevent auto-escalation to police.
    """
    ensure_rider_access(current_user, request.responder_id)

    # Verify responder exists
    responder = crud.get_rider_by_id(db, request.responder_id)
    if not responder:
        raise HTTPException(status_code=404, detail="Responder rider not found")
    
    alert = crud.respond_to_alert(db, alert_id, request.responder_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or already escalated")
    
    rider = crud.get_rider_by_id(db, alert.rider_id)
    place_name = get_place_name(alert.latitude, alert.longitude)
    responders = crud.get_alert_responders(db, alert_id)
    
    return schemas.AlertResponse(
        id=alert.id,
        rider_id=alert.rider_id,
        latitude=alert.latitude,
        longitude=alert.longitude,
        alert_type=alert.alert_type,
        timestamp=alert.timestamp,
        rider_name=rider.name if rider else "Unknown",
        plate_number=rider.plate_number if rider else "Unknown",
        location_name=place_name,
        status=alert.status,
        response_count=alert.response_count,
        escalated_at=alert.escalated_at,
        resolved_at=alert.resolved_at,
        time_until_escalation=crud.get_time_until_escalation(alert),
        responders=responders
    )


@app.post("/alerts/{alert_id}/escalate", response_model=schemas.AlertResponse)
def escalate_alert(
    alert_id: int, 
    request: schemas.AlertEscalateRequest, 
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER")),
):
    """
    Manually escalate an alert to police.
    
    Community Policing: Riders can escalate if they determine 
    the situation requires police involvement.
    """
    ensure_rider_access(current_user, request.escalator_id)

    # Verify escalator exists
    escalator = crud.get_rider_by_id(db, request.escalator_id)
    if not escalator:
        raise HTTPException(status_code=404, detail="Escalator rider not found")
    
    alert = crud.escalate_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or already escalated")
    
    rider = crud.get_rider_by_id(db, alert.rider_id)
    place_name = get_place_name(alert.latitude, alert.longitude)
    responders = crud.get_alert_responders(db, alert_id)
    
    return schemas.AlertResponse(
        id=alert.id,
        rider_id=alert.rider_id,
        latitude=alert.latitude,
        longitude=alert.longitude,
        alert_type=alert.alert_type,
        timestamp=alert.timestamp,
        rider_name=rider.name if rider else "Unknown",
        plate_number=rider.plate_number if rider else "Unknown",
        location_name=place_name,
        status=alert.status,
        response_count=alert.response_count,
        escalated_at=alert.escalated_at,
        resolved_at=alert.resolved_at,
        time_until_escalation=crud.get_time_until_escalation(alert),
        responders=responders
    )


@app.post("/alerts/{alert_id}/resolve", response_model=schemas.AlertResponse)
def resolve_alert(
    alert_id: int, 
    request: schemas.AlertResolveRequest, 
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER", "POLICE")),
):
    """
    Mark an alert as resolved.
    
    Community Policing: Can be resolved by fellow riders 
    after they've helped the person in need.
    """
    if current_user.role == "RIDER":
        ensure_rider_access(current_user, request.resolver_id)

    # Verify resolver exists
    resolver = crud.get_rider_by_id(db, request.resolver_id)
    if not resolver:
        raise HTTPException(status_code=404, detail="Resolver rider not found")
    
    alert = crud.resolve_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    rider = crud.get_rider_by_id(db, alert.rider_id)
    place_name = get_place_name(alert.latitude, alert.longitude)
    responders = crud.get_alert_responders(db, alert_id)
    
    return schemas.AlertResponse(
        id=alert.id,
        rider_id=alert.rider_id,
        latitude=alert.latitude,
        longitude=alert.longitude,
        alert_type=alert.alert_type,
        timestamp=alert.timestamp,
        rider_name=rider.name if rider else "Unknown",
        plate_number=rider.plate_number if rider else "Unknown",
        location_name=place_name,
        status=alert.status,
        response_count=alert.response_count,
        escalated_at=alert.escalated_at,
        resolved_at=alert.resolved_at,
        time_until_escalation=-1,  # Resolved
        responders=responders
    )


# Reverse geocoding endpoint
@app.get("/geocode")
def reverse_geocode(lat: float, lng: float):
    """
    Convert coordinates to place name.
    """
    place_name = get_place_name(lat, lng)
    return {"place_name": place_name, "latitude": lat, "longitude": lng}


@app.get("/analytics/summary", response_model=schemas.AnalyticsSummary)
def get_analytics_summary(
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("POLICE")),
):
    """Return summary analytics used by police charts."""
    return crud.get_alert_analytics_summary(db)


@app.get("/analytics/hotspots", response_model=list[schemas.HotspotPoint])
def get_hotspots(
    grid_size: float = Query(0.01, description="Grid size for hotspot aggregation"),
    limit: int = Query(20, description="Max hotspot points"),
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("POLICE")),
):
    """Return hotspot points for map heat visualization."""
    hotspots = crud.get_alert_hotspots(db, grid_size=grid_size, limit=limit)

    # Attach readable place names to top hotspots
    result = []
    for point in hotspots:
        place_name = get_place_name(point["latitude"], point["longitude"])
        result.append(
            schemas.HotspotPoint(
                latitude=point["latitude"],
                longitude=point["longitude"],
                incident_count=point["incident_count"],
                location_name=place_name or None,
            )
        )
    return result


@app.get("/retention", response_model=schemas.RetentionInfo)
def get_retention_info(
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("POLICE")),
):
    """Return current retention policy and oldest available alert."""
    return schemas.RetentionInfo(
        retention_days=RETENTION_DAYS,
        oldest_alert_at=crud.get_oldest_alert_timestamp(db),
    )


@app.post("/retention/cleanup")
def run_retention_cleanup(
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("POLICE")),
):
    """Delete alerts older than retention policy window."""
    deleted = crud.cleanup_old_alerts(db, retention_days=RETENTION_DAYS)
    return {"deleted_alerts": deleted, "retention_days": RETENTION_DAYS}


@app.get("/chat/messages", response_model=list[schemas.ChatMessageResponse])
def get_chat_messages(
    limit: int = Query(100, description="Maximum messages"),
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER", "POLICE")),
):
    """Get latest coordination chat messages."""
    return crud.get_messages(db, limit=limit)


@app.post("/chat/messages", response_model=schemas.ChatMessageResponse)
def create_chat_message(
    payload: schemas.ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: UserContext = Depends(require_role("RIDER", "POLICE")),
):
    """Post a new coordination chat message."""
    return crud.create_message(
        db,
        sender_name=current_user.rider_name if current_user.role == "RIDER" else "Police Desk",
        sender_role=current_user.role,
        message=payload.message,
        alert_id=payload.alert_id,
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WEB_CONCURRENCY", "1"))
    logger.info("Starting TAASA API on 0.0.0.0:%s with workers=%s", port, workers)
    uvicorn.run("main:app", host="0.0.0.0", port=port, workers=workers)
