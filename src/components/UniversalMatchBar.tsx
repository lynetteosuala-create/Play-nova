import React, { useState } from 'react';
import { Bot, MessageSquare, Radio, RefreshCw, Send, Swords, UserCheck, Users } from 'lucide-react';
import type { DifficultyLevel, RoomSeat, RoomState } from '../types.ts';
import type { MatchPhase } from '../hooks/useUniversalMatchmaking.ts';

interface UniversalMatchBarProps {
  matchPhase: MatchPhase;
  secondsLeft: number;
  difficulty: DifficultyLevel;
  onChangeDifficulty: (d: DifficultyLevel) => void;
  liveMatch: RoomState | null;
  mySeat: RoomSeat | null;
  opponentSeat: RoomSeat | null;
  onlineCount: number;
  onSkipToAi: () => void;
  onSearchHuman: () => void;
  onLeaveHuman: () => void;
  onRematchHuman: () => void;
  onSendChat: (text: string) => void;
  showDuelBar?: boolean;
  hideDifficulty?: boolean;
  extraControls?: React.ReactNode;
}

export function UniversalMatchBar({
  matchPhase,
  secondsLeft,
  difficulty,
  onChangeDifficulty,
  liveMatch,
  mySeat,
  opponentSeat,
  onlineCount,
  onSkipToAi,
  onSearchHuman,
  onLeaveHuman,
  onRematchHuman,
  onSendChat,
  showDuelBar = false,
  hideDifficulty = false,
  extraControls,
}: UniversalMatchBarProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0E1324] px-4 py-3">
        {/* Status Indicator */}
        {matchPhase === 'searching' ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]">
              <Radio className="h-4 w-4 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                Searching for an online human opponent...{' '}
                <span className="font-mono tabular-nums text-[#38BDF8]">{secondsLeft.toFixed(1)}s</span>
              </p>
              <p className="text-[11px] text-slate-400">
                Auto-connects to intelligent AI if no human joins · {onlineCount} players online
              </p>
            </div>
          </div>
        ) : matchPhase === 'human' && liveMatch ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white flex items-center gap-2">
                <span>Live Human 1v1</span>
                <span className="text-slate-500">·</span>
                <span className="text-[#38BDF8]">
                  {mySeat?.username || 'You'} vs {opponentSeat?.username || 'Opponent'}
                </span>
              </p>
              <p className="text-[11px] text-slate-400">
                {liveMatch.winnerSummary
                  ? liveMatch.winnerSummary
                  : liveMatch.duelState?.statusText || `Round #${liveMatch.roundNumber} · Real-time WebSocket match`}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#8B5CF6]/40 bg-[#8B5CF6]/15 text-[#A78BFA]">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">
                PLAYNOVA AI Opponent
                {!hideDifficulty && (
                  <span className="ml-2 font-mono text-[11px] uppercase text-[#F97316]">({difficulty})</span>
                )}
              </p>
              <p className="text-[11px] text-slate-400">
                Instant adaptive AI opponent ready · {onlineCount > 1 ? `${onlineCount} players online` : 'Search humans anytime'}
              </p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!hideDifficulty && matchPhase !== 'human' && (
            <div className="flex items-center rounded-xl border border-white/[0.08] bg-[#060811] p-1">
              {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChangeDifficulty(d)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize whitespace-nowrap transition cursor-pointer ${
                    difficulty === d
                      ? 'bg-[#8B5CF6] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}

          {extraControls}

          {matchPhase === 'searching' && (
            <button
              type="button"
              onClick={onSkipToAi}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] px-3.5 py-2 text-xs font-bold text-[#060811] hover:brightness-110 whitespace-nowrap cursor-pointer"
            >
              <Bot className="h-3.5 w-3.5" />
              Play AI Now
            </button>
          )}

          {matchPhase === 'ai' && (
            <button
              type="button"
              onClick={onSearchHuman}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-3 py-2 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/20 whitespace-nowrap cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              Find Human Opponent
            </button>
          )}

          {matchPhase === 'human' && liveMatch && (
            <>
              <button
                type="button"
                onClick={() => setChatOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:border-[#38BDF8]/50 whitespace-nowrap cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5 text-[#38BDF8]" />
                Chat ({liveMatch.chatMessages.length})
              </button>
              {liveMatch.status === 'finished' && (
                <button
                  type="button"
                  onClick={onRematchHuman}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Rematch
                </button>
              )}
              <button
                type="button"
                onClick={onLeaveHuman}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <Swords className="h-3.5 w-3.5 text-[#F97316]" />
                Switch to AI
              </button>
            </>
          )}
        </div>
      </div>

      {/* Live Shared-Seed Duel Score Comparison */}
      {matchPhase === 'human' && liveMatch && showDuelBar && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#38BDF8]/25 bg-[#090F22] px-4 py-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-white">{mySeat?.username || 'You'} (You)</p>
              <p className="text-[11px] text-slate-400">
                {mySeat?.duelSummary || (mySeat?.duelFinished ? 'Finished' : 'Competing live')}
              </p>
            </div>
            <span className="font-mono text-base font-bold tabular-nums text-[#38BDF8]">
              {mySeat?.score ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 border-l border-white/[0.08] pl-3">
            <div>
              <p className="font-semibold text-white">{opponentSeat?.username || 'Opponent'}</p>
              <p className="text-[11px] text-slate-400">
                {opponentSeat?.duelSummary ||
                  (opponentSeat?.duelFinished
                    ? 'Finished'
                    : opponentSeat?.duelMaxProgress
                    ? `Progress ${opponentSeat.duelProgress || 0}/${opponentSeat.duelMaxProgress}`
                    : 'Competing live')}
              </p>
            </div>
            <span className="font-mono text-base font-bold tabular-nums text-[#F97316]">
              {opponentSeat?.score ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Optional Live Match Chat Drawer */}
      {matchPhase === 'human' && liveMatch && chatOpen && (
        <div className="rounded-xl border border-white/[0.08] bg-[#090D1A] p-3 space-y-2.5">
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {liveMatch.chatMessages.map((m) => (
              <div key={m.id} className="flex items-baseline gap-2">
                <span
                  className={`font-semibold shrink-0 ${
                    m.kind === 'system'
                      ? 'text-[#F97316]'
                      : m.senderId === mySeat?.playerId
                      ? 'text-[#38BDF8]'
                      : 'text-emerald-400'
                  }`}
                >
                  {m.username}:
                </span>
                <span className="text-slate-300 break-words">{m.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Send a quick message to your opponent..."
              className="flex-1 rounded-lg border border-white/[0.1] bg-[#060811] px-3 py-1.5 text-xs text-white focus:border-[#38BDF8] focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-[#38BDF8] px-3 py-1.5 text-xs font-bold text-[#060811] cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
