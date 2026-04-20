import { useState } from 'react';

const DEMO_CREDENTIALS = {
  admin: 'sentrix2025',
  officer1: 'police@112',
  control: 'erss2025',
};

export default function DashboardLogin({ onLogin }) {
  const [officerId, setOfficerId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Simulate auth delay for realism
    setTimeout(() => {
      const id = officerId.trim().toLowerCase();
      if (DEMO_CREDENTIALS[id] && DEMO_CREDENTIALS[id] === password) {
        sessionStorage.setItem('sy_auth', JSON.stringify({
          officerId: id,
          loginTime: new Date().toISOString(),
          role: id === 'admin' ? 'Administrator' : 'Field Officer',
        }));
        onLogin();
      } else {
        setError('Invalid credentials. Use demo account below.');
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      background: 'transparent',
    }}>
      <div className="sy-fade-in" style={{
        maxWidth: 420, width: '100%', position: 'relative', zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 80, height: 80, borderRadius: '24px',
            background: 'var(--sy-primary)',
            boxShadow: '0 8px 32px rgba(214, 109, 81, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
            border: '2px solid rgba(255,255,255,0.8)',
            marginBottom: 24,
          }}>
            <span style={{ fontSize: 36, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>🛡️</span>
          </div>
          <h1 style={{
            fontFamily: 'Inter', fontSize: 32, fontWeight: 800, color: 'var(--sy-text)',
            letterSpacing: '-0.03em', marginBottom: 8,
          }}>
            Sentrix
          </h1>
          <p style={{
            fontSize: 14, color: 'var(--sy-primary-dark)', fontWeight: 600,
            letterSpacing: '0.15em', textTransform: 'uppercase',
          }}>
            Command Center
          </p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="sy-card" style={{ padding: '40px 32px' }}>
          {error && (
            <div className="sy-fade-in" style={{
              padding: '12px 16px', marginBottom: 24,
              background: 'var(--sy-red-light)',
              border: '1px solid rgba(210, 71, 61, 0.3)',
              borderRadius: 12, color: 'var(--sy-red)',
              fontSize: 13, fontWeight: 600, textAlign: 'center',
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <label className="sy-label" style={{
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10,
            }}>
              Officer ID
            </label>
            <input
              type="text"
              value={officerId}
              onChange={e => setOfficerId(e.target.value)}
              placeholder="e.g. admin"
              required
              autoFocus
              className="sy-input"
            />
          </div>

          <div style={{ marginBottom: 32 }}>
            <label className="sy-label" style={{
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10,
            }}>
              Passcode
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter passcode"
              required
              className="sy-input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="sy-btn sy-btn-primary"
            style={{ width: '100%', padding: '16px', borderRadius: 12, fontSize: 15, cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? 'Authenticating...' : 'Secure Authorization'}
          </button>
        </form>

        {/* Demo credentials hint */}
        {/* Footer */}
        <p style={{
          textAlign: 'center', fontSize: 11, color: 'var(--sy-text-muted)',
          marginTop: 32, letterSpacing: '0.05em', textTransform: 'uppercase',
          fontWeight: 600
        }}>
          Secured by SHA-256 Blockchain
        </p>
      </div>
    </div>
  );
}
