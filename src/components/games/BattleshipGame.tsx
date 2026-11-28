import { useEffect, useMemo, useState } from 'react';
import { Anchor, ArrowLeft, Compass, Crosshair, RotateCcw, RotateCw, Shuffle, Trophy } from 'lucide-react';
import {
  BATTLESHIP_FLEET,
  chooseBattleshipAiShot,
  generateRandomBattleshipBoard,
  resolveShotAgainstGrid,
  validateBattleshipPlacement,
  type ShotCell,
} from '../../game/battleshipEngine.ts';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { soundFx } from '../../utils/sound.ts';
import { wsClient } from '../../utils/wsClient.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface BattleshipGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export function BattleshipGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: BattleshipGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'battleship')!;
  const mm = useUniversalMatchmaking('battleship', { player });

  // Fleet placement builder
  const [draftGrid, setDraftGrid] = useState<number[]>(() => generateRandomBattleshipBoard().grid);
  const [placedShipIds, setPlacedShipIds] = useState<number[]>([1, 2, 3, 4, 5]);
  const [activeShipId, setActiveShipId] = useState<number>(1);
  const [orientation, setOrientation] = useState<'H' | 'V'>('H');

  // Local AI battle state
  const [localPhase, setLocalPhase] = useState<'placing' | 'battle' | 'finished'>('placing');
  const [localTurn, setLocalTurn] = useState<'player' | 'ai'>('player');
  const [aiGrid, setAiGrid] = useState<number[]>(() => generateRandomBattleshipBoard().grid);
  const [playerShotsOnAi, setPlayerShotsOnAi] = useState<ShotCell[]>(() => Array(100).fill('unknown'));
  const [aiShotsOnPlayer, setAiShotsOnPlayer] = useState<ShotCell[]>(() => Array(100).fill('unknown'));
  const [sunkAiShips, setSunkAiShips] = useState<string[]>([]);
  const [sunkPlayerShips, setSunkPlayerShips] = useState<string[]>([]);
  const [localStatus, setLocalStatus] = useState('Position your 5 warships or use Randomize, then Lock Fleet!');
  const [winner, setWinner] = useState<'player' | 'ai' | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [sessionScore, setSessionScore] = useState({ wins: 0, losses: 0 });

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.battleshipState);
  const bsServer = isHuman ? mm.liveMatch!.battleshipState! : null;
  const oppSeatIdx = mm.mySeatIndex === 0 ? 1 : 0;

  const activePhase = bsServer ? bsServer.phase : localPhase;
  const myFleetGrid = bsServer?.ownShipBoards?.[mm.mySeatIndex] || draftGrid;
  const shotsReceived = bsServer ? bsServer.shotsOnSeat[mm.mySeatIndex] || Array(100).fill('unknown') : aiShotsOnPlayer;
  const shotsFired = bsServer ? bsServer.shotsOnSeat[oppSeatIdx] || Array(100).fill('unknown') : playerShotsOnAi;
  const myTurnToFire = bsServer
    ? bsServer.phase === 'battle' && bsServer.turnSeatIndex === mm.mySeatIndex
    : localPhase === 'battle' && localTurn === 'player';

  const statusText = bsServer ? bsServer.statusText : localStatus;

  const finishLocalGame = (who: 'player' | 'ai') => {
    setLocalPhase('finished');
    setWinner(who);
    const outcome = who === 'player' ? 'win' : 'loss';
    if (outcome === 'win') {
      soundFx.playWin();
      setSessionScore((s) => ({ ...s, wins: s.wins + 1 }));
    } else {
      soundFx.playLoss();
      setSessionScore((s) => ({ ...s, losses: s.losses + 1 }));
    }
    const scoreDelta =
      outcome === 'win'
        ? (mm.difficulty === 'hard' ? 185 : mm.difficulty === 'medium' ? 140 : 100) + Math.max(0, 5 - sunkPlayerShips.length) * 8
        : 15;
    void completeSinglePlayerGame(player, {
      gameId: 'battleship',
      mode: 'vs_ai',
      difficulty: mm.difficulty,
      outcome,
      opponentLabel: `Naval AI (${mm.difficulty})`,
      scoreDelta,
      durationSec: Math.max(8, Math.round((Date.now() - startedAt) / 1000)),
      summary: outcome === 'win' ? `Sank all 5 AI warships (${sunkPlayerShips.length} lost)` : 'Fleet destroyed by Naval AI',
    }).then((res) => {
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    });
  };

  // AI Firing turn
  useEffect(() => {
    if (isHuman || localPhase !== 'battle' || localTurn !== 'ai' || winner) return;
    const timer = window.setTimeout(() => {
      const targetIdx = chooseBattleshipAiShot(aiShotsOnPlayer, mm.difficulty);
      if (targetIdx < 0) return;
      const res = resolveShotAgainstGrid(draftGrid, aiShotsOnPlayer, targetIdx);
      setAiShotsOnPlayer(res.nextShots);
      if (res.sunkShipName) {
        setSunkPlayerShips((prev) => [...prev, res.sunkShipName!]);
      }
      if (res.result === 'hit' || res.result === 'sunk') {
        soundFx.playClick();
      }
      if (res.allSunk) {
        setLocalStatus('AI sank your final warship!');
        finishLocalGame('ai');
        return;
      }
      setLocalTurn('player');
      setLocalStatus(
        res.sunkShipName
          ? `Enemy AI sank your ${res.sunkShipName}! Your turn to fire.`
          : res.result === 'hit'
          ? 'Enemy AI hit your hull! Return fire.'
          : 'Enemy AI missed into open water. Fire on enemy radar!'
      );
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHuman, localPhase, localTurn, winner]);

  const randomizeFleet = () => {
    if (activePhase !== 'placing') return;
    soundFx.playSelect();
    setDraftGrid(generateRandomBattleshipBoard().grid);
    setPlacedShipIds([1, 2, 3, 4, 5]);
  };

  const clearFleet = () => {
    if (activePhase !== 'placing') return;
    soundFx.playClick();
    setDraftGrid(Array(100).fill(0));
    setPlacedShipIds([]);
    setActiveShipId(1);
  };

  const handlePlaceCell = (idx: number) => {
    if (activePhase !== 'placing') return;
    const spec = BATTLESHIP_FLEET.find((s) => s.id === activeShipId);
    if (!spec) return;
    const r = Math.floor(idx / 10);
    const c = idx % 10;
    const cells: number[] = [];
    for (let k = 0; k < spec.size; k++) {
      const nr = orientation === 'V' ? r + k : r;
      const nc = orientation === 'H' ? c + k : c;
      if (nr >= 10 || nc >= 10) return;
      const cellIdx = nr * 10 + nc;
      if (draftGrid[cellIdx] !== 0 && draftGrid[cellIdx] !== spec.id) return;
      cells.push(cellIdx);
    }

    soundFx.playClick();
    const next = draftGrid.map((v) => (v === spec.id ? 0 : v));
    for (const ci of cells) next[ci] = spec.id;
    setDraftGrid(next);
    const nextPlaced = Array.from(new Set([...placedShipIds, spec.id]));
    setPlacedShipIds(nextPlaced);
    const unplaced = BATTLESHIP_FLEET.find((s) => !nextPlaced.includes(s.id));
    if (unplaced) setActiveShipId(unplaced.id);
  };

  const lockFleetAndStart = () => {
    if (!validateBattleshipPlacement(draftGrid)) return;
    soundFx.playSelect();
    if (isHuman) {
      wsClient.emit('battleship:place', { grid: draftGrid });
    } else {
      setLocalPhase('battle');
      setLocalTurn('player');
      setLocalStatus('Fleet locked! Click any coordinate on the Enemy Radar to launch a salvo.');
    }
  };

  const handleFireShot = (idx: number) => {
    if (!myTurnToFire || shotsFired[idx] !== 'unknown') return;
    soundFx.playSelect();
    if (isHuman) {
      wsClient.emit('battleship:fire', { targetIndex: idx });
      return;
    }

    const res = resolveShotAgainstGrid(aiGrid, playerShotsOnAi, idx);
    setPlayerShotsOnAi(res.nextShots);
    if (res.sunkShipName) {
      setSunkAiShips((prev) => [...prev, res.sunkShipName!]);
    }
    if (res.allSunk) {
      setLocalStatus('Direct strike! You sank the entire enemy fleet!');
      finishLocalGame('player');
      return;
    }
    setLocalTurn('ai');
    setLocalStatus(
      res.sunkShipName
        ? `Confirmed sink: Enemy ${res.sunkShipName}! AI targeting...`
        : res.result === 'hit'
        ? 'Direct hull hit! Enemy AI firing back...'
        : 'Splash miss. Enemy AI firing back...'
    );
  };

  const resetLocal = () => {
    soundFx.playClick();
    setDraftGrid(generateRandomBattleshipBoard().grid);
    setPlacedShipIds([1, 2, 3, 4, 5]);
    setAiGrid(generateRandomBattleshipBoard().grid);
    setPlayerShotsOnAi(Array(100).fill('unknown'));
    setAiShotsOnPlayer(Array(100).fill('unknown'));
    setSunkAiShips([]);
    setSunkPlayerShips([]);
    setLocalPhase('placing');
    setLocalTurn('player');
    setWinner(null);
    setRewardBanner(null);
    setStartedAt(Date.now());
    setLocalStatus('Position your 5 warships or use Randomize, then Lock Fleet!');
  };

  const fleetValid = useMemo(() => validateBattleshipPlacement(draftGrid), [draftGrid]);
  const history = recentMatches.filter((m) => m.gameId === 'battleship');

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Battleship Command</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.battleship?.wins ?? 0}</span>
          <span>Points: {player.stats.byGame.battleship?.points ?? 0}</span>
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
              <RotateCcw className="h-3.5 w-3.5" /> New Engagement
            </button>
          ) : undefined
        }
      />

      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Compass className="h-4 w-4 text-[#38BDF8]" />
            {statusText}
          </p>
          {activePhase === 'placing' && !(bsServer && bsServer.readyBySeat[mm.mySeatIndex]) && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#060811] px-3 py-1.5 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <RotateCw className="h-3.5 w-3.5 text-[#38BDF8]" />
                Axis: {orientation === 'H' ? 'Horizontal' : 'Vertical'}
              </button>
              <button
                type="button"
                onClick={randomizeFleet}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#060811] px-3 py-1.5 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <Shuffle className="h-3.5 w-3.5 text-[#F97316]" />
                Randomize
              </button>
              <button
                type="button"
                onClick={clearFleet}
                className="rounded-lg border border-white/[0.12] bg-[#060811] px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={!fleetValid}
                onClick={lockFleetAndStart}
                className="rounded-xl bg-[#8B5CF6] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#7C3AED] disabled:opacity-40 cursor-pointer"
              >
                Lock Fleet & Battle
              </button>
            </div>
          )}
        </div>

        {activePhase === 'placing' && !(bsServer && bsServer.readyBySeat[mm.mySeatIndex]) && (
          <div className="flex flex-wrap gap-2">
            {BATTLESHIP_FLEET.map((ship) => {
              const placed = draftGrid.filter((v) => v === ship.id).length === ship.size;
              return (
                <button
                  key={ship.id}
                  type="button"
                  onClick={() => setActiveShipId(ship.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    activeShipId === ship.id
                      ? 'border-[#38BDF8] bg-[#38BDF8]/15 text-white'
                      : placed
                      ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                      : 'border-white/[0.08] bg-[#060811] text-slate-400'
                  }`}
                >
                  {ship.name} ({ship.size})
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Your Fleet Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-bold text-white flex items-center gap-1.5">
                <Anchor className="h-3.5 w-3.5 text-[#38BDF8]" />
                Your Fleet Waters
              </span>
              <span className="font-mono text-slate-400">
                Ships Lost: {bsServer ? (bsServer.sunkShipsBySeat[mm.mySeatIndex] || []).length : sunkPlayerShips.length}/5
              </span>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#060811] p-2.5">
              <div className="mb-1 grid grid-cols-10 gap-1 text-center font-mono text-[10px] text-slate-500">
                {COL_LABELS.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
              <div className="grid grid-cols-10 gap-1">
                {myFleetGrid.map((shipId, idx) => {
                  const shot = shotsReceived[idx];
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={activePhase !== 'placing'}
                      onClick={() => handlePlaceCell(idx)}
                      className={`aspect-square rounded border text-[10px] font-mono font-bold transition flex items-center justify-center ${
                        shot === 'sunk'
                          ? 'border-rose-400 bg-rose-700/80 text-white'
                          : shot === 'hit'
                          ? 'border-[#F97316] bg-[#F97316]/75 text-white'
                          : shot === 'miss'
                          ? 'border-slate-700 bg-slate-800/70 text-slate-400'
                          : shipId > 0
                          ? 'border-[#38BDF8]/60 bg-[#38BDF8]/30 text-[#38BDF8]'
                          : 'border-white/[0.06] bg-[#0B1228] hover:border-[#8B5CF6]/60'
                      } ${activePhase === 'placing' ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {shot === 'hit' || shot === 'sunk' ? '✕' : shot === 'miss' ? '•' : shipId > 0 ? shipId : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Enemy Radar Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-display font-bold text-white flex items-center gap-1.5">
                <Crosshair className="h-3.5 w-3.5 text-[#F97316]" />
                Enemy Tactical Radar
              </span>
              <span className="font-mono text-slate-400">
                Enemy Sunk: {bsServer ? (bsServer.sunkShipsBySeat[oppSeatIdx] || []).length : sunkAiShips.length}/5
              </span>
            </div>
            <div className="rounded-xl border border-[#F97316]/30 bg-[#060811] p-2.5">
              <div className="mb-1 grid grid-cols-10 gap-1 text-center font-mono text-[10px] text-slate-500">
                {COL_LABELS.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
              <div className="grid grid-cols-10 gap-1">
                {shotsFired.map((shot, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!myTurnToFire || shot !== 'unknown'}
                    onClick={() => handleFireShot(idx)}
                    aria-label={`Fire ${COL_LABELS[idx % 10]}${Math.floor(idx / 10) + 1}`}
                    className={`aspect-square rounded border text-xs font-mono font-bold transition flex items-center justify-center ${
                      shot === 'sunk'
                        ? 'border-rose-400 bg-rose-600/80 text-white'
                        : shot === 'hit'
                        ? 'border-[#F97316] bg-[#F97316]/75 text-white'
                        : shot === 'miss'
                        ? 'border-slate-700 bg-slate-800/70 text-slate-400'
                        : myTurnToFire
                        ? 'border-white/[0.08] bg-[#0B1228] hover:border-[#F97316] hover:bg-[#191632] cursor-pointer'
                        : 'border-white/[0.05] bg-[#0B1228] opacity-65 cursor-default'
                    }`}
                  >
                    {shot === 'sunk' ? '☠' : shot === 'hit' ? '✕' : shot === 'miss' ? '•' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {(winner || bsServer?.phase === 'finished') && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
            <div>
              <p className="font-display text-base font-bold text-white flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#F97316]" />
                {mm.liveMatch?.winnerSummary || statusText}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2 lg:col-span-6">
          <h3 className="font-display text-lg font-bold text-white">Naval Rules</h3>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {catalog.rules.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
          <p className="pt-2 font-mono text-xs text-slate-400">
            Session Record: <span className="text-emerald-400">{sessionScore.wins}W</span> ·{' '}
            <span className="text-rose-400">{sessionScore.losses}L</span>
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 lg:col-span-6">
          <h3 className="font-display text-lg font-bold text-white">Recent Naval Battles</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">Deploy your fleet and sink enemy warships to log history.</p>
          ) : (
            <div className="mt-3 space-y-2 max-h-[180px] overflow-y-auto pr-1">
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
  );
}
