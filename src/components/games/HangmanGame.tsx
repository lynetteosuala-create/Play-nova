import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, HelpCircle, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { seededShuffle } from '../../utils/seededRandom.ts';
import { soundFx } from '../../utils/sound.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

interface WordClue {
  word: string;
  category: string;
  hint: string;
}

const HANGMAN_BANK: WordClue[] = [
  { word: 'GALAXY', category: 'Cosmos', hint: 'Massive system of stars, dust, and dark matter' },
  { word: 'TOURNAMENT', category: 'Esports', hint: 'Structured bracket competition for champions' },
  { word: 'ALGORITHM', category: 'Tech', hint: 'Step-by-step logical procedure to solve a task' },
  { word: 'STRATEGY', category: 'Gaming', hint: 'Careful long-term tactical planning to win' },
  { word: 'CHECKMATE', category: 'Chess', hint: 'Final decisive attack leaving the king trapped' },
  { word: 'NEBULA', category: 'Cosmos', hint: 'Glowing interstellar cloud of ionized gas' },
  { word: 'CHAMPION', category: 'Esports', hint: 'Title claimed by the undefeated arena victor' },
  { word: 'CONTROLLER', category: 'Hardware', hint: 'Handheld input pad used for console gaming' },
  { word: 'VICTORY', category: 'Gaming', hint: 'Achieving total triumph over your opponent' },
  { word: 'QUANTUM', category: 'Science', hint: 'Discrete packet of energy at subatomic scale' },
  { word: 'SYNAPSE', category: 'Brain', hint: 'Junction passing signals between neurons' },
  { word: 'LABYRINTH', category: 'Puzzle', hint: 'Intricate winding maze of branching corridors' },
  { word: 'PHANTOM', category: 'Arcade', hint: 'Elusive spectral boss in neon dungeons' },
  { word: 'SPECTRUM', category: 'Physics', hint: 'Full band of colors separated from white light' },
  { word: 'MONOLITH', category: 'Sci-Fi', hint: 'Towering single-stone obsidian pillar' },
  { word: 'VELOCITY', category: 'Physics', hint: 'Speed combined with directional movement' },
  { word: 'ARTIFACT', category: 'Adventure', hint: 'Ancient relic recovered from lost ruins' },
  { word: 'ENCRYPTION', category: 'Security', hint: 'Scrambling data so only authorized keys read it' },
];

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

const MAX_WRONG = 6;
const TOTAL_ROUNDS = 5;

