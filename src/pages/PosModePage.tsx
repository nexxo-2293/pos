import { Monitor, Network } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PosModePage() {
  const navigate = useNavigate();

  async function selectMode(mode: 'HOST' | 'CLIENT') {
    try {
      // 1️⃣ Save to SQLite (source of truth)
      await window.pos.saveConfig('pos_mode', mode);

      console.log('[POS MODE] Selected:', mode);

      // 3️⃣ HARD RELOAD APP (IMPORTANT)
      // This forces App.tsx boot logic to re-run
      window.location.reload();

    } catch (err) {
      console.error('Failed to set POS mode:', err);
      alert('Failed to set POS mode. Please restart the app.');
    }
  }


  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
      <div className="bg-slate-900 rounded-2xl p-10 w-full max-w-lg border border-slate-800">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">
          Select POS Mode
        </h1>
        <p className="text-slate-400 text-sm mb-8 text-center">
          This decides how this terminal behaves on the network.
        </p>

        <div className="space-y-4">
          <button
            onClick={() => selectMode('HOST')}
            className="w-full flex items-center gap-4 p-5 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-700"
          >
            <Monitor className="w-6 h-6 text-blue-500" />
            <div className="text-left">
              <p className="text-white font-bold">Main POS (HOST)</p>
              <p className="text-xs text-slate-400">
                Runs database & manages all terminals
              </p>
            </div>
          </button>

          <button
            onClick={() => selectMode('CLIENT')}
            className="w-full flex items-center gap-4 p-5 rounded-xl bg-slate-800 hover:bg-slate-700 transition border border-slate-700"
          >
            <Network className="w-6 h-6 text-green-500" />
            <div className="text-left">
              <p className="text-white font-bold">Secondary POS (CLIENT)</p>
              <p className="text-xs text-slate-400">
                Connects to another POS over LAN
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
