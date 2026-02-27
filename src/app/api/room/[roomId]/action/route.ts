import { NextResponse } from "next/server";
import { getRoom, setRoom, calculateSettlement, type RoundResult } from "@/lib/store";

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
      // Player sets their own bet
      caller.bet = body.bet || room.baseBet;
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
