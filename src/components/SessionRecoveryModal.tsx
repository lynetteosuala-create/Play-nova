import { useState, type FormEvent } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import type { PlayerProfile } from '../types.ts';
import { apiFetch, getStoredRecoveryKey, setStoredPlayerToken } from '../utils/api.ts';

interface SessionRecoveryModalProps {
  defaultUsername: string;
  message: string;
  onRecovered: (player: PlayerProfile, token: string) => void;
  onSignOutFully: () => void;
}

export function SessionRecoveryModal({
  defaultUsername,
  message,
  onRecovered,
  onSignOutFully,
}: SessionRecoveryModalProps) {
  const [username, setUsername] = useState(defaultUsername);
  const [recoveryKey, setRecoveryKey] = useState(() => getStoredRecoveryKey(defaultUsername) || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; token: string; player: PlayerProfile }>(
        '/api/players/recover',
        {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), recoveryKey: recoveryKey.trim() }),
        },
        { suppressSessionEvent: true }
      );
      setStoredPlayerToken(res.token);
      onRecovered(res.player, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-[#10141F] p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
          <Lock className="h-4 w-4" />
          Session Expired — Progress Preserved
        </div>
        <h2 className="mt-2 font-display text-xl font-bold text-white">Restore Your Player Session</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
          {message} Enter your Progress Save Key to resume as <strong>{defaultUsername}</strong>, or start a fresh username session.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full rounded-xl border border-slate-700 bg-[#07090F] px-3.5 py-2.5 text-sm text-white"
          />
          <input
            type="text"
            required
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
            placeholder="Progress Save Key (GV-XXXXXXXX)"
            className="w-full rounded-xl border border-slate-700 bg-[#07090F] px-3.5 py-2.5 font-mono text-sm text-white"
          />

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              {busy ? 'Restoring...' : 'Resume Session'}
            </button>
            <button
              type="button"
              onClick={onSignOutFully}
              className="rounded-xl border border-slate-700 px-3.5 py-2.5 text-xs text-slate-300 hover:text-white cursor-pointer"
            >
              New Username
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
