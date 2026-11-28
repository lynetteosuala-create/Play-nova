import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { createSeededRng, seededShuffle } from '../../utils/seededRandom.ts';
import { soundFx } from '../../utils/sound.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

const CARD_SYMBOLS = [
  '⚡', '💎', '🚀', '👑', '🔥', '🛡️', '🎯', '🪐', '🔮', '⚔️',
  '🧩', '🌟', '🎲', '🛰️', '🏆', '🌀', '💠', '🐉',
];

interface CardTile {
  id: number;
  symbol: string;
  matched: boolean;
  matchedBy?: 'player' | 'ai';
}

interface MemoryMatchGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

function buildDeck(pairCount: number, seed: number): CardTile[] {
  const chosen = CARD_SYMBOLS.slice(0, pairCount);
  const raw = seededShuffle([...chosen, ...chosen], seed);
  return raw.map((symbol, idx) => ({ id: idx, symbol, matched: false }));
}

export function MemoryMatchGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: MemoryMatchGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'memory_match')!;
  const mm = useUniversalMatchmaking('memory_match', { player });

  const [gridPairs, setGridPairs] = useState<8 | 12 | 18>(8);
  const [cards, setCards] = useState<CardTile[]>(() => buildDeck(8, mm.seed));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [seenMemory, setSeenMemory] = useState<Record<number, string>>({});
  const [turn, setTurn] = useState<'player' | 'ai'>('player');
  const [playerPairs, setPlayerPairs] = useState(0);
  const [aiPairs, setAiPairs] = useState(0);
  const [moves, setMoves] = useState(0);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<{ outcome: 'win' | 'loss' | 'draw'; text: string } | null>(null);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [startedAt, setStartedAt] = useState(Date.now());

  const memoryHistory = recentMatches.filter((m) => m.gameId === 'memory_match');
  const isHumanDuel = mm.matchPhase === 'human';

  const resetBoard = useCallback(
    (pairs: 8 | 12 | 18, seedVal: number) => {
      setCards(buildDeck(pairs, seedVal));
      setFlipped([]);
      setSeenMemory({});
      setTurn('player');
      setPlayerPairs(0);
      setAiPairs(0);
      setMoves(0);
      setStreak(0);
      setBusy(false);
      setFinished(null);
      setRewardBanner(null);
      setStartedAt(Date.now());
    },
    []
  );

  useEffect(() => {
    resetBoard(gridPairs, mm.seed);
  }, [mm.seed, mm.matchPhase, gridPairs, resetBoard]);

  const startNewGame = (pairs = gridPairs) => {
    soundFx.playClick();
    setGridPairs(pairs);
    if (isHumanDuel) {
      mm.rematchHuman();
    } else {
      const nextSeed = mm.rotateLocalSeed();
      resetBoard(pairs, nextSeed);
    }
  };

  const completeMatch = async (pScore: number, aScore: number, totalMoves: number) => {
    const scoreDelta = Math.max(
      60,
      gridPairs * 14 + pScore * 8 - Math.max(0, totalMoves - gridPairs * 2)
    );

    if (isHumanDuel) {
      soundFx.playWin();
      const summary = `${pScore}/${gridPairs} pairs in ${totalMoves} flips`;
      setFinished({
        outcome: 'win',
        text: mm.liveMatch?.winnerSummary || `Cleared ${gridPairs} pairs in ${totalMoves} flips!`,
      });
      mm.sendDuelProgress({
        score: scoreDelta,
        progress: pScore,
        maxProgress: gridPairs,
        finished: true,
        summary,
      });
      return;
    }

    const outcome: 'win' | 'loss' | 'draw' =
      pScore > aScore ? 'win' : pScore < aScore ? 'loss' : 'draw';
    const text =
      pScore > aScore
        ? `Victory! ${pScore}–${aScore} pairs against Memory AI`
        : pScore === aScore
        ? `Draw! ${pScore}–${aScore} pairs split`
        : `Memory AI edged out ${aScore}–${pScore}`;

    if (outcome === 'win') soundFx.playWin();
    else if (outcome === 'draw') soundFx.playDraw();
    else soundFx.playLoss();

    setFinished({ outcome, text });

    const finalScoreDelta =
      outcome === 'win' ? scoreDelta : outcome === 'draw' ? 45 : 15;

    try {
      const res = await completeSinglePlayerGame(player, {
        gameId: 'memory_match',
        mode: 'vs_ai',
        difficulty: mm.difficulty,
        outcome,
        opponentLabel: `Memory AI (${mm.difficulty})`,
        scoreDelta: finalScoreDelta,
        durationSec: Math.max(5, Math.round((Date.now() - startedAt) / 1000)),
        summary: text,
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // keep UI result visible
    }
  };

  // AI Turn Execution (only when playing vs AI)
  useEffect(() => {
    if (mm.matchPhase !== 'ai' || turn !== 'ai' || finished || busy) return;
    setBusy(true);
    const rng = createSeededRng(mm.seed + moves * 31 + aiPairs * 17);
    const timer = window.setTimeout(() => {
      const unmatched = cards.filter((c) => !c.matched);
      if (unmatched.length < 2) {
        setBusy(false);
        return;
      }

      const recallChance = mm.difficulty === 'hard' ? 0.85 : mm.difficulty === 'medium' ? 0.55 : 0.2;
      let pick1: number | null = null;
      let pick2: number | null = null;

      if (rng() < recallChance) {
        const bySym = new Map<string, number[]>();
        for (const c of unmatched) {
          if (seenMemory[c.id]) {
            const list = bySym.get(c.symbol) || [];
            list.push(c.id);
            bySym.set(c.symbol, list);
          }
        }
        for (const ids of bySym.values()) {
          if (ids.length >= 2) {
            pick1 = ids[0];
            pick2 = ids[1];
            break;
          }
        }
      }

      if (pick1 === null || pick2 === null) {
        const shuffled = seededShuffle(unmatched, mm.seed + moves + 99);
        pick1 = shuffled[0].id;
        const knownMatch =
          rng() < recallChance
            ? unmatched.find((c) => c.id !== pick1 && seenMemory[c.id] === shuffled[0].symbol)
            : undefined;
        pick2 = knownMatch ? knownMatch.id : shuffled[1].id;
      }

      setFlipped([pick1, pick2]);
      setSeenMemory((prev) => ({
        ...prev,
        [pick1!]: cards[pick1!].symbol,
        [pick2!]: cards[pick2!].symbol,
      }));

      window.setTimeout(() => {
        const isMatch = cards[pick1!].symbol === cards[pick2!].symbol;
        if (isMatch) {
          soundFx.playSelect();
          const nextCards = cards.map((c) =>
            c.id === pick1 || c.id === pick2 ? { ...c, matched: true, matchedBy: 'ai' as const } : c
          );
          const nextAiScore = aiPairs + 1;
          setCards(nextCards);
          setAiPairs(nextAiScore);
          setFlipped([]);
          setBusy(false);
          if (nextCards.every((c) => c.matched)) {
            void completeMatch(playerPairs, nextAiScore, moves);
          } else {
            setTurn('ai');
          }
        } else {
          setFlipped([]);
          setTurn('player');
          setBusy(false);
        }
      }, 650);
    }, 500);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, mm.matchPhase, finished, busy, aiPairs]);

  const handleFlip = (cardId: number) => {
    if (mm.matchPhase === 'searching' || busy || finished || (!isHumanDuel && turn !== 'player')) return;
    if (flipped.includes(cardId) || cards[cardId].matched) return;

    soundFx.playClick();
    const nextFlipped = [...flipped, cardId];
    setFlipped(nextFlipped);
    setSeenMemory((prev) => ({ ...prev, [cardId]: cards[cardId].symbol }));

    if (nextFlipped.length < 2) return;
    const [firstId, secondId] = nextFlipped;
    const nextMoves = moves + 1;
    setMoves(nextMoves);
    setBusy(true);

    window.setTimeout(() => {
      if (cards[firstId].symbol === cards[secondId].symbol) {
        soundFx.playSelect();
        const nextCards = cards.map((c) =>
          c.id === firstId || c.id === secondId ? { ...c, matched: true, matchedBy: 'player' as const } : c
        );
        const nextPlayerPairs = playerPairs + 1;
        setCards(nextCards);
        setPlayerPairs(nextPlayerPairs);
        setStreak((s) => s + 1);
        setFlipped([]);
        setBusy(false);

        if (isHumanDuel) {
          const liveScore = nextPlayerPairs * 25 + Math.max(0, 20 - nextMoves);
          mm.sendDuelProgress({
            score: liveScore,
            progress: nextPlayerPairs,
            maxProgress: gridPairs,
            finished: false,
            summary: `${nextPlayerPairs}/${gridPairs} pairs`,
          });
        }

        if (nextCards.every((c) => c.matched)) {
          void completeMatch(nextPlayerPairs, aiPairs, nextMoves);
        }
      } else {
        setStreak(0);
        setFlipped([]);
        setBusy(false);
        if (!isHumanDuel) setTurn('ai');
      }
    }, 560);
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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Memory Match</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.memory_match.wins}</span>
          <span>Points: {player.stats.byGame.memory_match.points}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={mm.setDifficulty}
        liveMatch={mm.liveMatch}
        mySeat={mm.mySeat}
        opponentSeat={mm.opponentSeat}
        onlineCount={mm.onlineCount}
        onSkipToAi={mm.skipToAi}
        onSearchHuman={mm.searchForHuman}
        onLeaveHuman={mm.leaveHumanMatch}
        onRematchHuman={mm.rematchHuman}
        onSendChat={mm.sendChat}
        showDuelBar
        extraControls={
          <div className="flex items-center gap-1.5">
            {([8, 12, 18] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={isHumanDuel}
                onClick={() => startNewGame(p)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                  gridPairs === p
                    ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-400'
                }`}
              >
                {p === 8 ? '4×4' : p === 12 ? '6×4' : '6×6'}
              </button>
            ))}
            {mm.matchPhase === 'ai' && (
              <button
                type="button"
                onClick={() => startNewGame(gridPairs)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#060811] px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Shuffle
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">
                {finished
                  ? finished.text
                  : isHumanDuel
                  ? 'Synced Seed 1v1 — Clear all matching pairs faster & in fewer flips!'
                  : turn === 'player'
                  ? 'Your Turn — Flip 2 matching emblems'
                  : 'Memory AI Bot Turn...'}
              </span>
              <span className="font-mono text-slate-300 tabular-nums">
                You: {playerPairs}/{gridPairs} {!isHumanDuel ? `· AI: ${aiPairs}` : ''} · Flips: {moves} · Streak: {streak}
              </span>
            </div>

            <div
              className={`mx-auto grid gap-2.5 ${
                gridPairs === 8 ? 'max-w-md grid-cols-4' : 'max-w-xl grid-cols-6'
              }`}
            >
              {cards.map((card) => {
                const isOpen = card.matched || flipped.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={isOpen || busy || Boolean(finished) || mm.matchPhase === 'searching'}
                    onClick={() => handleFlip(card.id)}
                    className={`aspect-square rounded-xl border text-2xl sm:text-3xl transition flex items-center justify-center cursor-pointer ${
                      card.matched
                        ? card.matchedBy === 'ai'
                          ? 'border-[#F97316]/50 bg-[#F97316]/15'
                          : 'border-emerald-500/50 bg-emerald-950/30'
                        : isOpen
                        ? 'border-[#38BDF8] bg-[#131D3A]'
                        : 'border-white/[0.1] bg-[#060811] hover:border-[#8B5CF6]/70'
                    }`}
                  >
                    {isOpen ? card.symbol : <Sparkles className="h-4 w-4 text-[#8B5CF6]/60" />}
                  </button>
                );
              })}
            </div>

            {finished && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />{' '}
                    {isHumanDuel ? mm.liveMatch?.winnerSummary || finished.text : finished.text}
                  </p>
                  {rewardBanner && (
                    <p className="font-mono text-xs text-slate-300">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => startNewGame(gridPairs)}
                  className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white">Arena Rules</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Memory Runs</h3>
            {memoryHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a board to log your efficiency score.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {memoryHistory.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
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
