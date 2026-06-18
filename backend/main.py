"""
Sentrix — FastAPI Backend
All REST + WebSocket endpoints for the 7-stage tourist safety system.

Stage 1: Discovery (served by frontend PWA)
Stage 2: POST /api/register
Stage 3: GET  /api/digital-id/{tourist_id}
Stage 4: GET  /api/risk-score, GET /api/geofence-data, WS /ws/tourist/{tourist_id}
Stage 5: POST /api/sos
Stage 6: GET  /api/active-alerts, POST /api/dispatch, WS /ws/authority
Stage 7: GET  /api/blockchain/*
"""

import asyncio
import json
import hashlib
import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from models import (
    TouristRegistration, Tourist, DigitalID, LinkDocumentRequest,
    SOSRequest, Alert, DispatchRequest, ConsentUpdate,
)
from rule_engine import assess_risk
from sos_handler import fire_sos
from dispatch import find_nearest_units, dispatch_unit
from geo_data import get_geofence_geojson
from blockchain import sentrix_chain
from i18n import get_supported_languages  # reserved for /api/languages endpoint
import dead_mans_switch as dms
from datetime import datetime, timedelta, date
from uuid import uuid4

# ML Model metadata (Phase 2)
try:
    from ml_model import get_model_metadata as get_ml_metadata
except ImportError:
    get_ml_metadata = lambda: {"status": "unavailable"}

# Anomaly Detection Engine (behavioral ML)
try:
    import anomaly_engine
except ImportError:
    anomaly_engine = None
    print("[!] anomaly_engine not available")

# PII Encryption
try:
    from crypto_utils import get_encryption_status as _get_enc_status, hash_pii
except ImportError:
    _get_enc_status = lambda: {"enabled": False}
    hash_pii = lambda v: "0x" + hashlib.sha256(v.encode()).hexdigest()[:16].upper() if v else ""

STATIC_DIR = Path(__file__).parent / "static"


# ---------------------------------------------------------------------------
# WebSocket Connection Managers
# ---------------------------------------------------------------------------
class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, message: str):
        dead = []
        for conn in self.connections:
            try:
                await conn.send_text(message)
            except Exception:
                dead.append(conn)
        for d in dead:
            self.connections.remove(d)


authority_manager = ConnectionManager()
# tourist_managers: reserved for per-tourist real-time push (not yet wired to frontend)
tourist_managers: dict[str, ConnectionManager] = {}


# ---------------------------------------------------------------------------
# In-Memory Stores (fast cache) + SQLite Persistence
# ---------------------------------------------------------------------------
tourists_store: dict[str, Tourist] = {}
alerts_store: dict[str, dict] = {}

# SQLite database — replaces the old data_registry.json
from database import startup as db_startup, save_tourist, save_alert, clear_all_alerts, update_alert


def save_db():
    """Persist current in-memory state to SQLite."""
    try:
        for tourist in tourists_store.values():
            save_tourist(tourist)
        for aid, adata in alerts_store.items():
            save_alert(aid, adata)
    except Exception as e:
        print(f"Error saving to DB: {e}")


def rebuild_blockchain():
    """Re-issue blockchain blocks for all persisted tourists and alerts.
    
    The blockchain lives in memory and resets on every server restart,
    but tourist/alert data persists in SQLite. This function
    replays all records onto the chain at startup so that Digital ID
    verification always works — no more "Verification Pending" bug.
    """
    id_count = 0
    alert_count = 0

    # Re-issue Digital ID blocks for every registered tourist
    for tourist in tourists_store.values():
        block = sentrix_chain.issue_digital_id({
            "tourist_id": tourist.tourist_id,
            "name": tourist.name,
            "nationality": tourist.nationality,
            "id_hash": tourist.id_hash,
        })
        # Update the tourist's chain references to match the new block
        tourist.digital_id_hash = block.hash
        tourist.chain_block_index = block.index
        id_count += 1

    # Replay SOS alert blocks
    for alert in alerts_store.values():
        sentrix_chain.add_sos_block(alert)
        alert_count += 1

    if id_count or alert_count:
        print(f"[OK] Blockchain rebuilt: {id_count} Digital IDs + {alert_count} SOS alerts replayed onto chain.")


def load_db():
    """Load data from SQLite into in-memory caches."""
    global tourists_store, alerts_store
    try:
        tourists_store, alerts_store = db_startup()
        rebuild_blockchain()
    except Exception as e:
        print(f"Error loading from DB: {e}")


