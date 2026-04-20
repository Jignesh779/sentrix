import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

// Leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const sosIcon = new L.DivIcon({
  html: '<div style="width:18px;height:18px;background:#e11d48;border-radius:50%;border:4px solid #fff;box-shadow:0 0 16px rgba(225,29,72,0.8);animation:sos-pulse 2s infinite;"></div>',
  iconSize: [26, 26],
  className: '',
});

export default function Dashboard() {
  const [tab, setTab] = useState(() => sessionStorage.getItem('sy_dashboard_tab') || 'overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = sessionStorage.getItem('sy_sidebar');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSidebar = () => {
    const nextState = !isSidebarOpen;
    setIsSidebarOpen(nextState);
    sessionStorage.setItem('sy_sidebar', nextState.toString());
  };
  const [alerts, setAlerts] = useState([]);
  const [zones, setZones] = useState([]);
  const [chainStats, setChainStats] = useState(null);
  const [trail, setTrail] = useState([]);
  const [connected, setConnected] = useState(false);
  const [dispatchingId, setDispatchingId] = useState(null); // tracks which alert is being actioned
  const [mlModel, setMlModel] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(1000);

  // ── WebSocket with auto-reconnect ──
  useEffect(() => {
    const connectWS = () => {
      const ws = new WebSocket(`${WS_URL}/ws/authority`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelayRef.current = 1000; // reset backoff
      };

      ws.onclose = () => {
        setConnected(false);
        // Exponential backoff: 1s → 2s → 4s → … max 30s
        const delay = Math.min(reconnectDelayRef.current, 30000);
        reconnectDelayRef.current = delay * 2;
        reconnectTimeoutRef.current = setTimeout(connectWS, delay);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'initial_state') {
          setAlerts(msg.data.alerts || []);
          setChainStats(msg.data.blockchain_stats);
        } else if (msg.type === 'new_alert') {
          setAlerts(prev => {
            if (prev.some(a => a.id === msg.data.id)) return prev;
            return [msg.data, ...prev];
          });
        } else if (msg.type === 'dispatch_update') {
          setAlerts(prev => prev.map(a => a.id === msg.data.alert_id ? { ...a, status: 'dispatched' } : a));
        } else if (msg.type === 'alert_resolved') {
          setAlerts(prev => prev.map(a => a.id === msg.data.alert_id ? { ...a, status: 'resolved' } : a));
        } else if (msg.type === 'alerts_cleared') {
          setAlerts([]);
        }
      };
    };

    connectWS();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    fetch(`${API}/api/geofence-data`).then(r => r.json()).then(d => setZones(d.features || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchStats = () => fetch(`${API}/api/blockchain/stats`).then(r => r.json()).then(setChainStats).catch(() => {});
    fetchStats();
    const iv = setInterval(fetchStats, 10000);
    return () => clearInterval(iv);
  }, []);

  // ── Fetch ML Model metadata ──
  useEffect(() => {
    fetch(`${API}/api/ml-model-info`).then(r => r.json()).then(setMlModel).catch(() => {});
  }, []);

  // ── Refresh alerts on every tab switch ──
  const handleTabSwitch = (id) => {
    setTab(id);
    sessionStorage.setItem('sy_dashboard_tab', id);
    fetch(`${API}/api/active-alerts`).then(r => r.json()).then(d => setAlerts(d.alerts || [])).catch(() => {});
  };

  const dispatchUnit = async (alertId, unitType) => {
    if (dispatchingId) return; // prevent double dispatch
    setDispatchingId(alertId + unitType);
    try {
      await fetch(`${API}/api/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId, unit_type: unitType }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setDispatchingId(null);
    }
  };

  const resolveAlert = async (alertId) => {
    if (dispatchingId) return;
    setDispatchingId(alertId + 'resolve');
    try {
      await fetch(`${API}/api/resolve/${alertId}`, { method: 'POST' });
    } finally {
      setDispatchingId(null);
    }
  };

  const fetchTrail = async (alertId) => {
    const res = await fetch(`${API}/api/blockchain/trail/${alertId}`);
    const data = await res.json();
    setTrail(data.trail || []);
  };

  const activeAlerts = alerts.filter(a => a.status !== 'resolved').sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
  const resolvedAlerts = alerts.filter(a => a.status === 'resolved');

  const formatBlockData = (data) => {
    if (data.action) return data.action;
    if (data.type === 'tourist_registered') return `Cryptographic identity established for tourist ${data.tourist_id} (${data.name}).`;
    if (data.type === 'sos_alert') return `Encrypted SOS payload received from ${data.tourist_id} at coordinates [${data.latitude?.toFixed(4)}, ${data.longitude?.toFixed(4)}].`;
    if (data.type === 'unit_dispatched') return `Emergency response unit (${data.unit_type?.toUpperCase()}) dispatched to assist incident ${data.alert_id}.`;
    if (data.type === 'incident_resolved') return `Incident ${data.alert_id} officially marked as securely resolved.`;
    return 'Secure ledger entry verified.';
  };

  const sidebarItems = [
    { id: 'overview', icon: '📊', label: 'System Overview' },
    { id: 'alerts', icon: '🚨', label: 'Active Emergencies' },
    { id: 'blockchain', icon: '🛡️', label: 'Security Audit' },
    { id: 'tourists', icon: '📋', label: 'Registered Visitors' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--sy-bg)' }}>
      {/* ── Ultra Premium Dark Sidebar ── */}
      <div style={{
        width: isSidebarOpen ? 300 : 88,
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
        color: '#f8fafc',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: isSidebarOpen ? '36px 24px' : '36px 16px',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 50,
        borderRight: '1px solid rgba(255,255,255,0.1)',
        overflowX: 'hidden'
      }}>
        <div 
          style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 44, cursor: 'pointer' }}
          onClick={toggleSidebar}
          title="Toggle Sidebar"
        >
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--sy-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(4,120,87,0.5)', flexShrink: 0, transition: 'all 0.3s' }}>
            <span style={{ fontSize: 20 }}>{isSidebarOpen ? '🛡️' : '☰'}</span>
          </div>
          <div style={{ opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.2s', whiteSpace: 'nowrap' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: 'white' }}>Sentrix</h2>
            <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>Command</p>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sidebarItems.map(item => (
            <div
              key={item.id}
              onClick={() => handleTabSwitch(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, 
                padding: isSidebarOpen ? '14px 18px' : '14px',
                justifyContent: isSidebarOpen ? 'flex-start' : 'center',
                borderRadius: '12px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
                background: tab === item.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: tab === item.id ? 'white' : '#cbd5e1',
                border: tab === item.id ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
                width: isSidebarOpen ? '100%' : '56px',
                margin: isSidebarOpen ? '0' : '0 auto',
              }}
              title={!isSidebarOpen ? item.label : undefined}
            >
              <span style={{ opacity: tab === item.id ? 1 : 0.6, fontSize: isSidebarOpen ? 18 : 22, transition: 'font-size 0.2s', flexShrink: 0 }}>{item.icon}</span>
              {isSidebarOpen && <span style={{ whiteSpace: 'nowrap', animation: 'fadeIn 0.2s' }}>{item.label}</span>}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Status Indicator */}
          <div style={{ 
            display: 'flex', alignItems: 'center', gap: 8, 
            padding: isSidebarOpen ? '12px 18px' : '12px 0', 
            justifyContent: isSidebarOpen ? 'flex-start' : 'center',
            background: 'rgba(0,0,0,0.3)', borderRadius: 12, marginTop: 8 
          }}>
            <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <div style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: connected ? '#10b981' : '#ef4444' }}></div>
              {connected && <div style={{ position: 'absolute', width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'sos-pulse 2s infinite' }}></div>}
            </div>
            {isSidebarOpen && (
              <span style={{ fontSize: 12, fontWeight: 700, color: connected ? '#10b981' : '#ef4444', letterSpacing: '0.05em', whiteSpace: 'nowrap', opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.2s' }}>
                {connected ? 'SECURE LINK ACTIVE' : 'CONNECTION LOST'}
              </span>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={() => {
              sessionStorage.removeItem('sy_auth');
              window.location.reload();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: isSidebarOpen ? '12px 18px' : '12px',
              justifyContent: isSidebarOpen ? 'flex-start' : 'center',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 12, cursor: 'pointer',
              color: '#fca5a5', fontSize: 13, fontWeight: 600,
              transition: 'all 0.2s', fontFamily: 'inherit',
              width: isSidebarOpen ? '100%' : '56px',
              margin: isSidebarOpen ? '0' : '0 auto',
            }}
            title="Logout"
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>🔓</span>
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ 
        marginLeft: isSidebarOpen ? 300 : 88, 
        width: `calc(100% - ${isSidebarOpen ? 300 : 88}px)`, 
        transition: 'margin 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        minHeight: '100vh', padding: '48px 64px' 
      }}>
        <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a', marginBottom: 4 }}>
              {tab === 'overview' ? 'System Overview' : tab === 'alerts' ? 'Active Emergencies' : tab === 'blockchain' ? 'Security Audit' : 'Registered Visitors'}
            </h1>
            <p style={{ color: 'var(--sy-text-secondary)', fontSize: 15, fontWeight: 500 }}>
              Sentrix Central Control · Ernakulam Data Center
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Blockchain health badge */}
            {chainStats?.is_valid && (chainStats?.chain_length || 0) > 1 && (
               <div className="sy-data-label" style={{ background: 'var(--sy-green-light)', borderColor: '#a7f3d0', color: 'var(--sy-green)' }}>
                  ✅ Blockchain Validation Passing
               </div>
            )}
          </div>
        </div>

        {/* ── Overview Tab ── */}
        {tab === 'overview' && (
          <div className="sy-fade-in">
            {/* ── Ultra-Premium Animated Stat Graphs ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 32 }}>
              
              {/* 1. Critical Alerts (Pulse Graph) */}
              <div className="sy-card" style={{ padding: '24px', borderLeft: `4px solid ${activeAlerts.length > 0 ? 'var(--sy-red)' : '#cbd5e1'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <span className="sy-stat-value" style={{ color: activeAlerts.length > 0 ? 'var(--sy-red)' : 'var(--sy-text)', fontSize: 36, lineHeight: 1 }}>{activeAlerts.length}</span>
                  <span className="sy-stat-label" style={{ marginTop: 8, display: 'block' }}>Critical Alerts</span>
                </div>
                <div style={{ width: 80, height: 40, display: 'flex', alignItems: 'flex-end', gap: 4, opacity: activeAlerts.length > 0 ? 1 : 0.2 }}>
                  {[40, 70, 40, 100, 50, 80, 30].map((h, j) => (
                    <div key={j} style={{ width: 6, height: `${h}%`, background: 'var(--sy-red)', borderRadius: 2, animation: `pulse-bar ${1 + j * 0.2}s infinite alternate ease-in-out` }}></div>
                  ))}
                </div>
              </div>

              {/* 2. Resolved Operations (Trending Up) */}
              <div className="sy-card" style={{ padding: '24px', borderLeft: '4px solid var(--sy-green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <span className="sy-stat-value" style={{ color: 'var(--sy-green)', fontSize: 36, lineHeight: 1 }}>{resolvedAlerts.length}</span>
                  <span className="sy-stat-label" style={{ marginTop: 8, display: 'block' }}>Resolved Ops</span>
                </div>
                <div style={{ width: 80, height: 40, position: 'relative' }}>
                  <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <path d="M0,50 L20,30 L40,40 L60,15 L80,25 L100,0" fill="none" stroke="var(--sy-green)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 200, strokeDashoffset: 200, animation: 'draw-line 2s forwards ease-out' }} />
                    <circle cx="100" cy="0" r="4" fill="var(--sy-green)" style={{ animation: 'fade-in 2s forwards' }} />
                  </svg>
                </div>
              </div>

              {/* 3. Blockchain Ledger (Node Link Graph) */}
              <div className="sy-card" style={{ padding: '24px', borderLeft: '4px solid var(--sy-blue)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <span className="sy-stat-value" style={{ color: 'var(--sy-blue)', fontSize: 36, lineHeight: 1 }}>{chainStats?.chain_length || 0}</span>
                  <span className="sy-stat-label" style={{ marginTop: 8, display: 'block' }}>Total Blocks Hash</span>
                </div>
                <div style={{ width: 80, height: 40, position: 'relative' }}>
                  <svg viewBox="0 0 100 50" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <line x1="10" y1="25" x2="40" y2="10" stroke="var(--sy-blue-light)" strokeWidth="2" />
                    <line x1="40" y1="10" x2="70" y2="40" stroke="var(--sy-blue-light)" strokeWidth="2" />
                    <line x1="70" y1="40" x2="90" y2="20" stroke="var(--sy-blue-light)" strokeWidth="2" />
                    {[ {x:10,y:25}, {x:40,y:10}, {x:70,y:40}, {x:90,y:20} ].map((pt, j) => (
                      <circle key={j} cx={pt.x} cy={pt.y} r="5" fill="var(--sy-blue)" style={{ animation: `pulse-op 1.5s infinite alternate ${j*0.3}s` }} />
                    ))}
                  </svg>
                </div>
              </div>

              {/* 4. Active Geofences (Radar Sweep) */}
              <div className="sy-card" style={{ padding: '24px', borderLeft: '4px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <span className="sy-stat-value" style={{ color: 'var(--sy-text)', fontSize: 36, lineHeight: 1 }}>{zones.length}</span>
                  <span className="sy-stat-label" style={{ marginTop: 8, display: 'block' }}>Active Geofences</span>
                </div>
                <div style={{ width: 44, height: 44, position: 'relative', borderRadius: '50%', border: '2px solid var(--sy-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', width: '100%', height: '100%', border: '1px solid var(--sy-border)', borderRadius: '50%', opacity: 0.5 }}></div>
                  <div style={{ width: '50%', height: '50%', transformOrigin: 'bottom right', position: 'absolute', top: 0, left: 0, background: 'linear-gradient(45deg, transparent, rgba(16, 185, 129, 0.4))', animation: 'spin 3s linear infinite' }}></div>
                  <div style={{ width: 4, height: 4, background: 'var(--sy-green)', borderRadius: '50%', zIndex: 2 }}></div>
                </div>
              </div>

            </div>

            {/* Map and Recent Feed Split */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              {/* Splendid Map Wrapper */}
              <div className="sy-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--sy-border)', background: 'var(--sy-surface)' }}>
                  <h3 style={{ fontWeight: 700, fontSize: 16 }}>Live Strategic Map</h3>
                  <span className="sy-data-label" style={{ marginTop: 6, background: '#f8fafc' }}>📡 Dispatch routed via ERSS-112 Intranet</span>
                </div>
                <div style={{ height: 500, width: '100%' }}>
                  <MapContainer center={[22.5, 78.5]} zoom={5} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false}>
                    <TileLayer
                      url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                      attribution='&copy; Google Maps'
                    />
                    {activeAlerts.map((alert, i) => (
                      <Marker key={i} position={[alert.latitude, alert.longitude]} icon={sosIcon}>
                        <Popup className="sy-popup">
                          <div style={{ padding: '4px 0' }}>
                            <strong style={{ fontSize: 14 }}>🚨 {alert.tourist_name}</strong><br />
                            <span style={{ color: 'var(--sy-text-secondary)', fontSize: 12 }}>{alert.nationality} | 🔋 {alert.battery_level != null ? `${alert.battery_level}%` : 'N/A'}</span><br />
                            <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 6px', background: 'var(--sy-red-light)', color: 'var(--sy-red)', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                              RISK: {alert.risk_score}
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                    {zones.map((zone, i) => (
                      <Circle
                        key={i}
                        center={[zone.geometry.coordinates[1], zone.geometry.coordinates[0]]}
                        radius={zone.properties.radius_km * 1000}
                        pathOptions={{ color: zone.properties.color, fillColor: zone.properties.color, fillOpacity: 0.1, weight: 1.5 }}
                      />
                    ))}
                  </MapContainer>
                </div>
              </div>

              {/* ── AI/ML Risk Intelligence Card ── */}
              {mlModel && mlModel.status === 'trained' && (
                <div className="sy-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🧠 AI/ML Risk Intelligence</h3>
                      <span className="sy-data-label" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: 'var(--sy-green)' }}>Phase 2 Model Active</span>
                    </div>
                    <span className="sy-badge sy-badge-green">Trained</span>
                  </div>

                  {/* Model Stats Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 12, border: '1px solid var(--sy-border)' }}>
                      <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Model Type</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sy-text)' }}>Random Forest + GBR</span>
                    </div>
                    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 12, border: '1px solid var(--sy-border)' }}>
                      <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Training Samples</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--sy-primary)' }}>{(mlModel.training_samples || 0).toLocaleString()}</span>
                    </div>
                    <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                      <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Classifier Accuracy</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--sy-green)' }}>{((mlModel.classifier_accuracy_cv5 || 0) * 100).toFixed(1)}%</span>
                      <span style={{ fontSize: 10, color: 'var(--sy-text-muted)', display: 'block', marginTop: 2 }}>±{((mlModel.classifier_accuracy_std || 0) * 100).toFixed(1)}% (5-fold CV)</span>
                    </div>
                    <div style={{ padding: '16px', background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe' }}>
                      <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Regressor R²</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--sy-blue)' }}>{(mlModel.regressor_r2_cv5 || 0).toFixed(3)}</span>
                      <span style={{ fontSize: 10, color: 'var(--sy-text-muted)', display: 'block', marginTop: 2 }}>±{(mlModel.regressor_r2_std || 0).toFixed(4)} (5-fold CV)</span>
                    </div>
                  </div>

                  {/* Feature Importance Bars */}
                  {mlModel.feature_importances && (
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--sy-text-secondary)' }}>Feature Importances (Random Forest)</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(mlModel.feature_importances).map(([name, val]) => {
                          const pct = (val * 100).toFixed(1);
                          const colors = {
                            battery_level: '#dc2626', altitude_m: '#7c3aed', zone_proximity: '#ea580c',
                            hour_ist: '#2563eb', weather_factor: '#0891b2', zone_risk_mult: '#d97706', num_nearby_zones: '#64748b',
                          };
                          const labels = {
                            battery_level: '🔋 Battery Level', altitude_m: '🏔️ Altitude', zone_proximity: '📍 Zone Proximity',
                            hour_ist: '🕐 Time of Day', weather_factor: '🌧️ Weather', zone_risk_mult: '⚠️ Zone Danger', num_nearby_zones: '🗺️ Nearby Zones',
                          };
                          return (
                            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, width: 140, flexShrink: 0, color: 'var(--sy-text-secondary)' }}>{labels[name] || name}</span>
                              <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(pct * 2.8, 100)}%`, height: '100%', background: colors[name] || 'var(--sy-primary)', borderRadius: 4, transition: 'width 1s ease' }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700, width: 44, textAlign: 'right', color: colors[name] || 'var(--sy-text)' }}>{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Operations Feed */}
              <div className="sy-card" style={{ display: 'flex', flexDirection: 'column', padding: '24px' }}>
                <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Live Dispatch Feed</h3>
                {alerts.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: 0.5 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>Awaiting Signals</p>
                    <p style={{ fontSize: 12 }}>System is fully operational</p>
                  </div>
                ) : (
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {alerts.slice(0, 6).map((alert, i) => (
                      <div key={i} style={{ padding: '16px', background: '#f8fafc', border: '1px solid var(--sy-border)', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <span className={`sy-badge ${alert.severity === 'critical' ? 'sy-badge-red' : 'sy-badge-yellow'}`} style={{ marginBottom: 6, display: 'inline-block', marginRight: 6 }}>
                              {alert.severity}
                            </span>
                            {alert.location_source?.includes('GSM') && (
                              <span className="sy-badge sy-badge-yellow" style={{ marginBottom: 6, display: 'inline-block' }}>📍 GSM SIMULATED</span>
                            )}
                            <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{alert.tourist_name}</p>
                            <p style={{ fontSize: 12, color: 'var(--sy-text-secondary)', marginTop: 2 }}>{alert.nationality} · Risk: {alert.risk_score}</p>
                          </div>
                          <span className={`sy-badge ${alert.status === 'resolved' ? 'sy-badge-green' : alert.status === 'dispatched' ? 'sy-badge-blue' : 'sy-badge-red'}`}>
                            {alert.status}
                          </span>
                        </div>
                        {alert.status === 'active' && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                              className="sy-btn sy-btn-primary"
                              style={{ padding: '8px 14px', fontSize: 12, flex: 1, opacity: dispatchingId ? 0.6 : 1 }}
                              disabled={!!dispatchingId}
                              onClick={() => dispatchUnit(alert.id, 'police')}
                            >Dispatch</button>
                            <button
                              className="sy-btn sy-btn-outline"
                              style={{ padding: '8px 14px', fontSize: 12, flex: 1, opacity: dispatchingId ? 0.6 : 1 }}
                              disabled={!!dispatchingId}
                              onClick={() => resolveAlert(alert.id)}
                            >Clear</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {/* View All link */}
                {alerts.length > 6 && (
                  <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--sy-primary)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                      onClick={() => handleTabSwitch('alerts')}
                    >
                      View All {alerts.length} Emergencies →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Alerts Tab ── */}
        {tab === 'alerts' && (
          <div className="sy-fade-in">
            {activeAlerts.length === 0 ? (
              <div className="sy-card" style={{ textAlign: 'center', padding: '64px 20px', borderStyle: 'dashed', borderWidth: 2 }}>
                <span style={{ fontSize: 56 }}>🛡️</span>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>All Clear</h3>
                <p style={{ color: 'var(--sy-text-secondary)', marginTop: 4 }}>No emergency operations currently active in any sector.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {activeAlerts.map((alert, i) => (
                  <div key={i} className="sy-card sy-fade-in" style={{ padding: 32 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <h3 style={{ fontSize: 22, fontWeight: 800 }}>{alert.tourist_name}</h3>
                          <span className={`sy-badge ${alert.severity === 'critical' ? 'sy-badge-red' : 'sy-badge-yellow'}`}>{alert.severity} Incident</span>
                        </div>
                        <p style={{ color: 'var(--sy-text-secondary)', fontSize: 14 }}>
                          ID: <strong style={{ fontFamily: 'monospace' }}>{alert.tourist_id}</strong> · {alert.nationality} · {new Date(alert.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className={`sy-risk-circle ${alert.risk_level === 'red' ? 'sy-risk-red' : alert.risk_level === 'yellow' ? 'sy-risk-yellow' : 'sy-risk-green'}`} style={{ width: 56, height: 56, fontSize: 20 }}>
                        {Math.round(alert.risk_score)}
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24, padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--sy-border)' }}>
                      <div className="sy-stat"><span className="sy-stat-label">Battery Level</span><span style={{ fontWeight: 800, fontSize: 18, color: alert.battery_level != null && alert.battery_level < 15 ? 'var(--sy-red)' : 'var(--sy-text)' }}>🔋 {alert.battery_level != null ? `${alert.battery_level}%` : 'N/A'}</span></div>
                      <div className="sy-stat">
                        <span className="sy-stat-label">Lat / Lng Data Source</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: alert.location_source?.includes('GSM') ? '#b45309' : '#0f172a' }}>
                           {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)} <br/>
                           <small style={{ fontWeight: 500, fontSize: 11, opacity: 0.8 }}>{alert.location_source || "GPS Direct"}</small>
                        </span>
                      </div>
                      <div className="sy-stat"><span className="sy-stat-label">Triggered Via</span><span style={{ fontWeight: 700, fontSize: 15 }}>{alert.triggered_via}</span></div>
                      <div className="sy-stat"><span className="sy-stat-label">Current Phase</span><span className={`sy-badge ${alert.status === 'dispatched' ? 'sy-badge-blue' : 'sy-badge-red'}`} style={{ width: 'fit-content' }}>{alert.status.toUpperCase()}</span></div>
                    </div>
                    
                    {/* SOS Layers Array Detail */}
                    {alert.sos_layers && (
                      <div style={{ marginBottom: 24 }}>
                        <h4 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sy-text-secondary)', marginBottom: 8, fontWeight: 700 }}>Signal Redundancy Status</h4>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {alert.sos_layers.map((l, j) => (
                            <span key={j} className={`sy-badge ${l.status === 'success' ? 'sy-badge-green' : l.status === 'failed' ? 'sy-badge-red' : 'sy-badge-yellow'}`} style={{ padding: '8px 12px' }}>
                              <span style={{ opacity: 0.6, marginRight: 4 }}>L{l.layer}</span> {l.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Dispatch Action Bar */}
                    <div style={{ display: 'flex', gap: 12, paddingTop: 24, borderTop: '1px solid var(--sy-border)', width: '100%' }}>
                      <button
                        className="sy-btn sy-btn-primary"
                        disabled={!!dispatchingId}
                        style={{ flex: '1 1 auto', opacity: dispatchingId ? 0.6 : 1, whiteSpace: 'nowrap', padding: '12px 8px', textAlign: 'center' }}
                        onClick={() => dispatchUnit(alert.id, 'police')}
                      >{dispatchingId === alert.id + 'police' ? '⏳ Dispatching…' : '🚔 Deploy Police Unit'}</button>
                      <button
                        className="sy-btn sy-btn-primary"
                        style={{ flex: '1 1 auto', background: '#2563eb', opacity: dispatchingId ? 0.6 : 1, whiteSpace: 'nowrap', padding: '12px 8px', textAlign: 'center' }}
                        disabled={!!dispatchingId}
                        onClick={() => dispatchUnit(alert.id, 'ambulance')}
                      >{dispatchingId === alert.id + 'ambulance' ? '⏳ Dispatching…' : '🚑 Deploy Ambulance'}</button>
                      <button
                        className="sy-btn sy-btn-primary"
                        style={{ flex: '1 1 auto', background: '#7c3aed', opacity: dispatchingId ? 0.6 : 1, whiteSpace: 'nowrap', padding: '12px 8px', textAlign: 'center' }}
                        disabled={!!dispatchingId}
                        onClick={() => dispatchUnit(alert.id, 'disaster_response')}
                      >{dispatchingId === alert.id + 'disaster_response' ? '⏳ Dispatching…' : '🆘 Disaster Response'}</button>
                      
                      <button 
                        className="sy-btn sy-btn-outline" 
                        style={{ flex: '1 1 auto', whiteSpace: 'nowrap', padding: '12px 8px', textAlign: 'center' }}
                        onClick={() => { fetchTrail(alert.id); handleTabSwitch('blockchain'); }}
                      >🔗 View Chain Trail</button>
                      <button
                        className="sy-btn sy-btn-outline"
                        style={{ flex: '1 1 auto', borderColor: 'var(--sy-green)', color: 'var(--sy-green)', opacity: dispatchingId ? 0.6 : 1, whiteSpace: 'nowrap', padding: '12px 8px', textAlign: 'center' }}
                        disabled={!!dispatchingId}
                        onClick={() => resolveAlert(alert.id)}
                      >{dispatchingId === alert.id + 'resolve' ? '⏳ Resolving…' : '✅ Mark Resolved'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Blockchain Tab ── */}
        {tab === 'blockchain' && (
          <div className="sy-fade-in">
            {chainStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                <div className="sy-card"><div className="sy-stat"><span className="sy-stat-value">{chainStats.chain_length}</span><span className="sy-stat-label">Total Valid Blocks</span></div></div>
                <div className="sy-card"><div className="sy-stat"><span className="sy-stat-value">{chainStats.total_digital_ids}</span><span className="sy-stat-label">Secured Identities</span></div></div>
                <div className="sy-card"><div className="sy-stat"><span className="sy-stat-value">{chainStats.total_sos_records}</span><span className="sy-stat-label">SOS Events Locked</span></div></div>
                <div className="sy-card"><div className="sy-stat"><span className="sy-stat-value">{chainStats.total_dispatches}</span><span className="sy-stat-label">Dispatches Proven</span></div></div>
              </div>
            )}
            
            <div className="sy-card" style={{ marginBottom: 24, border: '1px solid #cbd5e1', background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: 18, color: '#0f172a' }}>Global Chain Integrity</h3>
                  <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)', marginTop: 2 }}>
                    Protocol: <strong>{chainStats?.network || 'Enterprise Distributed Ledger (SentrixChain)'}</strong>
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="sy-data-label" style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>🔒 AES-256 ENCRYPTED · ZERO PII</span>
                  <span className={`sy-badge ${chainStats?.is_valid ? 'sy-badge-green' : 'sy-badge-red'}`} style={{ padding: '8px 16px', fontSize: 14 }}>
                    {chainStats?.is_valid ? '✅ Network Valid' : '❌ Tamper Detected'}
                  </span>
                </div>
              </div>
              {chainStats?.latest_hash && (
                <div style={{ marginTop: 16, padding: '16px', background: '#020617', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontFamily: 'monospace', fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ padding: '4px 8px', background: '#10b981', color: '#020617', borderRadius: 4, fontSize: 10, fontWeight: 900 }}>SIGNATURE</div>
                  <div style={{ opacity: 0.8, letterSpacing: '0.1em' }}>
                    {chainStats.latest_hash.slice(0, 8)}••••••••••••••••••••••••••••{chainStats.latest_hash.slice(-8)}
                  </div>
                </div>
              )}
            </div>

            {/* Audit Trail */}
            {trail.length > 0 && (
              <div className="sy-card">
                <h3 style={{ fontWeight: 800, fontSize: 18, marginBottom: 20 }}>Event Audit Trail</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {trail.map((block, i) => (
                    <div key={i} style={{ display: 'flex', gap: 20, padding: '20px', background: 'var(--sy-bg)', borderRadius: '12px', borderLeft: '4px solid var(--sy-primary)' }}>
                      <div style={{ width: 48, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 24, marginBottom: 4 }}>
                          {block.data.type === 'sos_alert' ? '🚨' : block.data.type === 'unit_dispatched' ? '🚔' : block.data.type === 'incident_resolved' ? '✅' : '🔗'}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--sy-primary)' }}>B-{block.index}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <h4 style={{ fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#0f172a' }}>
                            {block.data.type?.replace(/_/g, ' ')}
                          </h4>
                          <span style={{ fontSize: 12, color: 'var(--sy-text-muted)', fontFamily: 'monospace' }}>
                            {new Date(block.timestamp * 1000).toISOString()}
                          </span>
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--sy-text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>
                          {formatBlockData(block.data)}
                        </p>
                        <div style={{ padding: '8px 12px', background: '#e2e8f0', borderRadius: '6px', fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                          Signature: {block.hash.slice(0, 12)}••••••••••••{block.hash.slice(-12)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tourists Tab ── */}
        {tab === 'tourists' && <TouristsTab />}
      </div>
    </div>
  );
}

function TouristsTab() {
  const [tourists, setTourists] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/registered-tourists`).then(r => r.json()).then(d => setTourists(d.tourists || [])).catch(() => {});
  }, []);

  return (
    <div className="sy-fade-in">
      {tourists.length === 0 ? (
        <div className="sy-card" style={{ textAlign: 'center', padding: 64, borderStyle: 'dashed', borderWidth: 2 }}>
          <span style={{ fontSize: 56 }}>👤</span>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>Empty Registry</h3>
          <p style={{ color: 'var(--sy-text-secondary)', marginTop: 4 }}>No tourists have registered on the network yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
          {[...tourists].reverse().map((t, i) => (
            <div key={i} className="sy-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {t.nationality === 'Indian' ? '🇮🇳' : '🌐'}
                  </div>
                  <div>
                    <h3 style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</h3>
                    <p style={{ fontSize: 12, color: 'var(--sy-text-secondary)', fontWeight: 600 }}>{t.nationality}</p>
                  </div>
                </div>
                <span className={`sy-badge ${t.status === 'sos' ? 'sy-badge-red' : t.status === 'rescued' ? 'sy-badge-green' : 'sy-badge-blue'}`}>
                  {t.status.toUpperCase()}
                </span>
              </div>
              
              <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--sy-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--sy-text-secondary)' }}>Secure ID</span>
                  <strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{t.tourist_id}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--sy-text-secondary)' }}>Medical</span>
                  <strong style={{ fontSize: 13 }}>Blood {t.blood_group || 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--sy-text-secondary)' }}>Verified Through</span>
                  <strong style={{ fontSize: 13 }}>{t.id_type}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
