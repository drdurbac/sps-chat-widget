const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 3000;
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');
const DB_PATH = process.env.CHAT_DB_PATH || path.join(__dirname, 'chat.db');

const app = express();
app.use(express.json());

const allowedOrigin = process.env.CHAT_CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CHAT_CORS_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const db = new sqlite3.Database(DB_PATH);

function initDb() {
  db.serialize(() => {
    db.run(
      'CREATE TABLE IF NOT EXISTS chat_rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)'
    );
    db.run(
      'CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL, username TEXT NOT NULL, message TEXT NOT NULL, created_at DATETIME NOT NULL)'
    );
    db.get('SELECT COUNT(*) AS cnt FROM chat_rooms', (err, row) => {
      if (!err && row && row.cnt === 0) {
        db.run('INSERT INTO chat_rooms (name) VALUES (?)', ['General']);
      }
    });
  });
}

function now() {
  const d = new Date();
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true });
});

router.get('/rooms', (req, res) => {
  db.all('SELECT id, name FROM chat_rooms ORDER BY name ASC', (err, rows) => {
    if (err) return res.status(500).json({ ok: false });
    res.json({ rooms: rows || [] });
  });
});

router.get('/messages', (req, res) => {
  const roomId = parseInt(req.query.room_id || '0', 10);
  const afterId = parseInt(req.query.after_id || '0', 10);
  if (!roomId) return res.json({ messages: [] });

  const params = [roomId];
  let sql = 'SELECT id, room_id, username, message, created_at FROM chat_messages WHERE room_id = ?';
  if (afterId) {
    sql += ' AND id > ?';
    params.push(afterId);
  }
  sql += ' ORDER BY id ASC LIMIT 200';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ messages: [] });
    res.json({ messages: rows || [] });
  });
});

router.post('/messages', (req, res) => {
  let roomId = parseInt(req.body.room_id || '0', 10);
  let username = String(req.body.username || '').trim().slice(0, 64);
  const message = String(req.body.message || '').trim().slice(0, 2000);
  if (!message) return res.status(400).json({ ok: false, reason: 'empty_message' });

  if (!username) {
    username = 'user';
  }

  const insertMessage = (rid) => {
    const createdAt = now();
    db.run(
      'INSERT INTO chat_messages (room_id, username, message, created_at) VALUES (?, ?, ?, ?)',
      [rid, username, message, createdAt],
      function(err) {
        if (err) return res.status(500).json({ ok: false });
        const payload = {
          id: this.lastID,
          room_id: rid,
          username,
          message,
          created_at: createdAt
        };
        io.to(String(rid)).emit('chat:new', payload);
        res.json({ ok: true, message: payload });
      }
    );
  };

  if (roomId) {
    return insertMessage(roomId);
  }

  db.get('SELECT id FROM chat_rooms ORDER BY id ASC LIMIT 1', (err, row) => {
    if (err || !row) return res.status(500).json({ ok: false });
    insertMessage(row.id);
  });
});

router.get('/widget.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  fs.createReadStream(path.join(__dirname, 'public/widget.js')).pipe(res);
});

router.get('/widget.css', (req, res) => {
  res.set('Content-Type', 'text/css');
  fs.createReadStream(path.join(__dirname, 'public/widget.css')).pipe(res);
});

app.use(BASE_PATH, router);

io.on('connection', (socket) => {
  socket.on('chat:join', (roomId) => {
    const id = String(roomId || '');
    if (id) socket.join(id);
  });
});

initDb();

server.listen(PORT, () => {
  console.log(`Chat server listening on ${PORT} (base path: ${BASE_PATH || '/'})`);
});
