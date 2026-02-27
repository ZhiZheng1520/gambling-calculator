import { NextResponse } from "next/server";
import { genRoomId, genPlayerId, setRoom, getRoom, type Room, type Player } from "@/lib/store";

// POST /api/room — Create room
export async function POST(req: Request) {
  const { game, playerName, baseBet } = await req.json();
  const roomId = genRoomId();
  const playerId = genPlayerId();
  const player: Player = { id: playerId, name: playerName, score: 0, isHost: true, isDealer: true, bet: baseBet || 10 };
  const room: Room = {
    id: roomId, game: game || "niuniu", players: [player], rounds: [],
    status: "waiting", currentRound: 0, baseBet: baseBet || 10,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  setRoom(room);
  return NextResponse.json({ success: true, roomId, playerId, room });
}
