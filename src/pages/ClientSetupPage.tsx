import { useEffect, useState } from 'react';
import axios from 'axios';
import { Server, Loader2, AlertCircle } from 'lucide-react';


// 🔑 READ PORT FROM ENV (RENDERER SAFE)
const LAN_PORT = import.meta.env.VITE_POS_LAN_PORT || 4321;

export default function ClientSetupPage() {
  const [hostIp, setHostIp] = useState('');
  const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'error'>('idle');
  const [error, setError] = useState('');
  

  useEffect(() => {
    discoverHost();
  }, []);

  async function discoverHost() {
    setStatus('searching');

    try {
      const result = await window.pos.discoverHost();
      setHostIp(result.ip);
      setStatus('found');
    } catch {
      setStatus('idle');
    }
  }


  async function confirmHost() {
    try {
      const res = await axios.get(
        `http://${hostIp}:${LAN_PORT}/lan/ping`,
        { timeout: 2000 }
      );

      if (res.data?.role !== 'HOST') {
        throw new Error('Not a valid host');
      }

      // Save HOST config
      await window.db.saveConfig('host_ip', hostIp);
      await window.db.saveConfig('host_port', LAN_PORT);

      localStorage.setItem('host_ip', hostIp);
      localStorage.setItem('host_port', LAN_PORT.toString());

      // HARD RELOAD → ROOT DECIDES
      window.location.reload();

    } catch (e) {
      setError('Unable to connect to HOST POS');
      setStatus('error');
    }
  }

  async function resetClientSetup() {
    await window.db.saveConfig('host_ip', null);
    await window.db.saveConfig('host_port', null);

    localStorage.removeItem('host_ip');
    localStorage.removeItem('host_port');
    localStorage.removeItem('pos_mode');

    window.location.reload();
  }


  return (
    <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
      <div className="bg-slate-900 p-10 rounded-2xl w-full max-w-lg border border-slate-800">

        <div className="text-center mb-8">
          <Server className="w-10 h-10 text-blue-500 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white">Connect to Main POS</h1>
          <p className="text-slate-400 text-sm">
            This terminal needs to connect to the main POS (HOST)
          </p>
        </div>

        {status === 'searching' && (
          <div className="flex items-center justify-center gap-3 text-blue-400">
            <Loader2 className="animate-spin w-5 h-5" />
            Searching for HOST POS on port {LAN_PORT}...
          </div>
        )}

        {(status === 'idle' || status === 'error') && (
          <>
            <label className="block text-sm text-slate-400 mb-2">
              Enter HOST IP manually
            </label>

            <input
              value={hostIp}
              onChange={e => setHostIp(e.target.value)}
              placeholder="192.168.1.50"
              className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 mb-4"
            />

            <button
              onClick={confirmHost}
              className="w-full py-3 bg-blue-600 rounded-xl text-white font-bold hover:bg-blue-700"
            >
              Connect to HOST
            </button>
            <button
              onClick={resetClientSetup}
              className="mt-4 w-full py-2 text-sm text-slate-400 hover:text-white underline"
            >
              Change POS Mode / Host
            </button>
          </>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
      </div>
    </div>
  );
}
