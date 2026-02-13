import { useEffect, useState } from 'react';
import {
  Menu,
  Wifi,
  WifiOff,
  RefreshCw,
  User,
  LogOut,
  Truck,
  ShoppingBag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { syncAll } from '../lib/sync';

export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const navigate = useNavigate();

  const [config, setConfig] = useState<any>({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  const user = JSON.parse(localStorage.getItem('pos_user') || '{}');
  const mode = localStorage.getItem('pos_mode');

  useEffect(() => {
    loadConfig();

    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);

    const timer = setInterval(() => setCurrentTime(new Date()), 60000);

    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      clearInterval(timer);
    };
  }, []);

  async function loadConfig() {
    const cfg = await window.pos.getConfig('pos_license');
    if (cfg) setConfig(cfg);
  }

  async function handleSync() {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);

    try {
      await syncAll();
    } catch {
      alert('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }

  function logout() {
    if (confirm('Confirm logout?')) {
      localStorage.removeItem('pos_user');
      navigate('/login');
    }
  }

  return (
    <header className="bg-white border-b shadow-sm z-10">

      {/* ================= TOP LAYER ================= */}
      <div className="h-12 px-6 flex items-center justify-between border-b">

        {/* LEFT */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="font-bold text-sm text-slate-800">
              Synrova POS • {config.hotelName || 'Hotel'}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
              <span
                className={`flex items-center gap-1 ${
                  isOnline ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {isOnline ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>

              <span>
                {currentTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>

              <button
                onClick={handleSync}
                disabled={!isOnline || isSyncing}
                className="ml-2 text-blue-600 underline flex items-center gap-1"
              >
                <RefreshCw
                  className={`w-3 h-3 ${
                    isSyncing ? 'animate-spin' : ''
                  }`}
                />
                Sync
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT (MOVED USER SECTION HERE) */}
        <div className="flex items-center gap-4">

          <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">
            {mode}
          </span>

          <div className="text-right hidden md:block">
            <p className="text-sm font-bold">
              {user.name || 'Staff'}
            </p>
            <p className="text-xs text-slate-500 uppercase">
              {user.role || ''}
            </p>
          </div>

          <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-slate-600" />
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>

        </div>
      </div>

      {/* ================= SECOND LAYER ================= */}
      <div className="h-12 px-6 flex items-center justify-between">

        {/* LEFT SIDE ACTIONS */}
        <div className="flex items-center gap-3">

          <button
            onClick={() => navigate('/dashboard')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            New Order
          </button>

          <button
            onClick={() => navigate('/billing/takeaway', { 
              state: { fromNavbar: true } 
            })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            Takeaway
          </button>

          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            <Truck className="w-4 h-4" />
            Delivery
          </button>

        </div>

      </div>

    </header>
  );
}
