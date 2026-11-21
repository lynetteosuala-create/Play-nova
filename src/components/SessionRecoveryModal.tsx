import { useState, type FormEvent } from 'react';
import { Lock, Play, RefreshCw } from 'lucide-react';
import type { PlayerProfile } from '../types.ts';
import { apiFetch, getStoredRecoveryKey, setStoredPlayerToken, setStoredRecoveryKey } from '../utils/api.ts';

interface SessionRecoveryModalProps {
  message: string;
  onRecovered: (player: PlayerProfile, token: string) => void;
  onStartFreshGuest: () => void;
}

export function SessionRecoveryModal({
  message,
  onRecovered,
  onStartFreshGuest,
}: SessionRecoveryModalProps) {
  const [recoveryKey, setRecoveryKey] = useState(() => getStoredRecoveryKey() || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cleanKey = recoveryKey.trim().toUpperCase();
      const res = await apiFetch<{ ok: boolean; token: string; player: PlayerProfile }>(
        '/api/players/recover',
        {
          method: 'POST',
          body: JSON.stringify({ recoveryKey: cleanKey }),
        },
        { suppressSessionEvent: true }
      );
      setStoredPlayerToken(res.token);
      setStoredRecoveryKey(cleanKey);
      onRecovered(res.player, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore guest session.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060D]/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-[#8B5CF6]/40 bg-[#0E1324] p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-xs font-medium text-[#38BDF8]">
          <Lock className="h-4 w-4" />
          Guest Session Expired
        </div>
        <h2 className="mt-2 font-display text-xl font-bold text-white">Resume Your PLAYNOVA Session</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
          {message} Restore your saved progress with your optional Save Key, or launch a fresh anonymous guest session right away.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
          <input
            type="text"
            required
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
            placeholder="Optional Progress Save Key (PN-XXXXXXXX)"
            className="w-full rounded-xl border border-slate-700 bg-[#060811] px-3.5 py-2.5 font-mono text-sm text-white focus:border-[#8B5CF6] focus:outline-none"
          />

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="submit"
              disabled={busy || !recoveryKey.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#7C3AED] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              {busy ? 'Restoring...' : 'Restore Progress'}
            </button>
            <button
              type="button"
              onClick={onStartFreshGuest}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-3.5 py-2.5 text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/20 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" /> New Guest
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
