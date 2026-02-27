import { NextResponse } from "next/server";
import { getRoom, setRoom, genPlayerId, type Player } from "@/lib/store";

// POST /api/room/[roomId]/join
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const { playerName } = await req.json();
  const room = getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  // Reconnect if name exists (works even for settled rooms so players can view final scores)
  const existing = room.players.find(p => p.name === playerName);
  if (existing) {
    setRoom(room);
    return NextResponse.json({ success: true, playerId: existing.id, room, reconnected: true });
  }

  // Don't allow NEW players to join settled rooms
  if (room.status === "settled") return NextResponse.json({ error: "Room已结束 — ask host for the new room code 请问主持人要新房间号", settled: true }, { status: 400 });

  const playerId = genPlayerId();
  const player: Player = { id: playerId, name: playerName, score: 0, isHost: false, isDealer: false, bet: room.baseBet };
  room.players.push(player);
  setRoom(room);
  return NextResponse.json({ success: true, playerId, room });
}
