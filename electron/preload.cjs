const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ Preload loaded');

/* ----------------------------------
   INTERNAL HELPERS
---------------------------------- */

async function getPosMode() {
  return ipcRenderer.invoke('db:get-config', 'pos_mode');
}

async function isHost() {
  const mode = await getPosMode();
  return mode === 'HOST';
}

/* ----------------------------------
   EXPOSE SAFE API
---------------------------------- */

contextBridge.exposeInMainWorld('pos', {

  /* =========================
     CONFIG
     ========================= */
  saveConfig: (key, value) =>
    ipcRenderer.invoke('db:save-config', key, value),

  getConfig: (key) =>
    ipcRenderer.invoke('db:get-config', key),

  getPosMode,

  /* =========================
     READ (LOCAL DB)
     ========================= */
  getStaff: () =>
    ipcRenderer.invoke('db:get-staff'),

  getMenu: () =>
    ipcRenderer.invoke('db:get-menu'),

  getFloors: () =>
    ipcRenderer.invoke('db:get-floors'),

  savePrintLayout: (layout) =>
    ipcRenderer.invoke('save-print-layout', layout),

  getPrintLayout: () =>
    ipcRenderer.invoke('get-print-layout'),

  /* =========================
     ORDER / BILLING (IPC ONLY)
     ========================= */
  order: {
    openTable: (tableId, employeeId) =>
      ipcRenderer.invoke('order:open-table', { tableId, employeeId }),

    addItem: (args) =>
      ipcRenderer.invoke('order:add-item', args),

    updateQty: (args) =>
      ipcRenderer.invoke('order:update-qty', args),

    addKOT: (args) =>{
      console.log("🟠 Preload addKOT args:", args);
      ipcRenderer.invoke('order:add-kot', args);
    },

    adjustKOTItem: (args) =>
      ipcRenderer.invoke('order:adjust-kot-item', args),

    markBillPrinted: (orderId, employeeId) =>
      ipcRenderer.invoke('order:mark-bill-printed', {
        orderId,
        employeeId
      }),

    addBillItemNote: (args) =>
      ipcRenderer.invoke('order:add-bill-item-note', args),

    updateCartItemNote: (args) =>
      ipcRenderer.invoke('order:update-cart-item-note', args),

    finalizeSettlement: (args) =>
      ipcRenderer.invoke('order:finalize-settlement', args),

    getOpenByTable: (tableId) =>
      ipcRenderer.invoke('order:get-open', tableId),

    getFullOrder: (orderId) =>
      ipcRenderer.invoke('order:get-full', orderId),

    upsertSessionMeta: (args) =>
    ipcRenderer.invoke('order:upsert-session-meta', args),

    createBill: (args) =>
      ipcRenderer.invoke('order:create-bill', args),

    applyDiscount: (args) =>
      ipcRenderer.invoke('order:apply-discount', args),

    addPayment: (args) =>
      ipcRenderer.invoke('order:add-payment', args),

    settleBill: (args) =>
      ipcRenderer.invoke('order:settle-bill', args),

    instantPaid: (args) =>
      ipcRenderer.invoke('order:instant-paid', args),

    loadFullBillingSession: (sessionId) =>
      ipcRenderer.invoke('order:load-full-billing-session', sessionId),

    splitEqual: (args) =>
      ipcRenderer.invoke('order:split-equal', args),

    getOpenSessionsByTable: (tableId) =>
      ipcRenderer.invoke('order:get-open-sessions-by-table', tableId),

    getSplitChildren: (sessionId) =>
      ipcRenderer.invoke('order:get-split-children', sessionId),

    loadSplitViewSession: (sessionId) =>
      ipcRenderer.invoke('order:load-split-view-session', sessionId),




  },

  /* =========================
     CLOUD → POS (HOST ONLY)
     ========================= */
  syncFromCloud: async (type, payload) => {
    if (!(await isHost())) {
      throw new Error('Only HOST can apply cloud sync');
    }

    switch (type) {
      case 'STAFF':
        return ipcRenderer.invoke('db:sync-staff', payload);

      case 'MENU_V2': {
        // 🔒 Strict pack-only validation
        if (!payload || !Array.isArray(payload.packs)) {
          console.error('❌ Invalid MENU_V2 payload structure:', payload);
          throw new Error('MENU_V2 must contain packs array');
        }

        // 🚫 Block legacy standalone categories if backend sends accidentally
        if (payload.standaloneCategories) {
          console.warn('⚠ standaloneCategories detected — ignoring (pack-only mode)');
          delete payload.standaloneCategories;
        }

        return ipcRenderer.invoke('db:sync-menu-v2', payload);
      }

      case 'FLOORS':
        return ipcRenderer.invoke('db:sync-floors', payload);

      case 'HOTEL_TAX_CONFIG':
        return ipcRenderer.invoke('db:sync-hotel-tax-config', payload);

      default:
        console.error('❌ Unknown sync type:', type);
        throw new Error('Unknown sync type');
    }
  },


  /* =========================
     POS → CLOUD (BOTH)
     ========================= */
  logChange: (entity, entityId, action, payload) =>
    ipcRenderer.invoke(
      'sync:log-change',
      entity,
      entityId,
      action,
      payload
    ),

  enqueueOutbox: (type, payload) =>
    ipcRenderer.invoke(
      'sync:enqueue-outbox',
      type,
      payload
    ),

  /* =========================
     HOST SERVER
     ========================= */
  startServerMode: async () => {
    if (!(await isHost())) {
      throw new Error('CLIENT cannot start server');
    }
    return ipcRenderer.invoke('app:start-server-mode');
  },

  /* =========================
     LAN
     ========================= */
  discoverHost: () =>
    ipcRenderer.invoke('lan:discover-host')
});
