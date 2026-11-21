import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Calculator, Clock, Flame, Play, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { soundFx } from '../../utils/sound.ts';

interface MathPrompt {
  question: string;
  answer: number;
}

function generateMathPrompt(difficulty: DifficultyLevel): MathPrompt {
  const maxN = difficulty === 'hard' ? 35 : difficulty === 'medium' ? 20 : 12;
  const ops = difficulty === 'easy' ? ['+', '-'] : ['+', '-', '×', 'missing'];
  const op = ops[Math.floor(Math.random() * ops.length)];

  if (op === '+') {
    const a = 2 + Math.floor(Math.random() * maxN);
    const b = 2 + Math.floor(Math.random() * maxN);
    return { question: `${a} + ${b} = ?`, answer: a + b };
  }
  if (op === '-') {
    const a = 5 + Math.floor(Math.random() * maxN);
    const b = 1 + Math.floor(Math.random() * a);
    return { question: `${a} − ${b} = ?`, answer: a - b };
  }
  if (op === '×') {
    const a = 2 + Math.floor(Math.random() * (difficulty === 'hard' ? 14 : 10));
    const b = 2 + Math.floor(Math.random() * (difficulty === 'hard' ? 12 : 9));
    return { question: `${a} × ${b} = ?`, answer: a * b };
  }
  // Missing operand
  const x = 2 + Math.floor(Math.random() * 14);
  const a = 3 + Math.floor(Math.random() * 15);
  return { question: `${a} + [ ? ] = ${a + x}`, answer: x };
}

interface QuickMathGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function QuickMathGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: QuickMathGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'quick_math')!;
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [phase, setPhase] = useState<'ready' | 'playing' | 'finished'>('ready');
  const [timeLeft, setTimeLeft] = useState(60);
  const [prompt, setPrompt] = useState<MathPrompt>(() => generateMathPrompt('medium'));
  const [answerInput, setAnswerInput] = useState('');
  const [score, setScore] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [combo, setCombo] = useState(1);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const mathHistory = recentMatches.filter((m) => m.gameId === 'quick_math');
  const aiBenchmark = difficulty === 'hard' ? 240 : difficulty === 'medium' ? 170 : 110;

  const startSprint = (diff = difficulty) => {
    soundFx.playSelect();
    setDifficulty(diff);
    setPhase('playing');
    setTimeLeft(60);
    setPrompt(generateMathPrompt(diff));
    setAnswerInput('');
    setScore(0);
    setSolvedCount(0);
    setCombo(1);
    setRewardBanner(null);
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    if (timeLeft <= 0) {
      void finishSprint();
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const finishSprint = async () => {
    setPhase('finished');
    const outcome: 'win' | 'loss' | 'draw' =
      score > aiBenchmark ? 'win' : score === aiBenchmark ? 'draw' : 'loss';
    if (outcome === 'win') soundFx.playWin();
    else if (outcome === 'draw') soundFx.playDraw();
    else soundFx.playLoss();

    try {
      const res = await completeSinglePlayerGame(player, {
        gameId: 'quick_math',
        mode: 'sprint_60s',
        difficulty,
        outcome,
        opponentLabel: `Speedbot AI (${aiBenchmark} pts)`,
        scoreDelta: score,
        durationSec: 60,
        summary: `${solvedCount} solved · ${score} pts vs ${aiBenchmark} AI`,
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // ignore
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (phase !== 'playing') return;
    const numeric = Number(answerInput.trim());
    if (!Number.isFinite(numeric) || answerInput.trim() === '') return;

    if (numeric === prompt.answer) {
      soundFx.playSelect();
      const gain = 10 * combo;
      setScore((s) => s + gain);
      setSolvedCount((c) => c + 1);
      setCombo((c) => Math.min(5, c + 1));
      setPrompt(generateMathPrompt(difficulty));
      setAnswerInput('');
    } else {
      soundFx.playLoss();
      setCombo(1);
      setAnswerInput('');
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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Quick Math Challenge</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-slate-300">
          <span>Wins: {player.stats.byGame.quick_math.wins}</span>
          <span>Best Score: {player.stats.byGame.quick_math.bestScore}</span>
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
                  onClick={() => startSprint(d)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                    difficulty === d
                      ? 'border-[#F97316] bg-[#F97316]/20 text-white'
                      : 'border-slate-700 bg-[#060811] text-slate-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <span className="font-mono text-xs text-slate-300">AI Speedbot Target: {aiBenchmark} pts</span>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5">
            {phase === 'ready' ? (
              <div className="py-8 text-center space-y-4">
                <Calculator className="mx-auto h-10 w-10 text-[#F97316]" />
                <h2 className="font-display text-2xl font-bold text-white">60-Second Arithmetic Sprint</h2>
                <p className="mx-auto max-w-md text-xs text-slate-300">
                  Beat the {aiBenchmark}-point AI Speedbot benchmark. Build consecutive correct answers up to 5× combo.
                </p>
                <button
                  type="button"
                  onClick={() => startSprint(difficulty)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-6 py-3 text-sm font-bold text-white shadow-lg cursor-pointer"
                >
                  <Play className="h-4 w-4" /> Start 60s Sprint
                </button>
              </div>
            ) : phase === 'playing' ? (
              <>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="inline-flex items-center gap-1 text-white">
                    <Clock className="h-3.5 w-3.5 text-[#F97316]" /> {timeLeft}s
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#38BDF8]">
                    <Flame className="h-3.5 w-3.5" /> Combo {combo}×
                  </span>
                  <span className="text-emerald-400">
                    Score: {score} / {aiBenchmark}
                  </span>
                </div>

                <div className="rounded-2xl border border-[#8B5CF6]/30 bg-[#060811] py-10 text-center">
                  <p className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white tabular-nums">
                    {prompt.question}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    type="number"
                    autoFocus
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    placeholder="Type answer & press Enter"
                    className="flex-1 rounded-xl border border-slate-700 bg-[#060811] px-4 py-3 font-mono text-lg text-white focus:border-[#F97316] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#8B5CF6] px-6 py-3 text-sm font-bold text-white hover:bg-[#7C3AED] cursor-pointer"
                  >
                    Submit
                  </button>
                </form>
              </>
            ) : (
              <div className="py-6 text-center space-y-3">
                <Trophy className="mx-auto h-10 w-10 text-[#F97316]" />
                <h2 className="font-display text-2xl font-bold text-white">
                  {score >= aiBenchmark ? 'You Outpaced Speedbot AI!' : 'Sprint Complete'}
                </h2>
                <p className="font-mono text-sm text-slate-300">
                  Solved: {solvedCount} equations · Final Score: {score} pts (AI Target: {aiBenchmark})
                </p>
                {rewardBanner && (
                  <p className="font-mono text-xs text-[#38BDF8]">
                    +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => startSprint(difficulty)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white">Sprint Rules</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Math Sprints</h3>
            {mathHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Run a 60s sprint to record your arithmetic speed.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {mathHistory.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#F97316]">+{m.scoreDelta}</span>
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
