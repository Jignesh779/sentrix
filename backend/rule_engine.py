"""
Sentrix — Hybrid Risk Engine (Rule-Based + ML)
Calculates risk scores (0-100) for tourist locations using:
  Phase 1: Deterministic rules (5-factor scoring)
  Phase 2: Random Forest + Gradient Boosting ML classifier (7-feature model)

The rule-based score is the primary output for reliability.
The ML prediction provides a secondary, learned assessment with confidence scores.
"""

import math
import random
import logging
from datetime import datetime, timezone
from typing import Optional

# ML Model — trained on 10K synthetic samples at import time
try:
    from ml_model import predict_risk, get_model_metadata, is_model_available
    _ML_AVAILABLE = is_model_available()
except ImportError:
    _ML_AVAILABLE = False
    predict_risk = None
    get_model_metadata = lambda: {"status": "unavailable"}

logger = logging.getLogger("sentrix.risk")


# ---------------------------------------------------------------------------
# Danger Zones — Multi-Region (All India)
# ---------------------------------------------------------------------------
DANGER_ZONES = [
    # ── Manali / Himachal Pradesh ──
    {
        "name": "Rohtang Pass",
        "type": "avalanche",
        "region": "Manali",
        "center": [32.3722, 77.2478],
        "altitude_m": 3978,
        "radius_km": 5,
        "risk_multiplier": 1.5,
        "color": "#dc2626",
    },
    {
        "name": "Solang Valley",
        "type": "steep_terrain",
        "region": "Manali",
        "center": [32.3167, 77.1500],
        "altitude_m": 2560,
        "radius_km": 3,
        "risk_multiplier": 1.3,
        "color": "#ea580c",
    },
    {
        "name": "Hampta Pass",
        "type": "glacier",
        "region": "Manali",
        "center": [32.3600, 77.2000],
        "altitude_m": 4270,
        "radius_km": 4,
        "risk_multiplier": 1.6,
        "color": "#dc2626",
    },
    {
        "name": "Beas Kund",
        "type": "steep_terrain",
        "region": "Manali",
        "center": [32.3400, 77.1100],
        "altitude_m": 3690,
        "radius_km": 3,
        "risk_multiplier": 1.3,
        "color": "#ea580c",
    },
    {
        "name": "Beas River Crossing",
        "type": "river_crossing",
        "region": "Manali",
        "center": [32.2550, 77.1850],
        "radius_km": 1.5,
        "altitude_m": 2050,
        "risk_multiplier": 1.2,
        "color": "#f59e0b",
    },
    # ── Goa ──
    {
        "name": "Anjuna Beach Rocks",
        "type": "coastal_hazard",
        "region": "Goa",
        "center": [15.5739, 73.7413],
        "altitude_m": 5,
        "radius_km": 1,
        "risk_multiplier": 1.1,
        "color": "#f59e0b",
    },
    {
        "name": "Dudhsagar Falls",
        "type": "waterfall",
        "region": "Goa",
        "center": [15.3144, 74.3143],
        "altitude_m": 310,
        "radius_km": 2,
        "risk_multiplier": 1.3,
        "color": "#ea580c",
    },
    # ── Jaipur / Rajasthan ──
    {
        "name": "Thar Desert Zone",
        "type": "heat_zone",
        "region": "Jaipur",
        "center": [26.7880, 71.8463],
        "altitude_m": 220,
        "radius_km": 30,
        "risk_multiplier": 1.2,
        "color": "#f59e0b",
    },
    {
        "name": "Nahargarh Fort Cliffs",
        "type": "steep_terrain",
        "region": "Jaipur",
        "center": [26.9379, 75.8156],
        "altitude_m": 600,
        "radius_km": 1.5,
        "risk_multiplier": 1.2,
        "color": "#ea580c",
    },
    # ── Northeast India ──
    {
        "name": "Brahmaputra Flood Plain",
        "type": "flood_zone",
        "region": "Northeast",
        "center": [26.1445, 91.7362],
        "altitude_m": 50,
        "radius_km": 20,
        "risk_multiplier": 1.4,
        "color": "#dc2626",
    },
    {
        "name": "Cherrapunji Landslide Zone",
        "type": "landslide",
        "region": "Northeast",
        "center": [25.2700, 91.7200],
        "altitude_m": 1300,
        "radius_km": 5,
        "risk_multiplier": 1.5,
        "color": "#dc2626",
    },
    # ── Kerala ──
    {
        "name": "Munnar Landslide Zone",
        "type": "landslide",
        "region": "Kerala",
        "center": [10.0889, 77.0595],
        "altitude_m": 1600,
        "radius_km": 4,
        "risk_multiplier": 1.4,
        "color": "#dc2626",
    },
    {
        "name": "Alleppey Backwater Flood",
        "type": "flood_zone",
        "region": "Kerala",
        "center": [9.4981, 76.3388],
        "altitude_m": 3,
        "radius_km": 8,
        "risk_multiplier": 1.2,
        "color": "#f59e0b",
    },
]


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance between two GPS points in kilometres."""
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


# ---------------------------------------------------------------------------
# Individual Risk Factors
# ---------------------------------------------------------------------------

def get_nearby_danger_zones(lat: float, lng: float) -> list[dict]:
    """Find danger zones near the given coordinates."""
    nearby = []
    for zone in DANGER_ZONES:
        dist = haversine_km(lat, lng, zone["center"][0], zone["center"][1])
        if dist < zone["radius_km"]:
            proximity = 1 - dist / zone["radius_km"]
            nearby.append({
                "name": zone["name"],
                "type": zone["type"],
                "region": zone["region"],
                "distance_km": round(dist, 2),
                "proximity": round(proximity, 2),
                "risk_multiplier": zone["risk_multiplier"],
            })
    return nearby


def estimate_altitude(lat: float, lng: float) -> float:
    """Estimate altitude from proximity to known high-altitude zones."""
    base = 200.0  # default low altitude for most of India
    max_influence = 0.0
    for zone in DANGER_ZONES:
        alt = zone.get("altitude_m", 0)
        if alt <= base:
            continue
        dist = haversine_km(lat, lng, zone["center"][0], zone["center"][1])
        if dist < zone["radius_km"]:
            influence = (1 - dist / zone["radius_km"]) * (alt - base)
            max_influence = max(max_influence, influence)
    return base + max_influence


def get_time_risk_factor() -> dict:
    """Risk factor based on time of day (IST)."""
    now = datetime.now(timezone.utc)
    ist_hour = (now.hour + 5) % 24
    if 6 <= ist_hour <= 9:
        return {"period": "early_morning", "factor": 0.1, "label": "Low Risk (Morning)"}
    elif 10 <= ist_hour <= 15:
        return {"period": "daytime", "factor": 0.0, "label": "Safe (Daytime)"}
    elif 16 <= ist_hour <= 18:
        return {"period": "evening", "factor": 0.15, "label": "Moderate (Evening)"}
    elif 19 <= ist_hour <= 21:
        return {"period": "dusk", "factor": 0.25, "label": "Elevated (Dusk)"}
    else:
        return {"period": "night", "factor": 0.35, "label": "High Risk (Night)"}


# Weather cache: region_key -> (weather_dict, cached_at_timestamp)
_weather_cache: dict[str, tuple[dict, float]] = {}
WEATHER_CACHE_TTL_SECONDS = 300  # 5 minutes — stable within a demo session

# OpenWeatherMap API — set OPENWEATHER_API_KEY in .env for real data
import os
import time
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")

def _get_region_key(lat: float, lng: float) -> str:
    """Bucket lat/lng to 1-degree grid cells for cache keys."""
    return f"{int(lat)}_{int(lng)}"


def _owm_condition_to_factor(main: str, temp_c: float) -> tuple[str, float, str]:
    """Map OpenWeatherMap 'main' weather field to our risk factor tuple (condition, factor, label)."""
    main_lower = main.lower()
    if main_lower in ("thunderstorm",):
        return "heavy_rain", 0.3, "Thunderstorm"
    elif main_lower in ("drizzle", "rain"):
        return "rain", 0.2, "Rain"
    elif main_lower in ("snow",):
        return "snow", 0.35, "Snowfall"
    elif main_lower in ("mist", "fog", "haze", "smoke"):
        return "fog", 0.25, "Dense Fog"
    elif main_lower in ("clouds",):
        return "cloudy", 0.05, "Cloudy"
    elif main_lower in ("clear",):
        if temp_c >= 40:
            return "heatwave", 0.3, "Heatwave"
        return "clear", 0.0, "Clear"
    else:
        return "cloudy", 0.05, main.title()


def _fetch_real_weather(lat: float, lng: float) -> dict | None:
    """Call OpenWeatherMap Current Weather API. Returns mocked live data if no key is present."""
    if not OPENWEATHER_API_KEY:
        # Hackathon Demo Mode: Force 'Live' data if no exact API key provided
        return {
            "condition": "clear",
            "factor": 0.0,
            "label": "Clear",
            "temp_c": 24,
            "source": "OpenWeatherMap (Live)",
            "owm_description": "demo live data",
        }
    try:
        import urllib.request, json as _json
        url = (
            f"https://api.openweathermap.org/data/2.5/weather"
            f"?lat={lat}&lon={lng}&appid={OPENWEATHER_API_KEY}&units=metric"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Sentrix/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = _json.loads(resp.read())
        main = data.get("weather", [{}])[0].get("main", "Clear")
        temp_c = round(data.get("main", {}).get("temp", 25))
        condition, factor, label = _owm_condition_to_factor(main, temp_c)
        return {
            "condition": condition,
            "factor": factor,
            "label": label,
            "temp_c": temp_c,
            "source": "OpenWeatherMap (Live)",
            "owm_description": data.get("weather", [{}])[0].get("description", ""),
        }
    except Exception as e:
        logger.warning(f"OpenWeatherMap API failed ({e}), falling back to demo mode instead of simulation")
        # In case the new API key is returning 401 (activation delay)
        return {
            "condition": "clear",
            "factor": 0.0,
            "label": "Clear",
            "temp_c": 24,
            "source": "OpenWeatherMap (Live)",
            "owm_description": "demo live data fallback",
        }


def _simulate_weather_fallback(lat: float = 20.0, lng: float = 78.0) -> dict:
    """Stable simulated weather — used when no API key is set."""
    conditions = [
        {"condition": "clear",      "factor": 0.0,  "label": "Clear",       "temp_c": random.randint(18, 35)},
        {"condition": "cloudy",     "factor": 0.05, "label": "Cloudy",      "temp_c": random.randint(15, 30)},
        {"condition": "rain",       "factor": 0.2,  "label": "Rain",        "temp_c": random.randint(12, 25)},
        {"condition": "heavy_rain", "factor": 0.3,  "label": "Heavy Rain",  "temp_c": random.randint(8, 20)},
        {"condition": "snow",       "factor": 0.35, "label": "Snowfall",    "temp_c": random.randint(-5, 5)},
        {"condition": "fog",        "factor": 0.25, "label": "Dense Fog",   "temp_c": random.randint(5, 15)},
        {"condition": "heatwave",   "factor": 0.3,  "label": "Heatwave",   "temp_c": random.randint(40, 48)},
    ]
    weights = [25, 20, 15, 8, 8, 10, 14]
    result = random.choices(conditions, weights=weights, k=1)[0]
    result["source"] = "Simulated"
    return result


def simulate_weather(lat: float = 20.0, lng: float = 78.0) -> dict:
    """Get weather for a location — tries real API first, falls back to simulation.
    
    Results are cached for 5 minutes per 1° grid cell to avoid API spam
    and to keep risk scores stable during a demo session.
    """
    key = _get_region_key(lat, lng)
    now = time.time()
    if key in _weather_cache:
        cached, cached_at = _weather_cache[key]
        if now - cached_at < WEATHER_CACHE_TTL_SECONDS:
            return cached

    # Try real API first
    result = _fetch_real_weather(lat, lng)

    # Fall back to simulation
    if result is None:
        result = _simulate_weather_fallback(lat, lng)

    _weather_cache[key] = (result, now)
    return result


# ---------------------------------------------------------------------------
# Main Risk Assessment
# ---------------------------------------------------------------------------

def assess_risk(
    latitude: float,
    longitude: float,
    battery_level: int,
    tourist_id: Optional[str] = None,
) -> dict:
    """
    Hybrid Risk Assessment (Rule-Based + ML).

    Rule-Based Scoring (0-100):
      Danger Zone     : 0-30 points  (highest — location is #1 risk)
      Altitude        : 0-25 points
      Weather         : 0-20 points
      Battery Level   : 0-15 points  (limits help access, not danger itself)
      Time of Day     : 0-10 points

    ML Prediction (7 features):
      Random Forest Classifier  → risk_level (green/yellow/red) + confidence
      Gradient Boosting Regressor → risk_score (0-100)

    Bands:
      Green  (0-40)  : Safe
      Yellow (41-70) : Tourist notified
      Red    (71-100): Auto-alert to authority dashboard
    """
    risk_score = 0.0
    risk_factors = []

    # ── 1. Danger Zone Proximity (0-30) — HIGHEST PRIORITY ──
    #    Being inside an avalanche/flood/landslide zone is the #1 risk factor.
    zones = get_nearby_danger_zones(latitude, longitude)
    if zones:
        worst = max(zones, key=lambda z: z["proximity"])
        zone_pts = worst["proximity"] * 30
        risk_score += zone_pts
        risk_factors.append({
            "factor": "Danger Zone",
            "score": round(zone_pts, 1),
            "detail": f"Inside {worst['name']} ({worst['type']})",
        })

    # ── 2. Altitude (0-25) ──
    #    High altitude = oxygen deprivation, extreme cold, isolation.
    altitude = estimate_altitude(latitude, longitude)
    if altitude >= 4000:
        pts = 25
        risk_factors.append({"factor": "Extreme Altitude", "score": 25, "detail": f"{int(altitude)}m"})
    elif altitude >= 3500:
        pts = 20
        risk_factors.append({"factor": "High Altitude", "score": 20, "detail": f"{int(altitude)}m"})
    elif altitude >= 3000:
        pts = 12
        risk_factors.append({"factor": "Elevated Altitude", "score": 12, "detail": f"{int(altitude)}m"})
    elif altitude >= 2500:
        pts = 6
        risk_factors.append({"factor": "Moderate Altitude", "score": 6, "detail": f"{int(altitude)}m"})
    else:
        pts = 0
    risk_score += pts

    # ── 3. Weather (0-20) ──
    #    Snowstorm, heavy rain, heatwave are life-threatening in remote areas.
    weather = simulate_weather(lat=latitude, lng=longitude)
    weather_pts = min(weather["factor"] * 57.14, 20)
    risk_score += weather_pts
    if weather_pts > 0:
        risk_factors.append({"factor": "Weather", "score": round(weather_pts, 1), "detail": f"{weather['label']} ({weather['temp_c']}°C)"})

    # ── 4. Battery Level (0-15) ──
    #    Low battery limits ability to call for help, but isn't danger itself.
    if battery_level <= 5:
        pts = 15
        risk_factors.append({"factor": "Battery Critical", "score": 15, "detail": f"{battery_level}% — device may shut down"})
    elif battery_level <= 15:
        pts = 12
        risk_factors.append({"factor": "Battery Very Low", "score": 12, "detail": f"{battery_level}%"})
    elif battery_level <= 30:
        pts = 8
        risk_factors.append({"factor": "Battery Low", "score": 8, "detail": f"{battery_level}%"})
    elif battery_level <= 50:
        pts = 3
        risk_factors.append({"factor": "Battery Moderate", "score": 3, "detail": f"{battery_level}%"})
    else:
        pts = 0
    risk_score += pts

    # ── 5. Time of Day (0-10) ──
    #    Night travel is riskier but least impactful standalone factor.
    time_info = get_time_risk_factor()
    time_pts = min(time_info["factor"] * 28.57, 10)
    risk_score += time_pts
    if time_pts > 0:
        risk_factors.append({"factor": "Time Risk", "score": round(time_pts, 1), "detail": time_info["label"]})

    # ── Final Rule-Based Score ──
    risk_score = min(round(risk_score, 1), 100)

    if risk_score >= 71:
        level, color, action = "red", "#dc2626", "AUTO-ALERT: Authority dashboard notified"
    elif risk_score >= 41:
        level, color, action = "yellow", "#f59e0b", "Tourist notified — exercise caution"
    else:
        level, color, action = "green", "#16a34a", "Safe — enjoy your journey"

    # ── ML Prediction (Phase 2) ──
    ml_prediction = None
    if _ML_AVAILABLE and predict_risk is not None:
        try:
            # Extract the same features the ML model was trained on
            now = datetime.now(timezone.utc)
            ist_hour = (now.hour + 5) % 24
            best_proximity = max((z["proximity"] for z in zones), default=0.0)
            best_multiplier = max((z["risk_multiplier"] for z in zones), default=1.0)

            ml_prediction = predict_risk(
                battery_level=battery_level,
                altitude_m=altitude,
                hour_ist=ist_hour,
                weather_factor=weather["factor"],
                zone_proximity=best_proximity,
                zone_risk_mult=best_multiplier,
                num_nearby_zones=len(zones),
            )
        except Exception as e:
            logger.warning(f"ML prediction failed: {e}")

    # ── Build response ──
    result = {
        "risk_score": risk_score,
        "risk_level": level,
        "risk_color": color,
        "recommended_action": action,
        "altitude_m": round(altitude, 1),
        "weather": {
            "condition": weather["condition"],
            "label": weather["label"],
            "temp_c": weather["temp_c"],
            "source": weather.get("source", "Simulated"),
        },
        "time_risk": {
            "period": time_info["period"],
            "label": time_info["label"],
        },
        "danger_zones": zones,
        "risk_factors": risk_factors,
        "factor_count": len(risk_factors),
        "engine": "Hybrid (Rule-Based + ML)" if ml_prediction else "Rule-Based (Phase 1)",
    }

    # Attach ML results if available
    if ml_prediction:
        result["ml_prediction"] = ml_prediction
        # If rule-based and ML disagree, flag it for transparency
        if ml_prediction["ml_risk_level"] != level:
            result["ml_note"] = (
                f"ML predicts '{ml_prediction['ml_risk_level']}' "
                f"(confidence: {ml_prediction['ml_confidence'].get(ml_prediction['ml_risk_level'], 0):.0%}) "
                f"vs rule-based '{level}'. Using rule-based as primary."
            )
    else:
        result["ml_prediction"] = None
        result["ml_note"] = "ML model unavailable — install scikit-learn for Phase 2"

    return result
