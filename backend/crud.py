"""
CRUD operations for TAASA system.
Contains all database operations for riders, locations, and alerts.
"""

from sqlalchemy.orm import Session
from datetime import datetime
from models import Rider, Location, Alert
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
