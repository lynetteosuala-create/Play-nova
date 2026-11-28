import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Crown, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import {
  applyCheckersMove,
  checkersPieceColor,
  chooseCheckersAiMove,
  createInitialCheckersState,
  getLegalCheckersMoves,
  type CheckersGameState,
  type CheckersPiece,
} from '../../game/checkersEngine.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { soundFx } from '../../utils/sound.ts';
import { wsClient } from '../../utils/wsClient.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface CheckersGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function CheckersGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: CheckersGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'checkers')!;
  const mm = useUniversalMatchmaking('checkers', { player });

  const [localState, setLocalState] = useState<CheckersGameState>(() => createInitialCheckersState());
  const [selectedSq, setSelectedSq] = useState<number | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [localRecorded, setLocalRecorded] = useState(false);

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.checkersState);
  const myColor: 'r' | 'b' = isHuman ? (mm.mySeatIndex === 0 ? 'r' : 'b') : 'r';

  const activeState: CheckersGameState = useMemo(() => {
    if (isHuman && mm.liveMatch?.checkersState) {
      const s = mm.liveMatch.checkersState;
      return {
        board: s.board,
        turn: s.turn,
        mustContinueFrom: s.mustContinueFrom,
        winnerTeam: s.winnerTeam,
        lastFrom: s.lastFrom,
        lastTo: s.lastTo,
        statusText: s.statusText,
      };
    }
    return localState;
  }, [isHuman, localState, mm.liveMatch]);

  const legalMoves = useMemo(() => {
    if (activeState.winnerTeam) return [];
    return getLegalCheckersMoves(activeState);
  }, [activeState]);

  const legalDestinations = useMemo(() => {
    const activeFrom = activeState.mustContinueFrom ?? selectedSq;
    if (activeFrom === null) return new Set<number>();
    return new Set(legalMoves.filter((m) => m.from === activeFrom).map((m) => m.to));
  }, [activeState.mustContinueFrom, legalMoves, selectedSq]);

  const selectableSources = useMemo(() => {
    if (activeState.mustContinueFrom !== null) return new Set([activeState.mustContinueFrom]);
    return new Set(legalMoves.map((m) => m.from));
  }, [activeState.mustContinueFrom, legalMoves]);

  // Reset selection when state changes
  useEffect(() => {
    if (activeState.mustContinueFrom !== null) {
      setSelectedSq(activeState.mustContinueFrom);
    } else {
      setSelectedSq(null);
    }
  }, [activeState.mustContinueFrom, activeState.turn]);

  // Record AI outcome
  useEffect(() => {
    if (isHuman || !localState.winnerTeam || localRecorded) return;
    setLocalRecorded(true);
    const outcome: 'win' | 'loss' | 'draw' =
      localState.winnerTeam === 'draw' ? 'draw' : localState.winnerTeam === 'r' ? 'win' : 'loss';
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
    const scoreDelta =
      outcome === 'win'
        ? mm.difficulty === 'hard'
          ? 170
          : mm.difficulty === 'medium'
          ? 125
          : 90
        : outcome === 'draw'
        ? 45
        : 12;

    void completeSinglePlayerGame(player, {
      gameId: 'checkers',
      mode: 'vs_ai',
      difficulty: mm.difficulty,
      outcome,
      opponentLabel: `Checkers AI (${mm.difficulty})`,
      scoreDelta,
      durationSec: Math.max(5, Math.round((Date.now() - startedAt) / 1000)),
      summary: localState.statusText,
    }).then((res) => {
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    });
  }, [isHuman, localRecorded, localState.statusText, localState.winnerTeam, mm.difficulty, onProgressUpdated, player, startedAt]);

  // Execute AI turn (handles multi-jumps automatically)
  useEffect(() => {
    if (isHuman || mm.matchPhase !== 'ai' || localState.winnerTeam || localState.turn !== 'b') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseCheckersAiMove(localState, mm.difficulty);
      setAiThinking(false);
      if (!move) return;
      soundFx.playClick();
      setLocalState((prev) => applyCheckersMove(prev, move));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [isHuman, localState, mm.difficulty, mm.matchPhase]);

  const resetLocal = () => {
    soundFx.playClick();
    setLocalState(createInitialCheckersState());
    setSelectedSq(null);
    setAiThinking(false);
    setRewardBanner(null);
    setLocalRecorded(false);
    setStartedAt(Date.now());
  };

  const handleSquareClick = (idx: number) => {
    if (mm.matchPhase === 'searching' || activeState.winnerTeam || aiThinking) return;
    if (activeState.turn !== myColor) return;

    const activeFrom = activeState.mustContinueFrom ?? selectedSq;
    if (activeFrom !== null && legalDestinations.has(idx)) {
      soundFx.playSelect();
      if (isHuman) {
        wsClient.emit('checkers:move', { from: activeFrom, to: idx });
      } else {
        const move = legalMoves.find((m) => m.from === activeFrom && m.to === idx);
        if (move) {
          setLocalState((prev) => applyCheckersMove(prev, move));
        }
      }
      return;
    }

    if (selectableSources.has(idx) && checkersPieceColor(activeState.board[idx]) === myColor) {
      soundFx.playClick();
      setSelectedSq(idx === selectedSq ? null : idx);
    }
  };

  const countPieces = (board: CheckersPiece[], color: 'r' | 'b') =>
    board.filter((p) => checkersPieceColor(p) === color).length;

  const redCount = countPieces(activeState.board, 'r');
  const blackCount = countPieces(activeState.board, 'b');
  const history = recentMatches.filter((m) => m.gameId === 'checkers');
  const displayRows = myColor === 'b' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = myColor === 'b' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Checkers Arena</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.checkers?.wins ?? 0}</span>
          <span>Points: {player.stats.byGame.checkers?.points ?? 0}</span>
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
          !isHuman ? (
            <button
              type="button"
              onClick={resetLocal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restart
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                {aiThinking ? 'Checkers AI is evaluating captures...' : activeState.statusText}
              </span>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-rose-400">Red: {redCount}</span>
                <span className="text-sky-400">Cyan: {blackCount}</span>
              </div>
            </div>

            <div className="mx-auto grid max-w-[460px] grid-cols-8 overflow-hidden rounded-xl border-2 border-[#8B5CF6]/40 bg-[#060811]">
              {displayRows.flatMap((r) =>
                displayCols.map((c) => {
                  const idx = r * 8 + c;
                  const dark = (r + c) % 2 === 1;
                  const piece = activeState.board[idx];
                  const isSelected = (activeState.mustContinueFrom ?? selectedSq) === idx;
                  const isDest = legalDestinations.has(idx);
                  const isLast = activeState.lastFrom === idx || activeState.lastTo === idx;
                  const pColor = checkersPieceColor(piece);
                  const isKing = piece === 'R' || piece === 'B';

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!dark || Boolean(activeState.winnerTeam)}
                      onClick={() => handleSquareClick(idx)}
                      aria-label={`Row ${r + 1} Col ${c + 1}`}
                      className={`relative aspect-square flex items-center justify-center transition ${
                        !dark
                          ? 'bg-[#171E36] cursor-default'
                          : isSelected
                          ? 'bg-[#3B1F4B] ring-2 ring-inset ring-[#F97316] cursor-pointer'
                          : isDest
                          ? 'bg-emerald-950/70 hover:bg-emerald-900/70 cursor-pointer'
                          : isLast
                          ? 'bg-[#1D2545] cursor-pointer'
                          : 'bg-[#090D1C] hover:bg-[#141A33] cursor-pointer'
                      }`}
                    >
                      {isDest && !piece && (
                        <span className="h-3.5 w-3.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.75)]" />
                      )}
                      {piece && (
                        <motion.span
                          initial={{ scale: 0.75 }}
                          animate={{ scale: 1 }}
                          className={`flex h-[74%] w-[74%] items-center justify-center rounded-full border-2 shadow-lg ${
                            pColor === 'r'
                              ? 'border-rose-300 bg-gradient-to-br from-rose-500 to-rose-700'
                              : 'border-sky-300 bg-gradient-to-br from-sky-400 to-blue-700'
                          } ${selectableSources.has(idx) && activeState.turn === myColor ? 'ring-2 ring-white/40' : ''}`}
                        >
                          {isKing && <Crown className="h-4 w-4 text-amber-200 drop-shadow" />}
                        </motion.span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {activeState.winnerTeam && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {mm.liveMatch?.winnerSummary || activeState.statusText}
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
            <h3 className="font-display text-lg font-bold text-white">Recent Checkers Matches</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Finish a game to log results and earn Virtual Coins.</p>
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
