import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RotateCcw, Shuffle, SkipForward, Sparkles, Timer, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { seededShuffle } from '../../utils/seededRandom.ts';
import { soundFx } from '../../utils/sound.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface ScrambleItem {
  word: string;
  hint: string;
}

const SCRAMBLE_BANK: ScrambleItem[] = [
  { word: 'PLAYER', hint: 'Participant competing in an arena' },
  { word: 'VECTOR', hint: 'Direction and magnitude in 3D space' },
  { word: 'PLANET', hint: 'Orbiting celestial world' },
  { word: 'MATRIX', hint: 'Rectangular grid of values' },
  { word: 'BEACON', hint: 'Guiding signal tower of light' },
  { word: 'CIPHER', hint: 'Secret method of encoding text' },
  { word: 'KNIGHT', hint: 'L-jumping piece in Chess' },
  { word: 'ARCADE', hint: 'Classic coin-op gaming hall' },
  { word: 'THRONE', hint: 'Seat of the tournament champion' },
  { word: 'SIGNAL', hint: 'Transmitted data wave' },
  { word: 'SPARKS', hint: 'Bright electric flashes' },
  { word: 'PUZZLE', hint: 'Brain teaser awaiting solution' },
  { word: 'ROCKET', hint: 'High-thrust launch vehicle' },
  { word: 'COMBAT', hint: 'Head-to-head competitive clash' },
  { word: 'PRISM', hint: 'Crystal splitting white light' },
  { word: 'QUANT', hint: 'Sharp analytical strategist' },
  { word: 'TURBO', hint: 'High-speed overdrive boost' },
  { word: 'NOVA', hint: 'Sudden luminous star explosion' },
];

const ROUND_TIME_SEC = 60;

