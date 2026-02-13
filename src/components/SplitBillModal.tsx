import { useState, useMemo } from 'react';

export default function SplitBillModal({
  totalAmount,
  onCancel,
  onConfirm
}: {
  totalAmount: number;
  onCancel: () => void;
  onConfirm: (count: number) => void;
}) {
  const [count, setCount] = useState(2);

  const perPerson = useMemo(() => {
    if (count <= 0) return 0;
    return Math.round((totalAmount / count) * 100) / 100;
  }, [count, totalAmount]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white w-96 rounded-2xl shadow-xl p-5 space-y-4">

        <h2 className="text-lg font-bold">Split Bill</h2>

        <div className="text-sm text-slate-600">
          Total Amount: <b>₹{totalAmount}</b>
        </div>

        <div>
          <label className="text-sm font-medium">
            Number of people
          </label>
          <input
            type="number"
            min={2}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          />
        </div>

        <div className="bg-slate-100 rounded-lg p-3 text-sm">
          Each pays: <b>₹{perPerson}</b>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 border rounded-lg py-2"
          >
            Cancel
          </button>

          <button
            onClick={() => onConfirm(count)}
            className="flex-1 bg-purple-600 text-white rounded-lg py-2"
          >
            Confirm Split
          </button>
        </div>

      </div>
    </div>
  );
}
