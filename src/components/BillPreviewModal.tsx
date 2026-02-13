import { useMemo } from 'react';
import { X, Printer } from 'lucide-react';
import { useBillingStore } from '../store/billingStore';

export default function BillPreviewModal({
  tableId,
  tableName,
  onClose
}: {
  tableId: string;
  tableName: string;
  onClose: () => void;
}) {
  const { sessions, markBillPrinted } = useBillingStore();
  const session = sessions[tableId];

  const staffId = (() => {
    try {
      return JSON.parse(localStorage.getItem('pos_user') || '{}').id;
    } catch {
      return null;
    }
  })();

  if (!session || session.session?.status === 'PAID') return null;

  /* ---------------- ITEMS (DB SNAPSHOT) ---------------- */

  const items = useMemo(() => {
    if (!session) return [];

    const map = new Map<string, any>();

    session.kots?.forEach((kot: any) => {
      kot.items.forEach((i: any) => {
        const e = map.get(i.product_id);
        if (e) {
          e.qty += i.qty;
          e.total += i.qty * i.price;
        } else {
          map.set(i.product_id, {
            productId: i.product_id,
            name: i.name,
            qty: i.qty,
            price: i.price,
            total: i.qty * i.price
          });
        }
      });
    });

    session.adjustments?.forEach((a: any) => {
      const item = map.get(a.product_id);
      if (item) {
        item.qty += a.qty_change;
        item.total += a.qty_change * item.price;
      }
    });

    return Array.from(map.values()).filter(i => i.qty > 0);
  }, [session]);


  /* ---------------- TOTAL (DB SNAPSHOT) ---------------- */

  const total = useMemo(() => {
    return items.reduce((s: number, i: any) => s + i.total, 0);
  }, [items]);

  /* ---------------- ACTIONS ---------------- */

  async function saveOnly() {
    if (!staffId) return;
    await markBillPrinted(tableId, staffId);

    window.dispatchEvent(new Event('pos:table-updated'));

    onClose();
  }

  async function saveAndPrint() {
    if (!staffId) return;
    await markBillPrinted(tableId, staffId);
    window.pos.printBill?.(tableId); // printer hook unchanged

    window.dispatchEvent(new Event('pos:table-updated'));

    
    onClose();
  }

  /* ---------------- UI (UNCHANGED) ---------------- */

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-[420px] rounded-xl shadow-xl overflow-hidden">

        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <div className="font-bold">Bill Preview – {tableName}</div>
            <div className="text-xs text-slate-500">
              Bill Revision: {session.session?.bill_revision ?? 1}
            </div>
          </div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 text-sm max-h-[60vh] overflow-y-auto">
          {items.map((i: any) => (
            <div key={i.productId} className="flex justify-between py-1">
              <span>
                {i.name} × {i.qty}
              </span>
              <span>₹{i.total}</span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-black text-white flex justify-between">
          <span>Total</span>
          <span className="font-bold">₹{total}</span>
        </div>

        <div className="p-4 flex gap-2">
          <button
            onClick={saveOnly}
            className="flex-1 bg-slate-700 text-white py-2 rounded-lg"
          >
            Save
          </button>

          <button
            onClick={saveAndPrint}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg flex items-center justify-center gap-1"
          >
            <Printer size={16} /> Save & Print
          </button>
        </div>

      </div>
    </div>
  );
}
