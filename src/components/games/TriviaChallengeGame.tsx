import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Clock, HelpCircle, Lightbulb, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { apiFetch } from '../../utils/api.ts';
import { soundFx } from '../../utils/sound.ts';

interface TriviaQuestion {
  topic: 'Gaming & Tech' | 'Science' | 'World Geography' | 'History' | 'Logic & Numbers';
  prompt: string;
  options: [string, string, string, string];
  answerIdx: number;
}

const TRIVIA_BANK: TriviaQuestion[] = [
  { topic: 'Gaming & Tech', prompt: 'Which strategy board game is considered solved for 7×6 first-player advantage with optimal play?', options: ['Chess', 'Connect Four', 'Go', 'Checkers 10×10'], answerIdx: 1 },
  { topic: 'Gaming & Tech', prompt: 'In HTTP web standards, which status code indicates a resource was successfully created?', options: ['200 OK', '201 Created', '204 Empty', '301 Moved'], answerIdx: 1 },
  { topic: 'Gaming & Tech', prompt: 'What does "ELO" measure in competitive online chess and ranked arenas?', options: ['Frames per second', 'Relative player skill rating', 'Server latency', 'Coin balance'], answerIdx: 1 },
  { topic: 'Gaming & Tech', prompt: 'How many total squares exist on a standard 8×8 tournament chessboard?', options: ['48', '56', '64', '81'], answerIdx: 2 },
  { topic: 'Science', prompt: 'Which planet in our solar system has the highest surface gravity aside from gas/ice giants?', options: ['Earth', 'Venus', 'Mars', 'Mercury'], answerIdx: 0 },
  { topic: 'Science', prompt: 'What is the chemical symbol for Tungsten?', options: ['Tg', 'Tu', 'W', 'Tn'], answerIdx: 2 },
  { topic: 'Science', prompt: 'Approximately how long does light take to travel from the Sun to Earth?', options: ['8 seconds', '8 minutes 20 seconds', '42 minutes', '2.5 hours'], answerIdx: 1 },
  { topic: 'Science', prompt: 'Which subatomic particle carries no net electric charge?', options: ['Proton', 'Electron', 'Neutron', 'Positron'], answerIdx: 2 },
  { topic: 'World Geography', prompt: 'Which country spans the most time zones when including overseas territories?', options: ['Russia', 'United States', 'France', 'Canada'], answerIdx: 2 },
  { topic: 'World Geography', prompt: 'What is the deepest known oceanic trench on Earth?', options: ['Tonga Trench', 'Java Trench', 'Mariana Trench', 'Puerto Rico Trench'], answerIdx: 2 },
  { topic: 'World Geography', prompt: 'Which strait separates Europe from Africa at its narrowest Mediterranean entrance?', options: ['Strait of Malacca', 'Strait of Gibraltar', 'Bering Strait', 'Bosporus'], answerIdx: 1 },
  { topic: 'History', prompt: 'In what year did the Apollo 11 mission first land astronauts on the Moon?', options: ['1965', '1969', '1971', '1973'], answerIdx: 1 },
  { topic: 'History', prompt: 'Which ancient mathematician wrote the foundational geometry treatise "Elements"?', options: ['Archimedes', 'Pythagoras', 'Euclid', 'Eratosthenes'], answerIdx: 2 },
  { topic: 'History', prompt: 'Who led the team that built the World Wide Web protocol HTTP/HTML at CERN in 1989–1991?', options: ['Vint Cerf', 'Tim Berners-Lee', 'Alan Turing', 'Grace Hopper'], answerIdx: 1 },
  { topic: 'Logic & Numbers', prompt: 'What is the only even prime number?', options: ['0', '2', '4', '6'], answerIdx: 1 },
  { topic: 'Logic & Numbers', prompt: 'In binary, what decimal value does 10110 equal?', options: ['18', '20', '22', '26'], answerIdx: 2 },
  { topic: 'Logic & Numbers', prompt: 'If 5 machines take 5 minutes to make 5 widgets, how long do 100 machines take to make 100 widgets?', options: ['1 minute', '5 minutes', '20 minutes', '100 minutes'], answerIdx: 1 },
  { topic: 'Logic & Numbers', prompt: 'What is the next number in the Fibonacci sequence: 1, 1, 2, 3, 5, 8, 13, ...?', options: ['18', '20', '21', '26'], answerIdx: 2 },
];