interface HangmanGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function HangmanGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: HangmanGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'hangman')!;
  const mm = useUniversalMatchmaking('hangman', { player });

  const deck = useMemo(() => seededShuffle(HANGMAN_BANK, mm.seed).slice(0, TOTAL_ROUNDS), [mm.seed]);

  const [roundIdx, setRoundIdx] = useState(0);
  const [guessed, setGuessed] = useState<Set<string>>(() => new Set());
  const [hintUsed, setHintUsed] = useState(false);
  const [score, setScore] = useState(0);
  const [wordsSolved, setWordsSolved] = useState(0);
  const [aiPaceScore, setAiPaceScore] = useState(0);
  const [roundOutcome, setRoundOutcome] = useState<'won' | 'lost' | null>(null);
  const [matchFinished, setMatchFinished] = useState(false);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [startedAt, setStartedAt] = useState(Date.now());

  const currentEntry = deck[roundIdx] || HANGMAN_BANK[0];
  const word = currentEntry.word;

  const wrongGuesses = useMemo(
    () => Array.from(guessed).filter((l) => !word.includes(l)),
    [guessed, word]
  );
  const wrongCount = wrongGuesses.length;
  const isWordSolved = useMemo(
    () => word.split('').every((ch) => guessed.has(ch)),
    [guessed, word]
  );

  // Sync duel progress if matched with human
  const syncDuel = useCallback(
    (nextScore: number, nextRound: number, done: boolean, summaryText: string) => {
      mm.sendDuelProgress({
        score: nextScore,
        progress: nextRound,
        maxProgress: TOTAL_ROUNDS,
        finished: done,
        summary: summaryText,
      });
    },
    [mm]
  );

  // Reset cleanly if live human match or seed changes
  useEffect(() => {
    setRoundIdx(0);
    setGuessed(new Set());
    setHintUsed(false);
    setScore(0);
    setWordsSolved(0);
    setAiPaceScore(mm.difficulty === 'hard' ? 280 : mm.difficulty === 'medium' ? 210 : 140);
    setRoundOutcome(null);
    setMatchFinished(false);
    setRewardBanner(null);
    setStartedAt(Date.now());
  }, [mm.seed, mm.matchPhase, mm.difficulty]);

  const finishEntireMatch = useCallback(
    async (finalScore: number, solvedCount: number) => {
      setMatchFinished(true);
      syncDuel(finalScore, TOTAL_ROUNDS, true, `${solvedCount}/${TOTAL_ROUNDS} words · ${finalScore} pts`);
      if (mm.matchPhase === 'human') {
        soundFx.playWin();
        return;
      }
      const outcome: 'win' | 'loss' | 'draw' =
        finalScore > aiPaceScore ? 'win' : finalScore === aiPaceScore ? 'draw' : 'loss';
      if (outcome === 'win') soundFx.playWin();
      else if (outcome === 'draw') soundFx.playDraw();
      else soundFx.playLoss();

      const res = await completeSinglePlayerGame(player, {
        gameId: 'hangman',
        mode: 'vs_ai',
        difficulty: mm.difficulty,
        outcome,
        opponentLabel: `Lexicon AI (${mm.difficulty})`,
        scoreDelta: Math.max(15, Math.round(finalScore * 0.45)),
        durationSec: Math.max(8, Math.round((Date.now() - startedAt) / 1000)),
        summary: `Solved ${solvedCount}/${TOTAL_ROUNDS} words (${finalScore} pts)`,
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    },
    [aiPaceScore, mm.difficulty, mm.matchPhase, onProgressUpdated, player, startedAt, syncDuel]
  );

  const handleLetter = useCallback(
    (letter: string) => {
      if (matchFinished || roundOutcome || guessed.has(letter)) return;
      const next = new Set(guessed);
      next.add(letter);
      setGuessed(next);

      const isHit = word.includes(letter);
      if (isHit) soundFx.playSelect();
      else soundFx.playClick();

      const nextWrong = Array.from(next).filter((l) => !word.includes(l)).length;
      const solvedNow = word.split('').every((ch) => next.has(ch));

      if (solvedNow) {
        const earned = Math.max(25, 95 - nextWrong * 12 - (hintUsed ? 20 : 0));
        const nextScore = score + earned;
        const nextSolved = wordsSolved + 1;
        setScore(nextScore);
        setWordsSolved(nextSolved);
        setRoundOutcome('won');
        soundFx.playWin();
        syncDuel(nextScore, roundIdx + 1, roundIdx + 1 >= TOTAL_ROUNDS, `${nextSolved}/${TOTAL_ROUNDS} solved`);
        if (roundIdx + 1 >= TOTAL_ROUNDS) {
          void finishEntireMatch(nextScore, nextSolved);
        }
      } else if (nextWrong >= MAX_WRONG) {
        setRoundOutcome('lost');
        soundFx.playLoss();
        syncDuel(score, roundIdx + 1, roundIdx + 1 >= TOTAL_ROUNDS, `${wordsSolved}/${TOTAL_ROUNDS} solved`);
        if (roundIdx + 1 >= TOTAL_ROUNDS) {
          void finishEntireMatch(score, wordsSolved);
        }
      }
    },
    [finishEntireMatch, guessed, hintUsed, matchFinished, roundIdx, roundOutcome, score, syncDuel, word, wordsSolved]
  );

  // Physical keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const ch = e.key.toUpperCase();
      if (/^[A-Z]$/.test(ch)) {
        handleLetter(ch);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleLetter]);

  const revealHintLetter = () => {
    if (hintUsed || roundOutcome || matchFinished) return;
    const unrevealed = word.split('').filter((ch) => !guessed.has(ch));
    if (unrevealed.length === 0) return;
    setHintUsed(true);
    handleLetter(unrevealed[0]);
  };

  const advanceRound = () => {
    if (roundIdx + 1 >= TOTAL_ROUNDS) return;
    soundFx.playClick();
    setRoundIdx((r) => r + 1);
    setGuessed(new Set());
    setHintUsed(false);
    setRoundOutcome(null);
  };

  const resetLocal = () => {
    soundFx.playClick();
    mm.rotateLocalSeed();
  };

  const history = recentMatches.filter((m) => m.gameId === 'hangman');

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Neon Hangman Duel</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.hangman?.wins ?? 0}</span>
          <span>Best Score: {player.stats.byGame.hangman?.bestScore ?? 0}</span>
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
              onClick={resetLocal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> New 5-Word Run
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 sm:p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-[#38BDF8] font-bold">
                  WORD {roundIdx + 1}/{TOTAL_ROUNDS}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-[#F97316]">{currentEntry.category}</span>
              </div>
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="inline-flex items-center gap-1 text-rose-400">
                  <Heart className="h-3.5 w-3.5 fill-current" />
                  {MAX_WRONG - wrongCount} Lives
                </span>
                <span className="text-emerald-400 font-bold">Score: {score}</span>
                {mm.matchPhase === 'ai' && <span className="text-slate-400">AI Target: {aiPaceScore}</span>}
              </div>
            </div>

            {/* Gallows SVG + Masked Word */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-center">
              <div className="md:col-span-4 flex justify-center rounded-xl border border-white/[0.06] bg-[#060811] p-4">
                <svg viewBox="0 0 160 160" className="h-40 w-40">
                  <line x1="20" y1="145" x2="105" y2="145" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
                  <line x1="45" y1="145" x2="45" y2="20" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
                  <line x1="45" y1="20" x2="108" y2="20" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
                  <line x1="108" y1="20" x2="108" y2="38" stroke="#8B5CF6" strokeWidth="3" strokeLinecap="round" />
                  {wrongCount >= 1 && <circle cx="108" cy="52" r="14" stroke="#38BDF8" strokeWidth="3.5" fill="none" />}
                  {wrongCount >= 2 && <line x1="108" y1="66" x2="108" y2="104" stroke="#38BDF8" strokeWidth="3.5" strokeLinecap="round" />}
                  {wrongCount >= 3 && <line x1="108" y1="76" x2="88" y2="92" stroke="#F97316" strokeWidth="3.5" strokeLinecap="round" />}
                  {wrongCount >= 4 && <line x1="108" y1="76" x2="128" y2="92" stroke="#F97316" strokeWidth="3.5" strokeLinecap="round" />}
                  {wrongCount >= 5 && <line x1="108" y1="104" x2="92" y2="128" stroke="#F43F5E" strokeWidth="3.5" strokeLinecap="round" />}
                  {wrongCount >= 6 && <line x1="108" y1="104" x2="124" y2="128" stroke="#F43F5E" strokeWidth="3.5" strokeLinecap="round" />}
                </svg>
              </div>

              <div className="md:col-span-8 space-y-4 text-center md:text-left">
                <p className="text-xs text-slate-400 flex items-center justify-center md:justify-start gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-[#8B5CF6]" />
                  Clue: <span className="text-slate-200">{currentEntry.hint}</span>
                </p>

                <div className="flex flex-wrap justify-center md:justify-start gap-2">
                  {word.split('').map((ch, idx) => {
                    const visible = guessed.has(ch) || roundOutcome === 'lost';
                    const missedReveal = !guessed.has(ch) && roundOutcome === 'lost';
                    return (
                      <div
                        key={idx}
                        className={`flex h-12 w-10 items-center justify-center rounded-xl border font-mono text-xl font-bold ${
                          missedReveal
                            ? 'border-rose-500/60 bg-rose-950/30 text-rose-300'
                            : visible
                            ? 'border-[#38BDF8]/60 bg-[#38BDF8]/15 text-white'
                            : 'border-white/[0.12] bg-[#060811] text-transparent'
                        }`}
                      >
                        {visible ? ch : '_'}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {!roundOutcome && !matchFinished && (
                    <button
                      type="button"
                      disabled={hintUsed}
                      onClick={revealHintLetter}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#F97316]/40 bg-[#F97316]/10 px-3 py-1.5 text-xs font-semibold text-[#FDBA74] hover:bg-[#F97316]/20 disabled:opacity-40 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {hintUsed ? 'Hint Used' : 'Reveal Letter (-20 pts)'}
                    </button>
                  )}
                  {roundOutcome && !matchFinished && (
                    <button
                      type="button"
                      onClick={advanceRound}
                      className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-bold text-white hover:bg-[#7C3AED] cursor-pointer"
                    >
                      {isWordSolved ? 'Solved! Next Word →' : 'Out of Lives — Next Word →'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Interactive QWERTY Keyboard */}
            <div className="space-y-2 pt-2">
              {KEYBOARD_ROWS.map((row, rIdx) => (
                <div key={rIdx} className="flex justify-center gap-1.5">
                  {row.map((letter) => {
                    const isUsed = guessed.has(letter);
                    const isHit = isUsed && word.includes(letter);
                    const isMiss = isUsed && !word.includes(letter);
                    return (
                      <button
                        key={letter}
                        type="button"
                        disabled={isUsed || Boolean(roundOutcome) || matchFinished}
                        onClick={() => handleLetter(letter)}
                        className={`h-10 min-w-[30px] sm:min-w-[38px] rounded-lg border font-mono text-xs sm:text-sm font-bold transition cursor-pointer disabled:cursor-default ${
                          isHit
                            ? 'border-emerald-500 bg-emerald-600/30 text-emerald-200'
                            : isMiss
                            ? 'border-slate-800 bg-slate-900/60 text-slate-600'
                            : 'border-white/[0.12] bg-[#060811] text-white hover:border-[#38BDF8] hover:bg-[#121B36]'
                        }`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {matchFinished && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {mm.matchPhase === 'human'
                      ? mm.liveMatch?.winnerSummary || `Run Complete — ${score} pts (${wordsSolved}/${TOTAL_ROUNDS} solved)`
                      : score > aiPaceScore
                      ? `Victory! Beat Lexicon AI (${score} vs ${aiPaceScore})`
                      : `Run Complete — ${score} pts vs AI Target ${aiPaceScore}`}
                  </p>
                  {rewardBanner && (
                    <p className="mt-0.5 font-mono text-xs text-emerald-400">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={mm.matchPhase === 'human' ? mm.rematchHuman : resetLocal}
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
            <h3 className="font-display text-lg font-bold text-white">Recent Hangman Runs</h3>
            {history.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a 5-word sprint to log your score.</p>
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
