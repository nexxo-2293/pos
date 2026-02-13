const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ip = require('ip');
const cors = require('cors');
const dgram = require('dgram');

const dbManager = require('./database.cjs');
const Security = require('./security.cjs');

// =======================
// ENV CONFIG
// =======================
const LAN_PORT = process.env.POS_LAN_PORT
  ? Number(process.env.POS_LAN_PORT)
  : 4321;

// =======================
// INTERNAL STATE
// =======================
let io;
let server;
let udpServer;

// =======================
// START LOCAL SERVER
// =======================
function startLocalServer() {
  if (server) {
    return {
      ip: ip.address(),
      port: LAN_PORT
    };
  }

  /* =======================
     EXPRESS + SOCKET.IO
     ======================= */
  const app = express();
  server = http.createServer(app);

  app.use(cors());
  app.use(express.json());

  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  /* =======================
     LAN REST API
     ======================= */

  // HEALTH CHECK
  app.get('/lan/ping', (_, res) => {
    res.json({ status: 'ok', role: 'HOST' });
  });

  // STAFF LOGIN (CLIENT → HOST)
  app.post('/lan/login', (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) {
        return res.status(400).json({ error: 'PIN required' });
      }

      const hashed = Security.hashPin(pin);

      const staff = dbManager.db
        .prepare(
          'SELECT id, name, role, permissions FROM staff WHERE pin_hash = ?'
        )
        .get(hashed);

      if (!staff) {
        return res.status(401).json({ error: 'Invalid PIN' });
      }

      res.json({
        id: staff.id,
        name: staff.name,
        role: staff.role,
        permissions: JSON.parse(staff.permissions || '[]')
      });
    } catch (e) {
      console.error('[LAN LOGIN ERROR]', e);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // MENU
  app.get('/lan/menu', (_, res) => {
    try {
      const categories = dbManager.db
        .prepare('SELECT * FROM categories ORDER BY sort_order')
        .all();

      const products = dbManager.db
        .prepare('SELECT * FROM products')
        .all();

      const menu = categories.map(c => ({
        ...c,
        products: products.filter(p => p.category_id === c.id)
      }));

      res.json(menu);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // FLOORS
  app.get('/lan/floors', (_, res) => {
    try {
      const floors = dbManager.getFloors();
      res.json(floors);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ORDERS (CLIENT → HOST)
  app.post('/lan/order', (req, res) => {
    const order = req.body;
    console.log('[LAN] Order received:', order);

    // TODO: dbManager.saveOrder(order);
    io.emit('new-kot', order);

    res.json({
      success: true,
      orderId: `ORD_${Date.now()}`
    });
  });

  /* =======================
     SOCKET.IO EVENTS
     ======================= */
  io.on('connection', socket => {
    console.log('[LAN] Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('[LAN] Client disconnected:', socket.id);
    });
  });

  /* =======================
     START HTTP SERVER
     ======================= */
  server.listen(LAN_PORT, () => {
    console.log(
      `[HOST] Local server running at http://${ip.address()}:${LAN_PORT}`
    );
  });

  /* =======================
     UDP DISCOVERY (AUTO)
     ======================= */
  udpServer = dgram.createSocket('udp4');

  udpServer.on('message', (msg, rinfo) => {
    if (msg.toString() === 'DISCOVER_SYNROVA_POS') {
      const response = JSON.stringify({
        role: 'HOST',
        ip: ip.address(),
        port: LAN_PORT
      });

      udpServer.send(response, rinfo.port, rinfo.address);
    }
  });

  udpServer.bind(LAN_PORT, () => {
    udpServer.setBroadcast(true);
    console.log('[HOST] UDP discovery enabled');
  });

  return {
    ip: ip.address(),
    port: LAN_PORT
  };
}

module.exports = { startLocalServer };
