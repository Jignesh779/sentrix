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

// Document types available for linking
const DOCUMENT_TYPES = [
  { id: 'Aadhaar', label: 'Aadhaar Card', icon: '🪪', desc: '12-digit Aadhaar number' },
  { id: 'Passport', label: 'Passport', icon: '🛂', desc: 'Any country passport number' },
  { id: 'DL', label: 'Driving License', icon: '🚗', desc: 'State-issued DL number' },
  { id: 'Voter_ID', label: 'Voter ID', icon: '🗳️', desc: 'Election Commission ID' },
  { id: 'PAN', label: 'PAN Card', icon: '💳', desc: '10-character PAN number' },
];

export default function ProfilePage({ lang }) {
  const navigate = useNavigate();
  const [tourist, setTourist] = useState(null);
  const [stats, setStats] = useState(null);
  const [encryptionStatus, setEncryptionStatus] = useState(null);

  // Validity
  const [selectedMonths, setSelectedMonths] = useState(null);
  const [validityUpdating, setValidityUpdating] = useState(false);
  const [validityMsg, setValidityMsg] = useState('');

  // Link Document
  const [activeDocType, setActiveDocType] = useState(null);
  const [docNumber, setDocNumber] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');

  // Privacy
  const [gpsConsent, setGpsConsent] = useState(true);
  const [consentUpdating, setConsentUpdating] = useState(false);
  const [dataRequestMsg, setDataRequestMsg] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sy_tourist');
      if (saved) {
        const parsed = JSON.parse(saved);
        setTourist(parsed);
        setGpsConsent(parsed.consent_gps !== false);
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch profile stats
  useEffect(() => {
    if (!tourist?.tourist_id) return;
    fetch(`${API}/api/profile/${tourist.tourist_id}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => {});

    // Fetch encryption status
    fetch(`${API}/api/encryption-status`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setEncryptionStatus(data); })
      .catch(() => {});
  }, [tourist?.tourist_id]);

  const email = localStorage.getItem('sentrix_email') || '';

  // --- Verification tier calculation ---
  const getTiers = () => {
    const tiers = [
      { id: 1, label: 'Email Verified', icon: '✉️', done: !!email },
      { id: 2, label: 'Phone Provided', icon: '📱', done: !!tourist?.phone },
      { id: 3, label: 'Document Linked', icon: '📄', done: !!tourist?.document_linked },
      { id: 4, label: 'Biometric (Future)', icon: '🔐', done: false },
    ];
    const completed = tiers.filter(t => t.done).length;
    return { tiers, completed, total: tiers.length, percent: Math.round((completed / tiers.length) * 100) };
  };

  // --- Handlers ---
  const handleValidity = async (months) => {
    if (!tourist?.tourist_id) return;
    setSelectedMonths(months);
    setValidityUpdating(true);
    setValidityMsg('');
    try {
      const res = await fetch(`${API}/api/profile/${tourist.tourist_id}/validity?months=${months}`, { method: 'PUT' });
      const data = await res.json();
      if (res.ok) {
        setValidityMsg(`✅ Validity extended by ${months} month${months > 1 ? 's' : ''}`);
        if (data.tourist) {
          localStorage.setItem('sy_tourist', JSON.stringify(data.tourist));
          setTourist(data.tourist);
        } else {
          const updated = { ...tourist, trip_end: data.trip_end };
          localStorage.setItem('sy_tourist', JSON.stringify(updated));
          setTourist(updated);
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
    if (!tourist?.tourist_id || !activeDocType) return;
    setLinkLoading(true);
    setLinkMsg('');
    try {
      const res = await fetch(`${API}/api/link-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourist_id: tourist.tourist_id, id_type: activeDocType, id_number: docNumber }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinkMsg('✅ Document linked & verified on blockchain');
        setActiveDocType(null);
        setDocNumber('');
        const updated = { ...tourist, document_linked: true, document_type: activeDocType, document_hash: data.document_hash };
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

  const handleConsentToggle = async () => {
    if (!tourist?.tourist_id) return;
    setConsentUpdating(true);
    const newConsent = !gpsConsent;
    try {
      const res = await fetch(`${API}/api/tourist/${tourist.tourist_id}/consent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_gps: newConsent }),
      });
      if (res.ok) {
        setGpsConsent(newConsent);
        const updated = { ...tourist, consent_gps: newConsent };
        localStorage.setItem('sy_tourist', JSON.stringify(updated));
        setTourist(updated);
      }
    } catch { /* ignore */ }
    finally { setConsentUpdating(false); }
  };

  const handleDataRequest = async (type) => {
    setDataRequestMsg('');
    try {
      const res = await fetch(`${API}/api/privacy/${type}/${tourist.tourist_id}`, { method: 'POST' });
      if (res.ok) {
        if (type === 'export') {
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `sentrix_data_${tourist.tourist_id}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setDataRequestMsg('✅ Data exported successfully');
        } else {
          setDataRequestMsg('✅ Deletion request submitted. Your data will be erased within 48 hours as per DPDP Act 2023.');
        }
      } else {
        setDataRequestMsg('⚠️ Request failed');
      }
    } catch {
      setDataRequestMsg('⚠️ Network error');
    }
  };

  // --- Render ---
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

  const { tiers, completed, total, percent } = getTiers();
  const isExpired = tourist.trip_end && new Date(tourist.trip_end) < new Date();
  const validityOptions = [
    { months: 1, label: '1 Month' },
    { months: 3, label: '3 Months' },
    { months: 6, label: '6 Months' },
    { months: 12, label: '1 Year ⭐' },
  ];

  return (
    <div style={{ minHeight: '100vh', padding: '24px 16px 80px', background: 'var(--sy-bg)', position: 'relative' }}>

      {/* Top bar */}
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <span onClick={() => navigate(-1)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--sy-primary)', cursor: 'pointer' }}>← Back</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sy-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Sentrix Profile</span>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto' }} className="sy-fade-in">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: VERIFICATION PROGRESS                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="sy-card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sy-text)' }}>🛡️ Verification Status</h2>
            <span className={`sy-badge ${percent >= 75 ? 'sy-badge-green' : percent >= 50 ? 'sy-badge-yellow' : 'sy-badge-red'}`}>
              {percent}% Verified
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 8, borderRadius: 4, background: 'var(--sy-border)', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{
              height: '100%', borderRadius: 4, transition: 'width 0.8s ease',
              width: `${percent}%`,
              background: percent >= 75 ? 'var(--sy-green)' : percent >= 50 ? 'var(--sy-yellow)' : 'var(--sy-red)',
            }} />
          </div>

          {/* Tier items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tiers.map(tier => (
              <div key={tier.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 'var(--sy-radius-sm)',
                background: tier.done ? 'var(--sy-green-light)' : 'var(--sy-bg)',
                border: `1px solid ${tier.done ? 'var(--sy-green)' : 'var(--sy-border)'}`,
                opacity: tier.done ? 1 : 0.6,
              }}>
                <span style={{ fontSize: 18 }}>{tier.done ? '✅' : '⬜'}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sy-text)' }}>
                    Tier {tier.id}: {tier.label}
                  </span>
                </div>
                <span style={{ fontSize: 16 }}>{tier.icon}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: PERSONAL DETAILS                                   */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="sy-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sy-text)', marginBottom: 16 }}>👤 Personal Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { label: 'Sentrix ID', value: tourist.tourist_id, color: 'var(--sy-primary)', bold: true },
              { label: 'Name', value: tourist.name },
              { label: 'Email', value: maskEmail(email), badge: '✅' },
              { label: 'Phone', value: maskPhone(tourist.phone), badge: tourist.phone ? '✅' : null },
              { label: 'Emergency Contact', value: maskPhone(tourist.emergency_contact) },
              { label: 'Nationality', value: tourist.nationality || '—' },
              { label: 'Blood Group', value: tourist.blood_group || '—' },
              { label: 'Medical Conditions', value: tourist.medical_conditions || 'None' },
            ].map((item, i) => (
              <div key={i}>
                <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {item.label}
                </span>
                <p style={{ fontSize: 14, fontWeight: item.bold ? 700 : 600, color: item.color || 'var(--sy-text)', marginTop: 2 }}>
                  {item.value} {item.badge && <span style={{ fontSize: 12 }}>{item.badge}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: DOCUMENT VERIFICATION                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="sy-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sy-text)', marginBottom: 4 }}>🔗 Document Verification</h2>
          <p style={{ fontSize: 12, color: 'var(--sy-text-muted)', marginBottom: 16 }}>
            Link a government ID for enhanced checkpoint verification. Document numbers are hashed (SHA-256) — never stored raw.
          </p>

          {/* Document cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {DOCUMENT_TYPES.map(doc => {
              const isLinked = tourist.document_linked && tourist.document_type === doc.id;
              const isActive = activeDocType === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => { if (!isLinked && !linkLoading) { setActiveDocType(isActive ? null : doc.id); setDocNumber(''); setLinkMsg(''); } }}
                  style={{
                    padding: '14px 12px', borderRadius: 'var(--sy-radius-sm)',
                    border: `2px solid ${isLinked ? 'var(--sy-green)' : isActive ? 'var(--sy-primary)' : 'var(--sy-border)'}`,
                    background: isLinked ? 'var(--sy-green-light)' : isActive ? 'var(--sy-primary-lighter)' : 'var(--sy-surface)',
                    cursor: isLinked ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: 24, display: 'block', marginBottom: 4 }}>{doc.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sy-text)' }}>{doc.label}</span>
                  {isLinked && (
                    <div style={{ marginTop: 6 }}>
                      <span className="sy-badge sy-badge-green" style={{ fontSize: 10 }}>✅ Linked</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Active document link form */}
          {activeDocType && !tourist.document_linked && (
            <form onSubmit={handleLinkDocument} style={{ marginTop: 16, padding: 16, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-bg)', border: '1px solid var(--sy-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{DOCUMENT_TYPES.find(d => d.id === activeDocType)?.icon}</span>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700 }}>Link {DOCUMENT_TYPES.find(d => d.id === activeDocType)?.label}</h4>
                  <p style={{ fontSize: 11, color: 'var(--sy-text-muted)' }}>{DOCUMENT_TYPES.find(d => d.id === activeDocType)?.desc}</p>
                </div>
              </div>
              <input
                className="sy-input" required autoFocus
                value={docNumber} onChange={e => setDocNumber(e.target.value)}
                placeholder="Enter document number"
                style={{ marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="sy-btn sy-btn-outline" style={{ flex: 1, fontSize: 13 }} onClick={() => setActiveDocType(null)}>Cancel</button>
                <button type="submit" className="sy-btn sy-btn-primary" style={{ flex: 1, fontSize: 13 }} disabled={linkLoading}>
                  {linkLoading ? 'Verifying...' : '🔒 Link & Hash'}
                </button>
              </div>
            </form>
          )}

          {/* Linked document details */}
          {tourist.document_linked && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-green-light)', border: '1px solid var(--sy-green)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>🔐</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sy-green)' }}>Blockchain Verified</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--sy-text-secondary)' }}>
                <p>Document: <strong>{tourist.document_type}</strong></p>
                <p>Hash: <code style={{ fontSize: 11, background: 'var(--sy-surface)', padding: '2px 6px', borderRadius: 4 }}>{tourist.document_hash || '0xA3F2...C891'}</code></p>
                <p style={{ marginTop: 4, fontSize: 11, color: 'var(--sy-text-muted)' }}>Raw document number never stored. Only SHA-256 hash on blockchain.</p>
              </div>
            </div>
          )}

          {linkMsg && (
            <p style={{ fontSize: 13, marginTop: 10, color: linkMsg.startsWith('✅') ? 'var(--sy-green)' : 'var(--sy-red)', fontWeight: 600 }}>
              {linkMsg}
            </p>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 4: DIGITAL ID & VALIDITY                              */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="sy-card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sy-text)' }}>🛡️ Digital ID & Validity</h2>
            <span className={`sy-badge ${isExpired ? 'sy-badge-red' : 'sy-badge-green'}`}>
              {isExpired ? '⚠️ Expired' : '🟢 Active'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 12, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-bg)', textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>ID</span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--sy-primary)' }}>{tourist.tourist_id}</p>
            </div>
            <div style={{ padding: 12, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-bg)', textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>From</span>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{tourist.trip_start || '—'}</p>
            </div>
            <div style={{ padding: 12, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-bg)', textAlign: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Until</span>
              <p style={{ fontSize: 13, fontWeight: 600, color: isExpired ? 'var(--sy-red)' : 'var(--sy-text)' }}>{tourist.trip_end || '—'}</p>
            </div>
          </div>

          {/* Extend validity */}
          <p style={{ fontSize: 12, color: 'var(--sy-text-muted)', marginBottom: 10 }}>Extend validity period:</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {validityOptions.map(opt => (
              <button
                key={opt.months}
                className="sy-btn"
                disabled={validityUpdating}
                onClick={() => handleValidity(opt.months)}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 999,
                  border: '1px solid var(--sy-border)',
                  background: selectedMonths === opt.months ? 'var(--sy-primary)' : 'var(--sy-surface)',
                  color: selectedMonths === opt.months ? 'white' : 'var(--sy-text)',
                  cursor: validityUpdating ? 'wait' : 'pointer', transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {validityMsg && (
            <p style={{ fontSize: 13, marginTop: 8, color: validityMsg.startsWith('✅') ? 'var(--sy-green)' : 'var(--sy-red)', fontWeight: 600 }}>{validityMsg}</p>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 5: PRIVACY & DATA CONTROLS (DPDP)                     */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="sy-card" style={{ padding: 24, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sy-text)', marginBottom: 16 }}>🔐 Privacy & Data Controls</h2>

          {/* GPS Consent Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sy-border)' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>GPS Tracking</p>
              <p style={{ fontSize: 11, color: 'var(--sy-text-muted)' }}>Share location for safety alerts</p>
            </div>
            <div
              onClick={consentUpdating ? undefined : handleConsentToggle}
              style={{
                width: 48, height: 26, borderRadius: 13, padding: 3,
                background: gpsConsent ? 'var(--sy-green)' : 'var(--sy-border)',
                cursor: consentUpdating ? 'wait' : 'pointer', transition: 'background 0.3s',
                display: 'flex', alignItems: 'center',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: 'white',
                transition: 'transform 0.3s', transform: gpsConsent ? 'translateX(22px)' : 'translateX(0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>

          {/* Encryption Status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sy-border)' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Data Encryption</p>
              <p style={{ fontSize: 11, color: 'var(--sy-text-muted)' }}>PII encrypted at rest (AES-256)</p>
            </div>
            <span className="sy-badge sy-badge-green" style={{ fontSize: 10 }}>
              {encryptionStatus?.enabled ? '🔒 Active' : '🔒 AES-256'}
            </span>
          </div>

          {/* Blockchain Storage */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sy-border)' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Blockchain Records</p>
              <p style={{ fontSize: 11, color: 'var(--sy-text-muted)' }}>Only hashes stored on-chain, never raw data</p>
            </div>
            <span className="sy-badge sy-badge-blue" style={{ fontSize: 10 }}>🔗 SHA-256</span>
          </div>

          {/* DPDP Actions */}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              className="sy-btn sy-btn-outline"
              style={{ flex: 1, fontSize: 12 }}
              onClick={() => handleDataRequest('export')}
            >
              📥 Export My Data
            </button>
            <button
              className="sy-btn"
              style={{ flex: 1, fontSize: 12, background: 'var(--sy-red-light)', color: 'var(--sy-red)', border: '1px solid var(--sy-red)' }}
              onClick={() => {
                if (window.confirm('Are you sure? This will permanently erase your data as per DPDP Act 2023.')) {
                  handleDataRequest('delete');
                }
              }}
            >
              🗑️ Delete My Data
            </button>
          </div>

          {dataRequestMsg && (
            <p style={{ fontSize: 12, marginTop: 8, color: dataRequestMsg.startsWith('✅') ? 'var(--sy-green)' : 'var(--sy-red)', fontWeight: 600 }}>{dataRequestMsg}</p>
          )}

          <p style={{ fontSize: 10, color: 'var(--sy-text-muted)', marginTop: 12, lineHeight: 1.6 }}>
            Compliant with Digital Personal Data Protection Act, 2023 (DPDP). Your personal data is encrypted, and you have the right to access, export, and erase your data at any time.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 6: SAFETY HISTORY                                     */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="sy-card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--sy-text)', marginBottom: 16 }}>📊 Safety History</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ textAlign: 'center', padding: 14, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-bg)' }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sy-red)' }}>{stats?.sos_count ?? 0}</p>
              <p style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600 }}>SOS Alerts</p>
            </div>
            <div style={{ textAlign: 'center', padding: 14, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-bg)' }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sy-yellow)' }}>{stats?.danger_zone_entries ?? 0}</p>
              <p style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600 }}>Zone Entries</p>
            </div>
            <div style={{ textAlign: 'center', padding: 14, borderRadius: 'var(--sy-radius-sm)', background: 'var(--sy-bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 24, fontWeight: 700, color: (stats?.avg_risk_score ?? 0) > 70 ? 'var(--sy-red)' : (stats?.avg_risk_score ?? 0) > 40 ? 'var(--sy-yellow)' : 'var(--sy-green)' }}>
                  {stats?.avg_risk_score ?? 0}
                </p>
              </div>
              <p style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600 }}>Avg Risk</p>
            </div>
          </div>

          {/* Quick links */}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="sy-btn sy-btn-outline" style={{ flex: 1, fontSize: 12 }} onClick={() => navigate('/tourist/sos-history')}>
              📋 View SOS History
            </button>
            <button className="sy-btn sy-btn-outline" style={{ flex: 1, fontSize: 12 }} onClick={() => navigate('/tourist/digital-id')}>
              🪪 View Digital ID
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
