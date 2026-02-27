import { BlackjackOutcome, NiuniuHand, Settlement, Player } from './types';

// === Blackjack (21点) ===

export function getBlackjackMultiplier(outcome: BlackjackOutcome): number {
  switch (outcome) {
    case 'blackjack': return 1.5;
    case 'win': return 1;
    case 'push': return 0;
    case 'lose': return -1;
  }
}

export function calculateBlackjackPnl(bet: number, outcome: BlackjackOutcome): number {
  return bet * getBlackjackMultiplier(outcome);
}

// === Niu Niu (牛牛) ===

export const NIUNIU_LABELS: Record<NiuniuHand, string> = {
  none: '无牛',
  niu1: '牛1', niu2: '牛2', niu3: '牛3',
  niu4: '牛4', niu5: '牛5', niu6: '牛6',
  niu7: '牛7', niu8: '牛8', niu9: '牛9',
  niuniu: '牛牛',
  wuhua: '五花牛',
  zhadan: '炸弹牛',
  wuxiao: '五小牛',
};

export function getNiuniuMultiplier(hand: NiuniuHand): number {
  switch (hand) {
    case 'none':
    case 'niu1': case 'niu2': case 'niu3':
    case 'niu4': case 'niu5': case 'niu6':
      return 1;
    case 'niu7': case 'niu8': case 'niu9':
      return 2;
    case 'niuniu':
      return 3;
    case 'wuhua':
    case 'zhadan':
    case 'wuxiao':
      return 5;
  }
}

// In Niu Niu, player result is win (+multiplier*bet) or lose (-multiplier*bet)
export function calculateNiuniuPnl(bet: number, hand: NiuniuHand, won: boolean): number {
  const mult = getNiuniuMultiplier(hand);
  return won ? bet * mult : -bet * mult;
}

// === Settlement (Debt Optimization) ===

export function calculateSettlements(players: Player[]): Settlement[] {
  // Separate into debtors (negative score) and creditors (positive score)
  const balances = players
    .filter(p => p.score !== 0)
    .map(p => ({ name: p.name, balance: p.score }));

  const debtors: { name: string; amount: number }[] = [];
  const creditors: { name: string; amount: number }[] = [];

  for (const b of balances) {
    if (b.balance < 0) {
      debtors.push({ name: b.name, amount: -b.balance }); // positive amount they owe
    } else if (b.balance > 0) {
      creditors.push({ name: b.name, amount: b.balance });
    }
  }

  // Sort both by amount descending for greedy optimization
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].amount, creditors[j].amount);
    if (transfer > 0) {
      settlements.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: Math.round(transfer * 100) / 100,
      });
    }
    debtors[i].amount -= transfer;
    creditors[j].amount -= transfer;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return settlements;
}

// Blackjack outcome labels
export const BLACKJACK_LABELS: Record<BlackjackOutcome, string> = {
  blackjack: 'Blackjack (1.5x)',
  win: '赢 Win',
  push: '平 Push',
  lose: '输 Lose',
};
