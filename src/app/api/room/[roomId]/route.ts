import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";

// GET /api/room/[roomId]?playerId=xxx — Poll room state (cards filtered per player)
export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const room = getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // If cards enabled, filter hands so each player only sees their own
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  
  if (room.useCards && room.hands) {
    const caller = room.players.find(p => p.id === playerId);
    const isHostOrDealer = caller?.isHost || caller?.isDealer;
    
    const filteredRoom = { ...room };
    
    if (isHostOrDealer) {
      // Host/dealer sees all cards
      filteredRoom.hands = room.hands;
      filteredRoom.dealerCards = room.dealerCards;
    } else {
      // Regular player: only sees own hand + card count of others
      const myHand = playerId ? room.hands[playerId] || [] : [];
      const handCounts: Record<string, string[]> = {};
      for (const [pid, cards] of Object.entries(room.hands)) {
        if (pid === playerId) {
          handCounts[pid] = cards;
        } else {
          // Show card backs (count only)
          handCounts[pid] = cards.map(() => "🂠");
        }
      }
      filteredRoom.hands = handCounts;
      // Player sees dealer's first card + backs for rest (like real BJ)
      if (room.game === "21" && room.dealerCards && room.dealerCards.length > 0) {
        filteredRoom.dealerCards = [room.dealerCards[0], ...room.dealerCards.slice(1).map(() => "🂠")];
      } else {
        filteredRoom.dealerCards = room.dealerCards?.map(() => "🂠");
      }
    }
    
    return NextResponse.json(filteredRoom);
  }

  return NextResponse.json(room);
}
