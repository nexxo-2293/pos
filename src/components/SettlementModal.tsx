import { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import { useBillingStore } from '../store/billingStore';

export default function SettlementModal({
  tableId,
  onClose
}: {
  tableId: string;
  onClose: () => void;
}) {
  const { sessions, finalizeSettlement } = useBillingStore();

  // ⚠️ NEVER early-return based on session
  const session = sessions[tableId];

  /* ---------------- STAFF ---------------- */
  const staffId = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('pos_user') || '{}').id;
    } catch {
      return null;
    }
  }, []);

  /* ---------------- BILL AMOUNT ---------------- */
  const billAmount = useMemo(() => {
    if (!session) return 0;

    let total = 0;

    session.kots.forEach((kot: any) => {
      kot.items.forEach((i: any) => {
        total += i.qty * i.price;
      });
    });

    session.adjustments.forEach((a: any) => {
      const kot = session.kots.find((k: any) => k.id === a.kot_id);
      const item = kot?.items.find(
        (i: any) => i.product_id === a.product_id
      );
      if (item) {
        total += a.qty_change * item.price;
      }
    });

    return total;
  }, [session]);

  /* ---------------- STATE ---------------- */
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMode, setPaymentMode] =
    useState<'CASH' | 'CARD' | 'PART' | 'OTHER'>('CASH');

  useEffect(() => {
    setPaidAmount(billAmount);
  }, [billAmount]);

  const waivedOff =
    paidAmount < billAmount ? billAmount - paidAmount : 0;

  /* ---------------- ACTION ---------------- */
  async function handleSettle() {
    if (!staffId || !session) return;

    await finalizeSettlement(
      tableId,
      billAmount,
      paidAmount,
      paymentMode,
      staffId
    );

    window.dispatchEvent(new Event('pos:table-updated'));

    onClose(); // parent hides modal
  }

  /* ---------------- HARD GUARD (UI ONLY) ---------------- */
  if (!session) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg text-sm">
          Finalizing bill…
        </div>
      </div>
    );
  }

  /* ---------------- UI ---------------- */
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-[400px] rounded-xl shadow-xl overflow-hidden">

        <div className="flex justify-between items-center p-4 border-b">
          <div className="font-bold">Settle Bill</div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span>Bill Amount</span>
            <span className="font-bold">₹{billAmount}</span>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Amount Paid
            </label>
            <input
              type="number"
              value={paidAmount}
              onChange={e => setPaidAmount(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          <div className="flex justify-between text-slate-600">
            <span>Waived Off</span>
            <span>₹{waivedOff}</span>
          </div>

          <div className="flex gap-3">
            {['CASH', 'CARD', 'PART', 'OTHER'].map(m => (
              <label key={m} className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  checked={paymentMode === m}
                  onChange={() => setPaymentMode(m as any)}
                />
                {m}
              </label>
            ))}
          </div>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={handleSettle}
            className="w-full bg-green-600 text-white py-2 rounded-lg flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} /> Settle & Save
          </button>
        </div>

      </div>
    </div>
  );
}
