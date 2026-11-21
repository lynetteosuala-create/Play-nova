import { useEffect, useState } from 'react';
import { Award, Calendar, Flame, Medal, Trophy } from 'lucide-react';
import { GAME_CATALOG } from '../game/catalog.ts';
import type { GameId, LeaderboardEntry } from '../types.ts';
import { apiFetch } from '../utils/api.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

type GameFilter = 'all' | GameId;
type PeriodFilter = 'all' | 'monthly' | 'weekly';

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

  const topThree = entries.slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#F97316]">
            PLAYNOVA Global Standings
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-white">
            Global Leaderboard
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Rankings computed from server-verified match results across all 12 PLAYNOVA games.
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#0E1324] p-1">
          {(
            [
              { id: 'all', label: 'All-Time', icon: Trophy },
              { id: 'monthly', label: 'Monthly', icon: Calendar },
              { id: 'weekly', label: 'Weekly', icon: Flame },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                period === p.id ? 'bg-[#8B5CF6] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <p.icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Individual Game Filter Tabs (All Games + all 12 games) */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setGame('all')}
          className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
            game === 'all'
              ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
              : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
          }`}
        >
          All Games
        </button>
        {GAME_CATALOG.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGame(g.id)}
            className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
              game === g.id
                ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {topThree.length > 0 && !loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {topThree.map((entry) => {
            const rankColor =
              entry.rank === 1 ? 'text-[#F97316]' : entry.rank === 2 ? 'text-[#38BDF8]' : 'text-[#8B5CF6]';
            return (
              <div
                key={entry.playerId}
                className={`rounded-2xl border p-5 ${
                  entry.isCurrentPlayer
                    ? 'border-[#8B5CF6]/70 bg-[#15122B]'
                    : 'border-white/[0.08] bg-[#0E1324]'
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
                    <p className="mt-0.5 font-mono text-sm font-semibold text-[#F97316] tabular-nums">
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

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1324]">
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
              <thead className="border-b border-white/[0.08] bg-[#060811] text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                      row.isCurrentPlayer ? 'bg-[#8B5CF6]/15' : 'transition hover:bg-white/[0.02]'
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
                              <span className="ml-2 font-mono text-[11px] text-[#38BDF8]">YOU</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-300 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-3.5 w-3.5 text-[#8B5CF6]" />
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
                        <Award className="h-3.5 w-3.5 text-[#F97316]" />
                        {row.achievementsCount}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-bold text-[#F97316] tabular-nums">
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
