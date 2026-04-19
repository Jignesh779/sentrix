"""
Sentrix — ML Risk Classifier (Phase 2)
Random Forest + Gradient Boosting ensemble trained on synthetic incident data.

Features:
  1. battery_level      (0-100)
  2. altitude_m         (0-5000)
  3. hour_ist           (0-23)
  4. weather_factor     (0.0-0.35)
  5. zone_proximity     (0.0-1.0, 0 = far, 1 = epicenter)
  6. zone_risk_mult     (1.0-1.6, max risk multiplier of nearby zones)
  7. num_nearby_zones   (0-5, how many danger zones tourist is inside)

Targets:
  - risk_score  (0-100, regression)
  - risk_level  (green / yellow / red, classification)

The model is trained once at import-time on 10,000 synthetic samples
generated from the Phase 1 rule engine logic, then used for inference.
"""

import math
import random
import logging
import numpy as np

logger = logging.getLogger("sentrix.ml")

# ---------------------------------------------------------------------------
# Feature names (must match inference order)
# ---------------------------------------------------------------------------
FEATURE_NAMES = [
    "battery_level",
    "altitude_m",
    "hour_ist",
    "weather_factor",
    "zone_proximity",
    "zone_risk_mult",
    "num_nearby_zones",
]

RISK_LABELS = ["green", "yellow", "red"]

# ---------------------------------------------------------------------------
# Synthetic Data Generator
# ---------------------------------------------------------------------------
def _generate_synthetic_dataset(n_samples: int = 10000, seed: int = 42):
    """
    Generate labelled training data from deterministic rules.
    This lets the ML model learn the rule engine's decision boundary
    and then generalize to edge cases the rules don't cover.
    """
    rng = np.random.RandomState(seed)

    X = []
    y_score = []
    y_level = []

    for _ in range(n_samples):
        battery = rng.randint(0, 101)
        altitude = rng.choice([
            rng.uniform(0, 500),       # lowland (60%)
            rng.uniform(500, 2500),     # mid-altitude (20%)
            rng.uniform(2500, 4000),    # high (12%)
            rng.uniform(4000, 5500),    # extreme (8%)
        ], p=[0.60, 0.20, 0.12, 0.08])
        hour_ist = rng.randint(0, 24)
        weather_factor = rng.choice(
            [0.0, 0.05, 0.2, 0.3, 0.35, 0.25, 0.3],
            p=[0.25, 0.20, 0.15, 0.08, 0.08, 0.10, 0.14],
        )
        zone_proximity = rng.choice([
            0.0,                         # not in any zone (55%)
            rng.uniform(0.01, 0.5),      # edge of zone (25%)
            rng.uniform(0.5, 1.0),       # deep in zone (20%)
        ], p=[0.55, 0.25, 0.20])
        zone_risk_mult = rng.uniform(1.0, 1.6) if zone_proximity > 0 else 1.0
        num_zones = 0 if zone_proximity == 0 else rng.randint(1, 4)

        # ── Compute score using REBALANCED rule engine logic ──
        score = 0.0

        # Danger Zone Proximity (0-30) — HIGHEST
        score += zone_proximity * 30

        # Apply zone risk multiplier boost for high-proximity dangerous zones
        if zone_proximity > 0.3 and zone_risk_mult > 1.3:
            score += (zone_risk_mult - 1.0) * 10  # up to ~6 extra pts

        # Altitude (0-25)
        if altitude >= 4000:
            score += 25
        elif altitude >= 3500:
            score += 20
        elif altitude >= 3000:
            score += 12
        elif altitude >= 2500:
            score += 6

        # Weather (0-20)
        score += min(weather_factor * 57.14, 20)

        # Battery (0-15) — important but NOT the top factor
        if battery <= 5:
            score += 15
        elif battery <= 15:
            score += 12
        elif battery <= 30:
            score += 8
        elif battery <= 50:
            score += 3

        # Time (0-10)
        if 10 <= hour_ist <= 15:
            time_f = 0.0
        elif 6 <= hour_ist <= 9:
            time_f = 0.1
        elif 16 <= hour_ist <= 18:
            time_f = 0.15
        elif 19 <= hour_ist <= 21:
            time_f = 0.25
        else:
            time_f = 0.35
        score += min(time_f * 28.57, 10)

        # Add realistic noise (±3 pts) to avoid overfitting to exact rules
        score += rng.normal(0, 1.5)
        score = max(0, min(100, round(score, 1)))

        # Classify
        if score >= 71:
            level = "red"
        elif score >= 41:
            level = "yellow"
        else:
            level = "green"

        X.append([battery, altitude, hour_ist, weather_factor,
                  zone_proximity, zone_risk_mult, num_zones])
        y_score.append(score)
        y_level.append(level)

    return np.array(X), np.array(y_score), np.array(y_level)


