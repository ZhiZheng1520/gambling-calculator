"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface HistoryEntry {
  roomId: string;
  game: "21" | "niuniu";
  playerName: string;
  finalScore: number;
  players: { name: string; score: number }[];
  rounds: number;
  date: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("gambling-history");
    if (raw) setHistory(JSON.parse(raw));
  }, []);

  const clearHistory = () => {
    localStorage.removeItem("gambling-history");
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#1a0a2a] to-[#0a1a2a] p-4">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button onClick={() => router.push("/")} className="text-gray-500 text-sm hover:text-gray-400 mb-1">← Home</button>
            <h1 className="text-2xl font-bold text-white">📜 Past Sessions</h1>
            <p className="text-gray-500 text-sm">历史记录</p>
          </div>
          {history.length > 0 && (
            <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg bg-red-500/10">
              Clear All
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🎰</div>
            <p className="text-gray-500">No past sessions yet</p>
            <p className="text-gray-600 text-sm">还没有历史记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{h.game === "niuniu" ? "🐂" : "🃏"}</span>
                    <span className="text-white font-bold">{h.game === "niuniu" ? "牛牛" : "21点"}</span>
                    <span className="text-xs text-gray-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">{h.roomId}</span>
                  </div>
                  <span className="text-xs text-gray-500">{new Date(h.date).toLocaleDateString()}</span>
                </div>
                <div className="text-sm text-gray-400 mb-2">{h.rounds} rounds · {h.players.length} players</div>
                <div className="flex flex-wrap gap-2">
                  {h.players.sort((a, b) => b.score - a.score).map((p, j) => (
                    <span key={j} className={`text-xs px-2 py-1 rounded-lg ${p.score >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {p.name}: {p.score >= 0 ? "+" : ""}{p.score}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
