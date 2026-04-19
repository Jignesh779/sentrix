"""
Sentrix — Dead Man's Switch (Inactivity Auto-SOS)

Monitors tourist activity and auto-triggers SOS if a tourist becomes
unresponsive in or near a danger zone. Designed for scenarios where
the tourist is unconscious, injured, or physically unable to press SOS.

How it works:
  1. Every location ping (risk-score check) updates the tourist's
     "last seen" timestamp and position.
  2. A background task runs every 30 seconds, scanning all tracked tourists.
  3. If a tourist has been inactive for INACTIVITY_THRESHOLD_MINUTES
     AND their last known position is within a danger zone
     → SOS is auto-fired with triggered_via = "dead_mans_switch"
  4. The switch is armed per-tourist and can be disabled.

This module is backend-only — no frontend changes required.
"""

import asyncio
import time
import math
from dataclasses import dataclass, field
from typing import Optional

from rule_engine import DANGER_ZONES, haversine_km


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
INACTIVITY_THRESHOLD_MINUTES = 10    # Minutes of silence before auto-trigger
CHECK_INTERVAL_SECONDS = 30          # How often the background loop runs
DANGER_ZONE_BUFFER_KM = 2.0         # Extra buffer beyond zone radius


# ---------------------------------------------------------------------------
# Tourist Activity Tracker
# ---------------------------------------------------------------------------
@dataclass
class TouristActivity:
    """Tracks a tourist's latest activity for the Dead Man's Switch."""
    tourist_id: str
    last_ping_time: float = field(default_factory=time.time)
    last_lat: float = 0.0
    last_lon: float = 0.0
    last_battery: int = 100
    armed: bool = True              # Can be disabled per-tourist
    triggered: bool = False         # Prevents double-triggers
    trigger_count: int = 0          # Total times DMS has fired for this tourist


# Global tracker store
_activity_store: dict[str, TouristActivity] = {}

# Callback — set by main.py to fire the actual SOS
_sos_callback = None


def set_sos_callback(callback):
    """Register the async function that fires SOS. Called once at startup."""
    global _sos_callback
    _sos_callback = callback


# ---------------------------------------------------------------------------
# Public API — called from main.py endpoints
# ---------------------------------------------------------------------------
def record_ping(tourist_id: str, lat: float, lon: float, battery: int = 100):
    """Record a location ping from a tourist. Resets the inactivity timer."""
    if tourist_id not in _activity_store:
        _activity_store[tourist_id] = TouristActivity(tourist_id=tourist_id)

    activity = _activity_store[tourist_id]
    activity.last_ping_time = time.time()
    activity.last_lat = lat
    activity.last_lon = lon
    activity.last_battery = battery
    activity.triggered = False  # Reset trigger flag on new activity


def arm_switch(tourist_id: str):
    """Arm the Dead Man's Switch for a tourist."""
    if tourist_id in _activity_store:
        _activity_store[tourist_id].armed = True
        _activity_store[tourist_id].triggered = False


def disarm_switch(tourist_id: str):
    """Disarm the Dead Man's Switch (e.g., tourist is safely at hotel)."""
    if tourist_id in _activity_store:
        _activity_store[tourist_id].armed = False


def get_status(tourist_id: str) -> Optional[dict]:
    """Get the current DMS status for a tourist."""
    activity = _activity_store.get(tourist_id)
    if not activity:
        return None

    elapsed = time.time() - activity.last_ping_time
    remaining = max(0, (INACTIVITY_THRESHOLD_MINUTES * 60) - elapsed)
    in_danger = _is_near_danger_zone(activity.last_lat, activity.last_lon)

    return {
        "tourist_id": tourist_id,
        "armed": activity.armed,
        "triggered": activity.triggered,
        "trigger_count": activity.trigger_count,
        "last_ping_seconds_ago": round(elapsed),
        "seconds_until_trigger": round(remaining) if activity.armed and in_danger else None,
        "in_danger_zone": in_danger,
        "last_position": {
            "latitude": activity.last_lat,
            "longitude": activity.last_lon,
        },
        "last_battery": activity.last_battery,
        "threshold_minutes": INACTIVITY_THRESHOLD_MINUTES,
    }


