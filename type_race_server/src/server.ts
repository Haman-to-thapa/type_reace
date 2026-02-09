import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import User from './models/User';

dotenv.config();
connectDB();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

interface Player {
    id: string;
    username: string;
    roomId: string;
    wpm: number;
    progress: number;
    isFinished: boolean;
}

interface Room {
    id: string;
    hostId: string;
    players: Player[];
    text: string;
    status: 'waiting' | 'racing' | 'finished';
}

const rooms: Record<string, Room> = {};
const players: Record<string, Player> = {};
const waitingQueue: string[] = [];

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const textLibrary = [
    "The quick brown fox jumps over the lazy dog in a race to the finish line.",
    "Practice makes perfect when it comes to typing speed and accuracy in modern applications.",
    "React Native allows developers to build high-performance mobile apps using a single codebase.",
    "Artificial intelligence is transforming the way we interact with technology and solve complex problems.",
    "MobileType GO is a fun way to improve your keyboard skills while competing against others worldwide.",
    "Consistency and focus are the keys to mastering any new skill in the digital age.",
    "Shadows danced across the ancient walls as the moonlight filtered through the window panes.",
    "The aroma of fresh coffee filled the room, awakening my senses for a long night of coding.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "Programming is the art of telling another human what one wants the computer to do."
];

const getRandomText = () => textLibrary[Math.floor(Math.random() * textLibrary.length)];

io.on('connection', (socket) => {
    socket.on('join_queue', async (data: { username: string }) => {
        if (process.env.MONGO_URI) {
            try {
                await User.findOneAndUpdate(
                    { username: data.username },
                    { $setOnInsert: { username: data.username } },
                    { upsert: true, new: true }
                );
            } catch (err) {
            }
        }

        players[socket.id] = {
            id: socket.id,
            username: data.username || `Player_${socket.id.substring(0, 4)}`,
            roomId: '',
            wpm: 0,
            progress: 0,
            isFinished: false
        };

        if (waitingQueue.length > 0) {
            const p2Id = waitingQueue.shift()!;
            const p1Id = socket.id;
            const roomId = generateRoomId();
            const p1 = players[p1Id];
            const p2 = players[p2Id];

            if (p1 && p2) {
                p1.roomId = roomId;
                p2.roomId = roomId;
                const room: Room = {
                    id: roomId,
                    hostId: p1Id,
                    players: [p1, p2],
                    text: getRandomText(),
                    status: 'racing'
                };
                rooms[roomId] = room;
                const p1Socket = io.sockets.sockets.get(p1Id);
                const p2Socket = io.sockets.sockets.get(p2Id);
                if (p1Socket) p1Socket.join(roomId);
                if (p2Socket) p2Socket.join(roomId);
                io.to(roomId).emit('match_found', {
                    matchId: roomId,
                    text: room.text,
                    players: room.players
                });
            }
        } else {
            waitingQueue.push(socket.id);
            setTimeout(() => {
                const index = waitingQueue.indexOf(socket.id);
                if (index !== -1) {
                    waitingQueue.splice(index, 1);
                    const p1Id = socket.id;
                    const p1 = players[p1Id];
                    if (!p1) return;
                    const roomId = generateRoomId();
                    p1.roomId = roomId;
                    const bot: Player = {
                        id: 'bot_match_ai',
                        username: 'Grok Bot (AI)',
                        roomId,
                        wpm: 0,
                        progress: 0,
                        isFinished: false
                    };
                    const room: Room = {
                        id: roomId,
                        hostId: p1Id,
                        players: [p1, bot],
                        text: getRandomText(),
                        status: 'racing'
                    };
                    rooms[roomId] = room;
                    socket.join(roomId);
                    socket.emit('match_found', {
                        matchId: roomId,
                        text: room.text,
                        players: room.players
                    });

                    let currentWordsTyped = 0;
                    const totalWords = room.text.length / 5;
                    const botWpm = 35 + Math.random() * 25;
                    const interval = setInterval(() => {
                        if (room.status !== 'racing' || !rooms[roomId]) {
                            clearInterval(interval);
                            return;
                        }
                        currentWordsTyped += (botWpm / 60) * 0.5;
                        const progress = Math.min(100, Math.round((currentWordsTyped / totalWords) * 100));
                        socket.emit('opponent_progress', {
                            playerId: 'bot_match_ai',
                            username: bot.username,
                            wpm: Math.round(botWpm),
                            progress: progress
                        });
                        if (progress >= 100) clearInterval(interval);
                    }, 500);
                }
            }, 5000);
        }
    });

    socket.on('create_room', async (data: { username: string }) => {
        if (process.env.MONGO_URI) {
            try {
                await User.findOneAndUpdate(
                    { username: data.username },
                    { $setOnInsert: { username: data.username } },
                    { upsert: true, new: true }
                );
            } catch (err) {
            }
        }
        const roomId = generateRoomId();
        const player: Player = {
            id: socket.id,
            username: data.username || `Guest_${socket.id.substring(0, 4)}`,
            roomId,
            wpm: 0,
            progress: 0,
            isFinished: false
        };
        const room: Room = {
            id: roomId,
            hostId: socket.id,
            players: [player],
            text: getRandomText(),
            status: 'waiting'
        };
        rooms[roomId] = room;
        players[socket.id] = player;
        socket.join(roomId);
        socket.emit('room_created', { roomId });
        io.to(roomId).emit('room_update', { players: room.players });
    });

    socket.on('join_room', async (data: { roomId: string, username: string }) => {
        const room = rooms[data.roomId];
        if (!room) {
            socket.emit('room_error', { message: 'Room not found' });
            return;
        }
        if (room.status !== 'waiting') {
            socket.emit('room_error', { message: 'Race already in progress' });
            return;
        }
        if (process.env.MONGO_URI) {
            try {
                await User.findOneAndUpdate(
                    { username: data.username },
                    { $setOnInsert: { username: data.username } },
                    { upsert: true, new: true }
                );
            } catch (err) {
            }
        }
        const player: Player = {
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
    });

    socket.on('start_game', (data: { roomId: string }) => {
        const room = rooms[data.roomId];
        if (room && room.hostId === socket.id) {
            room.status = 'racing';
            io.to(data.roomId).emit('game_started', {
                matchId: room.id,
                text: room.text
            });
        }
    });

    socket.on('update_progress', async (data: { wpm: number, progress: number }) => {
        const player = players[socket.id];
        if (player) {
            player.wpm = data.wpm;
            player.progress = data.progress;
            if (player.progress >= 1 && !player.isFinished) {
                player.isFinished = true;
                if (process.env.MONGO_URI) {
                    try {
                        await User.updateOne(
                            { username: player.username },
                            {
                                $inc: { racesCompleted: 1 },
                                $max: { bestWPM: player.wpm },
                            }
                        );
                    } catch (err) {
                    }
                }
            }
            socket.to(player.roomId).emit('opponent_progress', {
                playerId: socket.id,
                username: player.username,
                wpm: player.wpm,
                progress: player.progress
            });
        }
    });

    socket.on('disconnect', async () => {
        const player = players[socket.id];
        if (player) {
            const room = rooms[player.roomId];
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                if (room.players.length === 0) {
                    delete rooms[player.roomId];
                } else {
                    io.to(player.roomId).emit('room_update', { players: room.players });
                }
            }
            delete players[socket.id];
        }
    });
});

server.listen(PORT, () => {
});
