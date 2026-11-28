import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Calculator, ArrowLeft, Clock, Flame, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { createSeededRng } from '../../utils/seededRandom.ts';
import { soundFx } from '../../utils/sound.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface MathPrompt {
  question: string;
  answer: number;
}

function generateMathPrompt(difficulty: DifficultyLevel, seed: number, idx: number): MathPrompt {
  const rng = createSeededRng(seed + idx * 97 + 13);
  const maxN = difficulty === 'hard' ? 35 : difficulty === 'medium' ? 20 : 12;
  const ops = difficulty === 'easy' ? ['+', '-'] : ['+', '-', '×', 'missing'];
  const op = ops[Math.floor(rng() * ops.length)];

  if (op === '+') {
    const a = 2 + Math.floor(rng() * maxN);
    const b = 2 + Math.floor(rng() * maxN);
    return { question: `${a} + ${b} = ?`, answer: a + b };
  }
  if (op === '-') {
    const a = 5 + Math.floor(rng() * maxN);
    const b = 1 + Math.floor(rng() * a);
    return { question: `${a} − ${b} = ?`, answer: a - b };
  }
  if (op === '×') {
    const a = 2 + Math.floor(rng() * (difficulty === 'hard' ? 14 : 10));
    const b = 2 + Math.floor(rng() * (difficulty === 'hard' ? 12 : 9));
    return { question: `${a} × ${b} = ?`, answer: a * b };
  }
  const x = 2 + Math.floor(rng() * 14);
  const a = 3 + Math.floor(rng() * 15);
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
  const mm = useUniversalMatchmaking('quick_math', { player });

  const isHumanDuel = mm.matchPhase === 'human';
  const activeDiff: DifficultyLevel = isHumanDuel ? 'medium' : mm.difficulty;

  const [timeLeft, setTimeLeft] = useState(60);
  const [promptIdx, setPromptIdx] = useState(0);
  const [prompt, setPrompt] = useState<MathPrompt>(() => generateMathPrompt(activeDiff, mm.seed, 0));
  const [answerInput, setAnswerInput] = useState('');
  const [score, setScore] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [combo, setCombo] = useState(1);
  const [finished, setFinished] = useState(false);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const mathHistory = recentMatches.filter((m) => m.gameId === 'quick_math');
  const aiBenchmark = mm.difficulty === 'hard' ? 240 : mm.difficulty === 'medium' ? 170 : 110;

  const resetSprint = useCallback((diff: DifficultyLevel, seedVal: number) => {
    setTimeLeft(60);
    setPromptIdx(0);
    setPrompt(generateMathPrompt(diff, seedVal, 0));
    setAnswerInput('');
    setScore(0);
    setSolvedCount(0);
    setCombo(1);
    setFinished(false);
    setRewardBanner(null);
  }, []);

  useEffect(() => {
    resetSprint(activeDiff, mm.seed);
  }, [activeDiff, mm.seed, mm.matchPhase, resetSprint]);

  const startSprint = () => {
    soundFx.playSelect();
    if (isHumanDuel) {
      mm.rematchHuman();
    } else {
      const nextSeed = mm.rotateLocalSeed();
      resetSprint(mm.difficulty, nextSeed);
    }
  };

  useEffect(() => {
    if (mm.matchPhase === 'searching' || finished) return;
    if (timeLeft <= 0) {
      void finishSprint();
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mm.matchPhase, finished, timeLeft]);

  const finishSprint = async () => {
    setFinished(true);

    if (isHumanDuel) {
      soundFx.playWin();
      mm.sendDuelProgress({
        score,
        progress: solvedCount,
        maxProgress: 25,
        finished: true,
        summary: `${solvedCount} solved · ${score} pts`,
      });
      return;
    }

    const outcome: 'win' | 'loss' | 'draw' =
      score > aiBenchmark ? 'win' : score === aiBenchmark ? 'draw' : 'loss';
    if (outcome === 'win') soundFx.playWin();
    else if (outcome === 'draw') soundFx.playDraw();
    else soundFx.playLoss();

    try {
      const res = await completeSinglePlayerGame(player, {
        gameId: 'quick_math',
        mode: 'sprint_60s',
        difficulty: mm.difficulty,
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
    if (finished || mm.matchPhase === 'searching') return;
    const numeric = Number(answerInput.trim());
    if (!Number.isFinite(numeric) || answerInput.trim() === '') return;

    if (numeric === prompt.answer) {
      soundFx.playSelect();
      const gain = 10 * combo;
      const nextScore = score + gain;
      const nextSolved = solvedCount + 1;
      const nextIdx = promptIdx + 1;
      setScore(nextScore);
      setSolvedCount(nextSolved);
      setCombo((c) => Math.min(5, c + 1));
      setPromptIdx(nextIdx);
      setPrompt(generateMathPrompt(activeDiff, mm.seed, nextIdx));
      setAnswerInput('');

      if (isHumanDuel) {
        mm.sendDuelProgress({
          score: nextScore,
          progress: nextSolved,
          maxProgress: 25,
          finished: false,
          summary: `${nextSolved} solved · ${nextScore} pts`,
        });
      }
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
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Games
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Quick Math Challenge</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.quick_math.wins}</span>
          <span>Best Score: {player.stats.byGame.quick_math.bestScore}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={mm.setDifficulty}
        liveMatch={mm.liveMatch}
        mySeat={mm.mySeat}
        opponentSeat={mm.opponentSeat}
        onlineCount={mm.onlineCount}
        onSkipToAi={mm.skipToAi}
        onSearchHuman={mm.searchForHuman}
        onLeaveHuman={mm.leaveHumanMatch}
        onRematchHuman={mm.rematchHuman}
        onSendChat={mm.sendChat}
        showDuelBar
        extraControls={
          mm.matchPhase === 'ai' ? (
            <button
              type="button"
              onClick={startSprint}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#060811] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restart 60s
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5">
            {mm.matchPhase === 'searching' ? (
              <div className="py-10 text-center space-y-3">
                <Calculator className="mx-auto h-10 w-10 text-[#F97316]" />
                <p className="font-display text-xl font-bold text-white">Preparing 60-Second Sprint...</p>
                <p className="text-xs text-slate-400">
                  Matching against another online solver or Speedbot AI.
                </p>
              </div>
            ) : !finished ? (
              <>
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1 text-white">
                    <Clock className="h-3.5 w-3.5 text-[#F97316]" /> {timeLeft}s
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#38BDF8]">
                    <Flame className="h-3.5 w-3.5" /> Combo {combo}×
                  </span>
                  <span className="text-emerald-400">
                    Score: {score} {!isHumanDuel ? `/ ${aiBenchmark} AI` : ''}
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
                  {isHumanDuel
                    ? mm.liveMatch?.winnerSummary || 'Sprint Complete!'
                    : score >= aiBenchmark
                    ? 'You Outpaced Speedbot AI!'
                    : 'Sprint Complete'}
                </h2>
                <p className="font-mono text-sm text-slate-300">
                  Solved: {solvedCount} equations · Final Score: {score} pts
                  {!isHumanDuel ? ` (AI Target: ${aiBenchmark})` : ''}
                </p>
                {rewardBanner && (
                  <p className="font-mono text-xs text-[#38BDF8]">
                    +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                  </p>
                )}
                <button
                  type="button"
                  onClick={startSprint}
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
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#F97316] shrink-0">+{m.scoreDelta}</span>
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
