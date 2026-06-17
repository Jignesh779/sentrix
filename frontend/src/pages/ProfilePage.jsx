import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return local[0] + '***@' + domain;
  return local[0] + '***' + local.slice(-1) + '@' + domain;
}

function maskPhone(phone) {
  if (!phone || phone.length < 4) return '***';
  return phone.slice(0, 3) + '****' + phone.slice(-2);
}

export default function ProfilePage({ lang }) {
  const navigate = useNavigate();
  const [tourist, setTourist] = useState(null);
  const [selectedMonths, setSelectedMonths] = useState(null);
  const [validityUpdating, setValidityUpdating] = useState(false);
  const [validityMsg, setValidityMsg] = useState('');

  // Link Document state
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [docType, setDocType] = useState('Aadhaar');
  const [docNumber, setDocNumber] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sy_tourist');
      if (saved) setTourist(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const email = localStorage.getItem('sentrix_email') || '';

  const handleValidity = async (months) => {
    if (!tourist?.tourist_id) return;
    setSelectedMonths(months);
    setValidityUpdating(true);
    setValidityMsg('');
    try {
      const res = await fetch(`${API}/api/profile/${tourist.tourist_id}/validity?months=${months}`, { method: 'PUT' });
      const data = await res.json();
      if (res.ok) {
        setValidityMsg(`✅ Validity updated to ${months} month${months > 1 ? 's' : ''}`);
        // Update local tourist data if server returns updated record
        if (data.tourist) {
          localStorage.setItem('sy_tourist', JSON.stringify(data.tourist));
          setTourist(data.tourist);
        }
      } else {
        setValidityMsg(`⚠️ ${data.detail || 'Failed to update'}`);
      }
    } catch {
      setValidityMsg('⚠️ Network error');
    } finally {
      setValidityUpdating(false);
    }
  };

  const handleLinkDocument = async (e) => {
    e.preventDefault();
    if (!tourist?.tourist_id) return;
    setLinkLoading(true);
    setLinkMsg('');
    try {
      const res = await fetch(`${API}/api/link-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourist_id: tourist.tourist_id, id_type: docType, id_number: docNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinkMsg('✅ Document linked successfully');
        setShowLinkForm(false);
        // Update tourist data
        const updated = { ...tourist, document_linked: true, document_type: docType };
        localStorage.setItem('sy_tourist', JSON.stringify(updated));
        setTourist(updated);
      } else {
        setLinkMsg(`⚠️ ${data.detail || 'Failed to link'}`);
      }
    } catch {
      setLinkMsg('⚠️ Network error');
    } finally {
      setLinkLoading(false);
    }
  };

  if (!tourist) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sy-bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--sy-text-secondary)', marginBottom: 16 }}>No profile data found.</p>
          <button className="sy-btn sy-btn-primary" onClick={() => navigate('/tourist/register')}>Register First</button>
        </div>
      </div>
    );
  }

  const validityOptions = [
    { months: 1, label: '1 Month' },
    { months: 3, label: '3 Months' },
    { months: 6, label: '6 Months' },
    { months: 12, label: '1 Year ⭐' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--sy-bg)', position: 'relative' }}>

      {/* Close button — pill style */}
      <div 
        onClick={() => navigate(-1)} 
        style={{ 
          position: 'absolute', top: '1rem', right: '1rem',
          background: 'rgba(0,0,0,0.04)', backdropFilter: 'blur(8px)',
          padding: '0.4rem 1rem', borderRadius: '999px', cursor: 'pointer',
          fontSize: '0.85rem', color: 'var(--sy-text-secondary)', border: '1px solid var(--sy-border)',
          transition: 'all 0.2s'
        }}
        onMouseEnter={e => { e.target.style.background = 'rgba(0,0,0,0.08)'; e.target.style.color = 'var(--sy-text)'; }}
        onMouseLeave={e => { e.target.style.background = 'rgba(0,0,0,0.04)'; e.target.style.color = 'var(--sy-text-secondary)'; }}
      >
        ✕ Close
      </div>

      <div style={{ maxWidth: 480, width: '100%' }} className="sy-fade-in">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--sy-primary-lighter)', marginBottom: 12 }}>
            <span style={{ fontSize: 28 }}>👤</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>
            {t('profile.title', lang)}
          </h1>
        </div>

        {/* Profile Card */}
        <div className="sy-card" style={{ padding: 28, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, textAlign: 'left' }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sentrix ID</span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--sy-primary)' }}>{tourist.tourist_id}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Email</span>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{maskEmail(email)}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Phone</span>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{maskPhone(tourist.phone)}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Blood Group</span>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{tourist.blood_group || '—'}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Nationality</span>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{tourist.nationality || '—'}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Valid Until</span>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{tourist.trip_end || tourist.valid_until || '—'}</p>
            </div>
          </div>
        </div>

        {/* Validity Period */}
        <div className="sy-card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--sy-text)', marginBottom: 12 }}>
            {t('profile.validityPeriod', lang)}
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {validityOptions.map(opt => (
              <button
                key={opt.months}
                className="sy-btn"
                disabled={validityUpdating}
                onClick={() => handleValidity(opt.months)}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 999,
                  border: '1px solid var(--sy-border)',
                  background: selectedMonths === opt.months ? 'var(--sy-primary)' : 'var(--sy-surface)',
                  color: selectedMonths === opt.months ? 'white' : 'var(--sy-text)',
                  cursor: validityUpdating ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {validityMsg && (
            <p style={{ fontSize: 13, marginTop: 8, color: validityMsg.startsWith('✅') ? 'var(--sy-green)' : 'var(--sy-red)', fontWeight: 600 }}>
              {validityMsg}
            </p>
          )}
        </div>

        {/* Link Document */}
        <div className="sy-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--sy-text)', marginBottom: 12 }}>
            {t('profile.linkDocument', lang)}
          </h3>

          {tourist.document_linked ? (
            <div className="sy-badge sy-badge-green" style={{ fontSize: 13 }}>
              ✅ {tourist.document_type || 'Document'} Linked (Verified)
            </div>
          ) : !showLinkForm ? (
            <button
              className="sy-btn sy-btn-outline"
              style={{ fontSize: 13, width: '100%' }}
              onClick={() => setShowLinkForm(true)}
            >
              🔗 Link Aadhaar / Passport
            </button>
          ) : (
            <form onSubmit={handleLinkDocument} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="sy-label">Document Type</label>
                <select className="sy-select" value={docType} onChange={e => setDocType(e.target.value)}>
                  <option value="Aadhaar">Aadhaar</option>
                  <option value="DL">Driving License</option>
                  <option value="Passport">Passport</option>
                </select>
              </div>
              <div>
                <label className="sy-label">Document Number</label>
                <input className="sy-input" required value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="Enter document number" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="sy-btn sy-btn-outline" style={{ flex: 1, fontSize: 13 }} onClick={() => setShowLinkForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="sy-btn sy-btn-primary" style={{ flex: 1, fontSize: 13 }} disabled={linkLoading}>
                  {linkLoading ? 'Linking...' : 'Link Document'}
                </button>
              </div>
            </form>
          )}
          {linkMsg && (
            <p style={{ fontSize: 13, marginTop: 8, color: linkMsg.startsWith('✅') ? 'var(--sy-green)' : 'var(--sy-red)', fontWeight: 600 }}>
              {linkMsg}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
