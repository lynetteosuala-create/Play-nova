import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Calendar, CheckCircle2, Clock, Play, RotateCcw, Users } from 'lucide-react';
import { GAME_CATALOG, GUESS_PRESETS } from '../game/catalog.ts';
import { computeGuessProximity, recordLocalInstantMatch } from '../game/localArcadeEngine.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../types.ts';
import { apiFetch, getStoredPlayerToken } from '../utils/api.ts';
import { soundFx } from '../utils/sound.ts';

interface GuessNumberGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onOpenMultiplayer?: () => void;
  onBack: () => void;
}

export function GuessNumberGame({
  player,
  recentMatches,
  onProgressUpdated,
  onOpenMultiplayer,
  onBack,
}: GuessNumberGameProps) {
  const catalog = GAME_CATALOG[2];
  const [selectedPreset, setSelectedPreset] = useState<DifficultyLevel | 'daily'>('medium');
  const [session, setSession] = useState<{
    sessionId: string;
    min: number;
    max: number;
    maxAttempts: number;
    timeLimitSec: number;
    isDaily: boolean;
    localSecret?: number;
    presetDifficulty?: DifficultyLevel | 'daily';
  } | null>(null);

  const [guessInput, setGuessInput] = useState('');
  const [lowBound, setLowBound] = useState(1);
  const [highBound, setHighBound] = useState(100);
  const [timeLeft, setTimeLeft] = useState(75);
  const [guesses, setGuesses] = useState<Array<{ value: number; hint: 'higher' | 'lower' | 'correct' }>>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [proximity, setProximity] = useState<string | null>(null);
  const [finishedState, setFinishedState] = useState<{
    status: 'correct' | 'out_of_attempts' | 'timeout';
    secretNumber: number;
    rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const guessMatches = recentMatches.filter((m) => m.gameId === 'guess_number');

  // Countdown timer for active round
  useEffect(() => {
    if (!session || finishedState) return;
    if (timeLeft <= 0) {
      void submitTimeout();
      return;
    }
    const id = window.setTimeout(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, timeLeft, finishedState]);

  const submitTimeout = async () => {
    if (!session || finishedState) return;
    if (session.localSecret !== undefined) {
      const recorded = recordLocalInstantMatch(player, {
        gameId: 'guess_number',
        mode: session.isDaily ? 'daily_vault' : 'solo',
        difficulty: session.presetDifficulty === 'hard' ? 'hard' : session.presetDifficulty === 'easy' ? 'easy' : 'medium',
        outcome: 'loss',
        opponentLabel: 'Number Vault',
        scoreDelta: 10,
        durationSec: session.timeLimitSec,
        summary: `Timed out (${guesses.length}/${session.maxAttempts} guesses)`,
      });
      soundFx.playLoss();
      setFinishedState({ status: 'timeout', secretNumber: session.localSecret, rewards: recorded.rewards });
      onProgressUpdated(recorded.player, recorded.newlyUnlocked, recorded.completedChallenges);
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch<{
        status: 'timeout';
        secretNumber: number;
        rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player: PlayerProfile;
        newlyUnlocked: string[];
        completedChallenges: string[];
      }>(
        '/api/games/guess/attempt',
        {
          method: 'POST',
          body: JSON.stringify({ sessionId: session.sessionId, timedOut: true }),
        },
        { suppressSessionEvent: true }
      );
      soundFx.playLoss();
      setFinishedState({ status: 'timeout', secretNumber: res.secretNumber, rewards: res.rewards });
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // ignore duplicate timeout
    } finally {
      setBusy(false);
    }
  };

  const startRound = async (presetKey = selectedPreset) => {
    setError(null);
    soundFx.playSelect();

    const startLocalRound = () => {
      const preset = GUESS_PRESETS[presetKey];
      const secret = preset.min + Math.floor(Math.random() * (preset.max - preset.min + 1));
      setSession({
        sessionId: `local_guess_${Date.now().toString(36)}`,
        min: preset.min,
        max: preset.max,
        maxAttempts: preset.maxAttempts,
        timeLimitSec: preset.timeLimitSec,
        isDaily: presetKey === 'daily',
        localSecret: secret,
        presetDifficulty: presetKey,
      });
      setLowBound(preset.min);
      setHighBound(preset.max);
      setTimeLeft(preset.timeLimitSec);
      setGuesses([]);
      setGuessInput('');
      setFeedback(`Vault locked between ${preset.min} and ${preset.max}. Submit your first guess.`);
      setProximity(null);
      setFinishedState(null);
    };

    const hasServerSession = Boolean(getStoredPlayerToken()) && !player.id.startsWith('local-');
    if (!hasServerSession) {
      startLocalRound();
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        sessionId: string;
        min: number;
        max: number;
        maxAttempts: number;
        timeLimitSec: number;
        isDaily: boolean;
      }>(
        '/api/games/guess/start',
        {
          method: 'POST',
          body: JSON.stringify({ difficulty: presetKey }),
        },
        { suppressSessionEvent: true }
      );
      setSession({
        sessionId: res.sessionId,
        min: res.min,
        max: res.max,
        maxAttempts: res.maxAttempts,
        timeLimitSec: res.timeLimitSec,
        isDaily: res.isDaily,
      });
      setLowBound(res.min);
      setHighBound(res.max);
      setTimeLeft(res.timeLimitSec);
      setGuesses([]);
      setGuessInput('');
      setFeedback(`Vault locked between ${res.min} and ${res.max}. Submit your first guess.`);
      setProximity(null);
      setFinishedState(null);
    } catch {
      startLocalRound();
    } finally {
      setBusy(false);
    }
  };

  const handleGuessSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || finishedState || busy) return;
    const num = Number(guessInput);
    if (!Number.isInteger(num) || num < session.min || num > session.max) {
      setError(`Enter a whole number between ${session.min} and ${session.max}.`);
      return;
    }

    setError(null);
    soundFx.playClick();

    if (session.localSecret !== undefined) {
      const secret = session.localSecret;
      const hint: 'higher' | 'lower' | 'correct' = num < secret ? 'higher' : num > secret ? 'lower' : 'correct';
      const nextGuesses = [...guesses, { value: num, hint }];
      setGuesses(nextGuesses);
      setGuessInput('');

      const diffLevel: DifficultyLevel =
        session.presetDifficulty === 'hard' ? 'hard' : session.presetDifficulty === 'easy' ? 'easy' : 'medium';

      if (hint === 'correct') {
        const efficiencyBonus = Math.max(1, session.maxAttempts - nextGuesses.length + 1) * 18;
        const recorded = recordLocalInstantMatch(player, {
          gameId: 'guess_number',
          mode: session.isDaily ? 'daily_vault' : 'solo',
          difficulty: diffLevel,
          outcome: 'win',
          opponentLabel: 'Number Vault',
          scoreDelta: 75 + efficiencyBonus + Math.round(timeLeft * 0.6),
          durationSec: Math.max(4, session.timeLimitSec - timeLeft),
          summary: `Cracked ${secret} in ${nextGuesses.length} guesses`,
        });
        soundFx.playWin();
        setFinishedState({ status: 'correct', secretNumber: secret, rewards: recorded.rewards });
        setFeedback(`Vault Cracked! Secret number was ${secret}.`);
        setProximity(null);
        onProgressUpdated(recorded.player, recorded.newlyUnlocked, recorded.completedChallenges);
      } else if (nextGuesses.length >= session.maxAttempts) {
        const recorded = recordLocalInstantMatch(player, {
          gameId: 'guess_number',
          mode: session.isDaily ? 'daily_vault' : 'solo',
          difficulty: diffLevel,
          outcome: 'loss',
          opponentLabel: 'Number Vault',
          scoreDelta: 12,
          durationSec: Math.max(4, session.timeLimitSec - timeLeft),
          summary: `Out of attempts (secret was ${secret})`,
        });
        soundFx.playLoss();
        setFinishedState({ status: 'out_of_attempts', secretNumber: secret, rewards: recorded.rewards });
        setFeedback(`No attempts left. The secret number was ${secret}.`);
        setProximity(null);
        onProgressUpdated(recorded.player, recorded.newlyUnlocked, recorded.completedChallenges);
      } else if (hint === 'higher') {
        soundFx.playSelect();
        setLowBound((b) => Math.max(b, num + 1));
        setFeedback(`TOO LOW — The secret number is HIGHER than ${num}.`);
        setProximity(computeGuessProximity(num, secret, session.min, session.max));
      } else {
        soundFx.playSelect();
        setHighBound((b) => Math.min(b, num - 1));
        setFeedback(`TOO HIGH — The secret number is LOWER than ${num}.`);
        setProximity(computeGuessProximity(num, secret, session.min, session.max));
      }
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        status: 'higher' | 'lower' | 'correct' | 'out_of_attempts' | 'timeout';
        hint?: 'higher' | 'lower';
        proximity?: string;
        secretNumber?: number;
        guesses: Array<{ value: number; hint: 'higher' | 'lower' | 'correct' }>;
        attemptsRemaining: number;
        rewards?: { scoreDelta: number; xpEarned: number; coinsEarned: number };
        player?: PlayerProfile;
        newlyUnlocked?: string[];
        completedChallenges?: string[];
      }>(
        '/api/games/guess/attempt',
        {
          method: 'POST',
          body: JSON.stringify({ sessionId: session.sessionId, guess: num }),
        },
        { suppressSessionEvent: true }
      );

      setGuesses(res.guesses);
      setGuessInput('');

      if (res.status === 'correct' && res.secretNumber !== undefined && res.rewards) {
        soundFx.playWin();
        setFinishedState({ status: 'correct', secretNumber: res.secretNumber, rewards: res.rewards });
        setFeedback(`Vault Cracked! Secret number was ${res.secretNumber}.`);
        setProximity(null);
        if (res.player) onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
      } else if ((res.status === 'out_of_attempts' || res.status === 'timeout') && res.secretNumber !== undefined && res.rewards) {
        soundFx.playLoss();
        setFinishedState({ status: res.status, secretNumber: res.secretNumber, rewards: res.rewards });
        setFeedback(`No attempts left. The secret number was ${res.secretNumber}.`);
        setProximity(null);
        if (res.player) onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
      } else if (res.hint === 'higher') {
        soundFx.playSelect();
        setLowBound((b) => Math.max(b, num + 1));
        setFeedback(`TOO LOW — The secret number is HIGHER than ${num}.`);
        setProximity(res.proximity || null);
      } else if (res.hint === 'lower') {
        soundFx.playSelect();
        setHighBound((b) => Math.min(b, num - 1));
        setFeedback(`TOO HIGH — The secret number is LOWER than ${num}.`);
        setProximity(res.proximity || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to check guess.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Hub
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
            Guess the Number Vault
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Personal Best: {player.stats.byGame.guess_number.bestScore} pts</span>
          <span>Vaults Cracked: {player.stats.byGame.guess_number.wins}</span>
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 font-sans text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/40 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              Live Multiplayer / Mixed Race
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          {!session ? (
            <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Rules & Difficulty Presets</h2>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
                  {catalog.rules.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(GUESS_PRESETS) as Array<keyof typeof GUESS_PRESETS>).map((key) => {
                  const p = GUESS_PRESETS[key];
                  const active = selectedPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedPreset(key)}
                      className={`rounded-xl border p-4 text-left transition ${
                        active
                          ? 'border-emerald-500 bg-emerald-950/30'
                          : 'border-slate-700 bg-[#07090F] hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-white">{p.label}</span>
                        {key === 'daily' && <Calendar className="h-4 w-4 text-amber-400" />}
                      </div>
                      <p className="mt-1 font-mono text-xs text-slate-400">
                        {p.maxAttempts} attempts · {p.timeLimitSec}s timer
                      </p>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2.5 text-xs text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void startRound(selectedPreset)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                <Play className="h-4 w-4" />
                {busy ? 'Generating Secret Vault...' : 'Start Number Challenge'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-6 space-y-5">
              {/* Timer & Attempts */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-4 font-mono text-sm">
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${
                      timeLeft <= 15 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    <Clock className="h-4 w-4" /> {timeLeft}s
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    Attempts Left: <strong>{Math.max(0, session.maxAttempts - guesses.length)}</strong>/{session.maxAttempts}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSession(null)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                >
                  Change Difficulty
                </button>
              </div>

              {/* Active Range Telemetry */}
              <div className="rounded-xl border border-slate-800 bg-[#07090F] p-4">
                <div className="flex justify-between font-mono text-xs text-slate-400">
                  <span>Min Possible: <strong className="text-white">{lowBound}</strong></span>
                  <span>Target Window</span>
                  <span>Max Possible: <strong className="text-white">{highBound}</strong></span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.max(
                        4,
                        ((highBound - lowBound + 1) / (session.max - session.min + 1)) * 100
                      )}%`,
                      marginLeft: `${((lowBound - session.min) / (session.max - session.min + 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Clue Banner */}
              {feedback && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
                    finishedState?.status === 'correct'
                      ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
                      : finishedState
                      ? 'border-rose-500/50 bg-rose-950/40 text-rose-200'
                      : 'border-amber-500/40 bg-amber-950/30 text-amber-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {guesses[guesses.length - 1]?.hint === 'higher' && <ArrowUp className="h-4 w-4 text-amber-400" />}
                    {guesses[guesses.length - 1]?.hint === 'lower' && <ArrowDown className="h-4 w-4 text-sky-400" />}
                    {finishedState?.status === 'correct' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    {feedback}
                  </span>
                  {proximity && <span className="font-mono text-xs text-amber-300">{proximity}</span>}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-xs text-rose-200">
                  {error}
                </div>
              )}

              {!finishedState ? (
                <form onSubmit={(e) => void handleGuessSubmit(e)} className="flex flex-wrap gap-3">
                  <input
                    type="number"
                    min={session.min}
                    max={session.max}
                    required
                    autoFocus
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    placeholder={`Enter ${lowBound}–${highBound}`}
                    className="min-w-[160px] flex-1 rounded-xl border border-slate-700 bg-[#07090F] px-4 py-3 font-mono text-lg text-white outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Submit Guess
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#07090F] p-4">
                  <div>
                    <p className="font-display text-lg font-bold text-white">
                      {finishedState.status === 'correct'
                        ? 'Vault Unlocked!'
                        : finishedState.status === 'timeout'
                        ? 'Time Expired'
                        : 'Out of Attempts'}
                    </p>
                    <p className="font-mono text-xs text-emerald-400">
                      +{finishedState.rewards.scoreDelta} Pts · +{finishedState.rewards.xpEarned} XP · +{finishedState.rewards.coinsEarned} Coins
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startRound(selectedPreset)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Play Again
                  </button>
                </div>
              )}

              {/* Guess Trail */}
              {guesses.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-400">Attempt Trail</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {guesses.map((g, idx) => (
                      <span
                        key={idx}
                        className={`rounded-lg border px-3 py-1 font-mono text-xs ${
                          g.hint === 'correct'
                            ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300'
                            : g.hint === 'higher'
                            ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
                            : 'border-sky-500/40 bg-sky-950/30 text-sky-200'
                        }`}
                      >
                        #{idx + 1}: {g.value} ({g.hint === 'correct' ? 'MATCH' : g.hint === 'higher' ? 'Go Higher' : 'Go Lower'})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Personal Bests & History */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Vault Runs</h3>
            {guessMatches.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">
                Crack your first vault to establish your personal best score.
              </p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {guessMatches.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#07090F] px-3.5 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium text-slate-200">{m.summary}</p>
                      <p className="text-[11px] text-slate-400 capitalize">
                        {m.difficulty} · {m.durationSec}s
                      </p>
                    </div>
                    <span
                      className={`font-mono font-semibold ${
                        m.outcome === 'win' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      +{m.scoreDelta} pts
                    </span>
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
