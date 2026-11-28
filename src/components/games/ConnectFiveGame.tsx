import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowUp, Lightbulb, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import {
  applyPopOutCol,
  canPopOutCol,
  chooseConnectFiveAiMove,
  evaluateGravityBoard,
  getGravityDropRow,
  type GravityCell,
} from '../../game/connectFiveEngine.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { soundFx } from '../../utils/sound.ts';
import { wsClient } from '../../utils/wsClient.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface ConnectFiveGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

const COLS = 9;
const ROWS = 7;
const WIN_TARGET = 5;

export function ConnectFiveGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: ConnectFiveGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'connect_five')!;
  const mm = useUniversalMatchmaking('connect_five', { player });

  const [popOutEnabled, setPopOutEnabled] = useState(true);
  const [board, setBoard] = useState<GravityCell[]>(() => Array(COLS * ROWS).fill(null));
  const [turn, setTurn] = useState<'R' | 'Y'>('R');
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [outcomeText, setOutcomeText] = useState<string | null>(null);
  const [hintCol, setHintCol] = useState<number | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.connectFiveState);
  const c5Server = isHuman ? mm.liveMatch!.connectFiveState! : null;
  const myTeam: 'R' | 'Y' = isHuman ? (mm.mySeatIndex === 0 ? 'R' : 'Y') : 'R';

  const activeBoard = c5Server ? c5Server.board : board;
  const activeTurn = c5Server ? c5Server.currentTeam : turn;
  const activeWinLine = c5Server ? c5Server.winLine : winLine;
  const isFinished = c5Server ? Boolean(c5Server.winnerTeam) : Boolean(outcomeText);

  const finishLocal = async (winner: 'R' | 'Y' | 'draw', line: number[] | null) => {
    setWinLine(line);
    const outcome: 'win' | 'loss' | 'draw' = winner === 'draw' ? 'draw' : winner === 'R' ? 'win' : 'loss';
    if (outcome === 'win') {
      soundFx.playWin();
      setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
    } else if (outcome === 'draw') {
      soundFx.playDraw();
      setSessionScore((s) => ({ ...s, draws: s.draws + 1 }));
    } else {
      soundFx.playLoss();
      setSessionScore((s) => ({ ...s, losses: s.losses + 1 }));
    }
    const text =
      winner === 'draw'
        ? '9×7 Grid Locked — Draw!'
        : winner === 'R'
        ? 'Victory — Five in a Row!'
        : 'AI Completed Five in a Row!';
    setOutcomeText(text);

    const scoreDelta =
      outcome === 'win'
        ? mm.difficulty === 'hard'
          ? 175
          : mm.difficulty === 'medium'
          ? 135
          : 95
        : outcome === 'draw'
        ? 45
        : 12;

    const res = await completeSinglePlayerGame(player, {
      gameId: 'connect_five',
      mode: 'vs_ai',
      difficulty: mm.difficulty,
      outcome,
      opponentLabel: `Connect 5 AI (${mm.difficulty})`,
      scoreDelta,
      durationSec: Math.max(5, Math.round((Date.now() - startedAt) / 1000)),
      summary: text,
    });
    setRewardBanner(res.rewards);
    onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
  };

  useEffect(() => {
    if (isHuman || mm.matchPhase !== 'ai' || turn !== 'Y' || outcomeText) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseConnectFiveAiMove(board, COLS, ROWS, WIN_TARGET, mm.difficulty, 'Y', popOutEnabled);
      setAiThinking(false);
      if (!move) return;
      let nextBoard: GravityCell[] | null = null;
      if (move.popOut) {
        if (canPopOutCol(board, COLS, ROWS, move.col, 'Y')) {
          nextBoard = applyPopOutCol(board, COLS, ROWS, move.col);
        }
      } else {
        const r = getGravityDropRow(board, COLS, ROWS, move.col);
        if (r >= 0) {
          nextBoard = [...board];
          nextBoard[r * COLS + move.col] = 'Y';
        }
      }
      if (!nextBoard) return;
      soundFx.playClick();
      setBoard(nextBoard);
      const ev = evaluateGravityBoard(nextBoard, COLS, ROWS, WIN_TARGET);
      if (ev.winner) {
        void finishLocal(ev.winner, ev.line);
      } else {
        setTurn('R');
      }
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHuman, mm.matchPhase, turn, outcomeText]);

  const resetLocal = () => {
    soundFx.playClick();
    setBoard(Array(COLS * ROWS).fill(null));
    setTurn('R');
    setWinLine(null);
    setOutcomeText(null);
    setHintCol(null);
    setRewardBanner(null);
    setAiThinking(false);
    setStartedAt(Date.now());
  };

  const handleMove = (col: number, popOut = false) => {
    if (mm.matchPhase === 'searching' || isFinished || aiThinking || activeTurn !== myTeam) return;
    if (isHuman) {
      if (popOut && !popOutEnabled) return;
      soundFx.playSelect();
      wsClient.dropConnectFive(col, popOut);
      return;
    }

    let nextBoard: GravityCell[] | null = null;
    if (popOut) {
      if (!popOutEnabled || !canPopOutCol(board, COLS, ROWS, col, 'R')) return;
      nextBoard = applyPopOutCol(board, COLS, ROWS, col);
    } else {
      const row = getGravityDropRow(board, COLS, ROWS, col);
      if (row < 0) return;
      nextBoard = [...board];
      nextBoard[row * COLS + col] = 'R';
    }
    if (!nextBoard) return;
    setHintCol(null);
    soundFx.playSelect();
    setBoard(nextBoard);
    const ev = evaluateGravityBoard(nextBoard, COLS, ROWS, WIN_TARGET);
    if (ev.winner) {
      void finishLocal(ev.winner, ev.line);
    } else {
      setTurn('Y');
    }
  };

  const history = recentMatches.filter((m) => m.gameId === 'connect_five');

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Connect Five & Pop-Out</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.connect_five?.wins ?? 0}</span>
          <span>Points: {player.stats.byGame.connect_five?.points ?? 0}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={(d) => {
          mm.setDifficulty(d);
          resetLocal();
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPopOutEnabled((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                popOutEnabled
                  ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-[#38BDF8]'
                  : 'border-white/[0.1] bg-[#060811] text-slate-400'
              }`}
            >
              Pop-Out: {popOutEnabled ? 'ON' : 'OFF'}
            </button>
            {!isHuman && (
              <button
                type="button"
                onClick={resetLocal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restart
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                {isFinished
                  ? mm.liveMatch?.winnerSummary || outcomeText || 'Match Complete'
                  : aiThinking
                  ? 'Connect 5 AI is scanning 9×7 lines...'
                  : activeTurn === myTeam
                  ? `Your Turn (${myTeam === 'R' ? 'Neon Blue' : 'Solar Orange'}) — Connect 5!`
                  : `Opponent Turn (${activeTurn === 'R' ? 'Neon Blue' : 'Solar Orange'})`}
              </span>
              {!isHuman && !isFinished && (
                <button
                  type="button"
                  onClick={() => {
                    const m = chooseConnectFiveAiMove(board, COLS, ROWS, WIN_TARGET, 'hard', 'R', popOutEnabled);
                    if (m) setHintCol(m.col);
                  }}
                  className="inline-flex items-center gap-1 text-[#F97316] hover:underline cursor-pointer"
                >
                  <Lightbulb className="h-3.5 w-3.5" /> Hint {hintCol !== null ? `(Col ${hintCol + 1})` : ''}
                </button>
              )}
            </div>

            <div className="mx-auto max-w-xl rounded-2xl border border-[#8B5CF6]/30 bg-[#060811] p-3">
              {/* Drop buttons */}
              <div className="mb-2 grid grid-cols-9 gap-1.5">
                {Array.from({ length: COLS }, (_, col) => (
                  <button
                    key={col}
                    type="button"
                    disabled={isFinished || aiThinking || activeTurn !== myTeam || activeBoard[col] !== null}
                    onClick={() => handleMove(col, false)}
                    className={`flex items-center justify-center gap-0.5 rounded-lg py-1 font-mono text-[11px] font-bold transition cursor-pointer ${
                      hintCol === col
                        ? 'bg-[#F97316] text-white'
                        : 'bg-[#121933] text-slate-300 hover:bg-[#8B5CF6] hover:text-white disabled:opacity-35'
                    }`}
                  >
                    <ArrowDown className="h-3 w-3" /> {col + 1}
                  </button>
                ))}
              </div>

              {/* 9x7 Cells */}
              <div className="grid grid-cols-9 gap-1.5">
                {activeBoard.map((val, idx) => {
                  const col = idx % COLS;
                  const isWin = activeWinLine?.includes(idx) ?? false;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isFinished || aiThinking || activeTurn !== myTeam || activeBoard[col] !== null}
                      onClick={() => handleMove(col, false)}
                      aria-label={`Row ${Math.floor(idx / COLS) + 1} Column ${col + 1}`}
                      className={`aspect-square rounded-full border flex items-center justify-center transition cursor-pointer ${
                        isWin
                          ? 'border-white ring-2 ring-emerald-400'
                          : hintCol === col && val === null
                          ? 'border-[#F97316]/60 bg-[#0D142B]'
                          : 'border-white/[0.08] bg-[#0B1021] hover:border-[#8B5CF6]/60'
                      }`}
                    >
                      {val && (
                        <motion.span
                          initial={{ scale: 0.45, opacity: 0.5 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={`h-[80%] w-[80%] rounded-full ${
                            val === 'R'
                              ? 'bg-gradient-to-br from-[#38BDF8] to-[#2563EB] shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                              : 'bg-gradient-to-br from-[#FB923C] to-[#EA580C] shadow-[0_0_12px_rgba(249,115,22,0.5)]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Pop-Out Bottom Row Controls */}
              {popOutEnabled && (
                <div className="mt-2 grid grid-cols-9 gap-1.5">
                  {Array.from({ length: COLS }, (_, col) => {
                    const canPop = !isFinished && !aiThinking && activeTurn === myTeam && canPopOutCol(activeBoard, COLS, ROWS, col, myTeam);
                    return (
                      <button
                        key={col}
                        type="button"
                        disabled={!canPop}
                        onClick={() => handleMove(col, true)}
                        title="Pop out your bottom disc from this column"
                        className="flex items-center justify-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0D1326] py-1 font-mono text-[10px] font-semibold text-slate-300 hover:border-[#38BDF8] hover:text-white disabled:opacity-25 cursor-pointer disabled:cursor-default"
                      >
                        <ArrowUp className="h-3 w-3" /> Pop
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {isFinished && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {mm.liveMatch?.winnerSummary || outcomeText}
                  </p>
                  {rewardBanner && (
                    <p className="mt-0.5 font-mono text-xs text-emerald-400">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={isHuman ? mm.rematchHuman : resetLocal}
                  className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Play Rematch
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
            <h3 className="font-display text-lg font-bold text-white">Rules & Controls</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-2 pt-2 text-center font-mono">
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Wins</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-400 tabular-nums">{sessionScore.wins}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Draws</p>
                <p className="mt-0.5 text-lg font-bold text-[#F97316] tabular-nums">{sessionScore.draws}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Losses</p>
                <p className="mt-0.5 text-lg font-bold text-rose-400 tabular-nums">{sessionScore.losses}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Connect 5 Matches</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a 9×7 board to record points and XP.</p>
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
