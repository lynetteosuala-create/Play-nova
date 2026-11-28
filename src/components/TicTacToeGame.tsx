import { useEffect, useState } from 'react';
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
import {
  chooseLocalTttAiMove,
  completeSinglePlayerGame,
  recordLocalInstantMatch,
} from '../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../types.ts';
import { soundFx } from '../utils/sound.ts';
import { wsClient } from '../utils/wsClient.ts';
import { UniversalMatchBar } from './UniversalMatchBar.tsx';

type CellVal = 'X' | 'O' | null;

const PRESET_WIN_TARGETS = [3, 4, 5, 6, 7];

interface TicTacToeGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function TicTacToeGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: TicTacToeGameProps) {
  const catalog = GAME_CATALOG[0];
  const [winTargetInput, setWinTargetInput] = useState<number>(3);
  const [boardSizeMode, setBoardSizeMode] = useState<'auto' | 'custom'>('auto');
  const [customBoardSize, setCustomBoardSize] = useState<number>(3);
  const previewConfig = normalizeTttConfig(
    winTargetInput,
    boardSizeMode === 'auto' ? 'auto' : customBoardSize
  );

  const mm = useUniversalMatchmaking('tictactoe', {
    player,
    tttBoardSize: previewConfig.boardSize,
    tttWinTarget: previewConfig.winTarget,
  });

  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [localMode, setLocalMode] = useState<'vs_ai' | 'local_2p'>('vs_ai');
  const [playerMark, setPlayerMark] = useState<'X' | 'O'>('X');
  const [matchBoardSize, setMatchBoardSize] = useState<number>(3);
  const [matchWinTarget, setMatchWinTarget] = useState<number>(3);
  const [board, setBoard] = useState<CellVal[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [outcomeBanner, setOutcomeBanner] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Your turn as X. Align 3 in a row to win.');
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [localStartedAt, setLocalStartedAt] = useState<number>(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.tttState);
  const tttServer = isHuman ? mm.liveMatch!.tttState! : null;
  const myTeam: 'X' | 'O' = isHuman ? (mm.mySeat?.team === 'O' ? 'O' : 'X') : playerMark;

  const activeBoard = tttServer ? tttServer.board : board;
  const activeBoardSize = tttServer ? tttServer.boardSize : matchBoardSize;
  const activeWinTarget = tttServer ? tttServer.winTarget : matchWinTarget;
  const activeWinLine = tttServer ? tttServer.winLine : winLine;
  const isFinished = tttServer ? Boolean(tttServer.winnerTeam) : Boolean(outcomeBanner);

  const tttMatches = recentMatches.filter((m) => m.gameId === 'tictactoe');

  const handleSelectWinTarget = (nextTarget: number) => {
    const clamped = Math.max(MIN_WIN_TARGET, Math.min(MAX_WIN_TARGET, Math.floor(nextTarget || MIN_WIN_TARGET)));
    setWinTargetInput(clamped);
    const autoSize = recommendedBoardSize(clamped);
    if (boardSizeMode === 'auto' || customBoardSize < clamped) {
      setCustomBoardSize(autoSize);
    }
    soundFx.playSelect();
  };

  const startLocalMatch = (overrideMode = localMode, overrideMark = playerMark) => {
    soundFx.playSelect();
    setWinLine(null);
    setOutcomeBanner(null);
    setRewardBanner(null);
    setLocalMode(overrideMode);
    setPlayerMark(overrideMark);

    const cfg = normalizeTttConfig(
      winTargetInput,
      boardSizeMode === 'auto' ? 'auto' : customBoardSize
    );
    const nextBoard: CellVal[] = Array(cfg.boardSize * cfg.boardSize).fill(null);
    if (overrideMode === 'vs_ai' && overrideMark === 'O') {
      const aiIdx = chooseLocalTttAiMove(nextBoard, mm.difficulty, 'X', cfg.boardSize, cfg.winTarget);
      if (aiIdx >= 0) nextBoard[aiIdx] = 'X';
    }
    setMatchBoardSize(cfg.boardSize);
    setMatchWinTarget(cfg.winTarget);
    setBoard(nextBoard);
    setTurn(overrideMode === 'local_2p' ? 'X' : overrideMark);
    setLocalStartedAt(Date.now());
    setShowRulesDrawer(false);
    setStatusMessage(
      overrideMode === 'local_2p'
        ? `Player 1 (X) moves first. Connect ${cfg.winTarget} in a row!`
        : overrideMark === 'O'
        ? `AI opened with X. Align ${cfg.winTarget} in a row as O.`
        : `Your turn as X. Align ${cfg.winTarget} in a row.`
    );
  };

  // Start immediately when entering AI phase
  useEffect(() => {
    if (mm.matchPhase === 'ai') {
      setStatusMessage(`Your turn as ${playerMark}. Align ${matchWinTarget} in a row.`);
    }
  }, [mm.matchPhase, matchWinTarget, playerMark]);

  const handleCellClick = async (idx: number) => {
    if (mm.matchPhase === 'searching' || isFinished || activeBoard[idx] !== null) return;

    if (isHuman && tttServer) {
      if (tttServer.activeSeatIndex !== mm.mySeatIndex) return;
      soundFx.playSelect();
      wsClient.emit('ttt:move', { cellIndex: idx });
      return;
    }

    if (localMode === 'local_2p') {
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
        setOutcomeBanner(`Player ${evalRes.winner === 'X' ? '1 (X)' : '2 (O)'} Wins!`);
        setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
      }
      const localRes = await completeSinglePlayerGame(player, {
        gameId: 'tictactoe',
        mode: 'local_2p',
        difficulty: 'medium',
        outcome: evalRes.winner === 'draw' ? 'draw' : 'win',
        opponentLabel: 'Local Player 2',
        scoreDelta: evalRes.winner === 'draw' ? 25 : 40,
        durationSec: Math.max(3, Math.round((Date.now() - localStartedAt) / 1000)),
        summary: `${matchBoardSize}×${matchBoardSize} Local 2P`,
      });
      setRewardBanner(localRes.rewards);
      onProgressUpdated(localRes.player, localRes.newlyUnlocked, localRes.completedChallenges);
      return;
    }

    soundFx.playClick();
    const nextBoard = [...board];
    nextBoard[idx] = playerMark;
    const aiMark: 'X' | 'O' = playerMark === 'X' ? 'O' : 'X';
    let evalRes = evaluateTttBoard(nextBoard, matchBoardSize, matchWinTarget);
    let aiMoveIndex: number | null = null;

    if (!evalRes.winner) {
      aiMoveIndex = chooseLocalTttAiMove(nextBoard, mm.difficulty, aiMark, matchBoardSize, matchWinTarget);
      if (aiMoveIndex >= 0) {
        nextBoard[aiMoveIndex] = aiMark;
        evalRes = evaluateTttBoard(nextBoard, matchBoardSize, matchWinTarget);
      }
    }

    setBoard(nextBoard);
    if (!evalRes.winner) {
      setStatusMessage(
        aiMoveIndex !== null
          ? `AI responded on square #${aiMoveIndex + 1}. Your move as ${playerMark}.`
          : `Your turn as ${playerMark}.`
      );
      return;
    }

    setWinLine(evalRes.line);
    const outcome: 'win' | 'loss' | 'draw' =
      evalRes.winner === 'draw' ? 'draw' : evalRes.winner === playerMark ? 'win' : 'loss';
    if (outcome === 'win') {
      soundFx.playWin();
      setOutcomeBanner(`Victory! ${matchWinTarget}-in-a-Row Completed`);
      setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
    } else if (outcome === 'draw') {
      soundFx.playDraw();
      setOutcomeBanner('Draw — Tactical Stalemate');
      setSessionScore((s) => ({ ...s, draws: s.draws + 1 }));
    } else {
      soundFx.playLoss();
      setOutcomeBanner(`Defeat — AI Completed ${matchWinTarget}-in-a-Row`);
      setSessionScore((s) => ({ ...s, losses: s.losses + 1 }));
    }
    setStatusMessage('Round complete. Press Rematch to play again.');
    const scoreDelta =
      outcome === 'win'
        ? (mm.difficulty === 'hard' ? 140 : mm.difficulty === 'medium' ? 100 : 70) + (matchWinTarget - 3) * 15
        : outcome === 'draw'
        ? 35
        : 10;
    const recorded = recordLocalInstantMatch(player, {
      gameId: 'tictactoe',
      mode: 'vs_ai',
      difficulty: mm.difficulty,
      outcome,
      opponentLabel: `PLAYNOVA AI (${mm.difficulty})`,
      scoreDelta,
      durationSec: Math.max(3, Math.round((Date.now() - localStartedAt) / 1000)),
      summary: `${matchBoardSize}×${matchBoardSize} (${matchWinTarget}-in-a-row) vs ${mm.difficulty} AI`,
    });
    setRewardBanner(recorded.rewards);
    onProgressUpdated(recorded.player, recorded.newlyUnlocked, recorded.completedChallenges);
  };

