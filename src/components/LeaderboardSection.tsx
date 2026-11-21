import { useEffect, useState } from 'react';
import { Award, Calendar, Flame, Medal, Trophy } from 'lucide-react';
import type { GameId, LeaderboardEntry } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

type GameFilter = 'all' | GameId;
type PeriodFilter = 'all' | 'weekly';

export function LeaderboardSection() {
  const [game, setGame] = useState<GameFilter>('all');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await apiFetch<{ leaderboard: LeaderboardEntry[] }>(
          `/api/leaderboard?game=${encodeURIComponent(game)}&period=${encodeURIComponent(period)}`
        );
        if (active) setEntries(res.leaderboard || []);
      } catch (err) {
        if (active) setErrorMsg(err instanceof Error ? err.message : 'Unable to load leaderboard.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [game, period]);

  const gameTabs: Array<{ id: GameFilter; label: string }> = [
    { id: 'all', label: 'All Games' },
    { id: 'tictactoe', label: 'Tic-Tac-Toe' },
    { id: 'rps', label: 'Rock-Paper-Scissors' },
    { id: 'guess_number', label: 'Guess the Number' },
  ];

  const topThree = entries.slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#F59E0B]">
            Verified Arena Standings
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">
            Global Leaderboard
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Rankings are computed directly from server-validated match results across Tic-Tac-Toe, Rock-Paper-Scissors, and Guess the Number.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#10141F] p-1">
          <button
            type="button"
            onClick={() => setPeriod('all')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              period === 'all' ? 'bg-[#E11D48] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            All-Time
          </button>
          <button
            type="button"
            onClick={() => setPeriod('weekly')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
              period === 'weekly' ? 'bg-[#E11D48] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            This Week
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {gameTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setGame(tab.id)}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition cursor-pointer ${
              game === tab.id
                ? 'border-[#E11D48] bg-[#E11D48]/15 text-white'
                : 'border-white/[0.08] bg-[#10141F] text-slate-400 hover:border-white/20 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {topThree.length > 0 && !loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {topThree.map((entry) => {
            const rankColor =
              entry.rank === 1 ? 'text-[#F59E0B]' : entry.rank === 2 ? 'text-slate-200' : 'text-amber-600';
            return (
              <div
                key={entry.playerId}
                className={`rounded-xl border p-5 ${
                  entry.isCurrentPlayer
                    ? 'border-[#E11D48]/60 bg-[#15121D]'
                    : 'border-white/[0.08] bg-[#10141F]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase ${rankColor}`}>
                    <Medal className="h-4 w-4" /> Rank #{entry.rank}
                  </span>
                  <span className="font-mono text-xs text-slate-400">LVL {entry.level}</span>
                </div>
                <div className="mt-4 flex items-center gap-3.5">
                  <PlayerAvatar
                    username={entry.username}
                    profilePictureUrl={entry.profilePictureUrl}
                    activeFrame={entry.activeFrame}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-bold text-white">
                      {entry.username}
                      {entry.isCurrentPlayer ? ' (You)' : ''}
                    </p>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-[#F59E0B] tabular-nums">
                      {entry.points.toLocaleString()} PTS
                    </p>
                    <p className="mt-1 text-xs text-slate-400 tabular-nums">
                      {entry.wins}W / {entry.played}G ({entry.winRate}% win rate)
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#10141F]">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading standings...</div>
        ) : errorMsg ? (
          <div className="py-16 text-center text-sm text-rose-300">{errorMsg}</div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No ranked players found for this filter yet. Play a match to claim #1.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[0.08] bg-[#0B0E17] text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Rank</th>
                  <th className="px-5 py-3.5">Player</th>
                  <th className="px-5 py-3.5 text-right">Level</th>
                  <th className="px-5 py-3.5 text-right">Wins / Played</th>
                  <th className="px-5 py-3.5 text-right">Win %</th>
                  <th className="px-5 py-3.5 text-right">Badges</th>
                  <th className="px-5 py-3.5 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {entries.map((row) => (
                  <tr
                    key={row.playerId}
                    className={
                      row.isCurrentPlayer ? 'bg-[#E11D48]/10' : 'transition hover:bg-white/[0.02]'
                    }
                  >
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-300 tabular-nums">
                      #{row.rank}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <PlayerAvatar
                          username={row.username}
                          profilePictureUrl={row.profilePictureUrl}
                          activeFrame={row.activeFrame}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold text-white">
                            {row.username}
                            {row.isCurrentPlayer && (
                              <span className="ml-2 font-mono text-[11px] text-[#E11D48]">YOU</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-3.5 w-3.5 text-[#E11D48]" />
                        {row.level}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300 tabular-nums">
                      {row.wins} / {row.played}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-emerald-400 tabular-nums">
                      {row.winRate}%
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Award className="h-3.5 w-3.5 text-[#F59E0B]" />
                        {row.achievementsCount}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-[#F59E0B] tabular-nums">
                      {row.points.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
