import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Clock, Lightbulb, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../../hooks/useUniversalMatchmaking.ts';
import type { MatchRecord, PlayerProfile } from '../../types.ts';
import { seededShuffle } from '../../utils/seededRandom.ts';
import { soundFx } from '../../utils/sound.ts';
import { UniversalMatchBar } from '../UniversalMatchBar.tsx';

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

function scrambleWordSeeded(word: string, seed: number): string {
  const arr = seededShuffle(word.split(''), seed);
  if (arr.join('') === word && arr.length > 1) {
    [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1], arr[0]];
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
  const mm = useUniversalMatchmaking('word_battle', { player });

  const [subMode, setSubMode] = useState<'scramble' | 'cipher'>('scramble');
  const deck = useMemo(() => seededShuffle(SCRAMBLE_BANK, mm.seed).slice(0, 5), [mm.seed]);
  const cipherSecret = useMemo(() => {
    const shuffled = seededShuffle(CIPHER_WORDS, mm.seed + 77);
    return shuffled[0];
  }, [mm.seed]);

  const [roundIdx, setRoundIdx] = useState(0);
  const [scrambled, setScrambled] = useState(() => scrambleWordSeeded(deck[0].word, mm.seed + 1));
  const [guess, setGuess] = useState('');
  const [revealedCount, setRevealedCount] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);
  const [cipherRows, setCipherRows] = useState<string[]>([]);

  const [finished, setFinished] = useState<{ outcome: 'win' | 'loss' | 'draw'; text: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [startedAt, setStartedAt] = useState(Date.now());

  const wordHistory = recentMatches.filter((m) => m.gameId === 'word_battle');
  const isHumanDuel = mm.matchPhase === 'human';

  const resetBattleState = useCallback(
    (nextDeck: Array<{ word: string; clue: string }>, seedVal: number) => {
      setRoundIdx(0);
      setScrambled(scrambleWordSeeded(nextDeck[0].word, seedVal + 1));
      setRevealedCount(0);
      setGuess('');
      setPlayerScore(0);
      setAiScore(0);
      setTimeLeft(25);
      setCipherRows([]);
      setFinished(null);
      setFeedback(null);
      setRewardBanner(null);
      setStartedAt(Date.now());
    },
    []
  );

  useEffect(() => {
    resetBattleState(deck, mm.seed);
  }, [deck, mm.seed, mm.matchPhase, resetBattleState]);

  const startNewBattle = (nextSubMode = subMode) => {
    soundFx.playClick();
    setSubMode(nextSubMode);
    if (isHumanDuel) {
      mm.rematchHuman();
    } else {
      mm.rotateLocalSeed();
    }
  };

  const finalizeMatch = async (pScore: number, aScore: number, summaryText: string) => {
    const outcome: 'win' | 'loss' | 'draw' = pScore > aScore ? 'win' : pScore < aScore ? 'loss' : 'draw';
    if (outcome === 'win') soundFx.playWin();
    else if (outcome === 'draw') soundFx.playDraw();
    else soundFx.playLoss();

    setFinished({ outcome, text: summaryText });

    if (isHumanDuel) {
      mm.sendDuelProgress({
        score: pScore,
        progress: subMode === 'scramble' ? 5 : cipherRows.length,
        maxProgress: subMode === 'scramble' ? 5 : 6,
        finished: true,
        summary: summaryText,
      });
      return;
    }

    try {
      const res = await completeSinglePlayerGame(player, {
        gameId: 'word_battle',
        mode: subMode,
        difficulty: mm.difficulty,
        outcome,
        opponentLabel: `Lexicon AI (${mm.difficulty})`,
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
    if (mm.matchPhase === 'searching' || subMode !== 'scramble' || finished) return;
    if (timeLeft <= 0) {
      const target = deck[roundIdx].word;
      const aiGain = mm.difficulty === 'hard' ? 40 : mm.difficulty === 'medium' ? 30 : 20;
      const nextAi = aiScore + aiGain;
      setAiScore(nextAi);
      setFeedback(`Time expired — Word was ${target}`);
      if (roundIdx >= 4) {
        void finalizeMatch(
          playerScore,
          nextAi,
          isHumanDuel ? `Scored ${playerScore} pts in 5-round Scramble` : `Word Scramble Duel finished ${playerScore}–${nextAi}`
        );
      } else {
        const nextIdx = roundIdx + 1;
        setRoundIdx(nextIdx);
        setScrambled(scrambleWordSeeded(deck[nextIdx].word, mm.seed + nextIdx + 10));
        setRevealedCount(0);
        setGuess('');
        setTimeLeft(25);
      }
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mm.matchPhase, subMode, finished, timeLeft]);

  const handleScrambleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (finished || mm.matchPhase === 'searching') return;
    const clean = guess.trim().toUpperCase();
    const target = deck[roundIdx].word;
    if (clean !== target) {
      soundFx.playLoss();
      setFeedback('Not quite — check the scrambled letters or reveal a hint!');
      return;
    }

    soundFx.playSelect();
    const roundPts = Math.max(15, 35 + timeLeft * 2 - revealedCount * 8);
    const aiGain = mm.difficulty === 'hard' ? 35 : mm.difficulty === 'medium' ? 24 : 14;
    const nextP = playerScore + roundPts;
    const nextA = aiScore + aiGain;
    setPlayerScore(nextP);
    setAiScore(nextA);
    setFeedback(`Solved ${target} (+${roundPts} pts)!`);

    if (isHumanDuel) {
      mm.sendDuelProgress({
        score: nextP,
        progress: roundIdx + 1,
        maxProgress: 5,
        finished: false,
        summary: `${roundIdx + 1}/5 words · ${nextP} pts`,
      });
    }

    if (roundIdx >= 4) {
      void finalizeMatch(
        nextP,
        nextA,
        isHumanDuel ? `5/5 Scrambles (${nextP} pts)` : `Solved 5/5 Scrambles (${nextP} vs ${nextA} AI)`
      );
    } else {
      const nextIdx = roundIdx + 1;
      setRoundIdx(nextIdx);
      setScrambled(scrambleWordSeeded(deck[nextIdx].word, mm.seed + nextIdx + 10));
      setRevealedCount(0);
      setGuess('');
      setTimeLeft(25);
    }
  };

  const handleCipherSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (finished || mm.matchPhase === 'searching') return;
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
      if (isHumanDuel) {
        mm.sendDuelProgress({
          score: nextRows.length * 10,
          progress: nextRows.length,
          maxProgress: 6,
          finished: false,
          summary: `Attempt ${nextRows.length}/6`,
        });
      }
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
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Games
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Word Battle</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.word_battle.wins}</span>
          <span>Points: {player.stats.byGame.word_battle.points}</span>
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
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setSubMode('scramble')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                subMode === 'scramble'
                  ? 'border-[#F97316] bg-[#F97316]/20 text-white'
                  : 'border-slate-700 bg-[#060811] text-slate-300'
              }`}
            >
              Scramble (5 Rounds)
            </button>
            <button
              type="button"
              onClick={() => setSubMode('cipher')}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                subMode === 'cipher'
                  ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                  : 'border-slate-700 bg-[#060811] text-slate-300'
              }`}
            >
              5-Letter Cipher
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5">
            {subMode === 'scramble' ? (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#38BDF8]">Round {roundIdx + 1} / 5</span>
                  <span className="inline-flex items-center gap-1 font-mono text-white tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-[#F97316]" /> {timeLeft}s
                  </span>
                  <span className="font-mono text-slate-300 tabular-nums">
                    {isHumanDuel ? `Score: ${playerScore}` : `You ${playerScore} — ${aiScore} AI`}
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
                    disabled={Boolean(finished) || mm.matchPhase === 'searching'}
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
                    disabled={Boolean(finished) || mm.matchPhase === 'searching'}
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
                    disabled={Boolean(finished) || mm.matchPhase === 'searching'}
                    value={guess}
                    onChange={(e) => setGuess(e.target.value.toUpperCase())}
                    placeholder="5-LETTER WORD"
                    className="flex-1 rounded-xl border border-slate-700 bg-[#060811] px-4 py-3 font-mono text-sm uppercase tracking-widest text-white focus:border-[#8B5CF6] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={Boolean(finished) || mm.matchPhase === 'searching'}
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
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#F97316] shrink-0">+{m.scoreDelta}</span>
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
