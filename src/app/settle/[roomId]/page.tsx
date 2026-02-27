'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { RoomState, Settlement } from '@/lib/types';
import { calculateSettlements } from '@/lib/game-logic';

export default function SettlementPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const [room, setRoom] = useState<RoomState | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const socket = getSocket();

    socket.emit('get-room', { roomId }, ({ success, state, error: err }: { success: boolean; state?: RoomState; error?: string }) => {
      if (success && state) {
        setRoom(state);
        setSettlements(calculateSettlements(state.players));
      } else {
        setError(err || 'Room not found');
      }
    });

    socket.on('room-state', (state: RoomState) => {
      setRoom(state);
      setSettlements(calculateSettlements(state.players));
    });

    return () => {
      socket.off('room-state');
    };
  }, [roomId]);

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

  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">结算 Settlement</h1>
        <p className="text-gray-400">
          {room.game === '21' ? '21点 Blackjack' : '牛牛 Niu Niu'} · Room {room.id}
        </p>
        <p className="text-gray-500 text-sm">{room.rounds.length} rounds played</p>
      </div>

      {/* Final Scoreboard */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">最终积分 Final Scores</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {sortedPlayers.map((player, idx) => (
            <div key={player.id} className="p-4 flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                idx === 0 ? 'bg-amber-500 text-black' :
                idx === 1 ? 'bg-gray-400 text-black' :
                idx === 2 ? 'bg-amber-700 text-white' :
                'bg-gray-700 text-gray-300'
              }`}>
                {idx + 1}
              </div>
              <div className="flex-1">
                <span className="font-semibold text-lg">{player.name}</span>
                {player.isDealer && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-amber-600 rounded-full">庄</span>
                )}
              </div>
              <div className={`text-2xl font-bold font-mono ${
                player.score > 0 ? 'text-emerald-400' : player.score < 0 ? 'text-red-400' : 'text-gray-400'
              }`}>
                {player.score > 0 ? '+' : ''}{player.score}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Settlement Transfers */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">转账明细 Who Owes Whom</h2>
        </div>
        {settlements.length === 0 ? (
          <div className="p-8 text-center text-gray-500">All settled! No transfers needed.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {settlements.map((s, i) => (
              <div key={i} className="p-4 flex items-center gap-3">
                <span className="text-red-400 font-semibold">{s.from}</span>
                <span className="text-gray-500 flex-1 text-center">
                  <span className="inline-block">
                    →  <span className="font-mono font-bold text-amber-400">{s.amount}</span>  →
                  </span>
                </span>
                <span className="text-emerald-400 font-semibold">{s.to}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Round-by-Round Summary */}
      {room.rounds.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold">每轮详情 Round Details</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {room.rounds.map((round) => (
              <div key={round.number} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-300">Round {round.number}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(round.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
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

      {/* Back Button */}
      <div className="text-center">
        <button
          onClick={() => router.push('/')}
          className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-lg font-semibold transition-colors"
        >
          返回首页 Back Home
        </button>
      </div>
    </div>
  );
}