interface WordScrambleGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function WordScrambleGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: WordScrambleGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'word_scramble')!;
  const mm = useUniversalMatchmaking('word_scramble', { player });

  const words = useMemo(() => seededShuffle(SCRAMBLE_BANK, mm.seed), [mm.seed]);
  const [wordIdx, setWordIdx] = useState(0);
  const [shuffledLetters, setShuffledLetters] = useState<string[]>([]);
  const [guess, setGuess] = useState('');
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_SEC);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [finished, setFinished] = useState(false);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const aiTarget = mm.difficulty === 'hard' ? 420 : mm.difficulty === 'medium' ? 280 : 160;
  const activeWord = words[wordIdx % words.length];

  const makeScrambled = useCallback((target: string, salt: number) => {
    const arr = seededShuffle(target.split(''), mm.seed + salt);
    if (arr.join('') === target && arr.length > 1) {
      [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1], arr[0]];
    }
    return arr;
  }, [mm.seed]);

  useEffect(() => {
    setWordIdx(0);
    setGuess('');
    setScore(0);
    setSolved(0);
    setStreak(0);
    setTimeLeft(ROUND_TIME_SEC);
    setFeedback(null);
    setShowHint(false);
    setFinished(false);
    setRewardBanner(null);
    setShuffledLetters(makeScrambled(words[0].word, 1));
  }, [mm.seed, mm.matchPhase, makeScrambled, words]);

  useEffect(() => {
    if (mm.matchPhase === 'searching' || finished) return;
    const timer = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished, mm.matchPhase]);

  useEffect(() => {
    if (timeLeft === 0 && !finished && mm.matchPhase !== 'searching') {
      setFinished(true);
      mm.sendDuelProgress({
        score,
        progress: solved,
        maxProgress: 10,
        finished: true,
        summary: `${solved} words · ${score} pts`,
      });
      if (mm.matchPhase === 'ai') {
        const outcome: 'win' | 'loss' | 'draw' =
          score > aiTarget ? 'win' : score === aiTarget ? 'draw' : 'loss';
        if (outcome === 'win') soundFx.playWin();
        else if (outcome === 'draw') soundFx.playDraw();
        else soundFx.playLoss();
        void completeSinglePlayerGame(player, {
          gameId: 'word_scramble',
          mode: 'vs_ai',
          difficulty: mm.difficulty,
          outcome,
          opponentLabel: `Scramble AI (${mm.difficulty})`,
          scoreDelta: Math.max(15, Math.round(score * 0.45)),
          durationSec: ROUND_TIME_SEC,
          summary: `Unscrambled ${solved} words (${score} pts)`,
        }).then((res) => {
          setRewardBanner(res.rewards);
          onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, finished]);

  const advanceWord = (nextIdx: number) => {
    const nextItem = words[nextIdx % words.length];
    setWordIdx(nextIdx);
    setGuess('');
    setShowHint(false);
    setShuffledLetters(makeScrambled(nextItem.word, nextIdx + 11));
  };

  const submitGuess = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (finished || mm.matchPhase === 'searching') return;
    const clean = guess.trim().toUpperCase();
    if (!clean) return;

    if (clean === activeWord.word) {
      const nextStreak = streak + 1;
      const pts = 70 + Math.min(50, nextStreak * 10) - (showHint ? 15 : 0);
      const nextScore = score + pts;
      const nextSolved = solved + 1;
      soundFx.playSelect();
      setScore(nextScore);
      setSolved(nextSolved);
      setStreak(nextStreak);
      setFeedback(`+${pts} pts · "${activeWord.word}"!`);
      mm.sendDuelProgress({
        score: nextScore,
        progress: nextSolved,
        maxProgress: 10,
        finished: false,
        summary: `${nextSolved} unscrambled`,
      });
      advanceWord(wordIdx + 1);
    } else {
      soundFx.playClick();
      setStreak(0);
      setFeedback('Not quite — try rearranging the tiles!');
    }
  };

  const handleTileClick = (ch: string) => {
    if (finished || mm.matchPhase === 'searching') return;
    soundFx.playClick();
    setGuess((g) => (g + ch).slice(0, activeWord.word.length));
  };

  const history = recentMatches.filter((m) => m.gameId === 'word_scramble');

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Word Scramble Blitz</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.word_scramble?.wins ?? 0}</span>
          <span>Best Score: {player.stats.byGame.word_scramble?.bestScore ?? 0}</span>
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
          mm.matchPhase === 'ai' ? (
            <button
              type="button"
              onClick={() => mm.rotateLocalSeed()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restart 60s
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-[#F97316] font-bold">
                <Timer className="h-4 w-4" /> {timeLeft}s Left
              </span>
              <div className="flex items-center gap-4">
                <span className="text-emerald-400 font-bold">Score: {score}</span>
                <span className="text-[#38BDF8]">Solved: {solved}</span>
                <span className="text-purple-300">Streak: {streak}x</span>
                {mm.matchPhase === 'ai' && <span className="text-slate-400">AI Target: {aiTarget}</span>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-[#060811] p-6 text-center space-y-5">
              <div className="flex flex-wrap justify-center gap-2.5">
                {shuffledLetters.map((ch, idx) => (
                  <button
                    key={`${wordIdx}-${idx}`}
                    type="button"
                    disabled={finished}
                    onClick={() => handleTileClick(ch)}
                    className="flex h-14 w-12 items-center justify-center rounded-xl border border-[#8B5CF6]/50 bg-[#131936] font-display text-2xl font-extrabold text-white shadow transition hover:-translate-y-0.5 hover:border-[#38BDF8] cursor-pointer"
                  >
                    {ch}
                  </button>
                ))}
              </div>

              {showHint && (
                <p className="text-xs text-[#FDBA74]">Hint: {activeWord.hint}</p>
              )}

              <form onSubmit={submitGuess} className="mx-auto flex max-w-md gap-2">
                <input
                  type="text"
                  disabled={finished}
                  value={guess}
                  onChange={(e) => setGuess(e.target.value.toUpperCase())}
                  placeholder="Type or tap tiles..."
                  className="flex-1 rounded-xl border border-white/[0.12] bg-[#0E1324] px-4 py-2.5 text-center font-mono text-base font-bold uppercase tracking-widest text-white focus:border-[#38BDF8] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={finished}
                  className="rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Submit
                </button>
              </form>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={finished}
                  onClick={() => setShuffledLetters((prev) => [...prev].sort(() => Math.random() - 0.5))}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  <Shuffle className="h-3.5 w-3.5" /> Reshuffle
                </button>
                <button
                  type="button"
                  disabled={finished || showHint}
                  onClick={() => setShowHint(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#F97316]/40 px-3 py-1.5 text-xs text-[#FDBA74] disabled:opacity-40 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Hint (-15)
                </button>
                <button
                  type="button"
                  disabled={finished}
                  onClick={() => {
                    setStreak(0);
                    advanceWord(wordIdx + 1);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Skip
                </button>
              </div>

              {feedback && <p className="font-mono text-xs text-[#38BDF8]">{feedback}</p>}
            </div>

            {finished && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {mm.matchPhase === 'human'
                      ? mm.liveMatch?.winnerSummary || `Sprint Done — ${score} pts`
                      : score > aiTarget
                      ? `Victory! Beat Scramble AI (${score} vs ${aiTarget})`
                      : `Sprint Complete — ${score} pts (AI Target: ${aiTarget})`}
                  </p>
                  {rewardBanner && (
                    <p className="mt-0.5 font-mono text-xs text-emerald-400">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={mm.matchPhase === 'human' ? mm.rematchHuman : () => mm.rotateLocalSeed()}
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
            <h3 className="font-display text-lg font-bold text-white">Rules & Controls</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Scramble Sprints</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Finish a 60-second sprint to log your high score.</p>
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
