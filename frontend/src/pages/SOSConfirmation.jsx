import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { t } from '../i18n';

const API = import.meta.env.VITE_API_URL || '';
const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

export default function SOSConfirmation({ lang }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { sosData, tourist, isOffline, layer_used } = location.state || {};

  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [rescueStatus, setRescueStatus] = useState(null);
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [hasNetworkRestored, setHasNetworkRestored] = useState(false);
  const wsRef = useRef(null);
  const syncSuccessRef = useRef(false);

  // ── Sync function: sends queued SOS to server ──
  const trySync = async () => {
    if (!tourist || !sosData || syncSuccessRef.current) return;
    setSyncing(true);
    setSyncError(false);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${API}/api/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourist_id: tourist.tourist_id,
          latitude: sosData.location?.lat,
          longitude: sosData.location?.lng,
          battery_level: sosData.battery_level ?? 50,
          triggered_via: 'offline_queue_sync',
          location_source: sosData.location_source || 'Last Known Position',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      syncSuccessRef.current = true;
      setSyncSuccess(true);
      setSyncing(false);

      try { localStorage.removeItem('sy_sos_queue'); } catch {
        // ignore
      }

      setTimeout(() => {
        navigate('/tourist/sos', {
          state: { sosData: data, tourist, layer_used: 'Layer 1 (Auto-Synced from Cache)', isOffline: false },
          replace: true,
        });
      }, 2500);
    } catch {
      setSyncing(false);
      setSyncError(true);
    }
  };

  // ── Network event listeners ──
  // When browser detects real WiFi/network restore, auto-triggers sync.
  // No user action required.
  useEffect(() => {
    const handleOnline = () => {
      setNetworkOnline(true);
      setHasNetworkRestored(true);
    };
    const handleOffline = () => {
      setNetworkOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Auto-Sync Retry Loop ──
  // Only fires after a real offline→online transition.
  // Retries every 4 seconds until the SOS is delivered.
  useEffect(() => {
    if (!isOffline || !hasNetworkRestored || syncSuccess) return;

    const attemptSync = () => {
      if (!syncSuccessRef.current) trySync();
    };

    const initialDelay = setTimeout(attemptSync, 1000);
    const intervalId = setInterval(attemptSync, 4000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNetworkRestored, syncSuccess, isOffline]);

  // ── Live rescue status via WebSocket ──
  useEffect(() => {
    if (!tourist?.tourist_id) return;
    const ws = new WebSocket(`${WS_URL}/ws/tourist/${tourist.tourist_id}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'help_dispatched' || msg.type === 'resolved') {
          setRescueStatus(msg);
        }
      } catch { /* ignore malformed */ }
    };
    return () => ws.close();
  }, [tourist?.tourist_id]);

  if (!sosData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--sy-text-secondary)' }}>
          No SOS data.{' '}
          <button
            onClick={() => navigate('/tourist/travel')}
            style={{ color: 'var(--sy-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >← Go Back</button>
        </p>
      </div>
    );
  }

  // ── Offline Queued SOS Page ──
  if (isOffline) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--sy-bg)' }}>
        <div style={{ maxWidth: 480, width: '100%' }} className="sy-fade-in">

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 80, height: 80, borderRadius: '50%',
              background: syncSuccess ? 'var(--sy-green-light)' : 'var(--sy-yellow-light)',
              marginBottom: 16, transition: 'background 0.5s',
            }}>
              <span style={{ fontSize: 40 }}>{syncSuccess ? '✅' : '📦'}</span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px' }}>
              {syncSuccess ? 'SOS Delivered!' : 'SOS Saved Offline'}
            </h1>
            <p style={{ color: 'var(--sy-text-secondary)', fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
              {syncSuccess
                ? 'Your alert has been transmitted to the authority dashboard.'
                : 'No internet detected. Your SOS is safely stored on this device and will auto-send the moment connectivity is restored.'}
            </p>
          </div>

          {/* Status Card */}
          <div style={{
            padding: '20px 24px', borderRadius: 14,
            background: syncSuccess ? 'var(--sy-green-light)' : syncError ? '#fff7ed' : 'var(--sy-yellow-light)',
            border: `1px solid ${syncSuccess ? '#bbf7d0' : syncError ? '#fed7aa' : '#fde68a'}`,
            marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.4s',
          }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>
              {syncSuccess ? '✅' : syncing ? '📤' : syncError ? '⏳' : '📡'}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                {syncSuccess ? 'Transmitted — Authority Notified'
                  : syncing ? 'Network detected! Sending now…'
                  : syncError ? 'Still waiting for network…'
                  : 'Layer 3: Offline Cache → Auto-Sync'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--sy-text-secondary)', marginTop: 3 }}>
                {syncSuccess ? 'Help is on the way.'
                  : syncing ? 'Uploading SOS to national emergency grid…'
                  : syncError ? 'Sync failed. Will retry automatically.'
                  : 'Waiting for WiFi / mobile data to restore…'}
              </p>
            </div>
            {syncing && (
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #a7f3d0', borderTopColor: 'var(--sy-primary)', animation: 'spin 1s linear infinite', flexShrink: 0 }}></div>
            )}
          </div>

          {/* Live Network Status */}
          <div style={{
            padding: '12px 18px', borderRadius: 10, marginBottom: 20,
            background: networkOnline ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${networkOnline ? '#a7f3d0' : '#fca5a5'}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: networkOnline ? '#10b981' : '#ef4444' }}></div>
              {!networkOnline && (
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid #ef4444', opacity: 0.5, animation: 'sos-pulse 2s infinite' }}></div>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: networkOnline ? '#047857' : '#dc2626' }}>
              {networkOnline ? '● Network Online — Auto-syncing…' : '● Network Offline — Scanning for signal…'}
            </span>
          </div>

          {/* Location Info */}
          {sosData.location && (
            <div style={{ padding: '14px 18px', background: 'var(--sy-surface)', border: '1px solid var(--sy-border)', borderRadius: 10, marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: 'var(--sy-text-secondary)', marginBottom: 4 }}>Last Known Position</p>
              <p style={{ fontSize: 14, fontWeight: 700 }}>📍 {sosData.location_source || 'GPS Location'}</p>
              <p style={{ fontSize: 11, color: 'var(--sy-text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                {sosData.location.lat?.toFixed(4)}°N, {sosData.location.lng?.toFixed(4)}°E
              </p>
            </div>
          )}

          {/* SOS ID */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span className="sy-badge sy-badge-yellow" style={{ fontSize: 11 }}>
              📦 Queued SOS ID: {sosData.alert_id}
            </span>
          </div>

          {/* Live Rescue Status */}
          {rescueStatus && (
            <div className="sy-fade-in" style={{
              padding: '16px 20px', borderRadius: 14, marginBottom: 20,
              background: rescueStatus.type === 'resolved' ? 'var(--sy-green-light)' : 'rgba(37,99,235,0.1)',
              border: `1px solid ${rescueStatus.type === 'resolved' ? '#bbf7d0' : '#bfdbfe'}`,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ fontSize: 28 }}>{rescueStatus.type === 'resolved' ? '✅' : '🚁'}</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 14, color: rescueStatus.type === 'resolved' ? 'var(--sy-green)' : '#1d4ed8' }}>
                  {rescueStatus.type === 'resolved' ? 'You are safe — Rescue complete' : 'Help is on the way!'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--sy-text-secondary)', marginTop: 2 }}>
                  {rescueStatus.type === 'resolved'
                    ? 'Rescue recorded on blockchain.'
                    : `${rescueStatus.data?.unit_name} dispatched${rescueStatus.data?.eta_minutes ? ` — ETA ~${rescueStatus.data.eta_minutes} min` : ''}`}
                </p>
              </div>
            </div>
          )}

          {/* Demo Force-Send button */}
          {!syncSuccess && (
            <button
              className="sy-btn sy-btn-primary"
              style={{
                width: '100%', marginBottom: 12, padding: '14px 20px',
                fontSize: 15, fontWeight: 800, borderRadius: 12,
                background: syncing ? 'rgba(214,109,81,0.5)' : 'var(--sy-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
              onClick={trySync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.8s linear infinite' }}></div>
                  Auto-Transmitting SOS…
                </>
              ) : (
                <>📶 Demo: Force Send Now</>
              )}
            </button>
          )}

          <button
            className="sy-btn sy-btn-outline"
            style={{ width: '100%' }}
            onClick={() => navigate('/tourist/travel', { state: { tourist } })}
          >
            ← Back to Travel View
          </button>
        </div>
      </div>
    );
  }

  // ── Online SOS Success Page ──
  const sosResult = sosData.sos_result;
  const risk = sosData.risk_assessment;

  if (!sosResult) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--sy-text-secondary)' }}>
          Invalid SOS data.{' '}
          <button onClick={() => navigate('/tourist/travel')} style={{ color: 'var(--sy-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>← Go Back</button>
        </p>
      </div>
    );
  }

  const getLayerStyle = (layer) => {
    if (layer.status === 'success') return { className: 'sy-layer-success', icon: '✅' };
    if (layer.status === 'failed')  return { className: 'sy-layer-failed',  icon: '❌' };
    if (layer.status === 'cached')  return { className: 'sy-layer-cached',  icon: '🔄' };
    return { className: 'sy-layer-skip', icon: '⏭️' };
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--sy-bg)' }}>
      <div style={{ maxWidth: 480, width: '100%' }} className="sy-fade-in">

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 72, height: 72, borderRadius: '50%',
            background: sosResult.at_least_one_success ? 'var(--sy-green-light)' : 'var(--sy-red-light)',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 36 }}>{sosResult.at_least_one_success ? '✅' : '⚠️'}</span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
            {t('sos.title', lang)}
          </h1>
          <p style={{ color: 'var(--sy-text-secondary)', fontSize: 15, marginTop: 4 }}>
            {t('sos.subtitle', lang)}
          </p>
          {layer_used && (
            <span className="sy-badge sy-badge-blue" style={{ marginTop: 10, display: 'inline-block', fontSize: 11 }}>
              {layer_used}
            </span>
          )}
        </div>

        {/* 4-Layer Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {sosResult.layers.map((layer, i) => {
            const style = getLayerStyle(layer);
            return (
              <div key={i} className={`sy-layer ${style.className}`}>
                <div className="sy-layer-icon">{style.icon}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>
                    Layer {layer.layer}: {layer.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--sy-text-secondary)', marginTop: 2 }}>
                    {layer.detail}
                  </p>
                </div>
                <span className={`sy-badge ${layer.status === 'success' ? 'sy-badge-green' : layer.status === 'failed' ? 'sy-badge-red' : layer.status === 'cached' ? 'sy-badge-yellow' : 'sy-badge-blue'}`}>
                  {layer.status}
                </span>
              </div>
            );
          })}
        </div>

        {/* Guaranteed Delivery Badge */}
        {sosResult.at_least_one_success && (
          <div style={{
            padding: '14px 20px', background: 'var(--sy-green-light)',
            border: '1px solid #bbf7d0', borderRadius: 'var(--sy-radius-sm)',
            textAlign: 'center', marginBottom: 20,
          }}>
            <p style={{ fontWeight: 700, color: 'var(--sy-green)', fontSize: 14 }}>
              🟢 {t('sos.guaranteed', lang)}
            </p>
          </div>
        )}

        {/* Live Rescue Status via WebSocket */}
        {rescueStatus && (
          <div className="sy-fade-in" style={{
            padding: '16px 20px', borderRadius: 14, marginBottom: 20,
            background: rescueStatus.type === 'resolved' ? 'var(--sy-green-light)' : 'rgba(37,99,235,0.08)',
            border: `1px solid ${rescueStatus.type === 'resolved' ? '#bbf7d0' : '#bfdbfe'}`,
            display: 'flex', alignItems: 'center', gap: 14,
            animation: 'toast-in 0.4s ease both',
          }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{rescueStatus.type === 'resolved' ? '✅' : '🚁'}</span>
            <div>
              <p style={{ fontWeight: 800, fontSize: 15, color: rescueStatus.type === 'resolved' ? 'var(--sy-green)' : '#1d4ed8' }}>
                {rescueStatus.type === 'resolved' ? '✅ You are safe — Rescue complete' : '🚁 Help is on the way!'}
              </p>
              <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)', marginTop: 3 }}>
                {rescueStatus.type === 'resolved'
                  ? 'Resolved — recorded on Sentrix blockchain.'
                  : `${rescueStatus.data?.unit_name} dispatched${rescueStatus.data?.eta_minutes ? ` — ETA ~${rescueStatus.data.eta_minutes} min` : ''}`}
              </p>
            </div>
          </div>
        )}

        {/* Risk Summary */}
        {risk && (
          <div className="sy-card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Risk Assessment</span>
              <div
                className={`sy-risk-circle ${risk.risk_level === 'red' ? 'sy-risk-red' : risk.risk_level === 'yellow' ? 'sy-risk-yellow' : 'sy-risk-green'}`}
                style={{ width: 40, height: 40, fontSize: 13 }}
              >
                {Math.round(risk.risk_score)}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {risk.risk_factors?.map((f, i) => (
                <span key={i} className="sy-badge sy-badge-yellow" style={{ fontSize: 11 }}>
                  {f.factor}: {f.detail}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Blockchain Hash */}
        {sosData.blockchain_hash && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <span className="sy-badge sy-badge-blue" style={{ fontSize: 11 }}>
              🔗 Recorded on chain: {sosData.blockchain_hash?.slice(0, 16)}...
            </span>
          </div>
        )}

        {/* Data Note */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span className="sy-data-label">ℹ️ {t('sos.dataNote', lang)}</span>
        </div>

        {/* Back */}
        <button
          className="sy-btn sy-btn-outline"
          style={{ width: '100%' }}
          onClick={() => navigate('/tourist/travel', { state: { tourist } })}
        >
          ← Back to Travel View
        </button>
      </div>
    </div>
  );
}
