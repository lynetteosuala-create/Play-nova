import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { GAME_CATALOG, GUESS_PRESETS } from '../game/catalog.ts';
import { computeGuessProximity, recordLocalInstantMatch } from '../game/localArcadeEngine.ts';
import { useUniversalMatchmaking } from '../hooks/useUniversalMatchmaking.ts';
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../types.ts';
import { soundFx } from '../utils/sound.ts';
import { wsClient } from '../utils/wsClient.ts';
import { UniversalMatchBar } from './UniversalMatchBar.tsx';

interface GuessNumberGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onBack: () => void;
}

export function GuessNumberGame({
  player,
  recentMatches,
  onProgressUpdated,
  onBack,
}: GuessNumberGameProps) {
  const catalog = GAME_CATALOG[2];
  const mm = useUniversalMatchmaking('guess_number', { player });

  const makeVault = (presetKey: DifficultyLevel | 'daily') => {
    const preset = GUESS_PRESETS[presetKey];
    const secret = preset.min + Math.floor(Math.random() * (preset.max - preset.min + 1));
    return {
      min: preset.min,
      max: preset.max,
      maxAttempts: preset.maxAttempts,
      timeLimitSec: preset.timeLimitSec,
      isDaily: presetKey === 'daily',
      localSecret: secret,
      presetDifficulty: presetKey,
    };
  };

  const [selectedPreset, setSelectedPreset] = useState<DifficultyLevel | 'daily'>('medium');
  const [session, setSession] = useState(() => makeVault('medium'));
  const [guessInput, setGuessInput] = useState('');
  const [lowBound, setLowBound] = useState(1);
  const [highBound, setHighBound] = useState(100);
  const [timeLeft, setTimeLeft] = useState(GUESS_PRESETS.medium.timeLimitSec);
  const [guesses, setGuesses] = useState<Array<{ value: number; hint: 'higher' | 'lower' | 'correct' }>>([]);
  const [feedback, setFeedback] = useState<string | null>('Vault locked between 1 and 100. Submit your first guess.');
  const [proximity, setProximity] = useState<string | null>(null);
  const [finishedState, setFinishedState] = useState<{
    status: 'correct' | 'out_of_attempts' | 'timeout';
    secretNumber: number;
    rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isHuman = mm.matchPhase === 'human' && Boolean(mm.liveMatch?.guessState);
  const gServer = isHuman ? mm.liveMatch!.guessState! : null;
  const guessMatches = recentMatches.filter((m) => m.gameId === 'guess_number');

  const startRound = (presetKey: DifficultyLevel | 'daily' = selectedPreset) => {
    soundFx.playSelect();
    setSelectedPreset(presetKey);
    const next = makeVault(presetKey);
    setSession(next);
    setLowBound(next.min);
    setHighBound(next.max);
    setTimeLeft(next.timeLimitSec);
    setGuesses([]);
    setGuessInput('');
    setFeedback(`Vault locked between ${next.min} and ${next.max}. Submit your first guess.`);
    setProximity(null);
    setFinishedState(null);
    setError(null);
  };

  // Sync difficulty bar to preset
  useEffect(() => {
    if (!isHuman && selectedPreset !== 'daily' && mm.difficulty !== selectedPreset) {
      startRound(mm.difficulty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mm.difficulty]);

  useEffect(() => {
    if (isHuman || mm.matchPhase === 'searching' || finishedState) return;
    if (timeLeft <= 0) {
      const recorded = recordLocalInstantMatch(player, {
        gameId: 'guess_number',
        mode: session.isDaily ? 'daily_vault' : 'solo',
        difficulty: session.presetDifficulty === 'hard' ? 'hard' : session.presetDifficulty === 'easy' ? 'easy' : 'medium',
        outcome: 'loss',
        opponentLabel: 'Number Vault AI',
        scoreDelta: 10,
        durationSec: session.timeLimitSec,
        summary: `Timed out (${guesses.length}/${session.maxAttempts} guesses)`,
      });
      soundFx.playLoss();
      setFinishedState({ status: 'timeout', secretNumber: session.localSecret, rewards: recorded.rewards });
      onProgressUpdated(recorded.player, recorded.newlyUnlocked, recorded.completedChallenges);
      return;
    }
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHuman, mm.matchPhase, timeLeft, finishedState]);

  const handleGuessSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mm.matchPhase === 'searching') return;

    if (isHuman && gServer) {
      if (mm.liveMatch?.status === 'finished') return;
      const num = Number(guessInput);
      if (!Number.isInteger(num) || num < gServer.min || num > gServer.max) {
        setError(`Enter a whole number between ${gServer.min} and ${gServer.max}.`);
        return;
      }
      setError(null);
      soundFx.playSelect();
      wsClient.emit('guess:submit', { guess: num });
      setGuessInput('');
      return;
    }

    if (finishedState) return;
    const num = Number(guessInput);
    if (!Number.isInteger(num) || num < session.min || num > session.max) {
      setError(`Enter a whole number between ${session.min} and ${session.max}.`);
      return;
    }
    setError(null);
    soundFx.playClick();

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
        opponentLabel: 'Number Vault AI',
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
        opponentLabel: 'Number Vault AI',
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
      setFeedback(`TOO LOW — Secret number is HIGHER than ${num}.`);
      setProximity(computeGuessProximity(num, secret, session.min, session.max));
    } else {
      soundFx.playSelect();
      setHighBound((b) => Math.min(b, num - 1));
      setFeedback(`TOO HIGH — Secret number is LOWER than ${num}.`);
      setProximity(computeGuessProximity(num, secret, session.min, session.max));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Games
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">Guess the Number Vault</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Personal Best: {player.stats.byGame.guess_number.bestScore} pts</span>
          <span>Vaults Cracked: {player.stats.byGame.guess_number.wins}</span>
        </div>
      </div>

      <UniversalMatchBar
        matchPhase={mm.matchPhase}
        secondsLeft={mm.secondsLeft}
        difficulty={mm.difficulty}
        onChangeDifficulty={(d) => {
          mm.setDifficulty(d);
          startRound(d);
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
              <button
                type="button"
                onClick={() => startRound('daily')}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  selectedPreset === 'daily'
                    ? 'border-[#F97316] bg-[#F97316]/20 text-[#FDBA74]'
                    : 'border-white/[0.1] bg-[#060811] text-slate-300'
                }`}
              >
                Daily Vault
              </button>
              <button
                type="button"
                onClick={() => startRound(selectedPreset)}
                className="inline-flex items-center gap-1 rounded-xl border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> New Vault
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          {isHuman && gServer ? (
            <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <span className="text-[#38BDF8]">
                  Range: {gServer.min}–{gServer.max} · Max {gServer.maxAttempts} guesses
                </span>
                <span className="text-slate-300">
                  Your Tries: {mm.mySeat?.guessCount ?? 0} · {mm.opponentSeat?.username}: {mm.opponentSeat?.guessCount ?? 0}
                </span>
              </div>

              <form onSubmit={handleGuessSubmit} className="flex gap-2">
                <input
                  type="number"
                  min={gServer.min}
                  max={gServer.max}
                  disabled={mm.liveMatch?.status === 'finished'}
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder={`Crack secret ${gServer.min}–${gServer.max}...`}
                  className="flex-1 rounded-xl border border-slate-700 bg-[#07090F] px-4 py-3 font-mono text-lg text-white focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={mm.liveMatch?.status === 'finished'}
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                >
                  Guess
                </button>
              </form>

              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {gServer.feed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#07090F] px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-white">{item.username}: {item.guess}</span>
                    <span className="font-mono text-[#38BDF8] uppercase">
                      {item.clue} {item.proximity ? `(${item.proximity})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-4 font-mono text-sm">
                  <span className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${timeLeft <= 15 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    <Clock className="h-4 w-4" /> {timeLeft}s
                  </span>
                  <span className="text-slate-300 tabular-nums">
                    Attempts Left: <strong>{Math.max(0, session.maxAttempts - guesses.length)}</strong>/{session.maxAttempts}
                  </span>
                </div>
                <span className="font-mono text-xs text-[#F97316]">
                  Range {session.min}–{session.max}
                </span>
              </div>

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
                      width: `${Math.max(4, ((highBound - lowBound + 1) / (session.max - session.min + 1)) * 100)}%`,
                      marginLeft: `${((lowBound - session.min) / (session.max - session.min + 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>

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
                <form onSubmit={handleGuessSubmit} className="flex flex-wrap gap-3">
                  <input
                    type="number"
                    min={session.min}
                    max={session.max}
                    required
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    placeholder={`Enter ${lowBound}–${highBound}`}
                    className="min-w-[160px] flex-1 rounded-xl border border-slate-700 bg-[#07090F] px-4 py-3 font-mono text-lg text-white outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 cursor-pointer"
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
                    onClick={() => startRound(selectedPreset)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Play Again
                  </button>
                </div>
              )}

              {guesses.length > 0 && (
                <div className="flex flex-wrap gap-2">
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
                      #{idx + 1}: {g.value} ({g.hint === 'correct' ? 'MATCH' : g.hint === 'higher' ? 'Higher' : 'Lower'})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-5 space-y-2.5">
            <h3 className="font-display text-lg font-bold text-white">Vault Rules</h3>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#10141F] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Vault Runs</h3>
            {guessMatches.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400">Crack your first vault to establish your personal best score.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {guessMatches.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#07090F] px-3.5 py-2.5 text-xs"
                  >
                    <span className="truncate font-medium text-slate-200">{m.summary}</span>
                    <span className={`font-mono font-semibold shrink-0 ${m.outcome === 'win' ? 'text-emerald-400' : 'text-rose-400'}`}>
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
