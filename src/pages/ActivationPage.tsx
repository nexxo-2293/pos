import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, ShieldCheck, AlertCircle, CheckCircle2, Server, Key } from 'lucide-react';
import axios from 'axios';
import { Security } from '../lib/security';
import { useEffect } from 'react';
import { syncAll } from '../lib/sync';




// Read from .env
const CENTRAL_SERVER = import.meta.env.VITE_CENTRAL_API_URL;

export default function ActivationPage() {
  const navigate = useNavigate();
  
  // UI State
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  
  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [syncLog, setSyncLog] = useState<string[]>([]);

  useEffect(() => {
    const mode = localStorage.getItem('pos_mode');
    if (mode === 'CLIENT') {
        console.error('CLIENT attempted activation – redirecting');
        navigate('/login', { replace: true });
    }
    }, []);

  // --- DRAG & DROP HANDLERS ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  // --- FILE PARSING ---
  const handleFile = async (file: File) => {
    setError('');
    
    if (!file.name.endsWith('.lic')) {
      setError("Invalid file format. Please upload a .lic file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        let licenseData;
        
        // Robust JSON parsing (Handle Plain JSON or Base64)
        try { 
            licenseData = JSON.parse(content); 
        } catch { 
            try {
                licenseData = JSON.parse(atob(content)); 
            } catch (err) {
                throw new Error("File content is corrupted.");
            }
        }

        // Validate License Fields
        if (!licenseData.hotelId || !licenseData.apiKey) {
           throw new Error("Invalid License: Missing Hotel ID or API Key");
        }

        // Start the Secure Handshake
        startSecureActivation(licenseData);

      } catch (err: any) {
        console.error(err);
        setError(err.message || "Corrupt or invalid license file.");
      }
    };
    reader.readAsText(file);
  };

  // --- LOGIC: SECURE SYNC (SQLITE EDITION) ---
  async function startSecureActivation(license: any) {
  setIsSyncing(true);
  setProgress(10);
  addLog(`License loaded for ${license.hotelName || 'Hotel'}`);

  try {
    const { hotelId, apiKey } = license;

    // 1. Save license FIRST (SQLite = source of truth)
    await window.pos.saveConfig('pos_license', {
      hotelId,
      apiKey,
      hotelName: license.hotelName,
      plan: license.plan
    });

    addLog('License saved locally');

    setProgress(25);
    setStatusMsg('Registering device…');

    // 2. Device registration (still here – activation concern)
    const regRes = await axios.post(
      `${CENTRAL_SERVER}/pos/register`,
      { hotelId, licenseKey: apiKey }
    );

    const { deviceId } = regRes.data;

    await window.pos.saveConfig('pos_device', {
      deviceId
    });

    addLog(`Device registered (${deviceId})`);
    setProgress(40);

    // 3. FULL SYNC (single source of truth)
    setStatusMsg('Cloning hotel database…');
    addLog('Starting secure bootstrap sync');

    await syncAll(); // 🔥 THIS IS THE KEY CHANGE

    setProgress(90);
    setStatusMsg('Finalizing activation…');

    await window.pos.saveConfig('is_activated', true);
    await window.pos.saveConfig('pos_mode', 'HOST');

    addLog('Activation complete');
    setProgress(100);

    setTimeout(() => {
      window.location.reload();
    }, 1200);

  } catch (err: any) {
    console.error(err);
    setIsSyncing(false);
    setSyncLog([]);

    if (err.response) {
      setError(err.response.data?.error || err.message);
    } else {
      setError('Activation failed. Check server or license.');
    }
  }
}

  function addLog(msg: string) {
    setSyncLog(prev => [...prev, msg]);
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex">
        
        {/* LEFT PANEL */}
        <div className="w-[40%] bg-slate-900 border-r border-slate-800 p-10 flex flex-col justify-between">
        
        <div>
            <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
                <h1 className="text-2xl font-bold text-white">Synrova POS</h1>
                <p className="text-xs text-slate-400 tracking-wider uppercase">
                Secure Device Activation
                </p>
            </div>
            </div>

            <div className="space-y-6 text-slate-300 text-sm leading-relaxed">
            <p>
                This terminal must be securely activated before use.
            </p>
            <p>
                Activation links this device to your hotel license and downloads:
            </p>
            <ul className="list-disc list-inside text-slate-400 space-y-1">
                <li>Menu & floor layout</li>
                <li>Staff accounts</li>
                <li>Taxes & configuration</li>
                <li>Offline-ready database</li>
            </ul>
            </div>
        </div>

        <div className="text-xs text-slate-500">
            Central Server<br />
            <span className="font-mono">{CENTRAL_SERVER}</span>
        </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 flex items-center justify-center p-16">
        <div className="w-full max-w-2xl">
            
            {/* HEADER */}
            <div className="text-center mb-10">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6 shadow-lg ${
                isSyncing ? 'bg-blue-600' : 'bg-slate-800'
            }`}>
                {isSyncing
                ? <Key className="w-10 h-10 text-white animate-pulse" />
                : <UploadCloud className="w-10 h-10 text-blue-500" />
                }
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">
                {isSyncing ? 'Secure Setup in Progress' : 'Activate This Terminal'}
            </h2>
            <p className="text-slate-400">
                {isSyncing
                ? 'Please wait while we securely configure this device.'
                : 'Upload your license file to continue.'}
            </p>
            </div>

            {/* UPLOAD MODE */}
            {!isSyncing && (
            <div
                className={`relative border-2 border-dashed rounded-3xl p-14 text-center transition-all cursor-pointer ${
                dragActive
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleChange}
                accept=".lic"
                />

                <p className="text-xl font-semibold text-white mb-2">
                Drop License File (.lic)
                </p>
                <p className="text-sm text-slate-400">
                or click anywhere to browse
                </p>
            </div>
            )}

            {/* SYNC MODE */}
            {isSyncing && (
            <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl">
                <div className="flex justify-between items-center mb-3">
                <span className="text-white font-semibold">{statusMsg}</span>
                <span className="text-blue-400 font-mono text-sm">{progress}%</span>
                </div>

                <div className="h-3 bg-slate-950 rounded-full overflow-hidden mb-6">
                <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                />
                </div>

                <div className="bg-slate-950 rounded-xl p-4 h-56 overflow-y-auto font-mono text-xs text-slate-400 border border-slate-800">
                {syncLog.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500 mt-0.5" />
                    <span>{log}</span>
                    </div>
                ))}
                </div>
            </div>
            )}

            {/* ERROR */}
            {error && (
            <div className="mt-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 flex gap-2">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
            </div>
            )}
        </div>
        </div>
    </div>
    );
}