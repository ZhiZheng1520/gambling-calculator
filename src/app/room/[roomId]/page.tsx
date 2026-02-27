"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { NIUNIU_HANDS, BJ_DEALER_HANDS, BJ_PLAYER_HANDS, calcBjPnl } from "@/lib/types";
import { evaluateNiuniu, evaluateBlackjack, parseCard } from "@/lib/cards";

const API = typeof window !== "undefined" ? window.location.origin : "";

interface Player { id: string; name: string; score: number; isHost: boolean; isDealer: boolean; bet: number; }
interface RoundResult { playerId: string; playerName: string; bet: number; outcome: string; multiplier: number; pnl: number; }
interface Round { number: number; results: RoundResult[]; timestamp: string; }
interface Room { id: string; game: "21"|"niuniu"; players: Player[]; rounds: Round[]; status: string; currentRound: number; baseBet: number; updatedAt: string; useCards: boolean; hands?: Record<string, string[]>; dealerCards?: string[]; bjPlayerStatus?: Record<string, string>; }
interface Settlement { from: string; to: string; amount: number; }

// Card display component
function CardView({ card, small }: { card: string; small?: boolean }) {
  if (!card || card === "🂠") return <span className={`inline-flex items-center justify-center ${small ? "w-8 h-11" : "w-10 h-14"} bg-blue-900 border border-blue-700 rounded-lg text-lg`}>🂠</span>;
  try {
    const { rank, suit } = parseCard(card);
    const red = suit === "♥" || suit === "♦";
    return (
      <span className={`inline-flex flex-col items-center justify-center ${small ? "w-8 h-11 text-xs" : "w-10 h-14 text-sm"} bg-white border border-gray-300 rounded-lg font-bold ${red ? "text-red-600" : "text-gray-900"}`}>
        <span className="leading-none">{rank}</span>
        <span className="leading-none">{suit}</span>
      </span>
    );
  } catch { return <span className={`inline-flex items-center justify-center ${small ? "w-8 h-11" : "w-10 h-14"} bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-400`}>{card}</span>; }
}

function HandDisplay({ cards, label, eval: evalStr, small }: { cards: string[]; label?: string; eval?: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {label && <span className="text-xs text-gray-500 mr-1">{label}</span>}
      {cards.map((c, i) => <CardView key={i} card={c} small={small} />)}
      {evalStr && <span className="text-xs font-bold text-yellow-400 ml-1">{evalStr}</span>}
    </div>
  );
}

function calcNiuniuPnl(playerHand: string, dealerHand: string, bet: number): number {
  const handRank = (h: string) => NIUNIU_HANDS.findIndex(x => x.labelCn === h);
  const mult = (h: string) => NIUNIU_HANDS.find(x => x.labelCn === h)?.multiplier || 1;
  const pr = handRank(playerHand), dr = handRank(dealerHand);
  if (pr < 0 || dr < 0) return 0;
  if (pr > dr) return bet * mult(playerHand);
  if (pr < dr) return -(bet * mult(dealerHand));
  return 0; // tie = draw
}

