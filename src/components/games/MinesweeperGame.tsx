import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bomb, Flag, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { createSeededRng } from '../../utils/seededRandom.ts';
import { soundFx } from '../../utils/sound.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface MineCell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
}

const NUM_COLORS: Record<number, string> = {
  1: 'text-[#38BDF8]',
  2: 'text-emerald-400',
  3: 'text-rose-400',
  4: 'text-[#8B5CF6]',
  5: 'text-[#F97316]',
  6: 'text-teal-300',
  7: 'text-pink-400',
  8: 'text-slate-200',
};

interface MinesweeperGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function MinesweeperGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: MinesweeperGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'minesweeper')!;
  const mm = useUniversalMatchmaking('minesweeper', { player });

  const dims =
    mm.difficulty === 'hard'
      ? { rows: 14, cols: 14, mines: 32 }
      : mm.difficulty === 'medium'
      ? { rows: 11, cols: 11, mines: 18 }
      : { rows: 9, cols: 9, mines: 10 };

  const [cells, setCells] = useState<MineCell[]>(() =>
    Array.from({ length: dims.rows * dims.cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    }))
  );
  const [initialized, setInitialized] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const resetBoard = useCallback(() => {
    setCells(
      Array.from({ length: dims.rows * dims.cols }, () => ({
        mine: false,
        revealed: false,
        flagged: false,
        adjacent: 0,
      }))
    );
    setInitialized(false);
    setStatus('playing');
    setElapsedSec(0);
    setRewardBanner(null);
  }, [dims.cols, dims.rows]);

  useEffect(() => {
    resetBoard();
  }, [mm.difficulty, mm.seed, mm.matchPhase, resetBoard]);

  useEffect(() => {
    if (!initialized || status !== 'playing') return;
    const timer = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [initialized, status]);

  const placeMinesSafely = (safeIdx: number): MineCell[] => {
    const total = dims.rows * dims.cols;
    const rng = createSeededRng(mm.seed + safeIdx);
    const forbidden = new Set<number>([safeIdx]);
    const sr = Math.floor(safeIdx / dims.cols);
    const sc = safeIdx % dims.cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = sr + dr;
        const nc = sc + dc;
        if (nr >= 0 && nr < dims.rows && nc >= 0 && nc < dims.cols) {
          forbidden.add(nr * dims.cols + nc);
        }
      }
    }
    const candidates = Array.from({ length: total }, (_, i) => i).filter((i) => !forbidden.has(i));
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const mineSet = new Set(candidates.slice(0, Math.min(dims.mines, candidates.length)));
    const next: MineCell[] = Array.from({ length: total }, (_, i) => ({
      mine: mineSet.has(i),
      revealed: false,
      flagged: cells[i]?.flagged ?? false,
      adjacent: 0,
    }));

    for (let i = 0; i < total; i++) {
      if (next[i].mine) continue;
      const r = Math.floor(i / dims.cols);
      const c = i % dims.cols;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < dims.rows && nc >= 0 && nc < dims.cols && next[nr * dims.cols + nc].mine) {
            count++;
          }
        }
      }
      next[i].adjacent = count;
    }
    return next;
  };

  const finishGame = (finalStatus: 'won' | 'lost', revealedCount: number, safeTotal: number) => {
    setStatus(finalStatus);
    const score =
      finalStatus === 'won'
        ? Math.max(80, dims.mines * 12 + Math.max(0, 120 - elapsedSec))
        : Math.max(10, Math.round((revealedCount / Math.max(1, safeTotal)) * 45));

    mm.sendDuelProgress({
      score,
      progress: revealedCount,
      maxProgress: safeTotal,
      finished: true,
      summary: finalStatus === 'won' ? `Swept in ${elapsedSec}s` : `Mine hit (${revealedCount}/${safeTotal})`,
    });

    if (finalStatus === 'won') soundFx.playWin();
    else soundFx.playLoss();

    if (mm.matchPhase === 'ai') {
      void completeSinglePlayerGame(player, {
        gameId: 'minesweeper',
        mode: 'vs_ai',
        difficulty: mm.difficulty,
        outcome: finalStatus === 'won' ? 'win' : 'loss',
        opponentLabel: `Grid Solver AI (${mm.difficulty})`,
        scoreDelta: score,
        durationSec: Math.max(3, elapsedSec),
        summary: finalStatus === 'won' ? `Cleared ${dims.rows}×${dims.cols} in ${elapsedSec}s` : `Detonated mine on ${dims.rows}×${dims.cols}`,
      }).then((res) => {
        setRewardBanner(res.rewards);
        onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
      });
    }
  };

  const toggleFlag = (idx: number, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (status !== 'playing' || cells[idx]?.revealed) return;
    soundFx.playClick();
    setCells((prev) => prev.map((c, i) => (i === idx ? { ...c, flagged: !c.flagged } : c)));
  };

  const handleReveal = (idx: number) => {
    if (status !== 'playing' || mm.matchPhase === 'searching') return;
    if (flagMode) {
      toggleFlag(idx);
      return;
    }

    let working = cells.map((c) => ({ ...c }));
    if (!initialized) {
      working = placeMinesSafely(idx);
      setInitialized(true);
    }

    if (working[idx].flagged || working[idx].revealed) return;

    if (working[idx].mine) {
      const revealedAll = working.map((c) => (c.mine ? { ...c, revealed: true } : c));
      setCells(revealedAll);
      const revSafe = revealedAll.filter((c) => c.revealed && !c.mine).length;
      finishGame('lost', revSafe, working.length - dims.mines);
      return;
    }

    soundFx.playClick();
    // BFS flood fill for zeros
    const queue = [idx];
    const visited = new Set<number>([idx]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      working[cur].revealed = true;
      working[cur].flagged = false;
      if (working[cur].adjacent === 0) {
        const r = Math.floor(cur / dims.cols);
        const c = cur % dims.cols;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < dims.rows && nc >= 0 && nc < dims.cols) {
              const ni = nr * dims.cols + nc;
              if (!visited.has(ni) && !working[ni].revealed && !working[ni].mine) {
                visited.add(ni);
                queue.push(ni);
              }
            }
          }
        }
      }
    }

    setCells(working);
    const safeTotal = working.filter((c) => !c.mine).length;
    const revealedSafe = working.filter((c) => !c.mine && c.revealed).length;

    mm.sendDuelProgress({
      score: revealedSafe * 4,
      progress: revealedSafe,
      maxProgress: safeTotal,
      finished: false,
      summary: `${revealedSafe}/${safeTotal} cleared`,
    });

    if (revealedSafe === safeTotal) {
      finishGame('won', revealedSafe, safeTotal);
    }
  };

  const flagsCount = cells.filter((c) => c.flagged).length;
  const history = recentMatches.filter((m) => m.gameId === 'minesweeper');

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Minesweeper Grid</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.minesweeper?.wins ?? 0}</span>
          <span>Best Score: {player.stats.byGame.minesweeper?.bestScore ?? 0}</span>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFlagMode((f) => !f)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                flagMode
                  ? 'border-[#F97316] bg-[#F97316]/20 text-[#FDBA74]'
                  : 'border-white/[0.1] bg-[#060811] text-slate-300'
              }`}
            >
              <Flag className="h-3.5 w-3.5" /> {flagMode ? 'Flag Mode ON' : 'Sweep Mode'}
            </button>
            <button
              type="button"
              onClick={() => {
                mm.rotateLocalSeed();
                resetBoard();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
              <span className="text-[#F97316] font-bold">
                Mines Remaining: {Math.max(0, dims.mines - flagsCount)}
              </span>
              <span className="text-[#38BDF8] font-bold">Time: {elapsedSec}s</span>
            </div>

            <div
              style={{ gridTemplateColumns: `repeat(${dims.cols}, minmax(0, 1fr))` }}
              className="mx-auto grid max-w-[520px] gap-1 rounded-xl border border-white/[0.08] bg-[#060811] p-2.5"
            >
              {cells.map((cell, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleReveal(idx)}
                  onContextMenu={(e) => toggleFlag(idx, e)}
                  className={`aspect-square rounded-md border font-mono text-xs sm:text-sm font-bold transition flex items-center justify-center ${
                    cell.revealed
                      ? cell.mine
                        ? 'border-rose-500 bg-rose-600/80 text-white'
                        : 'border-white/[0.04] bg-[#0B1124]'
                      : cell.flagged
                      ? 'border-[#F97316]/60 bg-[#F97316]/15 text-[#F97316] cursor-pointer'
                      : 'border-white/[0.12] bg-[#161E3A] hover:border-[#38BDF8] cursor-pointer'
                  }`}
                >
                  {cell.revealed ? (
                    cell.mine ? (
                      <Bomb className="h-3.5 w-3.5" />
                    ) : cell.adjacent > 0 ? (
                      <span className={NUM_COLORS[cell.adjacent] || 'text-white'}>{cell.adjacent}</span>
                    ) : (
                      ''
                    )
                  ) : cell.flagged ? (
                    <Flag className="h-3 w-3" />
                  ) : (
                    ''
                  )}
                </button>
              ))}
            </div>

            {status !== 'playing' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {status === 'won'
                      ? `Sector Cleared in ${elapsedSec}s!`
                      : 'Mine Detonated — Better Luck Next Sweep!'}
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
                    resetBoard();
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
            <h3 className="font-display text-lg font-bold text-white">Recent Sweeps</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Clear every non-mine square to earn XP and Virtual Coins.</p>
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