# ---------------------------------------------------------------------------
# Model Training
# ---------------------------------------------------------------------------
_classifier = None
_regressor = None
_model_metadata = {}


def _train_models():
    """Train both classifier and regressor on synthetic data."""
    global _classifier, _regressor, _model_metadata

    try:
        from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
        from sklearn.model_selection import cross_val_score
        from sklearn.preprocessing import LabelEncoder
    except ImportError:
        logger.warning(
            "scikit-learn not installed. ML model will be unavailable. "
            "Install with: pip install scikit-learn"
        )
        return False

    logger.info("Training Sentrix ML Risk Model on 10,000 synthetic samples...")

    X, y_score, y_level = _generate_synthetic_dataset(n_samples=10000)

    # ── Classification: predict risk_level (green/yellow/red) ──
    _classifier = RandomForestClassifier(
        n_estimators=150,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=3,
        class_weight="balanced",  # handle imbalanced classes
        random_state=42,
        n_jobs=-1,
    )
    _classifier.fit(X, y_level)

    # ── Regression: predict risk_score (0-100) ──
    _regressor = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        random_state=42,
    )
    _regressor.fit(X, y_score)

    # ── Model quality metrics (computed once, stored for API) ──
    clf_cv = cross_val_score(_classifier, X, y_level, cv=5, scoring="accuracy")
    reg_cv = cross_val_score(_regressor, X, y_score, cv=5, scoring="r2")

    # Feature importances
    importances = dict(zip(FEATURE_NAMES, _classifier.feature_importances_.tolist()))
    sorted_features = sorted(importances.items(), key=lambda x: x[1], reverse=True)

    _model_metadata = {
        "model_type": "Random Forest Classifier + Gradient Boosting Regressor",
        "training_samples": 10000,
        "features": FEATURE_NAMES,
        "classifier_accuracy_cv5": round(float(clf_cv.mean()), 4),
        "classifier_accuracy_std": round(float(clf_cv.std()), 4),
        "regressor_r2_cv5": round(float(reg_cv.mean()), 4),
        "regressor_r2_std": round(float(reg_cv.std()), 4),
        "feature_importances": {k: round(v, 4) for k, v in sorted_features},
        "risk_classes": RISK_LABELS,
        "n_estimators_clf": 150,
        "n_estimators_reg": 200,
    }

    logger.info(
        f"ML Model trained — "
        f"Classifier accuracy: {_model_metadata['classifier_accuracy_cv5']:.1%} "
        f"(±{_model_metadata['classifier_accuracy_std']:.1%}), "
        f"Regressor R²: {_model_metadata['regressor_r2_cv5']:.3f}"
    )
    return True


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def predict_risk(
    battery_level: int,
    altitude_m: float,
    hour_ist: int,
    weather_factor: float,
    zone_proximity: float,
    zone_risk_mult: float,
    num_nearby_zones: int,
) -> dict | None:
    """
    Predict risk level and score using the trained ML model.
    Returns None if the model is not available (scikit-learn not installed).
    """
    if _classifier is None or _regressor is None:
        return None

    features = np.array([[
        battery_level, altitude_m, hour_ist,
        weather_factor, zone_proximity, zone_risk_mult,
        num_nearby_zones,
    ]])

    # Classification
    predicted_level = _classifier.predict(features)[0]
    probabilities = _classifier.predict_proba(features)[0]
    class_labels = _classifier.classes_.tolist()
    confidence = dict(zip(class_labels, [round(p, 4) for p in probabilities]))

    # Regression
    predicted_score = float(_regressor.predict(features)[0])
    predicted_score = max(0, min(100, round(predicted_score, 1)))

    return {
        "ml_risk_score": predicted_score,
        "ml_risk_level": predicted_level,
        "ml_confidence": confidence,
        "ml_model_type": "RandomForest + GradientBoosting",
    }


def get_model_metadata() -> dict:
    """Return model training metadata for the API / dashboard."""
    if not _model_metadata:
        return {"status": "not_trained", "reason": "scikit-learn not installed or training failed"}
    return {**_model_metadata, "status": "trained"}


def is_model_available() -> bool:
    """Check if the ML model is trained and ready."""
    return _classifier is not None and _regressor is not None


# ---------------------------------------------------------------------------
# Auto-Train on Import
# ---------------------------------------------------------------------------
_train_models()
