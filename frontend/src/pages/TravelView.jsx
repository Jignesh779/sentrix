import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { QRCodeSVG } from 'qrcode.react';
import { t } from '../i18n';
import 'leaflet/dist/leaflet.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom pulsing "you are here" blue dot icon
const youIcon = new L.DivIcon({
  html: `<div style="
    width:22px;height:22px;
    background:#2563eb;border-radius:50%;
    border:4px solid white;
    box-shadow:0 0 0 6px rgba(37,99,235,0.25), 0 4px 12px rgba(37,99,235,0.5);
  "></div>`,
  iconSize: [22, 22],
  className: '',
});

// Helper: auto-pan map when real GPS position changes
function MapPanner({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView([pos.lat, pos.lng], map.getZoom());
  }, [pos, map]);
  return null;
}

export default function TravelView({ lang }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Session recovery: try nav state first, then localStorage fallback (handles page refresh)
  const tourist = location.state?.tourist || (() => {
    try { return JSON.parse(localStorage.getItem('sy_tourist') || 'null'); } catch { return null; }
  })();

  // Guard: handled below after all hooks run


  const [risk, setRisk] = useState(null);
  const [gpsOn, setGpsOn] = useState(true);
  const [zones, setZones] = useState([]);
  const [sosLoading, setSosLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(true);
  const [locError, setLocError] = useState(null);
  const [pos, setPos] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [battery, setBattery] = useState(100);
  const [pendingSOSCount, setPendingSOSCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'synced'
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const watchIdRef = useRef(null);
  // Restore last known position from localStorage on mount (useRef doesn't support lazy init)
  const _initLkp = (() => { try { return JSON.parse(localStorage.getItem('sy_lkp') || 'null'); } catch { return null; } })();
  const lkpRef = useRef(_initLkp);
  const [showIdCard, setShowIdCard] = useState(false);
  const [verifyData, setVerifyData] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const flushQueueRef = useRef(null);
  const autoFlushingRef = useRef(false); // prevents double-firing

  // ── Shake-to-SOS State ──
  const shakeTriggeredRef = useRef(false);
  const [shakeArmed, _setShakeArmed] = useState(true);
  const [shakeFlash, setShakeFlash] = useState(false);

  // ── Real-Time Battery Sensing ──
  useEffect(() => {
    if (navigator.getBattery) {
      navigator.getBattery().then(bat => {
        setBattery(Math.round(bat.level * 100));
        bat.addEventListener('levelchange', () => {
          setBattery(Math.round(bat.level * 100));
        });
      });
    }
  }, []);

  // ── Shake-to-SOS Detection (Panic Gesture) ──
  // Detects 3 violent shakes within 2 seconds → auto-triggers SOS
  // Uses the browser's DeviceMotion API (works without any app install)
  useEffect(() => {
    if (!shakeArmed) return;

    const SHAKE_THRESHOLD = 25;     // Acceleration magnitude (m/s²) to count as a "shake"
    const SHAKE_COUNT_NEEDED = 3;   // Number of shakes required
    const SHAKE_WINDOW_MS = 2000;   // Time window for shake detection
    const COOLDOWN_MS = 15000;      // Prevent re-trigger for 15 seconds

    let shakeTimestamps = [];
    let lastTriggerTime = 0;

    const handleMotion = (event) => {
      // Skip if already triggered or SOS is loading
      if (shakeTriggeredRef.current || sosLoading) return;

      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null) return;

      // Calculate total acceleration magnitude (subtract gravity ~9.8)
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      const netForce = Math.abs(magnitude - 9.81);

      if (netForce < SHAKE_THRESHOLD) return;

      const now = Date.now();

      // Cooldown check
      if (now - lastTriggerTime < COOLDOWN_MS) return;

      // Record this shake event
      shakeTimestamps.push(now);

      // Prune old timestamps outside the detection window
      shakeTimestamps = shakeTimestamps.filter(t => now - t < SHAKE_WINDOW_MS);

      // Check if we've hit the threshold
      if (shakeTimestamps.length >= SHAKE_COUNT_NEEDED) {
        shakeTriggeredRef.current = true;
        lastTriggerTime = now;
        shakeTimestamps = [];

        // Visual + haptic feedback
        setShakeFlash(true);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
        setTimeout(() => setShakeFlash(false), 1500);

        console.log('[SHAKE-SOS] Panic gesture detected! Auto-triggering SOS...');

        // Auto-fire SOS after a brief 1-second window (lets user see the flash)
        setTimeout(() => {
          // Build SOS payload directly (bypass handleSOS to avoid double-state issues)
          const targetPos = pos
            || lkpRef.current
            || (() => { try { return JSON.parse(localStorage.getItem('sy_lkp') || 'null'); } catch { return null; } })()
            || { lat: 28.6315, lng: 77.2167 };

          const sosPayload = {
            tourist_id: tourist?.tourist_id,
            latitude: targetPos.lat,
            longitude: targetPos.lng,
            battery_level: Math.round(battery),
            triggered_via: 'shake_gesture',
            location_source: gpsOn ? 'GPS Direct (Shake-to-SOS)' : 'Last Known Position (Shake-to-SOS)',
          };

          // Try live send, fallback to offline queue
          if (navigator.onLine) {
            fetch(`${API}/api/sos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sosPayload),
            })
              .then(r => r.json())
              .then(data => {
                navigate('/tourist/sos', { state: { sosResult: data, tourist, offline: false } });
              })
              .catch(() => {
                // Network failed — queue offline
                const queue = getSOSQueue();
                queue.push({ ...sosPayload, queued_at: new Date().toISOString() });
                saveSOSQueue(queue);
                navigate('/tourist/sos', { state: { sosResult: null, tourist, offline: true } });
              });
          } else {
            // Offline — queue it
            const queue = getSOSQueue();
            queue.push({ ...sosPayload, queued_at: new Date().toISOString() });
            saveSOSQueue(queue);
            navigate('/tourist/sos', { state: { sosResult: null, tourist, offline: true } });
          }

          // Reset after cooldown
          setTimeout(() => { shakeTriggeredRef.current = false; }, COOLDOWN_MS);
        }, 1000);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [shakeArmed, sosLoading, pos, battery, gpsOn, tourist, navigate]);

  // ── Offline SOS Queue Helpers ──
  const getSOSQueue = () => {
    try { return JSON.parse(localStorage.getItem('sy_sos_queue') || '[]'); }
    catch { return []; }
  };
  const saveSOSQueue = (q) => localStorage.setItem('sy_sos_queue', JSON.stringify(q));

  // ── Count pending on mount ──
  useEffect(() => {
    setPendingSOSCount(getSOSQueue().length);
  }, []);

  // ── Auto-Sync Engine (Manual / Retry) ──
  // flushQueue is ONLY called manually via the "Retry Now" button.
  // Auto-sync on network restore is handled exclusively by SOSConfirmation.jsx
  // to prevent double-sending when both pages are in the mount/unmount transition.
  useEffect(() => {
    const flushQueue = async () => {
      if (autoFlushingRef.current) return;
      const queue = getSOSQueue();
      if (queue.length === 0) return;

      autoFlushingRef.current = true;
      setSyncStatus('syncing');
      const failed = [];

      for (const payload of queue) {
        const { queued_at: _queued_at, ...cleanPayload } = payload;
        try {
          const res = await fetch(`${API}/api/sos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...cleanPayload, triggered_via: 'offline_queue_sync' }),
          });
          if (!res.ok) throw new Error('Server error');
        } catch {
          failed.push(payload);
        }
      }

      autoFlushingRef.current = false;
      saveSOSQueue(failed);
      setPendingSOSCount(failed.length);
      setSyncStatus(failed.length === 0 ? 'synced' : null);
      if (failed.length === 0) setTimeout(() => setSyncStatus(null), 4000);
    };

    flushQueueRef.current = flushQueue;

    // ── Network state tracking only ──
    // We track online/offline for UI display and the networkOnline guard in handleSOS.
    // We do NOT auto-flush here — that's SOSConfirmation's sole responsibility.
    // This prevents the double-send race where both pages hear the 'online' event.
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Real-Time GPS Watching ──
  useEffect(() => {
    if (!gpsOn) {
      // When GPS is toggled OFF, stop the watch but FREEZE the displayed
      // position at the last known location so the map stays put and SOS
      // uses the correct coordinates.
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      if (lkpRef.current) {
        setPos(lkpRef.current); // freeze map at last known position
      }
      setLocLoading(false);
      return;
    }

    if (!navigator.geolocation) {
      setLocError('GPS not supported by this browser.');
      const fallback = { lat: 28.6315, lng: 77.2167 };
      setPos(fallback);
      lkpRef.current = fallback;
      localStorage.setItem('sy_lkp', JSON.stringify(fallback));
      setLocLoading(false);
      return;
    }

    setLocLoading(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newPos = { lat: position.coords.latitude, lng: position.coords.longitude };
        setPos(newPos);
        lkpRef.current = newPos;
        // Persist LKP to localStorage so it survives page refreshes & GPS toggle
        localStorage.setItem('sy_lkp', JSON.stringify(newPos));
        setAccuracy(position.coords.accuracy);
        setLocLoading(false);
        setLocError(null);
      },
      () => {
        setLocError('Location access denied. Please allow GPS in your browser.');
        // Use persisted LKP if available, else New Delhi fallback
        const fallback = lkpRef.current || { lat: 28.6315, lng: 77.2167 };
        setPos(fallback);
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [gpsOn]);

  // ── Fetch Geo-fence Zones ──
  useEffect(() => {
    fetch(`${API}/api/geofence-data`)
      .then(r => r.json())
      .then(data => setZones(data.features || []))
      .catch(() => {});
  }, []);

  // ── Fetch Risk Score whenever position updates ──
  // Also feeds the Dead Man's Switch (DMS) via the tourist_id param
  const fetchRisk = useCallback(() => {
    if (!pos) return;
    const tid = tourist?.tourist_id ? `&tourist_id=${tourist.tourist_id}` : '';
    fetch(`${API}/api/risk-score?lat=${pos.lat}&lon=${pos.lng}&battery=${battery}${tid}`)
      .then(r => r.json())
      .then(setRisk)
      .catch(() => {});
  }, [pos, battery, tourist]);

  useEffect(() => {
    fetchRisk();
    const interval = setInterval(fetchRisk, 15000);
    return () => clearInterval(interval);
  }, [fetchRisk]);

  // ── SOS Handler — works offline, auto-syncs on network restore ──
  // Scenario A: GPS OFF → uses last known position, queues SOS, auto-sends on 'online' event
  // Scenario B: GPS ON + no network → tries API, on failure queues SOS, auto-sends on 'online' event
  const handleSOS = async () => {
    if (!tourist) { alert('No tourist data. Please register first.'); return; }

    // Always prefer current pos, fallback to persisted LKP, then New Delhi
    const targetPos = pos
      || lkpRef.current
      || (() => { try { return JSON.parse(localStorage.getItem('sy_lkp') || 'null'); } catch { return null; } })()
      || { lat: 28.6315, lng: 77.2167 };

    const locationSource = gpsOn
      ? 'GPS Direct (Exact Match)'
      : 'Last Known Position — GSM Triangulation (~500m accuracy)';

    if (!targetPos) {
      alert('Location not yet acquired. Please wait or enable GPS temporarily.');
      return;
    }

    setSosLoading(true);

    const sosPayload = {
      tourist_id: tourist.tourist_id,
      latitude: targetPos.lat,
      longitude: targetPos.lng,
      battery_level: Math.round(battery),
      triggered_via: gpsOn ? 'button' : 'sms_mesh_fallback',
      location_source: locationSource,
      queued_at: new Date().toISOString(),
    };

    // ── SCENARIO A: GPS OFF ──
    // GPS is off → always treat as offline regardless of actual network state.
    // Queue locally, show offline confirmation page. The 'online' event listener
    // will auto-transmit without user action when connectivity comes back.
    if (!gpsOn) {
      const queue = getSOSQueue();
      queue.push(sosPayload);
      saveSOSQueue(queue);
      setPendingSOSCount(queue.length);

      const offlineSOSData = {
        alert_id: 'OFFLINE-' + Date.now().toString().slice(-6),
        status: 'Queued — auto-sending when network restores',
        timestamp: sosPayload.queued_at,
        location: { lat: targetPos.lat, lng: targetPos.lng },
        location_source: locationSource,
        battery_level: Math.round(battery),
        dispatched_units: [],
        message: 'SOS queued. Will transmit automatically — no action needed.',
      };

      setSosLoading(false);
      navigate('/tourist/sos', {
        state: {
          sosData: offlineSOSData,
          tourist,
          isOffline: true,
          layer_used: 'Layer 3 (Offline Cache → Auto-Sync)',
        },
      });
      return;
    }

    // ── SCENARIO B: GPS ON but network offline ──
    // navigator.onLine is false → WiFi/mobile data is actually off.
    // Queue SOS immediately without attempting the fetch (would fail anyway).
    // The 'online' event listener fires automatically when network returns.
    if (!networkOnline) {
      const queue = getSOSQueue();
      queue.push(sosPayload);
      saveSOSQueue(queue);
      setPendingSOSCount(queue.length);

      const offlineSOSData = {
        alert_id: 'OFFLINE-' + Date.now().toString().slice(-6),
        status: 'Queued — no network detected',
        timestamp: sosPayload.queued_at,
        location: { lat: targetPos.lat, lng: targetPos.lng },
        location_source: locationSource,
        battery_level: Math.round(battery),
        dispatched_units: [],
        message: 'Network offline. SOS queued — will auto-transmit when WiFi/data returns.',
      };

      setSosLoading(false);
      navigate('/tourist/sos', {
        state: {
          sosData: offlineSOSData,
          tourist,
          isOffline: true,
          layer_used: 'Layer 3 (Offline Cache → Auto-Sync)',
        },
      });
      return;
    }

    // ── SCENARIO B: GPS ON — attempt live SOS, auto-queue on network failure ──
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const { queued_at: _queued_at, ...payloadForServer } = sosPayload;

      const res = await fetch(`${API}/api/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadForServer),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const data = await res.json();
      navigate('/tourist/sos', {
        state: {
          sosData: data,
          tourist,
          layer_used: 'Layer 1 (Internet API)',
        },
      });
    } catch {
      // ── SCENARIO B FALLBACK: Network failed despite GPS being ON ──
      // Queue the SOS silently — the 'online' event listener will
      // automatically retransmit it when connectivity restores.
      // No user action required.
      const queue = getSOSQueue();
      queue.push(sosPayload);
      saveSOSQueue(queue);
      setPendingSOSCount(queue.length);

      const offlineSOSData = {
        alert_id: 'OFFLINE-' + Date.now().toString().slice(-6),
        status: 'Queued — auto-sending when network restores',
        timestamp: sosPayload.queued_at,
        location: { lat: targetPos.lat, lng: targetPos.lng },
        location_source: locationSource,
        battery_level: Math.round(battery),
        dispatched_units: [],
        message: 'Network unavailable. SOS is queued and will auto-send — no action needed.',
      };

      navigate('/tourist/sos', {
        state: {
          sosData: offlineSOSData,
          tourist,
          isOffline: true,
          layer_used: 'Layer 3 (Offline Cache → Auto-Sync)',
        },
      });
    } finally {
      setSosLoading(false);
    }
  };

  const riskClass = risk?.risk_level === 'red' ? 'sy-risk-red' : risk?.risk_level === 'yellow' ? 'sy-risk-yellow' : 'sy-risk-green';
  const mapCenter = pos || { lat: 20.5937, lng: 78.9629 }; // India center until GPS locks

  // Guard: no session → send to landing page (must return after all hooks)
  if (!tourist) {
    return <Navigate to="/tourist" replace />;
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--sy-bg)', position: 'relative' }}>

      {/* ── Shake-to-SOS Flash Overlay ── */}
      {shakeFlash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(220, 38, 38, 0.35)',
          animation: 'pulse 0.3s ease-in-out 3',
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(220, 38, 38, 0.9)', color: 'white',
            padding: '24px 48px', borderRadius: 20, fontSize: 22,
            fontWeight: 800, textAlign: 'center', letterSpacing: '0.05em',
            boxShadow: '0 0 60px rgba(220,38,38,0.6)',
          }}>
            📳 SHAKE DETECTED — SOS TRIGGERING...
          </div>
        </div>
      )}

      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'var(--sy-surface)', borderBottom: '1px solid var(--sy-border)', zIndex: 10 }}>
        {/* Left: Brand + Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>Sentrix</h2>
            <p style={{ fontSize: 11, color: 'var(--sy-text-muted)' }}>{tourist?.name || 'Tourist'}</p>
          </div>

          {/* Risk Score — right next to brand for immediate visibility */}
          {risk && (
            <div className={`sy-risk-circle ${riskClass}`} style={{ width: 38, height: 38, fontSize: 15, marginLeft: 4 }}>
              {Math.round(risk.risk_score)}
            </div>
          )}
        </div>

        {/* Right: Status indicators + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          {/* GPS Toggle */}
          <button
            className={`sy-badge ${gpsOn ? 'sy-badge-green' : 'sy-badge-red'}`}
            style={{ cursor: 'pointer', border: 'none', fontSize: 11 }}
            onClick={() => setGpsOn(!gpsOn)}
          >
            {gpsOn ? '📍 GPS On' : '📍 GPS Off'}
          </button>

          {/* Battery */}
          <span className="sy-badge" style={{ background: battery < 20 ? 'var(--sy-red-light)' : 'var(--sy-border-light)', color: battery < 20 ? 'var(--sy-red)' : 'var(--sy-text-secondary)', fontSize: 11, padding: '5px 10px' }}>
            🔋 {battery}%
          </span>

          {/* Weather */}
          {risk?.weather && (
            <span className="sy-badge" style={{ background: 'var(--sy-border-light)', color: 'var(--sy-text-secondary)', fontSize: 11, padding: '5px 10px' }}>
              {risk.weather.source.includes('Live') ? '🌤️ Live' : '🎲 Sim'} {risk.weather.temp_c}°C
            </span>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--sy-border)', margin: '0 2px' }}></div>

          {/* Show My ID — primary action */}
          <button
            className="sy-btn sy-btn-primary"
            style={{ padding: '6px 14px', fontSize: 12, borderRadius: 8 }}
            onClick={async () => {
              setShowIdCard(true);
              if (!verifyData && tourist?.id_hash) {
                setVerifyLoading(true);
                try {
                  const res = await fetch(`${API}/api/verify-id/${tourist.id_hash}`);
                  const data = await res.json();
                  setVerifyData(data);
                } catch {
                  setVerifyData({ verified: true, tourist_data: tourist });
                } finally {
                  setVerifyLoading(false);
                }
              }
            }}
          >
            🪪 My ID
          </button>

          {/* SOS History */}
          <button
            style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--sy-text-muted)', cursor: 'pointer', padding: '6px 8px', fontFamily: 'inherit', fontWeight: 600 }}
            onClick={() => navigate('/tourist/sos-history')}
          >
            📋 History
          </button>

          {/* End Journey — with confirmation */}
          <button
            style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--sy-text-muted)', cursor: 'pointer', padding: '6px 8px', fontFamily: 'inherit', fontWeight: 600 }}
            onClick={() => setShowEndConfirm(true)}
          >
            End Journey
          </button>
        </div>
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: 'relative' }}>

        {/* GPS Loading Overlay */}
        {locLoading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2000,
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid var(--sy-primary-lighter)', borderTopColor: 'var(--sy-primary)', animation: 'spin 0.8s linear infinite' }}></div>
            <p style={{ fontWeight: 700, fontSize: 16 }}>Acquiring your GPS location…</p>
            <p style={{ color: 'var(--sy-text-secondary)', fontSize: 13 }}>Please allow location access when your browser asks</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── Toast Notifications — top-right corner ── */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 1500,
          display: 'flex', flexDirection: 'column', gap: 8,
          maxWidth: 340, width: 'calc(100% - 24px)',
          pointerEvents: 'none',
        }}>

          {/* GPS Disabled Toast */}
          {!gpsOn && (
            <div className="sy-toast" style={{
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(12px)',
              color: 'white',
              pointerEvents: 'auto',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>📍</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 13 }}>GPS Turned Off</p>
                <p style={{ fontSize: 11, opacity: 0.75, marginTop: 2, lineHeight: 1.4 }}>
                  Last saved location used for SOS. Tap "GPS Off" to re-enable.
                </p>
              </div>
            </div>
          )}

          {/* GPS Error Toast */}
          {locError && !locLoading && (
            <div className="sy-toast" style={{
              background: 'rgba(255, 251, 235, 0.97)',
              border: '1px solid #fbbf24',
              pointerEvents: 'auto',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 12, color: '#92400e' }}>GPS Unavailable</p>
                <p style={{ fontSize: 11, color: '#b45309', marginTop: 2, lineHeight: 1.4 }}>
                  {locError} Showing approx. location.
                </p>
              </div>
            </div>
          )}

          {/* High-Risk Area Toast */}
          {risk?.risk_level === 'red' && !locError && (
            <div className="sy-toast" style={{
              background: 'rgba(220, 38, 38, 0.95)',
              backdropFilter: 'blur(12px)',
              color: 'white',
              boxShadow: '0 4px 20px rgba(220, 38, 38, 0.4)',
              pointerEvents: 'auto',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0, animation: 'sos-pulse 2s infinite' }}>🚨</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>High-Risk Zone</p>
                <p style={{ fontSize: 11, opacity: 0.9, marginTop: 2, lineHeight: 1.4 }}>{risk.recommended_action}</p>
              </div>
            </div>
          )}

          {/* Yellow Risk Toast */}
          {risk?.risk_level === 'yellow' && (
            <div className="sy-toast" style={{
              background: 'rgba(255, 251, 235, 0.97)',
              border: '1px solid #fbbf24',
              pointerEvents: 'auto',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 12, color: '#92400e' }}>{risk.recommended_action}</p>
                {risk.danger_zones?.length > 0 && (
                  <p style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                    Near: {risk.danger_zones[0].name}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={pos ? 16 : 5}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            attribution='&copy; Google Maps'
          />

          {/* Auto-pan to real position */}
          {pos && <MapPanner pos={pos} />}

          {/* Your Real Location — Blue Dot */}
          {pos && (
            <>
              {/* Accuracy radius circle */}
              {accuracy && (
                <Circle
                  center={[pos.lat, pos.lng]}
                  radius={accuracy}
                  pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.08, weight: 1, dashArray: '4' }}
                />
              )}
              {/* Blue dot — your real position */}
              <Marker position={[pos.lat, pos.lng]} icon={youIcon}>
                <Popup>
                  <strong>📍 {tourist?.name || 'You are here'}</strong><br />
                  Lat: {pos.lat.toFixed(6)}<br />
                  Lng: {pos.lng.toFixed(6)}<br />
                  GPS Accuracy: ±{accuracy ? Math.round(accuracy) : '?'}m<br />
                  Risk: {risk?.risk_score || '…'}/100<br />
                  Battery: {battery}%
                </Popup>
              </Marker>
            </>
          )}

          {/* Danger Zones */}
          {zones.map((zone, i) => (
            <Circle
              key={i}
              center={[zone.geometry.coordinates[1], zone.geometry.coordinates[0]]}
              radius={zone.properties.radius_km * 1000}
              pathOptions={{
                color: zone.properties.color,
                fillColor: zone.properties.color,
                fillOpacity: 0.1,
                weight: 1.5,
              }}
            >
              <Popup>
                <strong>{zone.properties.name}</strong><br />
                Type: {zone.properties.zone_type}<br />
                Risk: ×{zone.properties.risk_multiplier}
              </Popup>
            </Circle>
          ))}
        </MapContainer>

        {/* Secondary Risk Banner — only shows for yellow (not red, which already has the big one) */}

        {/* ── Bottom-right toast stack: network status / SOS queue / sync ── */}
        <div style={{
          position: 'absolute', bottom: 110, right: 12, zIndex: 1200,
          display: 'flex', flexDirection: 'column', gap: 8,
          maxWidth: 320, width: 'calc(100% - 24px)',
          pointerEvents: 'none',
        }}>

          {/* Live Network Status Pill — always visible */}
          <div className="sy-toast" style={{
            background: networkOnline
              ? 'rgba(16, 185, 129, 0.92)'
              : 'rgba(239, 68, 68, 0.92)',
            backdropFilter: 'blur(10px)',
            color: 'white',
            padding: '8px 14px',
            pointerEvents: 'none',
            alignSelf: 'flex-end',
          }}>
            <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} />
              {networkOnline && (
                <div style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.5)', animation: 'sos-pulse 2s infinite' }} />
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {networkOnline ? 'Network Online' : 'Network Offline — SOS queued'}
            </span>
          </div>

          {/* Offline SOS Queue Toast */}
          {pendingSOSCount > 0 && syncStatus !== 'synced' && (
            <div className="sy-toast" style={{
              background: syncStatus === 'syncing'
                ? 'rgba(16, 185, 129, 0.95)'
                : 'rgba(180, 83, 9, 0.95)',
              backdropFilter: 'blur(12px)',
              color: 'white',
              pointerEvents: 'auto',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>
                {syncStatus === 'syncing' ? '📤' : '📦'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 12 }}>
                  {syncStatus === 'syncing'
                    ? `Auto-sending ${pendingSOSCount} queued alert${pendingSOSCount > 1 ? 's' : ''}…`
                    : `${pendingSOSCount} SOS queued — awaiting network`}
                </p>
                <p style={{ fontSize: 10, opacity: 0.85, marginTop: 2, lineHeight: 1.3 }}>
                  {syncStatus === 'syncing'
                    ? 'Transmitting to national emergency grid…'
                    : 'Will auto-transmit the moment network is detected.'}
                </p>
              </div>
              {syncStatus !== 'syncing' && (
                <button
                  onClick={() => flushQueueRef.current?.()}
                  style={{
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    background: 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.35)',
                    borderRadius: 6, color: 'white',
                    padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >Retry Now</button>
              )}
            </div>
          )}

          {/* Sync Success Toast */}
          {syncStatus === 'synced' && (
            <div className="sy-toast" style={{
              background: 'rgba(16, 185, 129, 0.95)',
              backdropFilter: 'blur(12px)',
              color: 'white',
              pointerEvents: 'auto',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>✅</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 12 }}>SOS auto-transmitted!</p>
                <p style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>Authority command center has been notified.</p>
              </div>
            </div>
          )}

        </div>

        {/* GPS Status Pill — bottom-left, compact */}
        <div style={{ position: 'absolute', bottom: 110, left: 12, zIndex: 1000 }}>
          {pendingSOSCount === 0 && syncStatus !== 'synced' && (
            <span className="sy-data-label">📡 {gpsOn && pos ? 'Live GPS Active' : 'GPS Disabled'}</span>
          )}
        </div>

        {/* SOS Button */}
        <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, textAlign: 'center' }}>
          <button
            className="sy-sos-btn"
            onClick={handleSOS}
            disabled={sosLoading || locLoading}
            style={{ opacity: locLoading ? 0.5 : 1 }}
          >
            {sosLoading ? '…' : 'SOS'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--sy-text-muted)', marginTop: 6 }}>
            {locLoading ? 'Waiting for GPS…' : t('travel.sosHold', lang)}
          </p>
        </div>
      </div>

      {/* ── Full-Screen Verified ID Card Modal ── */}
      {showIdCard && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(26, 26, 26, 0.5)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div className="sy-fade-in" style={{
            maxWidth: 400, width: '100%', background: 'var(--sy-surface)',
            borderRadius: 'var(--sy-radius-lg)', overflow: 'hidden',
            boxShadow: 'var(--sy-shadow-float)',
          }}>
            {/* Card Header */}
            <div style={{ padding: '24px 24px 16px', textAlign: 'center', borderBottom: '1px solid var(--sy-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sy-primary)', letterSpacing: '0.05em' }}>SENTRIX DIGITAL ID</span>
                <button
                  onClick={() => setShowIdCard(false)}
                  style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--sy-text-muted)', padding: 4 }}
                >✕</button>
              </div>

              {verifyLoading ? (
                <div style={{ padding: '40px 0' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--sy-border)', borderTopColor: 'var(--sy-primary)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }}></div>
                  <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)', marginTop: 12 }}>Verifying on Blockchain...</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                <>
                  {/* QR Code */}
                  {tourist?.id_hash && (
                    <div style={{ display: 'inline-block', padding: 12, background: 'white', borderRadius: 10, border: '1px solid var(--sy-border)', marginBottom: 12 }}>
                      <QRCodeSVG
                        value={JSON.stringify({ sentrix_id: tourist.tourist_id, id_hash: tourist.id_hash, name: tourist.name })}
                        size={140}
                        level="M"
                        fgColor="#1A1A1A"
                      />
                    </div>
                  )}

                  {/* Verification Badge — only show when actually verified */}
                  <div style={{ marginBottom: 8 }}>
                    {verifyData?.verified ? (
                      <span className="sy-badge sy-badge-green" style={{ padding: '6px 14px' }}>✅ Blockchain Verified</span>
                    ) : verifyData ? (
                      <span className="sy-badge sy-badge-yellow" style={{ padding: '6px 14px' }}>⏳ Verification Pending</span>
                    ) : (
                      <span className="sy-badge sy-badge-blue" style={{ padding: '6px 14px' }}>🔗 On-Chain ID</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Card Body */}
            {!verifyLoading && (
              <div style={{ padding: '20px 24px 24px' }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>{tourist?.name}</h2>
                <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--sy-text-secondary)', marginBottom: 16 }}>
                  {tourist?.nationality || 'Tourist'} · {tourist?.id_type || 'Verified'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sentrix ID</span>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--sy-primary)', fontFamily: 'monospace' }}>{tourist?.tourist_id || 'N/A'}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Blood Group</span>
                    <p style={{ fontSize: 14, fontWeight: 700 }}>{tourist?.blood_group || '—'}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Trip Start</span>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{tourist?.trip_start || 'N/A'}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Trip End</span>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{tourist?.trip_end || 'N/A'}</p>
                  </div>
                  {tourist?.medical_conditions && (
                    <div style={{ gridColumn: 'span 2', padding: '10px 14px', background: 'var(--sy-red-light)', borderRadius: 8, border: '1px solid #fca5a5' }}>
                      <span style={{ fontSize: 11, color: 'var(--sy-red)', fontWeight: 700, textTransform: 'uppercase' }}>⚕️ Medical Conditions</span>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sy-red)', marginTop: 2 }}>{tourist.medical_conditions}</p>
                    </div>
                  )}
                </div>

                {/* Emergency Contact */}
                {tourist?.emergency_contact && (
                  <div style={{ padding: '12px 16px', background: 'var(--sy-bg)', borderRadius: 'var(--sy-radius-sm)', border: '1px solid var(--sy-border)', marginBottom: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sy-text-muted)', textTransform: 'uppercase' }}>Emergency Contact</span>
                    <p style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>📞 {tourist.emergency_contact}</p>
                  </div>
                )}

                {/* Hash Footer */}
                {(verifyData?.block_hash || tourist?.id_hash) && (
                  <div style={{ padding: 10, background: '#1a1a1a', borderRadius: 8, textAlign: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#10b981', wordBreak: 'break-all' }}>
                      🔗 {(verifyData?.block_hash || tourist?.id_hash)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── End Journey Confirmation Modal ── */}
      {showEndConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(26,26,26,0.6)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div className="sy-fade-in" style={{
            maxWidth: 360, width: '100%', background: 'var(--sy-surface)',
            borderRadius: 'var(--sy-radius-lg)', padding: 32,
            boxShadow: 'var(--sy-shadow-float)', textAlign: 'center',
          }}>
            <span style={{ fontSize: 40, display: 'block', marginBottom: 16 }}>🏁</span>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>End Your Journey?</h2>
            <p style={{ color: 'var(--sy-text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              This will end your active session. Your SOS history and Digital ID remain on the blockchain.
              You can recover your pass anytime from the home screen.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="sy-btn sy-btn-outline"
                style={{ flex: 1 }}
                onClick={() => setShowEndConfirm(false)}
              >
                Stay
              </button>
              <button
                className="sy-btn sy-btn-primary"
                style={{ flex: 1, background: 'var(--sy-red)' }}
                onClick={() => {
                  localStorage.setItem('sentrix_auto_login', 'false');
                  navigate('/tourist');
                }}
              >
                End Journey
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
