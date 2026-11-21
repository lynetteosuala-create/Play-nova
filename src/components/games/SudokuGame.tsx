import { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Eraser, Lightbulb, Pencil, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundFx } from '../../utils/sound.ts';

function generateSudoku(difficulty: DifficultyLevel): { puzzle: number[]; solution: number[] } {
  const base = [
    1, 2, 3, 4, 5, 6, 7, 8, 9,
    4, 5, 6, 7, 8, 9, 1, 2, 3,
    7, 8, 9, 1, 2, 3, 4, 5, 6,
    2, 3, 4, 5, 6, 7, 8, 9, 1,
    5, 6, 7, 8, 9, 1, 2, 3, 4,
    8, 9, 1, 2, 3, 4, 5, 6, 7,
    3, 4, 5, 6, 7, 8, 9, 1, 2,
    6, 7, 8, 9, 1, 2, 3, 4, 5,
    9, 1, 2, 3, 4, 5, 6, 7, 8,
  ];
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
  const solution = base.map((v) => digits[v - 1]);

  // Band & row permutations preserve valid Latin + 3x3 box properties
  const rowOrder: number[] = [];
  const bandPerm = [0, 1, 2].sort(() => Math.random() - 0.5);
  for (const b of bandPerm) {
    const inner = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (const r of inner) rowOrder.push(b * 3 + r);
  }
  const colOrder: number[] = [];
  const stackPerm = [0, 1, 2].sort(() => Math.random() - 0.5);
  for (const s of stackPerm) {
    const inner = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (const c of inner) colOrder.push(s * 3 + c);
  }

  const permuted = Array(81).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      permuted[r * 9 + c] = solution[rowOrder[r] * 9 + colOrder[c]];
    }
  }

  const blanks = difficulty === 'hard' ? 46 : difficulty === 'medium' ? 38 : 28;
  const puzzle = [...permuted];
  const indices = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5);
  for (let i = 0; i < blanks; i++) {
    puzzle[indices[i]] = 0;
  }
  return { puzzle, solution: permuted };
}