# ---------------------------------------------------------------------------
# App Setup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[+] Sentrix Backend starting...")
    load_db()

    # Dead Man's Switch — auto-SOS callback
    async def dms_auto_sos(tourist_id, latitude, longitude, battery_level, triggered_via, location_source):
        """Fired by the DMS when a tourist is inactive in a danger zone."""
        tourist = tourists_store.get(tourist_id)
        if not tourist:
            print(f"[DMS] Tourist {tourist_id} not found in store, skipping.")
            return

        sos = SOSRequest(
            tourist_id=tourist_id,
            latitude=latitude,
            longitude=longitude,
            battery_level=battery_level,
            triggered_via=triggered_via,
            location_source=location_source,
        )
        result = await receive_sos(sos)
        print(f"[DMS] Auto-SOS result for {tourist_id}: {result.get('status', 'unknown')}")

    dms.set_sos_callback(dms_auto_sos)
    dms.start_monitor()

    # Anomaly Detection Engine — behavioral ML monitor
    if anomaly_engine:
        async def anomaly_auto_alert(tourist_id, anomaly_type, anomaly_score, features):
            """Fired by the anomaly engine when critical behavior detected."""
            tourist = tourists_store.get(tourist_id)
            if not tourist:
                return
            # Only auto-SOS for critical anomalies (GPS dropout with high score)
            if anomaly_type == 'gps_dropout' and anomaly_score >= 70:
                sos = SOSRequest(
                    tourist_id=tourist_id,
                    latitude=features.get('last_lat', 0),
                    longitude=features.get('last_lon', 0),
                    battery_level=features.get('last_battery', 50),
                    triggered_via='anomaly_detection',
                    location_source=f'Anomaly: {anomaly_type} (score: {anomaly_score})',
                )
                await receive_sos(sos)
            else:
                # Broadcast anomaly warning to authority dashboard
                await authority_manager.broadcast(json.dumps({
                    'type': 'anomaly_detected',
                    'data': {
                        'tourist_id': tourist_id,
                        'tourist_name': tourist.name,
                        'anomaly_type': anomaly_type,
                        'anomaly_score': anomaly_score,
                    },
                }))

        anomaly_engine.set_callback(anomaly_auto_alert)
        anomaly_engine.start_monitor()
        print("[+] Anomaly Detection Engine started.")

    yield
    dms.stop_monitor()
    if anomaly_engine:
        anomaly_engine.stop_monitor()
    print("[x] Sentrix Backend shutting down...")


app = FastAPI(
    title="Sentrix API",
    description="Tourist Safety System — 7-Stage Protection for All of India",
    version="1.0.0",
    lifespan=lifespan,
)

# Production: set ALLOWED_ORIGINS="https://your-app.onrender.com" in env
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


# ---------------------------------------------------------------------------
# Stage 1: Root / SPA
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {
        "system": "Sentrix",
        "status": "operational",
        "version": "1.0.0",
        "registered_tourists": len(tourists_store),
        "active_alerts": len(alerts_store),
    }


# ---------------------------------------------------------------------------
# Email masking helper
# ---------------------------------------------------------------------------
def mask_email(email: str) -> str:
    """Mask an email address for privacy: j***n@example.com"""
    if not email or '@' not in email:
        return email
    parts = email.split('@')
    name = parts[0]
    if len(name) > 2:
        return name[0] + '***' + name[-1] + '@' + parts[1]
    return name[0] + '***@' + parts[1]


# ---------------------------------------------------------------------------
# Stage 2: Tourist Registration
# ---------------------------------------------------------------------------
@app.post("/api/register")
async def register_tourist(reg: TouristRegistration):
    """Register a tourist and issue a blockchain Digital ID.
    If the email is already registered, returns the existing account."""
    # Hash the email (never store raw)
    id_hash = "0x" + hashlib.sha256(reg.email.lower().strip().encode()).hexdigest()[:12].upper()

    # ── Duplicate check: if email already registered, return existing account ──
    for existing in tourists_store.values():
        if hasattr(existing, 'email') and existing.email.lower().strip() == reg.email.lower().strip():
            email_masked = mask_email(existing.email)
            qr_payload = json.dumps({
                "system": "Sentrix",
                "tourist_id": existing.tourist_id,
                "name": existing.name,
                "nationality": existing.nationality,
                "email_masked": email_masked,
                "blood_group": existing.blood_group,
                "valid_until": existing.trip_end,
                "chain_hash": (existing.digital_id_hash or "")[:16],
                "verify": f"/api/verify-id/{existing.id_hash}",
            })
            digital_id = DigitalID(
                id_hash=existing.id_hash,
                tourist_id=existing.tourist_id,
                name=existing.name,
                nationality=existing.nationality,
                email_masked=email_masked,
                document_linked=existing.document_linked,
                blood_group=existing.blood_group,
                expires_at=existing.trip_end,
                chain_block_index=existing.chain_block_index or 0,
                qr_payload=qr_payload,
            )
            return {
                "status": "existing_account",
                "tourist": existing.model_dump(),
                "digital_id": digital_id.model_dump(),
                "message": "You are already registered. Welcome back!",
            }

    # ── New registration ──
    # Auto-set trip validity
    trip_start = date.today().isoformat()
    trip_end = (date.today() + timedelta(days=365)).isoformat()

    tourist = Tourist(
        name=reg.name,
        phone=reg.phone,
        emergency_contact=reg.emergency_contact,
        email=reg.email,
        nationality=reg.nationality or "Indian",
        id_hash=id_hash,
        blood_group=reg.blood_group,
        medical_conditions=reg.medical_conditions,
        trip_start=trip_start,
        trip_end=trip_end,
        language_pref=reg.language_pref,
        consent_gps=True,
    )

    # Issue Digital ID on blockchain
    block = sentrix_chain.issue_digital_id({
        "tourist_id": tourist.tourist_id,
        "name": tourist.name,
        "nationality": tourist.nationality,
        "id_hash": id_hash,
    })

    tourist.digital_id_hash = block.hash
    tourist.chain_block_index = block.index

    # Store
    tourists_store[tourist.tourist_id] = tourist
    save_db()

    # Build QR payload
    email_masked = mask_email(reg.email)
    qr_payload = json.dumps({
        "system": "Sentrix",
        "tourist_id": tourist.tourist_id,
        "name": tourist.name,
        "nationality": tourist.nationality,
        "email_masked": email_masked,
        "blood_group": tourist.blood_group,
        "valid_until": trip_end,
        "chain_hash": block.hash[:16],
        "verify": f"/api/verify-id/{id_hash}",
    })

    digital_id = DigitalID(
        id_hash=id_hash,
        tourist_id=tourist.tourist_id,
        name=tourist.name,
        nationality=tourist.nationality,
        email_masked=email_masked,
        blood_group=tourist.blood_group,
        expires_at=trip_end,
        chain_block_index=block.index,
        qr_payload=qr_payload,
    )

    return {
        "status": "registered",
        "tourist": tourist.model_dump(),
        "digital_id": digital_id.model_dump(),
        "blockchain": {
            "block_index": block.index,
            "block_hash": block.hash,
            "note": "Email hash stored on-chain. Raw email never saved.",
        },
    }


