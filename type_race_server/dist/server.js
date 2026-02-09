"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = __importDefault(require("./config/db"));
const User_1 = __importDefault(require("./models/User"));
dotenv_1.default.config();
// Connect to Database
(0, db_1.default)();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*", // Allow all origins for dev simplicity
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;
const rooms = {};
const players = {}; // Quick lookup by socket ID
// --- Helper Functions ---
const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
// --- Socket Events ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // Create Room
    socket.on('create_room', (data) => __awaiter(void 0, void 0, void 0, function* () {
        // DB: Create/Update User if needed (Simple upsert for now)
        if (process.env.MONGO_URI) {
            try {
                yield User_1.default.findOneAndUpdate({ username: data.username }, { $setOnInsert: { username: data.username } }, { upsert: true, new: true });
            }
            catch (err) {
                console.error("DB Error creating user:", err);
            }
        }
        const roomId = generateRoomId();
        const player = {
            id: socket.id,
            username: data.username,
            roomId,
            wpm: 0,
            progress: 0,
            isFinished: false
        };
        const room = {
            id: roomId,
            hostId: socket.id,
            players: [player],
            text: "The quick brown fox jumps over the lazy dog.", // Placeholder
            status: 'waiting'
        };
        rooms[roomId] = room;
        players[socket.id] = player;
        socket.join(roomId);
        socket.emit('room_created', { roomId });
        io.to(roomId).emit('room_update', { players: room.players });
        console.log(`Room created: ${roomId} by ${data.username}`);
    }));
    // Join Room
    socket.on('join_room', (data) => __awaiter(void 0, void 0, void 0, function* () {
        const room = rooms[data.roomId];
        if (!room) {
            socket.emit('room_error', { message: 'Room not found' });
            return;
        }
        if (room.status !== 'waiting') {
            socket.emit('room_error', { message: 'Race already in progress' });
            return;
        }
        // DB: Create/Update User
        if (process.env.MONGO_URI) {
            try {
                yield User_1.default.findOneAndUpdate({ username: data.username }, { $setOnInsert: { username: data.username } }, { upsert: true, new: true });
            }
            catch (err) {
                console.error("DB Error joining user:", err);
            }
        }
        const player = {
            id: socket.id,
            username: data.username,
            roomId: data.roomId,
            wpm: 0,
            progress: 0,
            isFinished: false
        };
        room.players.push(player);
        players[socket.id] = player;
        socket.join(data.roomId);
        socket.emit('room_joined', { roomId: data.roomId, players: room.players });
        io.to(data.roomId).emit('room_update', { players: room.players });
        console.log(`${data.username} joined room ${data.roomId}`);
    }));
    // Start Game
    socket.on('start_game', (data) => {
        const room = rooms[data.roomId];
        if (room && room.hostId === socket.id) {
            room.status = 'racing';
            // Start game for everyone in room
            io.to(data.roomId).emit('game_started', {
                matchId: room.id,
                text: room.text
            });
            console.log(`Game started in room ${data.roomId}`);
        }
    });
    // Update Progress
    socket.on('update_progress', (data) => __awaiter(void 0, void 0, void 0, function* () {
        const player = players[socket.id];
        if (player) {
            player.wpm = data.wpm;
            player.progress = data.progress;
            // Check for finish
            if (player.progress >= 1 && !player.isFinished) {
                player.isFinished = true;
                // DB: Update Stats
                if (process.env.MONGO_URI) {
                    try {
                        yield User_1.default.updateOne({ username: player.username }, {
                            $inc: { racesCompleted: 1 },
                            $max: { bestWPM: player.wpm },
                            // Note: Avg WPM logic requires more complex query, skipping for MVP
                        });
                    }
                    catch (err) {
                        console.error("DB Error updating stats:", err);
                    }
                }
            }
            // Broadcast to room (exclude sender to save bandwidth? or include for sync?)
            // Usually we broadcast to everyone so they see live updates
            socket.to(player.roomId).emit('opponent_progress', {
                playerId: socket.id,
                wpm: player.wpm,
                progress: player.progress
            });
        }
    }));
    // Disconnect
    socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`User disconnected: ${socket.id}`);
        const player = players[socket.id];
        if (player) {
            const room = rooms[player.roomId];
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) {
                    delete rooms[player.roomId]; // Clean up empty room
                }
                else {
                    io.to(player.roomId).emit('room_update', { players: room.players });
                    // Handle Host migration if needed
                }
            }
            delete players[socket.id];
        }
    }));
});
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
