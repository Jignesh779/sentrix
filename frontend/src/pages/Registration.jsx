import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Registration({ lang, onRegistered }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', emergency_contact: '',
    blood_group: '', medical_conditions: '',
    language_pref: lang || 'en',
    nationality: '',
  });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const [showOtp, setShowOtp] = useState(false);
  const [otpValue, setOtpValue] = useState('');

  const handlePreSubmit = (e) => {
    e.preventDefault();
    // Validate email
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(form.email)) {
      alert('Please enter a valid email address');
      return;
    }
    setShowOtp(true);
  };

  const executeRegistration = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
        }),
      });
      const data = await res.json();
      
      // Keep session persistent across refresh
      localStorage.setItem('sy_tourist', JSON.stringify(data.tourist));
      localStorage.setItem('sentrix_email', form.email);
      localStorage.setItem('sentrix_auto_login', 'true');

      if (onRegistered) onRegistered(data);
      navigate('/tourist/digital-id', { state: { registration: data } });
    } catch (err) {
      alert('Registration failed: ' + err.message);
    } finally {
      setLoading(false);
      setShowOtp(false);
    }
  };

  const handleOtpVerify = (e) => {
    e.preventDefault();
    if (otpValue.length !== 6) {
      alert("Please enter a valid 6-digit OTP");
      return;
    }
    executeRegistration();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--sy-bg)' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--sy-primary)', cursor: 'pointer' }}
            onClick={() => navigate('/tourist')}
          >
            ← Back
          </span>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 12, letterSpacing: '-0.5px' }}>
            {t('registration.title', lang)}
          </h1>
          <p style={{ color: 'var(--sy-text-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('registration.subtitle', lang)}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handlePreSubmit} className="sy-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Email — first field */}
          <div>
            <label className="sy-label">{t('registration.email', lang)} *</label>
            <input className="sy-input" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder={t('registration.emailPlaceholder', lang)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="sy-label">{t('registration.name', lang)} *</label>
              <input className="sy-input" required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. John Doe" />
            </div>
            <div>
              <label className="sy-label">{t('registration.phone', lang)} *</label>
              <input className="sy-input" type="tel" required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="e.g. +91 9876543210" />
            </div>
          </div>

          <div>
            <label className="sy-label">{t('registration.emergencyContact', lang)} *</label>
            <input className="sy-input" type="tel" required value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} placeholder="e.g. +91 9876543211" />
          </div>

          {/* Optional Details — Collapsible */}
          <div style={{ marginTop: '1.2rem' }}>
            <div 
              onClick={() => setShowOptional(!showOptional)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--sy-text-secondary)', fontSize: '0.95rem' }}
            >
              <span style={{ transform: showOptional ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
              {t('registration.optionalDetails', lang)}
            </div>
            {showOptional && (
              <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="sy-label">{t('registration.nationality', lang)}</label>
                  <input className="sy-input" value={form.nationality} onChange={e => set('nationality', e.target.value)} placeholder="e.g. Indian, American" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="sy-label">{t('registration.bloodGroup', lang)}</label>
                    <select className="sy-select" value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                      <option value="">Select</option>
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="sy-label">{t('registration.medicalConditions', lang)}</label>
                    <input className="sy-input" value={form.medical_conditions} onChange={e => set('medical_conditions', e.target.value)} placeholder="e.g. Asthma" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Consent */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--sy-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ marginTop: 2, accentColor: 'var(--sy-primary)' }} />
            {t('registration.consent', lang)}
          </label>

          <button type="submit" className="sy-btn sy-btn-primary sy-btn-lg" disabled={loading} style={{ width: '100%' }}>
            {loading ? t('registration.registering', lang) : t('registration.submit', lang)}
          </button>

          <span className="sy-data-label" style={{ alignSelf: 'center' }}>
            ℹ️ Email hashed on blockchain. Never stored raw.
          </span>
        </form>
      </div>

      {/* Anthropic-styled OTP Modal Overlay */}
      {showOtp && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26, 26, 26, 0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 20
        }}>
          <div className="sy-fade-in sy-card" style={{ maxWidth: 440, width: '100%', padding: '32px' }}>
            <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, color: 'var(--sy-text)' }}>
              Verify Identity
            </h3>
            
            <div style={{ background: 'var(--sy-bg)', padding: 16, borderRadius: 'var(--sy-radius-sm)', border: '1px solid var(--sy-border)', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 24 }}>🧪</span>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--sy-primary)' }}>Demo Mode — No SMS Required</h4>
                  <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                    In a live deployment, an OTP would be sent to <strong>{form.phone || 'your number'}</strong>.
                    For this demo, simply enter any 6 digits to continue.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleOtpVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="sy-label" style={{ textAlign: 'center' }}>Enter 6-Digit OTP</label>
                <input 
                  type="text" 
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  className="sy-input" 
                  value={otpValue} 
                  onChange={e => setOtpValue(e.target.value.replace(/\D/g, ''))} 
                  placeholder="• • • • • •" 
                  style={{ fontSize: 24, letterSpacing: '0.5em', textAlign: 'center', padding: '16px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button 
                  type="button" 
                  onClick={() => setShowOtp(false)} 
                  className="sy-btn sy-btn-outline" 
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="sy-btn sy-btn-primary" 
                  disabled={loading || otpValue.length !== 6} 
                  style={{ flex: 1 }}
                >
                  {loading ? 'Verifying...' : 'Verify & Generate ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
