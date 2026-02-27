export interface Player {
  id: string;
  socketId: string;
  name: string;
  score: number;
  isHost: boolean;
  isDealer: boolean;
  connected: boolean;
}

export type NiuniuHand = 'none' | 'niu1' | 'niu2' | 'niu3' | 'niu4' | 'niu5' | 'niu6' | 'niu7' | 'niu8' | 'niu9' | 'niuniu' | 'wuhua' | 'zhadan' | 'wuxiao';
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

export interface Settlement { from: string; to: string; amount: number; }

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

// ═══════════════════════════════════
// 牛牛 HANDS & RULES
// ═══════════════════════════════════
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

// ═══════════════════════════════════
// 21点 HANDS & RULES
// ═══════════════════════════════════
export const BJ_OUTCOMES: { label: string; multiplier: number }[] = [
  { label: "Blackjack", multiplier: 1.5 },
  { label: "Win", multiplier: 1 },
  { label: "Push", multiplier: 0 },
  { label: "Lose", multiplier: -1 },
  { label: "Bust", multiplier: -1 },
];

// Hand value options for dealer
export const BJ_DEALER_HANDS: { label: string; labelCn: string; value: string }[] = [
  { label: "Blackjack", labelCn: "黑杰克 (BJ)", value: "blackjack" },
  { label: "21", labelCn: "21点", value: "21" },
  { label: "20", labelCn: "20点", value: "20" },
  { label: "19", labelCn: "19点", value: "19" },
  { label: "18", labelCn: "18点", value: "18" },
  { label: "17", labelCn: "17点", value: "17" },
  { label: "16", labelCn: "16点", value: "16" },
  { label: "15", labelCn: "15点", value: "15" },
  { label: "14", labelCn: "14点", value: "14" },
  { label: "13", labelCn: "13点", value: "13" },
  { label: "12 or less", labelCn: "12或以下", value: "12-" },
  { label: "Bust (>21)", labelCn: "爆牌 (>21)", value: "bust" },
];

// Hand value options for player (includes special actions)
export const BJ_PLAYER_HANDS: { label: string; labelCn: string; value: string }[] = [
  { label: "Blackjack", labelCn: "黑杰克 (BJ)", value: "blackjack" },
  { label: "21", labelCn: "21点", value: "21" },
  { label: "20", labelCn: "20点", value: "20" },
  { label: "19", labelCn: "19点", value: "19" },
  { label: "18", labelCn: "18点", value: "18" },
  { label: "17", labelCn: "17点", value: "17" },
  { label: "16", labelCn: "16点", value: "16" },
  { label: "15", labelCn: "15点", value: "15" },
  { label: "14", labelCn: "14点", value: "14" },
  { label: "13", labelCn: "13点", value: "13" },
  { label: "12 or less", labelCn: "12或以下", value: "12-" },
  { label: "Bust (>21)", labelCn: "爆牌 (>21)", value: "bust" },
  { label: "Double Down Win", labelCn: "双倍赢", value: "dd-win" },
  { label: "Double Down Lose", labelCn: "双倍输", value: "dd-lose" },
  { label: "Surrender", labelCn: "投降 (-半注)", value: "surrender" },
  { label: "5-Card Charlie", labelCn: "五龙 (5牌不爆)", value: "5card" },
];

// Calculate BJ PnL: player hand vs dealer hand
export function calcBjPnl(playerHand: string, dealerHand: string, bet: number): number {
  // Special actions first
  if (playerHand === "surrender") return -(bet * 0.5);
  if (playerHand === "dd-win") return bet * 2;
  if (playerHand === "dd-lose") return -(bet * 2);
  if (playerHand === "5card") return bet * 2; // 5-card Charlie = 2x win (common rule)

  // Player bust = always lose
  if (playerHand === "bust") return -bet;
  // Dealer bust = player wins
  if (dealerHand === "bust") {
    return playerHand === "blackjack" ? bet * 1.5 : bet;
  }
  // Both blackjack = push
  if (playerHand === "blackjack" && dealerHand === "blackjack") return 0;
  // Player blackjack = 1.5x
  if (playerHand === "blackjack") return bet * 1.5;
  // Dealer blackjack = player loses
  if (dealerHand === "blackjack") return -bet;
  // Compare values
  const valMap: Record<string, number> = { "21": 21, "20": 20, "19": 19, "18": 18, "17": 17, "16": 16, "15": 15, "14": 14, "13": 13, "12-": 12 };
  const pv = valMap[playerHand] || 0;
  const dv = valMap[dealerHand] || 0;
  if (pv > dv) return bet;
  if (pv < dv) return -bet;
  return 0; // push
}
