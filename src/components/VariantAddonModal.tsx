import { useState, useMemo } from 'react';

interface Props {
  product: any;
  onCancel: () => void;
  onConfirm: (data: {
    variant: any | null;
    addons: any[];
  }) => void;
}

export default function VariantAddonModal({
  product,
  onCancel,
  onConfirm
}: Props) {

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants?.find((v: any) => v.is_default)?.id ?? null
  );

  const [selectedAddons, setSelectedAddons] = useState<Record<string, any[]>>({});

  const hasVariants = product.variants?.length > 0;
  const hasAddons = product.addonGroups?.length > 0;

  const isValid = useMemo(() => {

    // Variant required if exists
    if (hasVariants && !selectedVariantId) return false;

    // Validate addon rules
    if (hasAddons) {
      for (const group of product.addonGroups) {
        const selected = selectedAddons[group.id] || [];
        if (group.required && selected.length === 0) return false;
        if (group.min_allowed && selected.length < group.min_allowed) return false;
        if (group.max_allowed && selected.length > group.max_allowed) return false;
      }
    }

    return true;

  }, [selectedVariantId, selectedAddons]);

  function toggleAddon(groupId: string, item: any, max: number) {
    const current = selectedAddons[groupId] || [];

    const exists = current.find((a: any) => a.id === item.id);

    let updated;

    if (exists) {
      updated = current.filter((a: any) => a.id !== item.id);
    } else {
      if (max && current.length >= max) return;
      updated = [...current, item];
    }

    setSelectedAddons(prev => ({
      ...prev,
      [groupId]: updated
    }));
  }

  const selectedVariant = product.variants?.find(
    (v: any) => v.id === selectedVariantId
  ) ?? null;

  const allSelectedAddons = Object.values(selectedAddons).flat();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white w-[600px] max-h-[80vh] overflow-y-auto rounded-xl p-6">

        <h2 className="text-lg font-bold mb-4">{product.name}</h2>

        {/* VARIANTS */}
        {hasVariants && (
          <div className="mb-6">
            <div className="font-semibold mb-2">Select Variant</div>
            {product.variants.map((v: any) => (
              <label key={v.id} className="flex justify-between border p-2 rounded mb-2 cursor-pointer">
                <span>{v.name}</span>
                <span>₹{v.price}</span>
                <input
                  type="radio"
                  checked={selectedVariantId === v.id}
                  onChange={() => setSelectedVariantId(v.id)}
                />
              </label>
            ))}
          </div>
        )}

        {/* ADDONS */}
        {hasAddons && product.addonGroups.map((group: any) => (
          <div key={group.id} className="mb-6">
            <div className="font-semibold mb-2">
              {group.name}
              {group.required && <span className="text-red-500 ml-2">*</span>}
            </div>

            {group.items.map((item: any) => {
              const selected = selectedAddons[group.id] || [];
              const isChecked = selected.some((a: any) => a.id === item.id);

              return (
                <label key={item.id} className="flex justify-between border p-2 rounded mb-2 cursor-pointer">
                  <span>{item.name}</span>
                  <span>₹{item.price}</span>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() =>
                      toggleAddon(group.id, item, group.max_allowed)
                    }
                  />
                </label>
              );
            })}
          </div>
        ))}

        {/* ACTIONS */}
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border rounded">
            Cancel
          </button>
          <button
            disabled={!isValid}
            onClick={() =>
              onConfirm({
                variant: selectedVariant,
                addons: allSelectedAddons
              })
            }
            className={`px-4 py-2 rounded text-white ${
              isValid ? 'bg-blue-600' : 'bg-slate-400'
            }`}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
