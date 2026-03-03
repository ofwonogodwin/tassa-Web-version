"""
TAASA - Smart Boda Boda Rider Tracking and Safety System
Main FastAPI application with all API endpoints.

Community Policing: Alerts go to fellow riders first, then police after delay.
"""

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional

from database import engine, get_db, Base
from models import Rider, Alert, AlertStatus
import crud
import schemas
from anomaly import check_for_anomaly
from geocoding import get_place_name

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


@app.get("/")
def root():
    """Health check endpoint."""
    return {"message": "TAASA API is running"}


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
            rider=None
        )
    
    return schemas.LoginResponse(
        success=True,
        message="Login successful",
        rider=schemas.RiderResponse.model_validate(rider)
    )


# Location tracking endpoint
@app.post("/location", response_model=schemas.LocationResponse)
def create_location(location: schemas.LocationCreate, db: Session = Depends(get_db)):
    """
    Record rider's current location.
    Also checks for anomaly conditions and creates alert if needed.
    """
    # Verify rider exists
    rider = crud.get_rider_by_id(db, location.rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Save location
    db_location = crud.create_location(db, location)
    
    # Check for anomaly (stationary at night)
    check_for_anomaly(db, location.rider_id, location.latitude, location.longitude)
    
    return db_location


# SOS alert endpoint
@app.post("/sos", response_model=schemas.AlertResponse)
def create_sos(sos: schemas.SOSCreate, db: Session = Depends(get_db)):
    """
    Create an SOS emergency alert.
    
    Community Policing: Alert goes to fellow riders first (RIDER_PENDING status).
    If no rider responds within 3 minutes, it auto-escalates to police.
    """
    # Verify rider exists
    rider = crud.get_rider_by_id(db, sos.rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    alert = crud.create_sos_alert(db, sos)
    place_name = get_place_name(alert.latitude, alert.longitude)
    
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
        time_until_escalation=crud.get_time_until_escalation(alert)
    )


# Get all alerts endpoint (Police Dashboard)
@app.get("/alerts", response_model=list[schemas.AlertResponse])
def get_alerts(
    status: Optional[str] = Query(None, description="Filter by status: RIDER_PENDING, ESCALATED, RESOLVED"),
    escalated_only: bool = Query(False, description="Only show escalated alerts"),
    db: Session = Depends(get_db)
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
            time_until_escalation=crud.get_time_until_escalation(alert)
        )
        result.append(alert_data)
    
    return result


# Get all riders endpoint
@app.get("/riders", response_model=list[schemas.RiderResponse])
def get_riders(db: Session = Depends(get_db)):
    """
    Get all registered riders.
    """
    return crud.get_all_riders(db)


# Get rider locations endpoint
@app.get("/rider/{rider_id}/locations", response_model=list[schemas.LocationResponse])
def get_rider_locations(rider_id: int, db: Session = Depends(get_db)):
    """
    Get recent locations for a specific rider.
    """
    rider = crud.get_rider_by_id(db, rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    return crud.get_rider_locations(db, rider_id)


# Get rider alerts endpoint
@app.get("/rider/{rider_id}/alerts", response_model=list[schemas.AlertResponse])
def get_rider_alerts(rider_id: int, db: Session = Depends(get_db)):
    """
    Get alerts for a specific rider.
    """
    rider = crud.get_rider_by_id(db, rider_id)
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    alerts = crud.get_rider_alerts(db, rider_id)
    
    result = []
    for alert in alerts:
        place_name = get_place_name(alert.latitude, alert.longitude)
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
            time_until_escalation=crud.get_time_until_escalation(alert)
        )
        result.append(alert_data)
    
    return result


# ============== Community Policing Endpoints ==============

@app.get("/community-alerts", response_model=list[schemas.AlertResponse])
def get_community_alerts(
    rider_id: int = Query(..., description="Current rider's ID (to exclude their own alerts)"),
    db: Session = Depends(get_db)
):
    """
    Get alerts from fellow riders that need community response.
    
    Community Policing: Fellow riders are the first point of contact.
    Returns only RIDER_PENDING alerts from other riders.
    """
    # First, auto-escalate any old pending alerts
    crud.auto_escalate_old_alerts(db)
    
    # Get community alerts (excludes the requesting rider's own alerts)
    alerts = crud.get_community_alerts(db, exclude_rider_id=rider_id)
    
    result = []
    for alert in alerts:
        rider = crud.get_rider_by_id(db, alert.rider_id)
        place_name = get_place_name(alert.latitude, alert.longitude)
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
            time_until_escalation=crud.get_time_until_escalation(alert)
        )
        result.append(alert_data)
    
    return result


@app.post("/alerts/{alert_id}/respond", response_model=schemas.AlertResponse)
def respond_to_alert(
    alert_id: int, 
    request: schemas.AlertRespondRequest, 
    db: Session = Depends(get_db)
):
    """
    Record that a fellow rider is responding to an alert.
    
    Community Policing: When riders respond, it shows community engagement
    and may prevent auto-escalation to police.
    """
    # Verify responder exists
    responder = crud.get_rider_by_id(db, request.responder_id)
    if not responder:
        raise HTTPException(status_code=404, detail="Responder rider not found")
    
    alert = crud.respond_to_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or already escalated")
    
    rider = crud.get_rider_by_id(db, alert.rider_id)
    place_name = get_place_name(alert.latitude, alert.longitude)
    
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
        time_until_escalation=crud.get_time_until_escalation(alert)
    )


@app.post("/alerts/{alert_id}/escalate", response_model=schemas.AlertResponse)
def escalate_alert(
    alert_id: int, 
    request: schemas.AlertEscalateRequest, 
    db: Session = Depends(get_db)
):
    """
    Manually escalate an alert to police.
    
    Community Policing: Riders can escalate if they determine 
    the situation requires police involvement.
    """
    # Verify escalator exists
    escalator = crud.get_rider_by_id(db, request.escalator_id)
    if not escalator:
        raise HTTPException(status_code=404, detail="Escalator rider not found")
    
    alert = crud.escalate_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found or already escalated")
    
    rider = crud.get_rider_by_id(db, alert.rider_id)
    place_name = get_place_name(alert.latitude, alert.longitude)
    
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
        time_until_escalation=crud.get_time_until_escalation(alert)
    )


@app.post("/alerts/{alert_id}/resolve", response_model=schemas.AlertResponse)
def resolve_alert(
    alert_id: int, 
    request: schemas.AlertResolveRequest, 
    db: Session = Depends(get_db)
):
    """
    Mark an alert as resolved.
    
    Community Policing: Can be resolved by fellow riders 
    after they've helped the person in need.
    """
    # Verify resolver exists
    resolver = crud.get_rider_by_id(db, request.resolver_id)
    if not resolver:
        raise HTTPException(status_code=404, detail="Resolver rider not found")
    
    alert = crud.resolve_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    rider = crud.get_rider_by_id(db, alert.rider_id)
    place_name = get_place_name(alert.latitude, alert.longitude)
    
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
        time_until_escalation=-1  # Resolved
    )


# Reverse geocoding endpoint
@app.get("/geocode")
def reverse_geocode(lat: float, lng: float):
    """
    Convert coordinates to place name.
    """
    place_name = get_place_name(lat, lng)
    return {"place_name": place_name, "latitude": lat, "longitude": lng}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
