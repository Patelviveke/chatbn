const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "../frontend")));

const waitingBoys = [];
const waitingGirls = [];
const activeRooms = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // Step 1 — user pehli baar join karta hai (waiting.html se)
  socket.on("join", (data) => {
    socket.username = data.username;
    socket.gender = data.gender;
    socket.inChat = false;
    console.log(`JOIN: ${data.username} (${data.gender})`);
    findMatch(socket);
  });

  // Step 2 — user chat page pe already match ho chuka hai, sirf room rejoin karo
  socket.on("rejoin_chat", (data) => {
    socket.username = data.username;
    socket.gender = data.gender;
    socket.roomId = data.roomId;
    socket.inChat = true;

    if (data.roomId) {
      socket.join(data.roomId);

      // Room track karo
      if (!activeRooms[data.roomId]) {
        activeRooms[data.roomId] = { users: [] };
      }
      if (!activeRooms[data.roomId].users.includes(socket.id)) {
        activeRooms[data.roomId].users.push(socket.id);
      }

      console.log(`REJOIN: ${data.username} rejoined room ${data.roomId}`);
    }
  });

  // Message bhejo sirf room ke partner ko
  socket.on("message", (msg) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("message", {
        text: msg,
        sender: socket.username,
        time: new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit"
        })
      });
    }
  });

  // Skip — current chat chhodo, naya match dhundho
  socket.on("skip", () => {
    socket.inChat = false;
    leaveRoom(socket);
    findMatch(socket);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`DISCONNECT: ${socket.username || socket.id}`);
    leaveRoom(socket);
    removeFromQueue(socket);
  });
});

function findMatch(socket) {
  const gender = socket.gender;

  if (gender === "boy") {
    if (waitingGirls.length > 0) {
      const partner = waitingGirls.shift();
      createRoom(socket, partner);
    } else {
      waitingBoys.push(socket);
      socket.emit("waiting", { message: "Ladki dhundh rahe hain..." });
    }
  } else if (gender === "girl") {
    if (waitingBoys.length > 0) {
      const partner = waitingBoys.shift();
      createRoom(socket, partner);
    } else {
      waitingGirls.push(socket);
      socket.emit("waiting", { message: "Ladka dhundh rahe hain..." });
    }
  }
}

function createRoom(socket1, socket2) {
  const roomId = `room_${Date.now()}`;

  socket1.roomId = roomId;
  socket2.roomId = roomId;
  socket1.inChat = true;
  socket2.inChat = true;

  socket1.join(roomId);
  socket2.join(roomId);

  activeRooms[roomId] = {
    users: [socket1.id, socket2.id]
  };

  socket1.emit("matched", {
    partnerName: socket2.username,
    partnerGender: socket2.gender,
    roomId: roomId
  });

  socket2.emit("matched", {
    partnerName: socket1.username,
    partnerGender: socket1.gender,
    roomId: roomId
  });

  console.log(`MATCHED: ${socket1.username} <-> ${socket2.username} in ${roomId}`);
}

function leaveRoom(socket) {
  const roomId = socket.roomId;
  if (!roomId) return;

  // Partner ko batao
  socket.to(roomId).emit("partnerLeft", {
    message: "Partner ne chat chhod di. Naya match dhundh rahe hain..."
  });

  // Dusre user ka roomId clear karo aur unhe wapas matching mein daalo
  const room = io.sockets.adapter.rooms.get(roomId);
  if (room) {
    room.forEach((sid) => {
      const other = io.sockets.sockets.get(sid);
      if (other && other.id !== socket.id) {
        other.leave(roomId);
        other.roomId = null;
        other.inChat = false;
        // Sirf tab match dhundho agar wo bhi skip ya disconnect pe hai
        // (partnerLeft event se wo khud decide karega)
      }
    });
  }

  socket.leave(roomId);
  socket.roomId = null;
  delete activeRooms[roomId];

  console.log(`ROOM DELETED: ${roomId}`);
}

function removeFromQueue(socket) {
  const bi = waitingBoys.indexOf(socket);
  if (bi !== -1) waitingBoys.splice(bi, 1);

  const gi = waitingGirls.indexOf(socket);
  if (gi !== -1) waitingGirls.splice(gi, 1);
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});