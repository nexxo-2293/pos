/* ---------------- IMPORTS ---------------- */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import AppLayout from '../layout/AppLayout';
import { useBillingStore } from '../store/billingStore';
import ReasonModal from '../components/ReasonModal';
import SplitBillModal from '../components/SplitBillModal';
import VariantAddonModal from '../components/VariantAddonModal';
import {
  Search,
  Minus,
  Plus,
  Table,
  Users,
  Building2,
  StickyNote,
  Truck,
  CheckCircle
} from 'lucide-react';

/* ---------------- TYPES ---------------- */

interface Product {
  id: string;
  name: string;
  base_price: number;
  food_type: 'VEG' | 'NON_VEG' | 'EGG' | 'LIQUOR';
  short_code?: string;
  item_code?: string;

  variants?: {
    id: string;
    name: string;
    price: number;
    is_default: number;
    is_active: number;
  }[];

  addonGroups?: {
    id: string;
    name: string;
    min_allowed: number;
    max_allowed: number;
    required: number;
    items: {
      id: string;
      name: string;
      price: number;
      is_available?: number;
    }[];
  }[];
}


interface Category {
  id: string;
  name: string;
  items: Product[];
}


/* ---------------- PAGE ---------------- */

export default function BillingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tableId } = useParams<{ tableId: string }>();
  const orderIdFromState = location.state?.orderId ?? null;
  const TAKEAWAY_KEY = 'TAKEAWAY_QUICK';
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [floors, setFloors] = useState<any[]>([]);
  const isFromNavbar = location.state?.fromNavbar === true;
  const [itemNoteModal, setItemNoteModal] = useState<{
    productId: string;
    existingNote?: string;
  } | null>(null);
  const [kitchenNote, setKitchenNote] = useState<string>('');
  const [showKitchenNoteModal, setShowKitchenNoteModal] = useState(false);


  

  const [orderType, setOrderType] =
    useState<'DINE_IN' | 'DELIVERY' | 'TAKEAWAY'>('DINE_IN');
  const [lastDineInTable, setLastDineInTable] = useState<string | null>(null);

  useEffect(() => {
    if (location.pathname.includes('takeaway')) {
      setOrderType('TAKEAWAY');
    } else {
      setOrderType('DINE_IN');
    }
  }, [location.pathname]);


  const {
    sessions,
    openTable,
    addItem,
    updateQty,
    saveKOT,
    markBillPrinted,
    adjustKOTItem,
    finalizeSettlement,
    updateItemNote
  } = useBillingStore();


  const sessionKey = orderIdFromState ?? tableId;

  const session = useMemo(() => {
    if (orderType === 'TAKEAWAY') {
      return sessions[TAKEAWAY_KEY];
    }

    if (orderIdFromState && sessions[orderIdFromState]) {
      return sessions[orderIdFromState];
    }

    if (tableId && sessions[tableId]) {
      return sessions[tableId];
    }

    return Object.values(sessions).find(
      (s: any) => s?.tableId === tableId
    );

  }, [sessions, tableId, orderIdFromState, orderType]);




  

  const tableName =
  orderType === 'TAKEAWAY'
    ? 'Takeaway'
    : location.state?.tableName ?? tableId;

  const areaName = location.state?.areaName ?? '';


  
  const [itsPaid, setItsPaid] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);

  



  /* ---------------- STAFF ---------------- */

  const staffId = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('pos_user') || '{}').id;
    } catch {
      return null;
    }
  }, []);

  /* ---------------- TABLE STATUS (DB) ---------------- */

  const tableStatus = useMemo(() => {
    if (!session) return 'BLANK';
    return session.session?.status ?? 'BLANK';
  }, [session]);


  const isSplitParent =
  session?.session?.parent_session_id === null &&
  session?.session?.split_index === 0;

  const isSplitChild =
  !!session?.session?.parent_session_id &&
  session?.session?.split_index !== null;

  const [splitView, setSplitView] = useState<any>(null);

  useEffect(() => {
    if (!isSplitChild || !session?.session?.id) return;

    window.pos.order
      .loadSplitViewSession(session.session.id)
      .then(setSplitView)
      .catch(err => {
        console.error('❌ split view load failed', err);
      });
  }, [isSplitChild, session]);




  /* ---------------- MENU ---------------- */

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState('ALL');
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);

  const [search, setSearch] = useState('');

  useEffect(() => {
    loadMenu();
  }, []);

  async function loadMenu() {
    const menu = await window.pos.getMenu();
    console.log("🔥 MENU RAW FROM DB:", menu);

    if (!menu?.packs) {
      setCategories([]);
      return;
    }

    const allCategories: Category[] = [];

    // Only pack categories
    menu.packs.forEach((pack: any) => {
      pack.categories?.forEach((cat: any) => {
        if (cat.items?.length > 0) {
          allCategories.push({
            id: `${pack.id}_${cat.id}`,
            name: `${pack.name} • ${cat.name}`,
            items: cat.items
          });
        }
      });
    });

    // Build ALL category (unique items only)
    const uniqueMap = new Map<string, any>();

    allCategories.forEach(cat => {
      cat.items.forEach(item => {
        if (!uniqueMap.has(item.id)) {
          uniqueMap.set(item.id, item);
        }
      });
    });

    const allItems = Array.from(uniqueMap.values());

    setCategories([
      { id: 'ALL', name: 'All', items: allItems },
      ...allCategories
    ]);
  }

