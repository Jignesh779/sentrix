import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
export default function LandingPage({ lang, onLangChange }) {
  const navigate = useNavigate();
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  // Auto-Login (Persistent Session)
  useEffect(() => {
    const savedTourist = localStorage.getItem('sy_tourist');
    const autoLogin = localStorage.getItem('sentrix_auto_login');
    if (savedTourist && autoLogin === 'true') {
      navigate('/tourist/travel', { state: { tourist: JSON.parse(savedTourist) } });
    }
  }, [navigate]);

  const handleRecovery = (e) => {
    e.preventDefault();
    setRecoveryError('');
    const savedId = localStorage.getItem('sentrix_id_number');
    const savedTourist = localStorage.getItem('sy_tourist');

    if (!savedId || !savedTourist) {
      setRecoveryError('No registration found on this device. Please register again.');
      return;
    }
    if (recoveryId.trim() !== savedId) {
      setRecoveryError('ID number does not match. Double-check your Aadhaar or Passport number.');
      return;
    }
    localStorage.setItem('sentrix_auto_login', 'true');
    navigate('/tourist/travel', { state: { tourist: JSON.parse(savedTourist) } });
  };

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'hi', label: 'हिंदी' },
    { value: 'ta', label: 'தமிழ்' },
  ];

  return (
    <div className="sy-hero-gradient" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Navbar ── */}
      <header style={{ padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            display: 'flex',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <img src="/favicon.svg" alt="Sentrix" style={{ width: 44, height: 44 }} />
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--sy-text)' }}>
            Sentrix
          </span>
        </div>

        {/* Language selector — wired to global state */}
        <select
          className="sy-select"
          style={{ width: 'auto', padding: '8px 16px', borderRadius: 999, background: 'white', border: '1px solid rgba(0,0,0,0.12)', fontWeight: 600, fontSize: 13 }}
          value={lang}
          onChange={(e) => onLangChange?.(e.target.value)}
        >
          {languages.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </header>

      {/* ── Main Hero Section ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>

        {/* Demo badge — honest about simulation */}
        <div className="sy-slide-down" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--sy-surface)', borderRadius: 999, boxShadow: 'var(--sy-shadow-sm)', marginBottom: 32, border: '1px solid var(--sy-border)' }}>
          <span className="sy-badge sy-badge-blue" style={{ padding: '2px 8px' }}>Demo</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sy-text-secondary)' }}>ERSS-112 Simulated · 4-Layer SOS Active</span>
        </div>

        <h1 className="sy-slide-down" style={{ fontSize: 'clamp(40px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.1, color: '#0f172a', maxWidth: 800, marginBottom: 24, letterSpacing: '-0.04em' }}>
          India's Ultimate <br /> Tour Safety Network.
        </h1>

        <p className="sy-slide-down" style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: 'var(--sy-text-secondary)', maxWidth: 600, marginBottom: 48, animationDelay: '0.1s' }}>
          Real-time tracking, 4-layer SOS fallbacks, and guaranteed emergency dispatch without downloading a single app.
        </p>

        {/* ── CTA ── */}
        <div className="sy-slide-down" style={{ animationDelay: '0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <button
            className="sy-btn sy-btn-primary sy-btn-lg"
            style={{ padding: '20px 48px', fontSize: 18, borderRadius: 999 }}
            onClick={() => navigate('/tourist/register')}
          >
            Start Registration <span style={{ marginLeft: 8 }}>→</span>
          </button>

          {!showRecovery ? (
            <button
              className="sy-btn"
              style={{ background: 'transparent', color: 'var(--sy-primary)', fontWeight: 600, fontSize: 15 }}
              onClick={() => { setShowRecovery(true); setRecoveryError(''); }}
            >
              Already registered? Retrieve Active Pass
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <form onSubmit={handleRecovery} style={{ display: 'flex', gap: 8, animation: 'fadeIn 0.3s ease' }}>
                <input
                  type="text"
                  placeholder="Enter Passport / Aadhaar No."
                  className="sy-input"
                  value={recoveryId}
                  onChange={e => { setRecoveryId(e.target.value); setRecoveryError(''); }}
                  required
                  style={{ padding: '12px 16px', width: 260, border: '2px solid var(--sy-primary)' }}
                />
                <button type="submit" className="sy-btn sy-btn-primary" style={{ padding: '0 20px' }}>Verify</button>
                <button type="button" className="sy-btn sy-btn-outline" style={{ padding: '0 16px' }} onClick={() => { setShowRecovery(false); setRecoveryError(''); }}>✕</button>
              </form>
              {/* Clear error message */}
              {recoveryError && (
                <p style={{ fontSize: 13, color: 'var(--sy-red)', fontWeight: 600, animation: 'fadeIn 0.2s ease' }}>
                  ⚠️ {recoveryError}
                </p>
              )}
            </div>
          )}

          <p style={{ fontSize: 14, color: 'var(--sy-text-muted)', fontWeight: 500 }}>
            Takes only 45 seconds · No app installation required
          </p>
        </div>

        {/* ── Discovery Channels ── */}
        <div className="sy-fade-in" style={{ marginTop: 80, animationDelay: '0.4s', width: '100%', maxWidth: 900 }}>
          <div style={{ borderTop: '1px solid var(--sy-border)', paddingTop: 40, display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', flex: '1 1 200px' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>✈️</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Airport Scanned</h3>
              <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)' }}>Scanned directly at immigration.</p>
            </div>
            <div style={{ textAlign: 'center', flex: '1 1 200px' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>🏨</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Hotel Onboarding</h3>
              <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)' }}>Presented during check-in.</p>
            </div>
            <div style={{ textAlign: 'center', flex: '1 1 200px' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>📧</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>e-Visa Intercept</h3>
              <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)' }}>Linked directly in visa emails.</p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
