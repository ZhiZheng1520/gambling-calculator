"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [game, setGame] = useState<"21" | "niuniu">("niuniu");
  const [baseBet, setBaseBet] = useState(10);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return setError("Enter your name");
    setLoading(true);
    const socket = getSocket();
    socket.emit("create-room", { game, playerName: name.trim(), baseBet }, (res: any) => {
      setLoading(false);
      if (res.success) {
        localStorage.setItem("playerId", res.playerId);
        localStorage.setItem("playerName", name.trim());
        router.push(`/room/${res.roomId}`);
      } else {
        setError(res.error || "Failed to create room");
      }
    });
  };

  const handleJoin = () => {
    if (!name.trim()) return setError("Enter your name");
    if (!roomCode.trim()) return setError("Enter room code");
    setLoading(true);
    const socket = getSocket();
    socket.emit("join-room", { roomId: roomCode.trim().toUpperCase(), playerName: name.trim() }, (res: any) => {
      setLoading(false);
      if (res.success) {
        localStorage.setItem("playerId", res.playerId);
        localStorage.setItem("playerName", name.trim());
        router.push(`/room/${res.roomId}`);
      } else {
        setError(res.error || "Failed to join");
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎰</div>
          <h1 className="text-3xl font-bold text-white">Gambling Calculator</h1>
          <p className="text-gray-500 mt-2">21点 & 牛牛 Score Tracker</p>
        </div>

        {mode === "menu" ? (
          <div className="space-y-4">
            <button onClick={() => setMode("create")} className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-lg font-bold transition-all active:scale-95">
              🏠 Create Room
            </button>
            <button onClick={() => setMode("join")} className="w-full py-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-lg font-bold transition-all active:scale-95 border border-white/10">
              🚪 Join Room
            </button>
          </div>
        ) : mode === "create" ? (
          <div className="space-y-4">
            <button onClick={() => { setMode("menu"); setError(""); }} className="text-gray-500 text-sm">← Back</button>
            <h2 className="text-xl font-bold text-white">Create Room</h2>

            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-lg" />

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setGame("21")} className={`py-3 rounded-xl text-center font-bold transition-all ${game === "21" ? "bg-green-600 text-white" : "bg-white/5 text-gray-400 border border-white/10"}`}>
                🃏 21点
              </button>
              <button onClick={() => setGame("niuniu")} className={`py-3 rounded-xl text-center font-bold transition-all ${game === "niuniu" ? "bg-orange-600 text-white" : "bg-white/5 text-gray-400 border border-white/10"}`}>
                🐂 牛牛
              </button>
            </div>

            <div>
              <label className="text-sm text-gray-500">Base Bet</label>
              <input type="number" value={baseBet} onChange={(e) => setBaseBet(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg" />
            </div>

            {error && <div className="text-red-400 text-sm">{error}</div>}

            <button onClick={handleCreate} disabled={loading} className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-lg font-bold disabled:opacity-50">
              {loading ? "Creating..." : "Create Room"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => { setMode("menu"); setError(""); }} className="text-gray-500 text-sm">← Back</button>
            <h2 className="text-xl font-bold text-white">Join Room</h2>

            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-lg" />

            <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="Room Code (e.g. ABC123)" maxLength={6} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-lg text-center tracking-[0.3em] font-mono" />

            {error && <div className="text-red-400 text-sm">{error}</div>}

            <button onClick={handleJoin} disabled={loading} className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 text-white text-lg font-bold disabled:opacity-50">
              {loading ? "Joining..." : "Join Room"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
