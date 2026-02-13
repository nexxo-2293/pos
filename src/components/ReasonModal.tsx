import { useState } from 'react';

export default function ReasonModal({
  onConfirm,
  onCancel
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white w-[360px] rounded-xl p-4 shadow-xl">
        <h3 className="font-bold mb-2">Reason required</h3>

        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why are you removing this item?"
          className="w-full border rounded-lg p-2 text-sm"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-200 py-2 rounded-lg"
          >
            Cancel
          </button>

          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason)}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
