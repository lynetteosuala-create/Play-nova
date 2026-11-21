import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  Camera,
  Check,
  Coins,
  Copy,
  Flame,
  Heart,
  KeyRound,
  Loader2,
  Lock,
  Palette,
  Sparkles,
  Trash2,
  Trophy,
  User,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { GAME_CATALOG } from '../game/catalog.ts';
import type {
  AchievementItem,
  AvatarConfig,
  ChallengeItem,
  CoinTransactionItem,
  CosmeticRewardItem,
  GameId,
  MatchRecord,
  PlayerProfile,
} from '../types.ts';
import { apiFetch, setStoredRecoveryKey } from '../utils/api.ts';
import { soundFx } from '../utils/sound.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

interface ProfileRewardsSectionProps {
  player: PlayerProfile;
  challenges: ChallengeItem[];
  achievements: AchievementItem[];
  rewards: CosmeticRewardItem[];
  matches: MatchRecord[];
  onPlayerUpdated: (player: PlayerProfile) => void;
  onRefreshProgression: () => void;
}

const EMBLEM_OPTIONS: Array<{ id: AvatarConfig['emblem']; label: string }> = [
  { id: 'nova', label: 'Nova' },
  { id: 'crown', label: 'Crown' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'shield', label: 'Shield' },
  { id: 'cyber', label: 'Cyber' },
  { id: 'chess', label: 'Chess' },
  { id: 'phoenix', label: 'Phoenix' },
  { id: 'atom', label: 'Atom' },
];

const BG_SWATCHES = ['#131932', '#1B1136', '#0D2235', '#281512', '#0D241C', '#1C1D2E'];
const ACCENT_SWATCHES = ['#8B5CF6', '#38BDF8', '#F97316', '#10B981', '#EC4899', '#FACC15'];

function getThemeBannerClasses(themeId: string): string {
  switch (themeId) {
    case 'theme_cyber_blue':
      return 'border-[#38BDF8]/40 bg-gradient-to-br from-[#0B1730] via-[#0E1324] to-[#081526]';
    case 'theme_solar_forge':
      return 'border-[#F97316]/40 bg-gradient-to-br from-[#21110B] via-[#0E1324] to-[#1A0D0B]';
    default:
      return 'border-[#8B5CF6]/35 bg-gradient-to-br from-[#14102C] via-[#0E1324] to-[#0B0F1E]';
  }
}

