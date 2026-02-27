import { NextResponse } from "next/server";
import { getRoom, setRoom, calculateSettlement, type RoundResult } from "@/lib/store";
import { dealNiuniu, dealBlackjack, evaluateBlackjack, evaluateNiuniu } from "@/lib/cards";

// POST /api/room/[roomId]/action — All room actions
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const body = await req.json();
  const { action, playerId } = body;
  const room = getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const caller = room.players.find(p => p.id === playerId);
  if (!caller) return NextResponse.json({ error: "Not in room" }, { status: 403 });

  const isHostOrDealer = caller.isHost || caller.isDealer;

  switch (action) {
    case "set-dealer": {
      if (!caller.isHost) return NextResponse.json({ error: "Not host" }, { status: 403 });
      room.players.forEach(p => (p.isDealer = p.id === body.targetPlayerId));
      break;
    }

    case "transfer-host": {
      if (!caller.isHost) return NextResponse.json({ error: "Not host" }, { status: 403 });
      const target = room.players.find(p => p.id === body.targetPlayerId);
      if (!target) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      caller.isHost = false;
      target.isHost = true;
      break;
    }

    case "start-round": {
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      room.status = "playing";
      room.currentRound++;
      room.rounds.push({ number: room.currentRound, results: [], timestamp: new Date().toISOString() });
      break;
    }

    case "submit-results": {
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      const round = room.rounds[room.rounds.length - 1];
      if (!round) return NextResponse.json({ error: "No active round" }, { status: 400 });
      
      const results: RoundResult[] = body.results || [];
      
      // Auto-add dealer inverse if not included
      const dealer = room.players.find(p => p.isDealer);
      if (dealer && !results.find(r => r.playerId === dealer.id)) {
        const dealerPnl = -results.reduce((s, r) => s + r.pnl, 0);
        results.push({
          playerId: dealer.id, playerName: dealer.name,
          bet: 0, outcome: "Dealer", multiplier: 1,
          pnl: Math.round(dealerPnl * 100) / 100,
        });
      }
      
      round.results = results;
      for (const r of results) {
        const player = room.players.find(p => p.id === r.playerId);
        if (player) {
          player.score = Math.round((player.score + r.pnl) * 100) / 100;
        }
      }
      room.status = "waiting";
      break;
    }

    case "cancel-round": {
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      // Remove last empty round and revert state
      if (room.rounds.length > 0) {
        const lastRound = room.rounds[room.rounds.length - 1];
        if (lastRound.results.length === 0) {
          room.rounds.pop();
          room.currentRound = Math.max(0, room.currentRound - 1);
        }
      }
      room.status = "waiting";
      break;
    }

    case "set-bet": {
      // Player sets their own bet — any amount ≥ 1 allowed (no base minimum)
      const betAmt = Number(body.bet) || room.baseBet;
      caller.bet = Math.max(1, betAmt);
      break;
    }

    case "undo-round": {
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      if (room.rounds.length === 0) return NextResponse.json({ error: "No rounds to undo" }, { status: 400 });
      const lastRound = room.rounds[room.rounds.length - 1];
      // Reverse the score changes
      for (const r of lastRound.results) {
        const player = room.players.find(p => p.id === r.playerId);
        if (player) {
          player.score = Math.round((player.score - r.pnl) * 100) / 100;
        }
      }
      room.rounds.pop();
      room.currentRound = Math.max(0, room.currentRound - 1);
      room.status = "waiting";
      break;
    }

    case "adjust-score": {
      if (!caller.isHost) return NextResponse.json({ error: "Not host" }, { status: 403 });
      const target2 = room.players.find(p => p.id === body.targetPlayerId);
      if (!target2) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      target2.score = Math.round((target2.score + (body.amount || 0)) * 100) / 100;
      break;
    }

    case "kick-player": {
      if (!caller.isHost) return NextResponse.json({ error: "Not host" }, { status: 403 });
      room.players = room.players.filter(p => p.id !== body.targetPlayerId);
      break;
    }

    case "deal-cards": {
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      if (!room.useCards) return NextResponse.json({ error: "Cards not enabled" }, { status: 400 });
      const dealer = room.players.find(p => p.isDealer);
      const playerIds = room.players.filter(p => !p.isDealer).map(p => p.id);
      if (!dealer) return NextResponse.json({ error: "No dealer" }, { status: 400 });

      if (room.game === "niuniu") {
        const deal = dealNiuniu(playerIds, dealer.id);
        room.deck = deal.deck;
        room.hands = deal.hands;
        room.dealerCards = deal.dealerCards;
      } else {
        const deal = dealBlackjack(playerIds, dealer.id);
        room.deck = deal.deck;
        room.hands = deal.hands;
        room.dealerCards = deal.dealerCards;
        // Init player statuses
        room.bjPlayerStatus = {};
        for (const pid of playerIds) {
          const eval_ = evaluateBlackjack(deal.hands[pid]);
          room.bjPlayerStatus[pid] = eval_.isBlackjack ? "blackjack" : "playing";
        }
      }
      break;
    }

    case "hit": {
      // 21点: player requests one more card
      if (!room.useCards || room.game !== "21") return NextResponse.json({ error: "Not applicable" }, { status: 400 });
      if (!room.hands?.[playerId] || !room.deck) return NextResponse.json({ error: "No cards dealt" }, { status: 400 });
      if (room.bjPlayerStatus?.[playerId] !== "playing") return NextResponse.json({ error: "Cannot hit" }, { status: 400 });
      
      room.hands[playerId].push(room.deck.splice(0, 1)[0]);
      const eval_ = evaluateBlackjack(room.hands[playerId]);
      if (eval_.isBust) room.bjPlayerStatus![playerId] = "bust";
      else if (eval_.total === 21) room.bjPlayerStatus![playerId] = "stand";
      break;
    }

    case "stand": {
      // 21点: player stands
      if (!room.useCards || room.game !== "21") return NextResponse.json({ error: "Not applicable" }, { status: 400 });
      if (room.bjPlayerStatus?.[playerId] !== "playing") return NextResponse.json({ error: "Cannot stand" }, { status: 400 });
      room.bjPlayerStatus![playerId] = "stand";
      break;
    }

    case "double-down": {
      // 21点: player doubles bet, gets exactly 1 card, then auto-stand
      if (!room.useCards || room.game !== "21") return NextResponse.json({ error: "Not applicable" }, { status: 400 });
      if (!room.hands?.[playerId] || room.hands[playerId].length !== 2) return NextResponse.json({ error: "Can only double on first 2 cards" }, { status: 400 });
      if (room.bjPlayerStatus?.[playerId] !== "playing") return NextResponse.json({ error: "Cannot double" }, { status: 400 });
      
      // Double the player's bet
      const ddPlayer = room.players.find(p => p.id === playerId);
      if (ddPlayer) ddPlayer.bet = (ddPlayer.bet || room.baseBet) * 2;
      
      // Deal one card
      room.hands[playerId].push(room.deck!.splice(0, 1)[0]);
      const ddEval = evaluateBlackjack(room.hands[playerId]);
      room.bjPlayerStatus![playerId] = ddEval.isBust ? "bust" : "dd";
      break;
    }

    case "dealer-play": {
      // 21点: dealer reveals and plays (hit until 17+)
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      if (!room.useCards || room.game !== "21") return NextResponse.json({ error: "Not applicable" }, { status: 400 });
      if (!room.dealerCards || !room.deck) return NextResponse.json({ error: "No cards dealt" }, { status: 400 });
      
      // Dealer hits until 17+
      let dealerEval = evaluateBlackjack(room.dealerCards);
      while (dealerEval.total < 17 && !dealerEval.isBust) {
        room.dealerCards.push(room.deck.splice(0, 1)[0]);
        dealerEval = evaluateBlackjack(room.dealerCards);
      }
      break;
    }

    case "switch-game": {
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      const newGame = body.game;
      if (newGame !== "21" && newGame !== "niuniu") return NextResponse.json({ error: "Invalid game" }, { status: 400 });
      room.game = newGame;
      // Reset card state if mid-round
      room.deck = undefined;
      room.hands = undefined;
      room.dealerCards = undefined;
      room.bjPlayerStatus = undefined;
      break;
    }

    case "end-session": {
      if (!isHostOrDealer) return NextResponse.json({ error: "Not host/dealer" }, { status: 403 });
      room.status = "settled";
      const settlements = calculateSettlement(room.players);
      setRoom(room);
      return NextResponse.json({ success: true, room, settlements });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  setRoom(room);
  return NextResponse.json({ success: true, room });
}