  const gridContainerClass =
    activeBoardSize <= 3
      ? 'max-w-xs gap-3'
      : activeBoardSize <= 5
      ? 'max-w-md gap-2'
      : activeBoardSize <= 8
      ? 'max-w-lg gap-1.5'
      : 'max-w-xl gap-1';

  const cellStyleClass =
    activeBoardSize <= 3
      ? 'rounded-2xl text-5xl'
      : activeBoardSize <= 5
      ? 'rounded-xl text-3xl'
      : activeBoardSize <= 8
      ? 'rounded-lg text-lg sm:text-2xl'
      : activeBoardSize <= 11
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
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Games
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Tic-Tac-Toe Arena</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.tictactoe.wins}</span>
          <span>Draws: {player.stats.byGame.tictactoe.draws}</span>
          <span>Points: {player.stats.byGame.tictactoe.points}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={(d) => {
          mm.setDifficulty(d);
          startLocalMatch('vs_ai', playerMark);
        }}
        liveMatch={mm.liveMatch}
        mySeat={mm.mySeat}
        opponentSeat={mm.opponentSeat}
        onlineCount={mm.onlineCount}
        onSkipToAi={mm.skipToAi}
        onSearchHuman={mm.searchForHuman}
        onLeaveHuman={mm.leaveHumanMatch}
        onRematchHuman={mm.rematchHuman}
        onSendChat={mm.sendChat}
        extraControls={
          !isHuman ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRulesDrawer((s) => !s)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <Grid3X3 className="h-3.5 w-3.5 text-[#38BDF8]" />
                {matchBoardSize}×{matchBoardSize} Rules
              </button>
              <button
                type="button"
                onClick={() => startLocalMatch(localMode, playerMark)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          ) : undefined
        }
      />

      {!isHuman && showRulesDrawer && (
        <div className="rounded-2xl border border-white/[0.1] bg-[#0E1324] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-white">Custom Grid & Win Target (3×3 up to 15×15)</p>
              <p className="text-[11px] text-slate-400">
                Choose symbols in a row or switch between AI and Local 2P.
              </p>
            </div>
            <span className="font-mono text-xs font-bold text-[#F97316]">
              {previewConfig.boardSize}×{previewConfig.boardSize} · {previewConfig.winTarget} in a row
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRESET_WIN_TARGETS.map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => handleSelectWinTarget(target)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-mono font-bold cursor-pointer ${
                  winTargetInput === target
                    ? 'border-[#E11D48] bg-[#E11D48]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-300'
                }`}
              >
                {target} in a row
              </button>
            ))}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#060811] px-2 py-1">
              <button
                type="button"
                onClick={() => handleSelectWinTarget(winTargetInput - 1)}
                disabled={winTargetInput <= MIN_WIN_TARGET}
                className="rounded p-1 text-slate-300 disabled:opacity-35 cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center font-mono text-xs font-bold text-white">{winTargetInput}</span>
              <button
                type="button"
                onClick={() => handleSelectWinTarget(winTargetInput + 1)}
                disabled={winTargetInput >= MAX_WIN_TARGET}
                className="rounded p-1 text-slate-300 disabled:opacity-35 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLocalMode('vs_ai')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  localMode === 'vs_ai' ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white' : 'border-slate-700 text-slate-400'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" /> vs AI
              </button>
              <button
                type="button"
                onClick={() => setLocalMode('local_2p')}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                  localMode === 'local_2p' ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white' : 'border-slate-700 text-slate-400'
                }`}
              >
                <Users className="h-3.5 w-3.5" /> Local 2P
              </button>
              {localMode === 'vs_ai' && (
                <>
                  <button
                    type="button"
                    onClick={() => setPlayerMark('X')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      playerMark === 'X' ? 'border-rose-500 bg-rose-500/20 text-white' : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    Play X
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerMark('O')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                      playerMark === 'O' ? 'border-amber-500 bg-amber-500/20 text-white' : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    Play O
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setBoardSizeMode((m) => (m === 'auto' ? 'custom' : 'auto'));
                  setCustomBoardSize(recommendedBoardSize(winTargetInput));
                }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 cursor-pointer"
              >
                Grid: {boardSizeMode === 'auto' ? 'Auto' : `${customBoardSize}×${customBoardSize}`}
              </button>
              {boardSizeMode === 'custom' && (
                <input
                  type="range"
                  min={winTargetInput}
                  max={MAX_BOARD_SIZE}
                  value={Math.max(winTargetInput, customBoardSize)}
                  onChange={(e) => setCustomBoardSize(Number(e.target.value))}
                  className="accent-[#E11D48]"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => startLocalMatch(localMode, playerMark)}
              className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-bold text-white cursor-pointer"
            >
              Apply & Start Board
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-mono text-[11px] font-bold text-[#F59E0B]">
                  {activeBoardSize}×{activeBoardSize} GRID · {activeWinTarget} IN A ROW TO WIN
                </span>
                <p className="mt-1 text-sm font-medium text-slate-200">
                  {isHuman && tttServer
                    ? tttServer.winnerTeam
                      ? mm.liveMatch?.winnerSummary || 'Match complete'
                      : tttServer.activeSeatIndex === mm.mySeatIndex
                      ? `Your turn (${myTeam}) — place on the grid`
                      : `Waiting for ${mm.opponentSeat?.username || 'Opponent'} (${tttServer.currentTeam})...`
                    : statusMessage}
                </p>
              </div>
              {!isHuman && (
                <button
                  type="button"
                  onClick={() => startLocalMatch(localMode, playerMark)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#07090F] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {outcomeBanner ? 'Rematch' : 'Restart'}
                </button>
              )}
            </div>

            <div
              style={{ gridTemplateColumns: `repeat(${activeBoardSize}, minmax(0, 1fr))` }}
              className={`mx-auto grid w-full ${gridContainerClass}`}
            >
              {activeBoard.map((val, idx) => {
                const isWinCell = activeWinLine?.includes(idx);
                const disabled =
                  mm.matchPhase === 'searching' ||
                  isFinished ||
                  val !== null ||
                  (isHuman && tttServer?.activeSeatIndex !== mm.mySeatIndex);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={disabled}
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

            {isFinished && (
              <div className="rounded-xl border border-slate-700 bg-[#07090F] p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold text-white">
                    {isHuman ? mm.liveMatch?.winnerSummary : outcomeBanner}
                  </p>
                  {rewardBanner && (
                    <p className="mt-0.5 font-mono text-xs text-emerald-400">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={isHuman ? mm.rematchHuman : () => startLocalMatch(localMode, playerMark)}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
                >
                  Play Rematch
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-5 space-y-3">
            <h3 className="font-display text-lg font-bold text-white">Rules & Session Score</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
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
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
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