def get_all_monitored() -> list[dict]:
    """Get DMS status for all tracked tourists."""
    return [get_status(tid) for tid in _activity_store]


# ---------------------------------------------------------------------------
# Danger Zone Check
# ---------------------------------------------------------------------------
def _is_near_danger_zone(lat: float, lon: float) -> bool:
    """Check if a position is inside or near any danger zone."""
    for zone in DANGER_ZONES:
        dist = haversine_km(lat, lon, zone["center"][0], zone["center"][1])
        if dist < (zone["radius_km"] + DANGER_ZONE_BUFFER_KM):
            return True
    return False


def _get_nearest_zone(lat: float, lon: float) -> Optional[dict]:
    """Get the nearest danger zone to a position."""
    nearest = None
    min_dist = float("inf")
    for zone in DANGER_ZONES:
        dist = haversine_km(lat, lon, zone["center"][0], zone["center"][1])
        if dist < min_dist:
            min_dist = dist
            nearest = {**zone, "distance_km": round(dist, 2)}
    return nearest


# ---------------------------------------------------------------------------
# Background Monitor Task
# ---------------------------------------------------------------------------
async def _monitor_loop():
    """Background task: checks all tourists for inactivity every 30 seconds."""
    print(f"[DMS] Dead Man's Switch monitor started (threshold: {INACTIVITY_THRESHOLD_MINUTES}min, interval: {CHECK_INTERVAL_SECONDS}s)")

    while True:
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)

        now = time.time()
        threshold_seconds = INACTIVITY_THRESHOLD_MINUTES * 60

        for tourist_id, activity in list(_activity_store.items()):
            # Skip if not armed or already triggered
            if not activity.armed or activity.triggered:
                continue

            elapsed = now - activity.last_ping_time

            # Check if inactive long enough
            if elapsed < threshold_seconds:
                continue

            # Check if in or near a danger zone
            if not _is_near_danger_zone(activity.last_lat, activity.last_lon):
                continue

            # ── TRIGGER AUTO-SOS ──
            activity.triggered = True
            activity.trigger_count += 1

            nearest = _get_nearest_zone(activity.last_lat, activity.last_lon)
            zone_name = nearest["name"] if nearest else "Unknown Zone"

            print(f"[DMS] ⚠️ AUTO-SOS TRIGGERED for {tourist_id}")
            print(f"[DMS]    Inactive for {int(elapsed)}s near {zone_name}")
            print(f"[DMS]    Last position: ({activity.last_lat}, {activity.last_lon})")
            print(f"[DMS]    Battery: {activity.last_battery}%")

            if _sos_callback:
                try:
                    await _sos_callback(
                        tourist_id=tourist_id,
                        latitude=activity.last_lat,
                        longitude=activity.last_lon,
                        battery_level=activity.last_battery,
                        triggered_via="dead_mans_switch",
                        location_source=f"LKP (Last Known Position — inactive {int(elapsed // 60)}min near {zone_name})",
                    )
                    print(f"[DMS] ✅ Auto-SOS delivered for {tourist_id}")
                except Exception as e:
                    print(f"[DMS] ❌ Auto-SOS failed for {tourist_id}: {e}")


_monitor_task: Optional[asyncio.Task] = None


def start_monitor():
    """Start the background monitoring task. Call once at app startup."""
    global _monitor_task
    _monitor_task = asyncio.create_task(_monitor_loop())
    return _monitor_task


def stop_monitor():
    """Stop the background monitoring task."""
    global _monitor_task
    if _monitor_task and not _monitor_task.done():
        _monitor_task.cancel()
        print("[DMS] Monitor stopped.")
