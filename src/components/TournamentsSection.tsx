import { useEffect, useState, type FormEvent } from 'react';
import {
  Bot,
  Calendar,
  Coins,
  Crown,
  Play,
  Plus,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { GAME_CATALOG } from '../game/catalog.ts';
import type { GameId, PlayerProfile, TournamentItem, TournamentMatchItem } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { soundFx } from '../utils/sound.ts';

interface TournamentsSectionProps {
  player: PlayerProfile | null;
  onRequirePlayer: (msg?: string) => void;
  onPlayerUpdated: (player: PlayerProfile) => void;
}

export function TournamentsSection({
  player,
  onRequirePlayer,
  onPlayerUpdated,
}: TournamentsSectionProps) {
  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'exhibition_demo'>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create tournament form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGame, setNewGame] = useState<GameId>('tictactoe');
  const [newMaxPlayers, setNewMaxPlayers] = useState<4 | 8>(4);
  const [newPrize, setNewPrize] = useState(250);

  // Interactive quick bracket duel modal
  const [activeDuel, setActiveDuel] = useState<{
    tournamentId: string;
    match: TournamentMatchItem;
    gameId: GameId;
  } | null>(null);
  const [duelTarget, setDuelTarget] = useState<number>(() => 40 + Math.floor(Math.random() * 60));
  const [duelPick, setDuelPick] = useState<number>(50);

  const loadTournaments = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ tournaments: TournamentItem[] }>('/api/tournaments');
      setTournaments(res.tournaments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tournaments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTournaments();
  }, [player?.id]);

  const handleRegister = async (tId: string) => {
    if (!player) {
      onRequirePlayer('Enter your PLAYNOVA username to register for a tournament.');
      return;
    }
    setBusyId(tId);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        player: PlayerProfile;
        tournaments: TournamentItem[];
      }>(`/api/tournaments/${encodeURIComponent(tId)}/register`, { method: 'POST' });
      soundFx.playWin();
      onPlayerUpdated(res.player);
      setTournaments(res.tournaments);
      setNotice('Registered in tournament bracket!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register.');
    } finally {
      setBusyId(null);
    }
  };

  const handleLaunchExhibition = async (gameId: GameId) => {
    if (!player) {
      onRequirePlayer('Enter a username to start a 4-seed Practice Exhibition Cup.');
      return;
    }
    setBusyId('launch_exh');
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        tournaments: TournamentItem[];
      }>('/api/tournaments/launch-exhibition', {
        method: 'POST',
        body: JSON.stringify({ gameId }),
      });
      soundFx.playSelect();
      setTournaments(res.tournaments);
      setNotice('Exhibition Demo Cup launched! Play your Round 1 match in the bracket below.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start exhibition cup.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateTournament = async (e: FormEvent) => {
    e.preventDefault();
    if (!player) {
      onRequirePlayer('Enter a username to host a community tournament.');
      return;
    }
    setBusyId('create');
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; tournaments: TournamentItem[] }>('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          gameId: newGame,
          maxPlayers: newMaxPlayers,
          prizeCoins: newPrize,
        }),
      });
      soundFx.playWin();
      setTournaments(res.tournaments);
      setNewTitle('');
      setShowCreate(false);
      setNotice('Scheduled player tournament created! You hold Seed #1.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament.');
    } finally {
      setBusyId(null);
    }
  };

  const resolveMatch = async (
    tournamentId: string,
    matchId: string,
    winnerSide: 'a' | 'b',
    scoreText: string
  ) => {
    setBusyId(matchId);
    setError(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        player: PlayerProfile;
        tournaments: TournamentItem[];
      }>(`/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ winnerSide, scoreText }),
      });
      soundFx.playWin();
      onPlayerUpdated(res.player);
      setTournaments(res.tournaments);
      setActiveDuel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record match outcome.');
    } finally {
      setBusyId(null);
    }
  };

  const playBracketDuelRound = async () => {
    if (!activeDuel || !player) return;
    const isPlayerA = activeDuel.match.playerAId === player.id;
    const playerDist = Math.abs(duelPick - duelTarget);
    const botPick = Math.max(1, Math.min(100, duelTarget + (Math.floor(Math.random() * 34) - 17)));
    const botDist = Math.abs(botPick - duelTarget);
    const playerWon = playerDist <= botDist;

    const winnerSide: 'a' | 'b' = playerWon ? (isPlayerA ? 'a' : 'b') : isPlayerA ? 'b' : 'a';
    const scoreText = `${player.username} (${duelPick}) vs ${botPick} · Target ${duelTarget}`;
    await resolveMatch(activeDuel.tournamentId, activeDuel.match.id, winnerSide, scoreText);
  };

  const filtered = tournaments.filter((t) => filter === 'all' || t.competitionType === filter);

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#F97316]">
            PLAYNOVA Competitions & Brackets
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">
            Tournaments & Championship Cups
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Register for scheduled real-player competitions or launch an instant 4-seed Exhibition Cup against clearly labeled Demo AI bots to test single-elimination bracket progression.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={busyId === 'launch_exh'}
            onClick={() => void handleLaunchExhibition('tictactoe')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-4 py-2.5 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/20 cursor-pointer"
          >
            <Bot className="h-4 w-4" /> Start Exhibition Bracket (vs Demo AI)
          </button>
          <button
            type="button"
            onClick={() => {
              if (!player) {
                onRequirePlayer('Enter a username to organize a scheduled tournament.');
                return;
              }
              setShowCreate((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Host Scheduled Cup
          </button>
        </div>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => void handleCreateTournament(e)}
          className="rounded-2xl border border-[#8B5CF6]/40 bg-[#0E1324] p-5 grid grid-cols-1 gap-4 md:grid-cols-4"
        >
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-300">Tournament Title</label>
            <input
              type="text"
              required
              minLength={4}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Friday Night Chess Invitational"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#060811] px-3.5 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300">Arena Game</label>
            <select
              value={newGame}
              onChange={(e) => setNewGame(e.target.value as GameId)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#060811] px-3 py-2.5 text-sm text-white"
            >
              {GAME_CATALOG.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-300">Bracket Size</label>
              <select
                value={newMaxPlayers}
                onChange={(e) => setNewMaxPlayers(Number(e.target.value) === 8 ? 8 : 4)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#060811] px-3 py-2.5 text-sm text-white"
              >
                <option value={4}>4 Players</option>
                <option value={8}>8 Players</option>
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-300">Purse</label>
              <input
                type="number"
                min={50}
                max={2000}
                value={newPrize}
                onChange={(e) => setNewPrize(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#060811] px-2.5 py-2.5 text-sm text-white"
              />
            </div>
            <button
              type="submit"
              disabled={busyId === 'create'}
              className="rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
            >
              Publish
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: 'All Competitions' },
            { id: 'scheduled', label: 'Scheduled Real-Player Cups' },
            { id: 'exhibition_demo', label: 'Exhibition AI Brackets (Demo)' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-xl border px-4 py-2 text-xs font-semibold cursor-pointer ${
              filter === tab.id
                ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs text-emerald-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] py-16 text-center text-sm text-slate-400">
          Loading PLAYNOVA brackets...
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((t) => {
            const gameMeta = GAME_CATALOG.find((g) => g.id === t.gameId);
            const isExhibition = t.competitionType === 'exhibition_demo';
            const rounds = Array.from(new Set(t.matches.map((m) => m.roundNumber))).sort((a, b) => a - b);

            return (
              <div
                key={t.id}
                className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span className={isExhibition ? 'text-[#38BDF8]' : 'text-[#F97316]'}>
                        {isExhibition ? 'EXHIBITION AI BRACKET (DEMO)' : 'SCHEDULED REAL-PLAYER COMPETITION'}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-300">{gameMeta?.name || t.gameId}</span>
                      <span className="text-slate-600">·</span>
                      <span className="uppercase text-emerald-400">{t.status}</span>
                    </div>
                    <h2 className="font-display text-xl font-bold text-white">{t.title}</h2>
                    <p className="max-w-2xl text-xs text-slate-400">{t.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-xl border border-white/[0.08] bg-[#060811] px-4 py-2 text-right font-mono text-xs">
                      <span className="block text-[10px] text-slate-400">Prize Purse</span>
                      <span className="inline-flex items-center gap-1 font-bold text-[#F97316]">
                        <Coins className="h-3.5 w-3.5" /> {t.prizeCoins} Virtual Coins
                      </span>
                    </div>

                    {t.status === 'registration' && (
                      <button
                        type="button"
                        disabled={t.isRegistered || busyId === t.id}
                        onClick={() => void handleRegister(t.id)}
                        className="rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#7C3AED] disabled:opacity-50 cursor-pointer"
                      >
                        {t.isRegistered
                          ? 'Registered'
                          : t.entryFeeCoins > 0
                          ? `Enter (${t.entryFeeCoins} Coins)`
                          : 'Join Free Bracket'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Participants */}
                <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1.5 font-mono text-slate-400">
                    <Users className="h-3.5 w-3.5" /> {t.participantCount}/{t.maxPlayers} Seeds
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-slate-400">
                    <Calendar className="h-3.5 w-3.5" /> {new Date(t.startsAt).toLocaleDateString()}
                  </span>
                  {t.winnerUsername && (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#F97316]">
                      <Crown className="h-3.5 w-3.5" /> Champion: {t.winnerUsername}
                    </span>
                  )}
                </div>

                {t.participants.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {t.participants.map((p) => (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                          p.eliminated
                            ? 'border-white/[0.04] bg-[#060811]/60 text-slate-500 line-through'
                            : 'border-white/[0.08] bg-[#060811] text-white'
                        }`}
                      >
                        <span className="truncate font-medium">
                          #{p.seed} {p.username}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {p.isAi ? 'AI' : 'PLAYER'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Interactive Single-Elimination Bracket Tree */}
                {rounds.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 pt-2">
                    {rounds.map((rNum) => {
                      const rMatches = t.matches.filter((m) => m.roundNumber === rNum);
                      const label =
                        rMatches.length === 1 && t.status !== 'registration' && rNum > 1
                          ? 'Championship Final'
                          : rNum === 1
                          ? 'Round 1'
                          : `Round ${rNum}`;
                      return (
                        <div key={rNum} className="space-y-2.5">
                          <p className="font-mono text-[11px] uppercase tracking-wider text-[#38BDF8]">
                            {label}
                          </p>
                          {rMatches.map((m) => {
                            const canPlay =
                              player &&
                              m.status === 'ready' &&
                              (m.playerAId === player.id || m.playerBId === player.id);
                            const isAiPairing =
                              m.status === 'ready' &&
                              m.playerAName.includes('(Demo AI)') &&
                              m.playerBName.includes('(Demo AI)');
                            return (
                              <div
                                key={m.id}
                                className="rounded-xl border border-white/[0.08] bg-[#060811] p-3.5 space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={
                                      m.winnerName === m.playerAName ? 'font-bold text-emerald-400' : 'text-slate-200'
                                    }
                                  >
                                    {m.playerAName}
                                  </span>
                                  {m.winnerName === m.playerAName && <Trophy className="h-3.5 w-3.5 text-[#F97316]" />}
                                </div>
                                <div className="flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                                  <span
                                    className={
                                      m.winnerName === m.playerBName ? 'font-bold text-emerald-400' : 'text-slate-200'
                                    }
                                  >
                                    {m.playerBName}
                                  </span>
                                  {m.winnerName === m.playerBName && <Trophy className="h-3.5 w-3.5 text-[#F97316]" />}
                                </div>

                                {m.scoreText && (
                                  <p className="font-mono text-[10px] text-slate-400">{m.scoreText}</p>
                                )}

                                {canPlay && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDuelTarget(20 + Math.floor(Math.random() * 65));
                                      setDuelPick(50);
                                      setActiveDuel({ tournamentId: t.id, match: m, gameId: t.gameId });
                                    }}
                                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#8B5CF6] py-1.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                                  >
                                    <Swords className="h-3.5 w-3.5" /> Play Bracket Match
                                  </button>
                                )}

                                {isAiPairing && player && (
                                  <button
                                    type="button"
                                    disabled={busyId === m.id}
                                    onClick={() =>
                                      void resolveMatch(
                                        t.id,
                                        m.id,
                                        Math.random() > 0.5 ? 'a' : 'b',
                                        'Simulated Demo AI Pairing'
                                      )
                                    }
                                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700 py-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                                  >
                                    <Play className="h-3 w-3" /> Resolve AI Pairing
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Tournament Tiebreak Duel Modal */}
      {activeDuel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060D]/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-[#8B5CF6]/40 bg-[#0E1324] p-6 space-y-4">
            <p className="font-mono text-xs uppercase tracking-wider text-[#38BDF8]">
              Live Bracket Match · Precision Cipher Clash
            </p>
            <h3 className="font-display text-xl font-bold text-white">
              {activeDuel.match.playerAName} vs {activeDuel.match.playerBName}
            </h3>
            <p className="text-xs text-slate-300">
              Lock in your precision tactical dial (1–100). Closest calibration to the hidden arena frequency advances to the next bracket round!
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-[#060811] p-4 space-y-3">
              <div className="flex justify-between font-mono text-xs text-slate-300">
                <span>Your Calibration</span>
                <span className="text-[#F97316] font-bold">{duelPick}</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                value={duelPick}
                onChange={(e) => setDuelPick(Number(e.target.value))}
                className="w-full accent-[#8B5CF6]"
              />
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={busyId === activeDuel.match.id}
                onClick={() => void playBracketDuelRound()}
                className="flex-1 rounded-xl bg-[#8B5CF6] py-2.5 text-xs font-bold text-white hover:bg-[#7C3AED] cursor-pointer"
              >
                Lock Move & Resolve Match
              </button>
              <button
                type="button"
                onClick={() => setActiveDuel(null)}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
