const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const dgram = require('dgram');

const dbManager = require('./database.cjs');
const billingRepo = require('./billing.repo.cjs');


const { startLocalServer } = require('./localServer.cjs');




// ----------------------------------
// CONSTANTS
// ----------------------------------
const LAN_PORT = process.env.POS_LAN_PORT || 4321;

// ----------------------------------
// INIT DB
// ----------------------------------
dbManager.initSchema();

let mainWindow = null;

// ----------------------------------
// CREATE WINDOW
// ----------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const startUrl = process.env.ELECTRON_START_URL
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}



// ----------------------------------
// IPC – CONFIG
// ----------------------------------
ipcMain.handle('db:save-config', (_, key, val) =>
  dbManager.saveConfig(key, val)
);

ipcMain.handle('db:get-config', (_, key) =>
  dbManager.getConfig(key)
);

// ----------------------------------
// IPC – CLOUD → POS SYNC
// ----------------------------------
ipcMain.handle('db:sync-staff', (_, payload) =>
  dbManager.bulkInsertStaff(payload)
);

ipcMain.handle('db:sync-menu-v2', (_, payload) =>
  dbManager.bulkInsertMenuV2(payload)
);

ipcMain.handle('db:sync-hotel-tax-config', (_, payload) =>
  dbManager.saveHotelTaxConfig(payload)
);


ipcMain.handle('db:sync-floors', (_, payload) =>
  dbManager.bulkInsertFloors(payload)
);

// ----------------------------------
// IPC – READ LOCAL POS DATA
// ----------------------------------
ipcMain.handle('db:get-staff', () =>
  dbManager.getStaff()
);

ipcMain.handle('db:get-menu', () =>
  dbManager.getMenuV2()
);


ipcMain.handle('db:get-floors', () =>
  dbManager.getFloors()
);

// ----------------------------------
// IPC – SYNC ENGINE
// ----------------------------------
ipcMain.handle('sync:log-change', (_, entity, entityId, action, payload) =>
  dbManager.logChange(entity, entityId, action, payload)
);

ipcMain.handle('sync:enqueue-outbox', (_, type, payload) =>
  dbManager.enqueueOutbox(type, payload)
);

// ----------------------------------
// IPC – HOST MODE SERVER
// ----------------------------------
ipcMain.handle('app:start-server-mode', async () => {
  const { ip, port } = startLocalServer();
  return { status: 'started', ip, port };
});

// ----------------------------------
// IPC – PRINT LAYOUT
// ----------------------------------
ipcMain.handle('save-print-layout', (_event, layout) => {
  console.log('🧾 Saving print layout:', layout);
  dbManager.savePrintLayout(layout);
  return true;
});


ipcMain.handle('get-print-layout', () => {
  return dbManager.getPrintLayout();
});

ipcMain.handle('sync-from-cloud', (_event, type, payload) => {

  switch (type) {

    case 'STAFF':
      return dbManager.bulkInsertStaff(payload);

    case 'MENU_V2':
      if (!payload || !Array.isArray(payload.packs)) {
        console.error('❌ Invalid MENU_V2 payload structure');
        throw new Error('Invalid MENU_V2 payload');
      }
      return dbManager.bulkInsertMenuV2(payload);

    case 'FLOORS':
      return dbManager.bulkInsertFloors(payload);

    case 'HOTEL_TAX_CONFIG':
      return dbManager.saveHotelTaxConfig(payload);

    default:
      console.error('❌ Unknown sync type:', type);
      throw new Error('Unknown sync type');
  }
});


// ----------------------------------
// IPC – ORDER / BILLING ENGINE (NEW)
// ----------------------------------
// ----------------------------------
// IPC – ORDER / BILLING ENGINE (NEW ONLY)
// ----------------------------------

ipcMain.handle('order:open-table', (_, { tableId }) => {
  if (typeof tableId === 'object' && tableId !== null) {
    tableId = tableId.tableId || tableId.id;
  }
  if (!tableId) return null;

  // 🔒 DO NOT auto-create sessions here
  return billingRepo.getOpenSession(tableId);
});


ipcMain.handle('order:get-full', (_, orderId) => {
  if (typeof orderId === 'object' && orderId !== null) {
    orderId = orderId.orderId || orderId.id;
  }
  if (!orderId) return null;

  return billingRepo.loadSession(orderId);
});
// ----------------------------------
// IPC – ORDER ITEM OPERATIONS
// ----------------------------------

ipcMain.handle('order:add-item', (_, { orderId, tableId, item, employeeId }) => {
  let sessionId = orderId;

  // 🔥 CREATE SESSION ON FIRST ITEM
  if (!sessionId) {
    sessionId = billingRepo.createBillingSession({
      tableId,
      orderType: 'DINE_IN',
      staffId: employeeId
    });
  }

  billingRepo.addToCart({
    sessionId,
    item,
    staffId: employeeId
  });

  return { sessionId };
});


