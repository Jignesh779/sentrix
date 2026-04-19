/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sentrix': {
          'bg': '#0a0e1a',
          'panel': '#0f172a',
          'border': '#1e293b',
          'cyan': '#00d4ff',
          'red': '#ff3b3b',
          'green': '#00ff88',
          'amber': '#ffaa00',
          'muted': '#64748b',
          'text': '#e2e8f0',
        }
      },
      fontFamily: {
        'inter': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'radar': 'radar 2s linear infinite',
        'flash-red': 'flashRed 1s ease-in-out 3',
        'slide-in': 'slideIn 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'alert-pulse': 'alertPulse 1.5s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(255, 59, 59, 0.5)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 59, 59, 0.8), 0 0 60px rgba(255, 59, 59, 0.4)' },
        },
        radar: {
          '0%': { boxShadow: '0 0 0 0 rgba(255, 59, 59, 0.6)' },
          '100%': { boxShadow: '0 0 0 40px rgba(255, 59, 59, 0)' },
        },
        flashRed: {
          '0%, 100%': { borderColor: 'rgba(255, 59, 59, 0.3)' },
          '50%': { borderColor: 'rgba(255, 59, 59, 1)', backgroundColor: 'rgba(255, 59, 59, 0.1)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        alertPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 212, 255, 0.5)' },
          '50%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.3)' },
        },
      },
    },
  },
  plugins: [],
}
