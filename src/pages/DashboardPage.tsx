import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Armchair,
  Loader2,
  Printer,
  IndianRupee
} from 'lucide-react';

import AppLayout from '../layout/AppLayout';
import { syncAll } from '../lib/sync';
import BillPreviewModal from '../components/BillPreviewModal';
import SettlementModal from '../components/SettlementModal';

/* ---------------- TYPES ---------------- */

interface Table {
  id: string;
  name: string;
  capacity: number;
}

interface Area {
  id: string;
  name: string;
  tables: Table[];
}

type TableStatus = 'BLANK' | 'RUNNING' | 'RUNNING_KOT' | 'PRINTED' | 'PAID';

interface TableTile {
  tableId: string;
  tableName: string;
  capacity: number;
  areaId: string;

  sessionId?: string;
  splitIndex?: number;
  status: TableStatus;
}

/* ---------------- PAGE ---------------- */

export default function DashboardPage() {
  const navigate = useNavigate();

  const [areas, setAreas] = useState<Area[]>([]);
  const [activeAreaId, setActiveAreaId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const [tiles, setTiles] = useState<TableTile[]>([]);

  const [billTile, setBillTile] = useState<TableTile | null>(null);
  const [settleTile, setSettleTile] = useState<TableTile | null>(null);

  /* ---------------- LOAD DATA ---------------- */

  useEffect(() => {
    loadData();

    const onSyncDone = () => loadData();
    window.addEventListener('pos:sync:done', onSyncDone);

    return () => {
      window.removeEventListener('pos:sync:done', onSyncDone);
    };
  }, []);

  useEffect(() => {
    const reload = () => loadData();
    window.addEventListener('pos:table-updated', reload);
    return () => window.removeEventListener('pos:table-updated', reload);
  }, []);


  async function loadData() {
    if (!window.pos) return;

    const dbFloors: Area[] = await window.pos.getFloors();
    if (!Array.isArray(dbFloors)) return;

    setAreas(dbFloors);
    if (!activeAreaId && dbFloors.length > 0) {
      setActiveAreaId(dbFloors[0].id);
    }

    const nextTiles: TableTile[] = [];

    for (const area of dbFloors) {
      for (const table of area.tables) {
        const sessions = await window.pos.order.getOpenSessionsByTable(table.id);

        if (!sessions || sessions.length === 0) {
          // BLANK TABLE
          nextTiles.push({
            tableId: table.id,
            tableName: table.name,
            capacity: table.capacity,
            areaId: area.id,
            status: 'BLANK'
          });
          continue;
        }

        const childSessions = sessions.filter(
          s => s.parent_session_id !== null
        );

        // 🔥 IF SPLIT EXISTS → SHOW ONLY CHILD SESSIONS
        if (childSessions.length > 0) {
          childSessions
            .sort((a, b) => a.split_index - b.split_index)
            .forEach((s, idx) => {
              nextTiles.push({
                tableId: table.id,
                tableName: `${table.name} / ${idx + 1}`,
                capacity: table.capacity,
                areaId: area.id,
                sessionId: s.id,
                splitIndex: idx,
                status: s.status as TableStatus
              });
            });
        } else {
          // NORMAL SINGLE SESSION
          const s = sessions[0];
          nextTiles.push({
            tableId: table.id,
            tableName: table.name,
            capacity: table.capacity,
            areaId: area.id,
            sessionId: s.id,
            status: s.status as TableStatus
          });
        }
      }
    }

    setTiles(nextTiles);
  }

  async function handleManualSync() {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      await syncAll();
      await loadData();
    } finally {
      setIsSyncing(false);
    }
  }

  /* ---------------- NAVIGATION ---------------- */

  function openBillingTile(tile: TableTile) {
    navigate(`/billing/${tile.tableId}`, {
      state: {
        tableName: tile.tableName,
        areaName: areas.find(a => a.id === tile.areaId)?.name,
        orderId: tile.sessionId // 🔥 ALWAYS OPEN BY SESSION
      }
    });
  }

  const activeArea = areas.find(a => a.id === activeAreaId);

  function tileColor(status: TableStatus) {
    switch (status) {
      case 'RUNNING':
      case 'RUNNING_KOT':
        return 'border-blue-500 bg-blue-50';
      case 'PRINTED':
        return 'border-purple-500 bg-purple-50';
      default:
        return 'border-slate-200 bg-white';
    }
  }

  /* ---------------- UI ---------------- */

  return (
    <AppLayout>
      <div className="flex flex-col h-full">

        {/* AREA TABS */}
        {areas.length > 0 && (
          <div className="bg-white border-b px-4 pt-3 flex gap-2 overflow-x-auto">
            {areas.map(area => (
              <button
                key={area.id}
                onClick={() => setActiveAreaId(area.id)}
                className={`px-4 py-2 rounded-t-lg text-sm font-bold ${
                  activeAreaId === area.id
                    ? 'bg-slate-100 text-blue-600'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {area.name}
              </button>
            ))}
          </div>
        )}

        {/* TABLE GRID */}
        <div className="flex-1 p-4 bg-slate-50 overflow-y-auto">
          {activeArea && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4">
              {tiles
                .filter(t => t.areaId === activeArea.id)
                .map(tile => (
                  <div
                    key={tile.sessionId ?? tile.tableId}
                    className={`group relative h-28 rounded-xl border transition ${tileColor(
                      tile.status
                    )}`}
                  >
                    <button
                      onClick={() => openBillingTile(tile)}
                      className="absolute inset-0 flex flex-col items-center justify-center text-center"
                    >
                      <div className="w-9 h-9 rounded-full bg-white shadow flex items-center justify-center mb-1">
                        <Armchair className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="text-sm font-bold">{tile.tableName}</div>
                      <div className="text-[10px] text-slate-400">
                        {tile.capacity} seats
                      </div>
                    </button>

                    {(tile.status === 'RUNNING' ||
                      tile.status === 'PRINTED') && (
                      <button
                        onClick={() => setBillTile(tile)}
                        className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white shadow"
                      >
                        <Printer size={14} />
                      </button>
                    )}

                    {tile.status === 'PRINTED' && (
                      <button
                        onClick={() => setSettleTile(tile)}
                        className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center w-7 h-7 rounded-full bg-purple-600 text-white shadow"
                      >
                        <IndianRupee size={14} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* BILL PREVIEW */}
      {billTile && !settleTile && (
        <BillPreviewModal
          tableId={billTile.tableId}
          orderId={billTile.sessionId}
          tableName={billTile.tableName}
          onClose={() => setBillTile(null)}
        />
      )}

      {/* SETTLEMENT */}
      {settleTile && (
        <SettlementModal
          tableId={settleTile.tableId}
          orderId={settleTile.sessionId}
          onClose={() => setSettleTile(null)}
        />
      )}
    </AppLayout>
  );
}
