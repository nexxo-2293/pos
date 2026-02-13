import { create } from 'zustand';

export const useBillingStore = create<any>((set, get) => ({
  sessions: {},

  /* ----------------------------------
     OPEN / LOAD TABLE (DB SNAPSHOT)
     🔒 KEY IS ALWAYS tableId
  ---------------------------------- */
  async openTable(tableId: string, staffId: string, orderId?: string) {
    console.log('🔵 openTable START', { tableId, orderId });
    if (!window.pos?.order) return;

    let sessionRef = null;

    if (orderId) {
      sessionRef = { id: orderId };
    } else {
      sessionRef = await window.pos.order.getOpenByTable(tableId);
    }

    // ---------------------------
    // BLANK TABLE (no DB session yet)
    // ---------------------------
    if (!sessionRef) {
      set(state => ({
        sessions: {
          ...state.sessions,
          [tableId]: {
            tableId,
            session: null,
            currentCart: [],
            kots: [],
            adjustments: [],
            bills: [],
            payments: [],
            discounts: [],
            settlements: [],
            meta: null
          }
        }
      }));
      return;
    }

    // ---------------------------
    // LOAD FULL SNAPSHOT
    // ---------------------------
    const full = await window.pos.order.loadFullBillingSession(sessionRef.id);

    console.log('🔵 openTable FULL SNAPSHOT', {
      tableId,
      sessionId: full.session?.id,
      cart: full.cart?.length,
      kots: full.kots?.length
    });

    // 🔒 ALWAYS store under tableId
    set(state => ({
      sessions: {
        ...state.sessions,
        [tableId]: {
          tableId,
          session: full.session,

          currentCart: (full.cart || []).map(c => ({
            productId: c.product_id,
            name: c.name,
            qty: c.qty,
            price: c.price,
            total: c.qty * c.price,
            note: c.note || null
          })),

          kots: (full.kots || []).map(k => ({
            id: k.id,
            sequenceNo: k.sequence_no,
            createdAt: k.created_at,
            kitchenNote: k.kitchen_note || null,
            items: (full.kotItems || [])
              .filter(i => i.kot_id === k.id)
              .map(i => ({
                productId: i.product_id,
                name: i.name,
                qty: i.qty,
                price: i.price,
                total: i.qty * i.price,
                note: i.note || null
              }))
          })),

          adjustments: (full.adjustments || []).map(a => ({
            kotId: a.kot_id,
            productId: a.product_id,
            qtyChange: a.qty_change,
            reason: a.reason
          })),

          bills: full.bills || [],
          payments: full.payments || [],
          discounts: full.discounts || [],
          settlements: full.settlements || [],
          meta: full.meta || null
        }
      }
    }));
  },

  /* ----------------------------------
     ADD ITEM
  ---------------------------------- */
  async addItem(key, item, staffId) {
    const s = get().sessions[key];
    if (!s) return;

    const tableId = s.tableId;
    const sessionId = s.session?.id ?? null;

    const res = await window.pos.order.addItem({
      orderId: sessionId,
      tableId,
      item,
      employeeId: staffId
    });

    const effectiveSessionId = sessionId || res?.sessionId;
    if (!effectiveSessionId) return;

    await get().openTable(tableId, staffId, effectiveSessionId);
  },

  async updateQty(key, productId, qty, reason, staffId) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.updateQty({
      orderId: s.session.id,
      productId,
      qty,
      reason,
      employeeId: staffId
    });

    await get().openTable(s.tableId, staffId, s.session.id);
  },

  async updateItemNote(key, productId, note, staffId) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.updateCartItemNote({
      sessionId: s.session.id,
      productId,
      note
    });

    await get().openTable(s.tableId, staffId, s.session.id);
  },

  async saveKOT(key, staffId, kitchenNote) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.addKOT({
      orderId: s.session.id,
      employeeId: staffId,
      kitchenNote
    });

    await get().openTable(s.tableId, staffId, s.session.id);
  },

  async markBillPrinted(key, staffId) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.markBillPrinted(
      s.session.id,
      staffId
    );

    await get().openTable(s.tableId, staffId, s.session.id);
  },

  async adjustKOTItem(key, kotId, productId, qtyChange, reason, staffId) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.adjustKOTItem({
      orderId: s.session.id,
      kotId,
      productId,
      qtyChange,
      reason,
      employeeId: staffId
    });

    await get().openTable(s.tableId, staffId, s.session.id);
  },

  async upsertSessionMeta(key, meta, staffId) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.upsertSessionMeta({
      sessionId: s.session.id,
      ...meta,
      staffId
    });

    await get().openTable(s.tableId, staffId, s.session.id);
  },

  async instantPaid(key, totalAmount, staffId) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.instantPaid({
      sessionId: s.session.id,
      totalAmount,
      staffId
    });

    set(state => {
      const { [key]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
  },

  async finalizeSettlement(
    key,
    billAmount,
    paidAmount,
    paymentMode,
    staffId
  ) {
    const s = get().sessions[key];
    if (!s?.session?.id) return;

    await window.pos.order.finalizeSettlement({
      orderId: s.session.id,
      billAmount,
      paidAmount,
      paymentMode,
      employeeId: staffId
    });

    window.dispatchEvent(new Event('pos:table-updated'));

    set(state => {
      const { [key]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
  },


}));
