import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Play, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { createSeededRng } from '../../utils/seededRandom.ts';
import { soundFx } from '../../utils/sound.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

const GRID = 18;
type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

interface SnakeGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function SnakeGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: SnakeGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'snake')!;
  const mm = useUniversalMatchmaking('snake', { player });

  const initialSnake = useMemo(() => [GRID * 9 + 6, GRID * 9 + 5, GRID * 9 + 4], []);
  const [snake, setSnake] = useState<number[]>(initialSnake);
  const [food, setFood] = useState<number>(GRID * 9 + 12);
  const [bonusOrb, setBonusOrb] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [score, setScore] = useState(0);
  const [orbsEaten, setOrbsEaten] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const dirRef = useRef<Dir>('RIGHT');
  const nextDirRef = useRef<Dir>('RIGHT');
  const rngRef = useRef<() => number>(createSeededRng(mm.seed));

  const aiTarget = mm.difficulty === 'hard' ? 180 : mm.difficulty === 'medium' ? 110 : 60;
  const speedMs = mm.difficulty === 'hard' ? 105 : mm.difficulty === 'medium' ? 135 : 175;

  const spawnFood = useCallback((occupied: Set<number>) => {
    const candidates: number[] = [];
    for (let i = 0; i < GRID * GRID; i++) {
      if (!occupied.has(i)) candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    const idx = Math.floor(rngRef.current() * candidates.length);
    return candidates[idx];
  }, []);

  const resetArena = useCallback(
    (autoStart = false) => {
      rngRef.current = createSeededRng(mm.seed);
      const start = [GRID * 9 + 6, GRID * 9 + 5, GRID * 9 + 4];
      dirRef.current = 'RIGHT';
      nextDirRef.current = 'RIGHT';
      setSnake(start);
      setFood(spawnFood(new Set(start)));
      setBonusOrb(null);
      setScore(0);
      setOrbsEaten(0);
      setCrashed(false);
      setRewardBanner(null);
      setStartedAt(Date.now());
      setRunning(autoStart);
    },
    [mm.seed, spawnFood]
  );

  useEffect(() => {
    resetArena(mm.matchPhase === 'human');
  }, [mm.seed, mm.matchPhase, resetArena]);

  const setDirection = useCallback((next: Dir) => {
    const cur = dirRef.current;
    if (
      (cur === 'UP' && next === 'DOWN') ||
      (cur === 'DOWN' && next === 'UP') ||
      (cur === 'LEFT' && next === 'RIGHT') ||
      (cur === 'RIGHT' && next === 'LEFT')
    ) {
      return;
    }
    nextDirRef.current = next;
    if (!running && !crashed) setRunning(true);
  }, [crashed, running]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') setDirection('UP');
      else if (k === 'arrowdown' || k === 's') setDirection('DOWN');
      else if (k === 'arrowleft' || k === 'a') setDirection('LEFT');
      else if (k === 'arrowright' || k === 'd') setDirection('RIGHT');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDirection]);

  const handleCrash = useCallback(
    (finalScore: number, eatenCount: number) => {
      setRunning(false);
      setCrashed(true);
      mm.sendDuelProgress({
        score: finalScore,
        progress: eatenCount,
        maxProgress: 20,
        finished: true,
        summary: `${eatenCount} orbs · ${finalScore} pts`,
      });
      if (mm.matchPhase === 'human') {
        soundFx.playLoss();
        return;
      }
      const outcome: 'win' | 'loss' | 'draw' =
        finalScore >= aiTarget ? 'win' : finalScore >= Math.round(aiTarget * 0.65) ? 'draw' : 'loss';
      if (outcome === 'win') soundFx.playWin();
      else if (outcome === 'draw') soundFx.playDraw();
      else soundFx.playLoss();

      void completeSinglePlayerGame(player, {
        gameId: 'snake',
        mode: 'vs_ai',
        difficulty: mm.difficulty,
        outcome,
        opponentLabel: `Cyber Snake AI (${mm.difficulty})`,
        scoreDelta: Math.max(12, Math.round(finalScore * 0.8)),
        durationSec: Math.max(4, Math.round((Date.now() - startedAt) / 1000)),
        summary: `Scored ${finalScore} pts (${eatenCount} energy orbs)`,
      }).then((res) => {
        setRewardBanner(res.rewards);
        onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
      });
    },
    [aiTarget, mm, onProgressUpdated, player, startedAt]
  );

  // Game loop tick
  useEffect(() => {
    if (!running || crashed) return;
    const timer = window.setInterval(() => {
      setSnake((prev) => {
        dirRef.current = nextDirRef.current;
        const head = prev[0];
        const r = Math.floor(head / GRID);
        const c = head % GRID;
        let nr = r;
        let nc = c;
        if (dirRef.current === 'UP') nr -= 1;
        else if (dirRef.current === 'DOWN') nr += 1;
        else if (dirRef.current === 'LEFT') nc -= 1;
        else nc += 1;

        if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) {
          handleCrash(score, orbsEaten);
          return prev;
        }
        const nextHead = nr * GRID + nc;
        const ateFood = nextHead === food;
        const ateBonus = bonusOrb !== null && nextHead === bonusOrb;
        const bodyToCheck = ateFood || ateBonus ? prev : prev.slice(0, -1);
        if (bodyToCheck.includes(nextHead)) {
          handleCrash(score, orbsEaten);
          return prev;
        }

        const nextSnake = [nextHead, ...prev];
        if (!ateFood && !ateBonus) nextSnake.pop();

        if (ateFood || ateBonus) {
          soundFx.playSelect();
          const gained = ateBonus ? 30 : 10;
          const nextScore = score + gained;
          const nextEaten = orbsEaten + 1;
          setScore(nextScore);
          setOrbsEaten(nextEaten);
          const occ = new Set(nextSnake);
          if (ateFood) {
            setFood(spawnFood(occ));
            if (nextEaten % 5 === 0 && bonusOrb === null) {
              setBonusOrb(spawnFood(occ));
            }
          }
          if (ateBonus) setBonusOrb(null);
          mm.sendDuelProgress({
            score: nextScore,
            progress: nextEaten,
            maxProgress: 20,
            finished: false,
            summary: `${nextEaten} orbs · ${nextScore} pts`,
          });
        }
        return nextSnake;
      });
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [bonusOrb, crashed, food, handleCrash, mm, orbsEaten, running, score, spawnFood, speedMs]);

  const snakeSet = useMemo(() => new Set(snake), [snake]);
  const history = recentMatches.filter((m) => m.gameId === 'snake');

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Cyber Snake Arcade</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.snake?.wins ?? 0}</span>
          <span>Best Score: {player.stats.byGame.snake?.bestScore ?? 0}</span>
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
          <button
            type="button"
            onClick={() => {
              mm.rotateLocalSeed();
              resetArena(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset Grid
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
              <div className="flex items-center gap-4">
                <span className="text-emerald-400 font-bold">Score: {score}</span>
                <span className="text-[#38BDF8]">Length: {snake.length}</span>
                {mm.matchPhase === 'ai' && <span className="text-slate-400">AI Target: {aiTarget}</span>}
              </div>
              {!running && !crashed && (
                <button
                  type="button"
                  onClick={() => setRunning(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 font-sans text-xs font-bold text-white cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Launch Snake
                </button>
              )}
            </div>

            <div
              style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }}
              className="mx-auto grid max-w-[460px] gap-0.5 rounded-xl border-2 border-[#38BDF8]/30 bg-[#060811] p-2"
            >
              {Array.from({ length: GRID * GRID }, (_, idx) => {
                const isHead = snake[0] === idx;
                const isBody = !isHead && snakeSet.has(idx);
                const isFood = idx === food;
                const isBonus = idx === bonusOrb;
                return (
                  <div
                    key={idx}
                    className={`aspect-square rounded-[3px] ${
                      isHead
                        ? 'bg-[#38BDF8] shadow-[0_0_8px_rgba(56,189,248,0.85)]'
                        : isBody
                        ? 'bg-[#8B5CF6]'
                        : isFood
                        ? 'rounded-full bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                        : isBonus
                        ? 'rounded-full bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.9)]'
                        : 'bg-[#0B1022]'
                    }`}
                  />
                );
              })}
            </div>

            {/* Mobile & Mouse D-Pad Controls */}
            <div className="mx-auto flex max-w-[200px] flex-col items-center gap-1.5 pt-1">
              <button
                type="button"
                aria-label="Move Up"
                onClick={() => setDirection('UP')}
                className="flex h-10 w-14 items-center justify-center rounded-xl border border-white/[0.12] bg-[#060811] text-white hover:border-[#38BDF8] cursor-pointer"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-label="Move Left"
                  onClick={() => setDirection('LEFT')}
                  className="flex h-10 w-14 items-center justify-center rounded-xl border border-white/[0.12] bg-[#060811] text-white hover:border-[#38BDF8] cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move Down"
                  onClick={() => setDirection('DOWN')}
                  className="flex h-10 w-14 items-center justify-center rounded-xl border border-white/[0.12] bg-[#060811] text-white hover:border-[#38BDF8] cursor-pointer"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move Right"
                  onClick={() => setDirection('RIGHT')}
                  className="flex h-10 w-14 items-center justify-center rounded-xl border border-white/[0.12] bg-[#060811] text-white hover:border-[#38BDF8] cursor-pointer"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {crashed && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {mm.matchPhase === 'human'
                      ? mm.liveMatch?.winnerSummary || `Run Ended — ${score} pts`
                      : score >= aiTarget
                      ? `Victory! Beat AI Score (${score} vs ${aiTarget})`
                      : `Crashed at ${score} pts (AI Target: ${aiTarget})`}
                  </p>
                  {rewardBanner && (
                    <p className="mt-0.5 font-mono text-xs text-emerald-400">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={mm.matchPhase === 'human' ? mm.rematchHuman : () => {
                    mm.rotateLocalSeed();
                    resetArena(true);
                  }}
                  className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white">Rules & Controls</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Snake Runs</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Eat glowing energy orbs and dodge walls to set a record.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {history.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="truncate text-slate-200">{m.summary}</span>
                    <span className="font-mono text-[#38BDF8] shrink-0">+{m.scoreDelta}</span>
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
