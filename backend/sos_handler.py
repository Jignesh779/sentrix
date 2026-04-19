"""
Sentrix — 4-Layer SOS Handler
Guaranteed delivery: at least 1 channel always succeeds.

Layer 1: ERSS-112 API  (internet required)
Layer 2: SMS to 112    (always fires simultaneously)
Layer 3: Cached retry   (if Layer 1 fails, cached for retry)
Layer 4: SMS to emergency contact (ALWAYS fires)
"""

import asyncio
import json
import random
from datetime import datetime, timezone
from uuid import uuid4

from models import SOSRequest, SOSResult, SOSLayerResult, Tourist


# In-memory cache for failed Layer 1 requests
_cached_sos_queue: list[dict] = []


async def try_erss_api(sos: SOSRequest, tourist: Tourist) -> SOSLayerResult:
    """
    Layer 1: Send alert to ERSS-112 national emergency API.
    In production this would be a real HTTP POST to the ERSS system.
    For demo: simulated with 85% success rate.
    """
    await asyncio.sleep(0.3)  # simulate network latency
    success = random.random() < 0.85  # 85% success for demo variety

    if success:
        return SOSLayerResult(
            layer=1,
            name="ERSS-112 API",
            status="success",
            detail=f"GPS ({sos.latitude}, {sos.longitude}) + Tourist ID {tourist.tourist_id} sent to national emergency system",
        )
    else:
        return SOSLayerResult(
            layer=1,
            name="ERSS-112 API",
            status="failed",
            detail="Network unavailable — API request failed",
        )


async def try_sms_112(sos: SOSRequest, tourist: Tourist) -> SOSLayerResult:
    """
    Layer 2: SMS to 112 with lat/lon + tourist ID.
    Always fires simultaneously with Layer 1.
    For demo: always succeeds (SMS works on 2G).
    """
    await asyncio.sleep(0.2)
    return SOSLayerResult(
        layer=2,
        name="SMS to 112",
        status="success",
        detail=f"LAT:{sos.latitude} LON:{sos.longitude} ID:{tourist.tourist_id} sent via SMS to 112",
    )


def cache_sos_for_retry(sos: SOSRequest, tourist: Tourist) -> SOSLayerResult:
    """
    Layer 3: Cache the failed request locally for retry when internet returns.
    Only fires if Layer 1 failed.
    """
    _cached_sos_queue.append({
        "tourist_id": tourist.tourist_id,
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "battery_level": sos.battery_level,
        "cached_at": datetime.now(timezone.utc).isoformat() + "Z",
    })
    return SOSLayerResult(
        layer=3,
        name="Cached Request",
        status="cached",
        detail=f"Request cached locally — will retry when internet returns ({len(_cached_sos_queue)} in queue)",
    )


async def try_emergency_contact_sms(sos: SOSRequest, tourist: Tourist) -> SOSLayerResult:
    """
    Layer 4: SMS to tourist's emergency contact. ALWAYS fires.
    For demo: always succeeds.
    """
    await asyncio.sleep(0.2)
    contact = tourist.emergency_contact or "unknown"
    # Safe masking: show first 3 chars + **** + last 2 chars (handles any length)
    if len(contact) >= 6:
        masked_contact = contact[:3] + "****" + contact[-2:]
    else:
        masked_contact = contact[:2] + "****"
    return SOSLayerResult(
        layer=4,
        name="Emergency Contact SMS",
        status="success",
        detail=f"SMS sent to {masked_contact}: '{tourist.name} triggered SOS at ({sos.latitude:.4f}, {sos.longitude:.4f})'",
    )


async def fire_sos(sos: SOSRequest, tourist: Tourist) -> SOSResult:
    """
    Execute all 4 layers of the SOS fallback system.
    Layers 1 and 2 fire simultaneously.
    Layer 3 only fires if Layer 1 fails.
    Layer 4 ALWAYS fires.
    """
    layers: list[SOSLayerResult] = []

    # Fire Layer 1 and Layer 2 simultaneously
    layer1, layer2 = await asyncio.gather(
        try_erss_api(sos, tourist),
        try_sms_112(sos, tourist),
    )
    layers.append(layer1)
    layers.append(layer2)

    # Layer 3: only if Layer 1 failed
    if layer1.status == "failed":
        layer3 = cache_sos_for_retry(sos, tourist)
    else:
        layer3 = SOSLayerResult(
            layer=3,
            name="Cached Request",
            status="not_needed",
            detail="API succeeded — caching not needed",
        )
    layers.append(layer3)

    # Layer 4: ALWAYS fires
    layer4 = await try_emergency_contact_sms(sos, tourist)
    layers.append(layer4)

    return SOSResult(
        tourist_id=tourist.tourist_id,
        layers=layers,
        at_least_one_success=any(l.status == "success" for l in layers),
    )


def get_cached_queue() -> list[dict]:
    """Return the current cached SOS queue (for monitoring)."""
    return list(_cached_sos_queue)


def clear_cached_queue() -> int:
    """Clear the cached queue after successful retry. Returns count cleared."""
    count = len(_cached_sos_queue)
    _cached_sos_queue.clear()
    return count
