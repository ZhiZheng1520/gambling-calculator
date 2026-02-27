export interface Player {
  id: string;
  socketId: string;
  name: string;
  score: number;
  isHost: boolean;
  isDealer: boolean;
  connected: boolean;
}

// Niuniu hand type (internal key)
export type NiuniuHand = 'none' | 'niu1' | 'niu2' | 'niu3' | 'niu4' | 'niu5' | 'niu6' | 'niu7' | 'niu8' | 'niu9' | 'niuniu' | 'wuhua' | 'zhadan' | 'wuxiao';

// Blackjack outcome type
export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose';

export interface RoundResult {
  playerId: string;
  playerName: string;
  bet: number;
  outcome?: string;
  hand?: NiuniuHand;
  dealerHand?: NiuniuHand;
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
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

// Room state used by host/play pages (server-side shape)
export interface RoomState {
  id: string;
  game: '21' | 'niuniu';
  players: Player[];
  rounds: Round[];
  status: 'waiting' | 'playing' | 'settled';
  currentRound: number;
  baseBet: number;
  createdAt: string;
  pendingResults: Record<string, RoundResult>;
}

// 牛牛 hand types
export const NIUNIU_HANDS: { label: string; labelCn: string; value: NiuniuHand; multiplier: number }[] = [
  { label: "No Bull", labelCn: "无牛", value: "none", multiplier: 1 },
  { label: "Bull 1", labelCn: "牛1", value: "niu1", multiplier: 1 },
  { label: "Bull 2", labelCn: "牛2", value: "niu2", multiplier: 1 },
  { label: "Bull 3", labelCn: "牛3", value: "niu3", multiplier: 1 },
  { label: "Bull 4", labelCn: "牛4", value: "niu4", multiplier: 1 },
  { label: "Bull 5", labelCn: "牛5", value: "niu5", multiplier: 1 },
  { label: "Bull 6", labelCn: "牛6", value: "niu6", multiplier: 1 },
  { label: "Bull 7", labelCn: "牛7", value: "niu7", multiplier: 2 },
  { label: "Bull 8", labelCn: "牛8", value: "niu8", multiplier: 2 },
  { label: "Bull 9", labelCn: "牛9", value: "niu9", multiplier: 3 },
  { label: "Bull Bull", labelCn: "牛牛", value: "niuniu", multiplier: 3 },
  { label: "5 Face", labelCn: "五花牛", value: "wuhua", multiplier: 5 },
  { label: "Bomb", labelCn: "炸弹牛", value: "zhadan", multiplier: 5 },
  { label: "5 Small", labelCn: "五小牛", value: "wuxiao", multiplier: 5 },
];

export const BJ_OUTCOMES: { label: string; multiplier: number }[] = [
  { label: "Blackjack", multiplier: 1.5 },
  { label: "Win", multiplier: 1 },
  { label: "Push", multiplier: 0 },
  { label: "Lose", multiplier: -1 },
  { label: "Bust", multiplier: -1 },
];
