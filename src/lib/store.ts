import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// File-based persistence so rooms survive PM2 restarts
const STORE_PATH = join(process.cwd(), "data", "rooms.json");

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

// In-memory cache backed by file
let rooms: Map<string, Room>;
let dirty = false;

function loadRooms(): Map<string, Room> {
  try {
    if (existsSync(STORE_PATH)) {
      const data = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
      const map = new Map<string, Room>();
      for (const [k, v] of Object.entries(data)) {
        map.set(k, v as Room);
      }
      return map;
    }
  } catch { /* ignore corrupt file */ }
  return new Map();
}

function persistRooms() {
  if (!dirty) return;
  try {
    const dir = join(process.cwd(), "data");
    if (!existsSync(dir)) {
      const { mkdirSync } = require("fs");
      mkdirSync(dir, { recursive: true });
    }
    const obj: Record<string, Room> = {};
    rooms.forEach((v, k) => { obj[k] = v; });
    writeFileSync(STORE_PATH, JSON.stringify(obj));
    dirty = false;
  } catch (e) {
    console.error("[store] persist error:", e);
  }
}

// Auto-persist every 2 seconds if dirty
function initPersist() {
  setInterval(persistRooms, 2000);
}

// Lazy init
function getRooms(): Map<string, Room> {
  if (!rooms) {
    rooms = loadRooms();
    initPersist();
  }
  return rooms;
}

export function getRoom(id: string): Room | undefined {
  return getRooms().get(id.toUpperCase());
}

export function setRoom(room: Room) {
  room.updatedAt = new Date().toISOString();
  getRooms().set(room.id, room);
  dirty = true;
}

export function deleteRoom(id: string) {
  getRooms().delete(id);
  dirty = true;
}

export function genRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return getRooms().has(id) ? genRoomId() : id;
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
