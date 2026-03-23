"""
Pydantic schemas for request/response validation.
Separates API data structures from database models.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


# Rider Schemas
class RiderCreate(BaseModel):
    """Schema for rider registration."""
    name: str
    plate_number: str
    area: str
    password: str


class RiderLogin(BaseModel):
    """Schema for rider login."""
    name: str
    password: str


class RiderResponse(BaseModel):
    """Schema for rider response data."""
    id: int
    name: str
    plate_number: str
    area: str
    created_at: datetime

    class Config:
        from_attributes = True


# Location Schemas
class LocationCreate(BaseModel):
    """Schema for creating location record."""
    rider_id: int
    latitude: float
    longitude: float


class LocationResponse(BaseModel):
    """Schema for location response data."""
    id: int
    rider_id: int
    latitude: float
    longitude: float
    timestamp: datetime

    class Config:
        from_attributes = True


# Alert Schemas
class SOSCreate(BaseModel):
    """Schema for SOS alert creation."""
    rider_id: int
    latitude: float
    longitude: float


class ResponderInfo(BaseModel):
    """Schema for responder information."""
    id: int
    name: str
    plate_number: str
    responded_at: datetime

    class Config:
        from_attributes = True


class AlertResponse(BaseModel):
    """Schema for alert response data."""
    id: int
    rider_id: int
    latitude: float
    longitude: float
    alert_type: str
    timestamp: datetime
    rider_name: Optional[str] = None
    plate_number: Optional[str] = None
    location_name: Optional[str] = None  # Human-readable place name
    # Community policing fields
    status: str = "RIDER_PENDING"
    response_count: int = 0
    escalated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    # Time remaining before auto-escalation (in seconds)
    time_until_escalation: Optional[int] = None
    # List of responders with their details
    responders: List[ResponderInfo] = []

    class Config:
        from_attributes = True


class AlertRespondRequest(BaseModel):
    """Schema for a rider responding to a community alert."""
    responder_id: int  # The rider who is responding


class AlertEscalateRequest(BaseModel):
    """Schema for manually escalating an alert to police."""
    escalator_id: int  # The rider requesting escalation
    reason: Optional[str] = None


class AlertResolveRequest(BaseModel):
    """Schema for marking an alert as resolved."""
    resolver_id: int
    resolution_notes: Optional[str] = None


class AnalyticsSummary(BaseModel):
    """High-level analytics data for police dashboard."""
    total_alerts: int
    sos_alerts: int
    anomaly_alerts: int
    escalated_alerts: int
    pending_alerts: int
    resolved_alerts: int


class HotspotPoint(BaseModel):
    """Aggregated hotspot point with alert density."""
    latitude: float
    longitude: float
    incident_count: int
    location_name: Optional[str] = None


class RetentionInfo(BaseModel):
    """Retention policy and current data horizon."""
    retention_days: int
    oldest_alert_at: Optional[datetime] = None


class ChatMessageCreate(BaseModel):
    """Create a chat message."""
    sender_name: str
    sender_role: str
    message: str
    alert_id: Optional[int] = None


class ChatMessageResponse(BaseModel):
    """Chat message response."""
    id: int
    sender_name: str
    sender_role: str
    message: str
    alert_id: Optional[int] = None
    timestamp: datetime

    class Config:
        from_attributes = True


# Login Response
class LoginResponse(BaseModel):
    """Schema for login response."""
    success: bool
    message: str
    rider: Optional[RiderResponse] = None