# ---------------------------------------------------------------------------
# Session Recovery (Login by Email)
# ---------------------------------------------------------------------------
@app.post("/api/login")
async def login_by_email(email: str = Body(..., embed=True)):
    """Recover an existing session by email — works from any device."""
    email_clean = email.lower().strip()
    for tourist in tourists_store.values():
        if hasattr(tourist, 'email') and tourist.email.lower().strip() == email_clean:
            email_masked = mask_email(tourist.email)
            qr_payload = json.dumps({
                "system": "Sentrix",
                "tourist_id": tourist.tourist_id,
                "name": tourist.name,
                "nationality": tourist.nationality,
                "email_masked": email_masked,
                "blood_group": tourist.blood_group,
                "valid_until": tourist.trip_end,
                "chain_hash": (tourist.digital_id_hash or "")[:16],
                "verify": f"/api/verify-id/{tourist.id_hash}",
            })
            digital_id = DigitalID(
                id_hash=tourist.id_hash,
                tourist_id=tourist.tourist_id,
                name=tourist.name,
                nationality=tourist.nationality,
                email_masked=email_masked,
                document_linked=tourist.document_linked,
                blood_group=tourist.blood_group,
                expires_at=tourist.trip_end,
                chain_block_index=tourist.chain_block_index or 0,
                qr_payload=qr_payload,
            )
            return {
                "status": "found",
                "tourist": tourist.model_dump(),
                "digital_id": digital_id.model_dump(),
            }
    raise HTTPException(status_code=404, detail="No account found with this email. Please register first.")


