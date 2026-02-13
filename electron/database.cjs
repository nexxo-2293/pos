const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const crypto = require('crypto');
const { hashPin } = require('./security.cjs');


// --------------------------------------------------
// DB INIT
// --------------------------------------------------
const dbPath = path.join(app.getPath('userData'), 'synrova.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// --------------------------------------------------
// SCHEMA
// --------------------------------------------------
function initSchema() {
  db.exec(`
    -- -------------------------------
    -- SYSTEM
    -- -------------------------------
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS device (
      id TEXT PRIMARY KEY,
      hotel_id TEXT,
      registered_at TEXT,
      last_sync_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      entity TEXT PRIMARY KEY,
      last_sync_at TEXT
    );

    -- -------------------------------
    -- MASTER DATA (TWO WAY)
    -- -------------------------------
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      pin_hash TEXT,
      permissions TEXT,
      version INTEGER DEFAULT 1,
      updated_at TEXT,
      deleted_at TEXT,
      source TEXT
    );

    -- ======================================
    -- HOTEL TAX CONFIG (CLOUD → POS)
    -- ======================================
    CREATE TABLE IF NOT EXISTS hotel_tax_config (
      hotel_id TEXT PRIMARY KEY,
      cgst_rate REAL,
      sgst_rate REAL,
      gst_included INTEGER,
      vat_rate REAL,
      vat_included INTEGER,
      updated_at TEXT
    );

    -- ======================================
    -- MENU PACKS (PACK ONLY ARCHITECTURE)
    -- ======================================

    CREATE TABLE IF NOT EXISTS menu_packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pack_categories (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      UNIQUE(pack_id, name)
    );

    CREATE TABLE IF NOT EXISTS pack_products (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      base_price REAL NOT NULL,
      food_type TEXT CHECK(food_type IN ('VEG','NON_VEG','EGG','LIQUOR')),
      short_code TEXT,
      item_code TEXT,
      is_available INTEGER DEFAULT 1,
      updated_at TEXT,
      UNIQUE(category_id, name)
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      UNIQUE(product_id, name)
    );

    CREATE TABLE IF NOT EXISTS addon_groups (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      min_allowed INTEGER DEFAULT 0,
      max_allowed INTEGER DEFAULT 0,
      required INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS addon_items (
      id TEXT PRIMARY KEY,
      addon_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      is_available INTEGER DEFAULT 1,
      UNIQUE(addon_group_id, name)
    );



    CREATE TABLE IF NOT EXISTS areas (
      id TEXT PRIMARY KEY,
      name TEXT,
      version INTEGER DEFAULT 1,
      updated_at TEXT,
      deleted_at TEXT,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      area_id TEXT,
      name TEXT,
      capacity INTEGER,
      version INTEGER DEFAULT 1,
      updated_at TEXT,
      deleted_at TEXT,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT,
      phone TEXT,
      email TEXT,
      type TEXT,
      credit_limit REAL,
      version INTEGER DEFAULT 1,
      updated_at TEXT,
      deleted_at TEXT,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS discounts (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      value REAL,
      is_active INTEGER,
      version INTEGER DEFAULT 1,
      updated_at TEXT,
      deleted_at TEXT,
      source TEXT
    );

    -- -------------------------------
    -- TRANSACTIONS (POS MASTER)
    -- -------------------------------
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number INTEGER,
      employee_id TEXT,
      table_id TEXT,
      total REAL,
      status TEXT,
      created_at TEXT,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      product_id TEXT,
      quantity INTEGER,
      price REAL,
      kot_no INTEGER,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      method TEXT,
      amount REAL
    );

    -- -------------------------------
    -- SYNC ENGINE
    -- -------------------------------
    CREATE TABLE IF NOT EXISTS change_log (
      id TEXT PRIMARY KEY,
      entity TEXT,
      entity_id TEXT,
      action TEXT,
      payload TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      type TEXT,
      payload TEXT,
      created_at TEXT,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tombstones (
      entity TEXT,
      entity_id TEXT,
      deleted_at TEXT,
      PRIMARY KEY (entity, entity_id)
    );

    -- -------------------------------
    -- PRINT LAYOUT (LOCAL ONLY)
    -- -------------------------------
    CREATE TABLE IF NOT EXISTS print_layout (
      hotel_id TEXT PRIMARY KEY,
      hotel_name TEXT,
      address TEXT,
      phone TEXT,
      gstin TEXT,
      currency TEXT,
      header TEXT,
      footer TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS billing_sessions (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      order_type TEXT NOT NULL,
      status TEXT NOT NULL,
      bill_printed INTEGER NOT NULL DEFAULT 0,
      bill_revision INTEGER NOT NULL DEFAULT 0,
      parent_session_id TEXT,
      split_index INTEGER,
      opened_by TEXT NOT NULL,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS session_cart (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      note TEXT
    );

    
    CREATE TABLE IF NOT EXISTS kots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence_no INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      kitchen_note TEXT
    );

    CREATE TABLE IF NOT EXISTS kot_items (
      id TEXT PRIMARY KEY,
      kot_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS kot_adjustments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      kot_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty_change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      bill_amount REAL NOT NULL,
      paid_amount REAL NOT NULL,
      waived_off REAL NOT NULL,
      payment_mode TEXT NOT NULL,
      settled_by TEXT NOT NULL,
      settled_at INTEGER NOT NULL,
      bill_no INTEGER NOT NULL,
      bill_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      performed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_session_meta (
      session_id TEXT PRIMARY KEY,
      customer_id TEXT,
      order_note TEXT,
      order_type TEXT CHECK(order_type IN ('DINE_IN','DELIVERY','TAKEAWAY')) NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES billing_sessions(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      bill_no INTEGER NOT NULL,
      bill_type TEXT CHECK(bill_type IN ('FULL','SPLIT')) NOT NULL,
      split_method TEXT CHECK(
        split_method IN ('NONE','EQUAL','PERCENTAGE','ITEM')
      ) NOT NULL DEFAULT 'NONE',
      total_amount REAL NOT NULL,
      status TEXT CHECK(status IN ('OPEN','PAID')) NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES billing_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY(bill_id) REFERENCES bills(id)
    );


    CREATE TABLE IF NOT EXISTS bill_payments (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      payment_mode TEXT CHECK(
        payment_mode IN ('CASH','CARD','GPAY','PHONEPE','PAYTM','DUE')
      ) NOT NULL,
      amount REAL NOT NULL,
      paid_at INTEGER NOT NULL,
      FOREIGN KEY(bill_id) REFERENCES bills(id)
    );


    CREATE TABLE IF NOT EXISTS bill_discounts (
      id TEXT PRIMARY KEY,
      bill_id TEXT NOT NULL,
      discount_type TEXT CHECK(discount_type IN ('FLAT','PERCENT')) NOT NULL,
      discount_value REAL NOT NULL,
      reason TEXT NOT NULL,
      applied_by TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      FOREIGN KEY(bill_id) REFERENCES bills(id)
    );


    CREATE TABLE IF NOT EXISTS bill_item_notes (
      id TEXT PRIMARY KEY,
      bill_item_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(bill_item_id) REFERENCES bill_items(id)
    );






    
  `);

  console.log("✅ POS SQLite schema initialized at:", dbPath);
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

// --------------------------------------------------
// CONFIG
// --------------------------------------------------
function saveConfig(key, value) {
  db.prepare(`
    INSERT OR REPLACE INTO config (key, value)
    VALUES (?, ?)
  `).run(key, JSON.stringify(value));
}

function getConfig(key) {
  const row = db.prepare(`SELECT value FROM config WHERE key = ?`).get(key);
  return row ? JSON.parse(row.value) : null;
}

// --------------------------------------------------
// BULK SYNC (CLOUD → POS)
// --------------------------------------------------
// --------------------------------------------------
// BULK SYNC (CLOUD → POS)
// --------------------------------------------------

function bulkInsertStaff(staffList) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO staff
    (id, name, role, pin_hash, permissions, version, updated_at, deleted_at, source)
    VALUES
    (@id, @name, @role, @pin_hash, @permissions, @version, @updated_at, NULL, 'CLOUD')
  `);

  const tx = db.transaction((rows) => {
    for (const s of rows) {

      // 🔍 DEBUG — THIS IS THE IMPORTANT PART
      console.log('[STAFF HASH DEBUG]', {
        staffId: s.id,
        pinCode_from_cloud: s.pinCode,
        sha256_9009_direct: crypto
          .createHash('sha256')
          .update('9009')
          .digest('hex'),
        hashPin_9009_via_fn: hashPin('9009'),
        hashPin_actual_from_staff: s.pinCode
          ? hashPin(String(s.pinCode).trim())
          : null
      });

      stmt.run({
        id: s.id,
        name: s.name,
        role: s.role,
        pin_hash: hashPin(String(s.pinCode).trim()),
        permissions: JSON.stringify(s.permissions || []),
        version: s.version || 1,
        updated_at: s.updatedAt || new Date().toISOString()
      });
    }
  });

  tx(staffList);

  // 🔍 CONFIRM WHAT WAS WRITTEN TO SQLITE
  console.log(
    '[STAFF TABLE AFTER INSERT]',
    db.prepare('SELECT id, pin_hash FROM staff').all()
  );
}


function insertProductWithRelations(product, categoryId) {

  // -------------------------------
  // INSERT PRODUCT
  // -------------------------------
  db.prepare(`
    INSERT INTO pack_products
    (id, category_id, name, description, image_url,
     base_price, food_type, short_code, item_code,
     is_available, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    product.id,
    categoryId,
    product.name,
    product.description || '',
    product.imageUrl || '',
    product.basePrice,
    product.foodType,
    product.shortCode || '',
    product.itemCode || '',
    product.isAvailable ? 1 : 0,
    product.updatedAt || now()
  );

  // -------------------------------
  // INSERT VARIANTS
  // -------------------------------
  for (const variant of product.variants || []) {
    db.prepare(`
      INSERT INTO product_variants
      (id, product_id, name, price, is_default, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      variant.id,
      product.id,
      variant.name,
      variant.price,
      variant.isDefault ? 1 : 0,
      variant.isActive ? 1 : 1
    );
  }

  // -------------------------------
  // INSERT ADDON GROUPS
  // -------------------------------
  for (const group of product.addonGroups || []) {

    db.prepare(`
      INSERT INTO addon_groups
      (id, product_id, name, min_allowed, max_allowed, required)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      group.id,
      product.id,
      group.name,
      group.minAllowed || 0,
      group.maxAllowed || 0,
      group.required ? 1 : 0
    );

    // -------------------------------
    // INSERT ADDON ITEMS
    // -------------------------------
    for (const item of group.items || []) {
      db.prepare(`
        INSERT INTO addon_items
        (id, addon_group_id, name, price, is_available)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        item.id,
        group.id,
        item.name,
        item.price,
        item.isAvailable ? 1 : 1
      );
    }
  }
}



function bulkInsertMenuV2(menu) {

  const tx = db.transaction(() => {

    // --------------------------------------------------
    // FULL CLEAN RESET (ORDER MATTERS)
    // --------------------------------------------------
    db.prepare(`DELETE FROM addon_items`).run();
    db.prepare(`DELETE FROM addon_groups`).run();
    db.prepare(`DELETE FROM product_variants`).run();
    db.prepare(`DELETE FROM pack_products`).run();
    db.prepare(`DELETE FROM pack_categories`).run();
    db.prepare(`DELETE FROM menu_packs`).run();

    // --------------------------------------------------
    // INSERT PACKS
    // --------------------------------------------------
    for (const pack of menu.packs || []) {

      db.prepare(`
        INSERT INTO menu_packs
        (id, name, description, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        pack.id,
        pack.name,
        pack.description || '',
        pack.isActive ? 1 : 0,
        pack.updatedAt || now()
      );

      // --------------------------------------------------
      // INSERT PACK CATEGORIES
      // --------------------------------------------------
      for (const category of pack.categories || []) {

        const categoryId = uuid();

        db.prepare(`
          INSERT INTO pack_categories
          (id, pack_id, name, sort_order)
          VALUES (?, ?, ?, ?)
        `).run(
          categoryId,
          pack.id,
          category.name,
          category.sortOrder || 0
        );

        // --------------------------------------------------
        // INSERT PRODUCTS (USING HELPER)
        // --------------------------------------------------
        for (const product of category.items || []) {
          insertProductWithRelations(product, categoryId);
        }
      }
    }

  });

  tx();
}







function bulkInsertFloors(areas) {
  const insertArea = db.prepare(`
    INSERT OR REPLACE INTO areas
    (id, name, version, updated_at, deleted_at, source)
    VALUES (?, ?, ?, ?, NULL, 'CLOUD')
  `);

  const insertTable = db.prepare(`
    INSERT OR REPLACE INTO tables
    (id, area_id, name, capacity, version, updated_at, deleted_at, source)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 'CLOUD')
  `);

  const tx = db.transaction((list) => {
    db.prepare(`DELETE FROM tables`).run();
    db.prepare(`DELETE FROM areas`).run();

    for (const a of list) {
      insertArea.run(a.id, a.name, a.version || 1, a.updatedAt || now());
      for (const t of a.tables || []) {
        insertTable.run(
          t.id,
          a.id,
          t.name,
          t.capacity,
          t.version || 1,
          t.updatedAt || now()
        );
      }
    }
  });

  tx(areas);
}

// --------------------------------------------------
// POS WRITE OPERATIONS (LOGGED)
// --------------------------------------------------
function logChange(entity, entityId, action, payload) {
  db.prepare(`
    INSERT INTO change_log
    (id, entity, entity_id, action, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), entity, entityId, action, JSON.stringify(payload), now());
}

function enqueueOutbox(type, payload) {
  db.prepare(`
    INSERT INTO outbox
    (id, type, payload, created_at)
    VALUES (?, ?, ?, ?)
  `).run(uuid(), type, JSON.stringify(payload), now());
}

// --------------------------------------------------
// READ HELPERS
// --------------------------------------------------
function getStaff() {
  return db.prepare(`SELECT * FROM staff WHERE deleted_at IS NULL`).all();
}

function getMenuV2() {

  const packs = db.prepare(`SELECT * FROM menu_packs`).all();
  const categories = db.prepare(`SELECT * FROM pack_categories`).all();
  const products = db.prepare(`SELECT * FROM pack_products`).all();
  const variants = db.prepare(`SELECT * FROM product_variants`).all();
  const addonGroups = db.prepare(`SELECT * FROM addon_groups`).all();
  const addonItems = db.prepare(`SELECT * FROM addon_items`).all();

  return {
    packs: packs.map(pack => {

      const packCats = categories
        .filter(c => c.pack_id === pack.id)
        .map(cat => {

          const catProducts = products
            .filter(p => p.category_id === cat.id)
            .map(p => ({
              ...p,
              variants: variants.filter(v => v.product_id === p.id),
              addonGroups: addonGroups
                .filter(g => g.product_id === p.id)
                .map(g => ({
                  ...g,
                  items: addonItems.filter(i => i.addon_group_id === g.id)
                }))
            }));

          return {
            ...cat,
            items: catProducts
          };
        });

      return {
        ...pack,
        categories: packCats
      };
    })
  };
}



function getFloors() {
  const areas = db.prepare(`SELECT * FROM areas WHERE deleted_at IS NULL`).all();
  const tables = db.prepare(`SELECT * FROM tables WHERE deleted_at IS NULL`).all();

  return areas.map(a => ({
    ...a,
    tables: tables.filter(t => t.area_id === a.id)
  }));
}

// --------------------------------------------------
// PRINT LAYOUT
// --------------------------------------------------
function savePrintLayout(layout) {
  db.prepare(`
    INSERT OR REPLACE INTO print_layout
    (hotel_id, hotel_name, address, phone, gstin, currency, header, footer, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    layout.hotelId,
    layout.hotelName,
    layout.address,
    layout.phone,
    layout.gstin,
    layout.currency || 'INR',
    layout.header || '',
    layout.footer || '',
    now()
  );
}

function getPrintLayout() {
  return db.prepare(`SELECT * FROM print_layout LIMIT 1`).get();
}

// --------------------------------------------------
// TAX GROUPS
// --------------------------------------------------


function saveHotelTaxConfig(tax) {

  if (!tax) return;

  db.prepare(`
    INSERT OR REPLACE INTO hotel_tax_config
    (hotel_id, cgst_rate, sgst_rate, gst_included,
     vat_rate, vat_included, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tax.hotelId,
    tax.cgstRate,
    tax.sgstRate,
    tax.gstIncluded ? 1 : 0,
    tax.vatRate,
    tax.vatIncluded ? 1 : 0,
    now()
  );
}




function getHotelTaxConfig() {
  return db.prepare(`
    SELECT * FROM hotel_tax_config
    LIMIT 1
  `).get();
}


function getOpenOrderByTable(tableId) {
  return db.prepare(`
    SELECT * FROM orders
    WHERE table_id = ?
      AND status IN ('OPEN', 'KOT_SENT')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(tableId);
}

function createOrder({ tableId, employeeId }) {
  const orderId = uuid();

  db.prepare(`
    INSERT INTO orders
    (id, order_number, employee_id, table_id, total, status, created_at)
    VALUES (?, ?, ?, ?, 0, 'OPEN', ?)
  `).run(
    orderId,
    Date.now(), // local incremental-ish
    employeeId,
    tableId,
    now()
  );

  return orderId;
}

function getNextKotNo(orderId) {
  const row = db.prepare(`
    SELECT MAX(kot_no) as maxKot
    FROM order_items
    WHERE order_id = ?
  `).get(orderId);

  return (row?.maxKot || 0) + 1;
}


function addKotItems(orderId, kotNo, items) {
  const stmt = db.prepare(`
    INSERT INTO order_items
    (id, order_id, product_id, quantity, price, kot_no, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const item of items) {
      stmt.run(
        uuid(),
        orderId,
        item.productId,
        item.qty,
        item.price,
        kotNo,
        now()
      );
    }

    db.prepare(`
      UPDATE orders
      SET status = 'KOT_SENT'
      WHERE id = ?
    `).run(orderId);
  });

  tx();
}


function getOrderWithItems(orderId) {
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
  const items = db.prepare(`
    SELECT * FROM order_items
    ORDER BY kot_no ASC, created_at ASC
  `).all(orderId);

  return { order, items };
}

function getOpenBillingSessions() {
  return db.prepare(`
    SELECT *
    FROM billing_sessions
    WHERE status != 'PAID'
  `).all();
}





// --------------------------------------------------
// EXPORTS
// --------------------------------------------------
module.exports = {
  db,
  initSchema,

  // config
  saveConfig,
  getConfig,

  // print layout
  savePrintLayout,
  getPrintLayout,

  // tax
  saveHotelTaxConfig,
  getHotelTaxConfig,

  // bulk sync
  bulkInsertStaff,
  bulkInsertMenuV2,
  bulkInsertFloors,

  // sync engine
  logChange,
  enqueueOutbox,

  // reads
  getStaff,
  getMenuV2,
  getFloors,

  // orders
  getOpenOrderByTable,
  createOrder,
  getNextKotNo,
  addKotItems,
  getOrderWithItems,
  getOpenBillingSessions

};
