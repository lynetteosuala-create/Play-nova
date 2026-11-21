import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Cpu, Flame, Hand, RotateCcw, Scissors, Shield, Trophy, Users } from 'lucide-react';
import { GAME_CATALOG } from '../game/catalog.ts';
import {
  chooseLocalRpsAiMove,
  recordLocalInstantMatch,
  resolveLocalRpsOutcome,
} from '../game/localArcadeEngine.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../types.ts';
import { apiFetch, getStoredPlayerToken } from '../utils/api.ts';
import { soundFx } from '../utils/sound.ts';

type RpsMove = 'rock' | 'paper' | 'scissors';

const MOVES: Array<{ id: RpsMove; label: string; beats: string }> = [
  { id: 'rock', label: 'Rock', beats: 'Crushes Scissors' },
  { id: 'paper', label: 'Paper', beats: 'Covers Rock' },
  { id: 'scissors', label: 'Scissors', beats: 'Cuts Paper' },
];

function MoveGlyph({ move, className = 'h-8 w-8' }: { move: RpsMove; className?: string }) {
  if (move === 'rock') return <Shield className={className} />;
  if (move === 'paper') return <Hand className={className} />;
  return <Scissors className={className} />;
}

interface RockPaperScissorsGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onOpenMultiplayer?: () => void;
  onBack: () => void;
}

