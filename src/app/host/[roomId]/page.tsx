'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { RoomState, RoundResult, BlackjackOutcome, NiuniuHand } from '@/lib/types';
import { BLACKJACK_LABELS, NIUNIU_LABELS, getNiuniuMultiplier, calculateBlackjackPnl } from '@/lib/game-logic';

export default function HostPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState('');
  const [showAdjust, setShowAdjust] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');

  // Host submit modal state
  const [submitForPlayer, setSubmitForPlayer] = useState<string | null>(null);
  const [bet, setBet] = useState('');
  const [bjOutcome, setBjOutcome] = useState<BlackjackOutcome>('win');
  const [niuHand, setNiuHand] = useState<NiuniuHand>('niuniu');
  const [niuWon, setNiuWon] = useState(true);

  const syncRoom = useCallback(() => {
    const socket = getSocket();
    socket.emit('host-join', { roomId }, ({ success, state, error: err }: { success: boolean; state?: RoomState; error?: string }) => {
      if (success && state) {
        setRoom(state);
      } else {
        setError(err || 'Room not found');
      }
    });
  }, [roomId]);

  useEffect(() => {
    const socket = getSocket();
    syncRoom();

    socket.on('room-state', (state: RoomState) => {
      setRoom(state);
    });

    return () => {
      socket.off('room-state');
    };
  }, [syncRoom]);

  const handleNewRound = () => {
    getSocket().emit('new-round', { roomId });
  };

  const handleEndRound = () => {
    getSocket().emit('end-round', { roomId });
  };

  const handleEndSession = () => {
    getSocket().emit('end-session', { roomId });
    router.push(`/settle/${roomId}`);
  };

  const handleSetDealer = (playerId: string) => {
    getSocket().emit('set-dealer', { roomId, playerId });
  };

  const handleKick = (playerId: string) => {
    getSocket().emit('kick-player', { roomId, playerId });
  };

  const handleAdjust = (playerId: string) => {
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount)) return;
    getSocket().emit('adjust-score', { roomId, playerId, amount });
    setShowAdjust(null);
    setAdjustAmount('');
  };

  const handleHostSubmit = (playerId: string) => {
    if (!room || !bet) return;
    const betNum = parseFloat(bet);
    if (isNaN(betNum) || betNum <= 0) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    let pnl: number;
    let multiplier: number;

    if (room.game === '21') {
      pnl = calculateBlackjackPnl(betNum, bjOutcome);
      multiplier = Math.abs(pnl) / betNum || 0;
    } else {
      multiplier = getNiuniuMultiplier(niuHand);
      pnl = niuWon ? betNum * multiplier : -betNum * multiplier;
    }

    const result: RoundResult = {
      playerId,
      playerName: player.name,
      bet: betNum,
      outcome: room.game === '21' ? bjOutcome : undefined,
      hand: room.game === 'niuniu' ? niuHand : undefined,
      multiplier,
      pnl,
    };

    getSocket().emit('submit-result', { roomId, result });
    setSubmitForPlayer(null);
    setBet('');
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-red-400 text-xl">{error}</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-gray-800 rounded-xl">
            Back Home
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-xl">Loading...</p>
      </div>
    );
  }

  const pendingCount = Object.keys(room.pendingResults).length;
  const nonDealerPlayers = room.players.filter(p => !p.isDealer);

  return (
    <div className="min-h-screen p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {room.game === '21' ? '21点 Blackjack' : '牛牛 Niu Niu'}
          </h1>
          <p className="text-gray-400">Host View</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-bold tracking-wider text-emerald-400">{room.id}</div>
          <div className="text-sm text-gray-400">
            Round {room.currentRound} · {room.players.length} players
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {room.status !== 'settled' && (
          <>
            <button
              onClick={handleNewRound}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-semibold transition-colors"
            >
              新一轮 New Round
            </button>
            {room.currentRound > 0 && pendingCount > 0 && (
              <button
                onClick={handleEndRound}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-colors"
              >
                结算本轮 End Round ({pendingCount}/{nonDealerPlayers.length})
              </button>
            )}
            <button
              onClick={handleEndSession}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-semibold transition-colors ml-auto"
            >
              结束 End Session
            </button>
          </>
        )}
        {room.status === 'settled' && (
          <button
            onClick={() => router.push(`/settle/${roomId}`)}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl font-semibold transition-colors"
          >
            查看结算 View Settlement
          </button>
        )}
      </div>

      {/* Scoreboard */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">积分板 Scoreboard</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {room.players.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Waiting for players to join...</div>
          ) : (
            room.players.map((player) => {
              const hasPending = room.pendingResults[player.id];
              return (
                <div key={player.id} className="p-4 flex items-center gap-4">
                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg truncate">{player.name}</span>
                      {player.isDealer && (
                        <span className="px-2 py-0.5 bg-amber-600 text-xs rounded-full font-semibold">庄 Dealer</span>
                      )}
                      {!player.connected && (
                        <span className="px-2 py-0.5 bg-gray-700 text-xs rounded-full text-gray-400">Offline</span>
                      )}
                      {hasPending && (
                        <span className="px-2 py-0.5 bg-blue-600 text-xs rounded-full">
                          Submitted: {hasPending.pnl > 0 ? '+' : ''}{hasPending.pnl}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className={`text-2xl font-bold font-mono min-w-[80px] text-right ${
                    player.score > 0 ? 'text-emerald-400' : player.score < 0 ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {player.score > 0 ? '+' : ''}{player.score}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {!player.isDealer && (
                      <button
                        onClick={() => handleSetDealer(player.id)}
                        className="px-3 py-2 bg-amber-700 hover:bg-amber-600 rounded-lg text-xs transition-colors"
                      >
                        设为庄
                      </button>
                    )}
                    {room.currentRound > 0 && !player.isDealer && !hasPending && (
                      <button
                        onClick={() => { setSubmitForPlayer(player.id); setBet(''); }}
                        className="px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs transition-colors"
                      >
                        提交
                      </button>
                    )}
                    <button
                      onClick={() => { setShowAdjust(player.id); setAdjustAmount(''); }}
                      className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition-colors"
                    >
                      调分
                    </button>
                    <button
                      onClick={() => handleKick(player.id)}
                      className="px-3 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-xs transition-colors"
                    >
                      踢
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Adjust Score Modal */}
      {showAdjust && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowAdjust(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm space-y-4 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">调整分数 Adjust Score</h3>
            <input
              type="number"
              placeholder="Amount (+/-)"
              value={adjustAmount}
              onChange={e => setAdjustAmount(e.target.value)}
              className="w-full p-3 bg-gray-800 rounded-xl text-center text-lg border border-gray-700 focus:border-emerald-500 focus:outline-none"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setShowAdjust(null)} className="flex-1 py-3 bg-gray-700 rounded-xl">Cancel</button>
              <button onClick={() => handleAdjust(showAdjust)} className="flex-1 py-3 bg-emerald-600 rounded-xl font-semibold">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Host Submit for Player Modal */}
      {submitForPlayer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSubmitForPlayer(null)}>
          <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-sm space-y-4 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">
              提交结果 for {room.players.find(p => p.id === submitForPlayer)?.name}
            </h3>

            <input
              type="number"
              placeholder="下注 Bet Amount"
              value={bet}
              onChange={e => setBet(e.target.value)}
              className="w-full p-3 bg-gray-800 rounded-xl text-center text-lg border border-gray-700 focus:border-emerald-500 focus:outline-none"
              autoFocus
              min="1"
            />

            {room.game === '21' ? (
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(BLACKJACK_LABELS) as BlackjackOutcome[]).map(o => (
                  <button
                    key={o}
                    onClick={() => setBjOutcome(o)}
                    className={`p-3 rounded-xl text-sm font-semibold transition-colors ${
                      bjOutcome === o ? 'bg-emerald-600 border-2 border-emerald-400' : 'bg-gray-800 border-2 border-gray-700'
                    }`}
                  >
                    {BLACKJACK_LABELS[o]}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(NIUNIU_LABELS) as NiuniuHand[]).map(h => (
                    <button
                      key={h}
                      onClick={() => setNiuHand(h)}
                      className={`p-2 rounded-xl text-xs font-semibold transition-colors ${
                        niuHand === h ? 'bg-emerald-600 border-2 border-emerald-400' : 'bg-gray-800 border-2 border-gray-700'
                      }`}
                    >
                      {NIUNIU_LABELS[h]}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setNiuWon(true)}
                    className={`p-3 rounded-xl font-semibold ${niuWon ? 'bg-emerald-600' : 'bg-gray-800'}`}
                  >
                    赢 Win
                  </button>
                  <button
                    onClick={() => setNiuWon(false)}
                    className={`p-3 rounded-xl font-semibold ${!niuWon ? 'bg-red-600' : 'bg-gray-800'}`}
                  >
                    输 Lose
                  </button>
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => setSubmitForPlayer(null)} className="flex-1 py-3 bg-gray-700 rounded-xl">Cancel</button>
              <button onClick={() => handleHostSubmit(submitForPlayer)} className="flex-1 py-3 bg-emerald-600 rounded-xl font-semibold">Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Round History */}
      {room.rounds.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold">历史记录 Round History</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {[...room.rounds].reverse().map((round) => (
              <div key={round.number} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Round {round.number}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(round.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {round.results.map((r) => (
                    <span
                      key={r.playerId}
                      className={`px-3 py-1 rounded-full text-sm font-mono ${
                        r.pnl > 0 ? 'bg-emerald-900/50 text-emerald-400' : r.pnl < 0 ? 'bg-red-900/50 text-red-400' : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {r.playerName}: {r.pnl > 0 ? '+' : ''}{r.pnl}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
