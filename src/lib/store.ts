// In-memory store for serverless (persists between warm invocations)
// For production, replace with Redis/Upstash

export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  isDealer: boolean;
  bet: number;
}

export interface RoundResult {
  playerId: string;
  playerName: string;
  bet: number;
  outcome: string;
  multiplier: number;
  pnl: number;
}

export interface Round {
  number: number;
  results: RoundResult[];
  timestamp: string;
}

export interface Room {
  id: string;
  game: "21" | "niuniu";
  players: Player[];
  rounds: Round[];
  status: "waiting" | "playing" | "settled";
  currentRound: number;
  baseBet: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

// Global store — survives between warm Vercel invocations
const globalStore = globalThis as unknown as { __rooms?: Map<string, Room> };
if (!globalStore.__rooms) globalStore.__rooms = new Map();
const rooms = globalStore.__rooms;

export function getRoom(id: string): Room | undefined {
  return rooms.get(id.toUpperCase());
}

export function setRoom(room: Room) {
  room.updatedAt = new Date().toISOString();
  rooms.set(room.id, room);
}

export function deleteRoom(id: string) {
  rooms.delete(id);
}

export function genRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(id) ? genRoomId() : id;
}

export function genPlayerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function calculateSettlement(players: Player[]): Settlement[] {
  const debtors = players.filter(p => p.score < 0).map(p => ({ name: p.name, remaining: Math.abs(p.score) })).sort((a, b) => b.remaining - a.remaining);
  const creditors = players.filter(p => p.score > 0).map(p => ({ name: p.name, remaining: p.score })).sort((a, b) => b.remaining - a.remaining);
  const settlements: Settlement[] = [];
  let di = 0, ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].remaining, creditors[ci].remaining);
    if (amount > 0.01) {
      settlements.push({ from: debtors[di].name, to: creditors[ci].name, amount: Math.round(amount * 100) / 100 });
      debtors[di].remaining -= amount;
      creditors[ci].remaining -= amount;
    }
    if (debtors[di].remaining < 0.01) di++;
    if (creditors[ci].remaining < 0.01) ci++;
  }
  return settlements;
}
