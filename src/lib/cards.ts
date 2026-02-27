// ═══════════════════════════════════
// CARD SYSTEM — Deck, Shuffle, Deal, Hand Evaluation
// ═══════════════════════════════════

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = `${Rank}${Suit}`;

export const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
export const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}` as Card);
  return deck;
}

export function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Parse card into rank + suit
export function parseCard(card: string): { rank: Rank; suit: Suit } {
  const suit = card.slice(-1) as Suit;
  const rank = card.slice(0, -1) as Rank;
  return { rank, suit };
}

// Card numeric value (for calculations)
export function cardValue(card: string): number {
  const { rank } = parseCard(card);
  if (rank === "A") return 1;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return parseInt(rank);
}

// Is card red (hearts/diamonds)?
export function isRed(card: string): boolean {
  const { suit } = parseCard(card);
  return suit === "♥" || suit === "♦";
}

// Is face card (J/Q/K)?
export function isFace(card: string): boolean {
  const { rank } = parseCard(card);
  return ["J", "Q", "K"].includes(rank);
}

// ═══════════════════════════════════
// 牛牛 HAND EVALUATION
// ═══════════════════════════════════

export interface NiuniuResult {
  hand: string;      // labelCn: "无牛", "牛1", ..., "牛牛", "五花牛", "炸弹牛", "五小牛"
  multiplier: number;
  bullNumber: number; // 0 = no bull, 1-9, 10 = niuniu
  threeCards: number[]; // indices of 3 cards that form bull
  twoCards: number[];   // indices of remaining 2 cards
}

export function evaluateNiuniu(cards: string[]): NiuniuResult {
  if (cards.length !== 5) return { hand: "无牛", multiplier: 1, bullNumber: 0, threeCards: [], twoCards: [] };

  const values = cards.map(c => cardValue(c));

  // Check special hands first

  // 五小牛: all cards ≤ 4 (by face value) AND total sum ≤ 10
  const allSmall = values.every(v => v <= 4);
  const totalSum = values.reduce((a, b) => a + b, 0);
  if (allSmall && totalSum <= 10) {
    return { hand: "五小牛", multiplier: 5, bullNumber: 15, threeCards: [0,1,2], twoCards: [3,4] };
  }

  // 炸弹牛: 4 of a kind
  const rankCounts: Record<string, number> = {};
  cards.forEach(c => { const r = parseCard(c).rank; rankCounts[r] = (rankCounts[r] || 0) + 1; });
  if (Object.values(rankCounts).includes(4)) {
    return { hand: "炸弹牛", multiplier: 5, bullNumber: 14, threeCards: [0,1,2], twoCards: [3,4] };
  }

  // 五花牛: all 5 cards are J/Q/K (face cards, all value 10)
  if (cards.every(c => isFace(c))) {
    return { hand: "五花牛", multiplier: 5, bullNumber: 13, threeCards: [0,1,2], twoCards: [3,4] };
  }

  // Normal bull check: find 3 cards that sum to multiple of 10
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (let k = j + 1; k < 5; k++) {
        const sum3 = values[i] + values[j] + values[k];
        if (sum3 % 10 === 0) {
          const remaining = [0,1,2,3,4].filter(x => x !== i && x !== j && x !== k);
          const sum2 = values[remaining[0]] + values[remaining[1]];
          const bull = sum2 % 10;

          if (bull === 0) {
            return { hand: "牛牛", multiplier: 3, bullNumber: 10, threeCards: [i,j,k], twoCards: remaining };
          }

          const multiplier = bull >= 7 ? (bull >= 9 ? 3 : 2) : 1;
          return { hand: `牛${bull}`, multiplier, bullNumber: bull, threeCards: [i,j,k], twoCards: remaining };
        }
      }
    }
  }

  return { hand: "无牛", multiplier: 1, bullNumber: 0, threeCards: [], twoCards: [0,1,2,3,4] };
}

// ═══════════════════════════════════
// 21点 HAND EVALUATION
// ═══════════════════════════════════

export interface BlackjackResult {
  total: number;       // best total (using soft ace)
  isSoft: boolean;     // has usable ace
  isBlackjack: boolean;// natural 21 with 2 cards
  isBust: boolean;     // over 21
  display: string;     // e.g. "18", "BJ", "Bust"
}

export function evaluateBlackjack(cards: string[]): BlackjackResult {
  if (cards.length === 0) return { total: 0, isSoft: false, isBlackjack: false, isBust: false, display: "0" };

  let total = 0;
  let aces = 0;

  for (const card of cards) {
    const { rank } = parseCard(card);
    if (rank === "A") { total += 11; aces++; }
    else if (["J", "Q", "K"].includes(rank)) total += 10;
    else total += parseInt(rank);
  }

  // Convert aces from 11 to 1 as needed
  while (total > 21 && aces > 0) { total -= 10; aces--; }

  const isSoft = aces > 0;
  const isBust = total > 21;
  const isBlackjack = cards.length === 2 && total === 21;

  let display = total.toString();
  if (isBlackjack) display = "BJ";
  else if (isBust) display = "Bust";

  return { total, isSoft, isBlackjack, isBust, display };
}

// ═══════════════════════════════════
// DEAL FUNCTIONS
// ═══════════════════════════════════

export interface DealResult {
  deck: Card[];
  hands: Record<string, Card[]>;    // playerId → cards
  dealerCards: Card[];
}

// Deal for 牛牛: 5 cards each to all players + dealer
export function dealNiuniu(playerIds: string[], dealerId: string): DealResult {
  let deck = shuffle(newDeck());
  const hands: Record<string, Card[]> = {};
  const dealerCards: Card[] = [];

  // Deal 5 cards to each player
  for (const pid of playerIds) {
    hands[pid] = deck.splice(0, 5);
  }
  // Deal 5 cards to dealer
  dealerCards.push(...deck.splice(0, 5));

  return { deck, hands, dealerCards };
}

// Deal for 21点: 2 cards each to all players + dealer
export function dealBlackjack(playerIds: string[], dealerId: string): DealResult {
  let deck = shuffle(newDeck());
  const hands: Record<string, Card[]> = {};
  const dealerCards: Card[] = [];

  // Deal 2 cards to each player (alternating like real dealing)
  for (let round = 0; round < 2; round++) {
    for (const pid of playerIds) {
      if (!hands[pid]) hands[pid] = [];
      hands[pid].push(deck.splice(0, 1)[0]);
    }
    dealerCards.push(deck.splice(0, 1)[0]);
  }

  return { deck, hands, dealerCards };
}
