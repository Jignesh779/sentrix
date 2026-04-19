"""
Sentrix — Multilingual Warning Messages
Supports English (en), Hindi (hi), Tamil (ta).
"""

WARNINGS = {
    "geo_fence_enter": {
        "en": "⚠️ You are entering {zone_name} ({zone_type}). Risk level: {level}. Please exercise caution.",
        "hi": "⚠️ आप {zone_name} ({zone_type}) में प्रवेश कर रहे हैं। जोखिम स्तर: {level}। कृपया सावधानी बरतें।",
        "ta": "⚠️ நீங்கள் {zone_name} ({zone_type}) பகுதிக்குள் நுழைகிறீர்கள். ஆபத்து நிலை: {level}. தயவுசெய்து எச்சரிக்கையாக இருங்கள்.",
    },
    "risk_yellow": {
        "en": "⚠️ Moderate risk detected. Stay alert and keep your phone charged.",
        "hi": "⚠️ मध्यम जोखिम का पता चला है। सतर्क रहें और अपना फोन चार्ज रखें।",
        "ta": "⚠️ மிதமான ஆபத்து கண்டறியப்பட்டது. விழிப்புடன் இருக்கவும், தொலைபேசியை சார்ஜ் செய்யவும்.",
    },
    "risk_red": {
        "en": "🚨 HIGH RISK! Authorities have been automatically alerted. Stay where you are if safe.",
        "hi": "🚨 उच्च जोखिम! अधिकारियों को स्वचालित रूप से सतर्क किया गया है। यदि सुरक्षित हैं तो जहां हैं वहीं रहें।",
        "ta": "🚨 அதிக ஆபத்து! அதிகாரிகளுக்கு தானாகவே எச்சரிக்கை அனுப்பப்பட்டுள்ளது. பாதுகாப்பாக இருந்தால் அங்கேயே இருங்கள்.",
    },
    "sos_sent": {
        "en": "✅ Your SOS has been sent. Help is on the way. Stay calm.",
        "hi": "✅ आपका SOS भेज दिया गया है। मदद आ रही है। शांत रहें।",
        "ta": "✅ உங்கள் SOS அனுப்பப்பட்டது. உதவி வருகிறது. அமைதியாக இருங்கள்.",
    },
    "sos_layer_success": {
        "en": "Alert delivered via at least 1 channel. You are not alone.",
        "hi": "कम से कम 1 चैनल के माध्यम से अलर्ट पहुंचाया गया।  आप अकेले नहीं हैं।",
        "ta": "குறைந்தது 1 சேனல் வழியாக எச்சரிக்கை அனுப்பப்பட்டது. நீங்கள் தனியாக இல்லை.",
    },
    "battery_warning": {
        "en": "🔋 Battery low ({level}%). Keep your phone on to stay reachable.",
        "hi": "🔋 बैटरी कम ({level}%)। संपर्क में रहने के लिए फोन चालू रखें।",
        "ta": "🔋 பேட்டரி குறைவு ({level}%). தொடர்பில் இருக்க தொலைபேசியை ஆன் செய்யவும்.",
    },
    "consent_on": {
        "en": "📍 GPS tracking is ON. Your location is shared for safety.",
        "hi": "📍 GPS ट्रैकिंग चालू है। आपकी सुरक्षा के लिए स्थान साझा किया जा रहा है।",
        "ta": "📍 GPS கண்காணிப்பு இயக்கத்தில் உள்ளது. உங்கள் பாதுகாப்பிற்காக இருப்பிடம் பகிரப்படுகிறது.",
    },
    "consent_off": {
        "en": "📍 GPS tracking is OFF. Turn it on for safety alerts.",
        "hi": "📍 GPS ट्रैकिंग बंद है। सुरक्षा अलर्ट के लिए इसे चालू करें।",
        "ta": "📍 GPS கண்காணிப்பு முடக்கப்பட்டுள்ளது. பாதுகாப்பு எச்சரிக்கைகளுக்கு இயக்கவும்.",
    },
}


# Zone type translations
ZONE_TYPES = {
    "avalanche": {"en": "Avalanche Zone", "hi": "हिमस्खलन क्षेत्र", "ta": "பனிச்சரிவு மண்டலம்"},
    "glacier": {"en": "Glacier Zone", "hi": "हिमनद क्षेत्र", "ta": "பனிப்பாறை மண்டலம்"},
    "steep_terrain": {"en": "Steep Terrain", "hi": "खड़ी भूभाग", "ta": "செங்குத்தான நிலப்பரப்பு"},
    "river_crossing": {"en": "River Crossing", "hi": "नदी पार", "ta": "ஆற்றுக் கடப்பு"},
    "flood_zone": {"en": "Flood Zone", "hi": "बाढ़ क्षेत्र", "ta": "வெள்ள மண்டலம்"},
    "landslide": {"en": "Landslide Zone", "hi": "भूस्खलन क्षेत्र", "ta": "நிலச்சரிவு மண்டலம்"},
    "coastal_hazard": {"en": "Coastal Hazard", "hi": "तटीय खतरा", "ta": "கடலோர ஆபத்து"},
    "waterfall": {"en": "Waterfall Area", "hi": "जलप्रपात क्षेत्र", "ta": "அருவி பகுதி"},
    "heat_zone": {"en": "Extreme Heat Zone", "hi": "अत्यधिक गर्मी क्षेत्र", "ta": "கடும் வெப்ப மண்டலம்"},
    "dense_forest": {"en": "Dense Forest", "hi": "घना जंगल", "ta": "அடர்ந்த காடு"},
}


def get_warning(key: str, lang: str = "en", **kwargs) -> str:
    """Get a translated warning message with variable substitution."""
    template = WARNINGS.get(key, {}).get(lang, WARNINGS.get(key, {}).get("en", ""))
    try:
        return template.format(**kwargs)
    except KeyError:
        return template


def get_zone_type_label(zone_type: str, lang: str = "en") -> str:
    """Get translated zone type label."""
    return ZONE_TYPES.get(zone_type, {}).get(lang, zone_type)


def get_supported_languages() -> list[dict]:
    """Return list of supported languages."""
    return [
        {"code": "en", "name": "English", "native": "English"},
        {"code": "hi", "name": "Hindi", "native": "हिंदी"},
        {"code": "ta", "name": "Tamil", "native": "தமிழ்"},
    ]
