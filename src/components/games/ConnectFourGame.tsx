import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Cpu, Lightbulb, RotateCcw, Trophy, Users } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import {
  C4_COLS,
  C4_ROWS,
  chooseC4AiMove,
  createC4Board,
  evaluateC4Board,
  getC4DropRow,
  type C4Cell,
} from '../../game/connectFour.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundFx } from '../../utils/sound.ts';

function dropC4Disc(board: C4Cell[], col: number, mark: 'R' | 'Y'): { board: C4Cell[]; row: number } | null {
  const row = getC4DropRow(board, col);
  if (row < 0) return null;
  const next = [...board];
  next[row * C4_COLS + col] = mark;
  return { board: next, row };
}

interface ConnectFourGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onOpenMultiplayer?: () => void;
  onBack: () => void;
}

export function ConnectFourGame({
  player,
  recentMatches,
  onProgressUpdated,
  onOpenMultiplayer,
  onBack,
}: ConnectFourGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'connect_four')!;
  const [mode, setMode] = useState<'vs_ai' | 'local_2p'>('vs_ai');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [board, setBoard] = useState<C4Cell[]>(() => createC4Board());
  const [turn, setTurn] = useState<'R' | 'Y'>('R');
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [outcomeText, setOutcomeText] = useState<string | null>(null);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [hintCol, setHintCol] = useState<number | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });

  const c4History = recentMatches.filter((m) => m.gameId === 'connect_four');

  const finishMatch = async (winner: 'R' | 'Y' | 'draw', finalLine: number[] | null) => {
    setWinLine(finalLine);
    const outcome: 'win' | 'loss' | 'draw' =
      winner === 'draw' ? 'draw' : mode === 'local_2p' ? 'win' : winner === 'R' ? 'win' : 'loss';

    if (outcome === 'win') {
      soundFx.playWin();
      setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
    } else if (outcome === 'draw') {
      soundFx.playDraw();
      setSessionScore((s) => ({ ...s, draws: s.draws + 1 }));
    } else {
      soundFx.playLoss();
      setSessionScore((s) => ({ ...s, losses: s.losses + 1 }));
    }

    setOutcomeText(
      winner === 'draw'
        ? 'Grid Locked — Draw!'
        : mode === 'local_2p'
        ? `${winner === 'R' ? 'Player 1 (Blue)' : 'Player 2 (Orange)'} Connects 4!`
        : winner === 'R'
        ? 'Victory — Four Connected!'
        : 'AI Bot Connected Four'
    );

    const scoreDelta =
      outcome === 'win' ? (mode === 'local_2p' ? 50 : difficulty === 'hard' ? 160 : difficulty === 'medium' ? 120 : 90) : outcome === 'draw' ? 40 : 12;

    try {
      const res = await apiFetch<{
        rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player: PlayerProfile;
        newlyUnlocked: string[];
        completedChallenges: string[];
      }>('/api/games/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'connect_four',
          mode,
          difficulty,
          outcome,
          opponentLabel: mode === 'local_2p' ? 'Local Player 2' : `Connect 4 AI (${difficulty})`,
          scoreDelta,
          durationSec: Math.max(4, Math.round((Date.now() - startedAt) / 1000)),
          summary:
            winner === 'draw'
              ? '7×6 Connect Four draw'
              : winner === 'R'
              ? 'Connected 4 discs in neon arena'
              : 'Defeated by Connect Four AI',
        }),
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // keep UI smooth
    }
  };

  useEffect(() => {
    if (mode !== 'vs_ai' || turn !== 'Y' || outcomeText) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const col = chooseC4AiMove(board, difficulty, 'Y');
      setAiThinking(false);
      if (col < 0) return;
      const dropped = dropC4Disc(board, col, 'Y');
      if (!dropped) return;
      soundFx.playClick();
      setBoard(dropped.board);
      const ev = evaluateC4Board(dropped.board);
      if (ev.winner) {
        void finishMatch(ev.winner, ev.line);
      } else {
        setTurn('R');
      }
    }, 320);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, mode, outcomeText]);

  const handleDrop = (col: number) => {
    if (outcomeText || aiThinking) return;
    if (mode === 'vs_ai' && turn !== 'R') return;
    const dropped = dropC4Disc(board, col, turn);
    if (!dropped) return;

    setHintCol(null);
    soundFx.playSelect();
    setBoard(dropped.board);
    const ev = evaluateC4Board(dropped.board);
    if (ev.winner) {
      void finishMatch(ev.winner, ev.line);
    } else {
      setTurn(turn === 'R' ? 'Y' : 'R');
    }
  };

  const resetBoard = () => {
    soundFx.playClick();
    setBoard(createC4Board());
    setTurn('R');
    setWinLine(null);
    setOutcomeText(null);
    setRewardBanner(null);
    setHintCol(null);
    setAiThinking(false);
    setStartedAt(Date.now());
  };

  const handleHint = () => {
    if (outcomeText || aiThinking) return;
    const suggested = chooseC4AiMove(board, 'hard', turn);
    if (suggested >= 0) {
      setHintCol(suggested);
      soundFx.playSelect();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Hub
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Connect Four</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.connect_four.wins}</span>
          <span>Points: {player.stats.byGame.connect_four.points}</span>
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-3 py-1.5 font-sans text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/20 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              Online 1v1 Room
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('vs_ai');
                  resetBoard();
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  mode === 'vs_ai'
                    ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-300'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" /> Solo vs AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('local_2p');
                  resetBoard();
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  mode === 'local_2p'
                    ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-300'
                }`}
              >
                <Users className="h-3.5 w-3.5" /> Local 2P
              </button>
            </div>

            {mode === 'vs_ai' && (
              <div className="flex gap-1.5">
                {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDifficulty(d);
                      resetBoard();
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                      difficulty === d
                        ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                        : 'border-slate-700 bg-[#060811] text-slate-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleHint}
                disabled={Boolean(outcomeText) || aiThinking}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#F97316]/40 bg-[#F97316]/10 px-3 py-1.5 text-xs font-semibold text-[#FDBA74] hover:bg-[#F97316]/20 disabled:opacity-40 cursor-pointer"
              >
                <Lightbulb className="h-3.5 w-3.5" /> Hint
              </button>
              <button
                type="button"
                onClick={resetBoard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#060811] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restart
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                {outcomeText
                  ? outcomeText
                  : aiThinking
                  ? 'AI Bot is calculating depth search...'
                  : turn === 'R'
                  ? mode === 'local_2p'
                    ? 'Player 1 Turn (Neon Blue)'
                    : 'Your Turn (Neon Blue)'
                  : mode === 'local_2p'
                  ? 'Player 2 Turn (Solar Orange)'
                  : 'AI Bot Turn (Solar Orange)'}
              </span>
              {hintCol !== null && !outcomeText && (
                <span className="font-mono text-[#F97316]">AI Hint: Drop Column {hintCol + 1}</span>
              )}
            </div>

            {/* 7x6 Interactive Board */}
            <div className="mx-auto max-w-md rounded-2xl border border-[#8B5CF6]/30 bg-[#060811] p-3">
              <div className="mb-2 grid grid-cols-7 gap-2">
                {Array.from({ length: C4_COLS }, (_, col) => (
                  <button
                    key={col}
                    type="button"
                    disabled={Boolean(outcomeText) || aiThinking || board[col] !== null}
                    onClick={() => handleDrop(col)}
                    className={`rounded-lg py-1 font-mono text-[11px] font-bold transition cursor-pointer ${
                      hintCol === col
                        ? 'bg-[#F97316] text-white'
                        : 'bg-[#121933] text-slate-300 hover:bg-[#8B5CF6] hover:text-white disabled:opacity-35'
                    }`}
                  >
                    ↓ {col + 1}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: C4_ROWS * C4_COLS }, (_, idx) => {
                  const val = board[idx];
                  const col = idx % C4_COLS;
                  const isWin = winLine?.includes(idx) ?? false;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleDrop(col)}
                      disabled={Boolean(outcomeText) || aiThinking || board[col] !== null}
                      aria-label={`Row ${Math.floor(idx / C4_COLS) + 1} Column ${col + 1}`}
                      className={`aspect-square rounded-full border transition flex items-center justify-center cursor-pointer ${
                        isWin
                          ? 'border-white ring-2 ring-[#38BDF8]'
                          : hintCol === col && val === null
                          ? 'border-[#F97316]/60 bg-[#0D142B]'
                          : 'border-white/[0.08] bg-[#0B1021] hover:border-[#8B5CF6]/60'
                      }`}
                    >
                      {val && (
                        <motion.span
                          initial={{ scale: 0.4, opacity: 0.5 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={`h-[80%] w-[80%] rounded-full ${
                            val === 'R'
                              ? 'bg-gradient-to-br from-[#38BDF8] to-[#2563EB] shadow-[0_0_16px_rgba(56,189,248,0.5)]'
                              : 'bg-gradient-to-br from-[#FB923C] to-[#EA580C] shadow-[0_0_16px_rgba(249,115,22,0.5)]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {outcomeText && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {outcomeText}
                  </p>
                  {rewardBanner && (
                    <p className="font-mono text-xs text-slate-300 mt-0.5">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={resetBoard}
                  className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
            <h3 className="font-display text-lg font-bold text-white">Rules & Controls</h3>
            <ul className="space-y-2 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-3 pt-2 text-center font-mono">
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Wins</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-400">{sessionScore.wins}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Draws</p>
                <p className="mt-0.5 text-lg font-bold text-[#F97316]">{sessionScore.draws}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Losses</p>
                <p className="mt-0.5 text-lg font-bold text-rose-400">{sessionScore.losses}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Connect Four Matches</h3>
            {c4History.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a match to log your history here.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {c4History.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3.5 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#38BDF8] shrink-0">+{m.scoreDelta} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
