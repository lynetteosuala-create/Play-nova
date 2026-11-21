import React, { useEffect, useState } from 'react';
import {
  Activity,
  Database,
  Globe,
  KeyRound,
  Link2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Shield,
  Users,
  Wifi,
} from 'lucide-react';
import type { AdminOverviewData } from '../types.ts';
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
      <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-12 text-center text-sm text-slate-400">
        Verifying administrator credentials...
      </div>
    );
  }

  if (!status?.authenticated || !overview) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-white/[0.1] bg-[#10141F] p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E11D48]/40 bg-[#E11D48]/15 text-[#E11D48]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Owner Admin Console</h1>
            <p className="text-xs text-slate-400">
              {status?.configured
                ? 'Private administrator authentication required'
                : 'Initialize owner passkey (stored securely with scrypt)'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSetupOrLogin} className="mt-6 space-y-4">
          <div>
            <label htmlFor="gv-admin-passkey" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              {status?.configured ? 'Administrator Passkey' : 'Create Owner Passkey (8+ characters)'}
            </label>
            <div className="relative mt-2">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                id="gv-admin-passkey"
                type="password"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                required
                minLength={8}
                placeholder="Enter private owner passkey"
                className="w-full rounded-lg border border-white/[0.1] bg-[#07090F] py-2.5 pl-9 pr-3 text-sm text-white focus:border-[#E11D48] focus:outline-none"
              />
            </div>
            {status?.envManaged && (
              <p className="mt-2 text-xs text-slate-400">
                Passkey is managed via <code className="font-mono text-[#F59E0B]">ADMIN_PASSKEY</code> environment variable.
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
            className="w-full rounded-lg bg-[#E11D48] py-2.5 text-sm font-semibold text-white transition hover:bg-[#BE123C] cursor-pointer"
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
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#E11D48]">Private Owner Operations</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-white">GAMEVERSE Admin Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#10141F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/[0.06] cursor-pointer"
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
          { label: 'Matches Played', val: overview.stats.totalMatches, sub: 'All 3 games', icon: Shield },
          { label: 'Link Previews', val: overview.stats.totalLinkPreviews, sub: `${overview.stats.failedLinkPreviews} fallback/err`, icon: Link2 },
          { label: 'SQLite DB', val: `${Math.round(overview.stats.dbSizeBytes / 1024)} KB`, sub: `Up ${overview.stats.uptimeSec}s · ${overview.stats.walMode}`, icon: Database },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-white/[0.08] bg-[#10141F] p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{card.label}</span>
              <card.icon className="h-3.5 w-3.5 text-[#E11D48]" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">{card.val}</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Live Multiplayer Rooms */}
      <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">Live Multiplayer Rooms</h2>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {overview.liveRooms.length} rooms
          </span>
        </div>
        {overview.liveRooms.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No active multiplayer rooms right now.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] text-slate-400 font-mono uppercase">
                <tr>
                  <th className="py-2.5 pr-4">Code</th>
                  <th className="py-2.5 pr-4">Game</th>
                  <th className="py-2.5 pr-4">Mode</th>
                  <th className="py-2.5 pr-4">Host</th>
                  <th className="py-2.5 pr-4">Roster</th>
                  <th className="py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {overview.liveRooms.map((r) => (
                  <tr key={r.id} className="text-slate-300">
                    <td className="py-2.5 pr-4 font-mono font-bold text-[#F59E0B]">{r.code}</td>
                    <td className="py-2.5 pr-4 capitalize text-white">{r.gameId.replace('_', ' ')}</td>
                    <td className="py-2.5 pr-4 font-mono">
                      {r.mode === 'mixed' ? 'Mixed (AI + Humans)' : 'vs Humans'}
                      {r.isPrivate ? ' · Private' : ''}
                    </td>
                    <td className="py-2.5 pr-4">{r.hostUsername}</td>
                    <td className="py-2.5 pr-4 font-mono tabular-nums">
                      {r.humanCount} Human · {r.aiCount} AI / {r.maxSeats}
                    </td>
                    <td className="py-2.5 text-right font-mono uppercase text-emerald-400">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Players & Leaderboard Reset */}
      <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
        <h2 className="font-display text-lg font-bold text-white">Player Profiles & Score Controls</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] text-slate-400 font-mono uppercase">
              <tr>
                <th className="py-2.5 pr-4">Username</th>
                <th className="py-2.5 pr-4">Last Seen</th>
                <th className="py-2.5 pr-4 text-right">Coins</th>
                <th className="py-2.5 pr-4 text-right">Level / Pts</th>
                <th className="py-2.5 pr-4 text-right">Matches</th>
                <th className="py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {overview.players.map((p) => (
                <tr key={p.id} className="text-slate-300">
                  <td className="py-3 pr-4 font-semibold text-white">{p.username}</td>
                  <td className="py-3 pr-4 font-mono text-slate-400">
                    {new Date(p.lastSeenAt).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-[#F59E0B] tabular-nums">{p.coins}c</td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">
                    L{p.level} · {p.points} pts
                  </td>
                  <td className="py-3 pr-4 text-right font-mono tabular-nums">{p.totalMatches}</td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void resetPlayerLeaderboard(p.id, p.username)}
                      className="inline-flex items-center gap-1 rounded border border-rose-500/30 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-950/50 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset Score
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
        <h2 className="font-display text-lg font-bold text-white">Active Player Sessions</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.08] text-slate-400 font-mono uppercase">
              <tr>
                <th className="py-2 pr-4">Player</th>
                <th className="py-2 pr-4">Session ID</th>
                <th className="py-2 pr-4">Last Active</th>
                <th className="py-2 text-right">Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {overview.sessions.map((s) => (
                <tr key={s.id} className="text-slate-300">
                  <td className="py-2.5 pr-4 font-semibold text-white">{s.username}</td>
                  <td className="py-2.5 pr-4 font-mono text-slate-400">{s.id.slice(0, 10)}…</td>
                  <td className="py-2.5 pr-4 font-mono text-slate-400">
                    {new Date(s.lastActiveAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => void revokeSession(s.id)}
                      className="rounded border border-white/[0.12] px-2.5 py-1 text-[11px] text-rose-300 hover:border-rose-500/50 cursor-pointer"
                    >
                      Revoke Session
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Challenge & Reward Configuration */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">Challenge Configurator</h2>
          {overview.challenges.map((c, idx) => (
            <div key={c.id} className="rounded-lg border border-white/[0.08] bg-[#0B0E17] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={c.title}
                  onChange={(e) => {
                    const next = [...overview.challenges];
                    next[idx] = { ...c, title: e.target.value };
                    setOverview({ ...overview, challenges: next });
                  }}
                  className="flex-1 rounded border border-white/[0.1] bg-[#07090F] px-2.5 py-1 text-xs font-semibold text-white"
                />
                <button
                  type="button"
                  onClick={() => void saveChallenge(overview.challenges[idx])}
                  className="rounded bg-[#E11D48] px-3 py-1 text-xs font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
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
                    className="mt-1 w-full rounded border border-white/[0.1] bg-[#07090F] px-2 py-1 text-white"
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
                    className="mt-1 w-full rounded border border-white/[0.1] bg-[#07090F] px-2 py-1 text-white"
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
                    className="mt-1 w-full rounded border border-white/[0.1] bg-[#07090F] px-2 py-1 text-white"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">Cosmetic Reward Costs</h2>
          {overview.rewards.map((r, idx) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/[0.08] bg-[#0B0E17] p-3">
              <input
                type="text"
                value={r.name}
                onChange={(e) => {
                  const next = [...overview.rewards];
                  next[idx] = { ...r, name: e.target.value };
                  setOverview({ ...overview, rewards: next });
                }}
                className="flex-1 rounded border border-white/[0.1] bg-[#07090F] px-2.5 py-1.5 text-xs text-white"
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
                className="w-24 rounded border border-white/[0.1] bg-[#07090F] px-2.5 py-1.5 text-xs font-mono text-[#F59E0B]"
              />
              <button
                type="button"
                onClick={() => void saveReward(overview.rewards[idx])}
                className="rounded bg-[#F59E0B] px-3 py-1.5 text-xs font-semibold text-[#07090F] cursor-pointer"
              >
                Update
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Link Preview Monitoring & Server Error Logs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
          <h2 className="font-display text-lg font-bold text-white">Link Preview Monitoring Logs</h2>
          <div className="mt-4 max-h-72 overflow-y-auto space-y-2 text-xs">
            {overview.linkPreviewLogs.length === 0 ? (
              <p className="text-slate-400">No link preview lookups logged yet.</p>
            ) : (
              overview.linkPreviewLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-white/[0.06] bg-[#0B0E17] p-3">
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

        <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
          <h2 className="font-display text-lg font-bold text-white">Server Error & Security Logs</h2>
          <div className="mt-4 max-h-72 overflow-y-auto space-y-2 text-xs">
            {overview.errorLogs.length === 0 ? (
              <p className="text-slate-400">No server warnings or errors recorded.</p>
            ) : (
              overview.errorLogs.map((err) => (
                <div key={err.id} className="rounded-lg border border-white/[0.06] bg-[#0B0E17] p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono uppercase text-rose-400">{err.level} · {err.route}</span>
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
