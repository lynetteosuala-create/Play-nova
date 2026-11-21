import React, { useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Coins,
  Database,
  Gamepad2,
  Globe,
  KeyRound,
  Link2,
  LogOut,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  Trash2,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react';
import { GAME_CATALOG } from '../game/catalog.ts';
import type { AdminOverviewData, GameId } from '../types.ts';
import { adminFetch, setStoredAdminToken } from '../utils/api.ts';

interface AdminStatus {
  configured: boolean;
  envManaged: boolean;
  authenticated: boolean;
}

export function AdminDashboard() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [passkey, setPasskey] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Coin grant per player
  const [coinTargetId, setCoinTargetId] = useState<string | null>(null);
  const [coinDelta, setCoinDelta] = useState<number>(100);
  const [coinReason, setCoinReason] = useState<string>('PLAYNOVA Event Bonus');

  // Announcement composer
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annLevel, setAnnLevel] = useState<'info' | 'event' | 'alert'>('event');

  // Tournament composer
  const [tourTitle, setTourTitle] = useState('');
  const [tourGame, setTourGame] = useState<GameId>('chess');
  const [tourMaxPlayers, setTourMaxPlayers] = useState<4 | 8>(4);
  const [tourPrize, setTourPrize] = useState(350);

  async function refreshAll() {
    setLoading(true);
    try {
      const st = await adminFetch<AdminStatus>('/api/admin/status');
      setStatus(st);
      if (st.authenticated) {
        const data = await adminFetch<AdminOverviewData>('/api/admin/overview');
        setOverview(data);
      } else {
        setOverview(null);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to reach admin status.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function handleSetupOrLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const endpoint = status?.configured ? '/api/admin/login' : '/api/admin/setup';
      const res = await adminFetch<{ ok: boolean; adminToken?: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ passkey }),
      });
      if (res.adminToken) setStoredAdminToken(res.adminToken);
      setPasskey('');
      await refreshAll();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication rejected.');
    }
  }

  async function handleAdminLogout() {
    await adminFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    setStoredAdminToken(null);
    setOverview(null);
    await refreshAll();
  }

  async function revokeSession(id: string) {
    setActionNotice(null);
    await adminFetch(`/api/admin/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setActionNotice('Player session terminated.');
    await refreshAll();
  }

  async function resetPlayerLeaderboard(playerId: string, username: string) {
    setActionNotice(null);
    await adminFetch(`/api/admin/leaderboard/${encodeURIComponent(playerId)}`, { method: 'DELETE' });
    setActionNotice(`Reset match history and leaderboard points for ${username}.`);
    await refreshAll();
  }

  async function handleAdjustCoins(playerId: string, username: string) {
    setActionNotice(null);
    await adminFetch(`/api/admin/players/${encodeURIComponent(playerId)}/coins`, {
      method: 'POST',
      body: JSON.stringify({ amount: coinDelta, reason: coinReason }),
    });
    setActionNotice(`Updated Virtual Coins (${coinDelta >= 0 ? `+${coinDelta}` : coinDelta}) for ${username}.`);
    setCoinTargetId(null);
    await refreshAll();
  }

  async function handleToggleBan(playerId: string, username: string, nextBanned: boolean) {
    setActionNotice(null);
    await adminFetch(`/api/admin/players/${encodeURIComponent(playerId)}/moderate`, {
      method: 'PATCH',
      body: JSON.stringify({ banned: nextBanned }),
    });
    setActionNotice(nextBanned ? `Suspended ${username}.` : `Restored ${username}.`);
    await refreshAll();
  }

  async function handleCreateAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setActionNotice(null);
    await adminFetch('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ title: annTitle, message: annMessage, level: annLevel }),
    });
    setAnnTitle('');
    setAnnMessage('');
    setActionNotice('Platform announcement published to all active players.');
    await refreshAll();
  }

  async function handleDeleteAnnouncement(id: string) {
    setActionNotice(null);
    await adminFetch(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setActionNotice('Announcement removed.');
    await refreshAll();
  }

  async function handleCreateTournament(e: React.FormEvent) {
    e.preventDefault();
    setActionNotice(null);
    await adminFetch('/api/admin/tournaments', {
      method: 'POST',
      body: JSON.stringify({
        title: tourTitle,
        gameId: tourGame,
        competitionType: 'scheduled',
        maxPlayers: tourMaxPlayers,
        prizeCoins: tourPrize,
      }),
    });
    setTourTitle('');
    setActionNotice('Scheduled tournament created.');
    await refreshAll();
  }

  async function handleStartTournament(id: string) {
    setActionNotice(null);
    try {
      await adminFetch(`/api/admin/tournaments/${encodeURIComponent(id)}/start`, { method: 'POST' });
      setActionNotice('Tournament bracket activated.');
      await refreshAll();
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Unable to start tournament.');
    }
  }

  async function handleDeleteTournament(id: string) {
    setActionNotice(null);
    await adminFetch(`/api/admin/tournaments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setActionNotice('Tournament deleted.');
    await refreshAll();
  }

  async function saveChallenge(c: AdminOverviewData['challenges'][number]) {
    setActionNotice(null);
    await adminFetch(`/api/admin/challenges/${encodeURIComponent(c.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: c.title,
        targetCount: c.targetCount,
        xpReward: c.xpReward,
        coinReward: c.coinReward,
        active: c.active,
      }),
    });
    setActionNotice(`Saved challenge "${c.title}".`);
    await refreshAll();
  }

  async function saveReward(r: AdminOverviewData['rewards'][number]) {
    setActionNotice(null);
    await adminFetch(`/api/admin/rewards/${encodeURIComponent(r.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name: r.name, coinCost: r.coinCost }),
    });
    setActionNotice(`Updated reward "${r.name}".`);
    await refreshAll();
  }

  if (loading && !status) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-12 text-center text-sm text-slate-400">
        Verifying administrator credentials...
      </div>
    );
  }

  if (!status?.authenticated || !overview) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/[0.1] bg-[#0E1324] p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/15 text-[#8B5CF6]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">PLAYNOVA Owner Admin</h1>
            <p className="text-xs text-slate-400">
              {status?.configured
                ? 'Private administrator authentication required'
                : 'Initialize owner passkey (stored securely with scrypt)'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSetupOrLogin} className="mt-6 space-y-4">
          <div>
            <label htmlFor="pn-admin-passkey" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              {status?.configured ? 'Administrator Passkey' : 'Create Owner Passkey (8+ characters)'}
            </label>
            <div className="relative mt-2">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="pn-admin-passkey"
                type="password"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                required
                minLength={8}
                placeholder="Enter private owner passkey"
                className="w-full rounded-lg border border-white/[0.1] bg-[#060811] py-2.5 pl-9 pr-3 text-sm text-white focus:border-[#8B5CF6] focus:outline-none"
              />
            </div>
            {status?.envManaged && (
              <p className="mt-2 text-xs text-slate-400">
                Passkey is managed via <code className="font-mono text-[#F97316]">ADMIN_PASSKEY</code> environment variable.
              </p>
            )}
          </div>

          {authError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">
              {authError}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-[#8B5CF6] py-2.5 text-sm font-semibold text-white transition hover:bg-[#7C3AED] cursor-pointer"
          >
            {status?.configured ? 'Unlock Admin Console' : 'Initialize & Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#8B5CF6]">Private Owner Operations</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-white">PLAYNOVA Admin Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#0E1324] px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleAdminLogout()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/40 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" /> Lock Admin
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3.5 text-sm text-emerald-200">
          {actionNotice}
        </div>
      )}

      {/* System Telemetry */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Total Players', val: overview.stats.totalPlayers, sub: `${overview.stats.activeSessions} active sessions`, icon: Users },
          { label: 'Live WS Online', val: overview.stats.onlineConnections, sub: `${overview.stats.queuedPlayers} in queue`, icon: Wifi },
          { label: 'Active Rooms', val: overview.stats.activeRooms, sub: 'Human & Mixed', icon: Globe },
          { label: 'Matches Played', val: overview.stats.totalMatches, sub: `${overview.stats.totalTournaments} tournaments`, icon: Gamepad2 },
          { label: 'Link Previews', val: overview.stats.totalLinkPreviews, sub: `${overview.stats.failedLinkPreviews} fallback/err`, icon: Link2 },
          { label: 'SQLite DB', val: `${Math.round(overview.stats.dbSizeBytes / 1024)} KB`, sub: `Up ${overview.stats.uptimeSec}s · ${overview.stats.walMode}`, icon: Database },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{card.label}</span>
              <card.icon className="h-3.5 w-3.5 text-[#38BDF8]" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">{card.val}</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* 12-Game Analytics Breakdown */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
        <h2 className="font-display text-lg font-bold text-white">12-Game Arena Analytics</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {overview.gameBreakdown.map((gb) => {
            const meta = GAME_CATALOG.find((g) => g.id === gb.gameId);
            return (
              <div key={gb.gameId} className="rounded-xl border border-white/[0.06] bg-[#090D1A] p-3.5 text-xs">
                <p className="font-semibold text-white truncate">{meta?.name || gb.gameId}</p>
                <p className="mt-1 font-mono text-slate-400 tabular-nums">
                  {gb.matches} matches · <span className="text-emerald-400">{gb.wins} wins</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Player Management: Coins, Moderation & Leaderboard Reset */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-white">Player Management, Coins & Moderation</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] text-slate-400 font-mono uppercase">
              <tr>
                <th className="py-2.5 pr-4">Username</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5 pr-4 text-right">Coins</th>
                <th className="py-2.5 pr-4 text-right">Level / Pts</th>
                <th className="py-2.5 pr-4 text-right">Matches</th>
                <th className="py-2.5 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {overview.players.map((p) => (
                <React.Fragment key={p.id}>
                  <tr className="text-slate-300">
                    <td className="py-3 pr-4 font-semibold text-white">{p.username}</td>
                    <td className="py-3 pr-4 font-mono">
                      {p.banned ? (
                        <span className="text-rose-400 font-semibold">SUSPENDED</span>
                      ) : (
                        <span className="text-emerald-400">ACTIVE</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-[#F97316] tabular-nums">{p.coins}c</td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">
                      L{p.level} · {p.points} pts
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">{p.totalMatches}</td>
                    <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setCoinTargetId(coinTargetId === p.id ? null : p.id)}
                        className="inline-flex items-center gap-1 rounded border border-[#F97316]/40 px-2 py-1 text-[11px] font-semibold text-[#F97316] hover:bg-[#F97316]/15 cursor-pointer"
                      >
                        <Coins className="h-3 w-3" /> Coins
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleBan(p.id, p.username, !p.banned)}
                        className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                          p.banned
                            ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40'
                            : 'border-amber-500/40 text-amber-300 hover:bg-amber-950/40'
                        }`}
                      >
                        {p.banned ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                        {p.banned ? 'Unban' : 'Ban'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void resetPlayerLeaderboard(p.id, p.username)}
                        className="inline-flex items-center gap-1 rounded border border-rose-500/30 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-950/50 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" /> Reset
                      </button>
                    </td>
                  </tr>
                  {coinTargetId === p.id && (
                    <tr>
                      <td colSpan={6} className="bg-[#090D1A] px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-white">Adjust Coins for {p.username}:</span>
                          <input
                            type="number"
                            value={coinDelta}
                            onChange={(e) => setCoinDelta(Number(e.target.value))}
                            className="w-24 rounded border border-white/[0.12] bg-[#060811] px-2 py-1 font-mono text-white"
                          />
                          <input
                            type="text"
                            value={coinReason}
                            onChange={(e) => setCoinReason(e.target.value)}
                            placeholder="Reason"
                            className="flex-1 min-w-[160px] rounded border border-white/[0.12] bg-[#060811] px-2.5 py-1 text-white"
                          />
                          <button
                            type="button"
                            onClick={() => void handleAdjustCoins(p.id, p.username)}
                            className="rounded bg-[#F97316] px-3 py-1 font-bold text-[#060811] cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tournament Management & Platform Announcements */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#F97316]" />
            Tournament Management ({overview.tournaments.length})
          </h2>

          <form onSubmit={handleCreateTournament} className="rounded-xl border border-white/[0.08] bg-[#090D1A] p-4 space-y-3">
            <p className="text-xs font-semibold text-white">Create Official Scheduled Tournament</p>
            <input
              type="text"
              required
              minLength={4}
              value={tourTitle}
              onChange={(e) => setTourTitle(e.target.value)}
              placeholder="e.g. PLAYNOVA Grand Chess Open"
              className="w-full rounded-lg border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs text-white"
            />
            <div className="grid grid-cols-3 gap-2 text-xs">
              <select
                value={tourGame}
                onChange={(e) => setTourGame(e.target.value as GameId)}
                className="rounded-lg border border-white/[0.1] bg-[#060811] px-2 py-1.5 text-white"
              >
                {GAME_CATALOG.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <select
                value={tourMaxPlayers}
                onChange={(e) => setTourMaxPlayers(Number(e.target.value) === 8 ? 8 : 4)}
                className="rounded-lg border border-white/[0.1] bg-[#060811] px-2 py-1.5 text-white"
              >
                <option value={4}>4 Players</option>
                <option value={8}>8 Players</option>
              </select>
              <input
                type="number"
                min={50}
                max={5000}
                value={tourPrize}
                onChange={(e) => setTourPrize(Number(e.target.value) || 250)}
                className="rounded-lg border border-white/[0.1] bg-[#060811] px-2 py-1.5 font-mono text-[#F97316]"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#8B5CF6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Create Tournament
            </button>
          </form>

          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {overview.tournaments.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#090D1A] p-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{t.title}</p>
                  <p className="font-mono text-[10px] text-slate-400">
                    {t.status.toUpperCase()} · {t.participantCount}/{t.maxPlayers} · {t.prizeCoins}c prize
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.status === 'registration' && t.participantCount >= 2 && (
                    <button
                      type="button"
                      onClick={() => void handleStartTournament(t.id)}
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
                    >
                      <Play className="h-3 w-3" /> Start
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDeleteTournament(t.id)}
                    className="rounded border border-rose-500/30 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[#38BDF8]" />
            Platform Announcements
          </h2>

          <form onSubmit={handleCreateAnnouncement} className="rounded-xl border border-white/[0.08] bg-[#090D1A] p-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                required
                minLength={3}
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Announcement headline..."
                className="flex-1 rounded-lg border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs text-white"
              />
              <select
                value={annLevel}
                onChange={(e) => setAnnLevel(e.target.value as 'info' | 'event' | 'alert')}
                className="rounded-lg border border-white/[0.1] bg-[#060811] px-2.5 py-2 text-xs text-white"
              >
                <option value="event">Event</option>
                <option value="info">Info</option>
                <option value="alert">Alert</option>
              </select>
            </div>
            <textarea
              required
              minLength={5}
              rows={2}
              value={annMessage}
              onChange={(e) => setAnnMessage(e.target.value)}
              placeholder="Broadcast message to players..."
              className="w-full rounded-lg border border-white/[0.1] bg-[#060811] px-3 py-2 text-xs text-white"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#38BDF8] px-3.5 py-1.5 text-xs font-bold text-[#060811] hover:bg-[#0EA5E9] cursor-pointer"
            >
              Publish Broadcast
            </button>
          </form>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {overview.announcements.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#090D1A] p-3 text-xs">
                <div>
                  <span className="font-mono text-[10px] uppercase text-[#38BDF8]">{a.level}</span>
                  <p className="font-semibold text-white">{a.title}</p>
                  <p className="text-slate-400">{a.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeleteAnnouncement(a.id)}
                  className="text-slate-500 hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Multiplayer Rooms & Active Sessions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">Live Multiplayer Rooms</h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">{overview.liveRooms.length} rooms</span>
          </div>
          {overview.liveRooms.length === 0 ? (
            <p className="mt-3 text-xs text-slate-400">No active multiplayer rooms right now.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/[0.08] text-slate-400 font-mono uppercase">
                  <tr>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Game</th>
                    <th className="py-2 pr-3">Host</th>
                    <th className="py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {overview.liveRooms.map((r) => (
                    <tr key={r.id} className="text-slate-300">
                      <td className="py-2.5 pr-3 font-mono font-bold text-[#F97316]">{r.code}</td>
                      <td className="py-2.5 pr-3 capitalize text-white">{r.gameId.replace('_', ' ')}</td>
                      <td className="py-2.5 pr-3">{r.hostUsername}</td>
                      <td className="py-2.5 text-right font-mono uppercase text-emerald-400">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
          <h2 className="font-display text-lg font-bold text-white">Active Player Sessions</h2>
          <div className="mt-4 max-h-64 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] text-slate-400 font-mono uppercase">
                <tr>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">Last Active</th>
                  <th className="py-2 text-right">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {overview.sessions.map((s) => (
                  <tr key={s.id} className="text-slate-300">
                    <td className="py-2.5 pr-3 font-semibold text-white">{s.username}</td>
                    <td className="py-2.5 pr-3 font-mono text-slate-400">
                      {new Date(s.lastActiveAt).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => void revokeSession(s.id)}
                        className="rounded border border-white/[0.12] px-2.5 py-1 text-[11px] text-rose-300 hover:border-rose-500/50 cursor-pointer"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Challenge & Reward Configuration */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">Challenge Configurator</h2>
          {overview.challenges.map((c, idx) => (
            <div key={c.id} className="rounded-lg border border-white/[0.08] bg-[#090D1A] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={c.title}
                  onChange={(e) => {
                    const next = [...overview.challenges];
                    next[idx] = { ...c, title: e.target.value };
                    setOverview({ ...overview, challenges: next });
                  }}
                  className="flex-1 rounded border border-white/[0.1] bg-[#060811] px-2.5 py-1 text-xs font-semibold text-white"
                />
                <button
                  type="button"
                  onClick={() => void saveChallenge(overview.challenges[idx])}
                  className="rounded bg-[#8B5CF6] px-3 py-1 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Save
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <label className="text-slate-400">
                  Target
                  <input
                    type="number"
                    min={1}
                    value={c.targetCount}
                    onChange={(e) => {
                      const next = [...overview.challenges];
                      next[idx] = { ...c, targetCount: Number(e.target.value) };
                      setOverview({ ...overview, challenges: next });
                    }}
                    className="mt-1 w-full rounded border border-white/[0.1] bg-[#060811] px-2 py-1 text-white"
                  />
                </label>
                <label className="text-slate-400">
                  XP
                  <input
                    type="number"
                    min={10}
                    value={c.xpReward}
                    onChange={(e) => {
                      const next = [...overview.challenges];
                      next[idx] = { ...c, xpReward: Number(e.target.value) };
                      setOverview({ ...overview, challenges: next });
                    }}
                    className="mt-1 w-full rounded border border-white/[0.1] bg-[#060811] px-2 py-1 text-white"
                  />
                </label>
                <label className="text-slate-400">
                  Coins
                  <input
                    type="number"
                    min={5}
                    value={c.coinReward}
                    onChange={(e) => {
                      const next = [...overview.challenges];
                      next[idx] = { ...c, coinReward: Number(e.target.value) };
                      setOverview({ ...overview, challenges: next });
                    }}
                    className="mt-1 w-full rounded border border-white/[0.1] bg-[#060811] px-2 py-1 text-white"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">Cosmetic Frames & Themes</h2>
          {overview.rewards.map((r, idx) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-[#090D1A] p-3">
              <input
                type="text"
                value={r.name}
                onChange={(e) => {
                  const next = [...overview.rewards];
                  next[idx] = { ...r, name: e.target.value };
                  setOverview({ ...overview, rewards: next });
                }}
                className="flex-1 rounded border border-white/[0.1] bg-[#060811] px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="number"
                min={0}
                value={r.coinCost}
                onChange={(e) => {
                  const next = [...overview.rewards];
                  next[idx] = { ...r, coinCost: Number(e.target.value) };
                  setOverview({ ...overview, rewards: next });
                }}
                className="w-24 rounded border border-white/[0.1] bg-[#060811] px-2.5 py-1.5 text-xs font-mono text-[#F97316]"
              />
              <button
                type="button"
                onClick={() => void saveReward(overview.rewards[idx])}
                className="rounded bg-[#F97316] px-3 py-1.5 text-xs font-bold text-[#060811] cursor-pointer"
              >
                Update
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Link Preview Monitoring & Server Error Logs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
          <h2 className="font-display text-lg font-bold text-white">Link Preview Monitoring Logs</h2>
          <div className="mt-4 max-h-72 overflow-y-auto space-y-2 text-xs">
            {overview.linkPreviewLogs.length === 0 ? (
              <p className="text-slate-400">No link preview lookups logged yet.</p>
            ) : (
              overview.linkPreviewLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-white/[0.06] bg-[#090D1A] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono uppercase font-semibold ${
                        log.status === 'ok'
                          ? 'text-emerald-400'
                          : log.status === 'fallback'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {log.status} · {log.latencyMs}ms
                    </span>
                    <span className="font-mono text-slate-500">{log.username || 'Guest'}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-slate-300">{log.url}</p>
                  {log.fallbackReason && <p className="mt-0.5 text-rose-300">{log.fallbackReason}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
          <h2 className="font-display text-lg font-bold text-white">Server Error & Security Logs</h2>
          <div className="mt-4 max-h-72 overflow-y-auto space-y-2 text-xs">
            {overview.errorLogs.length === 0 ? (
              <p className="text-slate-400">No server warnings or errors recorded.</p>
            ) : (
              overview.errorLogs.map((err) => (
                <div key={err.id} className="rounded-lg border border-white/[0.06] bg-[#090D1A] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono uppercase text-rose-400">
                      {err.level} · {err.route}
                    </span>
                    <span className="font-mono text-slate-500">{new Date(err.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-1 text-slate-300">{err.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
