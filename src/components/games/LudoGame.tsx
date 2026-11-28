import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Dices, RotateCcw, Shield, Star, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import {
  applyLudoTokenMove,
  chooseLudoAiToken,
  createInitialLudoState,
  getLudoStartOffsets,
  getMovableLudoTokenIndexes,
  LUDO_SAFE_GLOBAL,
  ludoProgressToGlobalOuter,
  rollLudoDice,
  type LudoGameState,
} from '../../game/ludoEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { soundFx } from '../../utils/sound.ts';
import { wsClient } from '../../utils/wsClient.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

// 52 outer loop coordinates [row, col] on 15x15 Ludo board
const OUTER_COORDS: Array<[number, number]> = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

const HOME_STRETC_BY_OFFSET: Record<number, Array<[number, number]>> = {
  0: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  13: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  26: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  39: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

const YARD_COORDS_BY_OFFSET: Record<number, Array<[number, number]>> = {
  0: [[2, 2], [2, 3], [3, 2], [3, 3]],
  13: [[2, 11], [2, 12], [3, 11], [3, 12]],
  26: [[11, 11], [11, 12], [12, 11], [12, 12]],
  39: [[11, 2], [11, 3], [12, 2], [12, 3]],
};

const PLAYER_THEME_BY_OFFSET: Record<number, { name: string; bg: string; border: string; text: string }> = {
  0: { name: 'Red', bg: 'bg-rose-500', border: 'border-rose-200', text: 'text-rose-400' },
  13: { name: 'Emerald', bg: 'bg-emerald-500', border: 'border-emerald-200', text: 'text-emerald-400' },
  26: { name: 'Amber', bg: 'bg-amber-400', border: 'border-amber-100', text: 'text-amber-300' },
  39: { name: 'Cyan', bg: 'bg-sky-400', border: 'border-sky-100', text: 'text-sky-400' },
};

interface LudoGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function LudoGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: LudoGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'ludo')!;
  const mm = useUniversalMatchmaking('ludo', { player });

  const [playersCount, setPlayersCount] = useState<2 | 4>(2);
  const [localState, setLocalState] = useState<LudoGameState>(() => createInitialLudoState(2));
  const [startedAt, setStartedAt] = useState(Date.now());
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [localRecorded, setLocalRecorded] = useState(false);
  const [sessionScore, setSessionScore] = useState({ wins: 0, losses: 0 });

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.ludoState);
  const activeState: LudoGameState = isHuman ? mm.liveMatch!.ludoState! : localState;
  const mySeat = isHuman ? mm.mySeatIndex : 0;
  const offsets = getLudoStartOffsets(activeState.playersCount);

  const movableTokens = useMemo(() => {
    if (activeState.phase !== 'move' || activeState.diceValue === null || activeState.turnSeatIndex !== mySeat) {
      return new Set<number>();
    }
    return new Set(getMovableLudoTokenIndexes(activeState, mySeat, activeState.diceValue));
  }, [activeState, mySeat]);

  // Record AI completion
  useEffect(() => {
    if (isHuman || localState.phase !== 'finished' || localState.winnerSeatIndex === null || localRecorded) return;
    setLocalRecorded(true);
    const outcome = localState.winnerSeatIndex === 0 ? 'win' : 'loss';
    if (outcome === 'win') {
      soundFx.playWin();
      setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
    } else {
      soundFx.playLoss();
      setSessionScore((s) => ({ ...s, losses: s.losses + 1 }));
    }

    const scoreDelta =
      outcome === 'win'
        ? (mm.difficulty === 'hard' ? 165 : mm.difficulty === 'medium' ? 130 : 95) + (playersCount === 4 ? 35 : 0)
        : 15;

    void completeSinglePlayerGame(player, {
      gameId: 'ludo',
      mode: 'vs_ai',
      difficulty: mm.difficulty,
      outcome,
      opponentLabel: `Ludo ${playersCount}P AI (${mm.difficulty})`,
      scoreDelta,
      durationSec: Math.max(8, Math.round((Date.now() - startedAt) / 1000)),
      summary: outcome === 'win' ? `Crowned all 4 Ludo tokens (${playersCount}P)` : `AI seat #${localState.winnerSeatIndex + 1} won Ludo`,
    }).then((res) => {
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    });
  }, [isHuman, localRecorded, localState.phase, localState.winnerSeatIndex, mm.difficulty, onProgressUpdated, player, playersCount, startedAt]);

  // AI turn automation in solo vs AI
  useEffect(() => {
    if (isHuman || mm.matchPhase !== 'ai' || localState.phase === 'finished') return;
    if (localState.turnSeatIndex === 0) return;

    const timer = window.setTimeout(() => {
      if (localState.phase === 'roll') {
        soundFx.playClick();
        const { nextState } = rollLudoDice(localState);
        setLocalState(nextState);
      } else if (localState.phase === 'move') {
        const tokenIdx = chooseLudoAiToken(localState, mm.difficulty);
        if (tokenIdx >= 0) {
          soundFx.playSelect();
          setLocalState((prev) => applyLudoTokenMove(prev, tokenIdx) || prev);
        }
      }
    }, 520);

    return () => window.clearTimeout(timer);
  }, [isHuman, localState, mm.difficulty, mm.matchPhase]);

  const resetLocal = (count = playersCount) => {
    soundFx.playClick();
    setPlayersCount(count);
    setLocalState(createInitialLudoState(count));
    setRewardBanner(null);
    setLocalRecorded(false);
    setStartedAt(Date.now());
  };

  const handleRollDice = () => {
    if (mm.matchPhase === 'searching' || activeState.phase !== 'roll' || activeState.turnSeatIndex !== mySeat) return;
    soundFx.playSelect();
    if (isHuman) {
      wsClient.emit('ludo:roll');
    } else {
      const { nextState } = rollLudoDice(localState);
      setLocalState(nextState);
    }
  };

  const handleMoveToken = (seatIdx: number, tokenIdx: number) => {
    if (seatIdx !== mySeat || !movableTokens.has(tokenIdx)) return;
    soundFx.playSelect();
    if (isHuman) {
      wsClient.emit('ludo:move', { tokenIndex: tokenIdx });
    } else {
      const next = applyLudoTokenMove(localState, tokenIdx);
      if (next) setLocalState(next);
    }
  };

  // Map every token to its [row, col] coordinate on 15x15 grid
  const tokensByCell = useMemo(() => {
    const map = new Map<string, Array<{ seatIdx: number; tokenIdx: number; offset: number }>>();
    activeState.tokens.forEach((seatTokens, seatIdx) => {
      const offset = offsets[seatIdx] ?? 0;
      seatTokens.forEach((progress, tokenIdx) => {
        let coord: [number, number] | null = null;
        if (progress === -1) {
          coord = YARD_COORDS_BY_OFFSET[offset]?.[tokenIdx] || [2, 2];
        } else if (progress >= 0 && progress <= 50) {
          const g = ludoProgressToGlobalOuter(seatIdx, progress, activeState.playersCount);
          if (g !== null) coord = OUTER_COORDS[g];
        } else if (progress >= 51 && progress <= 55) {
          coord = HOME_STRETC_BY_OFFSET[offset]?.[progress - 51] || [7, 7];
        } else if (progress === 56) {
          coord = [7, 7];
        }
        if (coord) {
          const key = `${coord[0]},${coord[1]}`;
          const list = map.get(key) || [];
          list.push({ seatIdx, tokenIdx, offset });
          map.set(key, list);
        }
      });
    });
    return map;
  }, [activeState.playersCount, activeState.tokens, offsets]);

  // Coordinate lookup for coloring outer loop & home lanes
  const outerIdxByCoord = useMemo(() => {
    const m = new Map<string, number>();
    OUTER_COORDS.forEach(([r, c], i) => m.set(`${r},${c}`, i));
    return m;
  }, []);

  const history = recentMatches.filter((m) => m.gameId === 'ludo');

  const getCellBaseStyle = (r: number, c: number) => {
    // Corner Yards (6x6 each)
    if (r < 6 && c < 6) return 'bg-rose-950/60 border-rose-500/25';
    if (r < 6 && c > 8) return 'bg-emerald-950/60 border-emerald-500/25';
    if (r > 8 && c > 8) return 'bg-amber-950/50 border-amber-500/25';
    if (r > 8 && c < 6) return 'bg-sky-950/60 border-sky-500/25';
    // Center 3x3 crown zone
    if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'bg-[#1D1536] border-[#8B5CF6]/40';
    // Colored home lanes
    if (r === 7 && c >= 1 && c <= 5) return 'bg-rose-500/25 border-rose-400/35';
    if (c === 7 && r >= 1 && r <= 5) return 'bg-emerald-500/25 border-emerald-400/35';
    if (r === 7 && c >= 9 && c <= 13) return 'bg-amber-400/25 border-amber-300/35';
    if (c === 7 && r >= 9 && r <= 13) return 'bg-sky-500/25 border-sky-400/35';
    // Colored launch tiles
    if (r === 6 && c === 1) return 'bg-rose-500/45 border-rose-300/60';
    if (r === 1 && c === 8) return 'bg-emerald-500/45 border-emerald-300/60';
    if (r === 8 && c === 13) return 'bg-amber-400/45 border-amber-200/60';
    if (r === 13 && c === 6) return 'bg-sky-500/45 border-sky-300/60';
    return 'bg-[#0B1022] border-white/[0.08]';
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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Ludo Royal Arena</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.ludo?.wins ?? 0}</span>
          <span>Points: {player.stats.byGame.ludo?.points ?? 0}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={(d) => {
          mm.setDifficulty(d);
          resetLocal(playersCount);
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
              {([2, 4] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => resetLocal(cnt)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                    playersCount === cnt
                      ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                      : 'border-white/[0.08] bg-[#060811] text-slate-400'
                  }`}
                >
                  {cnt}P Match
                </button>
              ))}
              <button
                type="button"
                onClick={() => resetLocal(playersCount)}
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
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-4">
            {/* Turn Banner & Dice Roller */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#060811] px-4 py-3">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-white">{activeState.statusText}</p>
                <p className="font-mono text-[11px] text-slate-400">
                  {activeState.playersCount}-Player Board · Safe Stars protect tokens from capture
                </p>
              </div>
              <div className="flex items-center gap-3">
                {activeState.diceValue !== null && (
                  <motion.div
                    key={`${activeState.turnSeatIndex}-${activeState.diceValue}-${activeState.phase}`}
                    initial={{ scale: 0.7, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#F97316]/60 bg-[#181B2E] font-mono text-xl font-extrabold text-[#F97316]"
                  >
                    {activeState.diceValue}
                  </motion.div>
                )}
                <button
                  type="button"
                  disabled={
                    mm.matchPhase === 'searching' ||
                    activeState.phase !== 'roll' ||
                    activeState.turnSeatIndex !== mySeat
                  }
                  onClick={handleRollDice}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#38BDF8] px-4 py-2.5 text-xs font-bold text-white shadow transition hover:brightness-110 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <Dices className="h-4 w-4" />
                  Roll Dice
                </button>
              </div>
            </div>

            {/* 15x15 Interactive Ludo Board */}
            <div
              style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
              className="mx-auto grid aspect-square w-full max-w-[540px] gap-[1px] rounded-xl border border-white/[0.12] bg-[#060811] p-1.5"
            >
              {Array.from({ length: 225 }, (_, cellIdx) => {
                const r = Math.floor(cellIdx / 15);
                const c = cellIdx % 15;
                const key = `${r},${c}`;
                const gIdx = outerIdxByCoord.get(key);
                const isSafe = gIdx !== undefined && LUDO_SAFE_GLOBAL.has(gIdx);
                const tokensHere = tokensByCell.get(key) || [];
                const isCenterGoal = r === 7 && c === 7;

                return (
                  <div
                    key={key}
                    className={`relative flex items-center justify-center rounded-[3px] border ${getCellBaseStyle(r, c)}`}
                  >
                    {isSafe && tokensHere.length === 0 && (
                      <Star className="h-2.5 w-2.5 text-amber-300/60" />
                    )}
                    {isCenterGoal && tokensHere.length === 0 && (
                      <Trophy className="h-3.5 w-3.5 text-[#F97316]" />
                    )}
                    {tokensHere.length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-0.5">
                        {tokensHere.map((tok) => {
                          const canMove = tok.seatIdx === mySeat && movableTokens.has(tok.tokenIdx);
                          const theme = PLAYER_THEME_BY_OFFSET[tok.offset] || PLAYER_THEME_BY_OFFSET[0];
                          return (
                            <button
                              key={`${tok.seatIdx}-${tok.tokenIdx}`}
                              type="button"
                              disabled={!canMove}
                              onClick={() => handleMoveToken(tok.seatIdx, tok.tokenIdx)}
                              title={`${theme.name} Token #${tok.tokenIdx + 1}`}
                              className={`h-4 w-4 sm:h-5 sm:w-5 rounded-full border-2 shadow transition flex items-center justify-center text-[8px] font-mono font-bold text-[#060811] ${
                                theme.bg
                              } ${theme.border} ${
                                canMove
                                  ? 'ring-2 ring-white scale-110 cursor-pointer animate-bounce'
                                  : 'cursor-default'
                              }`}
                            >
                              {tok.tokenIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {activeState.phase === 'finished' && (
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
                  onClick={isHuman ? mm.rematchHuman : () => resetLocal(playersCount)}
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
            <h3 className="font-display text-lg font-bold text-white">Squad Progress</h3>
            <div className="space-y-2">
              {activeState.tokens.map((seatTokens, sIdx) => {
                const offset = offsets[sIdx] ?? 0;
                const theme = PLAYER_THEME_BY_OFFSET[offset] || PLAYER_THEME_BY_OFFSET[0];
                const homeCount = seatTokens.filter((p) => p === 56).length;
                const activeSeat = activeState.turnSeatIndex === sIdx;
                return (
                  <div
                    key={sIdx}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                      activeSeat ? 'border-[#38BDF8] bg-[#131C3A]' : 'border-white/[0.06] bg-[#060811]'
                    }`}
                  >
                    <span className={`font-semibold ${theme.text}`}>
                      {isHuman && mm.liveMatch?.seats[sIdx]
                        ? mm.liveMatch.seats[sIdx].username
                        : sIdx === 0
                        ? 'You (Red)'
                        : `AI Bot ${sIdx} (${theme.name})`}
                    </span>
                    <span className="font-mono text-slate-300 tabular-nums">
                      <Shield className="mr-1 inline h-3 w-3 text-[#F97316]" />
                      {homeCount}/4 Home
                    </span>
                  </div>
                );
              })}
            </div>

            <h3 className="pt-2 font-display text-base font-bold text-white">Rules & Controls</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
            <p className="font-mono text-xs text-slate-400">
              Session Record: <span className="text-emerald-400">{sessionScore.wins}W</span> ·{' '}
              <span className="text-rose-400">{sessionScore.losses}L</span>
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Ludo Races</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Crown all 4 tokens to record your victory.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto pr-1">
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