export default function RoomPage() {
  const { roomId } = useParams();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [myId, setMyId] = useState("");
  const [showRoundInput, setShowRoundInput] = useState(false);
  const [roundInputs, setRoundInputs] = useState<Record<string, { outcome: string; bet: number; multiplier: number; pnl: number; customPnl: boolean }>>({});
  const [dealerHand, setDealerHand] = useState("无牛");
  const [bjDealerHand, setBjDealerHand] = useState("17");
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [showSettle, setShowSettle] = useState(false);
  const [adjustPlayer, setAdjustPlayer] = useState<Player | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [myBet, setMyBet] = useState(0);
  const [customBet, setCustomBet] = useState("");
  const [toast, setToast] = useState("");
  const [roomGone, setRoomGone] = useState(false);
  const lastUpdate = useRef("");
  const prevRound = useRef(0);

  const effectiveId = myId || (typeof window !== "undefined" ? localStorage.getItem("playerId") || "" : "");
  const me = room?.players.find(p => p.id === effectiveId);
  const isHost = me?.isHost || false;
  const isDealer = me?.isDealer || false;
  const isHostOrDealer = isHost || isDealer;
  const isPlayer = !isDealer;

  useEffect(() => { setMyId(localStorage.getItem("playerId") || ""); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); } }, [toast]);

  // Join room (runs once on mount, doesn't need myId)
  const joinedRef = useRef(false);
  useEffect(() => {
    if (!roomId || joinedRef.current) return;
    const pname = localStorage.getItem("playerName") || "Player";
    let retries = 0;
    const tryJoin = () => {
      fetch(`${API}/api/room/${(roomId as string).toUpperCase()}/join`, {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ playerName: pname }),
      }).then(async r => {
        const text = await r.text();
        let d;
        try { d = JSON.parse(text); } catch { throw new Error("Non-JSON response: " + text.slice(0, 100)); }
        if (d.success) {
          joinedRef.current = true;
          if (d.playerId) { setMyId(d.playerId); localStorage.setItem("playerId", d.playerId); }
          setRoom(d.room);
          lastUpdate.current = d.room.updatedAt;
          setMyBet(d.room.baseBet);
        } else {
          console.error("[room] join failed:", d.error);
          if (d.settled) {
            // Room exists but settled — fetch state directly so user can view final scores
            const sr = await fetch(`${API}/api/room/${(roomId as string).toUpperCase()}`);
            if (sr.ok) { const sd = await sr.json(); setRoom(sd); setShowSettle(true); joinedRef.current = true; }
            else setRoomGone(true);
          } else if (retries < 3) { retries++; setTimeout(tryJoin, 1500); }
          else setRoomGone(true);
        }
      }).catch(err => {
        console.error("[room] join error:", err);
        if (retries < 3) { retries++; setTimeout(tryJoin, 1500); }
        else setRoomGone(true);
      });
    };
    // Small delay to let localStorage settle after redirect
    setTimeout(tryJoin, 300);
  }, [roomId]);

  // Poll
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    const poll = async () => {
      try {
        const storedPid = localStorage.getItem("playerId") || myId || "";
        const res = await fetch(`${API}/api/room/${(roomId as string).toUpperCase()}?playerId=${storedPid}`);
        if (res.status === 404) { setRoomGone(true); return; }
        if (res.ok) {
          const data: Room = await res.json();
          if (data.updatedAt !== lastUpdate.current) {
            lastUpdate.current = data.updatedAt;
            setRoom(data);
            if (data.currentRound > prevRound.current && data.status === "playing") {
              if (!showRoundInput) setShowRoundInput(true);
            }
            if (data.status === "waiting" && showRoundInput) setShowRoundInput(false);
            if (data.status === "settled" && !showSettle) setShowSettle(true);
            prevRound.current = data.currentRound;
          }
        }
      } catch { /* ignore */ }
      if (active) setTimeout(poll, 1500);
    };
    const t = setTimeout(poll, 1500);
    return () => { active = false; clearTimeout(t); };
  }, [roomId, showRoundInput, showSettle]);

  const doAction = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const pid = myId || localStorage.getItem("playerId") || "";
    if (!roomId || !pid) return null;
    const res = await fetch(`${API}/api/room/${(roomId as string).toUpperCase()}/action`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ action, playerId: pid, ...extra }),
    });
    const data = await res.json();
    if (data.room) { setRoom(data.room); lastUpdate.current = data.room.updatedAt; }
    if (data.settlements) setSettlements(data.settlements);
    return data;
  }, [roomId, myId]);

  const copyRoomCode = () => { navigator.clipboard?.writeText(room?.id || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const shareRoom = async () => {
    const url = `${window.location.origin}/room/${room?.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Join ${room?.game === "niuniu" ? "🐂 牛牛" : "🃏 21点"} Room`, text: `Room Code: ${room?.id}`, url }); } catch {}
    } else {
      navigator.clipboard?.writeText(url);
      setToast("Link copied! 链接已复制");
    }
  };

  const initRoundInputs = useCallback(() => {
    if (!room) return;
    const inputs: typeof roundInputs = {};
    
    // If cards are dealt, auto-evaluate hands
    let autoDealerHand = dealerHand;
    let autoBjDealerHand = bjDealerHand;
    if (room.useCards && room.dealerCards && room.dealerCards.every(c => c !== "🂠")) {
      if (room.game === "niuniu") {
        const dEval = evaluateNiuniu(room.dealerCards);
        autoDealerHand = dEval.hand;
        setDealerHand(dEval.hand);
      } else {
        const dEval = evaluateBlackjack(room.dealerCards);
        autoBjDealerHand = dEval.isBust ? "bust" : dEval.isBlackjack ? "blackjack" : dEval.total.toString();
        if (dEval.total <= 12 && !dEval.isBust && !dEval.isBlackjack) autoBjDealerHand = "12-";
        setBjDealerHand(autoBjDealerHand);
      }
    }
    
    room.players.filter(p => !p.isDealer).forEach(p => {
      const bet = p.bet || room.baseBet;
      let defaultOutcome = room.game === "niuniu" ? "无牛" : "12-";
      
      // Auto-evaluate from cards if available
      if (room.useCards && room.hands?.[p.id] && room.hands[p.id].every((c: string) => c !== "🂠")) {
        if (room.game === "niuniu") {
          const pEval = evaluateNiuniu(room.hands[p.id]);
          defaultOutcome = pEval.hand;
        } else {
          const pEval = evaluateBlackjack(room.hands[p.id]);
          const bjStatus = room.bjPlayerStatus?.[p.id];
          if (pEval.isBust || bjStatus === "bust") defaultOutcome = "bust";
          else if (pEval.isBlackjack) defaultOutcome = "blackjack";
          else if (bjStatus === "dd") defaultOutcome = pEval.total > 21 ? "dd-lose" : "dd-win"; // simplified
          else defaultOutcome = pEval.total <= 12 ? "12-" : pEval.total.toString();
        }
      }
      
      let pnl = 0;
      if (room.game === "niuniu") {
        pnl = calcNiuniuPnl(defaultOutcome, autoDealerHand, bet);
      } else {
        pnl = calcBjPnl(defaultOutcome, autoBjDealerHand, bet);
      }
      inputs[p.id] = { outcome: defaultOutcome, bet, multiplier: 1, pnl, customPnl: false };
    });
    setRoundInputs(inputs);
  }, [room, dealerHand, bjDealerHand]);

  const updatePlayerResult = (playerId: string, field: string, value: unknown) => {
    setRoundInputs(prev => {
      const p = { ...prev[playerId], [field]: value as number };
      if (field === "pnl") {
        p.customPnl = true;
      } else if (!p.customPnl) {
        if (room?.game === "niuniu") {
          p.pnl = calcNiuniuPnl(p.outcome, dealerHand, p.bet);
        } else {
          p.pnl = calcBjPnl(p.outcome, bjDealerHand, p.bet);
        }
      }
      return { ...prev, [playerId]: p };
    });
  };

  const recalcAll = (newDH: string) => {
    setDealerHand(newDH);
    setRoundInputs(prev => {
      const next = { ...prev };
      for (const pid of Object.keys(next)) {
        if (!next[pid].customPnl) {
          next[pid] = { ...next[pid], pnl: calcNiuniuPnl(next[pid].outcome, newDH, next[pid].bet) };
        }
      }
      return next;
    });
  };

  const recalcAllBj = (newDH: string) => {
    setBjDealerHand(newDH);
    setRoundInputs(prev => {
      const next = { ...prev };
      for (const pid of Object.keys(next)) {
        if (!next[pid].customPnl) {
          next[pid] = { ...next[pid], pnl: calcBjPnl(next[pid].outcome, newDH, next[pid].bet) };
        }
      }
      return next;
    });
  };

  const startRound = async () => {
    await doAction("start-round");
    initRoundInputs();
    setShowRoundInput(true);
  };

  const cancelRound = async () => {
    await doAction("cancel-round");
    setShowRoundInput(false);
    setToast("Round cancelled");
  };

  const undoLastRound = async () => {
    const res = await doAction("undo-round");
    if (res?.success) setToast("Last round undone ↩️");
    else setToast(res?.error || "Cannot undo");
  };

  const submitResults = async () => {
    const results: RoundResult[] = Object.entries(roundInputs).map(([pid, r]) => ({
      playerId: pid, playerName: room?.players.find(p => p.id === pid)?.name || "",
      bet: r.bet, outcome: r.outcome, multiplier: r.multiplier, pnl: r.pnl,
    }));
    await doAction("submit-results", { results });
    setShowRoundInput(false);
    setToast("Round submitted ✅");
  };

  const setBet = async (bet: number) => {
    setMyBet(bet);
    setCustomBet("");
    await doAction("set-bet", { bet });
  };

  const handleCustomBet = async () => {
    const val = Number(customBet);
    if (val >= 1) {
      setMyBet(val);
      await doAction("set-bet", { bet: val });
      setToast(`Bet set to RM${val}`);
    }
  };

  if (roomGone) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0f] gap-4">
      <div className="text-4xl">😵</div>
      <div className="text-gray-400 text-center">Room expired or ended.<br/>Ask host for the new room code!</div>
      <button onClick={() => router.push("/")} className="px-6 py-3 rounded-xl bg-purple-600 text-white font-bold">🏠 Back to Home</button>
    </div>
  );

  if (!room) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]"><div className="text-gray-500">Loading room...</div></div>;

  const playerCount = room.players.length;
  const dealerPlayer = room.players.find(p => p.isDealer);

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4 pb-28">
      <style>{`input, select, textarea { font-size: 16px !important; }`}</style>
      
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-purple-600/90 text-white px-4 py-2 rounded-xl text-sm font-medium backdrop-blur animate-pulse">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{room.game === "niuniu" ? "🐂" : "🃏"}</span>
            <h1 className="text-xl font-bold text-white">{room.game === "niuniu" ? "牛牛" : "21点"}</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={copyRoomCode} className="text-lg font-mono font-bold tracking-[0.15em] bg-purple-600/30 text-purple-300 px-3 py-1 rounded-lg hover:bg-purple-600/50 active:scale-95 transition-all">{copied ? "✅ Copied!" : `${room.id} 📋`}</button>
            <button onClick={shareRoom} className="text-sm bg-green-600/30 text-green-300 px-2 py-1 rounded-lg hover:bg-green-600/50 active:scale-95">🔗</button>
            <span className="text-xs text-gray-500">{room.status === "playing" ? `Round ${room.currentRound}` : room.currentRound > 0 ? `${room.currentRound} rounds` : "Ready"}</span>
            <span className="text-xs text-gray-500">👥{playerCount}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">
            {me?.name} {isHost && "👑"} {isDealer && <span className="text-red-400 font-bold">庄</span>}
          </div>
          <div className={`text-xl font-bold font-mono ${(me?.score || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
            {(me?.score || 0) >= 0 ? "+" : ""}{me?.score || 0}
          </div>
        </div>
      </div>

      {/* Bet Selector (any non-dealer player) */}
      {isPlayer && room.status === "waiting" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
          <h2 className="text-sm font-medium text-gray-400 mb-2">Your Bet 你的注 <span className="text-xs text-gray-600">(current: RM{myBet || room.baseBet})</span></h2>
          <div className="flex gap-2 mb-2">
            {[1,2,3,5,10].map(amt => (
              <button key={amt} onClick={() => setBet(amt)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${myBet === amt && !customBet ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg" : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10"}`}>RM{amt}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" inputMode="decimal" value={customBet} onChange={e => setCustomBet(e.target.value)} placeholder="Custom 自定义" className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50" />
            <button onClick={handleCustomBet} className="px-4 py-2 rounded-xl bg-purple-600/30 text-purple-300 text-sm font-bold hover:bg-purple-600/50">Set</button>
          </div>
        </div>
      )}

      {/* Cards Section (when useCards is enabled) */}
      {room.useCards && room.hands && (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 mb-4">
          <h2 className="text-sm font-medium text-purple-400 mb-3">🃏 Cards</h2>
          
          {/* Dealer cards */}
          {room.dealerCards && room.dealerCards.length > 0 && (
            <div className="mb-3 p-2 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-xs text-red-300 mb-1">庄家 Dealer</div>
              <HandDisplay cards={room.dealerCards} eval={
                isHostOrDealer && room.dealerCards.every(c => c !== "🂠")
                  ? room.game === "niuniu" 
                    ? evaluateNiuniu(room.dealerCards).hand
                    : evaluateBlackjack(room.dealerCards).display
                  : undefined
              } />
            </div>
          )}

          {/* Player hands */}
          {room.players.filter(p => !p.isDealer && room.hands?.[p.id]).map(p => {
            const cards = room.hands![p.id];
            const isMine = p.id === effectiveId;
            const realCards = cards.filter(c => c !== "🂠");
            let evalStr: string | undefined;
            if (isMine || isHostOrDealer) {
              if (room.game === "niuniu" && realCards.length === 5) {
                const result = evaluateNiuniu(realCards);
                evalStr = `${result.hand} (${result.multiplier}x)`;
              } else if (room.game === "21" && realCards.length >= 2) {
                const result = evaluateBlackjack(realCards);
                evalStr = result.display;
              }
            }
            const bjStatus = room.bjPlayerStatus?.[p.id];
            
            return (
              <div key={p.id} className={`mb-2 p-2 rounded-xl ${isMine ? "bg-purple-500/10 border border-purple-500/20" : "bg-white/[0.03]"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{p.name}{isMine ? " (you)" : ""}</span>
                  {bjStatus && <span className={`text-xs px-2 py-0.5 rounded ${bjStatus === "bust" ? "bg-red-500/20 text-red-400" : bjStatus === "blackjack" ? "bg-yellow-500/20 text-yellow-400" : bjStatus === "stand" || bjStatus === "dd" ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"}`}>{bjStatus}</span>}
                </div>
                <HandDisplay cards={cards} eval={evalStr} />
                
                {/* 21点 player actions (only for own hand) */}
                {isMine && !isDealer && room.game === "21" && bjStatus === "playing" && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => doAction("hit")} className="flex-1 py-2 rounded-lg bg-green-600/30 text-green-400 font-bold text-sm active:scale-95">Hit 要牌</button>
                    <button onClick={() => doAction("stand")} className="flex-1 py-2 rounded-lg bg-yellow-600/30 text-yellow-400 font-bold text-sm active:scale-95">Stand 停牌</button>
                    {cards.length === 2 && <button onClick={() => doAction("double-down")} className="flex-1 py-2 rounded-lg bg-purple-600/30 text-purple-400 font-bold text-sm active:scale-95">Double 双倍</button>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Deal / Dealer Play buttons */}
          {isHostOrDealer && (
            <div className="flex gap-2 mt-2">
              {!room.hands || Object.keys(room.hands).length === 0 ? (
                <button onClick={() => doAction("deal-cards")} className="flex-1 py-2 rounded-lg bg-purple-600 text-white font-bold text-sm active:scale-95">🎴 Deal Cards 发牌</button>
              ) : (
                <>
                  <button onClick={() => doAction("deal-cards")} className="flex-1 py-2 rounded-lg bg-purple-600/30 text-purple-400 font-bold text-sm active:scale-95">🔄 Re-Deal</button>
                  {room.game === "21" && (
                    <button onClick={() => doAction("dealer-play")} className="flex-1 py-2 rounded-lg bg-red-600/30 text-red-400 font-bold text-sm active:scale-95">庄家开牌 Reveal</button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Deal button when useCards but no cards yet */}
      {room.useCards && !room.hands && isHostOrDealer && room.status === "playing" && (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 mb-4 text-center">
          <button onClick={() => doAction("deal-cards")} className="py-3 px-8 rounded-xl bg-purple-600 text-white font-bold text-lg active:scale-95">🎴 Deal Cards 发牌</button>
        </div>
      )}

      {/* Scoreboard */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-400 mb-3">Scoreboard</h2>
        <div className="space-y-2">
          {room.players.sort((a, b) => b.score - a.score).map(p => (
            <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl ${p.id === effectiveId ? "bg-purple-500/10 border border-purple-500/20" : "bg-white/[0.03]"}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-white font-medium truncate">{p.name}</span>
                {p.isHost && <span className="text-xs text-yellow-400 shrink-0">👑</span>}
                {p.isDealer && <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded font-bold shrink-0">庄</span>}
                {!p.isDealer && <span className="text-xs text-gray-600 shrink-0">RM{p.bet || room.baseBet}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-lg font-bold font-mono ${p.score >= 0 ? "text-green-400" : "text-red-400"}`}>{p.score >= 0 ? "+" : ""}{p.score}</span>
                {isHost && (
                  <div className="flex gap-1">
                    {!p.isDealer && <button onClick={() => doAction("set-dealer", { targetPlayerId: p.id })} className="text-xs px-1.5 py-1 rounded bg-red-500/20 text-red-300">庄</button>}
                    {p.id !== myId && <button onClick={() => doAction("transfer-host", { targetPlayerId: p.id })} className="text-xs px-1.5 py-1 rounded bg-yellow-500/20 text-yellow-300">👑</button>}
                    <button onClick={() => { setAdjustPlayer(p); setAdjustAmount(0); }} className="text-xs px-1.5 py-1 rounded bg-blue-500/20 text-blue-300">±</button>
                    {p.id !== myId && <button onClick={() => doAction("kick-player", { targetPlayerId: p.id })} className="text-xs px-1.5 py-1 rounded bg-gray-500/20 text-gray-400">✕</button>}
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
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm border border-white/10" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">Adjust {adjustPlayer.name}</h3>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setAdjustAmount(a => a - 1)} className="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 text-2xl font-bold active:scale-95">−</button>
              <input type="text" inputMode="numeric" value={adjustAmount} onChange={e => { const v = e.target.value; if (v === "" || v === "-") setAdjustAmount(0 as unknown as number); else setAdjustAmount(Number(v)); }} className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg text-center" placeholder="0" />
              <button onClick={() => setAdjustAmount(a => a + 1)} className="w-12 h-12 rounded-xl bg-green-500/20 text-green-400 text-2xl font-bold active:scale-95">+</button>
            </div>
            <div className="flex gap-2 mb-4">
              {[-10,-5,-1,1,5,10].map(v => (
                <button key={v} onClick={() => setAdjustAmount(v)} className={`flex-1 py-2 rounded-lg text-sm font-bold ${v < 0 ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>{v > 0 ? "+" : ""}{v}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setAdjustPlayer(null)} className="py-2 rounded-xl bg-white/10 text-gray-400">Cancel</button>
              <button onClick={() => { doAction("adjust-score", { targetPlayerId: adjustPlayer.id, amount: adjustAmount }); setAdjustPlayer(null); }} className="py-2 rounded-xl bg-purple-600 text-white font-bold">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Round Input (Host/Dealer) */}
      {isHostOrDealer && showRoundInput && (
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-yellow-400">Round {room.currentRound} — Enter Results</h2>
            <button onClick={cancelRound} className="text-xs px-3 py-1 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30">✕ Cancel</button>
          </div>
          
          {/* Niuniu: Dealer Hand */}
          {room.game === "niuniu" && (
            <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <label className="text-xs text-red-300 mb-1 block">Dealer Hand 庄家牌型</label>
              <select value={dealerHand} onChange={e => recalcAll(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white">
                {NIUNIU_HANDS.map(h => <option key={h.labelCn} value={h.labelCn}>{h.labelCn} ({h.multiplier}x)</option>)}
              </select>
            </div>
          )}

          {/* 21点: Dealer Hand */}
          {room.game === "21" && (
            <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <label className="text-xs text-red-300 mb-1 block">Dealer Hand 庄家牌型</label>
              <select value={bjDealerHand} onChange={e => recalcAllBj(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white">
                {BJ_DEALER_HANDS.map(h => <option key={h.value} value={h.value}>{h.labelCn}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-3">
            {room.players.filter(p => !p.isDealer).map(p => (
              <div key={p.id} className="p-3 rounded-xl bg-white/[0.03]">
                <div className="flex justify-between text-white font-medium mb-2">
                  <span className="truncate">{p.name}</span>
                  <span className="text-xs text-gray-500 shrink-0">Bet: RM{roundInputs[p.id]?.bet || p.bet || room.baseBet}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Result</label>
                    <select value={roundInputs[p.id]?.outcome || ""} onChange={e => { updatePlayerResult(p.id, "outcome", e.target.value); setRoundInputs(prev => ({ ...prev, [p.id]: { ...prev[p.id], customPnl: false } })); }} className="w-full px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-white">
                      {room.game === "niuniu"
                        ? NIUNIU_HANDS.map(h => <option key={h.labelCn} value={h.labelCn}>{h.labelCn} ({h.multiplier}x)</option>)
                        : BJ_PLAYER_HANDS.map(h => <option key={h.value} value={h.value}>{h.labelCn}</option>)
                      }
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">P&L {roundInputs[p.id]?.customPnl && <span className="text-orange-400">(custom)</span>}</label>
                    <input type="text" inputMode="numeric" value={roundInputs[p.id]?.pnl ?? 0} onChange={e => { const v = e.target.value; updatePlayerResult(p.id, "pnl", v === "" || v === "-" ? 0 : Number(v)); }}
                      className={`w-full px-2 py-2 rounded-lg border text-center font-mono ${roundInputs[p.id]?.customPnl ? "bg-orange-500/10 border-orange-500/30" : "bg-white/5 border-white/10"} ${(roundInputs[p.id]?.pnl || 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                      placeholder="Custom" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Dealer PnL preview */}
          {Object.keys(roundInputs).length > 0 && (() => {
            const totalPlayerPnl = Object.values(roundInputs).reduce((s, r) => s + (r.pnl || 0), 0);
            const dealerPnl = -totalPlayerPnl;
            return (
              <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex justify-between items-center">
                <span className="text-sm text-red-300">庄家 {dealerPlayer?.name?.split(" ").pop() || "Dealer"} P&L:</span>
                <span className={`text-lg font-bold font-mono ${dealerPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{dealerPnl >= 0 ? "+" : ""}{Math.round(dealerPnl * 100) / 100}</span>
              </div>
            );
          })()}
          <button onClick={submitResults} className="w-full mt-4 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-lg active:scale-95 transition-all">✅ Submit Round</button>
        </div>
      )}

      {/* Round History */}
      {room.rounds.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-400">Round History</h2>
            {isHostOrDealer && !showRoundInput && (
              <button onClick={undoLastRound} className="text-xs px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30">↩️ Undo Last</button>
            )}
          </div>
          <div className="space-y-2">
            {[...room.rounds].reverse().map(r => (
              <div key={r.number} className="p-3 rounded-xl bg-white/[0.03]">
                <div className="text-xs text-gray-500 mb-2">Round {r.number}</div>
                <div className="space-y-1">
                  {r.results.map((res, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{res.playerName?.split(" ").pop()}</span>
                        {res.outcome && res.outcome !== "Dealer" && <span className="text-xs text-gray-600">{res.outcome}</span>}
                        {res.outcome === "Dealer" && <span className="text-xs text-red-400">庄</span>}
                      </div>
                      <span className={`font-mono ${res.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{res.pnl >= 0 ? "+" : ""}{res.pnl}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settlement Modal */}
      {showSettle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-white/10">
            <h2 className="text-xl font-bold text-white mb-4 text-center">💰 Settlement 结算</h2>
            <div className="space-y-3 mb-6">
              {room.players.sort((a, b) => b.score - a.score).map(p => (
                <div key={p.id} className="flex justify-between">
                  <span className="text-white">{p.name}</span>
                  <span className={`text-xl font-bold font-mono ${p.score >= 0 ? "text-green-400" : "text-red-400"}`}>{p.score >= 0 ? "+" : ""}{p.score}</span>
                </div>
              ))}
            </div>
            {settlements.length > 0 && (
              <>
                <h3 className="text-sm text-gray-400 mb-2">Transfers 转账:</h3>
                <div className="space-y-2 mb-6">
                  {settlements.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                      <span className="text-red-400">{s.from}</span>
                      <span className="text-gray-500">→ RM{s.amount} →</span>
                      <span className="text-green-400">{s.to}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => { setShowSettle(false); router.push("/"); }} className="w-full py-3 rounded-xl bg-purple-600 text-white font-bold">Done 完成</button>
          </div>
        </div>
      )}

      {/* Host/Dealer Controls */}
      {isHostOrDealer && room.status !== "settled" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f] to-transparent">
          <div className="flex gap-3 max-w-md mx-auto">
            {!showRoundInput && <button onClick={startRound} className="flex-1 py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-lg font-bold active:scale-95 transition-all">🎲 New Round</button>}
            <button onClick={() => { doAction("end-session"); setShowSettle(true); }} className="py-4 px-6 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold active:scale-95 border border-red-500/20">End</button>
          </div>
        </div>
      )}

      {/* Player waiting */}
      {!isHostOrDealer && room.status === "playing" && (
        <div className="text-center text-gray-500 py-8">
          <div className="text-4xl mb-2">⏳</div>
          <div>Waiting for dealer to submit results...</div>
          <div className="text-xs mt-1">等待庄家提交结果...</div>
        </div>
      )}
    </div>
  );
}
