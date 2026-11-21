import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import type { PlayerProfile } from '../types.ts';
import {
  apiFetch,
  getStoredRecoveryKey,
  setStoredPlayerToken,
  setStoredRecoveryKey,
} from '../utils/api.ts';
import { soundFx } from '../utils/sound.ts';

interface UsernameEntryModalProps {
  onEntered: (player: PlayerProfile, token: string) => void;
  onClose?: () => void;
  initialPrompt?: string;
}

export function UsernameEntryModal({ onEntered, onClose, initialPrompt }: UsernameEntryModalProps) {
  const [showRestoreKey, setShowRestoreKey] = useState(false);
  const [username, setUsername] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [availability, setAvailability] = useState<{
    checking: boolean;
    valid: boolean;
    available: boolean;
    hasDeviceKey: boolean;
    reason?: string;
  }>({ checking: false, valid: false, available: false, hasDeviceKey: false });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live username check (also detects if this browser already holds a local save key for that name)
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      setAvailability({
        checking: false,
        valid: false,
        available: false,
        hasDeviceKey: false,
        reason: trimmed.length > 0 ? 'Enter at least 2 characters.' : undefined,
      });
      return;
    }

    const localKey = getStoredRecoveryKey(trimmed);
    let cancelled = false;
    setAvailability((prev) => ({ ...prev, checking: true }));
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetch<{ valid: boolean; available: boolean; reason?: string }>(
          `/api/players/check-username?username=${encodeURIComponent(trimmed)}`,
          {},
          { suppressSessionEvent: true }
        );
        if (!cancelled) {
          setAvailability({
            checking: false,
            valid: res.valid,
            available: res.available,
            hasDeviceKey: Boolean(localKey && !res.available),
            reason: res.reason,
          });
        }
      } catch {
        if (!cancelled) {
          setAvailability({
            checking: false,
            valid: true,
            available: true,
            hasDeviceKey: false,
            reason: 'Ready to validate on submit.',
          });
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username]);

  async function handleEnterSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedName = username.trim();
    if (trimmedName.length < 2) {
      setError('Please enter a username (2–24 characters).');
      return;
    }

    setBusy(true);
    try {
      const localKey = getStoredRecoveryKey(trimmedName);
      const effectiveKey = recoveryKey.trim() || (!availability.available && localKey ? localKey : '');

      if (showRestoreKey || effectiveKey) {
        const res = await apiFetch<{ ok: boolean; token: string; player: PlayerProfile }>(
          '/api/players/recover',
          {
            method: 'POST',
            body: JSON.stringify({
              username: trimmedName,
              recoveryKey: effectiveKey,
            }),
          },
          { suppressSessionEvent: true }
        );
        setStoredPlayerToken(res.token);
        setStoredRecoveryKey(res.player.username, effectiveKey.toUpperCase());
        soundFx.playWin();
        onEntered(res.player, res.token);
        return;
      }

      const res = await apiFetch<{
        ok: boolean;
        token: string;
        recoveryKey: string;
        player: PlayerProfile;
      }>(
        '/api/players/enter',
        {
          method: 'POST',
          body: JSON.stringify({ username: trimmedName }),
        },
        { suppressSessionEvent: true }
      );
      setStoredPlayerToken(res.token);
      setStoredRecoveryKey(res.player.username, res.recoveryKey);
      soundFx.playWin();
      onEntered(res.player, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enter PLAYNOVA.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060D]/85 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl border border-[#8B5CF6]/30 bg-[#0E1324] p-7 shadow-[0_24px_80px_rgba(139,92,246,0.22)]">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player entry"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="space-y-5">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.22em] text-[#38BDF8]">
              PLAYNOVA · ENTER. COMPETE. CONQUER.
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-bold text-white">
              What should we call you?
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {initialPrompt || 'Pick your arena username and jump straight in — no email or password required.'}
            </p>
          </div>

          <form onSubmit={(e) => void handleEnterSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="pn-entry-username" className="block text-xs font-medium text-slate-300">
                Username
              </label>
              <div className="relative mt-1.5">
                <UserCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="pn-entry-username"
                  type="text"
                  required
                  minLength={2}
                  maxLength={24}
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose your player name"
                  className="w-full rounded-xl border border-white/[0.12] bg-[#060811] py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:border-[#8B5CF6] focus:outline-none"
                />
                {!showRestoreKey && username.trim().length >= 2 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {availability.checking ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : availability.available || availability.hasDeviceKey ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-400" />
                    )}
                  </span>
                )}
              </div>
              {!showRestoreKey && username.trim().length > 0 && (
                <p
                  className={`mt-1.5 text-xs ${
                    availability.checking
                      ? 'text-slate-400'
                      : availability.available || availability.hasDeviceKey
                      ? 'text-emerald-400'
                      : 'text-rose-300'
                  }`}
                >
                  {availability.checking
                    ? 'Checking handle...'
                    : availability.hasDeviceKey
                    ? 'Welcome back! Saved profile found on this browser.'
                    : availability.available
                    ? 'Handle available — ready for launch!'
                    : availability.reason || 'Choose a valid username.'}
                </p>
              )}
            </div>

            {showRestoreKey && (
              <div>
                <label htmlFor="pn-recovery-key" className="block text-xs font-medium text-slate-300">
                  Progress Save Key (optional cross-device restore)
                </label>
                <div className="relative mt-1.5">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="pn-recovery-key"
                    type="text"
                    required
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                    placeholder="PN-XXXXXXXX"
                    className="w-full rounded-xl border border-white/[0.12] bg-[#060811] py-2.5 pl-10 pr-3.5 font-mono text-sm text-white placeholder-slate-500 focus:border-[#8B5CF6] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                busy ||
                username.trim().length < 2 ||
                (!showRestoreKey && !availability.checking && !availability.available && !availability.hasDeviceKey)
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] px-4 py-3 text-sm font-bold tracking-wide text-white shadow-[0_8px_28px_rgba(139,92,246,0.35)] transition hover:brightness-110 disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'ENTERING ARENA...' : 'START PLAYING'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-slate-400">
            <span>Username only · Instant access</span>
            <button
              type="button"
              onClick={() => {
                setShowRestoreKey((v) => !v);
                setError(null);
              }}
              className="font-medium text-slate-300 hover:text-white underline cursor-pointer"
            >
              {showRestoreKey ? 'Back to username entry' : 'Restore via Save Key'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
