import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Clock, Lightbulb, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { soundFx } from '../../utils/sound.ts';

const SCRAMBLE_BANK: Array<{ word: string; clue: string }> = [
  { word: 'GALAXY', clue: 'Vast star system in deep space' },
  { word: 'KNIGHT', clue: 'L-jumping chess piece' },
  { word: 'CIPHER', clue: 'Encoded secret message' },
  { word: 'TROPHY', clue: 'Prize awarded to arena champions' },
  { word: 'VECTOR', clue: 'Quantity with direction and magnitude' },
  { word: 'MATRIX', clue: 'Grid of rows and columns' },
  { word: 'ORACLE', clue: 'Predictor of strategic outcomes' },
  { word: 'QUARTZ', clue: 'Crystalline mineral oscillator' },
  { word: 'BEACON', clue: 'Guiding luminous signal tower' },
  { word: 'ZENITH', clue: 'Highest peak directly overhead' },
  { word: 'PUZZLE', clue: 'Mental challenge demanding deduction' },
  { word: 'VERTEX', clue: 'Corner point where edges meet' },
];

const CIPHER_WORDS = [
  'CRANE', 'PULSE', 'NEXUS', 'LASER', 'CROWN', 'BLITZ', 'ORBIT', 'SPARK',
  'GHOST', 'CHESS', 'QUEST', 'VAULT', 'STORM', 'CYBER', 'FLARE', 'SWIFT',
];

function scrambleWord(word: string): string {
  const arr = word.split('');
  for (let pass = 0; pass < 4; pass++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (arr.join('') !== word) break;
  }
  return arr.join('');
}

