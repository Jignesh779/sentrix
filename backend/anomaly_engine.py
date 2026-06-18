"""
Sentrix — Behavioral Anomaly Detection Engine (ML-Trained)

Detects dangerous tourist behavioral patterns using a trained ML model
(Random Forest + Gradient Boosting), NOT hardcoded thresholds.

How it works:
  1. Every location ping is stored in a per-tourist ring buffer (last 60 pings).
  2. Behavioral features are extracted from the ring buffer:
     - stillness_minutes, gps_gap_minutes, avg_speed_kmh_10min,
       speed_variance, direction_changes_10min, is_night,
       battery_drain_rate, distance_from_nearest_city_km
  3. The ML model classifies the behavior into one of:
       normal | gps_dropout | stillness | erratic_movement | night_remote
     and predicts an anomaly_score (0-100).
  4. A background monitor runs every 30 seconds to detect GPS dropouts
     (tourists who stopped pinging unexpectedly).

The model is trained once at import-time on 15,000 synthetic samples
generated from realistic behavioral distributions.
"""

import asyncio
import math
import time
import logging
import numpy as np
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from rule_engine import haversine_km

logger = logging.getLogger("sentrix.anomaly")


# ---------------------------------------------------------------------------
# Indian City Centers — used for distance-from-civilization feature
# ---------------------------------------------------------------------------
CITY_CENTERS = [
    ("Delhi", 28.6139, 77.2090),
    ("Mumbai", 19.0760, 72.8777),
    ("Bangalore", 12.9716, 77.5946),
    ("Chennai", 13.0827, 80.2707),
    ("Kolkata", 22.5726, 88.3639),
    ("Jaipur", 26.9124, 75.7873),
    ("Guwahati", 26.1445, 91.7362),
    ("Kochi", 9.9312, 76.2673),
    ("Manali", 32.2396, 77.1887),
    ("Panaji", 15.4909, 73.8278),
]


# ---------------------------------------------------------------------------
# Feature Names (must match inference order)
# ---------------------------------------------------------------------------
FEATURE_NAMES = [
    "stillness_minutes",
    "gps_gap_minutes",
    "avg_speed_kmh_10min",
    "speed_variance",
    "direction_changes_10min",
    "is_night",
    "battery_drain_rate",
    "distance_from_nearest_city_km",
]

ANOMALY_LABELS = ["normal", "gps_dropout", "stillness", "erratic_movement", "night_remote"]


# ---------------------------------------------------------------------------
# Location Ping Dataclass
# ---------------------------------------------------------------------------
@dataclass
class LocationPing:
    """A single GPS location ping from a tourist's device."""
    lat: float
    lon: float
    timestamp: float = field(default_factory=time.time)
    battery: int = 100


# ---------------------------------------------------------------------------
# Ring Buffer Store — last 60 pings per tourist
# ---------------------------------------------------------------------------
_ping_buffers: dict[str, deque] = {}

# Active anomalies per tourist: { tourist_id: { anomaly_type: anomaly_dict } }
_active_anomalies: dict[str, dict[str, dict]] = {}


def _get_buffer(tourist_id: str) -> deque:
    """Get or create the ring buffer for a tourist (maxlen=60)."""
    if tourist_id not in _ping_buffers:
        _ping_buffers[tourist_id] = deque(maxlen=60)
    return _ping_buffers[tourist_id]