/* ---------------- OPEN TABLE (CONTROLLED) ---------------- */

useEffect(() => {
  if (!staffId) return;

  // ---------------- TAKEAWAY ----------------
  if (orderType === 'TAKEAWAY') {
    if (tableId) {
      setLastDineInTable(tableId); // remember current dine-in
    }

    if (!sessions[TAKEAWAY_KEY]) {
      openTable(TAKEAWAY_KEY, staffId);
    }

    return;
  }

  // ---------------- DINE-IN ----------------
  if (orderType === 'DINE_IN') {
    const targetTable = lastDineInTable ?? tableId;

    if (!targetTable) {
      setShowTableSelector(true);
      return;
    }

    if (!sessions[targetTable]) {
      openTable(targetTable, staffId);
    }
  }

}, [orderType, staffId, tableId]);




  /* ---------------- DERIVED ---------------- */

  const activeCategory = useMemo(
    () => categories.find(c => c.id === activeCategoryId),
    [categories, activeCategoryId]
  );

  const filteredProducts = useMemo(() => {
    if (!activeCategory) return [];

    if (!search) return activeCategory.items;

    const term = search.toLowerCase();

    return activeCategory.items.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.short_code?.toLowerCase() === term ||
      p.item_code?.toLowerCase() === term
    );
  }, [activeCategory, search]);



  const safeSession = useMemo(() => {
    if (!session) {
      return {
        kots: [],
        currentCart: [],
        adjustments: []
      };
    }

    // ✅ NORMAL SESSION (store shape)
    if (Array.isArray(session.kots)) {
      return {
        kots: session.kots || [],
        currentCart: session.currentCart || [],
        adjustments: session.adjustments || []
      };
    }

    // ✅ SPLIT VIEW SESSION (repo shape)
    return {
      kots: session.kots || [],              // parent KOTs
      currentCart: [],                       // split tables never edit
      adjustments: session.adjustments || []
    };
  }, [session]);
  
  /* ---------------- BILL TOTAL (DB SNAPSHOT) ---------------- */

  const totalAmount = useMemo(() => {
    if (!session) return 0;

    let total = 0;

    safeSession.kots.forEach((kot: any) => {
      kot.items.forEach((i: any) => {
        total += i.qty * i.price;
      });
    });

    safeSession.adjustments.forEach((a: any) => {
      const kot = safeSession.kots.find((k: any) => k.id === a.kotId);
      const item = kot?.items.find(
        (i: any) => i.productId === a.productId
      );
      if (item) {
        total += a.qtyChange * item.price;
      }
    });

    // include current cart (live items)
    safeSession.currentCart.forEach((i: any) => {
      total += i.qty * i.price;
    });

    return total;
  }, [safeSession]);


  const settlementAmount = useMemo(() => {
    if (isSplitChild) {
      return session?.bills?.[0]?.total_amount ?? 0;
    }
    return totalAmount;
  }, [isSplitChild, session, totalAmount]);





  /* ---------------- PAYMENT ---------------- */

  const [paymentMode, setPaymentMode] =
    useState<'CASH' | 'CARD' | 'DUE' | 'OTHER' | 'PART'>('CASH');

  const [paidAmount, setPaidAmount] = useState<number>(0);

  useEffect(() => {
    if (tableStatus === 'PRINTED') {
      setPaidAmount(settlementAmount);
    }
  }, [tableStatus, settlementAmount]);


  const waivedOff =
    tableStatus === 'PRINTED' && paidAmount < settlementAmount
      ? settlementAmount - paidAmount
      : 0;


  /* ---------------- REASON MODAL ---------------- */

  const [reasonModal, setReasonModal] = useState<{
    kotId: string;
    productId: string;
  } | null>(null);

  

  const hasAnyItems =
    safeSession.currentCart.length > 0 ||
    safeSession.kots.some((k: any) =>
      k.items.some((i: any) => {
        const adj =
          safeSession.adjustments
            .filter(a => a.kotId === k.id && a.productId === i.productId)
            .reduce((s, a) => s + a.qtyChange, 0);
        return i.qty + adj > 0;
      })
    );

  const hasPrintedBill = tableStatus === 'PRINTED';
  const hasNewCartItems = safeSession.currentCart.length > 0;

  // FINAL UI MODE FLAGS
  const showSettlementOnly = hasPrintedBill && !hasNewCartItems && !isSplitParent;

  const showActionBar = tableStatus !== 'PAID' && !showSettlementOnly;

  /* ---------------- ACTION HANDLER ---------------- */

    async function persistAndExit(
      

      action:
        | 'SAVE'
        | 'SAVE_PRINT'
        | 'SAVE_EBILL'
        | 'KOT'
        | 'KOT_PRINT'
    ) {
      // 🔒 HARD GUARDS
      if (!session || !session.session?.id || !staffId) return;

      const sessionId = session.session.id;
      
      const isTakeaway = orderType === 'TAKEAWAY';

      // empty table guard
      if (!hasAnyItems) {
        if (!isTakeaway) {
          navigate('/dashboard', { replace: true });
        }
        return;
      }


      // ---- KOT handling ----
      console.log("🟢 BillingPage kitchenNote:", kitchenNote);

      if (!isTakeaway && (action === 'KOT' || action === 'KOT_PRINT')) {
        await saveKOT(
          orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId,
          staffId,
          kitchenNote
          
        );
        console.log("🟡 Store saveKOT kitchenNote:", kitchenNote);

      }


      // ---- BILL PRINT ----
      if (
        action === 'SAVE' ||
        action === 'SAVE_PRINT' ||
        action === 'SAVE_EBILL'
      ) {
        await markBillPrinted(
          orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId,
          staffId
        );
      }

      // ---- FAST PAID FLOW ----
      if (
        itsPaid &&
        (action === 'SAVE' ||
          action === 'SAVE_PRINT' ||
          action === 'SAVE_EBILL')
      ) {
        await useBillingStore
          .getState()
          .instantPaid(
            orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : (lastDineInTable ?? tableId),
            settlementAmount, 
            staffId);

        // 🔔 ensure dashboard reloads DB state
        window.dispatchEvent(new Event('pos:table-updated'));

        if (!isTakeaway) {
          navigate('/dashboard', { replace: true });
        }

        return;
      }

      // ---- AUDIT ----
      await window.pos.logChange('ORDER', sessionId, action, {
        session,
        timestamp: Date.now()
      });

      if (!isTakeaway) {
        navigate('/dashboard', { replace: true });
      }

    }



  /* ---------------- UI ---------------- */

  return (
    <AppLayout>
      {!session && Object.keys(sessions).length === 0 ? (
        <div className="flex h-full items-center justify-center text-slate-400">
          Loading…
        </div>
      ) : (
        <div className="flex h-full bg-slate-100">

          {/* ================= LEFT: CATEGORIES ================= */}
          <div className="w-56 bg-black text-white overflow-y-auto">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`w-full text-left px-5 py-4 border-b border-slate-800 transition ${
                  activeCategoryId === cat.id
                    ? 'bg-blue-600 font-bold'
                    : 'hover:bg-slate-900'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* ================= CENTER: ITEMS ================= */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="flex items-center gap-3 bg-white p-3 rounded-xl shadow mb-4">
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search item / code"
                className="flex-1 outline-none"
              />
            </div>

            <div className="grid grid-cols-4 gap-4">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    if (isSplitChild) return;

                    const activeKey = orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId;

                    const hasVariants = p.variants && p.variants.length > 0;
                    const hasAddons = p.addonGroups && p.addonGroups.length > 0;

                    // 🔥 If product has variants or addons → open modal
                    if (hasVariants || hasAddons) {
                      setVariantProduct(p);
                      return;
                    }

                    // 🔥 Normal product
                    addItem(
                      activeKey,
                      {
                        productId: p.id,
                        name: p.name,
                        price: p.base_price,
                        qty: 1,
                        tax: 0,
                        total: p.base_price
                      },
                      staffId
                    );
                  }}

                  className="relative bg-white rounded-xl border hover:border-blue-500 hover:shadow-lg transition p-4 text-left"
                >
                  <span
                    className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${
                      p.food_type === 'VEG'
                        ? 'bg-green-500'
                        : p.food_type === 'EGG'
                        ? 'bg-yellow-500'
                        : p.food_type === 'LIQUOR'
                        ? 'bg-purple-500'
                        : 'bg-red-500'
                    }`}
                  />
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-slate-500">₹{p.base_price}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ================= RIGHT: BILLING PANEL ================= */}
          <div className="w-[460px] bg-white border-l flex flex-col">

            {/* HEADER + ORDER TYPE */}
            <div className="p-4 border-b">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold text-lg">{tableName}</div>
                  <div className="text-xs text-slate-400">{areaName}</div>
                </div>
                {!isFromNavbar && (
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                  {['DINE_IN', 'DELIVERY', 'TAKEAWAY'].map(k => (
                    <button
                      key={k}
                      onClick={() => setOrderType(k as any)}
                      className={`px-3 py-1 text-xs rounded-md ${
                        orderType === k
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      {k.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                )}
              </div>
            </div>

            {/* QUICK STRIP */}
            <div className="flex justify-between px-4 py-2 border-b text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <button
                  onClick={() => setShowTableSelector(true)}
                  className="flex items-center gap-1"
                >
                  <Table size={14} /> Table
                </button>
              </span>
              <span className="flex items-center gap-1"><Users size={14} /> CRM</span>
              <span className="flex items-center gap-1"><Building2 size={14} /> Corp</span>
              <span className="flex items-center gap-1">
              <button
                onClick={() => setShowKitchenNoteModal(true)}
                className="flex items-center gap-1"
              >
                <StickyNote size={14} /> Notes
              </button>
              </span>
              <span className="flex items-center gap-1"><Truck size={14} /> Delivery</span>
            </div>

            {/* ITEMS */}
            <div className="flex-1 overflow-y-auto text-sm">

              {/* EXISTING KOTs */}
              {!isSplitChild && safeSession.kots.map((kot: any) => (
                <div key={kot.id}>
                  <div className="bg-slate-100 px-4 py-2 text-xs font-bold flex justify-between">
                    <span>KOT {kot.sequenceNo}</span>
                    <span>
                      {kot.createdAt
                        ? new Date(kot.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '--'}
                    </span>
                  </div>
                  {kot.kitchenNote && (
                    <div className="px-4 pb-2 text-xs italic text-blue-600">
                      📝 {kot.kitchenNote}
                    </div>
                  )}
                  {kot.items.map((i: any) => {
                    const adjustedQty =
                      i.qty +
                      safeSession.adjustments
                        .filter(
                          (a: any) =>
                            a.kotId === kot.id &&
                            a.productId === i.productId
                        )
                        .reduce((s: number, a: any) => s + a.qtyChange, 0);
                    const displayPrice =
                      isSplitChild && splitView
                        ? i.price / splitView.splitCount
                        : i.price;

                    if  (adjustedQty <= 0) return null;

                    return (
                      <div key={`${kot.id}-${i.productId}`} className="flex px-4 py-2 border-b items-center">
                        <div className="flex-1">{i.name}</div>

                        <button
                          onClick={() =>
                            setReasonModal({
                              kotId: kot.id,
                              productId: i.productId
                            })
                          }
                          className="text-red-500"
                        >
                          <Minus size={14} />
                        </button>

                        <span className="w-6 text-center">{adjustedQty}</span>

                        <div className="w-20 text-right">
                          
                          ₹{displayPrice * adjustedQty}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* NEW KOT (EDITABLE) */}
              {!isSplitChild && tableStatus !== 'PAID' && safeSession.currentCart.length > 0 && (
                <div key="new-kot">
                  <div className="bg-slate-200 px-4 py-2 text-xs font-bold">
                    NEW KOT
                  </div>
                  {safeSession.currentCart.map((item: any) => (
                    <div
                      key={item.productId}
                      className="flex px-4 py-2 border-b items-center"
                    >
                      <div
                        className="flex-1 cursor-pointer hover:text-blue-600"
                        onClick={() =>
                          setItemNoteModal({
                            productId: item.productId,
                            existingNote: item.note
                          })
                        }
                      >
                        {item.name}
                        {item.note && (
                          <div className="text-xs text-slate-500 italic">
                            📝 {item.note}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() =>
                            updateQty(
                              orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId,
                              item.productId,
                              item.qty - 1,
                              undefined,
                              staffId
                            )
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.qty}</span>
                        <button
                          onClick={() =>
                            updateQty(
                              orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId,
                              item.productId,
                              item.qty + 1,
                              undefined,
                              staffId
                            )
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <div className="w-20 text-right font-semibold">
                        ₹{item.total}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* TOTAL */}
            <div className="px-4 py-3 bg-black text-white flex justify-between">
              <span className="font-bold">Total</span>
              <span className="text-xl font-bold">₹{settlementAmount}</span>
            </div>

            {/* ACTION BAR */}
            <div className="p-4 bg-slate-900 text-white space-y-3 text-sm">
                {/* ---------------- IT'S PAID QUICK FLOW ---------------- */}
                {tableStatus !== 'PAID' && hasAnyItems && (
                  <label className="flex items-center gap-3 bg-green-900/40 border border-green-600 rounded-xl px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={itsPaid}
                      onChange={(e) => setItsPaid(e.target.checked)}
                      className="accent-green-500"
                    />
                    <span className="font-semibold text-green-300">
                      It’s Paid (Save + Print + Close)
                    </span>
                  </label>
                )}
              {/* ---------------- NORMAL ACTIONS (KOT / SAVE) ---------------- */}
              {showActionBar && (
                <>
                  {/* PAYMENT MODES */}
                  <div className="flex gap-4 text-xs">
                    {['CASH', 'CARD', 'DUE', 'OTHER', 'PART'].map(m => (
                      <label key={m} className="flex items-center gap-1">
                        <input
                          type="radio"
                          checked={paymentMode === m}
                          onChange={() => setPaymentMode(m as any)}
                        />
                        {m}
                      </label>
                    ))}
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => persistAndExit('SAVE')}
                      className="bg-blue-600 py-2 rounded-xl"
                    >
                      Save
                    </button>

                    <button
                      onClick={() => persistAndExit('SAVE_PRINT')}
                      className="bg-blue-600 py-2 rounded-xl"
                    >
                      Save & Print
                    </button>

                    <button
                      onClick={() => persistAndExit('SAVE_EBILL')}
                      className="bg-blue-600 py-2 rounded-xl"
                    >
                      eBill
                    </button>

                    {orderType !== 'TAKEAWAY' && (
                      <>
                      <button
                        onClick={() => persistAndExit('KOT')}
                        className="bg-slate-700 py-2 rounded-xl"
                      >
                        KOT
                      </button>

                      <button
                        onClick={() => persistAndExit('KOT_PRINT')}
                        className="bg-blue-700 py-2 rounded-xl col-span-2"
                      >
                        KOT & Print
                      </button>
                      </>
                    )}
                  </div>
                </>
              )}
              {tableStatus === 'PRINTED' && (
                <button
                  onClick={() => setShowSplitModal(true)}
                  className="w-full bg-purple-600 py-2 rounded-xl text-sm font-semibold"
                >
                  Split Bill
                </button>
              )}
              {showSplitModal && (
                <SplitBillModal
                  totalAmount={totalAmount}
                  onCancel={() => setShowSplitModal(false)}
                  onConfirm={async (count) => {
                    if (!sessionKey || !staffId) return;
                    if (!session?.session?.id) return;

                    // ✅ REAL backend split
                    await window.pos.order.splitEqual({
                      sessionId: session.session.id,
                      splitCount: count,
                      staffId
                    });

                    setShowSplitModal(false);

                    // exit billing – dashboard will now show split tables
                    navigate('/dashboard', {
                      replace: true,
                      state: { refresh: true }
                    });
                  }}
                />
              )}
              {/* ---------------- SETTLEMENT ONLY ---------------- */}
              {showSettlementOnly && (
                <>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={e =>
                      setPaidAmount(Number(e.target.value) || totalAmount)
                    }
                    className="w-full px-3 py-2 rounded-lg text-black"
                  />

                  <div className="flex justify-between text-xs">
                    <span>Waived Off</span>
                    <span>₹{waivedOff}</span>
                  </div>

                  <button
                    onClick={async () => {
                      console.log('💰 UI settle click', {
                        sessionId: session?.session?.id,
                        settlementAmount,
                        paidAmount,
                        paymentMode
                      });
                      if (!sessionKey || !staffId) return;
                      if (isSplitParent) return; // 🔒 prevent backend error

                      await finalizeSettlement(
                        orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId,
                        settlementAmount,
                        paidAmount,
                        paymentMode,
                        staffId
                      );

                      // 🔔 force dashboard to reload DB state
                      window.dispatchEvent(new Event('pos:table-updated'));

                      if (orderType !== 'TAKEAWAY') {
                        navigate('/dashboard', { replace: true });
                      }
                    }}
                    className="w-full bg-green-600 py-3 rounded-xl flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} /> Settle & Save
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {reasonModal && sessionKey && (
        <ReasonModal
          onCancel={() => setReasonModal(null)}
          onConfirm={(reason) => {
            adjustKOTItem(
              orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId,
              reasonModal.kotId,
              reasonModal.productId,
              -1,
              reason,
              staffId
            );
            setReasonModal(null);
          }}
        />
      )}
      {variantProduct && (
        <VariantAddonModal
          product={variantProduct}
          onCancel={() => setVariantProduct(null)}
          onConfirm={({ variant, addons }) => {

            const activeKey = orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId;


            let finalPrice = variant
              ? variant.price
              : variantProduct.base_price;

            addons.forEach(a => {
              finalPrice += a.price;
            });

            addItem(
              activeKey,
              {
                productId: variant?.id ?? variantProduct.id,
                name: variant
                  ? `${variantProduct.name} (${variant.name})`
                  : variantProduct.name,
                price: finalPrice,
                basePrice: variant?.price ?? variantProduct.base_price,
                addons: addons.map(a => ({
                  id: a.id,
                  name: a.name,
                  price: a.price
                })),
                qty: 1,
                tax: 0,
                total: finalPrice
              },
              staffId
            );
            setVariantProduct(null);
          }}
        />
      )}
      {showTableSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-[700px] max-h-[80vh] overflow-y-auto rounded-xl p-6">

            <h2 className="text-lg font-bold mb-4">Select Table</h2>

            {floors.map((area: any) => (
              <div key={area.id} className="mb-4">
                <div className="font-semibold mb-2">{area.name}</div>

                <div className="grid grid-cols-4 gap-3">
                  {area.tables.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        if (!staffId) return;

                        openTable(t.id, staffId);

                        setShowTableSelector(false);
                      }}
                      className="border rounded-xl p-3 hover:bg-blue-50"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowTableSelector(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}
      {itemNoteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[400px] p-6 space-y-4">
            <h3 className="font-semibold">Item Note</h3>

            <textarea
              defaultValue={itemNoteModal.existingNote || ''}
              onChange={(e) =>
                setItemNoteModal((prev) =>
                  prev ? { ...prev, existingNote: e.target.value } : null
                )
              }
              className="w-full border rounded-lg p-2 text-sm"
              rows={3}
              placeholder="Enter note (optional)"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setItemNoteModal(null)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  if (!itemNoteModal || !staffId) return;

                  useBillingStore.getState().updateItemNote(
                    orderType === 'TAKEAWAY' ? TAKEAWAY_KEY : tableId,
                    itemNoteModal.productId,
                    itemNoteModal.existingNote || '',
                    staffId
                  );

                  setItemNoteModal(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {showKitchenNoteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[400px] p-6 space-y-4">
            <h3 className="font-semibold">Kitchen Note</h3>

            <textarea
              value={kitchenNote}
              onChange={(e) => setKitchenNote(e.target.value)}
              className="w-full border rounded-lg p-2 text-sm"
              rows={3}
              placeholder="Enter kitchen instructions"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowKitchenNoteModal(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={() => setShowKitchenNoteModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
 