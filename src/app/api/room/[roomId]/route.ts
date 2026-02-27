import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";

// GET /api/room/[roomId] — Poll room state
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const room = getRoom(roomId);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json(room);
}
