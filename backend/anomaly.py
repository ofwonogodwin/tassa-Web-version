"""
ML-based anomaly detection for TAASA.
"""

from datetime import datetime, timedelta
from math import asin, cos, radians, sin, sqrt

from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from crud import create_alert
from models import Alert, Location

# Number of recent locations used to train rider movement profile
TRAINING_WINDOW = 250
# Minimum transitions needed to train model
MIN_TRAINING_SAMPLES = 25
# Avoid duplicate anomaly alerts in short period
ANOMALY_COOLDOWN_MINUTES = 10


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in meters."""
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return 6371000 * c


def _build_feature_rows(locations: list[Location]) -> list[list[float]]:
    """
    Build movement features from sequential location points.
    Features:
    - distance (meters)
    - speed (m/s)
    - hour_sin, hour_cos (cyclical time encoding)
    """
    rows = []
    for previous, current in zip(locations[:-1], locations[1:]):
        delta_seconds = (current.timestamp - previous.timestamp).total_seconds()
        if delta_seconds <= 0:
            continue

        distance_m = haversine_distance(
            previous.latitude,
            previous.longitude,
            current.latitude,
            current.longitude,
        )
        speed_mps = distance_m / delta_seconds
        hour = current.timestamp.hour + (current.timestamp.minute / 60.0)
        hour_angle = (2 * 3.141592653589793 * hour) / 24.0
        hour_sin = sin(hour_angle)
        hour_cos = cos(hour_angle)
        rows.append([distance_m, speed_mps, hour_sin, hour_cos])
    return rows


def check_for_anomaly(db: Session, rider_id: int, current_lat: float, current_lon: float) -> bool:
    """
    Train a rider profile with Isolation Forest and flag outlier movement.
    Returns True when anomaly alert is created.
    """
    locations = (
        db.query(Location)
        .filter(Location.rider_id == rider_id)
        .order_by(Location.timestamp.desc())
        .limit(TRAINING_WINDOW)
        .all()
    )
    locations = list(reversed(locations))
    if len(locations) < MIN_TRAINING_SAMPLES + 1:
        return False

    feature_rows = _build_feature_rows(locations)
    if len(feature_rows) < MIN_TRAINING_SAMPLES:
        return False

    scaler = StandardScaler()
    scaled_rows = scaler.fit_transform(feature_rows)

    model = IsolationForest(contamination=0.08, random_state=42)
    model.fit(scaled_rows)

    latest_row = scaled_rows[-1].reshape(1, -1)
    prediction = model.predict(latest_row)[0]
    if prediction != -1:
        return False

    cutoff = datetime.utcnow() - timedelta(minutes=ANOMALY_COOLDOWN_MINUTES)
    recent_anomaly = (
        db.query(Alert)
        .filter(
            Alert.rider_id == rider_id,
            Alert.alert_type == "ANOMALY",
            Alert.timestamp >= cutoff,
        )
        .first()
    )
    if recent_anomaly:
        return False

    create_alert(db, rider_id, current_lat, current_lon, "ANOMALY")
    return True
