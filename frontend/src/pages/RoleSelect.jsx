import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function RoleSelect() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(null);

  const roles = [
    {
      id: 'tourist',
      icon: '🌍',
      title: 'Tourist',
      subtitle: 'Safety Pass',
      description: 'Register, get your blockchain-verified Digital ID, access real-time risk alerts, and trigger SOS in emergencies.',
      features: ['Digital ID with QR', 'Live Risk Map', 'SOS Emergency System', 'Offline Mesh Fallback'],
      gradient: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
      glowColor: 'rgba(99, 102, 241, 0.25)',
      path: '/tourist',
    },
    {
      id: 'authority',
      icon: '🛡️',
      title: 'Authority',
      subtitle: 'Command Center',
      description: 'Monitor live emergencies, dispatch rescue units via ERSS-112, and audit the immutable blockchain trail.',
      features: ['Live Alert Dashboard', 'ERSS-112 Dispatch', 'Blockchain Audit', 'AI Risk Intelligence'],
      gradient: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
      glowColor: 'rgba(239, 68, 68, 0.25)',
      path: '/dashboard',
    },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      background: 'var(--sy-bg)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background decorative elements */}
      <div style={{
        position: 'absolute', top: -120, right: -120,
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, left: -80,
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div className="sy-fade-in" style={{ textAlign: 'center', marginBottom: 56, position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 88, height: 88, borderRadius: '28px',
          background: 'var(--sy-primary)',
          boxShadow: '0 12px 40px rgba(214, 109, 81, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
          border: '2px solid rgba(255,255,255,0.8)',
          marginBottom: 28,
        }}>
          <span style={{ fontSize: 42, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>🛡️</span>
        </div>
        <h1 style={{
          fontFamily: 'Outfit, Inter, sans-serif',
          fontSize: 44, fontWeight: 800, color: 'var(--sy-text)',
          letterSpacing: '-0.04em', marginBottom: 8, lineHeight: 1.1,
        }}>
          Sentrix
        </h1>
        <p style={{
          fontSize: 13, color: 'var(--sy-primary-dark)', fontWeight: 700,
          letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12,
        }}>
          Tourist Safety & Incident Response
        </p>
        <p style={{
          fontSize: 15, color: 'var(--sy-text-secondary)', maxWidth: 480,
          margin: '0 auto', lineHeight: 1.6, fontWeight: 500,
        }}>
          India's 7-stage blockchain-powered protection system.
          <br />Choose your role to continue.
        </p>
      </div>

      {/* Role Cards */}
      <div className="sy-fade-in" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 28,
        maxWidth: 760,
        width: '100%',
        position: 'relative',
        zIndex: 1,
      }}>
        {roles.map((role) => (
          <div
            key={role.id}
            onClick={() => navigate(role.path)}
            onMouseEnter={() => setHovered(role.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              position: 'relative',
              borderRadius: 24,
              background: '#ffffff',
              border: `2px solid ${hovered === role.id ? 'transparent' : 'var(--sy-border)'}`,
              padding: '36px 32px',
              cursor: 'pointer',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: hovered === role.id ? 'translateY(-6px)' : 'translateY(0)',
              boxShadow: hovered === role.id
                ? `0 20px 60px ${role.glowColor}, 0 0 0 2px ${role.glowColor}`
                : '0 4px 16px rgba(0,0,0,0.04)',
              overflow: 'hidden',
            }}
          >
            {/* Top gradient accent bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 4,
              background: role.gradient,
              opacity: hovered === role.id ? 1 : 0.4,
              transition: 'opacity 0.3s',
            }} />

            {/* Icon */}
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: role.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24,
              boxShadow: hovered === role.id ? `0 8px 24px ${role.glowColor}` : 'none',
              transition: 'box-shadow 0.3s',
            }}>
              <span style={{ fontSize: 30, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{role.icon}</span>
            </div>

            {/* Title */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{
                fontSize: 26, fontWeight: 800, color: 'var(--sy-text)',
                letterSpacing: '-0.02em', marginBottom: 2,
              }}>
                {role.title}
              </h2>
              <span style={{
                fontSize: 12, fontWeight: 700, color: 'var(--sy-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.12em',
              }}>
                {role.subtitle}
              </span>
            </div>

            {/* Description */}
            <p style={{
              fontSize: 14, color: 'var(--sy-text-secondary)',
              lineHeight: 1.65, marginBottom: 24, fontWeight: 500,
            }}>
              {role.description}
            </p>

            {/* Features */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px',
              marginBottom: 28,
            }}>
              {role.features.map((feat, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, fontWeight: 600, color: 'var(--sy-text-secondary)',
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: role.gradient,
                    flexShrink: 0,
                  }} />
                  {feat}
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <div style={{
              padding: '14px 0',
              background: hovered === role.id ? role.gradient : '#f8fafc',
              borderRadius: 14,
              textAlign: 'center',
              fontWeight: 700, fontSize: 14,
              color: hovered === role.id ? '#ffffff' : 'var(--sy-text)',
              transition: 'all 0.3s',
              border: hovered === role.id ? 'none' : '1px solid var(--sy-border)',
              letterSpacing: '0.02em',
            }}>
              {role.id === 'tourist' ? 'Enter as Tourist →' : 'Open Command Center →'}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sy-fade-in" style={{
        marginTop: 48, textAlign: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 20,
          padding: '12px 24px',
          background: 'rgba(255,255,255,0.6)',
          border: '1px solid var(--sy-border)',
          borderRadius: 14,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sy-text-muted)', letterSpacing: '0.05em' }}>
            🔗 SHA-256 Blockchain
          </span>
          <div style={{ width: 1, height: 14, background: 'var(--sy-border)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sy-text-muted)', letterSpacing: '0.05em' }}>
            🤖 AI/ML Risk Engine
          </span>
          <div style={{ width: 1, height: 14, background: 'var(--sy-border)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sy-text-muted)', letterSpacing: '0.05em' }}>
            📡 ERSS-112 Integration
          </span>
        </div>
        <p style={{
          marginTop: 16, fontSize: 11, color: 'var(--sy-text-muted)',
          fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          SIH 2025 · Problem Statement SIH25002
        </p>
      </div>
    </div>
  );
}