interface WordBattleGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function WordBattleGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: WordBattleGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'word_battle')!;
  const [subMode, setSubMode] = useState<'scramble' | 'cipher'>('scramble');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');

  // Scramble Sprint state (5 rounds)
  const [roundIdx, setRoundIdx] = useState(0);
  const [deck, setDeck] = useState(() => [...SCRAMBLE_BANK].sort(() => Math.random() - 0.5).slice(0, 5));
  const [scrambled, setScrambled] = useState(() => scrambleWord(deck[0].word));
  const [guess, setGuess] = useState('');
  const [revealedCount, setRevealedCount] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);

  // 5-Letter Cipher state
  const [cipherSecret, setCipherSecret] = useState(() => CIPHER_WORDS[Math.floor(Math.random() * CIPHER_WORDS.length)]);
  const [cipherRows, setCipherRows] = useState<string[]>([]);

  const [finished, setFinished] = useState<{ outcome: 'win' | 'loss' | 'draw'; text: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [startedAt, setStartedAt] = useState(Date.now());

  const wordHistory = recentMatches.filter((m) => m.gameId === 'word_battle');

  const finalizeMatch = async (pScore: number, aScore: number, summaryText: string) => {
    const outcome: 'win' | 'loss' | 'draw' = pScore > aScore ? 'win' : pScore < aScore ? 'loss' : 'draw';
    if (outcome === 'win') soundFx.playWin();
    else if (outcome === 'draw') soundFx.playDraw();
    else soundFx.playLoss();

    setFinished({ outcome, text: summaryText });
    try {
      const res = await completeSinglePlayerGame(player, {
        gameId: 'word_battle',
        mode: subMode,
        difficulty,
        outcome,
        opponentLabel: `Lexicon AI (${difficulty})`,
        scoreDelta: Math.max(20, pScore),
        durationSec: Math.max(6, Math.round((Date.now() - startedAt) / 1000)),
        summary: summaryText,
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // keep UI clean
    }
  };

  // Scramble round countdown
  useEffect(() => {
    if (subMode !== 'scramble' || finished) return;
    if (timeLeft <= 0) {
      const target = deck[roundIdx].word;
      const aiGain = difficulty === 'hard' ? 40 : difficulty === 'medium' ? 30 : 20;
      const nextAi = aiScore + aiGain;
      setAiScore(nextAi);
      setFeedback(`Time expired — Word was ${target}`);
      if (roundIdx >= 4) {
        void finalizeMatch(playerScore, nextAi, `Word Scramble Duel finished ${playerScore}–${nextAi}`);
      } else {
        const nextIdx = roundIdx + 1;
        setRoundIdx(nextIdx);
        setScrambled(scrambleWord(deck[nextIdx].word));
        setRevealedCount(0);
        setGuess('');
        setTimeLeft(25);
      }
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subMode, finished, timeLeft]);

  const startNewBattle = (nextSubMode = subMode) => {
    soundFx.playClick();
    setSubMode(nextSubMode);
    const freshDeck = [...SCRAMBLE_BANK].sort(() => Math.random() - 0.5).slice(0, 5);
    setDeck(freshDeck);
    setRoundIdx(0);
    setScrambled(scrambleWord(freshDeck[0].word));
    setRevealedCount(0);
    setGuess('');
    setPlayerScore(0);
    setAiScore(0);
    setTimeLeft(25);
    setCipherSecret(CIPHER_WORDS[Math.floor(Math.random() * CIPHER_WORDS.length)]);
    setCipherRows([]);
    setFinished(null);
    setFeedback(null);
    setRewardBanner(null);
    setStartedAt(Date.now());
  };

  const handleScrambleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (finished) return;
    const clean = guess.trim().toUpperCase();
    const target = deck[roundIdx].word;
    if (clean !== target) {
      soundFx.playLoss();
      setFeedback('Not quite — check the scrambled letters or reveal a hint!');
      return;
    }

    soundFx.playSelect();
    const roundPts = Math.max(15, 35 + timeLeft * 2 - revealedCount * 8);
    const aiGain = difficulty === 'hard' ? 35 : difficulty === 'medium' ? 24 : 14;
    const nextP = playerScore + roundPts;
    const nextA = aiScore + aiGain;
    setPlayerScore(nextP);
    setAiScore(nextA);
    setFeedback(`Solved ${target} (+${roundPts} pts)!`);

    if (roundIdx >= 4) {
      void finalizeMatch(nextP, nextA, `Solved 5/5 Scrambles (${nextP} vs ${nextA} AI)`);
    } else {
      const nextIdx = roundIdx + 1;
      setRoundIdx(nextIdx);
      setScrambled(scrambleWord(deck[nextIdx].word));
      setRevealedCount(0);
      setGuess('');
      setTimeLeft(25);
    }
  };

  const handleCipherSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (finished) return;
    const clean = guess.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(clean)) {
      setFeedback('Enter a valid 5-letter uppercase word.');
      return;
    }
    const nextRows = [...cipherRows, clean];
    setCipherRows(nextRows);
    setGuess('');
    setFeedback(null);

    if (clean === cipherSecret) {
      const score = Math.max(80, 210 - (nextRows.length - 1) * 28);
      void finalizeMatch(score, 100, `Cracked 5-letter cipher ${cipherSecret} in ${nextRows.length}/6 tries`);
    } else if (nextRows.length >= 6) {
      void finalizeMatch(20, 120, `Out of guesses — Cipher word was ${cipherSecret}`);
    } else {
      soundFx.playClick();
    }
  };

  const scoreCipherTile = (rowWord: string, colIdx: number) => {
    const ch = rowWord[colIdx];
    if (cipherSecret[colIdx] === ch) return 'border-emerald-400 bg-emerald-600/30 text-white';
    if (cipherSecret.includes(ch)) return 'border-[#F97316] bg-[#F97316]/25 text-[#FDBA74]';
    return 'border-slate-700 bg-[#060811] text-slate-400';
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
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Hub
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Word Battle</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-slate-300">
          <span>Wins: {player.stats.byGame.word_battle.wins}</span>
          <span>Points: {player.stats.byGame.word_battle.points}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startNewBattle('scramble')}
                className={`rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                  subMode === 'scramble'
                    ? 'border-[#F97316] bg-[#F97316]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-300'
                }`}
              >
                Scramble Sprint (5 Rounds)
              </button>
              <button
                type="button"
                onClick={() => startNewBattle('cipher')}
                className={`rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer ${
                  subMode === 'cipher'
                    ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-300'
                }`}
              >
                5-Letter Cipher Duel
              </button>
            </div>

            <div className="flex gap-1.5">
              {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDifficulty(d);
                    startNewBattle(subMode);
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                    difficulty === d
                      ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                      : 'border-slate-700 bg-[#060811] text-slate-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5">
            {subMode === 'scramble' ? (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#38BDF8]">Round {roundIdx + 1} / 5</span>
                  <span className="inline-flex items-center gap-1 font-mono text-white">
                    <Clock className="h-3.5 w-3.5 text-[#F97316]" /> {timeLeft}s
                  </span>
                  <span className="font-mono text-slate-300">
                    You {playerScore} — {aiScore} AI
                  </span>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#060811] p-6 text-center space-y-3">
                  <p className="text-xs text-slate-400">Clue: {deck[roundIdx].clue}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {scrambled.split('').map((ch, i) => (
                      <span
                        key={i}
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#8B5CF6]/40 bg-[#121830] font-display text-2xl font-bold text-white"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                  {revealedCount > 0 && (
                    <p className="font-mono text-xs text-emerald-400">
                      Revealed prefix: {deck[roundIdx].word.slice(0, revealedCount)}...
                    </p>
                  )}
                </div>

                <form onSubmit={handleScrambleSubmit} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    disabled={Boolean(finished)}
                    value={guess}
                    onChange={(e) => setGuess(e.target.value.toUpperCase())}
                    placeholder="Type the unscrambled word..."
                    className="flex-1 min-w-[200px] rounded-xl border border-slate-700 bg-[#060811] px-4 py-3 font-mono text-sm uppercase text-white focus:border-[#8B5CF6] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={Boolean(finished) || revealedCount >= 3}
                    onClick={() => setRevealedCount((c) => Math.min(3, c + 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#F97316]/40 bg-[#F97316]/10 px-3.5 py-2.5 text-xs font-semibold text-[#FDBA74] disabled:opacity-40 cursor-pointer"
                  >
                    <Lightbulb className="h-3.5 w-3.5" /> Letter Hint
                  </button>
                  <button
                    type="submit"
                    disabled={Boolean(finished)}
                    className="rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7C3AED] disabled:opacity-50 cursor-pointer"
                  >
                    Submit Word
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Crack the 5-letter secret word in 6 attempts</span>
                  <span className="font-mono">{cipherRows.length} / 6 Tries</span>
                </div>

                <div className="mx-auto max-w-xs space-y-2">
                  {Array.from({ length: 6 }, (_, r) => {
                    const rowWord = cipherRows[r] || '';
                    return (
                      <div key={r} className="grid grid-cols-5 gap-2">
                        {Array.from({ length: 5 }, (_, c) => {
                          const letter = rowWord[c] || '';
                          return (
                            <div
                              key={c}
                              className={`flex aspect-square items-center justify-center rounded-xl border font-display text-xl font-bold ${
                                rowWord ? scoreCipherTile(rowWord, c) : 'border-white/[0.08] bg-[#060811] text-slate-600'
                              }`}
                            >
                              {letter}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleCipherSubmit} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={5}
                    disabled={Boolean(finished)}
                    value={guess}
                    onChange={(e) => setGuess(e.target.value.toUpperCase())}
                    placeholder="5-LETTER WORD"
                    className="flex-1 rounded-xl border border-slate-700 bg-[#060811] px-4 py-3 font-mono text-sm uppercase tracking-widest text-white focus:border-[#8B5CF6] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={Boolean(finished)}
                    className="rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                  >
                    Guess
                  </button>
                </form>
              </>
            )}

            {feedback && (
              <p className="rounded-xl border border-white/[0.06] bg-[#060811] px-3.5 py-2 text-xs text-slate-300">
                {feedback}
              </p>
            )}

            {finished && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" /> {finished.text}
                  </p>
                  {rewardBanner && (
                    <p className="font-mono text-xs text-slate-300">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => startNewBattle(subMode)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#F97316]" /> Rules & Scoring
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
              <li>• Cipher Colors: Emerald = exact spot, Orange = wrong spot, Slate = absent.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Word Battles</h3>
            {wordHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Play a Scramble or Cipher duel to record results.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {wordHistory.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#F97316]">+{m.scoreDelta}</span>
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
