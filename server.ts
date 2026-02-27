import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = 3002;

// ─── In-memory state ───
interface Player {
  id: string;
  socketId: string;
  name: string;
  score: number;
  isHost: boolean;
  isDealer: boolean;
  connected: boolean;
}

interface RoundResult {
  playerId: string;
  playerName: string;
  bet: number;
  outcome: string;
  multiplier: number;
  pnl: number;
}

interface Round {
  number: number;
  results: RoundResult[];
  timestamp: string;
}

interface Room {
  id: string;
  game: "21" | "niuniu";
  players: Player[];
  rounds: Round[];
  status: "waiting" | "playing" | "settled";
  currentRound: number;
  baseBet: number;
  createdAt: string;
}

const rooms = new Map<string, Room>();

function genRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? genRoomId() : id;
}

function genPlayerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function calculateSettlement(players: Player[]): { from: string; to: string; amount: number }[] {
  const balances = players.map((p) => ({ name: p.name, balance: p.score }));
  const debtors = balances.filter((b) => b.balance < 0).sort((a, b) => a.balance - b.balance);
  const creditors = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
  const settlements: { from: string; to: string; amount: number }[] = [];

  let di = 0, ci = 0;
  const d = debtors.map((x) => ({ ...x, remaining: Math.abs(x.balance) }));
  const c = creditors.map((x) => ({ ...x, remaining: x.balance }));

  while (di < d.length && ci < c.length) {
    const amount = Math.min(d[di].remaining, c[ci].remaining);
    if (amount > 0) {
      settlements.push({ from: d[di].name, to: c[ci].name, amount: Math.round(amount * 100) / 100 });
      d[di].remaining -= amount;
      c[ci].remaining -= amount;
    }
    if (d[di].remaining < 0.01) di++;
    if (c[ci].remaining < 0.01) ci++;
  }
  return settlements;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // ─── Create Room ───
    socket.on("create-room", ({ game, playerName, baseBet }: { game: "21" | "niuniu"; playerName: string; baseBet: number }, cb) => {
      const roomId = genRoomId();
      const playerId = genPlayerId();
      const player: Player = {
        id: playerId, socketId: socket.id, name: playerName,
        score: 0, isHost: true, isDealer: false, connected: true,
      };
      const room: Room = {
        id: roomId, game, players: [player], rounds: [],
        status: "waiting", currentRound: 0, baseBet: baseBet || 10,
        createdAt: new Date().toISOString(),
      };
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.data = { roomId, playerId };
      cb({ success: true, roomId, playerId, room });
    });

    // ─── Join Room ───
    socket.on("join-room", ({ roomId, playerName }: { roomId: string; playerName: string }, cb) => {
      const room = rooms.get(roomId.toUpperCase());
      if (!room) return cb({ success: false, error: "Room not found" });
      if (room.status === "settled") return cb({ success: false, error: "Room already settled" });
      const existingPlayer = room.players.find((p) => p.name === playerName);
      if (existingPlayer) {
        // Reconnect: update socket, return existing player
        existingPlayer.socketId = socket.id;
        existingPlayer.connected = true;
        socket.join(room.id);
        socket.data = { roomId: room.id, playerId: existingPlayer.id };
        cb({ success: true, roomId: room.id, playerId: existingPlayer.id, room, reconnected: true });
        io.to(room.id).emit("room-state", room);
        return;
      }

      const playerId = genPlayerId();
      const player: Player = {
        id: playerId, socketId: socket.id, name: playerName,
        score: 0, isHost: false, isDealer: false, connected: true,
      };
      room.players.push(player);
      socket.join(room.id);
      socket.data = { roomId: room.id, playerId };
      cb({ success: true, roomId: room.id, playerId, room });
      io.to(room.id).emit("room-state", room);
    });

    // ─── Transfer Host ───
    socket.on("transfer-host", ({ targetPlayerId }: { targetPlayerId: string }, cb) => {
      const room = rooms.get(socket.data?.roomId);
      if (!room) return cb?.({ success: false });
      const caller = room.players.find((p) => p.id === socket.data?.playerId);
      if (!caller?.isHost) return cb?.({ success: false, error: "Not host" });
      const target = room.players.find((p) => p.id === targetPlayerId);
      if (!target) return cb?.({ success: false, error: "Player not found" });
      caller.isHost = false;
      target.isHost = true;
      cb?.({ success: true });
      io.to(room.id).emit("room-state", room);
      io.to(room.id).emit("notification", { message: `${target.name} is now the host` });
    });

    // ─── Set Dealer ───
    socket.on("set-dealer", ({ targetPlayerId }: { targetPlayerId: string }, cb) => {
      const room = rooms.get(socket.data?.roomId);
      if (!room) return cb?.({ success: false });
      const caller = room.players.find((p) => p.id === socket.data?.playerId);
      if (!caller?.isHost) return cb?.({ success: false, error: "Not host" });
      room.players.forEach((p) => (p.isDealer = p.id === targetPlayerId));
      cb?.({ success: true });
      io.to(room.id).emit("room-state", room);
    });

    // ─── Start Round ───
    socket.on("start-round", (_, cb) => {
      const room = rooms.get(socket.data?.roomId);
      if (!room) return cb?.({ success: false });
      const caller = room.players.find((p) => p.id === socket.data?.playerId);
      if (!caller?.isHost) return cb?.({ success: false, error: "Not host" });
      room.status = "playing";
      room.currentRound++;
      room.rounds.push({ number: room.currentRound, results: [], timestamp: new Date().toISOString() });
      cb?.({ success: true, roundNumber: room.currentRound });
      io.to(room.id).emit("room-state", room);
      io.to(room.id).emit("round-started", { roundNumber: room.currentRound });
    });

    // ─── Submit Round Result (host submits for all players) ───
    socket.on("submit-results", ({ results }: { results: RoundResult[] }, cb) => {
      const room = rooms.get(socket.data?.roomId);
      if (!room) return cb?.({ success: false });
      const caller = room.players.find((p) => p.id === socket.data?.playerId);
      if (!caller?.isHost) return cb?.({ success: false, error: "Not host" });
      
      const round = room.rounds[room.rounds.length - 1];
      if (!round) return cb?.({ success: false, error: "No active round" });
      
      // Auto-add dealer inverse if not already included
      const dealer = room.players.find((p) => p.isDealer);
      if (dealer && !results.find((r) => r.playerId === dealer.id)) {
        const dealerPnl = -results.reduce((s, r) => s + r.pnl, 0);
        results.push({
          playerId: dealer.id, playerName: dealer.name,
          bet: 0, outcome: "Dealer", multiplier: 1,
          pnl: Math.round(dealerPnl * 100) / 100,
        });
      }

      round.results = results;
      
      // Update scores
      for (const r of results) {
        const player = room.players.find((p) => p.id === r.playerId);
        if (player) {
          player.score += r.pnl;
          player.score = Math.round(player.score * 100) / 100;
        }
      }
      
      room.status = "waiting";
      cb?.({ success: true });
      io.to(room.id).emit("room-state", room);
      io.to(room.id).emit("round-ended", { roundNumber: round.number, results });
    });

    // ─── Adjust Score (host manual) ───
    socket.on("adjust-score", ({ targetPlayerId, amount, reason }: { targetPlayerId: string; amount: number; reason?: string }, cb) => {
      const room = rooms.get(socket.data?.roomId);
      if (!room) return cb?.({ success: false });
      const caller = room.players.find((p) => p.id === socket.data?.playerId);
      if (!caller?.isHost) return cb?.({ success: false, error: "Not host" });
      const target = room.players.find((p) => p.id === targetPlayerId);
      if (!target) return cb?.({ success: false, error: "Player not found" });
      target.score += amount;
      target.score = Math.round(target.score * 100) / 100;
      cb?.({ success: true });
      io.to(room.id).emit("room-state", room);
      io.to(room.id).emit("notification", { message: `${target.name} score adjusted by ${amount > 0 ? "+" : ""}${amount}${reason ? ` (${reason})` : ""}` });
    });

    // ─── End Session ───
    socket.on("end-session", (_, cb) => {
      const room = rooms.get(socket.data?.roomId);
      if (!room) return cb?.({ success: false });
      const caller = room.players.find((p) => p.id === socket.data?.playerId);
      if (!caller?.isHost) return cb?.({ success: false, error: "Not host" });
      room.status = "settled";
      const settlements = calculateSettlement(room.players);
      cb?.({ success: true, settlements });
      io.to(room.id).emit("room-state", room);
      io.to(room.id).emit("session-settled", { settlements });
    });

    // ─── Kick Player ───
    socket.on("kick-player", ({ targetPlayerId }: { targetPlayerId: string }, cb) => {
      const room = rooms.get(socket.data?.roomId);
      if (!room) return cb?.({ success: false });
      const caller = room.players.find((p) => p.id === socket.data?.playerId);
      if (!caller?.isHost) return cb?.({ success: false, error: "Not host" });
      const idx = room.players.findIndex((p) => p.id === targetPlayerId);
      if (idx === -1) return cb?.({ success: false });
      const kicked = room.players.splice(idx, 1)[0];
      cb?.({ success: true });
      io.to(room.id).emit("room-state", room);
      io.to(room.id).emit("notification", { message: `${kicked.name} was kicked` });
    });

    // ─── Get Room State ───
    socket.on("get-room", (_, cb) => {
      const room = rooms.get(socket.data?.roomId);
      cb?.({ success: !!room, room });
    });

    // ─── Disconnect ───
    socket.on("disconnect", () => {
      const { roomId, playerId } = socket.data || {};
      if (roomId && playerId) {
        const room = rooms.get(roomId);
        if (room) {
          const player = room.players.find((p) => p.id === playerId);
          if (player) player.connected = false;
          io.to(roomId).emit("room-state", room);
        }
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`> Gambling Calculator running on http://localhost:${PORT}`);
  });
});
