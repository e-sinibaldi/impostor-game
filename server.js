const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/qr', async (req, res) => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
  }
  const url = `http://${localIP}:${PORT}`;
  const svg = await QRCode.toString(url, { type: 'svg', width: 300, margin: 2 });
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Join Impostor Game</title>
    <style>
      body{background:#0f0f1a;color:#eee;font-family:system-ui;display:flex;flex-direction:column;
        align-items:center;justify-content:center;min-height:100vh;gap:1.5rem;padding:2rem;}
      h1{font-size:1.8rem;letter-spacing:2px;}
      .qr{background:#fff;padding:16px;border-radius:16px;}
      .url{font-size:1.2rem;color:#a78bfa;font-weight:700;letter-spacing:1px;}
      p{color:#888;font-size:0.9rem;}
    </style></head><body>
    <h1>🕵️ IMPOSTOR</h1>
    <div class="qr">${svg}</div>
    <div class="url">${url}</div>
    <p>Scan QR or type URL — same WiFi required</p>
  </body></html>`);
});

const WORDS = [
  'Beach','Airport','Bank','Hospital','Hotel','Library','Museum','Restaurant',
  'School','Supermarket','Zoo','Cinema','Gym','Police Station','Train Station',
  'Casino','Farm','Space Station','Submarine','Pirate Ship','Medieval Castle',
  'Circus','Embassy','Military Base','Cruise Ship','Spa','Cathedral','Stadium',
  'Prison','Vineyard','Antarctic Base','Amusement Park','Volcano','Jungle',
  'Ski Resort','Chocolate Factory','Haunted House','Underwater Lab','Desert Island'
];

// rooms[code] = { players: [{id, name}], started: false }
const rooms = {};

function getRoom(code) {
  if (!rooms[code]) rooms[code] = { players: [], started: false };
  return rooms[code];
}

function broadcastRoom(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit('room-update', {
    players: room.players.map(p => p.name),
    started: room.started
  });
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ name, code }) => {
    name = String(name).trim().slice(0, 20);
    code = String(code).trim().toUpperCase().slice(0, 8);
    if (!name || !code) return;

    const room = getRoom(code);
    if (room.started) {
      socket.emit('error-msg', 'Game already started in this room.');
      return;
    }
    if (room.players.find(p => p.id === socket.id)) return;

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = name;
    room.players.push({ id: socket.id, name });
    broadcastRoom(code);
  });

  socket.on('start-game', () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms[code];
    if (!room || room.started) return;
    if (room.players.length < 2) {
      socket.emit('error-msg', 'Need at least 2 players.');
      return;
    }
    // Only first player (host) can start
    if (room.players[0].id !== socket.id) {
      socket.emit('error-msg', 'Only the host can start.');
      return;
    }

    room.started = true;
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const impostorIndex = Math.floor(Math.random() * room.players.length);

    room.players.forEach((player, i) => {
      io.to(player.id).emit('game-start', {
        word: i === impostorIndex ? 'IMPOSTOR' : word,
        isImpostor: i === impostorIndex,
        playerCount: room.players.length
      });
    });

    broadcastRoom(code);
  });

  socket.on('reset-game', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    if (room.players[0]?.id !== socket.id) return;
    room.started = false;
    broadcastRoom(code);
    io.to(code).emit('game-reset');
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
    if (rooms[code].players.length === 0) {
      delete rooms[code];
    } else {
      broadcastRoom(code);
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }

  console.log(`Server running:`);
  console.log(`  QR code:  http://localhost:${PORT}/qr  <-- open this, show phones`);
  console.log(`  Network:  http://${localIP}:${PORT}`);
});
