"""
SQLAlchemy ORM models for TAASA system.
Defines Rider, Location, and Alert tables.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
import enum


class AlertStatus(enum.Enum):
    """Alert status for community policing workflow.
    
    RIDER_PENDING: Alert visible to fellow riders first (default)
    ESCALATED: Alert has been escalated to police
    RESOLVED: Alert has been resolved
    """
    RIDER_PENDING = "RIDER_PENDING"
    ESCALATED = "ESCALATED"
    RESOLVED = "RESOLVED"


# Auto-escalation delay in seconds (3 minutes default)
ESCALATION_DELAY_SECONDS = 180


class Rider(Base):
    """Rider model - stores boda boda rider information."""
    __tablename__ = "riders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    plate_number = Column(String, unique=True, nullable=False)
    area = Column(String, nullable=False)
    password = Column(String, nullable=False)  # Plain text for MVP
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    locations = relationship("Location", back_populates="rider")
    alerts = relationship("Alert", back_populates="rider")


class Location(Base):
    """Location model - stores rider GPS coordinates with timestamps."""
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationship
    rider = relationship("Rider", back_populates="locations")


class Alert(Base):
    """Alert model - stores SOS and ANOMALY alerts.
    
    Community Policing: Alerts go to fellow riders first, then police.
    - status: RIDER_PENDING (default) → ESCALATED → RESOLVED
    - response_count: Number of fellow riders who acknowledged
    - escalated_at: When the alert was escalated to police
    """
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    rider_id = Column(Integer, ForeignKey("riders.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    alert_type = Column(String, nullable=False)  # SOS or ANOMALY
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    # Community policing fields
    status = Column(String, default=AlertStatus.RIDER_PENDING.value, nullable=False)
    response_count = Column(Integer, default=0)  # Fellow riders who responded
    escalated_at = Column(DateTime, nullable=True)  # When escalated to police
    resolved_at = Column(DateTime, nullable=True)  # When resolved

    # Relationship
    rider = relationship("Rider", back_populates="alerts")
