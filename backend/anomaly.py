"""
Anomaly detection logic for TAASA system.

Anomaly Detection Rules:
1. Rider location has not significantly changed for 10+ minutes
2. Current time is between 20:00 (8 PM) and 05:00 (5 AM)

When both conditions are met, an ANOMALY alert is automatically created.
"""

from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from math import radians, cos, sin, asin, sqrt
from models import Location, Alert
from crud import create_alert, get_latest_location


# Minimum distance change (in meters) to be considered "moving"
MIN_MOVEMENT_THRESHOLD = 50

# Time threshold for stationary detection (in minutes)
STATIONARY_TIME_THRESHOLD = 10

# Night hours when anomaly detection is active (24-hour format)
NIGHT_START_HOUR = 20  # 8 PM
NIGHT_END_HOUR = 5     # 5 AM


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance between two GPS coordinates in meters.
    Uses the Haversine formula for spherical distance calculation.
    """
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    
    # Earth radius in meters
    r = 6371000
    
    return c * r


def is_night_time() -> bool:
    """
    Check if current time is within night hours (20:00 - 05:00).
    Returns True if it's night time, False otherwise.
    """
    current_hour = datetime.now().hour
    
    # Night spans across midnight, so we check:
    # - From 20:00 to 23:59 (hour >= 20)
    # - From 00:00 to 04:59 (hour < 5)
    return current_hour >= NIGHT_START_HOUR or current_hour < NIGHT_END_HOUR


def check_for_anomaly(db: Session, rider_id: int, 
                      current_lat: float, current_lon: float) -> bool:
    """
    Check if current location update triggers an anomaly alert.
    
    Conditions for anomaly:
    1. It must be night time (between 20:00 and 05:00)
    2. Rider must have been stationary for at least 10 minutes
    
    Returns True if anomaly was detected and alert created, False otherwise.
    """
    # Condition 1: Check if it's night time
    if not is_night_time():
        return False
    
    # Get rider's recent locations from the past 10+ minutes
    time_threshold = datetime.utcnow() - timedelta(minutes=STATIONARY_TIME_THRESHOLD)
    
    recent_locations = db.query(Location).filter(
        Location.rider_id == rider_id,
        Location.timestamp >= time_threshold
    ).order_by(Location.timestamp.asc()).all()
    
    # Need at least 2 location points to compare
    if len(recent_locations) < 2:
        return False
    
    # Condition 2: Check if location hasn't changed significantly
    first_location = recent_locations[0]
    
    # Calculate distance between first recorded location and current location
    distance = haversine_distance(
        first_location.latitude, first_location.longitude,
        current_lat, current_lon
    )
    
    # If rider has moved less than threshold, they are stationary
    if distance < MIN_MOVEMENT_THRESHOLD:
        # Check if we already have a recent anomaly alert for this rider
        recent_anomaly = db.query(Alert).filter(
            Alert.rider_id == rider_id,
            Alert.alert_type == "ANOMALY",
            Alert.timestamp >= time_threshold
        ).first()
        
        # Only create alert if no recent anomaly exists (avoid duplicates)
        if not recent_anomaly:
            create_alert(db, rider_id, current_lat, current_lon, "ANOMALY")
            return True
    
    return False
