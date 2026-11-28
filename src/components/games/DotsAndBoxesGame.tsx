import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RotateCcw, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import {
  applyDotsMove,
  chooseDotsAiMove,
  createInitialDotsState,
  type DotsAndBoxesState,
  type DotsEdgeMove,
} from '../../game/dotsAndBoxesEngine.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { soundFx } from '../../utils/sound.ts';
import { wsClient } from '../../utils/wsClient.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface DotsAndBoxesGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function DotsAndBoxesGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: DotsAndBoxesGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'dots_and_boxes')!;
  const mm = useUniversalMatchmaking('dots_and_boxes', { player });

  const [gridDim, setGridDim] = useState<4 | 5>(4);
  const [localState, setLocalState] = useState<DotsAndBoxesState>(() => createInitialDotsState(4, 4));
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [sessionScore, setSessionScore] = useState({ wins: 0, draws: 0, losses: 0 });
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [localRecorded, setLocalRecorded] = useState(false);

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.dotsState);
  const myTeam: 'A' | 'B' = isHuman ? (mm.mySeatIndex === 0 ? 'A' : 'B') : 'A';

  const activeState: DotsAndBoxesState = useMemo(() => {
    if (isHuman && mm.liveMatch?.dotsState) {
      const s = mm.liveMatch.dotsState;
      return {
        rows: s.rows,
        cols: s.cols,
        hEdges: s.hEdges,
        vEdges: s.vEdges,
        boxes: s.boxes,
        turn: s.turn,
        scoreA: s.scoreA,
        scoreB: s.scoreB,
        winnerTeam: s.winnerTeam,
        statusText: s.statusText,
      };
    }
    return localState;
  }, [isHuman, localState, mm.liveMatch]);

  useEffect(() => {
    if (isHuman || !localState.winnerTeam || localRecorded) return;
    setLocalRecorded(true);
    const outcome: 'win' | 'loss' | 'draw' =
      localState.winnerTeam === 'draw' ? 'draw' : localState.winnerTeam === 'A' ? 'win' : 'loss';
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
        ? (mm.difficulty === 'hard' ? 155 : mm.difficulty === 'medium' ? 120 : 85) + localState.scoreA * 3
        : outcome === 'draw'
        ? 40
        : 12;

    void completeSinglePlayerGame(player, {
      gameId: 'dots_and_boxes',
      mode: 'vs_ai',
      difficulty: mm.difficulty,
      outcome,
      opponentLabel: `Dots AI (${mm.difficulty})`,
      scoreDelta,
      durationSec: Math.max(5, Math.round((Date.now() - startedAt) / 1000)),
      summary: `${localState.rows}×${localState.cols} · ${localState.scoreA}–${localState.scoreB}`,
    }).then((res) => {
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    });
  }, [isHuman, localRecorded, localState, mm.difficulty, onProgressUpdated, player, startedAt]);

  useEffect(() => {
    if (isHuman || mm.matchPhase !== 'ai' || localState.winnerTeam || localState.turn !== 'B') return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseDotsAiMove(localState, mm.difficulty);
      setAiThinking(false);
      if (!move) return;
      soundFx.playClick();
      setLocalState((prev) => applyDotsMove(prev, move) || prev);
    }, 340);
    return () => window.clearTimeout(timer);
  }, [isHuman, localState, mm.difficulty, mm.matchPhase]);

  const resetLocal = (dim = gridDim) => {
    soundFx.playClick();
    setGridDim(dim);
    setLocalState(createInitialDotsState(dim, dim));
    setAiThinking(false);
    setRewardBanner(null);
    setLocalRecorded(false);
    setStartedAt(Date.now());
  };

  const handleEdgeClick = (move: DotsEdgeMove) => {
    if (mm.matchPhase === 'searching' || activeState.winnerTeam || aiThinking) return;
    if (activeState.turn !== myTeam) return;
    const occupied = move.orientation === 'h' ? activeState.hEdges[move.index] : activeState.vEdges[move.index];
    if (occupied) return;

    soundFx.playSelect();
    if (isHuman) {
      wsClient.emit('dots:move', { orientation: move.orientation, index: move.index });
    } else {
      const next = applyDotsMove(localState, move);
      if (next) setLocalState(next);
    }
  };

  const history = recentMatches.filter((m) => m.gameId === 'dots_and_boxes');
  const { rows, cols } = activeState;

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Dots and Boxes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.dots_and_boxes?.wins ?? 0}</span>
          <span>Points: {player.stats.byGame.dots_and_boxes?.points ?? 0}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={(d) => {
          mm.setDifficulty(d);
          resetLocal(gridDim);
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
              {([4, 5] as const).map((dim) => (
                <button
                  key={dim}
                  type="button"
                  onClick={() => resetLocal(dim)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                    gridDim === dim
                      ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                      : 'border-white/[0.08] bg-[#060811] text-slate-400'
                  }`}
                >
                  {dim}×{dim}
                </button>
              ))}
              <button
                type="button"
                onClick={() => resetLocal(gridDim)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                {aiThinking ? 'AI is analyzing box chains...' : activeState.statusText}
              </span>
              <div className="flex items-center gap-4 font-mono tabular-nums">
                <span className="text-[#38BDF8]">Team A: {activeState.scoreA}</span>
                <span className="text-[#F97316]">Team B: {activeState.scoreB}</span>
              </div>
            </div>

            {/* Interactive Dot-Edge-Box Grid */}
            <div className="mx-auto flex w-full max-w-[440px] flex-col items-center rounded-2xl border border-white/[0.06] bg-[#060811] p-4 sm:p-6 select-none">
              {Array.from({ length: rows + 1 }, (_, r) => (
                <Fragment key={r}>
                  {/* Dot + Horizontal Edges row */}
                  <div className="flex w-full items-center">
                    {Array.from({ length: cols + 1 }, (_, c) => {
                      const hIdx = r * cols + c;
                      const hOwner = c < cols ? activeState.hEdges[hIdx] : null;
                      return (
                        <Fragment key={c}>
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-slate-200 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
                          {c < cols && (
                            <button
                              type="button"
                              aria-label={`Horizontal edge row ${r + 1} col ${c + 1}`}
                              disabled={Boolean(hOwner) || Boolean(activeState.winnerTeam) || activeState.turn !== myTeam || aiThinking}
                              onClick={() => handleEdgeClick({ orientation: 'h', index: hIdx })}
                              className="group relative flex h-6 flex-1 items-center justify-center px-1 cursor-pointer disabled:cursor-default"
                            >
                              <span
                                className={`h-2 w-full rounded-full transition ${
                                  hOwner === 'A'
                                    ? 'bg-[#38BDF8] shadow-[0_0_10px_rgba(56,189,248,0.6)]'
                                    : hOwner === 'B'
                                    ? 'bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.6)]'
                                    : 'bg-slate-800 group-hover:bg-[#8B5CF6]/70'
                                }`}
                              />
                            </button>
                          )}
                        </Fragment>
                      );
                    })}
                  </div>

                  {/* Vertical Edges + Boxes row */}
                  {r < rows && (
                    <div className="flex w-full items-stretch">
                      {Array.from({ length: cols + 1 }, (_, c) => {
                        const vIdx = r * (cols + 1) + c;
                        const vOwner = activeState.vEdges[vIdx];
                        const boxIdx = r * cols + c;
                        const boxOwner = c < cols ? activeState.boxes[boxIdx] : null;
                        return (
                          <Fragment key={c}>
                            <button
                              type="button"
                              aria-label={`Vertical edge row ${r + 1} col ${c + 1}`}
                              disabled={Boolean(vOwner) || Boolean(activeState.winnerTeam) || activeState.turn !== myTeam || aiThinking}
                              onClick={() => handleEdgeClick({ orientation: 'v', index: vIdx })}
                              className="group flex w-3.5 shrink-0 items-center justify-center py-1 cursor-pointer disabled:cursor-default"
                            >
                              <span
                                className={`h-12 sm:h-14 w-2 rounded-full transition ${
                                  vOwner === 'A'
                                    ? 'bg-[#38BDF8] shadow-[0_0_10px_rgba(56,189,248,0.6)]'
                                    : vOwner === 'B'
                                    ? 'bg-[#F97316] shadow-[0_0_10px_rgba(249,115,22,0.6)]'
                                    : 'bg-slate-800 group-hover:bg-[#8B5CF6]/70'
                                }`}
                              />
                            </button>
                            {c < cols && (
                              <div
                                className={`m-1 flex flex-1 items-center justify-center rounded-lg font-display text-sm font-extrabold transition ${
                                  boxOwner === 'A'
                                    ? 'bg-[#38BDF8]/25 text-[#38BDF8] border border-[#38BDF8]/40'
                                    : boxOwner === 'B'
                                    ? 'bg-[#F97316]/25 text-[#F97316] border border-[#F97316]/40'
                                    : 'bg-transparent'
                                }`}
                              >
                                {boxOwner || ''}
                              </div>
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                  )}
                </Fragment>
              ))}
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
                  onClick={isHuman ? mm.rematchHuman : () => resetLocal(gridDim)}
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
            <h3 className="font-display text-lg font-bold text-white">Recent Dots & Boxes</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a grid to save your victory record.</p>
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