ipcMain.handle('order:get-open', (_, tableId) => {
  if (typeof tableId === 'object' && tableId !== null) {
    tableId = tableId.tableId || tableId.id;
  }
  if (!tableId) return null;

  const session = billingRepo.getOpenSession(tableId);

  // 🔒 Dashboard rule:
  // If no active session OR session is PAID → table is BLANK
  if (!session || session.status === 'PAID') {
    return null;
  }

  return session;
});



ipcMain.handle('order:update-qty', (_, args) => {
  billingRepo.updateCartQty({
    sessionId: args.orderId,
    productId: args.productId,
    qty: args.qty,
    reason: args.reason,
    staffId: args.employeeId
  });
  return true;
});

ipcMain.handle('order:add-kot', (_, { orderId, employeeId, kitchenNote }) => {
  console.log("🔵 Main received:", orderId, kitchenNote);

  return billingRepo.createKOT({
    sessionId: orderId,
    staffId: employeeId,
    kitchenNote: kitchenNote || null
  });
});



ipcMain.handle('order:adjust-kot-item', (_, args) => {
  billingRepo.addKOTAdjustment({
    sessionId: args.orderId,
    kotId: args.kotId,
    productId: args.productId,
    qtyChange: args.qtyChange,
    reason: args.reason,
    staffId: args.employeeId
  });
  return true;
});

ipcMain.handle('order:mark-bill-printed', (_, { orderId, employeeId }) => {
  billingRepo.markBillPrinted({
    sessionId: orderId,
    staffId: employeeId
  });
  return true;
});

ipcMain.handle('order:finalize-settlement', (_, args) => {
  return billingRepo.finalizeSettlement({
    sessionId: args.orderId,
    billAmount: args.billAmount,
    paidAmount: args.paidAmount,
    paymentMode: args.paymentMode,
    staffId: args.employeeId
  });
});

// ----------------------------------
// IPC – ADVANCED BILLING (ADD ONLY)
// ----------------------------------

ipcMain.handle('order:upsert-session-meta', (_, args) => {
  return billingRepo.upsertSessionMeta(args);
});

ipcMain.handle('order:create-bill', (_, args) => {
  return billingRepo.createBill(args);
});

ipcMain.handle('order:apply-discount', (_, args) => {
  return billingRepo.applyBillDiscount(args);
});

ipcMain.handle('order:add-payment', (_, args) => {
  return billingRepo.addBillPayment(args);
});

ipcMain.handle('order:settle-bill', (_, args) => {
  return billingRepo.settleBill(args);
});

ipcMain.handle('order:instant-paid', (_, args) => {
  return billingRepo.instantPaid(args);
});

ipcMain.handle('order:load-full-billing-session', (_, sessionId) => {
  return billingRepo.loadFullBillingSession(sessionId);
});

ipcMain.handle('order:split-equal', (_, args) => {
  return billingRepo.splitSessionEqual({
    sessionId: args.sessionId,
    splitCount: args.splitCount,
    staffId: args.staffId
  });
});

ipcMain.handle('order:get-open-sessions-by-table', (_, tableId) => {
  return billingRepo.getOpenSessionsByTable(tableId);
});

ipcMain.handle('order:get-split-children', (_, sessionId) => {
  return billingRepo.getSplitChildren(sessionId);
});

ipcMain.handle(
  'order:load-split-view-session',
  async (_, sessionId) => {
    return billingRepo.loadSplitViewSession(sessionId);
  }
);

ipcMain.handle('order:add-bill-item-note', (_, args) => {
  return billingRepo.addBillItemNote(args);
});

ipcMain.handle('order:update-cart-item-note', (_, args) => {
  return billingRepo.updateCartItemNote(args);
});



// ----------------------------------
// IPC – LAN DISCOVERY
// ----------------------------------
ipcMain.handle('lan:discover-host', async () => {
  return new Promise((resolve, reject) => {

    const socket = dgram.createSocket('udp4');
    let resolved = false;

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        try { socket.close(); } catch {}
        reject(err);
      }
    });

    socket.on('message', (msg) => {
      if (resolved) return;

      resolved = true;

      try {
        const data = JSON.parse(msg.toString());
        socket.close();
        resolve(data);
      } catch (err) {
        try { socket.close(); } catch {}
        reject(err);
      }
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      const message = Buffer.from('DISCOVER_SYNROVA_POS');
      socket.send(message, 0, message.length, LAN_PORT, '255.255.255.255');
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { socket.close(); } catch {}
        reject(new Error('No host found'));
      }
    }, 2000);
  });
});





// ----------------------------------
// APP BOOT
// ----------------------------------
app.whenReady().then(async () => {
  const posMode = dbManager.getConfig('pos_mode');

  if (!posMode) {
    app.once('browser-window-created', (_, window) => {
      window.webContents.executeJavaScript(
        `localStorage.removeItem('pos_mode');`
      );
    });
  }

  if (posMode === 'HOST') {
    startLocalServer();
  }

  createWindow();
});

// ----------------------------------
// LIFECYCLE
// ----------------------------------
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});
