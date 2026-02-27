"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { Room, Player, RoundResult, NIUNIU_HANDS, BJ_OUTCOMES, Settlement } from "@/lib/types";

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [myId, setMyId] = useState<string>("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showRoundInput, setShowRoundInput] = useState(false);
  const [roundInputs, setRoundInputs] = useState<Record<string, { outcome: string; bet: number; multiplier: number; pnl: number }>>({});
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [showSettle, setShowSettle] = useState(false);
  const [adjustPlayer, setAdjustPlayer] = useState<Player | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [copied, setCopied] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [dealerHand, setDealerHand] = useState("无牛");

  const me = room?.players.find((p) => p.id === myId);
  const isHost = me?.isHost || false;

  useEffect(() => {
    const pid = localStorage.getItem("playerId") || "";
    setMyId(pid);
    const socket = getSocket();

    if (!socket.connected) socket.connect();

    // Rejoin room
    const pname = localStorage.getItem("playerName") || "Unknown";
    socket.emit("join-room", { roomId: (roomId as string).toUpperCase(), playerName: pname }, (res: any) => {
      if (res.success) {
        setMyId(res.playerId);
        localStorage.setItem("playerId", res.playerId);
        setRoom(res.room);
      } else if (res.error === "Name taken") {
        // Already in room, just get state
        socket.emit("get-room", null, (r: any) => {
          if (r.success) setRoom(r.room);
        });
      }
    });

    socket.on("notification", ({ message }: { message: string }) => {
      setNotifications((prev) => [...prev.slice(-4), message]);
      setTimeout(() => setNotifications((prev) => prev.slice(1)), 3000);
    });
    socket.on("round-started", () => setShowRoundInput(true));
    socket.on("round-ended", () => setShowRoundInput(false));
    socket.on("session-settled", ({ settlements: s }: { settlements: Settlement[] }) => {
      setSettlements(s);
      setShowSettle(true);
      // Save to history
      try {
        const raw = localStorage.getItem("gambling-history");
        const hist = raw ? JSON.parse(raw) : [];
        // room state should be updated by now via room-state event
        hist.unshift({
          roomId: (roomId as string).toUpperCase(),
          game: "niuniu",
          playerName: localStorage.getItem("playerName") || "",
          players: [],
          rounds: 0,
          date: new Date().toISOString(),
        });
        localStorage.setItem("gambling-history", JSON.stringify(hist.slice(0, 50)));
      } catch {}
    });

    // Also update history with full data when room state changes after settle
    socket.on("room-state", (r: Room) => {
      setRoom(r);
      if (r.status === "settled") {
        try {
          const raw = localStorage.getItem("gambling-history");
          const hist = raw ? JSON.parse(raw) : [];
          const existing = hist.find((h: any) => h.roomId === r.id);
          if (existing) {
            existing.game = r.game;
            existing.players = r.players.map((p) => ({ name: p.name, score: p.score }));
            existing.rounds = r.rounds.length;
          }
          localStorage.setItem("gambling-history", JSON.stringify(hist));
        } catch {}
      }
    });

    return () => {
      socket.off("room-state");
      socket.off("notification");
      socket.off("round-started");
      socket.off("round-ended");
      socket.off("session-settled");
    };
  }, [roomId]);

  // Helper: calculate niuniu P&L for a player hand vs the dealer hand
  const calcNiuniuPnl = useCallback((playerOutcome: string, dealerOutcome: string, bet: number) => {
    const playerIdx = NIUNIU_HANDS.findIndex((h) => h.labelCn === playerOutcome);
    const dealerIdx = NIUNIU_HANDS.findIndex((h) => h.labelCn === dealerOutcome);
    const playerMult = NIUNIU_HANDS[playerIdx]?.multiplier || 1;
    const dealerMult = NIUNIU_HANDS[dealerIdx]?.multiplier || 1;
    // Multiplier used is the HIGHER hand's multiplier (winner's multiplier)
    const mult = Math.max(playerMult, dealerMult);
    if (playerIdx > dealerIdx) return Math.round(bet * mult * 100) / 100;   // Win
    if (playerIdx < dealerIdx) return Math.round(-bet * mult * 100) / 100;  // Lose
    return 0; // Tie
  }, []);

  // When dealer hand changes, recalculate all player P&Ls
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const recalcAllForDealer = useCallback((newDealerHand: string) => {
    if (room?.game !== "niuniu") return;
    setRoundInputs((prev) => {
      const next = { ...prev };
      for (const pid of Object.keys(next)) {
        const p = { ...next[pid] };
        p.pnl = calcNiuniuPnl(p.outcome, newDealerHand, p.bet);
        next[pid] = p;
      }
      return next;
    });
  }, [room?.game, calcNiuniuPnl]);

  const initRoundInputs = useCallback(() => {
    if (!room) return;
    const inputs: typeof roundInputs = {};
    if (room.game === "niuniu") {
      setDealerHand("无牛");
      room.players.filter((p) => !p.isDealer).forEach((p) => {
        // Default: player=无牛, dealer=无牛 → tie → pnl=0
        inputs[p.id] = { outcome: "无牛", bet: room.baseBet, multiplier: 1, pnl: 0 };
      });
    } else {
      room.players.filter((p) => !p.isDealer).forEach((p) => {
        inputs[p.id] = { outcome: "Lose", bet: room.baseBet, multiplier: 1, pnl: -room.baseBet };
      });
    }
    setRoundInputs(inputs);
  }, [room]);

  const startRound = () => {
    const socket = getSocket();
    socket.emit("start-round", null, (res: any) => {
      if (res.success) {
        initRoundInputs();
        setShowRoundInput(true);
      }
    });
  };

  const updatePlayerResult = (playerId: string, field: string, value: any) => {
    setRoundInputs((prev) => {
      const p = { ...prev[playerId], [field]: value };

      if (room?.game === "niuniu") {
        const hand = NIUNIU_HANDS.find((h) => h.labelCn === p.outcome);
        p.multiplier = hand?.multiplier || 1;
        // In niuniu, "win" vs "lose" is separate — use pnl sign
        // For now, host manually sets outcome
      } else {
        const bj = BJ_OUTCOMES.find((b) => b.label === p.outcome);
        p.multiplier = bj?.multiplier || 0;
      }

      p.pnl = Math.round(p.bet * p.multiplier * 100) / 100;
      return { ...prev, [playerId]: p };
    });
  };

  const submitResults = () => {
    const socket = getSocket();
    const results: RoundResult[] = Object.entries(roundInputs).map(([pid, r]) => ({
      playerId: pid,
      playerName: room?.players.find((p) => p.id === pid)?.name || "",
      bet: r.bet,
      outcome: r.outcome,
      multiplier: r.multiplier,
      pnl: r.pnl,
    }));

    // Dealer gets inverse of all players
    const dealer = room?.players.find((p) => p.isDealer);
    if (dealer) {
      const dealerPnl = -results.reduce((s, r) => s + r.pnl, 0);
      results.push({
        playerId: dealer.id, playerName: dealer.name,
        bet: 0, outcome: "Dealer", multiplier: 1,
        pnl: Math.round(dealerPnl * 100) / 100,
      });
    }

    socket.emit("submit-results", { results }, () => setShowRoundInput(false));
  };

  const transferHost = (targetId: string) => {
    getSocket().emit("transfer-host", { targetPlayerId: targetId }, () => {});
  };

  const setDealer = (targetId: string) => {
    getSocket().emit("set-dealer", { targetPlayerId: targetId }, () => {});
  };

  const kickPlayer = (targetId: string) => {
    if (confirm("Kick this player?")) {
      getSocket().emit("kick-player", { targetPlayerId: targetId }, () => {});
    }
  };

  const doAdjust = () => {
    if (!adjustPlayer) return;
    getSocket().emit("adjust-score", { targetPlayerId: adjustPlayer.id, amount: adjustAmount }, () => {
      setAdjustPlayer(null);
      setAdjustAmount(0);
    });
  };

  const saveSessionToHistory = useCallback(() => {
    if (!room || room.rounds.length === 0) return;
    try {
      const session = {
        id: `${room.id}-${Date.now()}`,
        date: new Date().toISOString(),
        gameType: room.game,
        players: room.players.map((p) => ({ name: p.name, score: p.score, isDealer: p.isDealer })),
        rounds: room.rounds.map((r) => ({
          number: r.number,
          results: r.results.map((res) => ({ playerName: res.playerName, pnl: res.pnl, outcome: res.outcome })),
          timestamp: r.timestamp,
        })),
        settlements: settlements.map((s) => ({ from: s.from, to: s.to, amount: s.amount })),
        roomId: room.id,
      };
      const raw = localStorage.getItem("gambling-history");
      const history = raw ? JSON.parse(raw) : [];
      history.push(session);
      localStorage.setItem("gambling-history", JSON.stringify(history));
    } catch {
      // silently fail
    }
  }, [room, settlements]);

  useEffect(() => {
    if (showSettle) {
      saveSessionToHistory();
    }
  }, [showSettle, saveSessionToHistory]);

  const endSession = () => {
    if (confirm("End session? This will calculate final settlement.")) {
      getSocket().emit("end-session", null, () => {});
    }
  };

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Connecting to room...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{room.game === "niuniu" ? "🐂" : "🃏"}</span>
            <h1 className="text-xl font-bold text-white">{room.game === "niuniu" ? "牛牛" : "21点"}</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => {
                navigator.clipboard.writeText(room.id);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-xs font-mono bg-purple-600/30 text-purple-300 px-2 py-0.5 rounded hover:bg-purple-600/50 transition-colors cursor-pointer"
              title="Click to copy room code"
            >
              {copied ? "Copied!" : room.id}
            </button>
            <span className="text-xs text-gray-500">Round {room.currentRound}</span>
            <span className="text-xs text-gray-500">Base: {room.baseBet}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">{me?.name} {isHost && <span className="text-yellow-400">👑</span>}</div>
          <div className={`text-xl font-bold font-mono ${(me?.score || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
            {(me?.score || 0) >= 0 ? "+" : ""}{me?.score || 0}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-1 mb-4">
          {notifications.map((n, i) => (
            <div key={i} className="text-xs text-yellow-300 bg-yellow-500/10 px-3 py-1.5 rounded-lg">{n}</div>
          ))}
        </div>
      )}

      {/* Scoreboard */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Scoreboard</h2>
        <div className="space-y-2">
          {room.players.sort((a, b) => b.score - a.score).map((p) => (
            <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl ${p.id === myId ? "bg-purple-500/10 border border-purple-500/20" : "bg-white/[0.03]"}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${p.connected ? "bg-green-400" : "bg-gray-600"}`} />
                <span className="text-white font-medium">{p.name}</span>
                {p.isHost && <span className="text-xs text-yellow-400">👑</span>}
                {p.isDealer && <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">庄</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold font-mono ${p.score >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {p.score >= 0 ? "+" : ""}{p.score}
                </span>
                {isHost && p.id !== myId && (
                  <div className="flex gap-1">
                    <button onClick={() => setDealer(p.id)} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30">庄</button>
                    <button onClick={() => transferHost(p.id)} className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30">👑</button>
                    <button onClick={() => { setAdjustPlayer(p); setAdjustAmount(0); }} className="text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30">±</button>
                    <button onClick={() => kickPlayer(p.id)} className="text-xs px-2 py-1 rounded bg-gray-500/20 text-gray-400 hover:bg-gray-500/30">✕</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Adjust Score Modal */}
      {adjustPlayer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setAdjustPlayer(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-white/10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">Adjust {adjustPlayer.name}&apos;s Score</h3>
            <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg text-center mb-4" />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setAdjustPlayer(null)} className="py-2 rounded-xl bg-white/10 text-gray-400">Cancel</button>
              <button onClick={doAdjust} className="py-2 rounded-xl bg-purple-600 text-white font-bold">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Round Input (Host) */}
      {isHost && showRoundInput && (
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 mb-4">
          <h2 className="text-sm font-medium text-yellow-400 mb-3">Round {room.currentRound} — Enter Results</h2>
          <div className="space-y-3">
            {room.players.filter((p) => !p.isDealer).map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-white/[0.03]">
                <div className="text-white font-medium mb-2">{p.name}</div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Bet</label>
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3, 5].map((amt) => (
                        <button key={amt} onClick={() => updatePlayerResult(p.id, "bet", amt)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
                            (roundInputs[p.id]?.bet || room.baseBet) === amt
                              ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                              : "bg-white/5 text-gray-400 hover:bg-white/10"
                          }`}>
                          RM{amt}
                        </button>
                      ))}
                    </div>
                    <input type="number" value={roundInputs[p.id]?.bet || room.baseBet}
                      onChange={(e) => updatePlayerResult(p.id, "bet", Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-center text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Result</label>
                    <select value={roundInputs[p.id]?.outcome || ""}
                      onChange={(e) => updatePlayerResult(p.id, "outcome", e.target.value)}
                      className="w-full px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-white">
                      {room.game === "niuniu"
                        ? NIUNIU_HANDS.map((h) => <option key={h.labelCn} value={h.labelCn}>{h.labelCn} ({h.multiplier}x)</option>)
                        : BJ_OUTCOMES.map((b) => <option key={b.label} value={b.label}>{b.label}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">P&L</label>
                    <input type="number" value={roundInputs[p.id]?.pnl || 0}
                      onChange={(e) => updatePlayerResult(p.id, "pnl", Number(e.target.value))}
                      className={`w-full px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-center font-mono
                        ${(roundInputs[p.id]?.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={submitResults} className="w-full mt-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-lg active:scale-95 transition-all">
            ✅ Submit Round
          </button>
        </div>
      )}

      {/* Round History */}
      {room.rounds.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Round History</h2>
          <div className="space-y-2">
            {[...room.rounds].reverse().map((r) => (
              <div key={r.number} className="p-3 rounded-xl bg-white/[0.03]">
                <div className="text-xs text-gray-500 mb-2">Round {r.number}</div>
                <div className="grid grid-cols-2 gap-2">
                  {r.results.map((res, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-400">{res.playerName}</span>
                      <span className={`font-mono ${res.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {res.pnl >= 0 ? "+" : ""}{res.pnl}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settlement */}
      {showSettle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-white/10">
            <h2 className="text-xl font-bold text-white mb-4 text-center">💰 Settlement</h2>
            <div className="space-y-3 mb-6">
              {room.players.sort((a, b) => b.score - a.score).map((p) => (
                <div key={p.id} className="flex justify-between items-center">
                  <span className="text-white">{p.name}</span>
                  <span className={`text-xl font-bold font-mono ${p.score >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {p.score >= 0 ? "+" : ""}{p.score}
                  </span>
                </div>
              ))}
            </div>
            {settlements.length > 0 && (
              <>
                <h3 className="text-sm text-gray-400 mb-2">Transfers:</h3>
                <div className="space-y-2 mb-6">
                  {settlements.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                      <span className="text-red-400">{s.from}</span>
                      <span className="text-gray-500">→ pays {s.amount} →</span>
                      <span className="text-green-400">{s.to}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => { setShowSettle(false); router.push("/"); }} className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Host Controls */}
      {isHost && room.status !== "settled" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f] to-transparent">
          <div className="flex gap-3 max-w-md mx-auto">
            {!showRoundInput ? (
              <button onClick={startRound} className="flex-1 py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-lg font-bold active:scale-95 transition-all">
                🎲 New Round
              </button>
            ) : null}
            <button onClick={endSession} className="py-4 px-6 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold active:scale-95 transition-all border border-red-500/20">
              End
            </button>
          </div>
        </div>
      )}

      {/* Player waiting indicator */}
      {!isHost && room.status === "playing" && (
        <div className="text-center text-gray-500 py-8">
          <div className="text-4xl mb-2">⏳</div>
          <div>Waiting for host to submit round results...</div>
        </div>
      )}
    </div>
  );
}