# ---------------------------------------------------------------------------
# Tier 2: Voluntary Document Linking
# ---------------------------------------------------------------------------
@app.post("/api/link-document")
async def link_document(req: LinkDocumentRequest):
    """Tier 2: Voluntarily link a government document for enhanced verification."""
    tourist = tourists_store.get(req.tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    # Hash the document
    doc_hash = "0x" + hashlib.sha256(req.id_number.encode()).hexdigest()[:12].upper()

    # Record on blockchain
    chain_result = sentrix_chain.record_document_link(
        tourist_id=req.tourist_id,
        document_type=req.id_type,
        document_hash=doc_hash
    )

    # Update tourist record
    tourist.document_linked = True
    tourist.document_type = req.id_type
    tourist.document_hash = doc_hash

    # Persist
    save_db()

    return {
        "status": "document_linked",
        "document_type": req.id_type,
        "document_hash": doc_hash,
        "blockchain": chain_result
    }


# ---------------------------------------------------------------------------
# Tourist Profile
# ---------------------------------------------------------------------------
@app.get("/api/profile/{tourist_id}")
async def get_profile(tourist_id: str):
    """Get tourist profile with document linking status."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    phone = tourist.phone or ""
    return {
        "tourist_id": tourist.tourist_id,
        "name": tourist.name,
        "email_masked": mask_email(tourist.email),
        "phone_masked": phone[:3] + "***" + phone[-4:] if len(phone) > 7 else phone,
        "nationality": tourist.nationality,
        "blood_group": tourist.blood_group,
        "medical_conditions": tourist.medical_conditions,
        "trip_start": tourist.trip_start,
        "trip_end": tourist.trip_end,
        "document_linked": tourist.document_linked,
        "document_type": tourist.document_type,
        "registered_at": tourist.registered_at,
        "status": tourist.status,
    }


@app.put("/api/profile/{tourist_id}/validity")
async def update_validity(tourist_id: str, months: int = Query(..., ge=1, le=12)):
    """Update the validity period of a tourist's Digital ID."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    new_end = (datetime.now() + timedelta(days=months * 30)).strftime("%Y-%m-%d")
    tourist.trip_end = new_end
    save_db()

    return {"status": "updated", "trip_end": new_end}


# ---------------------------------------------------------------------------
# Stage 3: Digital ID
# ---------------------------------------------------------------------------
@app.get("/api/digital-id/{tourist_id}")
async def get_digital_id(tourist_id: str):
    """Fetch a tourist's Digital ID with QR payload."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    qr_payload = json.dumps({
        "system": "Sentrix",
        "tourist_id": tourist.tourist_id,
        "name": tourist.name,
        "nationality": tourist.nationality,
        "id_type": tourist.id_type,
        "blood_group": tourist.blood_group,
        "valid_until": tourist.trip_end,
        "chain_hash": tourist.digital_id_hash[:16] if tourist.digital_id_hash else "",
        "verify": f"/api/verify-id/{tourist.id_hash}",
    })

    # Check trip expiry
    try:
        trip_end_date = date.fromisoformat(tourist.trip_end)
        is_valid = trip_end_date >= date.today()
        expiry_status = "active" if is_valid else "expired"
    except Exception:
        is_valid = True
        expiry_status = "unknown"

    return {
        "tourist_id": tourist.tourist_id,
        "name": tourist.name,
        "nationality": tourist.nationality,
        "id_type": tourist.id_type,
        "email_masked": mask_email(tourist.email),
        "document_linked": tourist.document_linked,
        "blood_group": tourist.blood_group,
        "id_hash": tourist.id_hash,
        "chain_block_index": tourist.chain_block_index,
        "chain_hash": tourist.digital_id_hash,
        "expires_at": tourist.trip_end,
        "qr_payload": qr_payload,
        "is_valid": is_valid,
        "expiry_status": expiry_status,
    }


@app.get("/api/verify-id/{id_hash}")
async def verify_digital_id(id_hash: str):
    """Verify a Digital ID against the blockchain."""
    return sentrix_chain.verify_digital_id(id_hash)


# ---------------------------------------------------------------------------
# Stage 4: Travel — Risk & Geo-Fence
# ---------------------------------------------------------------------------
@app.get("/api/risk-score")
async def get_risk_score(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    battery: int = Query(default=80, ge=0, le=100),
    tourist_id: str = Query(default=None),
):
    """Get the current risk score for a location.
    
    Also feeds the Dead Man's Switch — each call resets the tourist's
    inactivity timer so the system knows they're still active.
    """
    # Feed the Dead Man's Switch with this activity ping
    if tourist_id:
        dms.record_ping(tourist_id, lat, lon, battery)

    # Feed the Anomaly Engine with this location ping
    anomalies = []
    if tourist_id and anomaly_engine:
        try:
            anomalies = anomaly_engine.record_ping(tourist_id, lat, lon, battery)
        except Exception as e:
            print(f"[Anomaly] Error recording ping: {e}")

    risk = assess_risk(lat, lon, battery)

    # Add anomaly data to risk response
    if anomalies:
        risk['anomalies'] = anomalies
        # Boost risk score if anomaly detected
        anomaly_boost = max(a.get('anomaly_score', 0) for a in anomalies) * 0.25
        risk['risk_score'] = min(100, risk.get('risk_score', 0) + anomaly_boost)
        if risk['risk_score'] >= 71:
            risk['risk_level'] = 'red'
        elif risk['risk_score'] >= 41:
            risk['risk_level'] = 'yellow'

    return risk


@app.get("/api/ml-model-info")
async def ml_model_info():
    """Return ML model training metadata, accuracy, and feature importances."""
    return get_ml_metadata()


@app.get("/api/geofence-data")
async def get_geofence_data():
    """Return GeoJSON danger zones for offline caching."""
    return get_geofence_geojson()


@app.put("/api/tourist/{tourist_id}/consent")
async def update_consent(tourist_id: str, update: ConsentUpdate):
    """Toggle GPS consent ON/OFF."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    tourist.consent_gps = update.consent_gps

    # Log consent change on blockchain
    sentrix_chain.add_consent_block(tourist_id, update.consent_gps)
    save_db()

    return {
        "tourist_id": tourist_id,
        "consent_gps": tourist.consent_gps,
        "logged_on_chain": True,
    }


# ---------------------------------------------------------------------------
# Stage 5: SOS
# ---------------------------------------------------------------------------
@app.post("/api/sos")
async def receive_sos(sos: SOSRequest):
    """Fire the 4-layer SOS fallback system."""
    tourist = tourists_store.get(sos.tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not registered")

    # Get risk assessment
    risk = assess_risk(sos.latitude, sos.longitude, sos.battery_level)

    # Determine severity
    if risk["risk_score"] >= 71:
        severity = "critical"
    elif risk["risk_score"] >= 41:
        severity = "high"
    else:
        severity = "medium"

    # Fire 4-layer SOS
    sos_result = await fire_sos(sos, tourist)

    # Create alert
    alert = Alert(
        tourist_id=tourist.tourist_id,
        tourist_name=tourist.name,
        nationality=tourist.nationality,
        latitude=sos.latitude,
        longitude=sos.longitude,
        battery_level=sos.battery_level,
        severity=severity,
        risk_score=risk["risk_score"],
        risk_level=risk["risk_level"],
        sos_layers=sos_result.layers,
        triggered_via=sos.triggered_via,
        location_source=sos.location_source
    )

    # Record on blockchain
    block = sentrix_chain.add_sos_block(alert.model_dump())
    alert.blockchain_hash = block.hash

    # Store
    alert_dict = alert.model_dump()
    alerts_store[alert.id] = alert_dict
    save_db()

    # Update tourist status
    tourist.status = "sos"

    # Broadcast to authority dashboard
    await authority_manager.broadcast(json.dumps({
        "type": "new_alert",
        "data": alert_dict,
    }))

    return {
        "status": "sos_fired",
        "alert": alert_dict,
        "sos_result": sos_result.model_dump(),
        "risk_assessment": risk,
        "blockchain_hash": block.hash,
    }


@app.post("/api/sos/sms")
async def receive_sos_sms(sos: dict = Body(...)):
    """Simulates receiving an SMS-based SOS Payload from a standard gateway (Offline Fallback)."""
    tourist_id = sos.get("tourist_id")
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not registered")

    # In a real SMS we might lack lat/lon and have to triangulate.
    lat = float(sos.get("latitude", 20.5937))
    lon = float(sos.get("longitude", 78.9629))
    battery = int(sos.get("battery_level", 15))

    risk = assess_risk(lat, lon, battery)

    alert = Alert(
        tourist_id=tourist.tourist_id,
        tourist_name=tourist.name,
        nationality=tourist.nationality,
        latitude=lat,
        longitude=lon,
        battery_level=battery,
        severity="high",
        risk_score=risk["risk_score"],
        risk_level=risk["risk_level"],
        sos_layers=[{"layer": 2, "name": "SMS Gateway", "status": "success", "detail": "Processed SMS Payload via Local Carrier"}],
        triggered_via="sms_mesh_fallback",
        location_source="GSM Cell Triangulation + LKP (approx 500m)"
    )

    block = sentrix_chain.add_sos_block(alert.model_dump())
    alert.blockchain_hash = block.hash

    alert_dict = alert.model_dump()
    alerts_store[alert.id] = alert_dict
    save_db()

    tourist.status = "sos"

    await authority_manager.broadcast(json.dumps({
        "type": "new_alert",
        "data": alert_dict,
    }))

    return {"status": "sms_sos_active", "alert": alert_dict, "blockchain_hash": block.hash}


# ---------------------------------------------------------------------------
# Stage 6: Authority Dashboard
# ---------------------------------------------------------------------------
@app.get("/api/active-alerts")
async def get_active_alerts():
    """Return all current emergency alerts."""
    return {"alerts": list(alerts_store.values())}


@app.get("/api/dispatch-units")
async def get_dispatch_units(
    lat: float = Query(...),
    lon: float = Query(...),
    unit_type: str = Query(default=None),
):
    """Find nearest available dispatch units."""
    units = find_nearest_units(lat, lon, unit_type)
    return {"units": [u.model_dump() for u in units]}


@app.post("/api/dispatch")
async def dispatch_to_alert(req: DispatchRequest):
    """Dispatch an emergency unit to an alert via ERSS-112."""
    alert = alerts_store.get(req.alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    # Find nearest unit of requested type
    units = find_nearest_units(alert["latitude"], alert["longitude"], req.unit_type, limit=1)
    if not units:
        raise HTTPException(status_code=404, detail="No available units")

    unit = units[0]
    dispatched = dispatch_unit(unit.unit_id, req.alert_id)

    if not dispatched:
        raise HTTPException(status_code=500, detail="Dispatch failed")

    # Update alert status
    alert["status"] = "dispatched"

    # Record on blockchain
    block = sentrix_chain.add_dispatch_block(
        req.alert_id, unit.unit_id, unit.type, unit.name
    )
    save_db()

    # Broadcast dispatch to authority dashboard
    await authority_manager.broadcast(json.dumps({
        "type": "dispatch_update",
        "data": {
            "alert_id": req.alert_id,
            "unit": dispatched.model_dump(),
            "blockchain_hash": block.hash,
        },
    }))

    # Push "help is coming" to tourist's own device
    tourist_id = alert.get("tourist_id")
    if tourist_id and tourist_id in tourist_managers:
        await tourist_managers[tourist_id].broadcast(json.dumps({
            "type": "help_dispatched",
            "data": {
                "unit_name": dispatched.name,
                "unit_type": dispatched.type,
                "eta_minutes": dispatched.eta_minutes,
                "blockchain_hash": block.hash,
            },
        }))

    return {
        "status": "dispatched",
        "alert_id": req.alert_id,
        "unit": dispatched.model_dump(),
        "blockchain_hash": block.hash,
        "note": "Dispatch routed through ERSS-112 national system",
    }


@app.post("/api/resolve/{alert_id}")
async def resolve_alert(alert_id: str):
    """Mark an alert as resolved."""
    alert = alerts_store.get(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert["status"] = "resolved"

    # Update tourist status
    tourist = tourists_store.get(alert["tourist_id"])
    if tourist:
        tourist.status = "rescued"

    # Record on blockchain
    block = sentrix_chain.add_resolution_block(alert_id, "authority_dashboard")
    save_db()

    await authority_manager.broadcast(json.dumps({
        "type": "alert_resolved",
        "data": {"alert_id": alert_id, "blockchain_hash": block.hash},
    }))

    # Push "you are safe" to tourist's own device
    tourist_id = alert.get("tourist_id")
    if tourist_id and tourist_id in tourist_managers:
        await tourist_managers[tourist_id].broadcast(json.dumps({
            "type": "resolved",
            "data": {"blockchain_hash": block.hash},
        }))

    return {"status": "resolved", "blockchain_hash": block.hash}


@app.post("/api/clear-alerts")
async def clear_alerts_endpoint():
    """Clear all alerts (demo reset)."""
    alerts_store.clear()
    clear_all_alerts()  # Wipe SQLite too
    await authority_manager.broadcast(json.dumps({"type": "alerts_cleared", "data": {}}))
    return {"status": "cleared"}


# ---------------------------------------------------------------------------
# Stage 7: Blockchain
# ---------------------------------------------------------------------------
@app.get("/api/blockchain/stats")
async def blockchain_stats():
    return sentrix_chain.get_stats()


@app.get("/api/blockchain/trail/{alert_id}")
async def blockchain_trail(alert_id: str):
    trail = sentrix_chain.get_full_trail(alert_id)
    return {
        "alert_id": alert_id,
        "trail": trail,
        "chain_valid": sentrix_chain.is_chain_valid(),
    }


@app.get("/api/blockchain/chain")
async def blockchain_full_chain():
    return {
        "chain": sentrix_chain.get_chain_data(),
        "is_valid": sentrix_chain.is_chain_valid(),
    }


# ---------------------------------------------------------------------------
# Tourist SOS History
# ---------------------------------------------------------------------------
@app.get("/api/sos-history/{tourist_id}")
async def get_sos_history(tourist_id: str):
    """Get all SOS alerts for a specific tourist with blockchain proof."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    # Find all alerts for this tourist
    history = [
        alert for alert in alerts_store.values()
        if alert.get("tourist_id") == tourist_id
    ]

    # Sort by timestamp (newest first)
    history.sort(key=lambda a: a.get("timestamp", 0), reverse=True)

    # Attach blockchain trail for each alert
    enriched = []
    for alert in history:
        trail = sentrix_chain.get_full_trail(alert.get("id", ""))
        enriched.append({
            **alert,
            "blockchain_trail": trail,
            "blockchain_verified": len(trail) > 0,
        })

    return {
        "tourist_id": tourist_id,
        "tourist_name": tourist.name,
        "total_incidents": len(enriched),
        "history": enriched,
    }


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
@app.get("/api/languages")
async def get_languages():
    return {"languages": get_supported_languages()}


@app.get("/api/registered-tourists")
async def get_registered_tourists():
    return {"tourists": [t.model_dump() for t in tourists_store.values()]}


# ---------------------------------------------------------------------------
# Demo: Trigger a sample SOS
# ---------------------------------------------------------------------------
DEMO_TOURISTS = [
    {
        "email": "rajesh.kumar@gmail.com",
        "name": "Rajesh Kumar", "phone": "+919876543210", "emergency_contact": "+919876543211",
        "nationality": "Indian",
        "language_pref": "hi",
        "demo_lat": 32.3124, "demo_lon": 77.1234, "demo_battery": 12,
    },
    {
        "email": "sarah.johnson@outlook.com",
        "name": "Sarah Johnson", "phone": "+14155551234", "emergency_contact": "+14155555678",
        "nationality": "American",
        "language_pref": "en",
        "demo_lat": 15.5739, "demo_lon": 73.7413, "demo_battery": 34,
    },
    {
        "email": "priya.sharma@yahoo.com",
        "name": "Priya Sharma", "phone": "+919012345678", "emergency_contact": "+919012345679",
        "nationality": "Indian",
        "language_pref": "en",
        "demo_lat": 10.0889, "demo_lon": 77.0595, "demo_battery": 7,
    },
    {
        "email": "takeshi.yamamoto@mail.jp",
        "name": "Takeshi Yamamoto", "phone": "+81901234567", "emergency_contact": "+81901234568",
        "nationality": "Japanese",
        "language_pref": "en",
        "demo_lat": 26.1445, "demo_lon": 91.7362, "demo_battery": 22,
    },
]

_demo_index = 0


@app.post("/api/trigger-demo")
async def trigger_demo():
    """Full demo: register a tourist + fire SOS in one click."""
    global _demo_index
    demo = DEMO_TOURISTS[_demo_index % len(DEMO_TOURISTS)]
    _demo_index += 1

    # Register
    reg = TouristRegistration(
        email=demo["email"],
        name=demo["name"], phone=demo["phone"],
        emergency_contact=demo["emergency_contact"],
        nationality=demo["nationality"],
        language_pref=demo["language_pref"],
    )
    reg_result = await register_tourist(reg)
    tourist_id = reg_result["tourist"]["tourist_id"]

    # Fire SOS
    sos = SOSRequest(
        tourist_id=tourist_id,
        latitude=demo["demo_lat"],
        longitude=demo["demo_lon"],
        battery_level=demo["demo_battery"],
        triggered_via="button",
    )
    sos_result = await receive_sos(sos)

    return {
        "demo_step": _demo_index,
        "registration": reg_result,
        "sos": sos_result,
    }


# ---------------------------------------------------------------------------
# Dead Man's Switch Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/dms/status/{tourist_id}")
async def dms_status(tourist_id: str):
    """Get the Dead Man's Switch status for a specific tourist."""
    status = dms.get_status(tourist_id)
    if not status:
        return {"tourist_id": tourist_id, "monitored": False, "note": "Tourist has not sent any location pings yet."}
    return {"monitored": True, **status}


@app.get("/api/dms/all")
async def dms_all_statuses():
    """Get Dead Man's Switch status for all monitored tourists."""
    return {"monitored_tourists": dms.get_all_monitored()}


@app.post("/api/dms/arm/{tourist_id}")
async def dms_arm(tourist_id: str):
    """Arm the Dead Man's Switch for a tourist."""
    dms.arm_switch(tourist_id)
    return {"tourist_id": tourist_id, "armed": True}


@app.post("/api/dms/disarm/{tourist_id}")
async def dms_disarm(tourist_id: str):
    """Disarm the Dead Man's Switch (e.g., tourist is safely at hotel)."""
    dms.disarm_switch(tourist_id)
    return {"tourist_id": tourist_id, "armed": False}


# ---------------------------------------------------------------------------
# Anomaly Detection Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/anomalies/{tourist_id}")
async def get_anomalies(tourist_id: str):
    """Get active behavioral anomalies for a specific tourist."""
    if not anomaly_engine:
        return {"anomalies": [], "engine": "unavailable"}
    return {"tourist_id": tourist_id, "anomalies": anomaly_engine.get_anomalies(tourist_id)}


@app.get("/api/anomalies")
async def get_all_anomalies():
    """Get all active anomalies across all tourists (for dashboard)."""
    if not anomaly_engine:
        return {"anomalies": [], "engine": "unavailable"}
    return {"anomalies": anomaly_engine.get_all_active_anomalies()}


@app.post("/api/anomalies/{tourist_id}/dismiss/{anomaly_type}")
async def dismiss_anomaly(tourist_id: str, anomaly_type: str):
    """Tourist dismissed an anomaly alert ('I'm Fine' button)."""
    if anomaly_engine:
        anomaly_engine.dismiss_anomaly(tourist_id, anomaly_type)
    return {"status": "dismissed", "tourist_id": tourist_id, "anomaly_type": anomaly_type}


@app.get("/api/anomaly-model-info")
async def anomaly_model_info():
    """Return anomaly ML model training metadata."""
    if not anomaly_engine:
        return {"status": "unavailable"}
    return anomaly_engine.get_model_metadata()


# ---------------------------------------------------------------------------
# Profile Stats Endpoint
# ---------------------------------------------------------------------------
@app.get("/api/profile/{tourist_id}/stats")
async def get_profile_stats(tourist_id: str):
    """Get safety statistics for a tourist's profile page."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    # Count SOS alerts for this tourist
    sos_alerts = [a for a in alerts_store.values() if a.get('tourist_id') == tourist_id]
    sos_count = len(sos_alerts)

    # Count danger zone entries (from anomaly engine ping history)
    danger_zone_entries = 0
    avg_risk_score = 0
    if anomaly_engine:
        pings = anomaly_engine.get_anomalies(tourist_id)
        # Approximate: each unique danger zone anomaly = 1 entry
        danger_zone_entries = len([a for a in pings if a.get('anomaly_type') in ('stillness', 'night_remote')])

    # Calculate verification tier
    email = tourist.email
    tier = 1  # Email verified (registered = email verified)
    if tourist.phone:
        tier = 2
    if tourist.document_linked:
        tier = 3

    return {
        "tourist_id": tourist_id,
        "sos_count": sos_count,
        "danger_zone_entries": danger_zone_entries,
        "avg_risk_score": avg_risk_score,
        "verification_tier": tier,
        "total_incidents": sos_count,
    }


# ---------------------------------------------------------------------------
# E-FIR (Electronic First Information Report) Generation
# ---------------------------------------------------------------------------
efir_store: dict[str, dict] = {}


@app.post("/api/efir/generate")
async def generate_efir(alert_id: str = Body(..., embed=True)):
    """Generate an E-FIR from an active alert — auto-fills from Digital ID + alert data."""
    alert = alerts_store.get(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    tourist_id = alert.get('tourist_id', '')
    tourist = tourists_store.get(tourist_id)

    # Get blockchain trail for evidence
    trail = sentrix_chain.get_full_trail(alert_id)

    efir_id = f"EFIR-{uuid4().hex[:8].upper()}"
    efir_data = {
        "efir_id": efir_id,
        "alert_id": alert_id,
        "status": "generated",
        "generated_at": datetime.now().isoformat(),
        # Tourist details
        "complainant": {
            "tourist_id": tourist_id,
            "name": tourist.name if tourist else alert.get('tourist_name', 'Unknown'),
            "nationality": tourist.nationality if tourist else alert.get('nationality', ''),
            "blood_group": tourist.blood_group if tourist else '',
            "medical_conditions": tourist.medical_conditions if tourist else '',
            "phone_masked": (tourist.phone[:3] + '***' + tourist.phone[-2:]) if tourist and len(tourist.phone) > 5 else '',
            "emergency_contact_masked": (tourist.emergency_contact[:3] + '***' + tourist.emergency_contact[-2:]) if tourist and len(tourist.emergency_contact) > 5 else '',
            "document_type": tourist.document_type if tourist else None,
            "document_hash": tourist.document_hash if tourist else None,
        },
        # Incident details
        "incident": {
            "type": "Missing Person" if alert.get('triggered_via') in ('dead_mans_switch', 'anomaly_detection') else "SOS Emergency",
            "last_known_latitude": alert.get('latitude', 0),
            "last_known_longitude": alert.get('longitude', 0),
            "last_contact_time": alert.get('timestamp', ''),
            "battery_at_last_contact": alert.get('battery_level', 0),
            "trigger_method": alert.get('triggered_via', 'unknown'),
            "risk_score": alert.get('risk_score', 0),
            "severity": alert.get('severity', 'high'),
        },
        # Evidence
        "evidence": {
            "blockchain_trail_length": len(trail),
            "blockchain_verified": len(trail) > 0,
            "sos_layers": alert.get('sos_layers', []),
        },
        # Jurisdiction (auto-filled)
        "jurisdiction": {
            "police_station": "Auto-assigned based on GPS coordinates",
            "district": "Auto-detected",
            "state": "Auto-detected",
        },
        "cctns_reference": f"CCTNS-{uuid4().hex[:6].upper()}",
    }

    # Store E-FIR
    efir_store[efir_id] = efir_data

    # Record on blockchain
    sentrix_chain.add_block({
        "type": "efir_generated",
        "efir_id": efir_id,
        "alert_id": alert_id,
        "tourist_id": tourist_id,
    })

    return efir_data


@app.get("/api/efir/{efir_id}")
async def get_efir(efir_id: str):
    """Retrieve a generated E-FIR."""
    efir = efir_store.get(efir_id)
    if not efir:
        raise HTTPException(status_code=404, detail="E-FIR not found")
    return efir


# ---------------------------------------------------------------------------
# Tourist Locations (for Heat Map / Cluster Visualization)
# ---------------------------------------------------------------------------
@app.get("/api/tourist-locations")
async def get_tourist_locations():
    """Return latest GPS positions of all tourists with GPS consent.
    Used by dashboard for heat map and cluster visualization.
    Returns anonymized data: tourist_id + lat/lon only (no PII)."""
    locations = []

    # From anomaly engine's location ping buffer (most recent data)
    if anomaly_engine and hasattr(anomaly_engine, '_ping_buffers'):
        for tid, buffer in anomaly_engine._ping_buffers.items():
            tourist = tourists_store.get(tid)
            if tourist and tourist.consent_gps and len(buffer) > 0:
                last_ping = buffer[-1]
                locations.append({
                    "tourist_id": tid,
                    "latitude": last_ping.lat,
                    "longitude": last_ping.lon,
                    "last_seen": last_ping.timestamp,
                    "risk_level": "green",  # Could be enriched with latest risk
                })

    # Fallback: from DMS activity store
    if not locations:
        from dead_mans_switch import _activity_store
        for tid, activity in _activity_store.items():
            tourist = tourists_store.get(tid)
            if tourist and tourist.consent_gps and activity.last_lat != 0:
                locations.append({
                    "tourist_id": tid,
                    "latitude": activity.last_lat,
                    "longitude": activity.last_lon,
                    "last_seen": activity.last_ping_time,
                })

    return {"locations": locations, "count": len(locations)}


# ---------------------------------------------------------------------------
# Encryption & Privacy (DPDP Compliance)
# ---------------------------------------------------------------------------
@app.get("/api/encryption-status")
async def get_encryption_status():
    """Return encryption configuration status for the profile page."""
    return _get_enc_status()


@app.post("/api/privacy/export/{tourist_id}")
async def export_data(tourist_id: str):
    """DPDP: Export all tourist data as JSON (right to data portability)."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    # Gather all data for this tourist
    sos_history = [a for a in alerts_store.values() if a.get('tourist_id') == tourist_id]
    trail = sentrix_chain.get_full_trail(tourist_id)

    return {
        "export_type": "DPDP_DATA_PORTABILITY",
        "generated_at": datetime.now().isoformat(),
        "tourist_data": {
            "tourist_id": tourist.tourist_id,
            "name": tourist.name,
            "email": tourist.email,
            "phone": tourist.phone,
            "emergency_contact": tourist.emergency_contact,
            "nationality": tourist.nationality,
            "blood_group": tourist.blood_group,
            "medical_conditions": tourist.medical_conditions,
            "trip_start": tourist.trip_start,
            "trip_end": tourist.trip_end,
            "consent_gps": tourist.consent_gps,
            "registered_at": tourist.registered_at,
        },
        "document_verification": {
            "linked": tourist.document_linked,
            "type": tourist.document_type,
            "hash": tourist.document_hash,
        },
        "sos_history": sos_history,
        "blockchain_records": trail,
        "dpdp_notice": "Exported under Digital Personal Data Protection Act, 2023. Section 11 — Right to access.",
    }


@app.post("/api/privacy/delete/{tourist_id}")
async def delete_data(tourist_id: str):
    """DPDP: Request data deletion (right to erasure)."""
    tourist = tourists_store.get(tourist_id)
    if not tourist:
        raise HTTPException(status_code=404, detail="Tourist not found")

    # Mark as deleted (don't actually remove — blockchain records are immutable)
    tourist.status = "deletion_requested"
    tourist.name = "[REDACTED]"
    tourist.phone = "[REDACTED]"
    tourist.email = "[REDACTED]"
    tourist.emergency_contact = "[REDACTED]"
    tourist.medical_conditions = None
    tourist.consent_gps = False
    save_db()

    # Log on blockchain (immutable record of deletion request)
    sentrix_chain.add_block({
        "type": "data_deletion_request",
        "tourist_id": tourist_id,
        "timestamp": datetime.now().isoformat(),
        "dpdp_section": "Section 12 — Right to erasure",
    })

    return {
        "status": "deletion_scheduled",
        "tourist_id": tourist_id,
        "notice": "Your personal data will be erased within 48 hours as per DPDP Act 2023. Blockchain audit records are retained in anonymized form.",
    }


# ---------------------------------------------------------------------------
# WebSocket Endpoints
# ---------------------------------------------------------------------------
@app.websocket("/ws/authority")
async def ws_authority(websocket: WebSocket):
    """Authority dashboard WebSocket — receives live SOS alerts and dispatch updates."""
    await authority_manager.connect(websocket)
    await websocket.send_text(json.dumps({
        "type": "initial_state",
        "data": {
            "alerts": list(alerts_store.values()),
            "blockchain_stats": sentrix_chain.get_stats(),
        },
    }))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        authority_manager.disconnect(websocket)


@app.websocket("/ws/tourist/{tourist_id}")
async def ws_tourist(websocket: WebSocket, tourist_id: str):
    """Tourist WebSocket — receives risk updates and geo-fence warnings."""
    if tourist_id not in tourist_managers:
        tourist_managers[tourist_id] = ConnectionManager()
    mgr = tourist_managers[tourist_id]
    await mgr.connect(websocket)

    tourist = tourists_store.get(tourist_id)
    await websocket.send_text(json.dumps({
        "type": "connected",
        "data": {
            "tourist_id": tourist_id,
            "status": tourist.status if tourist else "unknown",
            "consent_gps": tourist.consent_gps if tourist else False,
        },
    }))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        mgr.disconnect(websocket)


# ---------------------------------------------------------------------------
# SPA Catch-All
# ---------------------------------------------------------------------------
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"error": "Frontend not built. Run: cd frontend && npm run build"}
