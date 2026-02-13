import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  RefreshCw,
  User,
  Delete,
  Wifi,
  WifiOff,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

import { Security } from '../lib/security';
import { syncAll } from '../lib/sync';

// ENV
const LAN_PORT = import.meta.env.VITE_POS_LAN_PORT || 4321;

export default function LoginPage() {
  const navigate = useNavigate();

  // -----------------------------
  // CORE STATE
  // -----------------------------
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // -----------------------------
  // DATA STATE
  // -----------------------------
  const [staffList, setStaffList] = useState<any[]>([]);
  const [deviceConfig, setDeviceConfig] = useState<any>(null);
  const [hotelProfile, setHotelProfile] = useState<any>(null);

  const posMode = localStorage.getItem('pos_mode'); // HOST | CLIENT

  // -----------------------------
  // 1️⃣ LOAD DEVICE + HOTEL (ONCE)
  // -----------------------------
  useEffect(() => {
    if (!window.pos) return;

    (async () => {
      try {
        const device = await window.pos.getConfig('pos_device');
        const hotel = await window.pos.getConfig('hotel_profile');

        if (device) setDeviceConfig(device);
        if (hotel) setHotelProfile(hotel);

      } catch (e) {
        console.error('[LOGIN INIT CONFIG ERROR]', e);
      }
    })();
  }, []);

  // -----------------------------
  // 2️⃣ LOAD STAFF (HOST ONLY)
  // -----------------------------
  useEffect(() => {
    if (!window.pos || posMode !== 'HOST') return;

    (async () => {
      try {
        const dbStaff = await window.pos.getStaff?.();
        setStaffList(dbStaff || []);
      } catch (e) {
        console.error('[LOGIN STAFF LOAD ERROR]', e);
      }
    })();
  }, [posMode]);

  // -----------------------------
  // 3️⃣ ONLINE / OFFLINE STATUS
  // -----------------------------
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);

    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // -----------------------------
  // 4️⃣ KEYBOARD HANDLING
  // -----------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (loading) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNum(e.key);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        setPin(prev => prev.slice(0, -1));
        setError('');
        return;
      }

      if (e.key === 'Enter' && pin.length === 4) {
        e.preventDefault();
        handleLogin();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, loading]);

  // -----------------------------
  // 5️⃣ SYNC (HOST ONLY)
  // -----------------------------
  async function syncStaff() {
    if (posMode !== 'HOST') return;

    if (!isOnline) {
      setError('Offline: Cannot sync');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await syncAll();
      const dbStaff = await window.pos.getStaff?.();
      setStaffList(dbStaff || []);
    } catch (err) {
      console.error('[SYNC ERROR]', err);
      setError('Sync failed');
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // 6️⃣ LOGIN HANDLER
  // -----------------------------
  async function handleLogin() {
    if (pin.length !== 4) return;

    setLoading(true);
    setError('');

    try {
      // ---------- CLIENT MODE ----------
      if (posMode === 'CLIENT') {
        const hostIp = localStorage.getItem('host_ip');
        const hostPort = localStorage.getItem('host_port') || LAN_PORT;

        if (!hostIp) throw new Error('HOST_NOT_CONFIGURED');

        const res = await fetch(`http://${hostIp}:${hostPort}/lan/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });

        if (!res.ok) throw new Error('LOGIN_FAILED');

        const data = await res.json();
        localStorage.setItem('pos_user', JSON.stringify(data));
        navigate('/dashboard');
        return;
      }

      // ---------- HOST MODE ----------
      const employee = staffList.find(s =>
        s.pin_hash && Security.verifyPin(pin, s.pin_hash)
      );

      if (!employee) throw new Error('INVALID_PIN');

      localStorage.setItem('pos_user', JSON.stringify(employee));
      navigate('/dashboard');

    } catch (e: any) {
      console.error('[LOGIN ERROR]', e);

      if (e.message === 'HOST_NOT_CONFIGURED' || e.message === 'LOGIN_FAILED') {
        setError('Main POS not reachable');
        setTimeout(() => navigate('/'), 1500);
      } else {
        setError('Incorrect PIN');
      }

      setPin('');
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // HELPERS
  // -----------------------------
  const handleNum = (num: string) => {
    if (!/^\d$/.test(num)) return;
    if (pin.length < 4) setPin(prev => prev + num);
    setError('');
  };
  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="h-screen w-screen bg-slate-50 flex">

      {/* LEFT PANEL */}
      <div className="w-[40%] bg-slate-900 text-white p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-400 text-xs uppercase mb-3">
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? 'Connected' : 'Offline Mode'}
          </div>

          <h1 className="text-4xl font-bold mb-1">
            {hotelProfile?.name || 'Synrova POS'}
          </h1>

          <p className="text-slate-400 text-sm mb-10">
            {posMode === 'CLIENT'
              ? 'Client Terminal'
              : `Device: ${deviceConfig?.deviceId || deviceConfig?.deviceCode || 'Unknown'}`}
          </p>

          {posMode === 'HOST' && (
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
              <p className="text-slate-400 text-xs uppercase font-bold mb-4 flex items-center gap-2">
                <User className="w-3 h-3" /> Active Accounts
              </p>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {staffList.length === 0 ? (
                  <p className="text-slate-500 text-sm italic">
                    No staff found. Please Sync.
                  </p>
                ) : (
                  staffList.map(s => (
                    <div
                      key={s.id}
                      className="flex justify-between p-3 bg-slate-900/50 rounded-lg"
                    >
                      <span>{s.name}</span>
                      <span className="text-[10px] bg-blue-900/30 px-2 rounded">
                        {s.role}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {posMode === 'HOST' && (
            <button
              onClick={syncStaff}
              disabled={loading || !isOnline}
              className="mt-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Staff List
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          <ShieldCheck className="w-3 h-3" />
          End-to-End Encrypted
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md text-center">

          <div className="mb-10">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold text-slate-800">Staff Login</h2>
            <p className="text-slate-500 text-sm">Enter your 4-digit PIN</p>
          </div>

          {/* PIN DOTS */}
          <div className="flex justify-center gap-4 mb-6">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${
                  pin.length > i ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              />
            ))}
          </div>

          {error && (
            <div className="mb-4 text-red-500 flex justify-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* NUMPAD */}
          <div className="grid grid-cols-3 gap-5 w-72 mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <button
                key={n}
                onClick={() => handleNum(n.toString())}
                className="h-20 bg-white border rounded-2xl text-2xl font-bold"
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPin('')}
              className="h-20 bg-red-50 rounded-2xl"
            >
              C
            </button>
            <button
              onClick={() => handleNum('0')}
              className="h-20 bg-white rounded-2xl"
            >
              0
            </button>
            <button
              onClick={() => setPin(p => p.slice(0, -1))}
              className="h-20 bg-slate-100 rounded-2xl"
            >
              <Delete className="w-6 h-6 mx-auto" />
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={pin.length !== 4 || loading}
            className="mt-10 w-72 py-5 bg-blue-600 text-white rounded-2xl font-bold flex justify-center gap-2"
          >
            {loading && <Loader2 className="animate-spin w-5 h-5" />}
            {loading ? 'Verifying...' : 'Access Terminal'}
          </button>
        </div>
      </div>
    </div>
  );
}
