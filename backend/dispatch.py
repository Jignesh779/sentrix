"""
Sentrix — ERSS-112 Mock Dispatch
Simulates dispatching police, ambulance, or disaster response units
to SOS alert locations using India's existing emergency infrastructure.

In production, this would call the real ERSS-112 CAD (Computer Aided Dispatch) API.
"""

import math
from uuid import uuid4
from models import DispatchUnit


# ---------------------------------------------------------------------------
# Pre-defined emergency response units across India
# ---------------------------------------------------------------------------
AVAILABLE_UNITS: list[dict] = [
    # ── Manali / Himachal Pradesh ──
    {"unit_id": "MP-01", "type": "police", "name": "Manali Police Station", "latitude": 32.2396, "longitude": 77.1887},
    {"unit_id": "MP-02", "type": "police", "name": "Kullu District Police HQ", "latitude": 31.9579, "longitude": 77.1091},
    {"unit_id": "MA-01", "type": "ambulance", "name": "Civil Hospital Manali", "latitude": 32.2426, "longitude": 77.1880},
    {"unit_id": "MA-02", "type": "ambulance", "name": "PHC Solang", "latitude": 32.3100, "longitude": 77.1550},
    {"unit_id": "MD-01", "type": "disaster_response", "name": "SDRF Himachal Pradesh", "latitude": 32.2200, "longitude": 77.1700},
    # ── Goa ──
    {"unit_id": "GP-01", "type": "police", "name": "Anjuna Police Station", "latitude": 15.5735, "longitude": 73.7410},
    {"unit_id": "GA-01", "type": "ambulance", "name": "North Goa District Hospital", "latitude": 15.4909, "longitude": 73.8278},
    {"unit_id": "GD-01", "type": "disaster_response", "name": "NDRF Goa Unit", "latitude": 15.4507, "longitude": 73.8263},
    # ── Jaipur / Rajasthan ──
    {"unit_id": "JP-01", "type": "police", "name": "Jaipur City Police", "latitude": 26.9124, "longitude": 75.7873},
    {"unit_id": "JA-01", "type": "ambulance", "name": "SMS Hospital Jaipur", "latitude": 26.9044, "longitude": 75.8019},
    {"unit_id": "JD-01", "type": "disaster_response", "name": "NDRF Jaipur Unit", "latitude": 26.8800, "longitude": 75.7600},
    # ── Northeast India ──
    {"unit_id": "NP-01", "type": "police", "name": "Guwahati City Police", "latitude": 26.1445, "longitude": 91.7362},
    {"unit_id": "NA-01", "type": "ambulance", "name": "GMCH Guwahati", "latitude": 26.1640, "longitude": 91.7570},
    {"unit_id": "ND-01", "type": "disaster_response", "name": "NDRF 1st Battalion Guwahati", "latitude": 26.1200, "longitude": 91.7000},
    # ── Kerala ──
    {"unit_id": "KP-01", "type": "police", "name": "Munnar Police Station", "latitude": 10.0889, "longitude": 77.0595},
    {"unit_id": "KA-01", "type": "ambulance", "name": "Tata Tea Hospital Munnar", "latitude": 10.0900, "longitude": 77.0610},
    {"unit_id": "KD-01", "type": "disaster_response", "name": "NDRF Kerala Unit", "latitude": 9.9312, "longitude": 76.2673},
]


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest_units(
    lat: float, lon: float, unit_type: str = None, limit: int = 3
) -> list[DispatchUnit]:
    """
    Find the nearest available emergency response units.
    Optionally filter by type (police, ambulance, disaster_response).
    """
    candidates = AVAILABLE_UNITS
    if unit_type:
        candidates = [u for u in candidates if u["type"] == unit_type]

    results = []
    for unit in candidates:
        dist = _haversine_km(lat, lon, unit["latitude"], unit["longitude"])
        # Estimate ETA: average road speed 40 km/h in mountains, 60 in plains
        avg_speed = 40 if dist > 10 else 60
        eta = max(5, int((dist / avg_speed) * 60))  # minutes, minimum 5

        results.append(DispatchUnit(
            unit_id=unit["unit_id"],
            type=unit["type"],
            name=unit["name"],
            latitude=unit["latitude"],
            longitude=unit["longitude"],
            status="available",
            eta_minutes=eta,
        ))

    results.sort(key=lambda u: u.eta_minutes)
    return results[:limit]


# Track dispatched units
_dispatched: dict[str, DispatchUnit] = {}


def dispatch_unit(unit_id: str, alert_id: str) -> DispatchUnit | None:
    """
    Dispatch a specific unit to an alert.
    Returns the updated unit or None if not found.
    """
    for unit_data in AVAILABLE_UNITS:
        if unit_data["unit_id"] == unit_id:
            dispatched = DispatchUnit(
                unit_id=unit_data["unit_id"],
                type=unit_data["type"],
                name=unit_data["name"],
                latitude=unit_data["latitude"],
                longitude=unit_data["longitude"],
                status="dispatched",
                assigned_alert_id=alert_id,
            )
            _dispatched[unit_id] = dispatched
            return dispatched
    return None


def get_dispatched_units() -> list[DispatchUnit]:
    """Return all currently dispatched units."""
    return list(_dispatched.values())
