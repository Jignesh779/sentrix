import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

export default function VerifyID() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledHash = searchParams.get('id') || '';

  const [idHash, setIdHash] = useState(prefilledHash);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auto-verify if hash was passed via URL (e.g. QR scan at hotel / checkpoint)
  useEffect(() => {
    if (prefilledHash) handleVerify(null, prefilledHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify(e, hash) {
    if (e) e.preventDefault();
    const target = hash || idHash;
    if (!target.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API}/api/verify-id/${target.trim()}`);
      if (!res.ok) throw new Error('Verification request failed');
      const data = await res.json();
      setResult(data);
    } catch {
      setError('Could not verify. Please check the ID and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--sy-bg)' }}>
      <div style={{ maxWidth: 480, width: '100%' }} className="sy-fade-in">
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--sy-primary)', cursor: 'pointer' }}
            onClick={() => navigate('/tourist')}
          >
            ← Back to Sentrix
          </span>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--sy-primary-lighter)', marginTop: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 28 }}>🔍</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.5px' }}>Verify Tourist Identity</h1>
          <p style={{ color: 'var(--sy-text-secondary)', fontSize: 14, marginTop: 4 }}>
            Enter the Sentrix ID or scan the QR code to verify a tourist's blockchain-secured identity.
          </p>
        </div>

        {/* Search Card */}
        <form onSubmit={(e) => handleVerify(e)} className="sy-card" style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
          <div>
            <label className="sy-label">Sentrix ID Hash</label>
            <input
              className="sy-input"
              value={idHash}
              onChange={e => setIdHash(e.target.value)}
              placeholder="e.g. SY-a1b2c3d4e5f6"
              style={{ fontFamily: 'monospace', fontSize: 15 }}
              required
            />
          </div>
          <button type="submit" className="sy-btn sy-btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Verifying on Blockchain...' : '🔗 Verify Identity'}
          </button>
        </form>

        {/* Error State */}
        {error && (
          <div className="sy-card sy-fade-in" style={{ background: 'var(--sy-red-light)', borderColor: 'var(--sy-red)', padding: 20, textAlign: 'center' }}>
            <span style={{ fontSize: 32 }}>❌</span>
            <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--sy-red)', marginTop: 8 }}>{error}</p>
          </div>
        )}

        {/* Result: Verified */}
        {result && result.verified && (
          <div className="sy-card sy-fade-in" style={{ padding: 28 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--sy-green-light)', marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>✅</span>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--sy-green)' }}>Identity Verified</h2>
              <p style={{ fontSize: 13, color: 'var(--sy-text-secondary)', marginTop: 2 }}>This tourist's identity is secured and validated on the Sentrix Blockchain.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, textAlign: 'left' }}>
              <div>
                <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Name</span>
                <p style={{ fontSize: 15, fontWeight: 700 }}>{result.tourist_data?.name || 'N/A'}</p>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Nationality</span>
                <p style={{ fontSize: 15, fontWeight: 700 }}>{result.tourist_data?.nationality || 'N/A'}</p>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Blood Group</span>
                <p style={{ fontSize: 15, fontWeight: 700 }}>{result.tourist_data?.blood_group || '—'}</p>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Block Index</span>
                <p style={{ fontSize: 15, fontWeight: 700 }}>#{result.block_index ?? 'N/A'}</p>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Trip Start</span>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{result.tourist_data?.trip_start || 'N/A'}</p>
              </div>
              <div>
                <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Trip End</span>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{result.tourist_data?.trip_end || 'N/A'}</p>
              </div>
              {/* Medical conditions — highlighted for checkpoint officers */}
              {result.tourist_data?.medical_conditions && (
                <div style={{ gridColumn: 'span 2', padding: '10px 14px', background: 'var(--sy-red-light)', borderRadius: 8, border: '1px solid #fca5a5', marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--sy-red)', fontWeight: 700, textTransform: 'uppercase' }}>⚕️ Medical Conditions</span>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--sy-red)', marginTop: 3 }}>{result.tourist_data.medical_conditions}</p>
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <span className="sy-badge sy-badge-green">🔗 Blockchain Secured · Tamper-Proof</span>
            </div>

            {result.block_hash && (
              <div style={{ marginTop: 16, padding: 12, background: '#1a1a1a', borderRadius: 8, color: '#10b981', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', textAlign: 'center' }}>
                <span style={{ opacity: 0.5 }}>HASH: </span>{result.block_hash}
              </div>
            )}
          </div>
        )}

        {/* Result: Not Found */}
        {result && !result.verified && (
          <div className="sy-card sy-fade-in" style={{ textAlign: 'center', padding: 28 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--sy-red-light)', marginBottom: 12 }}>
              <span style={{ fontSize: 28 }}>⚠️</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sy-red)' }}>Identity Not Found</h3>
            <p style={{ color: 'var(--sy-text-secondary)', fontSize: 13, marginTop: 4 }}>
              No matching record found on the Sentrix Blockchain. This ID may be invalid or has not been registered.
            </p>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--sy-text-muted)', marginTop: 16 }}>
          This verification is powered by Sentrix's distributed ledger. Zero PII is stored.
        </p>
      </div>
    </div>
  );
}
