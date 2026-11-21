import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, Lightbulb, Play, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundFx } from '../../utils/sound.ts';

interface PatternRecognitionGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function PatternRecognitionGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: PatternRecognitionGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'pattern_recognition')!;
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [phase, setPhase] = useState<'ready' | 'showing' | 'input' | 'finished'>('ready');
  const [pattern, setPattern] = useState<number[]>([]);
  const [playerPicks, setPlayerPicks] = useState<number[]>([]);
  const [litCell, setLitCell] = useState<number | null>(null);
  const [hintCell, setHintCell] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [startedAt, setStartedAt] = useState(Date.now());

  const patternHistory = recentMatches.filter((m) => m.gameId === 'pattern_recognition');
  const gridDim = level >= 6 ? 5 : level >= 3 ? 4 : 3;
  const totalCells = gridDim * gridDim;
  const targetWinLevel = difficulty === 'hard' ? 7 : difficulty === 'medium' ? 5 : 4;

  const generateAndShowLevel = (lvl: number, diff = difficulty) => {
    const dim = lvl >= 6 ? 5 : lvl >= 3 ? 4 : 3;
    const count = Math.min(dim * dim - 1, 2 + lvl);
    const indices = Array.from({ length: dim * dim }, (_, i) => i).sort(() => Math.random() - 0.5);
    const seq = indices.slice(0, count);
    setPattern(seq);
    setPlayerPicks([]);
    setHintCell(null);
    setPhase('showing');

    const stepMs = diff === 'hard' ? 420 : diff === 'medium' ? 540 : 660;
    seq.forEach((cellIdx, i) => {
      window.setTimeout(() => {
        setLitCell(cellIdx);
        soundFx.playTick();
      }, i * stepMs + 250);
    });
    window.setTimeout(() => {
      setLitCell(null);
      setPhase('input');
    }, seq.length * stepMs + 420);
  };

  const startGame = (diff = difficulty) => {
    soundFx.playSelect();
    setDifficulty(diff);
    setLevel(1);
    setLives(3);
    setScore(0);
    setRewardBanner(null);
    setStartedAt(Date.now());
    generateAndShowLevel(1, diff);
  };

  useEffect(() => {
    return () => setLitCell(null);
  }, []);

  const finishSession = async (finalLevel: number, finalScore: number) => {
    setPhase('finished');
    const outcome: 'win' | 'loss' = finalLevel >= targetWinLevel ? 'win' : 'loss';
    if (outcome === 'win') soundFx.playWin();
    else soundFx.playLoss();

    try {
      const res = await apiFetch<{
        rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player: PlayerProfile;
        newlyUnlocked: string[];
        completedChallenges: string[];
      }>('/api/games/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'pattern_recognition',
          mode: 'matrix_sequence',
          difficulty,
          outcome,
          opponentLabel: `AI Target (Lv ${targetWinLevel})`,
          scoreDelta: Math.max(20, finalScore),
          durationSec: Math.max(6, Math.round((Date.now() - startedAt) / 1000)),
          summary: `Reached Level ${finalLevel} (${finalScore} pts)`,
        }),
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // ignore
    }
  };

  const handleTileClick = (idx: number) => {
    if (phase !== 'input' || playerPicks.includes(idx)) return;
    setHintCell(null);

    const stepPos = playerPicks.length;
    if (pattern[stepPos] === idx) {
      soundFx.playSelect();
      const nextPicks = [...playerPicks, idx];
      setPlayerPicks(nextPicks);

      if (nextPicks.length === pattern.length) {
        const nextScore = score + level * 30;
        const nextLevel = level + 1;
        setScore(nextScore);
        if (nextLevel > 8) {
          void finishSession(8, nextScore);
        } else {
          setLevel(nextLevel);
          window.setTimeout(() => generateAndShowLevel(nextLevel, difficulty), 550);
        }
      }
    } else {
      soundFx.playLoss();
      const nextLives = lives - 1;
      setLives(nextLives);
      if (nextLives <= 0) {
        void finishSession(level, score);
      } else {
        setPlayerPicks([]);
        generateAndShowLevel(level, difficulty);
      }
    }
  };

  const handleEchoHint = () => {
    if (phase !== 'input') return;
    const nextIdx = pattern[playerPicks.length];
    if (nextIdx !== undefined) {
      setHintCell(nextIdx);
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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Pattern Recognition</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-slate-300">
          <span>Wins: {player.stats.byGame.pattern_recognition.wins}</span>
          <span>Best Score: {player.stats.byGame.pattern_recognition.bestScore}</span>
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
                  onClick={() => startGame(d)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                    difficulty === d
                      ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                      : 'border-slate-700 bg-[#060811] text-slate-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-[#38BDF8]">Lv {level} ({gridDim}×{gridDim})</span>
              <span className="inline-flex items-center gap-1 text-rose-400">
                <Heart className="h-3.5 w-3.5 fill-current" /> {lives}
              </span>
              <span className="text-white">Score: {score}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-4">
            {phase === 'ready' ? (
              <div className="py-10 text-center space-y-4">
                <Sparkles className="mx-auto h-10 w-10 text-[#8B5CF6]" />
                <h2 className="font-display text-2xl font-bold text-white">Spatial Sequence Recall</h2>
                <p className="mx-auto max-w-sm text-xs text-slate-300">
                  Memorize the pulse sequence in exact order. Reach Level {targetWinLevel}+ to beat the AI benchmark.
                </p>
                <button
                  type="button"
                  onClick={() => startGame(difficulty)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#8B5CF6] px-6 py-3 text-sm font-bold text-white cursor-pointer"
                >
                  <Play className="h-4 w-4" /> Launch Matrix
                </button>
              </div>
            ) : phase === 'finished' ? (
              <div className="py-8 text-center space-y-3">
                <Trophy className="mx-auto h-10 w-10 text-[#F97316]" />
                <h2 className="font-display text-2xl font-bold text-white">
                  {level >= targetWinLevel ? 'Pattern Master Victory!' : 'Sequence Complete'}
                </h2>
                <p className="font-mono text-sm text-slate-300">
                  Reached Level {level} · Final Score: {score} pts (AI Target: Lv {targetWinLevel})
                </p>
                {rewardBanner && (
                  <p className="font-mono text-xs text-[#38BDF8]">
                    +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => startGame(difficulty)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-xs font-semibold text-white cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Play Again
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">
                    {phase === 'showing'
                      ? 'Watch the illuminating pulse order...'
                      : `Reproduce step ${playerPicks.length + 1} of ${pattern.length}`}
                  </span>
                  <button
                    type="button"
                    disabled={phase !== 'input'}
                    onClick={handleEchoHint}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#F97316]/40 bg-[#F97316]/10 px-2.5 py-1 text-xs font-semibold text-[#FDBA74] disabled:opacity-40 cursor-pointer"
                  >
                    <Lightbulb className="h-3.5 w-3.5" /> AI Echo Hint
                  </button>
                </div>

                <div
                  className="mx-auto grid max-w-sm gap-2.5"
                  style={{ gridTemplateColumns: `repeat(${gridDim}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: totalCells }, (_, idx) => {
                    const isLit = litCell === idx;
                    const isPicked = playerPicks.includes(idx);
                    const isHint = hintCell === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={phase !== 'input'}
                        onClick={() => handleTileClick(idx)}
                        className={`aspect-square rounded-xl border transition cursor-pointer ${
                          isLit
                            ? 'border-white bg-[#38BDF8] shadow-[0_0_24px_rgba(56,189,248,0.75)]'
                            : isPicked
                            ? 'border-emerald-400 bg-emerald-600/35'
                            : isHint
                            ? 'border-[#F97316] bg-[#F97316]/30'
                            : 'border-white/[0.1] bg-[#060811] hover:border-[#8B5CF6]'
                        }`}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white">Matrix Rules</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Pattern Trials</h3>
            {patternHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a trial to record your highest level.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {patternHistory.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#8B5CF6]">+{m.scoreDelta}</span>
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
