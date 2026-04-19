# 🛡️ Sentrix — Your Personal Safety Companion for Travel in India

> **Smart India Hackathon 2025 · Problem Statement SIH25002 · Theme: Travel & Tourism**

Sentrix is an intelligent tourist safety platform that protects travelers across India — even when there's no internet, no GPS, and no phone signal. It ensures that when you press the SOS button, help **always** reaches you.

![Sentrix](https://img.shields.io/badge/Sentrix-v1.0-047857?style=for-the-badge&labelColor=0f172a)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Blockchain](https://img.shields.io/badge/Blockchain-Secured-7c3aed?style=for-the-badge)

---

## 🤔 The Problem We're Solving

India attracts **10 million+ foreign tourists** and **2 billion+ domestic trips** every year. Many popular tourist spots — Himalayan passes, coastal cliffs, monsoon-prone forests — are in **remote areas where phone signals barely work**.

When an emergency happens in these areas, tourists face serious challenges:

- 📵 **No way to call for help** — mobile networks don't work in many tourist zones
- 🆔 **No verified identity** — hospitals can't quickly identify an unconscious tourist
- 🚔 **No coordination** — police, hospitals, and rescue teams don't share a common system
- 📝 **No accountability** — no one can prove what happened and when

**Sentrix solves all four problems with one platform.**

---

## 💡 What Sentrix Does

### For Tourists (Mobile-Friendly Web App)

1. **Quick Registration** — Register in under 45 seconds using your Aadhaar, Passport, or Driving License. No app download needed — it works right in your browser.

2. **Digital ID Card** — Get a secure, QR-based digital identity card that any hotel, checkpoint, or hospital can scan to verify you instantly.

3. **Live Safety Map** — See your real-time location on a map with danger zone warnings, a live risk score, and weather conditions — all updating as you travel.

4. **One-Tap SOS** — Press the red emergency button and Sentrix tries **4 different channels** to get you help:
   - 🟢 **Channel 1:** Sends alert over the internet to the national emergency system (ERSS-112)
   - 🟡 **Channel 2:** Sends an SMS to emergency number 112
   - 🟠 **Channel 3:** Saves the SOS on your phone and auto-sends it the moment internet returns
   - 🔴 **Channel 4:** Texts your emergency contact with your last known location

   > **Even if all networks are down, your SOS is safely stored and will auto-send without you needing to do anything once connectivity is restored.**

5. **Real-Time Rescue Updates** — After triggering SOS, you can see live updates: "Police unit dispatched", "Ambulance on the way", "You are safe — rescue complete."

6. **🧠 Dead Man's Switch (Auto-SOS)** — What if a tourist is unconscious and *can't* press SOS? Sentrix monitors your activity in the background. If you stop moving for **10 minutes inside a danger zone**, an SOS is **automatically triggered on your behalf** — no button press needed. This covers falls, drownings, altitude sickness, and any situation where the tourist is physically unable to call for help.

7. **📳 Shake-to-SOS (Panic Gesture)** — Being attacked or robbed and can't look at your screen? Just **shake your phone violently 3 times** and Sentrix instantly triggers an SOS. The screen flashes red, your phone vibrates as confirmation, and help is dispatched — all without touching a single button. Works even offline.

### For Authorities (Command Center Dashboard)

1. **Live Alert Feed** — Every SOS appears instantly on the dashboard with the tourist's name, location, risk level, and severity.

2. **One-Click Dispatch** — Deploy police, ambulance, or disaster response teams to any alert with a single click.

3. **Security Audit Trail** — Every action (registration, SOS, dispatch, rescue) is permanently recorded on a tamper-proof blockchain. No one can delete or modify incident records.

4. **Registered Visitors** — View all registered tourists, their status (active, SOS, rescued), blood group, and nationality.

---

## 🗺️ Where It Works — Real Indian Locations

Sentrix covers **12 real danger zones** across India:

| Region | Locations | Risks |
|--------|-----------|-------|
| **Himachal Pradesh** | Rohtang Pass, Solang Valley, Hampta Pass, Beas Kund | Avalanche, Glaciers, Steep Terrain |
| **Goa** | Anjuna Beach Rocks, Dudhsagar Falls | Coastal Hazards, Waterfall Currents |
| **Rajasthan** | Thar Desert, Nahargarh Fort | Extreme Heat, Steep Terrain |
| **Northeast India** | Brahmaputra Flood Plain, Cherrapunji | Floods, Landslides |
| **Kerala** | Munnar, Alleppey Backwaters | Landslides, Flooding |

---

## 🚀 How to Run Sentrix

### What You Need
- **Python 3.10 or higher**
- **Node.js 18 or higher**

### Step 1: Start the Backend (Server)

Open a terminal and run:

```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> The server will start at `http://localhost:8000`

### Step 2: Start the Frontend (Website)

Open a **second terminal** and run:

```bash
cd frontend
npm run dev
```

> The website will open at `http://localhost:5173`

### Step 3: Access the Platform

| Page | URL | Description |
|------|-----|-------------|
| **Tourist App** | `http://localhost:5173/tourist` | Register, get your Digital ID, start your journey |
| **Authority Dashboard** | `http://localhost:5173/dashboard` | Login: `admin` / `sentrix2025` |
| **ID Verification** | `http://localhost:5173/verify` | Verify a tourist's identity via blockchain |

---

## 🎮 Try the Demo (Step by Step)

### Demo 1: Full Tourist Journey
1. Open the Tourist App → Click **"Start Registration"**
2. Fill in your details → Enter any 6-digit OTP → Your **Digital ID** is created with a scannable QR code
3. Click **"Start Journey"** → You'll see a live map with your real GPS location and a safety risk score
4. Press the red **SOS** button → Watch as all 4 rescue channels activate one by one
5. Now open the **Dashboard** in another tab → Login with `admin` / `sentrix2025`
6. You'll see your SOS alert appear instantly → Click **"Deploy Police Unit"**
7. Go back to the Tourist tab → It now says **"Help is on the way!"** in real-time

### Demo 2: What Happens Without Internet?
1. On the Travel View, turn off your WiFi/data connection
2. Press the **SOS** button → The alert is safely stored on your device
3. Turn your WiFi back on → The saved SOS **automatically sends itself** without you touching anything
4. The Dashboard receives the alert tagged as `offline_queue_sync`

### Demo 3: Quick One-Click Demo  
In the Dashboard, click **"Trigger Demo SOS"** — it automatically creates a tourist and triggers their SOS. Press it multiple times to see alerts from different locations across India.

---

## 🌐 Languages Supported

- 🇬🇧 English (Full)
- 🇮🇳 Hindi — हिंदी
- 🇮🇳 Tamil — தமிழ்

---

## 🔒 Privacy & Security

- **Your ID number is never stored** — only a one-way encrypted hash is kept
- **Zero personal data on the blockchain** — only hashes and timestamps are recorded
- **Tamper-proof records** — once an event is logged, nobody can change or delete it
- **GPS consent** — tourists can turn GPS tracking on or off at any time (the toggle is logged on blockchain for transparency)

---

## 🇮🇳 Built for India

- **ERSS-112** — Integrated with India's national emergency response system
- **Indian ID Support** — Aadhaar (12-digit), Driving License, and Passport validation
- **Foreign Passport Support** — USA, UK, Canada, Australia, Germany, France, Japan + generic
- **Real Indian Geography** — 12 danger zones with actual GPS coordinates across 5 states
- **17 Emergency Units** — Real police stations, hospitals, SDRF, and NDRF unit locations
- **IST Time-Aware** — The risk engine knows that nighttime travel in India is riskier

---

## 🏗️ How It's Built

| Component | Technology |
|-----------|-----------|
| **Server** | Python, FastAPI |
| **Website** | React 19, Vite |
| **Security** | Custom Blockchain (SHA-256 with Proof-of-Work) |
| **Maps** | Leaflet.js with real-time GPS |
| **Live Updates** | WebSocket (instant push notifications) |
| **Database** | SQLite (auto-saves all data) |
| **AI Risk Engine** | 5-factor scoring + Machine Learning (Random Forest) |
| **Weather Data** | OpenWeatherMap API |

---

## ✅ SIH25002 Requirement Checklist

| # | What Was Asked | Status | What We Built |
|---|---------------|--------|---------------|
| 1 | AI/ML Risk Detection | ✅ Done | 5-factor risk engine + ML ensemble scoring |
| 2 | Geo-Fencing | ✅ Done | 12 real danger zones with visual map overlays |
| 3 | Blockchain | ✅ Done | Full audit trail — registration, SOS, dispatch, resolution |
| 4 | Incident Response | ✅ Done | 4-layer SOS with guaranteed delivery + real-time dispatch |
| 5 | Offline Capability | ✅ Done | Auto-save & auto-sync SOS — works without internet |
| 6 | Real-Time Dashboard | ✅ Done | Live WebSocket alerts, dispatch, and chain explorer |
| 7 | Multilingual | ✅ Done | English + Hindi + Tamil |
| 8 | Digital Identity | ✅ Done | QR-based Digital ID with blockchain verification |

---

*Built with ❤️ for Smart India Hackathon (SIH) 2025 · Problem Statement SIH25002*  
*Team Sentrix*
