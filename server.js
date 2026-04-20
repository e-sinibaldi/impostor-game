const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const WORDS = [
  'Beach','Airport','Bank','Hospital','Hotel','Library','Museum','Restaurant',
  'School','Supermarket','Zoo','Cinema','Gym','Police Station','Train Station',
  'Casino','Farm','Space Station','Submarine','Pirate Ship','Medieval Castle',
  'Circus','Embassy','Military Base','Cruise Ship','Spa','Cathedral','Stadium',
  'Prison','Vineyard','Antarctic Base','Amusement Park','Volcano','Jungle',
  'Ski Resort','Chocolate Factory','Haunted House','Underwater Lab','Desert Island'
];

const rooms = {};

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function broadcastRoom(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit('room-update', {
    code,
    players: room.players.map(p => p.name),
    started: room.started
  });
}

io.on('connection', (socket) => {

  socket.on('create-room', () => {
    let code;
    do { code = randomCode(); } while (rooms[code]);
    rooms[code] = { players: [], started: false };
    socket.emit('room-created', { code });
  });

  socket.on('join-room', ({ name, code }) => {
    name = String(name).trim().slice(0, 20);
    code = String(code).trim().toUpperCase().slice(0, 8);
    if (!name || !code) return;

    const room = rooms[code];
    if (!room) {
      socket.emit('error-msg', 'Room not found.');
      return;
    }
    if (room.started) {
      socket.emit('error-msg', 'Game already started.');
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
  }
  console.log(`Server running:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${localIP}:${PORT}`);
});
