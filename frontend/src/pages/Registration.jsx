import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Registration({ lang, onRegistered }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  // Auto-fill trip months: current month and next month
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const [form, setForm] = useState({
    name: '', phone: '', emergency_contact: '',
    id_type: 'Aadhaar', id_number: '',
    blood_group: '', medical_conditions: '',
    trip_start: thisMonth, trip_end: nextMonth, language_pref: lang || 'en',
    nationality: 'IND',
  });

  const isIndian = form.nationality === 'IND';

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const idTypes = isIndian
    ? [{ value: 'Aadhaar', label: 'Aadhaar' }, { value: 'DL', label: 'Driving License' }]
    : [{ value: 'Passport', label: 'Passport' }];

  const countries = [
    { code: 'IND', label: 'India (🇮🇳)' },
    { code: 'USA', label: 'United States (🇺🇸)' },
    { code: 'UK', label: 'United Kingdom (🇬🇧)' },
    { code: 'CAN', label: 'Canada (🇨🇦)' },
    { code: 'AUS', label: 'Australia (🇦🇺)' },
    { code: 'DEU', label: 'Germany (🇩🇪)' },
    { code: 'FRA', label: 'France (🇫🇷)' },
    { code: 'JPN', label: 'Japan (🇯🇵)' },
    { code: 'OTHER', label: 'Other Foreign National (🌍)' }
  ];

  const [showOtp, setShowOtp] = useState(false);
  const [otpValue, setOtpValue] = useState('');

  const handlePreSubmit = (e) => {
    e.preventDefault();
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
          nationality: isIndian ? 'Indian' : form.nationality,
          id_type: isIndian ? form.id_type : 'Passport',
        }),
      });
      const data = await res.json();
      
      // Keep session persistent across refresh
      localStorage.setItem('sy_tourist', JSON.stringify(data.tourist));
      localStorage.setItem('sentrix_id_number', form.id_number);
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

  // Dynamic Validation Rules
  const phoneProps = isIndian
    ? { pattern: "[0-9]{10}", maxLength: 10, title: "Phone number must be exactly 10 digits" }
    : { type: "tel", title: "Enter a valid international phone number" };

  const getIdProps = () => {
    if (isIndian) {
      if (form.id_type === 'Aadhaar') return { pattern: "[0-9]{12}", maxLength: 12, title: "Aadhaar must be exactly 12 digits" };
      if (form.id_type === 'DL') return { pattern: "[A-Za-z0-9]{10,20}", title: "Enter a valid Driving License number" };
    } else {
      // Passport validation based on country
      switch (form.nationality) {
        case 'USA': return { pattern: "[0-9]{9}", maxLength: 9, title: "US Passport must be 9 digits" };
        case 'UK': return { pattern: "[0-9]{9}", maxLength: 9, title: "UK Passport must be 9 digits" };
        case 'CAN': return { pattern: "[A-Za-z]{2}[0-9]{6}", maxLength: 8, title: "Canadian Passport: 2 letters, 6 digits" };
        case 'AUS': return { pattern: "[A-Za-z]{1}[0-9]{7}", maxLength: 8, title: "Australian Passport: 1 letter, 7 digits" };
        case 'JPN': return { pattern: "[A-Za-z]{2}[0-9]{7}", maxLength: 9, title: "Japanese Passport: 2 letters, 7 digits" };
        default: return { pattern: "[A-Za-z0-9]{6,15}", title: "Enter a valid Passport number (6-15 characters)" };
      }
    }
    return {};
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
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="sy-label">Nationality *</label>
              <select 
                className="sy-select" 
                required 
                value={form.nationality} 
                onChange={e => {
                  const val = e.target.value;
                  set('nationality', val);
                  if (val !== 'IND') set('id_type', 'Passport');
                  else set('id_type', 'Aadhaar');
                }}
              >
                {countries.map(country => (
                  <option key={country.code} value={country.code}>{country.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="sy-label">{t('registration.name', lang)} *</label>
              <input className="sy-input" required value={form.name} onChange={e => set('name', e.target.value)} placeholder={isIndian ? 'e.g. Rajesh Kumar' : 'e.g. John Doe'} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="sy-label">{t('registration.phone', lang)} *</label>
              <input className="sy-input" required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder={isIndian ? '9876543210' : '+1 555 123 4567'} {...phoneProps} />
            </div>
            <div>
              <label className="sy-label">{t('registration.emergencyContact', lang)} *</label>
              <input className="sy-input" required value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} placeholder={isIndian ? '9876543211' : '+44 7700 900077'} {...phoneProps} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {!isIndian ? (
              <div style={{ gridColumn: 'span 2' }}>
                <label className="sy-label">Passport Number *</label>
                <input className="sy-input" required value={form.id_number} onChange={e => set('id_number', e.target.value)} placeholder="Enter Passport No." {...getIdProps()} />
              </div>
            ) : (
              <>
                <div>
                  <label className="sy-label">{t('registration.idType', lang)}</label>
                  <select className="sy-select" value={form.id_type} onChange={e => set('id_type', e.target.value)}>
                    {idTypes.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="sy-label">{t('registration.idNumber', lang)} *</label>
                  <input className="sy-input" required value={form.id_number} onChange={e => set('id_number', e.target.value)} placeholder={form.id_type === 'Aadhaar' ? '12-digit Aadhaar' : 'DL Number'} {...getIdProps()} />
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="sy-label">{t('registration.tripStart', lang)} *</label>
              <input
                className="sy-input"
                type="month"
                required
                value={form.trip_start}
                min={thisMonth}
                onChange={e => set('trip_start', e.target.value)}
              />
            </div>
            <div>
              <label className="sy-label">{t('registration.tripEnd', lang)} *</label>
              <input
                className="sy-input"
                type="month"
                required
                value={form.trip_end}
                min={form.trip_start || thisMonth}
                onChange={e => set('trip_end', e.target.value)}
              />
            </div>
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

          {/* Consent */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--sy-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ marginTop: 2, accentColor: 'var(--sy-primary)' }} />
            {t('registration.consent', lang)}
          </label>

          <button type="submit" className="sy-btn sy-btn-primary sy-btn-lg" disabled={loading} style={{ width: '100%' }}>
            {loading ? t('registration.registering', lang) : t('registration.submit', lang)}
          </button>

          <span className="sy-data-label" style={{ alignSelf: 'center' }}>
            ℹ️ ID number hashed. Raw number never stored.
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
