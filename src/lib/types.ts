export interface Player {
  id: string;
  socketId: string;
  name: string;
  score: number;
  isHost: boolean;
  isDealer: boolean;
  connected: boolean;
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
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

// 牛牛 hand types
export const NIUNIU_HANDS: { label: string; labelCn: string; multiplier: number }[] = [
  { label: "No Bull", labelCn: "无牛", multiplier: 1 },
  { label: "Bull 1", labelCn: "牛1", multiplier: 1 },
  { label: "Bull 2", labelCn: "牛2", multiplier: 1 },
  { label: "Bull 3", labelCn: "牛3", multiplier: 1 },
  { label: "Bull 4", labelCn: "牛4", multiplier: 1 },
  { label: "Bull 5", labelCn: "牛5", multiplier: 1 },
  { label: "Bull 6", labelCn: "牛6", multiplier: 1 },
  { label: "Bull 7", labelCn: "牛7", multiplier: 2 },
  { label: "Bull 8", labelCn: "牛8", multiplier: 2 },
  { label: "Bull 9", labelCn: "牛9", multiplier: 3 },
  { label: "Bull Bull", labelCn: "牛牛", multiplier: 3 },
  { label: "5 Face", labelCn: "五花牛", multiplier: 5 },
  { label: "Bomb", labelCn: "炸弹牛", multiplier: 5 },
  { label: "5 Small", labelCn: "五小牛", multiplier: 5 },
];

export const BJ_OUTCOMES: { label: string; multiplier: number }[] = [
  { label: "Blackjack", multiplier: 1.5 },
  { label: "Win", multiplier: 1 },
  { label: "Push", multiplier: 0 },
  { label: "Lose", multiplier: -1 },
  { label: "Bust", multiplier: -1 },
];
