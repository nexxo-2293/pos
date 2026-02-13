const { db } = require('./database.cjs');
const { randomUUID } = require('crypto');

/* ----------------------------------
   AUDIT
---------------------------------- */

function logAudit({ entityType, entityId, action, payload, staffId }) {
  db.prepare(`
    INSERT INTO audit_logs
    (id, entity_type, entity_id, action, payload, performed_by, performed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    entityType,
    entityId,
    action,
    JSON.stringify(payload),
    staffId,
    Date.now()
  );
}

/* ----------------------------------
   SESSION
---------------------------------- */

function getOpenSession(tableId) {
  const row = db.prepare(`
    SELECT *
    FROM billing_sessions
    WHERE table_id = ?
    ORDER BY opened_at DESC
  `).all(tableId);

  console.log('🧪 [DB] sessions for table', tableId, row);

  return db.prepare(`
    SELECT *
    FROM billing_sessions
    WHERE table_id = ?
      AND status != 'PAID'
    ORDER BY opened_at DESC
    LIMIT 1
  `).get(tableId);
}

function createBillingSession({ tableId, orderType = 'DINE_IN', staffId }) {
  console.log('🔥 createBillingSession', {
    tableId,
    staffId
  });

  // 🔥 HARD SAFETY: close any leaked sessions
  db.prepare(`
    UPDATE billing_sessions
    SET status='PAID',
        closed_at=?
    WHERE table_id=?
      AND closed_at IS NULL
  `).run(Date.now(), tableId);

  const id = randomUUID();

  db.prepare(`
    INSERT INTO billing_sessions
    (id, table_id, order_type, status, opened_by, opened_at)
    VALUES (?, ?, ?, 'RUNNING', ?, ?)
  `).run(id, tableId, orderType, staffId, Date.now());

  logAudit({
    entityType: 'SESSION',
    entityId: id,
    action: 'CREATE',
    payload: { tableId, orderType },
    staffId
  });

  return id;
}

/* ----------------------------------
   CART (PRE-KOT)
---------------------------------- */

function addToCart({ sessionId, item }) {

  const existing = db.prepare(`
    SELECT * FROM session_cart
    WHERE session_id=? AND product_id=?
  `).get(sessionId, item.productId);

  if (existing) {

    db.prepare(`
      UPDATE session_cart
      SET qty = qty + 1,
          total = (qty + 1) * price,
          note = ?
      WHERE id=?
    `).run(item.note || existing.note || null, existing.id);

  } else {

    db.prepare(`
      INSERT INTO session_cart
      (id, session_id, product_id, name, qty, price, total, note)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      randomUUID(),
      sessionId,
      item.productId,
      item.name,
      item.price,
      item.price,
      item.note || null
    );
  }
}


function updateCartQty({ sessionId, productId, qty, reason, staffId }) {
  if (qty <= 0) {
    db.prepare(`
      DELETE FROM session_cart
      WHERE session_id=? AND product_id=?
    `).run(sessionId, productId);
  } else {
    db.prepare(`
      UPDATE session_cart
      SET qty=?, total=qty*price
      WHERE session_id=? AND product_id=?
    `).run(qty, sessionId, productId);
  }

  if (reason) {
    logAudit({
      entityType: 'CART',
      entityId: sessionId,
      action: 'QTY_CHANGE',
      payload: { productId, qty, reason },
      staffId
    });
  }
}

/* ----------------------------------
   KOT
---------------------------------- */

