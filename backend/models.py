"""
Sentrix — Pydantic Data Models
All data shapes for tourist registration, blockchain digital IDs,
SOS requests/results, alerts, dispatch units, and geo-zones.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date, timezone
from uuid import uuid4


# ---------------------------------------------------------------------------
# Stage 2: Tourist Registration
# ---------------------------------------------------------------------------
class TouristRegistration(BaseModel):
    """Incoming registration from the Sentrix PWA."""
    name: str = Field(..., min_length=2, description="Full name")
    phone: str = Field(..., description="Phone with country code, e.g. +91...")
    emergency_contact: str = Field(..., description="Emergency contact phone number")
    nationality: str = Field(default="Indian", description="'Indian' or country name")
    id_type: str = Field(
        default="Aadhaar",
        description="Indian: Aadhaar | DL | VoterID  |  Foreign: Passport",
    )
    id_number: str = Field(..., description="ID number (will be hashed, never stored raw)")
    blood_group: Optional[str] = Field(default=None, description="e.g. O+, A-, B+")
    medical_conditions: Optional[str] = Field(default=None)
    trip_start: str = Field(..., description="Trip start date ISO format YYYY-MM-DD")
    trip_end: str = Field(..., description="Trip end date ISO format YYYY-MM-DD")
    language_pref: str = Field(default="en", description="en | hi | ta")


class Tourist(BaseModel):
    """Registered tourist stored in memory."""
    tourist_id: str = Field(
        default_factory=lambda: f"SY-{uuid4().hex[:4].upper()}"
    )
    name: str
    phone: str
    emergency_contact: str
    nationality: str = "Indian"
    id_type: str = "Aadhaar"
    id_hash: str = Field(
        default_factory=lambda: f"0x{uuid4().hex[:8].upper()}...{uuid4().hex[:4].upper()}"
    )
    blood_group: Optional[str] = None
    medical_conditions: Optional[str] = None
    trip_start: str = ""
    trip_end: str = ""
    language_pref: str = "en"
    consent_gps: bool = True
    digital_id_hash: Optional[str] = None
    chain_block_index: Optional[int] = None
    registered_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat() + "Z"
    )
    status: str = "active"  # active | sos | rescued


# ---------------------------------------------------------------------------
# Stage 3: Blockchain Digital ID
# ---------------------------------------------------------------------------
class DigitalID(BaseModel):
    """Blockchain-issued digital travel identity."""
    id_hash: str
    tourist_id: str
    name: str
    nationality: str
    id_type: str
    blood_group: Optional[str] = None
    issued_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat() + "Z"
    )
    expires_at: str  # trip_end date
    chain_block_index: int
    qr_payload: str = ""  # JSON string to encode in QR
    is_valid: bool = True


# ---------------------------------------------------------------------------
# Stage 5: SOS
# ---------------------------------------------------------------------------
class SOSRequest(BaseModel):
    """SOS trigger from tourist device."""
    tourist_id: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    battery_level: int = Field(..., ge=0, le=100)
    triggered_via: str = Field(
        default="button", description="button | auto_risk | geo_fence | sms_fallback"
    )
    location_source: str = Field(
        default="GPS Direct (Exact Match)"
    )


class SOSLayerResult(BaseModel):
    """Result of one SOS delivery layer."""
    layer: int
    name: str
    status: str  # success | failed | not_needed | cached
    detail: str = ""


class SOSResult(BaseModel):
    """Full result of a 4-layer SOS attempt."""
    sos_id: str = Field(default_factory=lambda: str(uuid4())[:8])
    tourist_id: str
    layers: list[SOSLayerResult] = []
    at_least_one_success: bool = False
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat() + "Z"
    )


# ---------------------------------------------------------------------------
# Stage 6: Alerts & Dispatch
# ---------------------------------------------------------------------------
class Alert(BaseModel):
    """Active emergency alert visible on the authority dashboard."""
    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    tourist_id: str
    tourist_name: str = "Unknown"
    nationality: str = "Indian"
    latitude: float
    longitude: float
    battery_level: int
    severity: str = "high"  # critical | high | medium
    risk_score: float = 0.0
    risk_level: str = "low"
    status: str = "active"  # active | dispatched | responding | resolved
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat() + "Z"
    )
    blockchain_hash: Optional[str] = None
    sos_layers: list[SOSLayerResult] = []
    triggered_via: str = "button"
    location_source: str = "GPS Accurate 5m"


class DispatchUnit(BaseModel):
    """An available emergency response unit."""
    unit_id: str
    type: str  # police | ambulance | disaster_response
    name: str  # e.g. "Manali Police Station #2"
    latitude: float
    longitude: float
    status: str = "available"  # available | dispatched | en_route | on_scene
    eta_minutes: Optional[int] = None
    assigned_alert_id: Optional[str] = None


class DispatchRequest(BaseModel):
    """Request to dispatch a unit to an alert."""
    alert_id: str
    unit_type: str  # police | ambulance | disaster_response
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Geo-Fence Zone
# ---------------------------------------------------------------------------
class GeoZone(BaseModel):
    """A danger zone area for geo-fencing."""
    name: str
    type: str  # avalanche | glacier | steep_terrain | river_crossing | flood | heat | monsoon
    region: str  # e.g. "Manali", "Goa", "Jaipur"
    center: list[float]  # [lat, lng]
    radius_km: float
    risk_multiplier: float = 1.0
    color: str = "#ff3b3b"
    active: bool = True


# ---------------------------------------------------------------------------
# Consent Update
# ---------------------------------------------------------------------------
class ConsentUpdate(BaseModel):
    """Toggle GPS consent."""
    consent_gps: bool