async function resizeImageToDataUrl(file: File): Promise<string> {
  const validMime = ['image/png', 'image/jpeg', 'image/webp'];
  if (!validMime.includes(file.type)) {
    throw new Error('Only PNG, JPG, and WEBP image files are allowed.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Source image must be under 10 MB.');
  }

  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image file.'));
      el.src = bitmapUrl;
    });

    const targetSize = 512;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is unavailable in this browser.');

    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

    const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(outputMime, 0.88);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export function ProfileRewardsSection({
  player,
  challenges,
  achievements,
  rewards,
  matches,
  onPlayerUpdated,
  onRefreshProgression,
}: ProfileRewardsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingFavs, setSavingFavs] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [draftAvatar, setDraftAvatar] = useState<AvatarConfig>(player.avatarConfig);
  const [walletData, setWalletData] = useState<{
    totalEarned: number;
    totalSpent: number;
    transactions: CoinTransactionItem[];
  }>({ totalEarned: 0, totalSpent: 0, transactions: [] });
  const [loadingWallet, setLoadingWallet] = useState(true);

  useEffect(() => {
    setDraftAvatar(player.avatarConfig);
  }, [player.avatarConfig]);

  const loadWallet = async () => {
    setLoadingWallet(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        totalEarned: number;
        totalSpent: number;
        transactions: CoinTransactionItem[];
      }>('/api/wallet/transactions');
      setWalletData({
        totalEarned: res.totalEarned ?? 0,
        totalSpent: res.totalSpent ?? 0,
        transactions: res.transactions || [],
      });
    } catch {
      // handled gracefully
    } finally {
      setLoadingWallet(false);
    }
  };

  useEffect(() => {
    void loadWallet();
  }, [player.coins]);

  const xpPercent = Math.min(100, Math.round((player.currentLevelXp / Math.max(1, player.nextLevelXp)) * 100));
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  async function handleSaveAvatarConfig(nextCfg: AvatarConfig) {
    setSavingAvatar(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/avatar', {
        method: 'PATCH',
        body: JSON.stringify(nextCfg),
      });
      onPlayerUpdated(res.player);
      soundFx.playClick();
      setFeedback({ type: 'ok', text: 'Custom avatar saved to your PLAYNOVA profile.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Unable to save avatar.' });
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleToggleFavorite(gameId: GameId) {
    setSavingFavs(true);
    const exists = player.favoriteGames.includes(gameId);
    const nextFavs = exists
      ? player.favoriteGames.filter((g) => g !== gameId)
      : [...player.favoriteGames, gameId];
    try {
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/favorites', {
        method: 'PATCH',
        body: JSON.stringify({ favoriteGames: nextFavs }),
      });
      onPlayerUpdated(res.player);
      soundFx.playClick();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Could not save favorites.' });
    } finally {
      setSavingFavs(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPreviewDataUrl(dataUrl);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Invalid image file.' });
    } finally {
      e.target.value = '';
    }
  }

  async function handleSavePhoto() {
    if (!previewDataUrl) return;
    setUploadingPhoto(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/picture', {
        method: 'POST',
        body: JSON.stringify({ dataUrl: previewDataUrl }),
      });
      // Switch mode to photo automatically so uploaded photo shows immediately
      const avatarRes = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/avatar', {
        method: 'PATCH',
        body: JSON.stringify({ ...res.player.avatarConfig, mode: 'photo' }),
      });
      onPlayerUpdated(avatarRes.player);
      setPreviewDataUrl(null);
      soundFx.playWin();
      setFeedback({ type: 'ok', text: 'Profile picture saved and equipped.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto() {
    setUploadingPhoto(true);
    setFeedback(null);
    try {
      await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/picture', {
        method: 'DELETE',
      });
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/avatar', {
        method: 'PATCH',
        body: JSON.stringify({ ...draftAvatar, mode: 'emblem' }),
      });
      onPlayerUpdated(res.player);
      setPreviewDataUrl(null);
      soundFx.playClick();
      setFeedback({ type: 'ok', text: 'Photo removed. Switched back to Custom Emblem avatar.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Unable to remove photo.' });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleRewardAction(reward: CosmeticRewardItem) {
    setUnlockingId(reward.id);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>(
        `/api/rewards/${encodeURIComponent(reward.id)}/unlock`,
        { method: 'POST' }
      );
      onPlayerUpdated(res.player);
      onRefreshProgression();
      void loadWallet();
      soundFx.playReward();
      setFeedback({
        type: 'ok',
        text: reward.unlocked
          ? `Equipped ${reward.name}.`
          : `Unlocked & equipped ${reward.name} (-${reward.coinCost} Coins).`,
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Action failed.' });
    } finally {
      setUnlockingId(null);
    }
  }

  async function updateSettings(patch: Partial<PlayerProfile['settings']>) {
    setSavingSettings(true);
    const next = { ...player.settings, ...patch };
    soundFx.configure(next.soundEnabled, next.soundVolume);
    try {
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/settings', {
        method: 'PATCH',
        body: JSON.stringify({ settings: next }),
      });
      onPlayerUpdated(res.player);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Unable to save settings.' });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleGenerateRecoveryKey() {
    setGeneratingKey(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; recoveryKey: string; player: PlayerProfile }>(
        '/api/profile/recovery-key',
        { method: 'POST' }
      );
      onPlayerUpdated(res.player);
      setStoredRecoveryKey(res.recoveryKey);
      setGeneratedKey(res.recoveryKey);
      setCopiedKey(false);
      soundFx.playReward();
      setFeedback({
        type: 'ok',
        text: 'New Progress Save Key generated. Store it safely to restore your anonymous guest progress anytime.',
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Unable to generate save key.' });
    } finally {
      setGeneratingKey(false);
    }
  }

  async function handleCopyKey(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(true);
      soundFx.playClick();
      window.setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      setFeedback({ type: 'err', text: 'Clipboard permission denied. Copy the key manually.' });
    }
  }

  return (
    <div className="space-y-8">
      {feedback && (
        <div
          className={`rounded-lg border p-3.5 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
              : 'border-rose-500/30 bg-rose-950/30 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Profile Header & Custom Avatar Creator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className={`lg:col-span-7 rounded-2xl border p-6 space-y-6 ${getThemeBannerClasses(player.profileTheme)}`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <PlayerAvatar
              username={player.username}
              profilePictureUrl={previewDataUrl || player.profilePictureUrl}
              activeFrame={player.activeFrame}
              avatarConfig={previewDataUrl ? { ...draftAvatar, mode: 'photo' } : draftAvatar}
              size="xl"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-white truncate">{player.username}</h1>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  ACTIVE CONTENDER
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 truncate">
                Anonymous Guest ID {player.id.slice(0, 8).toUpperCase()} · Joined {new Date(player.createdAt).toLocaleDateString()}
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#090D1A] px-3.5 py-2 text-xs font-semibold text-white transition hover:border-[#38BDF8] cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5 text-[#38BDF8]" />
                  Upload Photo
                </button>
                {previewDataUrl && (
                  <>
                    <button
                      type="button"
                      disabled={uploadingPhoto}
                      onClick={() => void handleSavePhoto()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                    >
                      {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Save Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDataUrl(null)}
                      className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {player.profilePictureUrl && !previewDataUrl && (
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => void handleRemovePhoto()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove Photo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Custom Emblem Avatar Studio */}
          <div className="rounded-xl border border-white/[0.08] bg-[#090D1A]/85 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-[#8B5CF6]" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Custom Avatar Creator
                </h2>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...draftAvatar, mode: 'emblem' as const };
                    setDraftAvatar(next);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                    draftAvatar.mode === 'emblem' ? 'bg-[#8B5CF6] text-white' : 'bg-[#0E1324] text-slate-400'
                  }`}
                >
                  Custom Emblem
                </button>
                {player.profilePictureUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...draftAvatar, mode: 'photo' as const };
                      setDraftAvatar(next);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                      draftAvatar.mode === 'photo' ? 'bg-[#38BDF8] text-[#060811]' : 'bg-[#0E1324] text-slate-400'
                    }`}
                  >
                    Uploaded Photo
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {EMBLEM_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDraftAvatar({ ...draftAvatar, mode: 'emblem', emblem: opt.id })}
                  className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition cursor-pointer ${
                    draftAvatar.emblem === opt.id && draftAvatar.mode === 'emblem'
                      ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                      : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Backdrop:</span>
                {BG_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Backdrop ${hex}`}
                    onClick={() => setDraftAvatar({ ...draftAvatar, bgHex: hex })}
                    style={{ backgroundColor: hex }}
                    className={`h-5 w-5 rounded-full border-2 cursor-pointer ${
                      draftAvatar.bgHex === hex ? 'border-white scale-110' : 'border-white/20'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Glow:</span>
                {ACCENT_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Accent ${hex}`}
                    onClick={() => setDraftAvatar({ ...draftAvatar, accentHex: hex })}
                    style={{ backgroundColor: hex }}
                    className={`h-5 w-5 rounded-full border-2 cursor-pointer ${
                      draftAvatar.accentHex === hex ? 'border-white scale-110' : 'border-white/20'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={savingAvatar}
                onClick={() => void handleSaveAvatarConfig(draftAvatar)}
                className="rounded-lg bg-[#8B5CF6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#7C3AED] disabled:opacity-50 cursor-pointer"
              >
                {savingAvatar ? 'Saving...' : 'Save Avatar'}
              </button>
            </div>
          </div>

          {/* Audio & Motion Controls */}
          <div className="border-t border-white/[0.08] pt-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Audio & Animation Preferences
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.08] bg-[#090D1A] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                    {player.settings.soundEnabled ? (
                      <Volume2 className="h-4 w-4 text-[#F97316]" />
                    ) : (
                      <VolumeX className="h-4 w-4 text-slate-500" />
                    )}
                    Sound Effects
                  </span>
                  <button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => void updateSettings({ soundEnabled: !player.settings.soundEnabled })}
                    className={`rounded-md px-3 py-1 text-xs font-semibold cursor-pointer ${
                      player.settings.soundEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {player.settings.soundEnabled ? 'ON' : 'MUTED'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(player.settings.soundVolume * 100)}
                    onChange={(e) => {
                      const vol = Number(e.target.value) / 100;
                      void updateSettings({ soundVolume: vol });
                    }}
                    className="flex-1 accent-[#8B5CF6]"
                  />
                  <span className="w-9 text-right font-mono text-xs text-slate-300 tabular-nums">
                    {Math.round(player.settings.soundVolume * 100)}%
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.08] bg-[#090D1A] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Reduced Motion</p>
                  <p className="mt-0.5 text-xs text-slate-400">Minimize celebratory transitions</p>
                </div>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => void updateSettings({ reducedMotion: !player.settings.reducedMotion })}
                  className={`rounded-md px-3 py-1 text-xs font-semibold cursor-pointer ${
                    player.settings.reducedMotion ? 'bg-[#8B5CF6] text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {player.settings.reducedMotion ? 'REDUCED' : 'FULL'}
                </button>
              </div>
            </div>
          </div>

          {/* Optional Cross-Device Progress Save Key */}
          <div className="border-t border-white/[0.08] pt-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[#F97316]" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Optional Cross-Device Progress Save Key
                </h2>
              </div>
              <span className="font-mono text-[11px] font-semibold text-emerald-400">
                {player.hasRecoveryKey ? 'KEY ACTIVE' : 'NO KEY YET'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              No username, email, or password is ever required to play PLAYNOVA. Save this Progress Save Key to restore your anonymous XP, coins, themes, frames, and rank if your session expires.
            </p>

            {generatedKey && (
              <div className="flex items-center justify-between rounded-lg border border-[#F97316]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    New Progress Save Key (Shown Once)
                  </p>
                  <p className="mt-0.5 font-mono text-base font-bold tracking-widest text-[#F97316]">
                    {generatedKey}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyKey(generatedKey)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#0E1324] px-3 py-1.5 text-xs font-semibold text-white hover:border-white/25 cursor-pointer"
                >
                  {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={generatingKey}
              onClick={() => void handleGenerateRecoveryKey()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-xs font-bold text-[#060811] transition hover:bg-[#EA580C] disabled:opacity-60 cursor-pointer"
            >
              {generatingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              {player.hasRecoveryKey ? 'Rotate Progress Save Key' : 'Generate Progress Save Key'}
            </button>
          </div>
        </div>

        {/* Progression Summary Card & 12-Game Breakdown */}
        <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Contender Rank</p>
              <p className="mt-1 font-display text-3xl font-bold text-white tabular-nums">
                Level {player.level}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Virtual Wallet</p>
              <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-2xl font-bold text-[#F97316] tabular-nums">
                <Coins className="h-5 w-5" />
                {player.coins.toLocaleString()}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
              <span>XP Progress</span>
              <span className="font-mono text-white">
                {player.currentLevelXp} / {player.nextLevelXp} XP ({xpPercent}%)
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#060811]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#38BDF8] transition-all duration-300"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {[
              { label: 'Total Score', value: player.points.toLocaleString(), icon: Trophy, color: 'text-[#F97316]' },
              { label: 'Current Streak', value: `${player.currentStreak} wins`, icon: Flame, color: 'text-[#8B5CF6]' },
              { label: 'Best Streak', value: `${player.bestStreak} wins`, icon: Sparkles, color: 'text-emerald-400' },
              { label: 'Badges', value: `${unlockedCount} / ${achievements.length}`, icon: Award, color: 'text-[#38BDF8]' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-white/[0.06] bg-[#090D1A] p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{stat.label}</span>
                  <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                </div>
                <p className="mt-1.5 font-mono text-lg font-bold text-white tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.08] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              12-Game Arena Breakdown
            </p>
            <div className="mt-3 max-h-72 overflow-y-auto space-y-2 text-xs pr-1">
              {GAME_CATALOG.map((g) => {
                const s = player.stats.byGame[g.id] || { played: 0, wins: 0, bestScore: 0 };
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded-lg bg-[#090D1A] px-3 py-2 text-slate-300 tabular-nums"
                  >
                    <span className="font-medium text-white truncate pr-2">{g.name}</span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {s.wins}W · {s.played}G · Best {s.bestScore}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Favourite Games Picker */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Heart className="h-5 w-5 text-[#F97316]" />
              Favourite Games ({player.favoriteGames.length})
            </h2>
            <p className="text-xs text-slate-400">
              Pin your top PLAYNOVA arenas for instant quick-launch inside the lobby.
            </p>
          </div>
          {savingFavs && <span className="text-xs font-mono text-[#38BDF8]">Saving...</span>}
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {GAME_CATALOG.map((g) => {
            const active = player.favoriteGames.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => void handleToggleFavorite(g.id)}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'border-[#F97316] bg-[#F97316]/15 text-white'
                    : 'border-white/[0.08] bg-[#090D1A] text-slate-400 hover:text-white'
                }`}
              >
                <span className="truncate">{g.name}</span>
                <Heart className={`h-3.5 w-3.5 shrink-0 ${active ? 'fill-[#F97316] text-[#F97316]' : 'text-slate-600'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Cosmetic Avatar Frame & Profile Theme Vault */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Avatar Frames & Profile Themes Vault</h2>
            <p className="text-xs text-slate-400">
              Unlock cosmetic frames and custom profile banner themes using Virtual Coins earned from gameplay, challenges, and tournaments.
            </p>
          </div>
          <span className="font-mono text-sm font-bold text-[#F97316] tabular-nums">
            Balance: {player.coins.toLocaleString()} Coins
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rewards.map((reward) => (
            <div
              key={reward.id}
              className={`flex flex-col justify-between rounded-xl border p-4 ${
                reward.equipped ? 'border-[#8B5CF6] bg-[#161232]' : 'border-white/[0.08] bg-[#090D1A]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#38BDF8]">
                    {reward.category}
                  </span>
                  <span className="font-mono text-xs text-[#F97316] tabular-nums">
                    {reward.coinCost === 0 ? 'FREE' : `${reward.coinCost} COINS`}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-md border shrink-0"
                    style={{ borderColor: reward.accentHex, backgroundColor: `${reward.accentHex}33` }}
                  />
                  <h3 className="font-display text-base font-bold text-white">{reward.name}</h3>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">{reward.description}</p>
              </div>

              <button
                type="button"
                disabled={reward.equipped || unlockingId === reward.id || (!reward.unlocked && player.coins < reward.coinCost)}
                onClick={() => void handleRewardAction(reward)}
                className={`mt-4 w-full rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                  reward.equipped
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                    : reward.unlocked
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : player.coins >= reward.coinCost
                    ? 'bg-[#F97316] text-[#060811] font-bold hover:bg-[#EA580C]'
                    : 'bg-white/[0.04] text-slate-500 cursor-not-allowed'
                }`}
              >
                {unlockingId === reward.id
                  ? 'Processing...'
                  : reward.equipped
                  ? 'Equipped'
                  : reward.unlocked
                  ? reward.category === 'theme'
                    ? 'Apply Theme'
                    : 'Equip Frame'
                  : player.coins >= reward.coinCost
                  ? `Unlock (${reward.coinCost})`
                  : 'Not Enough Coins'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Virtual Coin Wallet & Transaction Ledger */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5">
        <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#F97316]" />
              Virtual Coin Wallet & Ledger
            </h2>
            <p className="text-xs text-slate-400">
              Complete history of earned match rewards, tournament purses, challenge bonuses, and cosmetic unlocks.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 font-mono text-xs tabular-nums">
            <span className="text-emerald-400">Earned: +{walletData.totalEarned.toLocaleString()}c</span>
            <span className="text-rose-400">Spent: -{walletData.totalSpent.toLocaleString()}c</span>
            <span className="font-bold text-[#F97316]">Balance: {player.coins.toLocaleString()}c</span>
          </div>
        </div>

        {loadingWallet ? (
          <p className="py-6 text-center text-xs text-slate-400">Loading wallet transactions...</p>
        ) : walletData.transactions.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            No wallet transactions recorded yet. Play any game or challenge to earn Virtual Coins!
          </p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] font-mono uppercase text-slate-400">
                <tr>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4 text-right">Balance After</th>
                  <th className="py-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {walletData.transactions.map((tx) => (
                  <tr key={tx.id} className="text-slate-300">
                    <td className="py-2.5 pr-4 font-mono uppercase text-[11px] text-[#38BDF8]">
                      {tx.category}
                    </td>
                    <td className="py-2.5 pr-4 text-white">{tx.description}</td>
                    <td
                      className={`py-2.5 pr-4 text-right font-mono font-bold tabular-nums ${
                        tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}c
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[#F97316] tabular-nums">
                      {tx.balanceAfter.toLocaleString()}c
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-500">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Challenges & Achievements */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
          <h2 className="font-display text-xl font-bold text-white">Daily & Weekly Challenges</h2>
          <p className="mt-1 text-xs text-slate-400">Auto-tracked across every validated match.</p>
          <div className="mt-4 space-y-3">
            {challenges.map((c) => {
              const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.targetCount)) * 100));
              return (
                <div key={c.id} className="rounded-lg border border-white/[0.08] bg-[#090D1A] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#F97316]">
                        {c.kind} challenge
                      </span>
                      <h3 className="font-display text-sm font-bold text-white">{c.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-400">{c.description}</p>
                    </div>
                    <div className="text-right shrink-0 font-mono text-xs">
                      <p className="text-emerald-400">+{c.xpReward} XP</p>
                      <p className="text-[#F97316]">+{c.coinReward} Coins</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#060811]">
                      <div
                        className={`h-full rounded-full ${c.completed ? 'bg-emerald-500' : 'bg-[#8B5CF6]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-slate-300 tabular-nums">
                      {c.progress}/{c.targetCount}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
          <h2 className="font-display text-xl font-bold text-white">
            Achievements ({unlockedCount}/{achievements.length})
          </h2>
          <p className="mt-1 text-xs text-slate-400">Permanent milestones unlocked through skillful play.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {achievements.map((a) => (
              <div
                key={a.key}
                className={`rounded-lg border p-3.5 ${
                  a.unlocked
                    ? 'border-emerald-500/35 bg-emerald-950/15'
                    : 'border-white/[0.06] bg-[#090D1A] opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    {a.category}
                  </span>
                  {a.unlocked ? (
                    <Award className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-slate-500" />
                  )}
                </div>
                <h3 className="mt-1.5 font-display text-sm font-bold text-white">{a.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400">{a.description}</p>
                <p className="mt-2 font-mono text-[11px] text-[#F97316]">
                  +{a.xpReward} XP · +{a.coinReward} Coins
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Match History */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
        <h2 className="font-display text-xl font-bold text-white">Recent Match Activity</h2>
        {matches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No completed matches yet. Jump into any arena game to start your record.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] text-slate-400 uppercase font-mono">
                <tr>
                  <th className="py-2.5 pr-4">Game</th>
                  <th className="py-2.5 pr-4">Opponent</th>
                  <th className="py-2.5 pr-4">Result</th>
                  <th className="py-2.5 pr-4">Summary</th>
                  <th className="py-2.5 pr-4 text-right">Rewards</th>
                  <th className="py-2.5 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {matches.slice(0, 15).map((m) => (
                  <tr key={m.id} className="text-slate-300">
                    <td className="py-3 pr-4 font-semibold text-white capitalize">
                      {m.gameId.replace('_', ' ')}
                    </td>
                    <td className="py-3 pr-4">{m.opponentLabel}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`font-mono uppercase font-semibold ${
                          m.outcome === 'win'
                            ? 'text-emerald-400'
                            : m.outcome === 'draw'
                            ? 'text-amber-300'
                            : 'text-rose-400'
                        }`}
                      >
                        {m.outcome}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{m.summary}</td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">
                      +{m.scoreDelta} pts · +{m.xpEarned} XP · +{m.coinsEarned}c
                    </td>
                    <td className="py-3 text-right font-mono text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString()}
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