function createKOT({ sessionId, staffId, kitchenNote = null }) {

  // -------------------------------
  // LOAD CART
  // -------------------------------
  const cart = db.prepare(`
    SELECT * FROM session_cart WHERE session_id=?
  `).all(sessionId);

  if (!cart || cart.length === 0) return null;

  const kotId = randomUUID();

  // -------------------------------
  // SEQUENCE NUMBER
  // -------------------------------
  const row = db.prepare(`
    SELECT COALESCE(MAX(sequence_no), 0) + 1 AS seq
    FROM kots
    WHERE session_id = ?
  `).get(sessionId);

  const seq = row.seq;

  const now = Date.now();

  // -------------------------------
  // INSERT KOT HEADER
  // -------------------------------
  db.prepare(`
    INSERT INTO kots
    (id, session_id, sequence_no, created_by, created_at, kitchen_note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    kotId,
    sessionId,
    seq,
    staffId,
    now,
    kitchenNote || null
  );

  // -------------------------------
  // INSERT KOT ITEMS
  // -------------------------------
  const stmt = db.prepare(`
    INSERT INTO kot_items
    (id, kot_id, product_id, name, qty, price, total, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  cart.forEach(i => {
    stmt.run(
      randomUUID(),
      kotId,
      i.product_id,
      i.name,
      i.qty,
      i.price,
      i.total,
      i.note || null
    );
  });

  // -------------------------------
  // CLEAR CART
  // -------------------------------
  db.prepare(`
    DELETE FROM session_cart WHERE session_id=?
  `).run(sessionId);

  // -------------------------------
  // AUDIT
  // -------------------------------
  logAudit({
    entityType: 'KOT',
    entityId: kotId,
    action: 'CREATE',
    payload: {
      items: cart,
      kitchenNote
    },
    staffId
  });

  return kotId;
}


/* ----------------------------------
   ADJUSTMENTS
---------------------------------- */

function addKOTAdjustment({ sessionId, kotId, productId, qtyChange, reason, staffId }) {
  const id = randomUUID();

  db.prepare(`
    INSERT INTO kot_adjustments
    (id, session_id, kot_id, product_id, qty_change, reason, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    kotId,
    productId,
    qtyChange,
    reason,
    staffId,
    Date.now()
  );

  logAudit({
    entityType: 'ADJUSTMENT',
    entityId: id,
    action: 'CANCEL_ITEM',
    payload: { kotId, productId, qtyChange, reason },
    staffId
  });
}

/* ----------------------------------
   BILL SNAPSHOT
---------------------------------- */

function markBillPrinted({ sessionId, staffId }) {
  const kotId = createKOT({ sessionId, staffId });

  const hasKOT = db.prepare(`
    SELECT 1 FROM kots WHERE session_id=? LIMIT 1
  `).get(sessionId);

  if (!hasKOT) {
    return { skipped: true };
  }

  db.prepare(`
    UPDATE billing_sessions
    SET status='PRINTED', bill_revision = bill_revision + 1
    WHERE id=?
  `).run(sessionId);

  logAudit({
    entityType: 'SESSION',
    entityId: sessionId,
    action: 'PRINT',
    payload: {},
    staffId
  });

  return { printed: true };
}

/* ----------------------------------
   SETTLEMENT
---------------------------------- */
function finalizeSettlement({ sessionId, billAmount, paidAmount, paymentMode, staffId }) {
  const hasChildren = db.prepare(`
    SELECT 1 FROM billing_sessions
    WHERE parent_session_id = ?
    LIMIT 1
  `).get(sessionId);

  if (hasChildren) {
    throw new Error('Cannot settle a split parent session');
  }

  const session = db.prepare(`
    SELECT id, table_id, status
    FROM billing_sessions
    WHERE id=?
  `).get(sessionId);

  if (!session) throw new Error('Session not found');
  if (session.status !== 'PRINTED') {
    throw new Error('Cannot settle without printed bill');
  }

  const waivedOff = Math.max(0, billAmount - paidAmount);

  const billDate = new Date().toISOString().slice(0, 10);

  const row = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM settlements
    WHERE bill_date = ?
  `).get(billDate);

  const billNo = Number(row?.cnt || 0) + 1;

  const now = Date.now();

  db.prepare(`
    INSERT INTO settlements
    (id, session_id, bill_no, bill_date, bill_amount, paid_amount, waived_off, payment_mode, settled_by, settled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    sessionId,
    billNo,
    billDate,
    billAmount,
    paidAmount,
    waivedOff,
    paymentMode,
    staffId,
    now
  );

  // ---------------------------
  // CLOSE THIS SESSION
  // ---------------------------
  db.prepare(`
    UPDATE billing_sessions
    SET status='PAID', closed_at=?
    WHERE id = ?
  `).run(now, sessionId);

  // ---------------------------
  // 🔥 IF THIS IS A SPLIT CHILD → CHECK PARENT
  // ---------------------------
  if (session.parent_session_id) {
    const parentId = session.parent_session_id;

    const unpaidChildren = db.prepare(`
      SELECT 1
      FROM billing_sessions
      WHERE parent_session_id = ?
        AND status != 'PAID'
      LIMIT 1
    `).get(parentId);

    // ✅ ALL CHILDREN PAID → CLOSE PARENT
    if (!unpaidChildren) {
      db.prepare(`
        UPDATE billing_sessions
        SET status='PAID', closed_at=?
        WHERE id = ?
      `).run(now, parentId);
    }
  }


  logAudit({
    entityType: 'SESSION',
    entityId: sessionId,
    action: 'SETTLE',
    payload: {
      billNo,
      billDate,
      billAmount,
      paidAmount,
      waivedOff,
      paymentMode
    },
    staffId
  });

  return { billNo, billDate };
}

/* ----------------------------------
   LOAD FULL SESSION (UI)
---------------------------------- */

function loadSession(sessionId) {
  const session = db.prepare(`SELECT * FROM billing_sessions WHERE id=?`).get(sessionId);
  const cart = db.prepare(`SELECT * FROM session_cart WHERE session_id=?`).all(sessionId);
  const kots = db.prepare(`SELECT * FROM kots WHERE session_id=?`).all(sessionId);
  const kotItems = db.prepare(`
    SELECT * FROM kot_items WHERE kot_id IN
    (SELECT id FROM kots WHERE session_id=?)
  `).all(sessionId);
  const adjustments = db.prepare(`
    SELECT * FROM kot_adjustments WHERE session_id=?
  `).all(sessionId);

  return { session, cart, kots, kotItems, adjustments };
}

/* ----------------------------------
   SESSION META
---------------------------------- */

function upsertSessionMeta({ sessionId, customerId = null, orderNote = null, orderType, staffId }) {
  const now = Date.now();

  db.prepare(`
    INSERT INTO billing_session_meta
    (session_id, customer_id, order_note, order_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      customer_id = excluded.customer_id,
      order_note = excluded.order_note,
      order_type = excluded.order_type,
      updated_at = excluded.updated_at
  `).run(sessionId, customerId, orderNote, orderType, now, now);

  logAudit({
    entityType: 'SESSION_META',
    entityId: sessionId,
    action: 'UPSERT',
    payload: { customerId, orderNote, orderType },
    staffId
  });
}

function getSessionMeta(sessionId) {
  return db.prepare(`
    SELECT * FROM billing_session_meta WHERE session_id=?
  `).get(sessionId);
}


/* ----------------------------------
   BILL
---------------------------------- */

function createBill({
  sessionId,
  billType = 'FULL',
  splitMethod = 'NONE',
  totalAmount,
  staffId
}) {
  const billId = randomUUID();
  const createdAt = Date.now();

  const row = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM bills
    WHERE session_id=?
  `).get(sessionId);

  const billNo = Number(row?.cnt || 0) + 1;

  db.prepare(`
    INSERT INTO bills
    (id, session_id, bill_no, bill_type, split_method, total_amount, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
  `).run(
    billId,
    sessionId,
    billNo,
    billType,
    splitMethod,
    totalAmount,
    createdAt
  );

  logAudit({
    entityType: 'BILL',
    entityId: billId,
    action: 'CREATE',
    payload: { billType, splitMethod, totalAmount, billNo },
    staffId
  });

  return { billId, billNo };
}


function addBillItem({
  billId,
  productId,
  name,
  qty,
  price
}) {
  db.prepare(`
    INSERT INTO bill_items
    (id, bill_id, product_id, name, qty, price, total)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    billId,
    productId,
    name,
    qty,
    price,
    qty * price
  );
}


/* ----------------------------------
   DISCOUNTS
---------------------------------- */

function applyBillDiscount({
  billId,
  type,      // FLAT | PERCENT
  value,
  reason,
  staffId
}) {
  db.prepare(`
    INSERT INTO bill_discounts
    (id, bill_id, discount_type, discount_value, reason, applied_by, applied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    billId,
    type,
    value,
    reason,
    staffId,
    Date.now()
  );

  logAudit({
    entityType: 'DISCOUNT',
    entityId: billId,
    action: 'APPLY',
    payload: { type, value, reason },
    staffId
  });
}


/* ----------------------------------
   BILL PAYMENTS
---------------------------------- */

function addBillPayment({
  billId,
  mode,     // CASH | CARD | GPAY | PHONEPE | PAYTM | DUE
  amount,
  staffId
}) {
  db.prepare(`
    INSERT INTO bill_payments
    (id, bill_id, payment_mode, amount, paid_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    billId,
    mode,
    amount,
    Date.now()
  );

  logAudit({
    entityType: 'PAYMENT',
    entityId: billId,
    action: 'ADD',
    payload: { mode, amount },
    staffId
  });
}


function settleBill({ billId, staffId }) {
  const bill = db.prepare(`
    SELECT * FROM bills WHERE id=?
  `).get(billId);

  if (!bill) throw new Error('Bill not found');

  const paid = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS paid
    FROM bill_payments
    WHERE bill_id=?
  `).get(billId).paid;

  if (paid < bill.total_amount) {
    throw new Error('Bill not fully paid');
  }

  db.prepare(`
    UPDATE bills SET status='PAID' WHERE id=?
  `).run(billId);

  // if all bills PAID → close session
  const openBills = db.prepare(`
    SELECT 1 FROM bills
    WHERE session_id=? AND status='OPEN'
    LIMIT 1
  `).get(bill.session_id);

  if (!openBills) {
    db.prepare(`
      UPDATE billing_sessions
      SET status='PAID', closed_at=?
      WHERE id=?
    `).run(Date.now(), bill.session_id);
  }

  logAudit({
    entityType: 'BILL',
    entityId: billId,
    action: 'SETTLE',
    payload: {},
    staffId
  });
}


function instantPaid({
  sessionId,
  totalAmount,
  staffId
}) {
  const { billId } = createBill({
    sessionId,
    billType: 'FULL',
    splitMethod: 'NONE',
    totalAmount,
    staffId
  });

  addBillPayment({
    billId,
    mode: 'CASH',
    amount: totalAmount,
    staffId
  });

  settleBill({ billId, staffId });

  return billId;
}


function loadFullBillingSession(sessionId) {
  const base = loadSession(sessionId);

  const meta = getSessionMeta(sessionId);
  const bills = db.prepare(`
    SELECT * FROM bills WHERE session_id=?
  `).all(sessionId);

  const billItems = db.prepare(`
    SELECT * FROM bill_items
    WHERE bill_id IN (SELECT id FROM bills WHERE session_id=?)
  `).all(sessionId);

  const payments = db.prepare(`
    SELECT * FROM bill_payments
    WHERE bill_id IN (SELECT id FROM bills WHERE session_id=?)
  `).all(sessionId);

  const discounts = db.prepare(`
    SELECT * FROM bill_discounts
    WHERE bill_id IN (SELECT id FROM bills WHERE session_id=?)
  `).all(sessionId);

  return {
    ...base,
    meta,
    bills,
    billItems,
    payments,
    discounts
  };
}

/* ----------------------------------
   SPLIT BILL – EQUAL
---------------------------------- */
function splitSessionEqual({ sessionId, splitCount, staffId }) {
  if (splitCount < 2) {
    throw new Error('Split count must be >= 2');
  }

  const session = db.prepare(`
    SELECT *
    FROM billing_sessions
    WHERE id = ?
  `).get(sessionId);

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'PRINTED') {
    throw new Error('Only PRINTED sessions can be split');
  }

  // ❌ Prevent double split
  const alreadySplit = db.prepare(`
    SELECT 1
    FROM billing_sessions
    WHERE parent_session_id = ?
    LIMIT 1
  `).get(sessionId);

  if (alreadySplit) {
    throw new Error('Session already split');
  }

  // ---------------------------
  // CALCULATE TOTAL FROM KOTs
  // ---------------------------
  const items = db.prepare(`
    SELECT
      ki.qty,
      ki.price,
      COALESCE(SUM(ka.qty_change), 0) AS adj
    FROM kot_items ki
    LEFT JOIN kot_adjustments ka
      ON ka.kot_id = ki.kot_id
     AND ka.product_id = ki.product_id
    WHERE ki.kot_id IN (
      SELECT id FROM kots WHERE session_id = ?
    )
    GROUP BY ki.id
  `).all(sessionId);

  let totalAmount = 0;
  for (const i of items) {
    totalAmount += (i.qty + i.adj) * i.price;
  }

  if (totalAmount <= 0) {
    throw new Error('Cannot split bill with zero total');
  }

  const perSplit = Math.round((totalAmount / splitCount) * 100) / 100;
  const now = Date.now();

  const tx = db.transaction(() => {
    for (let i = 1; i <= splitCount; i++) {
      const childSessionId = randomUUID();

      // ---------------------------
      // CREATE CHILD SESSION
      // ---------------------------
      db.prepare(`
        INSERT INTO billing_sessions
        (
          id,
          table_id,
          order_type,
          status,
          bill_printed,
          bill_revision,
          parent_session_id,
          split_index,
          opened_by,
          opened_at
        )
        VALUES (?, ?, ?, 'PRINTED', 1, 1, ?, ?, ?, ?)
      `).run(
        childSessionId,
        session.table_id,
        session.order_type,
        sessionId,
        i,
        staffId,
        now
      );

      // ---------------------------
      // DAILY BILL NUMBER (GLOBAL)
      // ---------------------------
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const row = db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM bills
        WHERE created_at >= ?
      `).get(startOfDay.getTime());

      const billNo = Number(row?.cnt || 0) + 1;


      // ---------------------------
      // CREATE BILL FOR CHILD
      // ---------------------------
      const billId = randomUUID();

      db.prepare(`
        INSERT INTO bills
        (
          id,
          session_id,
          bill_no,
          bill_type,
          split_method,
          total_amount,
          status,
          created_at
        )
        VALUES (?, ?, ?, 'SPLIT', 'EQUAL', ?, 'OPEN', ?)
      `).run(
        billId,
        childSessionId,
        billNo,
        perSplit,
        now
      );


      logAudit({
        entityType: 'SESSION',
        entityId: childSessionId,
        action: 'SPLIT_CREATE',
        payload: {
          parentSessionId: sessionId,
          splitIndex: i,
          amount: perSplit
        },
        staffId
      });
    }

    // ---------------------------
    // 🔒 CLOSE PARENT SESSION (CRITICAL)
    // ---------------------------
    db.prepare(`
      UPDATE billing_sessions
      SET status='PAID', closed_at=?
      WHERE id=?
    `).run(now, sessionId);
  });

  tx();

  return {
    splitCount,
    perSplit,
    totalAmount
  };
}


function getOpenSessionsByTable(tableId) {
  return db.prepare(`
    SELECT *
    FROM billing_sessions
    WHERE table_id = ?
      AND status != 'PAID'
    ORDER BY
      parent_session_id IS NOT NULL,
      split_index ASC
  `).all(tableId);
}


function getSplitChildren(sessionId) {
  return db.prepare(`
    SELECT *
    FROM billing_sessions
    WHERE parent_session_id = ?
      AND status != 'PAID'
    ORDER BY split_index ASC
  `).all(sessionId);
}

function loadSplitViewSession(childSessionId) {
  const child = db.prepare(`
    SELECT * FROM billing_sessions WHERE id=?
  `).get(childSessionId);

  if (!child || !child.parent_session_id) {
    throw new Error('Not a split child session');
  }

  // 🔑 LOAD PARENT DATA
  const parentData = loadFullBillingSession(child.parent_session_id);

  // 🔑 LOAD CHILD SETTLEMENT (amount)
  const settlement = db.prepare(`
    SELECT * FROM settlements WHERE session_id=?
  `).get(childSessionId);

  return {
    ...parentData,
    settlement,
    splitIndex: child.split_index
  };
}

function addBillItemNote({ billItemId, note }) {
  db.prepare(`
    INSERT INTO bill_item_notes
    (id, bill_item_id, note, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    randomUUID(),
    billItemId,
    note,
    Date.now()
  );
}

function updateCartItemNote({ sessionId, productId, note }) {
  db.prepare(`
    UPDATE session_cart
    SET note = ?
    WHERE session_id = ?
      AND product_id = ?
  `).run(note || null, sessionId, productId);
}


module.exports = {
  getOpenSession,
  createBillingSession,
  addToCart,
  updateCartQty,
  createKOT,
  addKOTAdjustment,
  markBillPrinted,
  finalizeSettlement,
  loadSession,
  upsertSessionMeta,
  getSessionMeta,
  createBill,
  addBillItem,
  applyBillDiscount,
  addBillPayment,
  settleBill,
  instantPaid,
  loadFullBillingSession,
  splitSessionEqual,
  getOpenSessionsByTable,
  getSplitChildren,
  loadSplitViewSession,
  addBillItemNote,
  updateCartItemNote
};
