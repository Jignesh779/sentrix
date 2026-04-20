import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SOSHistory() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [touristName, setTouristName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const tourist = JSON.parse(localStorage.getItem('sy_tourist') || '{}');
    if (!tourist.tourist_id) {
      setTimeout(() => {
        setError('No registered tourist found. Please register first.');
        setLoading(false);
      }, 0);
      return;
    }

    fetch(`${API}/api/sos-history/${tourist.tourist_id}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch history');
        return r.json();
      })
      .then(data => {
        setHistory(data.history || []);
        setTouristName(data.tourist_name || '');
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const severityColors = {
    critical: { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '🔴' },
    high: { bg: '#fff7ed', border: '#fed7aa', text: '#ea580c', icon: '🟠' },
    medium: { bg: '#fffbeb', border: '#fde68a', text: '#d97706', icon: '🟡' },
  };

  const statusColors = {
    active: { bg: '#fef2f2', text: '#dc2626', label: 'Active' },
    dispatched: { bg: '#eff6ff', text: '#2563eb', label: 'Help Dispatched' },
    resolved: { bg: '#f0fdf4', text: '#16a34a', label: 'Resolved' },
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
      padding: '24px 16px',
      maxWidth: 720,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <button
          onClick={() => navigate('/tourist/travel')}
          style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'white', border: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          ←
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            SOS History
          </h1>
          {touristName && (
            <p style={{ fontSize: 13, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
              {touristName} · Blockchain-verified records
            </p>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <div style={{ fontSize: 40, marginBottom: 12, animation: 'pulse 1.5s infinite' }}>🔍</div>
          <p style={{ color: '#64748b', fontWeight: 600 }}>Loading incident history...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '20px 24px', background: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: 16,
          textAlign: 'center',
        }}>
          <p style={{ color: '#dc2626', fontWeight: 600, fontSize: 14 }}>⚠️ {error}</p>
          <button
            onClick={() => navigate('/tourist/register')}
            className="sy-btn sy-btn-primary"
            style={{ marginTop: 12, padding: '10px 24px', fontSize: 13 }}
          >
            Register Now
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && history.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '64px 24px',
          background: 'white', borderRadius: 20,
          border: '2px dashed #e2e8f0',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🛡️</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
            No Incidents Recorded
          </h2>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
            You have no SOS history. If you ever need help, press the SOS button on the Travel page.
            All incidents are permanently recorded on our blockchain.
          </p>
        </div>
      )}

      {/* Incident Cards */}
      {!loading && history.map((alert, i) => {
        const sev = severityColors[alert.severity] || severityColors.medium;
        const stat = statusColors[alert.status] || statusColors.active;
        const isExpanded = expandedId === alert.id;

        return (
          <div
            key={alert.id || i}
            className="sy-fade-in"
            style={{
              background: 'white', borderRadius: 20,
              border: '1px solid #e2e8f0',
              marginBottom: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              overflow: 'hidden',
              animationDelay: `${i * 0.1}s`,
            }}
          >
            {/* Card Header */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : alert.id)}
              style={{
                padding: '20px 24px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: sev.bg, border: `1px solid ${sev.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {sev.icon}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 700, color: '#0f172a',
                    }}>
                      Incident #{history.length - i}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      padding: '3px 8px', borderRadius: 6,
                      background: stat.bg, color: stat.text,
                      textTransform: 'uppercase',
                    }}>
                      {stat.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {alert.timestamp ? new Date(alert.timestamp).toLocaleString('en-IN', {
                      dateStyle: 'medium', timeStyle: 'short',
                    }) : 'Unknown date'}
                    {' · '}Risk Score: <strong style={{ color: sev.text }}>{alert.risk_score}</strong>
                  </p>
                </div>
              </div>
              <span style={{
                fontSize: 16, transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                color: '#94a3b8',
              }}>
                ▼
              </span>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div style={{
                padding: '0 24px 24px',
                borderTop: '1px solid #f1f5f9',
              }}>
                {/* Detail Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12, marginTop: 16, marginBottom: 20,
                }}>
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Location</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {alert.latitude?.toFixed(4)}, {alert.longitude?.toFixed(4)}
                    </span>
                  </div>
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Battery</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: alert.battery_level < 15 ? '#dc2626' : '#0f172a' }}>
                      🔋 {alert.battery_level}%
                    </span>
                  </div>
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Triggered Via</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      {alert.triggered_via || 'button'}
                    </span>
                  </div>
                  <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Severity</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: sev.text, textTransform: 'capitalize' }}>
                      {sev.icon} {alert.severity}
                    </span>
                  </div>
                </div>

                {/* SOS Layers */}
                {alert.sos_layers && alert.sos_layers.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Signal Redundancy
                    </h4>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {alert.sos_layers.map((layer, j) => (
                        <span key={j} style={{
                          padding: '6px 12px', borderRadius: 8,
                          fontSize: 12, fontWeight: 600,
                          background: layer.status === 'success' ? '#f0fdf4' : layer.status === 'failed' ? '#fef2f2' : '#fffbeb',
                          color: layer.status === 'success' ? '#16a34a' : layer.status === 'failed' ? '#dc2626' : '#d97706',
                          border: `1px solid ${layer.status === 'success' ? '#bbf7d0' : layer.status === 'failed' ? '#fecaca' : '#fde68a'}`,
                        }}>
                          L{layer.layer} {layer.name} — {layer.status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blockchain Proof */}
                {alert.blockchain_verified && (
                  <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #020617, #0f172a)',
                    borderRadius: 14,
                    border: '1px solid rgba(16,185,129,0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 900,
                        padding: '3px 8px', borderRadius: 4,
                        background: '#10b981', color: '#020617',
                      }}>
                        ON-CHAIN
                      </span>
                      <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                        Blockchain Verified
                      </span>
                    </div>
                    {alert.blockchain_hash && (
                      <div style={{
                        fontSize: 11, color: '#6ee7b7', fontFamily: 'monospace',
                        letterSpacing: '0.05em', opacity: 0.8,
                      }}>
                        {alert.blockchain_hash.slice(0, 16)}••••••••{alert.blockchain_hash.slice(-16)}
                      </div>
                    )}
                    {alert.blockchain_trail && alert.blockchain_trail.length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {alert.blockchain_trail.map((block, k) => (
                          <div key={k} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: 8,
                          }}>
                            <span style={{ fontSize: 14 }}>
                              {block.data?.type === 'sos_alert' ? '🚨' : block.data?.type === 'unit_dispatched' ? '🚔' : block.data?.type === 'incident_resolved' ? '✅' : '🔗'}
                            </span>
                            <div>
                              <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 600 }}>
                                Block #{block.index} · {block.data?.type?.replace(/_/g, ' ')}
                              </span>
                              <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                                {block.hash?.slice(0, 12)}...
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Back Button */}
      {!loading && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => navigate('/tourist/travel')}
            className="sy-btn sy-btn-outline"
            style={{ padding: '12px 32px', fontSize: 14 }}
          >
            ← Back to Travel View
          </button>
        </div>
      )}
    </div>
  );
}
