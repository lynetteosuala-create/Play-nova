import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import {
  applyReversiMove,
  chooseReversiAiMove,
  createInitialReversiState,
  getReversiValidMoves,
  type ReversiGameState,
} from '../../game/reversiEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { soundFx } from '../../utils/sound.ts';
import { wsClient } from '../../utils/wsClient.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface ReversiGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function ReversiGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: ReversiGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'reversi')!;
  const mm = useUniversalMatchmaking('reversi', { player });

  const [localState, setLocalState] = useState<ReversiGameState>(() => createInitialReversiState());
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [localRecorded, setLocalRecorded] = useState(false);

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.reversiState);
  const myColor: 'B' | 'W' = isHuman ? (mm.mySeatIndex === 0 ? 'B' : 'W') : 'B';

  const activeState: ReversiGameState = useMemo(() => {
    if (isHuman && mm.liveMatch?.reversiState) {
      const s = mm.liveMatch.reversiState;
      return {
        board: s.board,
        turn: s.turn,
        winnerTeam: s.winnerTeam,
        lastMove: s.lastMove,
        blackCount: s.blackCount,
        whiteCount: s.whiteCount,
        statusText: s.statusText,
      };
    }
    return localState;
  }, [isHuman, localState, mm.liveMatch]);

  const validMoves = useMemo(() => {
    if (activeState.winnerTeam || activeState.turn !== myColor) return new Set<number>();
    return new Set(getReversiValidMoves(activeState.board, myColor));
  }, [activeState.board, activeState.turn, activeState.winnerTeam, myColor]);

  useEffect(() => {
    if (isHuman || !localState.winnerTeam || localRecorded) return;
    setLocalRecorded(true);
    const outcome: 'win' | 'loss' | 'draw' =
      localState.winnerTeam === 'draw' ? 'draw' : localState.winnerTeam === 'B' ? 'win' : 'loss';
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
        ? (mm.difficulty === 'hard' ? 165 : mm.difficulty === 'medium' ? 125 : 90) + Math.max(0, localState.blackCount - localState.whiteCount)
        : outcome === 'draw'
        ? 45
        : 12;

    void completeSinglePlayerGame(player, {
      gameId: 'reversi',
      mode: 'vs_ai',
      difficulty: mm.difficulty,
      outcome,
      opponentLabel: `Reversi AI (${mm.difficulty})`,
      scoreDelta,
      durationSec: Math.max(5, Math.round((Date.now() - startedAt) / 1000)),
      summary: `${localState.blackCount}–${localState.whiteCount} · ${localState.statusText}`,
    }).then((res) => {
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    });
  }, [isHuman, localRecorded, localState, mm.difficulty, onProgressUpdated, player, startedAt]);

  useEffect(() => {
    if (isHuman || mm.matchPhase !== 'ai' || localState.winnerTeam || localState.turn !== 'W') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const idx = chooseReversiAiMove(localState, mm.difficulty);
      setAiThinking(false);
      if (idx < 0) return;
      soundFx.playClick();
      setLocalState((prev) => applyReversiMove(prev, idx) || prev);
    }, 380);
    return () => window.clearTimeout(timer);
  }, [isHuman, localState, mm.difficulty, mm.matchPhase]);

  const resetLocal = () => {
    soundFx.playClick();
    setLocalState(createInitialReversiState());
    setAiThinking(false);
    setRewardBanner(null);
    setLocalRecorded(false);
    setStartedAt(Date.now());
  };

  const handleCellClick = (idx: number) => {
    if (mm.matchPhase === 'searching' || activeState.winnerTeam || aiThinking) return;
    if (activeState.turn !== myColor || !validMoves.has(idx)) return;
    soundFx.playSelect();
    if (isHuman) {
      wsClient.emit('reversi:move', { index: idx });
    } else {
      const next = applyReversiMove(localState, idx);
      if (next) setLocalState(next);
    }
  };

  const history = recentMatches.filter((m) => m.gameId === 'reversi');

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Reversi / Othello</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.reversi?.wins ?? 0}</span>
          <span>Points: {player.stats.byGame.reversi?.points ?? 0}</span>
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
              <RotateCcw className="h-3.5 w-3.5" /> New Board
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                {aiThinking ? 'Reversi AI calculating corner priority...' : activeState.statusText}
              </span>
              <div className="flex items-center gap-4 font-mono tabular-nums">
                <span className="text-[#38BDF8]">
                  Obsidian (P1): {activeState.blackCount}
                </span>
                <span className="text-[#F97316]">
                  Solar (P2): {activeState.whiteCount}
                </span>
              </div>
            </div>

            <div className="mx-auto grid max-w-[460px] grid-cols-8 gap-1 rounded-2xl border border-emerald-500/30 bg-[#061A18] p-2.5">
              {activeState.board.map((cell, idx) => {
                const canPlay = validMoves.has(idx);
                const isLast = activeState.lastMove === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={!canPlay || aiThinking || Boolean(activeState.winnerTeam)}
                    onClick={() => handleCellClick(idx)}
                    aria-label={`Square ${idx + 1}`}
                    className={`aspect-square rounded-lg border flex items-center justify-center transition ${
                      isLast
                        ? 'border-[#F97316]/80 bg-[#0B2D28]'
                        : canPlay
                        ? 'border-emerald-400/50 bg-[#0B2D28] hover:bg-[#103D36] cursor-pointer'
                        : 'border-emerald-900/60 bg-[#07211E] cursor-default'
                    }`}
                  >
                    {cell ? (
                      <motion.span
                        key={cell}
                        initial={{ scale: 0.65, rotateY: 90 }}
                        animate={{ scale: 1, rotateY: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`h-[76%] w-[76%] rounded-full border-2 shadow-md ${
                          cell === 'B'
                            ? 'border-[#38BDF8]/70 bg-gradient-to-br from-[#1E293B] to-[#020617]'
                            : 'border-amber-200 bg-gradient-to-br from-[#FEF3C7] to-[#F59E0B]'
                        }`}
                      />
                    ) : canPlay ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/75" />
                    ) : null}
                  </button>
                );
              })}
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
            <h3 className="font-display text-lg font-bold text-white">Recent Reversi Matches</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Flip discs and claim the corners to set your high score.</p>
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