interface TriviaChallengeGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function TriviaChallengeGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: TriviaChallengeGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'trivia_challenge')!;
  const [topicFilter, setTopicFilter] = useState<'All' | TriviaQuestion['topic']>('All');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [deck, setDeck] = useState<TriviaQuestion[]>(() => [...TRIVIA_BANK].sort(() => Math.random() - 0.5).slice(0, 10));
  const [qIndex, setQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [hiddenOpts, setHiddenOpts] = useState<number[]>([]);
  const [lifelinesLeft, setLifelinesLeft] = useState(2);
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [finished, setFinished] = useState(false);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );
  const [startedAt, setStartedAt] = useState(Date.now());

  const triviaHistory = recentMatches.filter((m) => m.gameId === 'trivia_challenge');

  const startBlitz = (topic = topicFilter) => {
    soundFx.playClick();
    setTopicFilter(topic);
    const pool = topic === 'All' ? TRIVIA_BANK : TRIVIA_BANK.filter((q) => q.topic === topic);
    const extra = TRIVIA_BANK.filter((q) => q.topic !== topic);
    const combined = [...pool.sort(() => Math.random() - 0.5), ...extra.sort(() => Math.random() - 0.5)].slice(0, 10);
    setDeck(combined);
    setQIndex(0);
    setTimeLeft(15);
    setSelectedOpt(null);
    setHiddenOpts([]);
    setLifelinesLeft(2);
    setPlayerScore(0);
    setAiScore(0);
    setCorrectCount(0);
    setStreak(0);
    setFinished(false);
    setRewardBanner(null);
    setStartedAt(Date.now());
  };

  const finishBlitz = async (finalP: number, finalA: number, finalCorrect: number) => {
    setFinished(true);
    const outcome: 'win' | 'loss' | 'draw' = finalP > finalA ? 'win' : finalP < finalA ? 'loss' : 'draw';
    if (outcome === 'win') soundFx.playWin();
    else if (outcome === 'draw') soundFx.playDraw();
    else soundFx.playLoss();

    try {
      const res = await apiFetch<{
        rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player: PlayerProfile;
        newlyUnlocked: string[];
        completedChallenges: string[];
      }>('/api/games/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'trivia_challenge',
          mode: 'vs_ai',
          difficulty,
          outcome,
          opponentLabel: `Quizmaster AI (${difficulty})`,
          scoreDelta: finalP,
          durationSec: Math.max(8, Math.round((Date.now() - startedAt) / 1000)),
          summary: `${finalCorrect}/10 correct · ${finalP} vs ${finalA} AI`,
        }),
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // keep UI clean
    }
  };

  useEffect(() => {
    if (finished || selectedOpt !== null) return;
    if (timeLeft <= 0) {
      handleAnswer(-1);
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, finished, selectedOpt]);

  const handleAnswer = (optIdx: number) => {
    if (finished || selectedOpt !== null) return;
    setSelectedOpt(optIdx);
    const currentQ = deck[qIndex];
    const isCorrect = optIdx === currentQ.answerIdx;

    const nextStreak = isCorrect ? streak + 1 : 0;
    const pGain = isCorrect ? 20 + Math.min(15, nextStreak * 3) + Math.floor(timeLeft / 2) : 0;
    const aiAccuracy = difficulty === 'hard' ? 0.8 : difficulty === 'medium' ? 0.65 : 0.45;
    const aiGain = Math.random() < aiAccuracy ? 24 : 0;

    const nextP = playerScore + pGain;
    const nextA = aiScore + aiGain;
    const nextC = correctCount + (isCorrect ? 1 : 0);

    setStreak(nextStreak);
    setPlayerScore(nextP);
    setAiScore(nextA);
    setCorrectCount(nextC);
    if (isCorrect) soundFx.playSelect();
    else soundFx.playLoss();

    window.setTimeout(() => {
      if (qIndex >= deck.length - 1) {
        void finishBlitz(nextP, nextA, nextC);
      } else {
        setQIndex((i) => i + 1);
        setTimeLeft(15);
        setSelectedOpt(null);
        setHiddenOpts([]);
      }
    }, 950);
  };

  const useFiftyFifty = () => {
    if (lifelinesLeft <= 0 || selectedOpt !== null || hiddenOpts.length > 0 || finished) return;
    const wrong = [0, 1, 2, 3].filter((i) => i !== deck[qIndex].answerIdx).sort(() => Math.random() - 0.5);
    setHiddenOpts(wrong.slice(0, 2));
    setLifelinesLeft((l) => l - 1);
    soundFx.playSelect();
  };

  const q = deck[qIndex];

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
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Trivia Challenge</h1>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs text-slate-300">
          <span>Wins: {player.stats.byGame.trivia_challenge.wins}</span>
          <span>Points: {player.stats.byGame.trivia_challenge.points}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4">
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Gaming & Tech', 'Science', 'World Geography', 'History', 'Logic & Numbers'] as const).map(
                (topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => startBlitz(topic)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                      topicFilter === topic
                        ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                        : 'border-slate-700 bg-[#060811] text-slate-400 hover:text-white'
                    }`}
                  >
                    {topic}
                  </button>
                )
              )}
            </div>
            <div className="flex gap-1.5">
              {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDifficulty(d);
                    startBlitz(topicFilter);
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
            {!finished ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <span className="font-mono text-[#38BDF8]">
                    Question {qIndex + 1} / {deck.length} · {q.topic}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-white">
                    <Clock className="h-3.5 w-3.5 text-[#F97316]" /> {timeLeft}s
                  </span>
                  <span className="font-mono text-slate-200">
                    You {playerScore} — {aiScore} AI
                  </span>
                </div>

                <h2 className="font-display text-xl font-bold leading-snug text-white">{q.prompt}</h2>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {q.options.map((opt, idx) => {
                    const isHidden = hiddenOpts.includes(idx);
                    const isCorrect = selectedOpt !== null && idx === q.answerIdx;
                    const isWrongPick = selectedOpt === idx && idx !== q.answerIdx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isHidden || selectedOpt !== null}
                        onClick={() => handleAnswer(idx)}
                        className={`flex items-center justify-between gap-2 rounded-xl border p-4 text-left text-sm font-medium transition cursor-pointer ${
                          isHidden
                            ? 'opacity-20 border-slate-800 bg-[#060811]'
                            : isCorrect
                            ? 'border-emerald-400 bg-emerald-950/50 text-white'
                            : isWrongPick
                            ? 'border-rose-400 bg-rose-950/50 text-white'
                            : 'border-white/[0.1] bg-[#060811] text-slate-200 hover:border-[#8B5CF6]'
                        }`}
                      >
                        <span>
                          <span className="mr-2 font-mono text-xs text-slate-400">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          {opt}
                        </span>
                        {isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                        {isWrongPick && <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={lifelinesLeft <= 0 || selectedOpt !== null || hiddenOpts.length > 0}
                    onClick={useFiftyFifty}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#F97316]/40 bg-[#F97316]/10 px-3.5 py-2 text-xs font-semibold text-[#FDBA74] disabled:opacity-40 cursor-pointer"
                  >
                    <Lightbulb className="h-3.5 w-3.5" /> 50/50 Hint ({lifelinesLeft} left)
                  </button>
                  <span className="font-mono text-xs text-emerald-400">Streak: {streak}</span>
                </div>
              </>
            ) : (
              <div className="space-y-4 py-4 text-center">
                <Trophy className="mx-auto h-10 w-10 text-[#F97316]" />
                <h2 className="font-display text-2xl font-bold text-white">
                  {playerScore > aiScore
                    ? 'Trivia Blitz Victory!'
                    : playerScore === aiScore
                    ? 'Tie Match!'
                    : 'Quizmaster AI Wins'}
                </h2>
                <p className="text-sm text-slate-300">
                  Correct Answers: {correctCount}/10 · Score: {playerScore} vs {aiScore} AI
                </p>
                {rewardBanner && (
                  <p className="font-mono text-xs text-[#38BDF8]">
                    +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => startBlitz(topicFilter)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" /> Play Another 10 Questions
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-[#8B5CF6]" /> Blitz Rules
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Trivia Matches</h3>
            {triviaHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Complete a 10-question blitz to log your score.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {triviaHistory.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#8B5CF6]">+{m.scoreDelta}</span>
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