interface SudokuGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function SudokuGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: SudokuGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'sudoku')!;
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('easy');
  const [data, setData] = useState(() => generateSudoku('easy'));
  const [grid, setGrid] = useState<number[]>(() => [...data.puzzle]);
  const [notes, setNotes] = useState<Record<number, number[]>>({});
  const [notesMode, setNotesMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [finished, setFinished] = useState<'win' | 'loss' | null>(null);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const sudokuHistory = recentMatches.filter((m) => m.gameId === 'sudoku');

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [finished]);

  const startNewPuzzle = (diff = difficulty) => {
    soundFx.playClick();
    setDifficulty(diff);
    const next = generateSudoku(diff);
    setData(next);
    setGrid([...next.puzzle]);
    setNotes({});
    setSelectedCell(null);
    setMistakes(0);
    setElapsedSec(0);
    setFinished(null);
    setRewardBanner(null);
  };

  const reportOutcome = async (outcome: 'win' | 'loss', finalMistakes: number) => {
    setFinished(outcome);
    if (outcome === 'win') soundFx.playWin();
    else soundFx.playLoss();

    const scoreDelta =
      outcome === 'win'
        ? Math.max(80, (difficulty === 'hard' ? 240 : difficulty === 'medium' ? 180 : 120) - finalMistakes * 15)
        : 15;
    try {
      const res = await apiFetch<{
        rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player: PlayerProfile;
        newlyUnlocked: string[];
        completedChallenges: string[];
      }>('/api/games/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'sudoku',
          mode: 'solo',
          difficulty,
          outcome,
          opponentLabel: `9×9 ${difficulty} Grid`,
          scoreDelta,
          durationSec: Math.max(10, elapsedSec),
          summary:
            outcome === 'win'
              ? `Solved ${difficulty} Sudoku in ${elapsedSec}s (${finalMistakes} mistakes)`
              : `Reached 3 mistakes on ${difficulty} Sudoku`,
        }),
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // ignore error
    }
  };

  const enterNumber = (num: number) => {
    if (finished || selectedCell === null) return;
    if (data.puzzle[selectedCell] !== 0) return;

    if (notesMode && num !== 0) {
      soundFx.playClick();
      setNotes((prev) => {
        const cur = new Set(prev[selectedCell] || []);
        if (cur.has(num)) cur.delete(num);
        else cur.add(num);
        return { ...prev, [selectedCell]: Array.from(cur).sort() };
      });
      return;
    }

    if (num === 0) {
      soundFx.playClick();
      setGrid((g) => g.map((v, i) => (i === selectedCell ? 0 : v)));
      return;
    }

    const correct = data.solution[selectedCell];
    const nextGrid = grid.map((v, i) => (i === selectedCell ? num : v));
    setGrid(nextGrid);

    if (num !== correct) {
      soundFx.playLoss();
      const nextMistakes = mistakes + 1;
      setMistakes(nextMistakes);
      if (nextMistakes >= 3) {
        void reportOutcome('loss', nextMistakes);
      }
      return;
    }

    soundFx.playSelect();
    setNotes((prev) => ({ ...prev, [selectedCell]: [] }));
    if (nextGrid.every((v, idx) => v === data.solution[idx])) {
      void reportOutcome('win', mistakes);
    }
  };

  const handleAiHint = () => {
    if (finished) return;
    const openIndices = grid
      .map((v, idx) => (v !== data.solution[idx] ? idx : -1))
      .filter((idx) => idx >= 0);
    if (openIndices.length === 0) return;
    const target = selectedCell !== null && openIndices.includes(selectedCell)
      ? selectedCell
      : openIndices[0];
    const nextGrid = grid.map((v, i) => (i === target ? data.solution[target] : v));
    setGrid(nextGrid);
    setSelectedCell(target);
    soundFx.playSelect();
    if (nextGrid.every((v, idx) => v === data.solution[idx])) {
      void reportOutcome('win', mistakes);
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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Sudoku</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-slate-300">
          <span>Wins: {player.stats.byGame.sudoku.wins}</span>
          <span>Points: {player.stats.byGame.sudoku.points}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4">
            <div className="flex gap-1.5">
              {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => startNewPuzzle(d)}
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

            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="inline-flex items-center gap-1 text-slate-200">
                <Clock className="h-3.5 w-3.5 text-[#38BDF8]" /> {elapsedSec}s
              </span>
              <span className={mistakes >= 2 ? 'text-rose-400' : 'text-slate-300'}>
                Mistakes: {mistakes}/3
              </span>
            </div>

            <button
              type="button"
              onClick={() => startNewPuzzle(difficulty)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#060811] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> New Grid
            </button>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-5 space-y-4">
            <div className="mx-auto aspect-square w-full max-w-[432px] overflow-hidden rounded-xl border-2 border-[#38BDF8]/50 bg-[#060811]">
              <div className="grid h-full w-full grid-cols-9 grid-rows-9">
                {grid.map((val, idx) => {
                  const row = Math.floor(idx / 9);
                  const col = idx % 9;
                  const given = data.puzzle[idx] !== 0;
                  const wrong = !given && val !== 0 && val !== data.solution[idx];
                  const selected = selectedCell === idx;
                  const cellNotes = notes[idx] || [];

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedCell(idx)}
                      className={`relative flex items-center justify-center border border-white/[0.08] font-mono text-base sm:text-lg font-bold transition cursor-pointer ${
                        col % 3 === 2 && col < 8 ? 'border-r-2 border-r-[#38BDF8]/40' : ''
                      } ${row % 3 === 2 && row < 8 ? 'border-b-2 border-b-[#38BDF8]/40' : ''} ${
                        selected
                          ? 'bg-[#8B5CF6]/35'
                          : given
                          ? 'bg-[#0C1224] text-white'
                          : 'bg-[#060811]'
                      } ${wrong ? 'text-rose-400' : !given && val !== 0 ? 'text-[#38BDF8]' : ''}`}
                    >
                      {val !== 0 ? (
                        val
                      ) : cellNotes.length > 0 ? (
                        <span className="text-[9px] leading-none text-slate-400">
                          {cellNotes.slice(0, 4).join(' ')}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Keypad & Controls */}
            <div className="mx-auto max-w-[432px] space-y-2.5">
              <div className="grid grid-cols-9 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={Boolean(finished)}
                    onClick={() => enterNumber(n)}
                    className="rounded-lg border border-white/[0.1] bg-[#060811] py-2.5 font-mono text-sm font-bold text-white hover:border-[#8B5CF6] hover:bg-[#131932] cursor-pointer"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setNotesMode((m) => !m)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                    notesMode
                      ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                      : 'border-slate-700 bg-[#060811] text-slate-300'
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" /> Notes {notesMode ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(finished)}
                  onClick={() => enterNumber(0)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                >
                  <Eraser className="h-3.5 w-3.5" /> Erase
                </button>
                <button
                  type="button"
                  disabled={Boolean(finished)}
                  onClick={handleAiHint}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#F97316]/40 bg-[#F97316]/10 px-3 py-2 text-xs font-semibold text-[#FDBA74] hover:bg-[#F97316]/20 cursor-pointer"
                >
                  <Lightbulb className="h-3.5 w-3.5" /> AI Logical Hint
                </button>
              </div>
            </div>

            {finished && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {finished === 'win' ? 'Sudoku Completed!' : '3 Mistakes Reached'}
                  </p>
                  {rewardBanner && (
                    <p className="font-mono text-xs text-slate-300">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => startNewPuzzle(difficulty)}
                  className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  New Sudoku
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white">Sudoku Rules</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Sudoku Runs</h3>
            {sudokuHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Solve a grid to record your completion times.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {sudokuHistory.slice(0, 6).map((m) => (
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
