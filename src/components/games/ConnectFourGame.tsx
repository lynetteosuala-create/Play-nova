import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Cpu, Lightbulb, RotateCcw, Trophy, Users } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import {
  C4_COLS,
  C4_ROWS,
  chooseC4AiMove,
  createC4Board,
  evaluateC4Board,
  getC4DropRow,
  type C4Cell,
} from '../../game/connectFour.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { soundFx } from '../../utils/sound.ts';
import { wsClient } from '../../utils/wsClient.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

function dropC4Disc(board: C4Cell[], col: number, mark: 'R' | 'Y'): { board: C4Cell[]; row: number } | null {
  const row = getC4DropRow(board, col);
  if (row < 0) return null;
  const next = [...board];
  next[row * C4_COLS + col] = mark;
  return { board: next, row };
}

interface ConnectFourGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function ConnectFourGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: ConnectFourGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'connect_four')!;
  const mm = useUniversalMatchmaking('connect_four', { player });

  const [mode, setMode] = useState<'vs_ai' | 'local_2p'>('vs_ai');
  const [board, setBoard] = useState<C4Cell[]>(() => createC4Board());
  const [turn, setTurn] = useState<'R' | 'Y'>('R');
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [outcomeText, setOutcomeText] = useState<string | null>(null);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [hintCol, setHintCol] = useState<number | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.connectFourState);
  const c4Server = isHuman ? mm.liveMatch!.connectFourState! : null;
  const myTeam: 'R' | 'Y' = isHuman ? (mm.mySeatIndex === 0 ? 'R' : 'Y') : 'R';

  const activeBoard = c4Server ? c4Server.board : board;
  const activeTurn = c4Server ? c4Server.currentTeam : turn;
  const activeWinLine = c4Server ? c4Server.winLine : winLine;
  const isFinished = c4Server ? Boolean(c4Server.winnerTeam) : Boolean(outcomeText);

  const c4History = recentMatches.filter((m) => m.gameId === 'connect_four');

  const finishMatch = async (winner: 'R' | 'Y' | 'draw', finalLine: number[] | null) => {
    setWinLine(finalLine);
    const outcome: 'win' | 'loss' | 'draw' =
      winner === 'draw' ? 'draw' : mode === 'local_2p' ? 'win' : winner === 'R' ? 'win' : 'loss';

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

    setOutcomeText(
      winner === 'draw'
        ? 'Grid Locked — Draw!'
        : mode === 'local_2p'
        ? `${winner === 'R' ? 'Player 1 (Blue)' : 'Player 2 (Orange)'} Connects 4!`
        : winner === 'R'
        ? 'Victory — Four Connected!'
        : 'AI Bot Connected Four'
    );

    const scoreDelta =
      outcome === 'win'
        ? mode === 'local_2p'
          ? 50
          : mm.difficulty === 'hard'
          ? 160
          : mm.difficulty === 'medium'
          ? 120
          : 90
        : outcome === 'draw'
        ? 40
        : 12;

    try {
      const res = await completeSinglePlayerGame(player, {
        gameId: 'connect_four',
        mode,
        difficulty: mm.difficulty,
        outcome,
        opponentLabel: mode === 'local_2p' ? 'Local Player 2' : `Connect 4 AI (${mm.difficulty})`,
        scoreDelta,
        durationSec: Math.max(4, Math.round((Date.now() - startedAt) / 1000)),
        summary:
          winner === 'draw'
            ? '7×6 Connect Four draw'
            : winner === 'R'
            ? 'Connected 4 discs in neon arena'
            : 'Defeated by Connect Four AI',
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // keep UI smooth
    }
  };

  useEffect(() => {
    if (isHuman || mm.matchPhase !== 'ai' || mode !== 'vs_ai' || turn !== 'Y' || outcomeText) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const col = chooseC4AiMove(board, mm.difficulty, 'Y');
      setAiThinking(false);
      if (col < 0) return;
      const dropped = dropC4Disc(board, col, 'Y');
      if (!dropped) return;
      soundFx.playClick();
      setBoard(dropped.board);
      const ev = evaluateC4Board(dropped.board);
      if (ev.winner) {
        void finishMatch(ev.winner, ev.line);
      } else {
        setTurn('R');
      }
    }, 320);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHuman, mm.matchPhase, turn, mode, outcomeText]);

  const handleDrop = (col: number) => {
    if (mm.matchPhase === 'searching' || isFinished || aiThinking) return;
    if (isHuman) {
      if (activeTurn !== myTeam || activeBoard[col] !== null) return;
      soundFx.playSelect();
      wsClient.dropConnectFour(col);
      return;
    }

    if (mode === 'vs_ai' && turn !== 'R') return;
    const dropped = dropC4Disc(board, col, turn);
    if (!dropped) return;

    setHintCol(null);
    soundFx.playSelect();
    setBoard(dropped.board);
    const ev = evaluateC4Board(dropped.board);
    if (ev.winner) {
      void finishMatch(ev.winner, ev.line);
    } else {
      setTurn(turn === 'R' ? 'Y' : 'R');
    }
  };

  const resetBoard = () => {
    soundFx.playClick();
    setBoard(createC4Board());
    setTurn('R');
    setWinLine(null);
    setOutcomeText(null);
    setRewardBanner(null);
    setHintCol(null);
    setAiThinking(false);
    setStartedAt(Date.now());
  };

  const handleHint = () => {
    if (isFinished || aiThinking || isHuman) return;
    const suggested = chooseC4AiMove(board, 'hard', turn);
    if (suggested >= 0) {
      setHintCol(suggested);
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
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Games
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Connect Four</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.connect_four.wins}</span>
          <span>Points: {player.stats.byGame.connect_four.points}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={(d) => {
          mm.setDifficulty(d);
          resetBoard();
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMode('vs_ai');
                  resetBoard();
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  mode === 'vs_ai' ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white' : 'border-white/[0.08] bg-[#060811] text-slate-400'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" /> AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('local_2p');
                  resetBoard();
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  mode === 'local_2p' ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white' : 'border-white/[0.08] bg-[#060811] text-slate-400'
                }`}
              >
                <Users className="h-3.5 w-3.5" /> 2P
              </button>
              <button
                type="button"
                onClick={resetBoard}
                className="inline-flex items-center gap-1 rounded-xl border border-white/[0.1] bg-[#060811] px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-300">
                {isFinished
                  ? mm.liveMatch?.winnerSummary || outcomeText
                  : aiThinking
                  ? 'AI Bot is calculating depth search...'
                  : activeTurn === myTeam
                  ? mode === 'local_2p'
                    ? 'Player 1 Turn (Neon Blue)'
                    : 'Your Turn (Neon Blue)'
                  : mode === 'local_2p'
                  ? 'Player 2 Turn (Solar Orange)'
                  : isHuman
                  ? `${mm.opponentSeat?.username || 'Opponent'} Turn`
                  : 'AI Bot Turn (Solar Orange)'}
              </span>
              {!isHuman && !isFinished && (
                <button
                  type="button"
                  onClick={handleHint}
                  disabled={aiThinking}
                  className="inline-flex items-center gap-1 text-[#FDBA74] hover:underline cursor-pointer"
                >
                  <Lightbulb className="h-3.5 w-3.5" /> {hintCol !== null ? `Drop Col ${hintCol + 1}` : 'Hint'}
                </button>
              )}
            </div>

            <div className="mx-auto max-w-md rounded-2xl border border-[#8B5CF6]/30 bg-[#060811] p-3">
              <div className="mb-2 grid grid-cols-7 gap-2">
                {Array.from({ length: C4_COLS }, (_, col) => (
                  <button
                    key={col}
                    type="button"
                    disabled={isFinished || aiThinking || activeBoard[col] !== null || (isHuman && activeTurn !== myTeam)}
                    onClick={() => handleDrop(col)}
                    className={`rounded-lg py-1 font-mono text-[11px] font-bold transition cursor-pointer ${
                      hintCol === col
                        ? 'bg-[#F97316] text-white'
                        : 'bg-[#121933] text-slate-300 hover:bg-[#8B5CF6] hover:text-white disabled:opacity-35'
                    }`}
                  >
                    ↓ {col + 1}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: C4_ROWS * C4_COLS }, (_, idx) => {
                  const val = activeBoard[idx];
                  const col = idx % C4_COLS;
                  const isWin = activeWinLine?.includes(idx) ?? false;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleDrop(col)}
                      disabled={isFinished || aiThinking || activeBoard[col] !== null || (isHuman && activeTurn !== myTeam)}
                      aria-label={`Row ${Math.floor(idx / C4_COLS) + 1} Column ${col + 1}`}
                      className={`aspect-square rounded-full border transition flex items-center justify-center cursor-pointer ${
                        isWin
                          ? 'border-white ring-2 ring-[#38BDF8]'
                          : hintCol === col && val === null
                          ? 'border-[#F97316]/60 bg-[#0D142B]'
                          : 'border-white/[0.08] bg-[#0B1021] hover:border-[#8B5CF6]/60'
                      }`}
                    >
                      {val && (
                        <motion.span
                          initial={{ scale: 0.4, opacity: 0.5 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={`h-[80%] w-[80%] rounded-full ${
                            val === 'R'
                              ? 'bg-gradient-to-br from-[#38BDF8] to-[#2563EB] shadow-[0_0_16px_rgba(56,189,248,0.5)]'
                              : 'bg-gradient-to-br from-[#FB923C] to-[#EA580C] shadow-[0_0_16px_rgba(249,115,22,0.5)]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {isFinished && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {mm.liveMatch?.winnerSummary || outcomeText}
                  </p>
                  {rewardBanner && (
                    <p className="font-mono text-xs text-slate-300 mt-0.5">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={isHuman ? mm.rematchHuman : resetBoard}
                  className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
            <h3 className="font-display text-lg font-bold text-white">Rules & Controls</h3>
            <ul className="space-y-2 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-3 pt-2 text-center font-mono">
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Wins</p>
                <p className="mt-0.5 text-lg font-bold text-emerald-400">{sessionScore.wins}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Draws</p>
                <p className="mt-0.5 text-lg font-bold text-[#F97316]">{sessionScore.draws}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#060811] p-2.5">
                <p className="text-[11px] text-slate-400">Losses</p>
                <p className="mt-0.5 text-lg font-bold text-rose-400">{sessionScore.losses}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Connect Four Matches</h3>
            {c4History.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a match to log your history here.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {c4History.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3.5 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#38BDF8] shrink-0">+{m.scoreDelta} pts</span>
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