# ---------------------------------------------------------------------------
# Geo Helpers
# ---------------------------------------------------------------------------
def _distance_to_nearest_city(lat: float, lon: float) -> float:
    """Haversine distance (km) to the nearest Indian city center."""
    return min(
        haversine_km(lat, lon, city_lat, city_lon)
        for _, city_lat, city_lon in CITY_CENTERS
    )


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing (degrees, 0-360) from point 1 to point 2."""
    lat1, lon1 = math.radians(lat1), math.radians(lon1)
    lat2, lon2 = math.radians(lat2), math.radians(lon2)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing_deg = math.degrees(math.atan2(x, y))
    return (bearing_deg + 360) % 360


# ---------------------------------------------------------------------------
# Feature Extraction — from the ring buffer
# ---------------------------------------------------------------------------
def _extract_features(buffer: deque, current_time: float) -> dict:
    """
    Extract 8 behavioral features from a tourist's ping history.

    Returns a dict with feature names as keys, suitable for both
    ML inference and anomaly output.
    """
    pings = list(buffer)

    # -- Default features (no history) --
    features = {
        "stillness_minutes": 0.0,
        "gps_gap_minutes": 0.0,
        "avg_speed_kmh_10min": 0.0,
        "speed_variance": 0.0,
        "direction_changes_10min": 0,
        "is_night": 0,
        "battery_drain_rate": 0.0,
        "distance_from_nearest_city_km": 0.0,
    }

    if not pings:
        return features

    latest = pings[-1]

    # ── 1. Stillness: how long within 50m of current position ──
    stillness_secs = 0.0
    for i in range(len(pings) - 2, -1, -1):
        dist_m = haversine_km(latest.lat, latest.lon, pings[i].lat, pings[i].lon) * 1000
        if dist_m <= 50:
            stillness_secs = current_time - pings[i].timestamp
        else:
            break
    features["stillness_minutes"] = round(stillness_secs / 60.0, 2)

    # ── 2. GPS gap: time since last ping ──
    features["gps_gap_minutes"] = round((current_time - latest.timestamp) / 60.0, 2)

    # ── 3 & 4. Speed stats over last 10 minutes ──
    ten_min_ago = current_time - 600
    recent = [p for p in pings if p.timestamp >= ten_min_ago]
    speeds = []
    for i in range(1, len(recent)):
        dt_hours = (recent[i].timestamp - recent[i - 1].timestamp) / 3600.0
        if dt_hours > 0:
            dist_km = haversine_km(recent[i - 1].lat, recent[i - 1].lon,
                                   recent[i].lat, recent[i].lon)
            speeds.append(dist_km / dt_hours)

    if speeds:
        features["avg_speed_kmh_10min"] = round(float(np.mean(speeds)), 2)
        features["speed_variance"] = round(float(np.var(speeds)), 2)

    # ── 5. Direction changes (>90°) in last 10 minutes ──
    direction_changes = 0
    if len(recent) >= 3:
        bearings = []
        for i in range(1, len(recent)):
            bearings.append(_bearing(recent[i - 1].lat, recent[i - 1].lon,
                                     recent[i].lat, recent[i].lon))
        for i in range(1, len(bearings)):
            diff = abs(bearings[i] - bearings[i - 1])
            if diff > 180:
                diff = 360 - diff
            if diff > 90:
                direction_changes += 1
    features["direction_changes_10min"] = direction_changes

    # ── 6. Night check (IST 23:00-05:00) ──
    now_utc = datetime.fromtimestamp(current_time, tz=timezone.utc)
    ist_hour = (now_utc.hour + 5) % 24  # UTC+5:30, simplified to +5
    features["is_night"] = 1 if (ist_hour >= 23 or ist_hour < 5) else 0

    # ── 7. Battery drain rate (% per hour, from last 5 pings) ──
    last_n = pings[-5:] if len(pings) >= 5 else pings
    if len(last_n) >= 2:
        dt_hours = (last_n[-1].timestamp - last_n[0].timestamp) / 3600.0
        if dt_hours > 0:
            battery_drop = last_n[0].battery - last_n[-1].battery
            features["battery_drain_rate"] = round(max(0.0, battery_drop / dt_hours), 2)

    # ── 8. Distance from nearest city ──
    features["distance_from_nearest_city_km"] = round(
        _distance_to_nearest_city(latest.lat, latest.lon), 2
    )

    return features


# ---------------------------------------------------------------------------
# Synthetic Data Generator — 15,000 samples
# ---------------------------------------------------------------------------
def _generate_synthetic_dataset(n_samples: int = 15000, seed: int = 42):
    """
    Generate labelled training data from realistic behavioral distributions.

    Normal patterns (70%): steady speed, regular pings, city-adjacent, daytime.
    Anomalous patterns (30%):
      - gps_dropout:       long gps_gap, was previously pinging regularly
      - stillness:         high stillness_minutes, remote area, not sleeping
      - erratic_movement:  high speed_variance, many direction_changes
      - night_remote:      is_night=1, far from city, moving
    """
    rng = np.random.RandomState(seed)

    X = []
    y_label = []
    y_score = []

    n_normal = int(n_samples * 0.70)
    n_anomaly = n_samples - n_normal
    n_per_anomaly = n_anomaly // 4
    n_leftover = n_anomaly - (n_per_anomaly * 4)

    # ── Normal samples (70%) ──
    for _ in range(n_normal):
        stillness = rng.uniform(0, 10)           # short stops are normal
        gps_gap = rng.uniform(0, 3)              # pinging regularly
        avg_speed = rng.uniform(0, 40)           # walking to driving
        speed_var = rng.uniform(0, 15)           # low variance
        dir_changes = rng.randint(0, 3)          # occasional turns
        is_night = rng.choice([0, 1], p=[0.85, 0.15])
        batt_drain = rng.uniform(0, 8)           # normal drain
        city_dist = rng.uniform(0, 50)           # mostly city-adjacent

        score = rng.uniform(0, 20)               # low anomaly score
        score += rng.normal(0, 3)
        score = max(0, min(100, round(score, 1)))

        X.append([stillness, gps_gap, avg_speed, speed_var,
                  dir_changes, is_night, batt_drain, city_dist])
        y_label.append("normal")
        y_score.append(score)

    # ── GPS Dropout samples ──
    for _ in range(n_per_anomaly):
        stillness = rng.uniform(0, 5)
        gps_gap = rng.uniform(10, 120)           # long gap — key signal
        avg_speed = rng.uniform(0, 15)           # was moving before dropout
        speed_var = rng.uniform(0, 10)
        dir_changes = rng.randint(0, 2)
        is_night = rng.choice([0, 1], p=[0.5, 0.5])
        batt_drain = rng.uniform(5, 30)          # possibly fast drain
        city_dist = rng.uniform(5, 200)          # may be remote

        score = 40 + gps_gap * 0.3 + city_dist * 0.1
        score += rng.normal(0, 5)
        score = max(30, min(100, round(score, 1)))

        X.append([stillness, gps_gap, avg_speed, speed_var,
                  dir_changes, is_night, batt_drain, city_dist])
        y_label.append("gps_dropout")
        y_score.append(score)

    # ── Stillness samples ──
    for _ in range(n_per_anomaly):
        stillness = rng.uniform(20, 180)         # very still — key signal
        gps_gap = rng.uniform(0, 5)              # still pinging
        avg_speed = rng.uniform(0, 1)            # barely moving
        speed_var = rng.uniform(0, 2)
        dir_changes = rng.randint(0, 1)
        is_night = 0                             # NOT sleeping — daytime still
        batt_drain = rng.uniform(0, 10)
        city_dist = rng.uniform(15, 200)         # remote — key signal

        score = 30 + stillness * 0.2 + city_dist * 0.1
        score += rng.normal(0, 5)
        score = max(25, min(100, round(score, 1)))

        X.append([stillness, gps_gap, avg_speed, speed_var,
                  dir_changes, is_night, batt_drain, city_dist])
        y_label.append("stillness")
        y_score.append(score)

    # ── Erratic Movement samples ──
    for _ in range(n_per_anomaly):
        stillness = rng.uniform(0, 3)
        gps_gap = rng.uniform(0, 3)
        avg_speed = rng.uniform(5, 80)           # can be high
        speed_var = rng.uniform(30, 200)         # HIGH variance — key
        dir_changes = rng.randint(5, 20)         # MANY turns — key
        is_night = rng.choice([0, 1], p=[0.6, 0.4])
        batt_drain = rng.uniform(2, 15)
        city_dist = rng.uniform(0, 100)

        score = 35 + speed_var * 0.15 + dir_changes * 1.5
        score += rng.normal(0, 5)
        score = max(30, min(100, round(score, 1)))

        X.append([stillness, gps_gap, avg_speed, speed_var,
                  dir_changes, is_night, batt_drain, city_dist])
        y_label.append("erratic_movement")
        y_score.append(score)

    # ── Night Remote samples (+ leftover) ──
    for _ in range(n_per_anomaly + n_leftover):
        stillness = rng.uniform(0, 10)
        gps_gap = rng.uniform(0, 5)
        avg_speed = rng.uniform(1, 30)           # moving at night
        speed_var = rng.uniform(0, 25)
        dir_changes = rng.randint(0, 5)
        is_night = 1                             # NIGHT — key signal
        batt_drain = rng.uniform(3, 20)
        city_dist = rng.uniform(30, 250)         # FAR from city — key

        score = 35 + city_dist * 0.12 + avg_speed * 0.3
        score += rng.normal(0, 5)
        score = max(30, min(100, round(score, 1)))

        X.append([stillness, gps_gap, avg_speed, speed_var,
                  dir_changes, is_night, batt_drain, city_dist])
        y_label.append("night_remote")
        y_score.append(score)

    return np.array(X), np.array(y_score), np.array(y_label)


# ---------------------------------------------------------------------------
# Model Training
# ---------------------------------------------------------------------------
_classifier = None
_regressor = None
_model_metadata = {}


def _train_models():
    """Train both classifier and regressor on synthetic behavioral data."""
    global _classifier, _regressor, _model_metadata

    try:
        from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
        from sklearn.model_selection import cross_val_score
    except ImportError:
        logger.warning(
            "scikit-learn not installed. Anomaly detection ML model will be unavailable. "
            "Install with: pip install scikit-learn"
        )
        return False

    logger.info("Training Sentrix Anomaly Detection Model on 15,000 synthetic samples...")

    X, y_score, y_label = _generate_synthetic_dataset(n_samples=15000)

    # ── Classification: predict anomaly type ──
    _classifier = RandomForestClassifier(
        n_estimators=200,
        max_depth=14,
        min_samples_split=5,
        min_samples_leaf=3,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    _classifier.fit(X, y_label)

    # ── Regression: predict anomaly_score (0-100) ──
    _regressor = GradientBoostingRegressor(
        n_estimators=250,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42,
    )
    _regressor.fit(X, y_score)

    # ── Model quality metrics ──
    clf_cv = cross_val_score(_classifier, X, y_label, cv=5, scoring="accuracy")
    reg_cv = cross_val_score(_regressor, X, y_score, cv=5, scoring="r2")

    importances = dict(zip(FEATURE_NAMES, _classifier.feature_importances_.tolist()))
    sorted_features = sorted(importances.items(), key=lambda x: x[1], reverse=True)

    _model_metadata = {
        "model_type": "Random Forest Classifier + Gradient Boosting Regressor",
        "purpose": "Behavioral Anomaly Detection",
        "training_samples": 15000,
        "features": FEATURE_NAMES,
        "classifier_accuracy_cv5": round(float(clf_cv.mean()), 4),
        "classifier_accuracy_std": round(float(clf_cv.std()), 4),
        "regressor_r2_cv5": round(float(reg_cv.mean()), 4),
        "regressor_r2_std": round(float(reg_cv.std()), 4),
        "feature_importances": {k: round(v, 4) for k, v in sorted_features},
        "anomaly_classes": ANOMALY_LABELS,
        "n_estimators_clf": 200,
        "n_estimators_reg": 250,
    }

    logger.info(
        f"Anomaly Model trained — "
        f"Classifier accuracy: {_model_metadata['classifier_accuracy_cv5']:.1%} "
        f"(±{_model_metadata['classifier_accuracy_std']:.1%}), "
        f"Regressor R²: {_model_metadata['regressor_r2_cv5']:.3f}"
    )
    return True


# ---------------------------------------------------------------------------
# ML Inference
# ---------------------------------------------------------------------------
def _predict_anomaly(features: dict) -> Optional[dict]:
    """
    Run ML prediction on a feature vector.
    Returns None if the model is not available.
    """
    if _classifier is None or _regressor is None:
        return None

    feature_vec = np.array([[features[f] for f in FEATURE_NAMES]])

    # Classification
    predicted_label = _classifier.predict(feature_vec)[0]
    probabilities = _classifier.predict_proba(feature_vec)[0]
    class_labels = _classifier.classes_.tolist()
    confidence = dict(zip(class_labels, [round(float(p), 4) for p in probabilities]))

    # Regression
    anomaly_score = float(_regressor.predict(feature_vec)[0])
    anomaly_score = max(0, min(100, round(anomaly_score, 1)))

    return {
        "anomaly_type": predicted_label,
        "anomaly_score": anomaly_score,
        "confidence": confidence,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def record_ping(tourist_id: str, lat: float, lon: float, battery: int) -> list[dict]:
    """
    Record a location ping, run ML prediction, return list of anomalies (if any).

    This is the main entry point — called from location-update endpoints.
    The ping is stored in the ring buffer, features are extracted, and the
    ML model classifies the tourist's current behavioral pattern.

    Returns:
        list[dict]: Detected anomalies (empty list if behavior is normal).
    """
    buffer = _get_buffer(tourist_id)
    buffer.append(LocationPing(lat=lat, lon=lon, battery=battery))

    now = time.time()
    features = _extract_features(buffer, now)
    prediction = _predict_anomaly(features)

    if prediction is None:
        return []

    # Only flag non-normal predictions
    if prediction["anomaly_type"] == "normal":
        # Clear any previous anomalies of same type if tourist is back to normal
        if tourist_id in _active_anomalies:
            # Keep dismissed anomalies, remove undismissed ones that resolved
            resolved = [
                atype for atype, adict in _active_anomalies[tourist_id].items()
                if not adict.get("dismissed", False)
            ]
            for atype in resolved:
                _active_anomalies[tourist_id].pop(atype, None)
        return []

    anomaly = {
        "tourist_id": tourist_id,
        "anomaly_type": prediction["anomaly_type"],
        "anomaly_score": prediction["anomaly_score"],
        "confidence": prediction["confidence"],
        "features": features,
        "detected_at": now,
        "dismissed": False,
    }

    # Store / update active anomaly
    if tourist_id not in _active_anomalies:
        _active_anomalies[tourist_id] = {}
    _active_anomalies[tourist_id][prediction["anomaly_type"]] = anomaly

    return [anomaly]


def check_dropouts() -> list[dict]:
    """
    Background check: scan all tourists for GPS dropout.

    Called from the background monitor task. Identifies tourists whose
    last ping was suspiciously long ago, runs ML prediction with the
    current gps_gap_minutes, and returns detected dropouts.

    Returns:
        list[dict]: List of GPS dropout anomalies detected.
    """
    now = time.time()
    dropouts = []

    for tourist_id, buffer in list(_ping_buffers.items()):
        if not buffer:
            continue

        # Skip if already dismissed or already flagged
        existing = _active_anomalies.get(tourist_id, {}).get("gps_dropout")
        if existing and (existing.get("dismissed") or
                         now - existing.get("detected_at", 0) < 60):
            continue

        features = _extract_features(buffer, now)

        # Only flag if gap is significant (>5 min) and had previous pings
        if features["gps_gap_minutes"] < 5 or len(buffer) < 3:
            continue

        prediction = _predict_anomaly(features)
        if prediction is None:
            continue

        if prediction["anomaly_type"] == "gps_dropout":
            anomaly = {
                "tourist_id": tourist_id,
                "anomaly_type": "gps_dropout",
                "anomaly_score": prediction["anomaly_score"],
                "confidence": prediction["confidence"],
                "features": features,
                "detected_at": now,
                "dismissed": False,
            }
            if tourist_id not in _active_anomalies:
                _active_anomalies[tourist_id] = {}
            _active_anomalies[tourist_id]["gps_dropout"] = anomaly
            dropouts.append(anomaly)

    return dropouts


def get_anomalies(tourist_id: str) -> list[dict]:
    """Get active anomalies for a tourist."""
    anomalies = _active_anomalies.get(tourist_id, {})
    return list(anomalies.values())


def get_all_active_anomalies() -> list[dict]:
    """Get all active anomalies across all tourists."""
    result = []
    for tourist_id in _active_anomalies:
        result.extend(_active_anomalies[tourist_id].values())
    return result


def dismiss_anomaly(tourist_id: str, anomaly_type: str):
    """
    Tourist dismissed the anomaly ("I'm fine").

    Marks the anomaly as dismissed so it won't trigger re-alerts,
    but keeps it in history for the current session.
    """
    anomalies = _active_anomalies.get(tourist_id, {})
    if anomaly_type in anomalies:
        anomalies[anomaly_type]["dismissed"] = True
        logger.info(f"Anomaly dismissed: {tourist_id} / {anomaly_type}")


def get_model_metadata() -> dict:
    """Return model training metadata for the API / dashboard."""
    if not _model_metadata:
        return {"status": "not_trained", "reason": "scikit-learn not installed or training failed"}
    return {**_model_metadata, "status": "trained"}


def is_model_available() -> bool:
    """Check if the anomaly ML model is trained and ready."""
    return _classifier is not None and _regressor is not None


# ---------------------------------------------------------------------------
# Background Monitor — GPS Dropout Scanner
# ---------------------------------------------------------------------------
_dropout_callback = None


def set_callback(callback):
    """Register the async callback for auto-alerts on anomaly detection.
    
    The callback receives a single anomaly dict as its argument.
    Called once at startup from main.py.
    """
    global _dropout_callback
    _dropout_callback = callback


_monitor_task: Optional[asyncio.Task] = None

CHECK_INTERVAL_SECONDS = 30  # How often the background loop runs


async def _monitor_loop():
    """Background task: scans all tourists for GPS dropouts every 30 seconds."""
    print(f"[ANOMALY] Behavioral anomaly monitor started (interval: {CHECK_INTERVAL_SECONDS}s)")

    while True:
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)

        try:
            dropouts = check_dropouts()
            for anomaly in dropouts:
                tid = anomaly["tourist_id"]
                score = anomaly["anomaly_score"]
                gap = anomaly["features"]["gps_gap_minutes"]

                print(f"[ANOMALY] ⚠️ GPS DROPOUT detected for {tid}")
                print(f"[ANOMALY]    Gap: {gap:.1f}min, Score: {score}, "
                      f"Confidence: {anomaly['confidence'].get('gps_dropout', 0):.0%}")

                if _dropout_callback:
                    try:
                        await _dropout_callback(anomaly)
                        print(f"[ANOMALY] ✅ Auto-alert delivered for {tid}")
                    except Exception as e:
                        print(f"[ANOMALY] ❌ Auto-alert failed for {tid}: {e}")
        except Exception as e:
            logger.error(f"Anomaly monitor error: {e}")


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
        print("[ANOMALY] Monitor stopped.")


# ---------------------------------------------------------------------------
# Auto-Train on Import
# ---------------------------------------------------------------------------
_train_models()