export function RockPaperScissorsGame({
  player,
  recentMatches,
  onProgressUpdated,
  onOpenMultiplayer,
  onBack,
}: RockPaperScissorsGameProps) {
  const catalog = GAME_CATALOG[1];
  const [mode, setMode] = useState<'vs_ai' | 'local_2p'>('vs_ai');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [seriesTarget, setSeriesTarget] = useState<1 | 2 | 3>(2); // 1 = Single, 2 = Best of 3, 3 = Best of 5
  const [seriesScore, setSeriesScore] = useState({ p1: 0, opp: 0 });
  const [seriesChampion, setSeriesChampion] = useState<'player' | 'opponent' | null>(null);

  const [p1Choice, setP1Choice] = useState<RpsMove | null>(null);
  const [p2Choice, setP2Choice] = useState<RpsMove | null>(null);
  const [recentPlayerMoves, setRecentPlayerMoves] = useState<RpsMove[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    playerMove: RpsMove;
    opponentMove: RpsMove;
    outcome: 'win' | 'loss' | 'draw';
    rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
  } | null>(null);
  const [sessionStats, setSessionStats] = useState({ wins: 0, draws: 0, losses: 0, streak: 0 });

  const rpsHistory = recentMatches.filter((m) => m.gameId === 'rps');

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    soundFx.playTick();
    const timer = window.setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const resetSeries = () => {
    soundFx.playClick();
    setResult(null);
    setP1Choice(null);
    setP2Choice(null);
    setSeriesScore({ p1: 0, opp: 0 });
    setSeriesChampion(null);
  };

  const executeResolution = async (move1: RpsMove, move2?: RpsMove) => {
    setBusy(true);
    setResult(null);
    setCountdown(3);
    await new Promise((r) => setTimeout(r, 860));
    setCountdown(null);

    const resolveLocally = () => {
      const oppMove: RpsMove =
        mode === 'local_2p' && move2
          ? move2
          : chooseLocalRpsAiMove(difficulty, recentPlayerMoves);
      const outcome = resolveLocalRpsOutcome(move1, oppMove);
      const scoreDelta =
        outcome === 'win'
          ? difficulty === 'hard'
            ? 85
            : difficulty === 'medium'
            ? 65
            : 45
          : outcome === 'draw'
          ? 20
          : 5;
      const recorded = recordLocalInstantMatch(player, {
        gameId: 'rps',
        mode,
        difficulty,
        outcome,
        opponentLabel: mode === 'local_2p' ? 'Local Player 2' : `RPS AI (${difficulty})`,
        scoreDelta,
        durationSec: 4,
        summary: `${move1} vs ${oppMove}`,
      });
      return {
        playerMove: move1,
        opponentMove: oppMove,
        outcome,
        rewards: recorded.rewards,
        player: recorded.player,
        newlyUnlocked: recorded.newlyUnlocked,
        completedChallenges: recorded.completedChallenges,
      };
    };

    try {
      const hasServerSession = Boolean(getStoredPlayerToken()) && !player.id.startsWith('local-');
      const res = hasServerSession
        ? await apiFetch<{
            ok: boolean;
            playerMove: RpsMove;
            opponentMove: RpsMove;
            outcome: 'win' | 'loss' | 'draw';
            rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
            player: PlayerProfile;
            newlyUnlocked: string[];
            completedChallenges: string[];
          }>(
            '/api/games/rps/play',
            {
              method: 'POST',
              body: JSON.stringify({
                mode,
                difficulty,
                playerMove: move1,
                playerTwoMove: move2,
                recentMoves: recentPlayerMoves,
              }),
            },
            { suppressSessionEvent: true }
          ).catch(() => resolveLocally())
        : resolveLocally();

      setRecentPlayerMoves((prev) => [move1, ...prev].slice(0, 8));
      setResult({
        playerMove: res.playerMove,
        opponentMove: res.opponentMove,
        outcome: res.outcome,
        rewards: res.rewards,
      });

      const nextP1 = seriesScore.p1 + (res.outcome === 'win' ? 1 : 0);
      const nextOpp = seriesScore.opp + (res.outcome === 'loss' ? 1 : 0);
      setSeriesScore({ p1: nextP1, opp: nextOpp });

      if (nextP1 >= seriesTarget) {
        setSeriesChampion('player');
      } else if (nextOpp >= seriesTarget) {
        setSeriesChampion('opponent');
      }

      if (res.outcome === 'win') {
        soundFx.playWin();
        setSessionStats((s) => ({ ...s, wins: s.wins + 1, streak: s.streak + 1 }));
      } else if (res.outcome === 'draw') {
        soundFx.playDraw();
        setSessionStats((s) => ({ ...s, draws: s.draws + 1 }));
      } else {
        soundFx.playLoss();
        setSessionStats((s) => ({ ...s, losses: s.losses + 1, streak: 0 }));
      }

      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } finally {
      setBusy(false);
      setP1Choice(null);
      setP2Choice(null);
    }
  };

  const handleSelectMove = (move: RpsMove) => {
    if (busy || countdown !== null || seriesChampion) return;
    soundFx.playSelect();

    if (mode === 'vs_ai') {
      void executeResolution(move);
      return;
    }

    if (!p1Choice) {
      setP1Choice(move);
      setResult(null);
    } else if (!p2Choice) {
      setP2Choice(move);
      void executeResolution(p1Choice, move);
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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
            Rock Paper Scissors Arena
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.rps.wins}</span>
          <span>Best Streak: {player.bestStreak}</span>
          <span>Points: {player.stats.byGame.rps.points}</span>
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-3 py-1.5 font-sans text-xs font-semibold text-[#38BDF8] transition hover:bg-[#38BDF8]/20 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              Play Online / Mixed Arena
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          {/* Rules & Mode Bar */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('vs_ai');
                    resetSeries();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                    mode === 'vs_ai'
                      ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                      : 'border-slate-700 bg-[#060811] text-slate-300'
                  }`}
                >
                  <Cpu className="h-3.5 w-3.5" /> vs AI
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('local_2p');
                    resetSeries();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                    mode === 'local_2p'
                      ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                      : 'border-slate-700 bg-[#060811] text-slate-300'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" /> 2-Player Local
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { val: 1, label: 'Single' },
                    { val: 2, label: 'Best of 3' },
                    { val: 3, label: 'Best of 5' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.val}
                    type="button"
                    onClick={() => {
                      setSeriesTarget(s.val);
                      setSeriesScore({ p1: 0, opp: 0 });
                      setSeriesChampion(null);
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                      seriesTarget === s.val
                        ? 'border-[#F97316] bg-[#F97316]/20 text-[#FDBA74]'
                        : 'border-slate-700 bg-[#060811] text-slate-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {mode === 'vs_ai' && (
                <div className="flex gap-1.5">
                  {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
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
            </div>

            {seriesTarget > 1 && (
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-4 py-2.5 text-xs">
                <span className="text-slate-300 font-medium">
                  Series Score (First to {seriesTarget} wins)
                </span>
                <span className="font-mono font-bold text-white tabular-nums">
                  {mode === 'local_2p' ? 'P1' : 'You'} {seriesScore.p1} — {seriesScore.opp}{' '}
                  {mode === 'local_2p' ? 'P2' : 'AI'}
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-4 border-t border-white/[0.06] pt-3 text-xs text-slate-300">
              {catalog.rules.slice(0, 3).map((r) => (
                <span key={r}>• {r}</span>
              ))}
            </div>
          </div>

          {/* Duel Stage */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-6">
            <div className="text-center">
              {countdown !== null ? (
                <motion.div
                  key={countdown}
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1.15, opacity: 1 }}
                  className="py-8 font-display text-5xl font-bold text-[#F97316]"
                >
                  {countdown > 0 ? countdown : 'REVEAL!'}
                </motion.div>
              ) : result ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-3 items-center gap-4 rounded-xl border border-white/[0.08] bg-[#060811] p-5">
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-slate-400">
                        {mode === 'local_2p' ? 'Player 1' : 'You'}
                      </span>
                      <div className="mt-2 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#38BDF8]/40 bg-[#0E1324] text-[#38BDF8]">
                        <MoveGlyph move={result.playerMove} />
                      </div>
                      <span className="mt-2 text-sm font-semibold capitalize text-white">
                        {result.playerMove}
                      </span>
                    </div>

                    <div className="font-display text-xl font-bold text-slate-400">VS</div>

                    <div className="flex flex-col items-center">
                      <span className="text-xs text-slate-400">
                        {mode === 'local_2p' ? 'Player 2' : `AI (${difficulty})`}
                      </span>
                      <div className="mt-2 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#F97316]/40 bg-[#0E1324] text-[#F97316]">
                        <MoveGlyph move={result.opponentMove} />
                      </div>
                      <span className="mt-2 text-sm font-semibold capitalize text-white">
                        {result.opponentMove}
                      </span>
                    </div>
                  </div>

                  {seriesChampion && (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/15 px-4 py-3 text-sm font-bold text-white">
                      <Trophy className="h-4 w-4 text-[#F97316]" />
                      {seriesChampion === 'player'
                        ? mode === 'local_2p'
                          ? 'Player 1 wins the Series!'
                          : 'Series Champion — Victory!'
                        : mode === 'local_2p'
                        ? 'Player 2 wins the Series!'
                        : 'AI wins the Series!'}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#060811] px-4 py-3">
                    <div>
                      <p
                        className={`font-display text-xl font-bold ${
                          result.outcome === 'win'
                            ? 'text-emerald-400'
                            : result.outcome === 'draw'
                            ? 'text-[#F97316]'
                            : 'text-rose-400'
                        }`}
                      >
                        {result.outcome === 'win'
                          ? mode === 'local_2p'
                            ? 'Player 1 Wins the Round!'
                            : 'Victory!'
                          : result.outcome === 'draw'
                          ? 'Round Draw!'
                          : mode === 'local_2p'
                          ? 'Player 2 Wins the Round!'
                          : 'AI Takes the Round'}
                      </p>
                      <p className="font-mono text-xs text-slate-300">
                        +{result.rewards.scoreDelta} Pts · +{result.rewards.xpEarned} XP · +{result.rewards.coinsEarned} Coins
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (seriesChampion) {
                          resetSeries();
                        } else {
                          soundFx.playClick();
                          setResult(null);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {seriesChampion ? 'New Series' : 'Next Round'}
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="py-4">
                  <p className="font-display text-xl font-bold text-white">
                    {mode === 'local_2p'
                      ? !p1Choice
                        ? 'Player 1: Select Your Secret Move'
                        : 'Player 2: Select Your Secret Move'
                      : 'Choose Your Move'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {mode === 'local_2p' && p1Choice
                      ? 'Player 1 move is locked in hidden.'
                      : 'Rapid reveal countdown executes immediately upon selection.'}
                  </p>
                </div>
              )}
            </div>

            {/* 3 Selection Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MOVES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={busy || countdown !== null || Boolean(seriesChampion)}
                  onClick={() => handleSelectMove(m.id)}
                  className="group flex flex-col items-center rounded-2xl border border-slate-700 bg-[#060811] p-5 transition hover:border-[#8B5CF6] hover:bg-[#131932] disabled:opacity-50 cursor-pointer"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-[#0E1324] text-[#38BDF8] transition group-hover:scale-105 group-hover:text-[#F97316]">
                    <MoveGlyph move={m.id} className="h-7 w-7" />
                  </div>
                  <span className="mt-3 font-display text-lg font-bold text-white">{m.label}</span>
                  <span className="mt-0.5 text-xs text-slate-400">{m.beats}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Stats & Streak */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Session Telemetry</h3>
              <span className="inline-flex items-center gap-1 font-mono text-xs text-[#F97316]">
                <Flame className="h-3.5 w-3.5" /> Streak: {sessionStats.streak}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center font-mono">
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-3">
                <p className="text-[11px] text-slate-400">Wins</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-400">{sessionStats.wins}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-3">
                <p className="text-[11px] text-slate-400">Draws</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-[#F97316]">{sessionStats.draws}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-3">
                <p className="text-[11px] text-slate-400">Losses</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-rose-400">{sessionStats.losses}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Rounds</h3>
            {rpsHistory.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">Play a round to start tracking your streaks.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {rpsHistory.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3.5 py-2.5 text-xs"
                  >
                    <span className="font-medium text-slate-200">{m.summary}</span>
                    <span className="font-mono text-[#F97316]">+{m.scoreDelta} pts</span>
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
