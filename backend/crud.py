"""
CRUD operations for TAASA system.
Contains all database operations for riders, locations, and alerts.
"""

from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from models import Rider, Location, Alert, AlertStatus, ESCALATION_DELAY_SECONDS, AlertResponse
from schemas import RiderCreate, LocationCreate, SOSCreate


# Rider Operations
def create_rider(db: Session, rider: RiderCreate) -> Rider:
    """Create a new rider in the database."""
    db_rider = Rider(
        name=rider.name,
        plate_number=rider.plate_number,
        area=rider.area,
        password=rider.password
    )
    db.add(db_rider)
    db.commit()
    db.refresh(db_rider)
    return db_rider


def get_rider_by_name(db: Session, name: str) -> Rider:
    """Get rider by name."""
    return db.query(Rider).filter(Rider.name == name).first()


def get_rider_by_id(db: Session, rider_id: int) -> Rider:
    """Get rider by ID."""
    return db.query(Rider).filter(Rider.id == rider_id).first()


def get_all_riders(db: Session) -> list:
    """Get all riders."""
    return db.query(Rider).all()


def authenticate_rider(db: Session, name: str, password: str) -> Rider:
    """Authenticate rider with name and password."""
    rider = get_rider_by_name(db, name)
    if rider and rider.password == password:
        return rider
    return None


# Location Operations
def create_location(db: Session, location: LocationCreate) -> Location:
    """Create a new location record."""
    db_location = Location(
        rider_id=location.rider_id,
        latitude=location.latitude,
        longitude=location.longitude
    )
    db.add(db_location)
    db.commit()
    db.refresh(db_location)
    return db_location


def get_rider_locations(db: Session, rider_id: int, limit: int = 100) -> list:
    """Get recent locations for a specific rider."""
    return db.query(Location).filter(
        Location.rider_id == rider_id
    ).order_by(Location.timestamp.desc()).limit(limit).all()


def get_latest_location(db: Session, rider_id: int) -> Location:
    """Get the most recent location for a rider."""
    return db.query(Location).filter(
        Location.rider_id == rider_id
    ).order_by(Location.timestamp.desc()).first()


# Alert Operations
def create_alert(db: Session, rider_id: int, latitude: float, 
                 longitude: float, alert_type: str) -> Alert:
    """Create a new alert (SOS or ANOMALY)."""
    db_alert = Alert(
        rider_id=rider_id,
        latitude=latitude,
        longitude=longitude,
        alert_type=alert_type
    )
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    return db_alert


def create_sos_alert(db: Session, sos: SOSCreate) -> Alert:
    """Create an SOS alert."""
    return create_alert(db, sos.rider_id, sos.latitude, sos.longitude, "SOS")


def get_all_alerts(db: Session, limit: int = 100) -> list:
    """Get all alerts with rider information."""
    return db.query(Alert).order_by(Alert.timestamp.desc()).limit(limit).all()


def get_rider_alerts(db: Session, rider_id: int) -> list:
    """Get alerts for a specific rider."""
    return db.query(Alert).filter(
        Alert.rider_id == rider_id
    ).order_by(Alert.timestamp.desc()).all()


# Community Policing Operations
def get_community_alerts(db: Session, exclude_rider_id: int = None, limit: int = 50) -> list:
    """
    Get alerts for fellow riders (community policing).
    Returns RIDER_PENDING alerts that need community response.
    Excludes the requesting rider's own alerts.
    """
    query = db.query(Alert).filter(
        Alert.status == AlertStatus.RIDER_PENDING.value
    )
    
    if exclude_rider_id:
        query = query.filter(Alert.rider_id != exclude_rider_id)
    
    return query.order_by(Alert.timestamp.desc()).limit(limit).all()


def get_escalated_alerts(db: Session, limit: int = 100) -> list:
    """
    Get alerts that have been escalated to police.
    Police dashboard should primarily show these.
    """
    return db.query(Alert).filter(
        Alert.status == AlertStatus.ESCALATED.value
    ).order_by(Alert.timestamp.desc()).limit(limit).all()


def respond_to_alert(db: Session, alert_id: int, responder_id: int) -> Alert:
    """
    Record that a fellow rider has responded to an alert.
    Increments the response_count and stores responder info.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert and alert.status == AlertStatus.RIDER_PENDING.value:
        # Check if this rider already responded
        existing_response = db.query(AlertResponse).filter(
            AlertResponse.alert_id == alert_id,
            AlertResponse.responder_id == responder_id
        ).first()
        
        if not existing_response:
            # Create response record
            response = AlertResponse(
                alert_id=alert_id,
                responder_id=responder_id
            )
            db.add(response)
            alert.response_count += 1
            db.commit()
            db.refresh(alert)
    return alert


def get_alert_responders(db: Session, alert_id: int) -> list:
    """
    Get list of riders who responded to an alert.
    """
    responses = db.query(AlertResponse).filter(
        AlertResponse.alert_id == alert_id
    ).all()
    
    responders = []
    for response in responses:
        rider = db.query(Rider).filter(Rider.id == response.responder_id).first()
        if rider:
            responders.append({
                "id": rider.id,
                "name": rider.name,
                "plate_number": rider.plate_number,
                "responded_at": response.timestamp
            })
    return responders


def escalate_alert(db: Session, alert_id: int) -> Alert:
    """
    Escalate an alert to police.
    Changes status from RIDER_PENDING to ESCALATED.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert and alert.status == AlertStatus.RIDER_PENDING.value:
        alert.status = AlertStatus.ESCALATED.value
        alert.escalated_at = datetime.utcnow()
        db.commit()
        db.refresh(alert)
    return alert


def resolve_alert(db: Session, alert_id: int) -> Alert:
    """
    Mark an alert as resolved.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if alert and alert.status != AlertStatus.RESOLVED.value:
        alert.status = AlertStatus.RESOLVED.value
        alert.resolved_at = datetime.utcnow()
        db.commit()
        db.refresh(alert)
    return alert


def auto_escalate_old_alerts(db: Session) -> list:
    """
    Automatically escalate alerts that have been pending 
    longer than ESCALATION_DELAY_SECONDS without rider response.
    Returns list of escalated alerts.
    """
    cutoff_time = datetime.utcnow() - timedelta(seconds=ESCALATION_DELAY_SECONDS)
    
    # Find alerts that are:
    # - Still RIDER_PENDING
    # - Created before cutoff time
    # - Have no rider responses
    old_alerts = db.query(Alert).filter(
        Alert.status == AlertStatus.RIDER_PENDING.value,
        Alert.timestamp < cutoff_time,
        Alert.response_count == 0
    ).all()
    
    escalated = []
    for alert in old_alerts:
        alert.status = AlertStatus.ESCALATED.value
        alert.escalated_at = datetime.utcnow()
        escalated.append(alert)
    
    if escalated:
        db.commit()
    
    return escalated


def get_time_until_escalation(alert: Alert) -> int:
    """
    Calculate seconds remaining before auto-escalation.
    Returns 0 if already past escalation time or if riders have responded.
    Returns -1 if already escalated or resolved.
    """
    if alert.status != AlertStatus.RIDER_PENDING.value:
        return -1
    
    # If riders have responded, no auto-escalation
    if alert.response_count > 0:
        return -1
    
    elapsed = (datetime.utcnow() - alert.timestamp).total_seconds()
    remaining = ESCALATION_DELAY_SECONDS - elapsed
    
    return max(0, int(remaining))
