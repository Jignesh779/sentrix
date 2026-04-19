"""
Sentrix — GeoJSON Danger Zone Data
Serves geo-fence boundaries for offline caching on tourist devices.
"""

from rule_engine import DANGER_ZONES


def get_geofence_geojson() -> dict:
    """
    Return all danger zones as a GeoJSON FeatureCollection.
    The frontend caches this for offline geo-fence checks.
    """
    features = []
    for zone in DANGER_ZONES:
        features.append({
            "type": "Feature",
            "properties": {
                "name": zone["name"],
                "zone_type": zone["type"],
                "region": zone["region"],
                "radius_km": zone["radius_km"],
                "risk_multiplier": zone["risk_multiplier"],
                "color": zone["color"],
                "active": True,
            },
            "geometry": {
                "type": "Point",
                "coordinates": [zone["center"][1], zone["center"][0]],  # GeoJSON is [lng, lat]
            },
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_zones": len(features),
            "regions": list(set(z["region"] for z in DANGER_ZONES)),
            "note": "Cache this data locally for offline geo-fence checks",
        },
    }


def get_zones_by_region(region: str) -> list[dict]:
    """Return danger zones filtered by region."""
    return [z for z in DANGER_ZONES if z["region"].lower() == region.lower()]
