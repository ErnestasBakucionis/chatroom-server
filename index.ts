import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
const app = express();
app.use(cors());
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

type Room = {
  code: string;
  users: string[];
  messages?: Message[];
};

type ConnectedUser = {
  userId: string;
  username: string;
};
type Message = {
  username: string;
  message: string;
  code: string;
};

const createdRooms = new Map<string, Room>();
const connectedUsersMap = new Map<string, ConnectedUser[]>();
const userIdSocketIdMap = new Map<string, string>();

io.on("connect", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("associateSocketId", ({ userId }) => {
    console.log(`User ${userId} associated with socket ${socket.id}`);
    userIdSocketIdMap.set(userId, socket.id);
    console.log("Mapas:", userIdSocketIdMap);
  });

  socket.on("handleSendMessage", ({ username, message, code }: Message) => {
    console.log(`Message sent by ${username} in room ${code}: ${message}`);
    const room = createdRooms.get(code);
    if (room) {
      const newMessage = { username, message, code };
      if (!room.messages) {
        room.messages = [{ username, message, code }];
      } else {
        room.messages.push({ username, message, code });
      }
    }
    socket.broadcast.emit("handleSendMessage", { username, message, code });
  });

  socket.on(
    "typing",
    ({ username, code }: { username: string; code: string }) => {
      console.log(`${username} is typing in room ${code}`);
      socket.broadcast.emit("typing", { username, code });
    }
  );

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const disconnectedUserId = userIdSocketIdMap.get(socket.id);
    if (disconnectedUserId) {
      if (connectedUsersMap.has(disconnectedUserId)) {
        connectedUsersMap.delete(disconnectedUserId);
        console.log(
          `User disconnected and removed from connectedUsersMap: ${disconnectedUserId}`
        );
      } else {
        console.log(
          `User not found in connectedUsersMap: ${disconnectedUserId}`
        );
      }
    }
  });
});

app.get("/api/connectedUsers/:roomCode", (req, res) => {
  const roomCode = req.params.roomCode;
  console.log(`API request received: Get connected users for room ${roomCode}`);
  const connectedUsers = getConnectedUsers(roomCode);
  res.json({ users: connectedUsers });
});

app.get("/api/roomMessages/:roomCode", (req, res) => {
  const roomCode = req.params.roomCode;
  console.log(`API request received: Get messages for room ${roomCode}`);
  const room = createdRooms.get(roomCode);
  res.json({ roomMessages: room?.messages });
});

app.post("/api/createRoom", (req, res) => {
  const { userId, username } = req.body;
  console.log(`API request received: Create room for user ${userId}`);
  if (userId && username) {
    const roomCode = generateChatRoomCode();
    const room: Room = {
      code: roomCode,
      users: [userId],
    };
    createdRooms.set(roomCode, room);
    const connectedUsers = getConnectedUsers(roomCode);
    connectedUsers.push({ userId, username });
    connectedUsersMap.set(roomCode, connectedUsers);
    res.json({ roomCode });
  } else {
    res.status(404).json({ error: `Room creator identity is not provided.` });
  }
});

app.post("/api/joinRoom", (req, res) => {
  const { username, userId, roomCode } = req.body;
  console.log(`API request received: User ${userId} joining room ${roomCode}`);
  if (username && userId && roomCode) {
    const room = createdRooms.get(roomCode);
    if (room) {
      room.users.push(userId);
      const connectedUsers = getConnectedUsers(roomCode);
      connectedUsers.push({ userId, username });
      connectedUsersMap.set(roomCode, connectedUsers);
      io.emit("updatedUsers", {
        code: roomCode,
        users: connectedUsers,
        newUser: username,
      });
      res.sendStatus(200);
    } else {
      res.status(404).json({ error: `Room ${roomCode} does not exist.` });
    }
  } else {
    res.status(404).json({ error: `Not enough arguments provided` });
  }
});

function generateChatRoomCode(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substr(2, 5);
  const roomCode = `${timestamp}-${randomStr}`;
  console.log(`Generated room code: ${roomCode}`);
  return roomCode;
}

function getConnectedUsers(roomCode: string): ConnectedUser[] {
  const connectedUsers = connectedUsersMap.get(roomCode) || [];
  console.log(`Connected users in room ${roomCode}:`, connectedUsers);
  return connectedUsers;
}

httpServer.listen(3001, () => {
  console.log("Server listening on port 3001");
});
