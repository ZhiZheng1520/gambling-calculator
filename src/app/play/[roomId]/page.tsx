'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { RoomState, RoundResult, BlackjackOutcome, NiuniuHand } from '@/lib/types';
import { BLACKJACK_LABELS, NIUNIU_LABELS, getNiuniuMultiplier, calculateBlackjackPnl } from '@/lib/game-logic';

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState('');

  // Submission state
  const [bet, setBet] = useState('');
  const [bjOutcome, setBjOutcome] = useState<BlackjackOutcome>('win');
  const [niuHand, setNiuHand] = useState<NiuniuHand>('niuniu');
  const [niuWon, setNiuWon] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [currentRoundNum, setCurrentRoundNum] = useState(0);

  const getMyPlayer = useCallback(() => {
    if (!room) return null;
    const socket = getSocket();
    return room.players.find(p => p.id === socket.id) || null;
  }, [room]);

  useEffect(() => {
    const socket = getSocket();

    // Get initial state
    socket.emit('get-room', { roomId }, ({ success, state, error: err }: { success: boolean; state?: RoomState; error?: string }) => {
      if (success && state) {
        setRoom(state);
      } else {
        setError(err || 'Room not found');
      }
    });

    socket.on('room-state', (state: RoomState) => {
      setRoom(state);
    });

    socket.on('new-round', ({ round }: { round: number }) => {
      setSubmitted(false);
      setBet('');
      setCurrentRoundNum(round);
    });

    socket.on('kicked', () => {
      setError('You have been removed from the room');
    });

    socket.on('session-ended', () => {
      router.push(`/settle/${roomId}`);
    });

    return () => {
      socket.off('room-state');
      socket.off('new-round');
      socket.off('kicked');
      socket.off('session-ended');
    };
  }, [roomId, router]);

  // Track if we already submitted for this round
  useEffect(() => {
    if (!room) return;
    const socket = getSocket();
    const myId = socket.id;
    if (myId && room.pendingResults[myId]) {
      setSubmitted(true);
    }
    if (room.currentRound !== currentRoundNum) {
      setCurrentRoundNum(room.currentRound);
      if (!room.pendingResults[myId!]) {
        setSubmitted(false);
      }
    }
  }, [room, currentRoundNum]);

  const handleSubmit = () => {
    if (!room || !bet) return;
    const betNum = parseFloat(bet);
    if (isNaN(betNum) || betNum <= 0) return;

    const socket = getSocket();
    const me = getMyPlayer();
    if (!me) return;

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
      playerId: me.id,
      playerName: me.name,
      bet: betNum,
      outcome: room.game === '21' ? bjOutcome : undefined,
      hand: room.game === 'niuniu' ? niuHand : undefined,
      multiplier,
      pnl,
    };

    socket.emit('submit-result', { roomId, result });
    setSubmitted(true);
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

  const me = getMyPlayer();
  const isDealer = me?.isDealer ?? false;

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">
            {room.game === '21' ? '21点' : '牛牛'}
          </h1>
          <p className="text-gray-400 text-sm">{me?.name || 'Player'}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold tracking-wider text-emerald-400">{room.id}</div>
          <div className="text-xs text-gray-400">Round {room.currentRound}</div>
        </div>
      </div>

      {/* My Score */}
      <div className="bg-gray-900 rounded-2xl p-6 mb-6 border border-gray-800 text-center">
        <div className="text-sm text-gray-400 mb-1">我的积分 My Score</div>
        <div className={`text-5xl font-bold font-mono ${
          (me?.score ?? 0) > 0 ? 'text-emerald-400' : (me?.score ?? 0) < 0 ? 'text-red-400' : 'text-gray-300'
        }`}>
          {(me?.score ?? 0) > 0 ? '+' : ''}{me?.score ?? 0}
        </div>
        {isDealer && (
          <div className="mt-2">
            <span className="px-3 py-1 bg-amber-600 text-sm rounded-full font-semibold">庄家 Dealer</span>
          </div>
        )}
      </div>

      {/* Submit Result (non-dealer only, active round) */}
      {room.currentRound > 0 && !isDealer && room.status === 'playing' && (
        <div className="bg-gray-900 rounded-2xl p-6 mb-6 border border-gray-800 space-y-4">
          <h2 className="text-lg font-semibold">
            Round {room.currentRound} - {submitted ? '已提交 Submitted' : '提交结果 Submit Result'}
          </h2>

          {submitted ? (
            <div className="text-center py-4">
              <div className="text-emerald-400 text-lg font-semibold">Waiting for round to end...</div>
            </div>
          ) : (
            <>
              <input
                type="number"
                placeholder="下注 Bet Amount"
                value={bet}
                onChange={e => setBet(e.target.value)}
                className="w-full p-4 bg-gray-800 rounded-xl text-center text-2xl border border-gray-700 focus:border-emerald-500 focus:outline-none"
                min="1"
              />

              {room.game === '21' ? (
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(BLACKJACK_LABELS) as BlackjackOutcome[]).map(o => (
                    <button
                      key={o}
                      onClick={() => setBjOutcome(o)}
                      className={`p-4 rounded-xl font-semibold transition-all ${
                        bjOutcome === o
                          ? 'bg-emerald-600 border-2 border-emerald-400 scale-105'
                          : 'bg-gray-800 border-2 border-gray-700'
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
                        className={`p-3 rounded-xl text-sm font-semibold transition-all ${
                          niuHand === h
                            ? 'bg-emerald-600 border-2 border-emerald-400 scale-105'
                            : 'bg-gray-800 border-2 border-gray-700'
                        }`}
                      >
                        {NIUNIU_LABELS[h]}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setNiuWon(true)}
                      className={`p-4 rounded-xl text-lg font-bold transition-all ${
                        niuWon ? 'bg-emerald-600 scale-105' : 'bg-gray-800'
                      }`}
                    >
                      赢 Win
                    </button>
                    <button
                      onClick={() => setNiuWon(false)}
                      className={`p-4 rounded-xl text-lg font-bold transition-all ${
                        !niuWon ? 'bg-red-600 scale-105' : 'bg-gray-800'
                      }`}
                    >
                      输 Lose
                    </button>
                  </div>
                </>
              )}

              {/* Preview */}
              {bet && parseFloat(bet) > 0 && (
                <div className="text-center py-2">
                  <span className="text-gray-400">PnL: </span>
                  <span className={`font-bold font-mono text-lg ${
                    room.game === '21'
                      ? (calculateBlackjackPnl(parseFloat(bet), bjOutcome) >= 0 ? 'text-emerald-400' : 'text-red-400')
                      : (niuWon ? 'text-emerald-400' : 'text-red-400')
                  }`}>
                    {room.game === '21'
                      ? (calculateBlackjackPnl(parseFloat(bet), bjOutcome) > 0 ? '+' : '') + calculateBlackjackPnl(parseFloat(bet), bjOutcome)
                      : (niuWon ? '+' : '-') + (parseFloat(bet) * getNiuniuMultiplier(niuHand))
                    }
                  </span>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!bet || parseFloat(bet) <= 0}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-lg font-semibold transition-colors"
              >
                提交 Submit
              </button>
            </>
          )}
        </div>
      )}

      {/* Waiting state */}
      {room.currentRound === 0 && (
        <div className="bg-gray-900 rounded-2xl p-8 mb-6 border border-gray-800 text-center">
          <p className="text-gray-400 text-lg">等待主持人开始... Waiting for host to start...</p>
        </div>
      )}

      {/* Round History */}
      {room.rounds.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold">我的记录 My History</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {[...room.rounds].reverse().map((round) => {
              const myResult = round.results.find(r => r.playerName === me?.name);
              return (
                <div key={round.number} className="p-4 flex items-center justify-between">
                  <span className="text-gray-400">Round {round.number}</span>
                  {myResult ? (
                    <span className={`font-bold font-mono ${
                      myResult.pnl > 0 ? 'text-emerald-400' : myResult.pnl < 0 ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {myResult.pnl > 0 ? '+' : ''}{myResult.pnl}
                      <span className="text-xs text-gray-500 ml-2">(bet: {myResult.bet})</span>
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
