import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Gauge, Play, RotateCcw, Trophy, Zap } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundFx } from '../../utils/sound.ts';

interface ReactionTestGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function ReactionTestGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: ReactionTestGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'reaction_test')!;
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [stage, setStage] = useState<'idle' | 'waiting' | 'go' | 'round_result' | 'finished'>('idle');
  const [roundNum, setRoundNum] = useState(1);
  const [latencies, setLatencies] = useState<number[]>([]);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const goTimestampRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const reactionHistory = recentMatches.filter((m) => m.gameId === 'reaction_test');
  const aiBenchmarkMs = difficulty === 'hard' ? 245 : difficulty === 'medium' ? 295 : 360;

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const queueNextSignal = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setStage('waiting');
    setLastFeedback(null);
    const delayMs = 1200 + Math.floor(Math.random() * 2400);
    timerRef.current = window.setTimeout(() => {
      goTimestampRef.current = performance.now();
      setStage('go');
      soundFx.playSelect();
    }, delayMs);
  };

  const startSession = (diff = difficulty) => {
    soundFx.playClick();
    setDifficulty(diff);
    setRoundNum(1);
    setLatencies([]);
    setLastFeedback(null);
    setRewardBanner(null);
    queueNextSignal();
  };

  const finishTest = async (allTimes: number[]) => {
    setStage('finished');
    const avg = Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length);
    const outcome: 'win' | 'loss' = avg <= aiBenchmarkMs ? 'win' : 'loss';
    if (outcome === 'win') soundFx.playWin();
    else soundFx.playLoss();

    const scoreDelta = Math.max(25, Math.min(280, Math.round(420 - avg)));
    try {
      const res = await apiFetch<{
        rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player: PlayerProfile;
        newlyUnlocked: string[];
        completedChallenges: string[];
      }>('/api/games/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'reaction_test',
          mode: '5_round_reflex',
          difficulty,
          outcome,
          opponentLabel: `Ghost AI (${aiBenchmarkMs}ms)`,
          scoreDelta,
          durationSec: 15,
          summary: `Avg ${avg}ms across 5 rounds (Target ≤${aiBenchmarkMs}ms)`,
        }),
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // ignore
    }
  };

  const handlePadClick = () => {
    if (stage === 'waiting') {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      soundFx.playLoss();
      const penaltyMs = aiBenchmarkMs + 150;
      const updated = [...latencies, penaltyMs];
      setLatencies(updated);
      setLastFeedback(`False start! +150ms penalty recorded (${penaltyMs}ms).`);
      if (updated.length >= 5) {
        void finishTest(updated);
      } else {
        setRoundNum((r) => r + 1);
        setStage('round_result');
      }
      return;
    }

    if (stage === 'go') {
      const elapsed = Math.max(85, Math.round(performance.now() - goTimestampRef.current));
      soundFx.playClick();
      const updated = [...latencies, elapsed];
      setLatencies(updated);
      setLastFeedback(`Strike registered: ${elapsed} ms`);
      if (updated.length >= 5) {
        void finishTest(updated);
      } else {
        setRoundNum((r) => r + 1);
        setStage('round_result');
      }
    }
  };

  const avgMs =
    latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Reaction Test</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-slate-300">
          <span>Wins: {player.stats.byGame.reaction_test.wins}</span>
          <span>Best Score: {player.stats.byGame.reaction_test.bestScore}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4">
            <div className="flex gap-1.5">
              {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => startSession(d)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                    difficulty === d
                      ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                      : 'border-slate-700 bg-[#060811] text-slate-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <span className="font-mono text-xs text-slate-300">
              Ghost AI Benchmark: ≤ {aiBenchmarkMs} ms
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-slate-300">
              <span>Round {Math.min(5, roundNum)} / 5</span>
              <span>Current Average: {avgMs !== null ? `${avgMs} ms` : '—'}</span>
            </div>

            {stage === 'idle' ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#060811] p-6 text-center space-y-4">
                <Gauge className="h-10 w-10 text-[#38BDF8]" />
                <p className="font-display text-xl font-bold text-white">5-Round Neural Reflex Test</p>
                <p className="max-w-sm text-xs text-slate-400">
                  Wait for the arena pad to flash emerald green, then click immediately. Clicking too soon counts as a false start.
                </p>
                <button
                  type="button"
                  onClick={() => startSession(difficulty)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#38BDF8] px-6 py-3 text-sm font-bold text-[#060811] cursor-pointer"
                >
                  <Play className="h-4 w-4" /> Start Reflex Benchmark
                </button>
              </div>
            ) : stage === 'finished' ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-[#8B5CF6]/40 bg-[#060811] p-6 text-center space-y-3">
                <Trophy className="h-10 w-10 text-[#F97316]" />
                <h2 className="font-display text-2xl font-bold text-white">
                  {(avgMs ?? 999) <= aiBenchmarkMs ? 'Reflex Victory!' : 'Benchmark Finished'}
                </h2>
                <p className="font-mono text-sm text-slate-300">
                  5-Round Average: <span className="text-[#38BDF8] font-bold">{avgMs} ms</span> (Ghost AI: {aiBenchmarkMs} ms)
                </p>
                {rewardBanner && (
                  <p className="font-mono text-xs text-emerald-400">
                    +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => startSession(difficulty)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-xs font-semibold text-white cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Test Again
                </button>
              </div>
            ) : stage === 'round_result' ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-white/[0.1] bg-[#060811] p-6 text-center space-y-4">
                <Zap className="h-9 w-9 text-[#F97316]" />
                <p className="font-display text-xl font-bold text-white">{lastFeedback}</p>
                <button
                  type="button"
                  onClick={queueNextSignal}
                  className="rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Next Round ({roundNum}/5)
                </button>
              </div>
            ) : (
              <button
                type="button"
                onMouseDown={handlePadClick}
                className={`flex h-64 w-full flex-col items-center justify-center rounded-2xl border-2 transition cursor-pointer ${
                  stage === 'go'
                    ? 'border-emerald-300 bg-emerald-500 text-[#060811]'
                    : 'border-rose-500/50 bg-rose-950/35 text-white'
                }`}
              >
                <span className="font-display text-3xl sm:text-4xl font-extrabold tracking-wide">
                  {stage === 'go' ? 'CLICK NOW!' : 'WAIT FOR GREEN...'}
                </span>
                <span className="mt-2 text-xs opacity-80">
                  {stage === 'go' ? 'Strike as fast as possible!' : 'Do not click early'}
                </span>
              </button>
            )}

            {latencies.length > 0 && (
              <div className="grid grid-cols-5 gap-2 text-center font-mono text-xs">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="rounded-xl border border-white/[0.06] bg-[#060811] py-2">
                    <span className="block text-[10px] text-slate-500">R{i + 1}</span>
                    <span className="font-bold text-white">
                      {latencies[i] !== undefined ? `${latencies[i]}ms` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white">Reflex Rules</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Reflex Runs</h3>
            {reactionHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a 5-round reflex test to log your latency.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {reactionHistory.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#38BDF8]">+{m.scoreDelta}</span>
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
