import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { t } from '../i18n';

export default function DigitalIDPage({ lang }) {
  const location = useLocation();
  const navigate = useNavigate();
  const reg = location.state?.registration;
  const [copied, setCopied] = useState(false);

  if (!reg) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--sy-text-secondary)', marginBottom: 16 }}>No registration data found.</p>
          <button className="sy-btn sy-btn-primary" onClick={() => navigate('/tourist/register')}>Register First</button>
        </div>
      </div>
    );
  }

  const tourist = reg.tourist;
  const digitalId = reg.digital_id;
  const blockchain = reg.blockchain;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--sy-bg)' }}>
      <div style={{ maxWidth: 440, width: '100%' }} className="sy-fade-in">
        {/* Success banner */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--sy-green-light)', marginBottom: 16 }}>
            <span style={{ fontSize: 28 }}>✅</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>
            {t('digitalId.title', lang)}
          </h1>
        </div>

        {/* ID Card */}
        <div className="sy-card" style={{ textAlign: 'center', padding: 32 }}>
          {/* QR Code */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid var(--sy-border)' }}>
              <QRCodeSVG
                value={digitalId.qr_payload || 'sentrix'}
                size={180}
                level="M"
                fgColor="#111827"
              />
            </div>
          </div>

          {/* Tourist Info */}
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{tourist.name}</h2>
          <p style={{ color: 'var(--sy-text-secondary)', fontSize: 14, marginBottom: 16 }}>
            {tourist.nationality} — {tourist.id_type}
          </p>

          {/* Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, textAlign: 'left', marginBottom: 20 }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Sentrix ID</span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--sy-primary)' }}>{tourist.tourist_id}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Blood Group</span>
              <p style={{ fontSize: 16, fontWeight: 700 }}>{tourist.blood_group || '—'}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{t('digitalId.validUntil', lang)}</span>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{tourist.trip_end}</p>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Block</span>
              <p style={{ fontSize: 14, fontWeight: 600 }}>#{blockchain?.block_index ?? '—'}</p>
            </div>
          </div>

          {/* Blockchain Badge — only meaningful if block_index is real */}
          <div className="sy-badge sy-badge-green" style={{ margin: '0 auto 12px' }}>
            🔗 {t('digitalId.verified', lang)} {blockchain?.block_index != null ? `(Block #${blockchain.block_index})` : ''}
          </div>

          {/* Hash */}
          <p style={{ fontSize: 11, color: 'var(--sy-text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {blockchain.block_hash}
          </p>
        </div>

        {/* Data Flow Label */}
        <div style={{ textAlign: 'center', marginTop: 12, marginBottom: 24 }}>
          <span className="sy-data-label">ℹ️ {t('digitalId.dataNote', lang)}</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="sy-btn sy-btn-primary sy-btn-lg"
            style={{ flex: 1 }}
            onClick={() => navigate('/tourist/travel', { state: { tourist } })}
          >
            {t('digitalId.startJourney', lang)} →
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button
            className="sy-btn sy-btn-outline"
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => navigate(`/verify?id=${digitalId.id_hash}`)}
          >
            🔍 Verify at Checkpoint
          </button>
          <button
            className="sy-btn sy-btn-outline"
            style={{ flex: 1, fontSize: 13, position: 'relative' }}
            onClick={() => {
              const url = `${window.location.origin}/verify?id=${digitalId.id_hash}`;
              navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              });
            }}
          >
            {copied ? (
              <span style={{ color: 'var(--sy-green)', fontWeight: 700 }}>✅ Copied!</span>
            ) : (
              <>📋 Copy Verify Link</>
            )}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--sy-text-muted)', marginTop: 12 }}>
          {t('digitalId.scanAtCheckpoint', lang)}
        </p>
      </div>
    </div>
  );
}
