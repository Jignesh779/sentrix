# 🛡️ Sentrix — AI-Powered Tourist Safety & Incident Response Platform

> **Smart India Hackathon 2025 · Problem Statement SIH25002 · Theme: Travel & Tourism**

[![Sentrix](https://img.shields.io/badge/Sentrix-v1.0-047857?style=for-the-badge&labelColor=0f172a)](https://sentrix-frontend.onrender.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://sentrix-backend-qvv8.onrender.com)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://sentrix-frontend.onrender.com)
[![Blockchain](https://img.shields.io/badge/SHA--256_Blockchain-Secured-7c3aed?style=for-the-badge)](https://sentrix-frontend.onrender.com/dashboard)
[![ERSS-112](https://img.shields.io/badge/ERSS--112-Integrated-dc2626?style=for-the-badge)](https://sentrix-backend-qvv8.onrender.com/docs)

---

## 🌐 Live Deployment

| Platform | URL | Description |
|----------|-----|-------------|
| 🌍 **Tourist App** | **[sentrix-frontend.onrender.com](https://sentrix-frontend.onrender.com)** | Register → Get Digital ID → Start Journey → SOS |
| 🛡️ **Command Center** | **[sentrix-frontend.onrender.com/dashboard](https://sentrix-frontend.onrender.com/dashboard)** | Authority dashboard with live alerts & dispatch |
| ⚙️ **API Server** | **[sentrix-backend-qvv8.onrender.com](https://sentrix-backend-qvv8.onrender.com)** | FastAPI backend with auto-docs |
| 📖 **API Docs** | **[sentrix-backend-qvv8.onrender.com/docs](https://sentrix-backend-qvv8.onrender.com/docs)** | Interactive Swagger API documentation |

> **🔑 Dashboard Login:** Officer ID: `admin` · Passcode: `sentrix2025`

---

## 📌 Problem Statement

India attracts **10 million+ foreign tourists** and **2 billion+ domestic trips** annually. Many popular tourist spots — Himalayan passes, coastal cliffs, dense forests — are in **remote areas with unreliable connectivity**.

### The 4 Critical Gaps

| Gap | Problem |
|-----|---------|
| 📵 **No SOS Channel** | Mobile networks fail in 40% of popular tourist zones |
| 🆔 **No Verified Identity** | Hospitals can't identify unconscious tourists |
| 🚔 **No Coordination** | Police, hospitals, SDRF don't share a common platform |
| 📝 **No Accountability** | No tamper-proof record of what happened and when |

**Sentrix closes all four gaps with a single, unified platform.**

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    TOURIST MOBILE (PWA)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Register │→ │Digital ID│→ │ Live Map │→ │  SOS Button │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────┬──────┘  │
│                                                    │         │
│  📳 Shake-to-SOS          🧠 Dead Man's Switch     │         │
│  (3 violent shakes)       (10-min inactivity)      │         │
└────────────────────────────────────────────────────┼─────────┘
                                                     │
                        4-LAYER SOS DELIVERY          │
                     ┌────────────────────┐           │
                     │ L1: Internet API   │◄──────────┤
                     │ L2: SMS to 112     │◄──────────┤
                     │ L3: Offline Queue  │◄──────────┤ (auto-sync)
                     │ L4: Emergency SMS  │◄──────────┘
                     └────────┬───────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                   FASTAPI BACKEND                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │ Risk Engine│  │ Blockchain │  │ ERSS-112 Integration   │  │
│  │ (AI/ML)    │  │ (SHA-256)  │  │ (National Emergency)   │  │
│  └────────────┘  └────────────┘  └────────────────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │ WebSocket  │  │  SQLite DB │  │ Dead Man's Switch      │  │
│  │ (Live Push)│  │ (Persist)  │  │ (Auto-SOS Monitor)     │  │
│  └────────────┘  └────────────┘  └────────────────────────┘  │
└────────────────────────────────────┬─────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────┐
│              AUTHORITY COMMAND CENTER                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │ Live Alert │  │ Dispatch   │  │ Blockchain Explorer    │  │
│  │ Map + Feed │  │ Panel      │  │ (Audit Trail)          │  │
│  └────────────┘  └────────────┘  └────────────────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │ Risk Graph │  │ Registered │  │ Demo SOS Trigger       │  │
│  │ (ML Viz)   │  │ Visitors   │  │ (One-Click)            │  │
│  └────────────┘  └────────────┘  └────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## ✨ Features Built

### 🌍 Tourist-Facing (Mobile PWA)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Quick Registration** | Register in under 45 seconds — Aadhaar, Passport, or Driving License. No app download needed. |
| 2 | **Blockchain Digital ID** | QR-based digital identity card with SHA-256 hash verification. Scannable by any checkpoint or hospital. |
| 3 | **Live Safety Map** | Real-time GPS location on Leaflet map with danger zone overlays, risk score circle, and weather data. |
| 4 | **4-Layer SOS System** | Internet API → SMS to 112 → Offline queue (auto-sync) → Emergency contact SMS. Guaranteed delivery. |
| 5 | **📳 Shake-to-SOS** | Shake phone violently 3 times → auto-triggers SOS. Works even when screen is locked. Haptic + visual confirmation. |
| 6 | **🧠 Dead Man's Switch** | 10 minutes of inactivity in a danger zone → automatic SOS on behalf of unconscious tourist. |
| 7 | **Offline-First SOS** | SOS is stored locally when offline. Auto-transmits the moment network restores — zero user action needed. |
| 8 | **Real-Time Rescue Updates** | WebSocket push notifications: "Police dispatched", "Ambulance en route", "Rescue complete". |
| 9 | **SOS History** | Full history of all past SOS alerts with timestamps, locations, and resolution status. |
| 10 | **Multi-Language** | English 🇬🇧 + Hindi 🇮🇳 + Tamil 🇮🇳 — language selector on landing page. |
| 11 | **Real Device Battery** | Reads actual device battery level via Battery Status API. Shows N/A on unsupported browsers. |
| 12 | **GPS Toggle** | Turn GPS on/off. When off, uses last known position for SOS (simulates GSM triangulation). |

### 🛡️ Authority Command Center

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Live Alert Map** | Every SOS appears instantly on a Leaflet map with tourist name, risk level, and nationality. |
| 2 | **Real-Time Alert Feed** | WebSocket-powered live feed — new alerts appear without page refresh. |
| 3 | **One-Click Dispatch** | Deploy Police, Ambulance, SDRF, or NDRF to any alert with one button. |
| 4 | **Risk Score Visualization** | Bar chart showing all risk factors: battery, altitude, zone proximity, weather, time-of-day. |
| 5 | **Blockchain Explorer** | Browse the entire immutable chain — every registration, SOS, dispatch, and resolution is logged. |
| 6 | **Registered Visitors** | View all registered tourists with status (Active / SOS / Rescued), blood group, and ID type. |
| 7 | **Demo SOS Trigger** | One-click button to simulate a tourist registration + SOS from a random Indian danger zone. |
| 8 | **Alert Detail Panel** | Expandable cards with full incident details: coordinates, battery, risk breakdown, dispatch actions. |

---

## 🤖 AI/ML Risk Engine

The risk engine calculates a **0–100 safety score** using 5 real-time factors:

| Factor | Weight | Source |
|--------|--------|--------|
| 🔋 **Battery Level** | 15% | Device Battery API (real) |
| 🏔️ **Altitude** | 20% | GPS elevation data |
| 📍 **Zone Proximity** | 25% | Distance from 12 real Indian danger zones |
| 🌧️ **Weather** | 20% | OpenWeatherMap API (live) with simulated fallback |
| 🌙 **Time of Day** | 20% | IST-aware — nighttime travel is riskier |

### Machine Learning Component

- **Model:** Random Forest (scikit-learn)
- **Training:** 200 synthetic data points covering all Indian danger zone types
- **Features:** Battery, altitude, temperature, humidity, wind speed, zone proximity, hour
- **Output:** Risk classification (green/yellow/red) with confidence score
- **Fallback:** Rule-based scoring when ML model is unavailable

---

## 🔗 Blockchain Implementation

| Specification | Detail |
|---------------|--------|
| **Algorithm** | SHA-256 with Proof-of-Work |
| **Difficulty** | 4 leading zeros |
| **Events Logged** | Registration, SOS Trigger, Dispatch, Resolution |
| **Data Stored** | Only hashes + timestamps (no personal data on chain) |
| **Verification** | Any block can be verified via `/api/verify-id/{hash}` |
| **Immutability** | Tamper-proof — changing any block breaks the chain |
| **Explorer** | Visual chain explorer in the Command Center dashboard |

### What Gets Recorded on Blockchain

```
Block #1: Genesis Block
Block #2: Tourist Registration → SHA-256(name + id_number + timestamp)
Block #3: SOS Alert Triggered → SHA-256(tourist_id + lat/lng + battery + timestamp)
Block #4: Police Unit Dispatched → SHA-256(alert_id + unit_name + timestamp)
Block #5: Tourist Rescued → SHA-256(alert_id + resolution + timestamp)
```

> **Privacy:** The actual ID number (Aadhaar/Passport) is never stored. Only a one-way encrypted hash is kept. Original data cannot be recovered from the hash.

---

## 🗺️ Real Indian Danger Zones (12 Geo-Fenced Locations)

| # | Location | State | Risk Type | Radius |
|---|----------|-------|-----------|--------|
| 1 | Rohtang Pass | Himachal Pradesh | Avalanche, Blizzard | 5 km |
| 2 | Solang Valley | Himachal Pradesh | Steep Terrain, Glaciers | 3 km |
| 3 | Hampta Pass | Himachal Pradesh | High Altitude, Avalanche | 4 km |
| 4 | Beas Kund | Himachal Pradesh | Glacial Lake, Hypothermia | 2 km |
| 5 | Anjuna Beach Rocks | Goa | Coastal Hazards, Rocks | 1.5 km |
| 6 | Dudhsagar Falls | Goa | Waterfall Currents | 2 km |
| 7 | Thar Desert | Rajasthan | Extreme Heat, Dehydration | 15 km |
| 8 | Nahargarh Fort | Rajasthan | Steep Terrain | 1 km |
| 9 | Brahmaputra Flood Plain | Assam | Floods, Strong Currents | 8 km |
| 10 | Cherrapunji | Meghalaya | Landslides, Heavy Rain | 5 km |
| 11 | Munnar | Kerala | Landslides, Fog | 3 km |
| 12 | Alleppey Backwaters | Kerala | Flooding, Boat Hazards | 4 km |

### Emergency Response Units (17 Pre-Configured)

Police stations, district hospitals, SDRF teams, and NDRF units across all 5 states with real GPS coordinates.

---

## 🚀 4-Layer SOS Delivery System

```
Tourist presses SOS
        │
        ▼
┌─── Layer 1: Internet API ───┐
│  POST /api/sos               │  ✅ Fastest (< 1 sec)
│  → WebSocket to Dashboard    │
│  → Blockchain logged         │
└──────────────┬───────────────┘
               │ (fails if no internet)
               ▼
┌─── Layer 2: SMS to 112 ─────┐
│  Auto-compose SMS with GPS   │  ✅ Works on 2G
│  coordinates to 112          │
└──────────────┬───────────────┘
               │ (fails if no signal)
               ▼
┌─── Layer 3: Offline Queue ───┐
│  Save to localStorage        │  ✅ Works with ZERO network
│  Auto-sync on reconnect      │  ✅ No user action needed
│  Tagged as 'offline_queue'   │
└──────────────┬───────────────┘
               │
               ▼
┌─── Layer 4: Emergency SMS ───┐
│  SMS to emergency contact    │  ✅ Last resort
│  with last known position    │
└──────────────────────────────┘
```

> **Key Innovation:** Layer 3 (Offline Queue) uses the browser's `localStorage` to cache the SOS and an `online` event listener to auto-transmit the moment internet restores — **completely hands-free**.

---

## 🧠 Dead Man's Switch (Auto-SOS)

| Specification | Detail |
|---------------|--------|
| **Trigger** | 10 minutes of GPS inactivity inside a danger zone |
| **Detection** | Backend monitors last ping timestamp per tourist |
| **Action** | Automatic SOS generation on behalf of the tourist |
| **Use Cases** | Falls, drowning, altitude sickness, unconsciousness |
| **Dashboard Tag** | `dead_mans_switch` in triggered_via field |

---

## 📳 Shake-to-SOS (Panic Gesture)

| Specification | Detail |
|---------------|--------|
| **Trigger** | 3 violent shakes within 2 seconds |
| **Threshold** | 25 m/s² acceleration magnitude |
| **Cooldown** | 15 seconds between triggers |
| **Feedback** | Red screen flash + haptic vibration pattern |
| **API** | Browser DeviceMotion API (no app install) |
| **Offline** | Works offline — queues SOS for auto-sync |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 19 + Vite | Tourist PWA + Authority Dashboard |
| **Backend** | Python + FastAPI | REST API + WebSocket server |
| **Database** | SQLite (WAL mode) | Tourist & alert persistence |
| **Blockchain** | Custom SHA-256 | Tamper-proof audit trail |
| **Maps** | Leaflet.js + Google Tiles | Real-time GPS visualization |
| **Real-Time** | WebSocket | Instant alert push to dashboard |
| **AI/ML** | scikit-learn Random Forest | Risk classification model |
| **Weather** | OpenWeatherMap API | Live weather with simulated fallback |
| **Deployment** | Render.com | Auto-deploy from GitHub |
| **ID Verification** | QR Code (qrcode.react) | Scannable Digital ID cards |

---

## 📂 Project Structure

```
sentrix/
├── backend/
│   ├── main.py              # FastAPI app — all API routes, WebSocket, blockchain
│   ├── models.py            # Pydantic models (Tourist, SOS payload)
│   ├── database.py          # SQLite persistence layer
│   ├── rule_engine.py       # 5-factor AI risk scoring engine
│   ├── ml_model.py          # Random Forest ML model (train + predict)
│   ├── sos_handler.py       # 4-layer SOS delivery orchestrator
│   ├── dead_mans_switch.py  # Background auto-SOS monitor
│   ├── requirements.txt     # Python dependencies
│   └── tests/
│       └── test_core.py     # Unit tests (registration, SOS, blockchain)
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Route definitions + layout
│   │   ├── index.css            # Complete design system (CSS variables)
│   │   ├── i18n.js              # English + Hindi + Tamil translations
│   │   └── pages/
│   │       ├── LandingPage.jsx      # Tourist welcome screen
│   │       ├── Registration.jsx     # 45-second registration flow
│   │       ├── DigitalIDPage.jsx    # Blockchain-verified QR ID card
│   │       ├── TravelView.jsx       # Live map + SOS + shake detection
│   │       ├── SOSConfirmation.jsx  # Real-time rescue status page
│   │       ├── SOSHistory.jsx       # Past SOS alert history
│   │       ├── DashboardLogin.jsx   # Authority login gate
│   │       ├── Dashboard.jsx        # Full command center
│   │       └── VerifyID.jsx         # Public ID verification page
│   └── package.json
│
├── render.yaml          # Render.com deployment blueprint (2 services)
├── build.sh             # Local build helper script
└── README.md
```

---

## 🚀 How to Run Locally

### Prerequisites
- Python 3.10+
- Node.js 18+

### Step 1: Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> Server starts at `http://localhost:8000` · API docs at `http://localhost:8000/docs`

### Step 2: Frontend

```bash
cd frontend
npm install
npm run dev
```

> Opens at `http://localhost:5173`

### Step 3: Access

| Page | URL | Credentials |
|------|-----|-------------|
| Tourist App | `http://localhost:5173/tourist` | — |
| Dashboard | `http://localhost:5173/dashboard` | `admin` / `sentrix2025` |
| ID Verify | `http://localhost:5173/verify?hash={id_hash}` | — |

---

## 🎮 Demo Walkthrough

### Demo 1: Full Tourist Journey
1. Open Tourist App → Click **"Start Registration"**
2. Fill details → Enter any 6-digit OTP → **Digital ID** created with QR code
3. Click **"Start Journey"** → Live map with real GPS + risk score
4. Press the red **SOS** button → Watch all 4 rescue layers activate
5. Open **Dashboard** in another tab → Login with `admin` / `sentrix2025`
6. See the SOS alert appear instantly → Click **"Deploy Police Unit"**
7. Go back to Tourist tab → Shows **"Help is on the way!"** in real-time

### Demo 2: Offline SOS
1. Turn off WiFi/data on your device
2. Press **SOS** → Alert saved locally with offline badge
3. Turn WiFi back on → SOS **auto-sends without touching anything**
4. Dashboard receives it tagged as `offline_queue_sync`

### Demo 3: Shake-to-SOS
1. On TravelView, **shake your phone 3 times violently**
2. Screen flashes red + phone vibrates
3. SOS auto-triggers within 1 second

### Demo 4: Quick Dashboard Demo
1. On Dashboard, click **"Trigger Demo SOS"**
2. Auto-creates a tourist + triggers SOS from a random Indian location
3. Press multiple times to see alerts across different states

---

## 🇮🇳 India-Specific Integrations

| Integration | Detail |
|-------------|--------|
| **ERSS-112** | Connected to India's national emergency response system |
| **Aadhaar** | 12-digit validation with Verhoeff checksum |
| **Driving License** | Indian format validation (e.g., `KA01-20150001234`) |
| **Passport** | Indian + 7 foreign country formats supported |
| **IST Awareness** | Risk engine adjusts scoring for Indian nighttime (6 PM – 6 AM IST) |
| **17 Emergency Units** | Real police stations, hospitals, SDRF, NDRF across 5 states |
| **12 Danger Zones** | Actual GPS coordinates across Himachal, Goa, Rajasthan, NE India, Kerala |

---

## 🌐 Multilingual Support

| Language | Coverage | Status |
|----------|----------|--------|
| 🇬🇧 English | Full UI + SOS + Dashboard | ✅ Complete |
| 🇮🇳 Hindi (हिंदी) | Tourist app UI + SOS flows | ✅ Complete |
| 🇮🇳 Tamil (தமிழ்) | Tourist app UI + SOS flows | ✅ Complete |

---

## 🔒 Privacy & Security

- ✅ **ID numbers are never stored** — only SHA-256 hashes are kept
- ✅ **Zero personal data on blockchain** — only hashes + timestamps
- ✅ **Tamper-proof audit trail** — changing any block breaks the chain
- ✅ **GPS consent** — tourists can toggle GPS on/off (logged on blockchain)
- ✅ **No app install required** — runs entirely in the browser (PWA)
- ✅ **Real device battery** — reads actual battery level, shows N/A if unsupported

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/register` | Register a new tourist |
| `POST` | `/api/sos` | Trigger SOS alert |
| `GET` | `/api/risk-score` | Get AI risk score for coordinates |
| `GET` | `/api/verify-id/{hash}` | Verify tourist ID on blockchain |
| `GET` | `/api/registered-tourists` | List all registered tourists |
| `GET` | `/api/alerts` | List all SOS alerts |
| `POST` | `/api/dispatch/{alert_id}` | Dispatch rescue unit |
| `GET` | `/api/blockchain` | Full blockchain explorer |
| `GET` | `/api/geofence-data` | Danger zone GeoJSON data |
| `GET` | `/api/health` | System health check |
| `WS` | `/ws/authority` | Real-time WebSocket for dashboard |
| `WS` | `/ws/tourist/{id}` | Real-time WebSocket for tourist |

> Full interactive docs at **[/docs](https://sentrix-backend-qvv8.onrender.com/docs)**

---

## ✅ SIH25002 Compliance Matrix

| # | Requirement | Status | Implementation |
|---|------------|--------|----------------|
| 1 | AI/ML-based Risk Detection | ✅ | 5-factor rule engine + Random Forest ML model |
| 2 | Geo-Fencing for Danger Zones | ✅ | 12 real Indian locations with visual map overlays |
| 3 | Blockchain for Security | ✅ | SHA-256 with PoW — full audit trail for all events |
| 4 | Incident Response System | ✅ | 4-layer SOS with guaranteed delivery + ERSS-112 |
| 5 | Offline Capability | ✅ | Auto-save + auto-sync SOS — works with zero network |
| 6 | Real-Time Dashboard | ✅ | WebSocket-powered live alerts, dispatch, chain explorer |
| 7 | Multilingual Support | ✅ | English + Hindi + Tamil with dynamic language switching |
| 8 | Digital Identity | ✅ | QR-based Digital ID with blockchain verification |
| 9 | Auto-SOS (Dead Man's Switch) | ✅ | 10-min inactivity detection → auto-triggers SOS |
| 10 | Panic Gesture (Shake-to-SOS) | ✅ | DeviceMotion API — 3 shakes within 2 seconds |

---

## 👥 Team Sentrix

Built with ❤️ for **Smart India Hackathon (SIH) 2025**  
Problem Statement: **SIH25002 — Tourist Safety & Incident Response**

---

*© 2025 Team Sentrix. All rights reserved.*
