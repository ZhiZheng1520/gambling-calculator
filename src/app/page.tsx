"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const EMOJIS = ["😎","🤑","🎰","🐂","🃏","👑","💎","🔥","⭐","🎯","🎲","🍀","🦁","🐉","🎭","💰"];
const API = typeof window !== "undefined" ? window.location.origin : "";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"menu"|"create"|"join">("menu");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("😎");
  const [roomCode, setRoomCode] = useState("");
  const [game, setGame] = useState<"21"|"niuniu">("niuniu");
  const [baseBet, setBaseBet] = useState(10);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rulesTab, setRulesTab] = useState<"niuniu"|"21">("niuniu");

  const handleCreate = async () => {
    if (!name.trim()) return setError("Enter your name");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/room`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ game, playerName: `${avatar} ${name.trim()}`, baseBet }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("playerId", data.playerId);
        localStorage.setItem("playerName", `${avatar} ${name.trim()}`);
        router.push(`/room/${data.roomId}`);
      } else setError(data.error || "Failed");
    } catch { setError("Network error"); }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!name.trim()) return setError("Enter your name");
    if (!roomCode.trim()) return setError("Enter room code");
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/room/${roomCode.trim().toUpperCase()}/join`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ playerName: `${avatar} ${name.trim()}` }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("playerId", data.playerId);
        localStorage.setItem("playerName", `${avatar} ${name.trim()}`);
        router.push(`/room/${data.roomId}`);
      } else setError(data.error || "Failed");
    } catch { setError("Network error"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#0a0a1a] via-[#1a0a2a] to-[#0a1a2a]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 text-6xl opacity-10 animate-pulse">🃏</div>
        <div className="absolute top-40 right-20 text-5xl opacity-10 animate-pulse" style={{animationDelay:"1s"}}>🐂</div>
        <div className="absolute bottom-32 left-20 text-4xl opacity-10 animate-pulse" style={{animationDelay:"2s"}}>💰</div>
        <div className="absolute bottom-20 right-10 text-5xl opacity-10 animate-pulse" style={{animationDelay:"0.5s"}}>🎲</div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="text-7xl mb-4 animate-bounce" style={{animationDuration:"2s"}}>🎰</div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-yellow-400 bg-clip-text text-transparent">Gambling Calculator</h1>
          <p className="text-gray-500 mt-2">21点 &amp; 牛牛 Score Tracker</p>
          <button onClick={() => setShowRules(true)} className="mt-3 text-sm text-purple-400 hover:text-purple-300 underline underline-offset-4">📖 How to Play / 游戏规则</button>
        </div>

        {mode === "menu" ? (
          <div className="space-y-4">
            <button onClick={() => setMode("create")} className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-lg font-bold transition-all active:scale-95 shadow-lg shadow-purple-500/20">🏠 Create Room / 创建房间</button>
            <button onClick={() => setMode("join")} className="w-full py-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-lg font-bold transition-all active:scale-95 border border-white/10 backdrop-blur">🚪 Join Room / 加入房间</button>
            <a href="/history" className="block text-center text-sm text-gray-500 hover:text-gray-400 mt-4">📜 Past Sessions / 历史记录</a>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl bg-white/5 backdrop-blur border border-white/10 p-6">
            <button onClick={() => { setMode("menu"); setError(""); }} className="text-gray-500 text-sm hover:text-gray-400">← Back</button>
            <h2 className="text-xl font-bold text-white">{mode === "create" ? "Create Room 创建房间" : "Join Room 加入房间"}</h2>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Choose Avatar 选头像</label>
              <div className="flex flex-wrap gap-2">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setAvatar(e)} className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${avatar === e ? "bg-purple-600 scale-110 ring-2 ring-purple-400" : "bg-white/5 hover:bg-white/10"}`}>{e}</button>
                ))}
              </div>
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name 你的名字" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-lg focus:outline-none focus:border-purple-500/50" />
            {mode === "create" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setGame("21")} className={`py-4 rounded-xl text-center font-bold transition-all ${game === "21" ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg shadow-green-500/20" : "bg-white/5 text-gray-400 border border-white/10"}`}>🃏 21点</button>
                  <button onClick={() => setGame("niuniu")} className={`py-4 rounded-xl text-center font-bold transition-all ${game === "niuniu" ? "bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg shadow-orange-500/20" : "bg-white/5 text-gray-400 border border-white/10"}`}>🐂 牛牛</button>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Base Bet 底注</label>
                  <div className="flex gap-2 mt-1 mb-2">
                    {[1,2,3,5,10].map(amt => (
                      <button key={amt} onClick={() => setBaseBet(amt)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${baseBet === amt ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg" : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10"}`}>RM{amt}</button>
                    ))}
                  </div>
                  <input type="number" value={baseBet} onChange={e => setBaseBet(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg focus:outline-none focus:border-purple-500/50" placeholder="Custom amount" />
                </div>
                {error && <div className="text-red-400 text-sm">{error}</div>}
                <button onClick={handleCreate} disabled={loading} className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-lg font-bold disabled:opacity-50 active:scale-95 transition-all">{loading ? "Creating..." : "🚀 Create Room"}</button>
              </>
            ) : (
              <>
                <input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="Room Code 房间号" maxLength={6} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-lg text-center tracking-[0.3em] font-mono focus:outline-none focus:border-purple-500/50" />
                {error && <div className="text-red-400 text-sm">{error}</div>}
                <button onClick={handleJoin} disabled={loading} className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold disabled:opacity-50 active:scale-95 transition-all">{loading ? "Joining..." : "🚪 Join Room"}</button>
              </>
            )}
          </div>
        )}
      </div>

      {showRules && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowRules(false)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">📖 游戏规则 / How to Play</h2>
              <button onClick={() => setShowRules(false)} className="text-gray-500 hover:text-white text-2xl">✕</button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setRulesTab("niuniu")} className={`px-4 py-2 rounded-lg font-bold text-sm ${rulesTab === "niuniu" ? "bg-orange-600 text-white" : "bg-white/5 text-gray-400"}`}>🐂 牛牛</button>
              <button onClick={() => setRulesTab("21")} className={`px-4 py-2 rounded-lg font-bold text-sm ${rulesTab === "21" ? "bg-green-600 text-white" : "bg-white/5 text-gray-400"}`}>🃏 21点</button>
            </div>
            {rulesTab === "niuniu" ? (
              <div className="space-y-4 text-sm text-gray-300">
                <div><h3 className="text-white font-bold mb-1">🐂 牛牛 (Niu Niu / Bull Bull)</h3><p>每人发5张牌，其中3张凑成10的倍数（有牛），剩余2张决定牛几。</p><p className="text-gray-500 mt-1">5 cards dealt. 3 cards must sum to a multiple of 10 (Bull). Remaining 2 determine the bull number.</p></div>
                <div><h3 className="text-white font-bold mb-1">倍率 / Multipliers:</h3><div className="grid grid-cols-2 gap-1"><span>无牛 No Bull → 1x</span><span>牛1-6 Bull 1-6 → 1x</span><span>牛7-8 Bull 7-8 → 2x</span><span>牛9 Bull 9 → 3x</span><span className="text-yellow-400">牛牛 Bull Bull → 3x</span><span className="text-red-400">五花牛 5 Face → 5x</span><span className="text-red-400">炸弹牛 Bomb → 5x</span><span className="text-red-400">五小牛 5 Small → 5x</span></div></div>
                <div><h3 className="text-white font-bold mb-1">胜负 / Win/Lose:</h3><p>玩家 vs 庄家：牌型大的赢。牌型相同庄家赢。</p><p className="text-gray-500">Player vs Dealer: higher hand wins. Tie goes to dealer.</p></div>
              </div>
            ) : (
              <div className="space-y-4 text-sm text-gray-300">
                <div><h3 className="text-white font-bold mb-1">🃏 21点 (Blackjack)</h3><p>目标：手牌点数尽量接近21点，不能超过。</p><p className="text-gray-500 mt-1">Goal: Get as close to 21 as possible without going over.</p></div>
                <div><h3 className="text-white font-bold mb-1">赔率 / Payouts:</h3><div className="space-y-1"><p className="text-yellow-400">Blackjack (A + 10/J/Q/K) → 1.5x 赢</p><p className="text-green-400">Win 赢 → 1x</p><p className="text-gray-400">Push 平局 → 0 (退回)</p><p className="text-red-400">Lose 输 → -1x</p><p className="text-red-400">Bust 爆牌 (&gt;21) → -1x</p></div></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
