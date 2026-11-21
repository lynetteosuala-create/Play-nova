import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Cpu, Grid3X3, Minus, Plus, RotateCcw, Trophy, Users } from 'lucide-react';
import { GAME_CATALOG } from '../game/catalog.ts';
import {
  evaluateTttBoard,
  MAX_BOARD_SIZE,
  MAX_WIN_TARGET,
  MIN_WIN_TARGET,
  normalizeTttConfig,
  recommendedBoardSize,
} from '../game/tttRules.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { soundFx } from '../utils/sound.ts';

type CellVal = 'X' | 'O' | null;

const PRESET_WIN_TARGETS = [3, 4, 5, 6, 7];

interface TicTacToeGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onOpenMultiplayer?: () => void;
  onBack: () => void;
}

export function TicTacToeGame({
  player,
  recentMatches,
  onProgressUpdated,
  onOpenMultiplayer,
  onBack,
}: TicTacToeGameProps) {
  const catalog = GAME_CATALOG[0];
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [mode, setMode] = useState<'vs_ai' | 'local_2p'>('vs_ai');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [playerMark, setPlayerMark] = useState<'X' | 'O'>('X');

  // Setup configuration (unrestricted: 3..12+ in a row, auto-expanding up to 15x15)
  const [winTargetInput, setWinTargetInput] = useState<number>(3);
  const [boardSizeMode, setBoardSizeMode] = useState<'auto' | 'custom'>('auto');
  const [customBoardSize, setCustomBoardSize] = useState<number>(3);

  const previewConfig = normalizeTttConfig(
    winTargetInput,
    boardSizeMode === 'auto' ? 'auto' : customBoardSize
  );

  // Active match state
  const [matchBoardSize, setMatchBoardSize] = useState<number>(3);
  const [matchWinTarget, setMatchWinTarget] = useState<number>(3);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [board, setBoard] = useState<CellVal[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [outcomeBanner, setOutcomeBanner] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Choose your board rules and opponent, then press Start Match.');
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [localStartedAt, setLocalStartedAt] = useState<number>(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });

  const tttMatches = recentMatches.filter((m) => m.gameId === 'tictactoe');

  const handleSelectWinTarget = (nextTarget: number) => {
    const clamped = Math.max(MIN_WIN_TARGET, Math.min(MAX_WIN_TARGET, Math.floor(nextTarget || MIN_WIN_TARGET)));
    setWinTargetInput(clamped);
    const autoSize = recommendedBoardSize(clamped);
    if (boardSizeMode === 'auto') {
      setCustomBoardSize(autoSize);
    } else if (customBoardSize < clamped) {
      setCustomBoardSize(autoSize);
    }
    soundFx.playSelect();
  };

  const startMatch = async () => {
    soundFx.playSelect();
    setWinLine(null);
    setOutcomeBanner(null);
    setRewardBanner(null);

    const cfg = normalizeTttConfig(
      winTargetInput,
      boardSizeMode === 'auto' ? 'auto' : customBoardSize
    );

    if (mode === 'local_2p') {
      setSessionId(null);
      setMatchBoardSize(cfg.boardSize);
      setMatchWinTarget(cfg.winTarget);
      setBoard(Array(cfg.boardSize * cfg.boardSize).fill(null));
      setTurn('X');
      setLocalStartedAt(Date.now());
      setPhase('playing');
      setStatusMessage(
        `Player 1 (X) moves first. Connect ${cfg.winTarget} in a row on the ${cfg.boardSize}×${cfg.boardSize} grid!`
      );
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        sessionId: string;
        board: CellVal[];
        boardSize: number;
        winTarget: number;
      }>('/api/games/tictactoe/start', {
        method: 'POST',
        body: JSON.stringify({
          difficulty,
          playerMark,
          winTarget: cfg.winTarget,
          boardSize: cfg.boardSize,
        }),
      });
      setSessionId(res.sessionId);
      setMatchBoardSize(res.boardSize);
      setMatchWinTarget(res.winTarget);
      setBoard(res.board);
      setTurn(playerMark);
      setPhase('playing');
      setStatusMessage(
        playerMark === 'O'
          ? `AI opened with X on the ${res.boardSize}×${res.boardSize} board. Align ${res.winTarget} in a row as O.`
          : `Your turn as X. Align ${res.winTarget} in a row horizontally, vertically, or diagonally.`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Unable to start Tic-Tac-Toe match.');
    } finally {
      setBusy(false);
    }
  };

  const handleCellClick = async (idx: number) => {
    if (busy || outcomeBanner || board[idx] !== null) return;

    if (mode === 'local_2p') {
      soundFx.playClick();
      const next = [...board];
      next[idx] = turn;
      setBoard(next);
      const evalRes = evaluateTttBoard(next, matchBoardSize, matchWinTarget);
      if (!evalRes.winner) {
        const nextTurn = turn === 'X' ? 'O' : 'X';
        setTurn(nextTurn);
        setStatusMessage(`Player ${nextTurn === 'X' ? '1 (X)' : '2 (O)'} turn · Target: ${matchWinTarget} in a row.`);
        return;
      }

      setWinLine(evalRes.line);
      if (evalRes.winner === 'draw') {
        soundFx.playDraw();
        setOutcomeBanner('Draw Game — Board Full');
        setSessionScore((s) => ({ ...s, draws: s.draws + 1 }));
      } else {
        soundFx.playWin();
        setOutcomeBanner(
          `Player ${evalRes.winner === 'X' ? '1 (X)' : '2 (O)'} Wins (${matchWinTarget} in a row)!`
        );
        setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
      }

      try {
        const res = await apiFetch<{
          player: PlayerProfile;
          rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
          newlyUnlocked: string[];
          completedChallenges: string[];
        }>('/api/games/tictactoe/local-complete', {
          method: 'POST',
          body: JSON.stringify({
            winner: evalRes.winner,
            boardSize: matchBoardSize,
            winTarget: matchWinTarget,
            durationSec: Math.max(3, Math.round((Date.now() - localStartedAt) / 1000)),
          }),
        });
        setRewardBanner(res.rewards);
        onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
      } catch {
        // non-fatal
      }
      return;
    }

    if (!sessionId) return;
    soundFx.playClick();
    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        board: CellVal[];
        boardSize: number;
        winTarget: number;
        aiMoveIndex: number | null;
        finished: boolean;
        outcome?: 'win' | 'loss' | 'draw';
        winLine?: number[] | null;
        rewards?: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player?: PlayerProfile;
        newlyUnlocked?: string[];
        completedChallenges?: string[];
      }>('/api/games/tictactoe/move', {
        method: 'POST',
        body: JSON.stringify({ sessionId, cellIndex: idx }),
      });

      setBoard(res.board);
      if (!res.finished) {
        setStatusMessage(
          res.aiMoveIndex !== null
            ? `AI responded on square #${res.aiMoveIndex + 1}. Your move as ${playerMark}.`
            : `Your turn as ${playerMark}.`
        );
      } else {
        setWinLine(res.winLine || null);
        if (res.outcome === 'win') {
          soundFx.playWin();
          setOutcomeBanner(`Victory! ${matchWinTarget}-in-a-Row Completed`);
          setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
        } else if (res.outcome === 'draw') {
          soundFx.playDraw();
          setOutcomeBanner('Draw — Tactical Stalemate');
          setSessionScore((s) => ({ ...s, draws: s.draws + 1 }));
        } else {
          soundFx.playLoss();
          setOutcomeBanner(`Defeat — AI Completed ${matchWinTarget}-in-a-Row`);
          setSessionScore((s) => ({ ...s, losses: s.losses + 1 }));
        }
        setStatusMessage('Round complete. Press Rematch to play again.');
        if (res.rewards) setRewardBanner(res.rewards);
        if (res.player) {
          onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
        }
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Move failed.');
    } finally {
      setBusy(false);
    }
  };

  // Responsive board container width & cell typography for 3x3 up to 15x15
  const gridContainerClass =
    matchBoardSize <= 3
      ? 'max-w-xs gap-3'
      : matchBoardSize <= 5
      ? 'max-w-md gap-2'
      : matchBoardSize <= 8
      ? 'max-w-lg gap-1.5'
      : 'max-w-xl gap-1';

  const cellStyleClass =
    matchBoardSize <= 3
      ? 'rounded-2xl text-5xl'
      : matchBoardSize <= 5
      ? 'rounded-xl text-3xl'
      : matchBoardSize <= 8
      ? 'rounded-lg text-lg sm:text-2xl'
      : matchBoardSize <= 11
      ? 'rounded-md text-xs sm:text-base'
      : 'rounded text-[10px] sm:text-xs';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Hub
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
            Tic-Tac-Toe Arena
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.tictactoe.wins}</span>
          <span>Draws: {player.stats.byGame.tictactoe.draws}</span>
          <span>Points: {player.stats.byGame.tictactoe.points}</span>
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 font-sans text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/40 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              Play Online / Mixed Rooms
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Control & Board Area */}
        <div className="space-y-5 lg:col-span-7">
          {phase === 'setup' ? (
            <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Rules & Custom Match Setup</h2>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                  {catalog.rules.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>

              {/* Custom Win Target & Auto-Expanding Board Size */}
              <div className="rounded-xl border border-white/[0.08] bg-[#07090F] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Grid3X3 className="h-3.5 w-3.5 text-[#E11D48]" />
                      Symbols in a Row to Win
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Pick 3, 4, 5, 6, 7, or enter any custom target up to {MAX_WIN_TARGET}. The grid expands automatically.
                    </p>
                  </div>
                  <span className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 font-mono text-xs font-bold text-[#F59E0B]">
                    {previewConfig.boardSize}×{previewConfig.boardSize} Board · {previewConfig.winTarget} to Win
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_WIN_TARGETS.map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => handleSelectWinTarget(target)}
                      className={`rounded-lg border px-3.5 py-2 text-xs font-mono font-bold transition cursor-pointer ${
                        winTargetInput === target
                          ? 'border-[#E11D48] bg-[#E11D48]/20 text-white'
                          : 'border-slate-700 bg-[#10141F] text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {target} in a row
                    </button>
                  ))}

                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#10141F] px-2 py-1">
                    <span className="text-[11px] text-slate-400 pl-1">Custom:</span>
                    <button
                      type="button"
                      aria-label="Decrease win target"
                      onClick={() => handleSelectWinTarget(winTargetInput - 1)}
                      disabled={winTargetInput <= MIN_WIN_TARGET}
                      className="rounded p-1 text-slate-300 hover:bg-white/10 disabled:opacity-35 cursor-pointer"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={MIN_WIN_TARGET}
                      max={MAX_WIN_TARGET}
                      value={winTargetInput}
                      onChange={(e) => handleSelectWinTarget(Number(e.target.value))}
                      aria-label="Custom win target in a row"
                      className="w-12 rounded bg-[#07090F] py-1 text-center font-mono text-xs font-bold text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Increase win target"
                      onClick={() => handleSelectWinTarget(winTargetInput + 1)}
                      disabled={winTargetInput >= MAX_WIN_TARGET}
                      className="rounded p-1 text-slate-300 hover:bg-white/10 disabled:opacity-35 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300">Board Dimensions:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setBoardSizeMode('auto');
                        setCustomBoardSize(recommendedBoardSize(winTargetInput));
                      }}
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold cursor-pointer ${
                        boardSizeMode === 'auto'
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                          : 'border-slate-700 bg-[#10141F] text-slate-400'
                      }`}
                    >
                      Auto ({recommendedBoardSize(winTargetInput)}×{recommendedBoardSize(winTargetInput)})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBoardSizeMode('custom');
                        setCustomBoardSize(Math.max(winTargetInput, customBoardSize));
                      }}
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold cursor-pointer ${
                        boardSizeMode === 'custom'
                          ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                          : 'border-slate-700 bg-[#10141F] text-slate-400'
                      }`}
                    >
                      Custom Grid
                    </button>
                  </div>

                  {boardSizeMode === 'custom' && (
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      Size:
                      <input
                        type="range"
                        min={winTargetInput}
                        max={MAX_BOARD_SIZE}
                        value={Math.max(winTargetInput, customBoardSize)}
                        onChange={(e) => setCustomBoardSize(Number(e.target.value))}
                        className="accent-[#E11D48]"
                      />
                      <span className="font-mono font-bold text-white">
                        {previewConfig.boardSize}×{previewConfig.boardSize}
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-300">Opponent Mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('vs_ai')}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold cursor-pointer ${
                        mode === 'vs_ai'
                          ? 'border-rose-500 bg-rose-600/20 text-white'
                          : 'border-slate-700 bg-[#07090F] text-slate-300'
                      }`}
                    >
                      <Cpu className="h-3.5 w-3.5" /> vs AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('local_2p')}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold cursor-pointer ${
                        mode === 'local_2p'
                          ? 'border-rose-500 bg-rose-600/20 text-white'
                          : 'border-slate-700 bg-[#07090F] text-slate-300'
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" /> 2-Player Local
                    </button>
                  </div>
                </div>

                {mode === 'vs_ai' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-300">AI Difficulty</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDifficulty(d)}
                          className={`rounded-xl border px-2 py-2.5 text-xs font-semibold capitalize cursor-pointer ${
                            difficulty === d
                              ? 'border-amber-500 bg-amber-600/20 text-white'
                              : 'border-slate-700 bg-[#07090F] text-slate-300'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {mode === 'vs_ai' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-300">Choose Your Mark</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPlayerMark('X')}
                      className={`rounded-xl border px-4 py-2 text-xs font-semibold cursor-pointer ${
                        playerMark === 'X'
                          ? 'border-rose-500 bg-rose-600/20 text-white'
                          : 'border-slate-700 bg-[#07090F] text-slate-300'
                      }`}
                    >
                      Play as X (Moves First)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayerMark('O')}
                      className={`rounded-xl border px-4 py-2 text-xs font-semibold cursor-pointer ${
                        playerMark === 'O'
                          ? 'border-amber-500 bg-amber-600/20 text-white'
                          : 'border-slate-700 bg-[#07090F] text-slate-300'
                      }`}
                    >
                      Play as O (Moves Second)
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void startMatch()}
                className="w-full rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 cursor-pointer"
              >
                {busy
                  ? 'Preparing Board...'
                  : `Start ${previewConfig.boardSize}×${previewConfig.boardSize} Match (${previewConfig.winTarget} in a row)`}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="inline-block rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#F59E0B]">
                    {matchBoardSize}×{matchBoardSize} GRID · {matchWinTarget} IN A ROW TO WIN
                  </span>
                  <p className="mt-1.5 text-sm font-medium text-slate-200">{statusMessage}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void startMatch()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#07090F] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> {outcomeBanner ? 'Rematch' : 'Restart'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase('setup')}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Change Rules
                  </button>
                </div>
              </div>

              {/* Dynamic N×N Interactive Board */}
              <div
                style={{ gridTemplateColumns: `repeat(${matchBoardSize}, minmax(0, 1fr))` }}
                className={`mx-auto grid w-full ${gridContainerClass}`}
              >
                {board.map((val, idx) => {
                  const isWinCell = winLine?.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={busy || Boolean(outcomeBanner) || val !== null}
                      onClick={() => void handleCellClick(idx)}
                      className={`aspect-square border font-display font-bold flex items-center justify-center transition ${cellStyleClass} ${
                        isWinCell
                          ? 'border-emerald-400 bg-emerald-950/50'
                          : 'border-slate-700 bg-[#07090F] hover:border-slate-500 disabled:hover:border-slate-700 cursor-pointer disabled:cursor-default'
                      }`}
                      aria-label={`Square ${idx + 1}: ${val || 'empty'}`}
                    >
                      {val && (
                        <motion.span
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.16 }}
                          className={val === 'X' ? 'text-rose-500' : 'text-amber-400'}
                        >
                          {val}
                        </motion.span>
                      )}
                    </button>
                  );
                })}
              </div>

              {outcomeBanner && (
                <div className="rounded-xl border border-slate-700 bg-[#07090F] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-bold text-white">{outcomeBanner}</p>
                    {rewardBanner && (
                      <p className="mt-0.5 font-mono text-xs text-emerald-400">
                        +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void startMatch()}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
                  >
                    Play Rematch
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Session Scoreboard & Match History */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-5">
            <h3 className="font-display text-lg font-bold text-white">Session Scoreboard</h3>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center font-mono">
              <div className="rounded-xl border border-slate-800 bg-[#07090F] p-3">
                <p className="text-[11px] text-slate-400">Wins</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-400">{sessionScore.wins}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#07090F] p-3">
                <p className="text-[11px] text-slate-400">Draws</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-amber-400">{sessionScore.draws}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#07090F] p-3">
                <p className="text-[11px] text-slate-400">Losses</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-rose-400">{sessionScore.losses}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-5">
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              Recent Tic-Tac-Toe Matches
            </h3>
            {tttMatches.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">
                Complete your first match to log history and earn XP & Coins.
              </p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {tttMatches.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#07090F] px-3.5 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium text-white">{m.summary}</p>
                      <p className="text-[11px] text-slate-400">{m.opponentLabel}</p>
                    </div>
                    <span
                      className={`font-mono font-semibold uppercase ${
                        m.outcome === 'win'
                          ? 'text-emerald-400'
                          : m.outcome === 'draw'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {m.outcome}
                    </span>
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
