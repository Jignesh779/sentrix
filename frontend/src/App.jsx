import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import LandingPage from './pages/LandingPage';
import Registration from './pages/Registration';
import DigitalIDPage from './pages/DigitalIDPage';
import TravelView from './pages/TravelView';
import SOSConfirmation from './pages/SOSConfirmation';
import SOSHistory from './pages/SOSHistory';
import Dashboard from './pages/Dashboard';
import VerifyID from './pages/VerifyID';

import './index.css';

/**
 * Backwards compatibility for the SafeYatra -> Sentrix rebrand.
 * Migrates old LocalStorage keys so users don't lose their session or ID.
 */
function migrateLocalStorage() {
  try {
    const migrations = {
      'safeyatra_id_number': 'sentrix_id_number',
      'safeyatra_auto_login': 'sentrix_auto_login'
    };
    for (const [oldKey, newKey] of Object.entries(migrations)) {
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
    }
  } catch (e) {
    console.warn('Migration failed:', e);
  }
}
// Run migration once on app load
migrateLocalStorage();

/**
 * Route-based dynamic tab titles
 */
function TitleManager() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith('/dashboard')) {
      document.title = 'Sentrix | Command Center';
    } else if (location.pathname.startsWith('/verify')) {
      document.title = 'Sentrix | ID Verification';
    } else {
      document.title = 'Sentrix | Tourist Safety Pass';
    }
  }, [location.pathname]);

  return null;
}

export default function App() {
  const [lang, setLang] = useState('en');
  const [, setRegistrationData] = useState(null);

  return (
    <BrowserRouter>
      <TitleManager />
      <Routes>
        {/* Tourist-facing PWA */}
        <Route path="/" element={<Navigate to="/tourist" replace />} />
        <Route path="/tourist" element={<LandingPage lang={lang} onLangChange={setLang} />} />
        <Route path="/tourist/register" element={<Registration lang={lang} onRegistered={setRegistrationData} />} />
        <Route path="/tourist/digital-id" element={<DigitalIDPage lang={lang} />} />
        <Route path="/tourist/travel" element={<TravelView lang={lang} />} />
        <Route path="/tourist/sos" element={<SOSConfirmation lang={lang} />} />
        <Route path="/tourist/sos-history" element={<SOSHistory lang={lang} />} />
        <Route path="/verify" element={<VerifyID />} />

        {/* Authority Dashboard — direct access (login removed for hackathon) */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
