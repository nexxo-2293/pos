import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

import ActivationPage from './pages/ActivationPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BillingPage from './pages/BillingPage';
import PosModePage from './pages/PosModePage';
import ClientSetupPage from './pages/ClientSetupPage';

// --- Private Route ---
function PrivateRoute({ children }: { children: JSX.Element }) {
  const user = localStorage.getItem('pos_user');
  return user ? children : <Navigate to="/login" replace />;
}
function isElectronReady(): boolean {
  return typeof window !== 'undefined' && !!window.pos;
}

console.log('window.pos =', window.pos);


function App() {
  const [posMode, setPosMode] = useState<string | null>(null);
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [hostIp, setHostIp] = useState<string | null>(null);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // 🚨 Electron preload not ready yet
      if (!isElectronReady()) {
        console.log('[BOOT] Waiting for Electron preload...');
        setTimeout(boot, 100); // retry
        return;
      }

      // 1️⃣ POS MODE (FIRST, ALWAYS)
      const mode = await window.pos.getConfig('pos_mode');

      if (cancelled) return;

      if (!mode) {
        localStorage.removeItem('pos_mode');
        setPosMode(null);
        setIsActivated(null);
        setHostIp(null);
        setBootDone(true);
        return;
      }

      setPosMode(mode);
      localStorage.setItem('pos_mode', mode);

      // 2️⃣ CLIENT HOST CONFIG
      if (mode === 'CLIENT') {
        const ip = await window.pos.getConfig('host_ip');
        if (cancelled) return;

        setHostIp(ip || null);
        setIsActivated(true); // CLIENT never activates
        setBootDone(true);
        return;
      }

      // 3️⃣ HOST ACTIVATION FLAG
      const activated = await window.pos.getConfig('is_activated');
      if (cancelled) return;

      setIsActivated(Boolean(activated));
      setBootDone(true);
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, []);


  if (!bootDone) return null;

  console.log('[BOOT]', { posMode, isActivated, hostIp });

  return (
    <Router>
      <Routes>

        {/* ROOT DECISION */}
        <Route
          path="/"
          element={
            !posMode
              ? <PosModePage />

              : posMode === 'CLIENT' && !hostIp
                ? <ClientSetupPage />

                : posMode === 'CLIENT'
                  ? <Navigate to="/login" replace />

                  : !isActivated
                    ? <ActivationPage />

                    : <Navigate to="/login" replace />
          }
        />

        {/* LOGIN */}
        <Route path="/login" element={<LoginPage />} />

        {/* DASHBOARD */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />

        {/* BILLING */}
        <Route
          path="/billing/:tableId"
          element={
            <PrivateRoute>
              <BillingPage />
            </PrivateRoute>
          }
        />

      </Routes>
    </Router>
  );
}

export default App;
