"""
Pydantic schemas for request/response validation.
Separates API data structures from database models.
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional


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


class AlertResponse(BaseModel):
    """Schema for alert response data."""
    id: int
    rider_id: int
    latitude: float
    longitude: float
    alert_type: str
    timestamp: datetime
    rider_name: Optional[str] = None

    class Config:
        from_attributes = True


# Login Response
class LoginResponse(BaseModel):
    """Schema for login response."""
    success: bool
    message: str
    rider: Optional[RiderResponse] = None
