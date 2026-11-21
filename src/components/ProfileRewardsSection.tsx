import React, { useRef, useState } from 'react';
import {
  Award,
  Camera,
  Check,
  Coins,
  Copy,
  Flame,
  KeyRound,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
  Trophy,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AchievementItem,
  ChallengeItem,
  CosmeticRewardItem,
  MatchRecord,
  PlayerProfile,
} from '../types.ts';
import { apiFetch } from '../utils/api.ts';
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
  const [usernameInput, setUsernameInput] = useState(player.username);
  const [savingName, setSavingName] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const xpPercent = Math.min(100, Math.round((player.currentLevelXp / Math.max(1, player.nextLevelXp)) * 100));
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/username', {
        method: 'PATCH',
        body: JSON.stringify({ username: usernameInput }),
      });
      onPlayerUpdated(res.player);
      soundFx.playClick();
      setFeedback({ type: 'ok', text: 'Display name updated.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Unable to update name.' });
    } finally {
      setSavingName(false);
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
      onPlayerUpdated(res.player);
      setPreviewDataUrl(null);
      soundFx.playWin();
      setFeedback({ type: 'ok', text: 'Profile picture saved and optimized.' });
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
      const res = await apiFetch<{ ok: boolean; player: PlayerProfile }>('/api/profile/picture', {
        method: 'DELETE',
      });
      onPlayerUpdated(res.player);
      setPreviewDataUrl(null);
      soundFx.playClick();
      setFeedback({ type: 'ok', text: 'Profile picture removed.' });
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
      soundFx.playReward();
      setFeedback({
        type: 'ok',
        text: reward.unlocked
          ? `Equipped ${reward.name} frame.`
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
      setGeneratedKey(res.recoveryKey);
      setCopiedKey(false);
      soundFx.playReward();
      setFeedback({
        type: 'ok',
        text: 'New Progress Save Key generated. Store it safely to restore your profile on any browser.',
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

      {/* Profile Header & Picture Upload */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#10141F] p-6 space-y-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <PlayerAvatar
              username={player.username}
              profilePictureUrl={previewDataUrl || player.profilePictureUrl}
              activeFrame={player.activeFrame}
              size="xl"
            />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-white truncate">{player.username}</h1>
                <span className="font-mono text-xs font-semibold text-emerald-400">
                  ACTIVE PROFILE
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 truncate">
                Username-only entry · Joined {new Date(player.createdAt).toLocaleDateString()}
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#0B0E17] px-3.5 py-2 text-xs font-semibold text-white transition hover:border-[#E11D48] cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5 text-[#E11D48]" />
                  Choose Photo (PNG/JPG/WEBP)
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
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveUsername} className="border-t border-white/[0.08] pt-5">
            <label htmlFor="gv-username-edit" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Player Display Name
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="gv-username-edit"
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  maxLength={24}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#07090F] py-2 pl-9 pr-3 text-sm text-white focus:border-[#E11D48] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={savingName || usernameInput.trim() === player.username}
                className="rounded-lg bg-[#E11D48] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
              >
                {savingName ? 'Saving...' : 'Update Name'}
              </button>
            </div>
          </form>

          {/* Audio & Motion Controls */}
          <div className="border-t border-white/[0.08] pt-5 space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Audio & Animation Preferences
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.08] bg-[#0B0E17] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-medium text-white">
                    {player.settings.soundEnabled ? (
                      <Volume2 className="h-4 w-4 text-[#F59E0B]" />
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
                    className="flex-1 accent-[#E11D48]"
                  />
                  <span className="w-9 text-right font-mono text-xs text-slate-300 tabular-nums">
                    {Math.round(player.settings.soundVolume * 100)}%
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-white/[0.08] bg-[#0B0E17] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Reduced Motion</p>
                  <p className="mt-0.5 text-xs text-slate-400">Minimize celebratory transitions</p>
                </div>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={() => void updateSettings({ reducedMotion: !player.settings.reducedMotion })}
                  className={`rounded-md px-3 py-1 text-xs font-semibold cursor-pointer ${
                    player.settings.reducedMotion ? 'bg-[#E11D48] text-white' : 'bg-slate-800 text-slate-300'
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
                <KeyRound className="h-4 w-4 text-[#F59E0B]" />
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Optional Cross-Device Progress Save Key
                </h2>
              </div>
              <span className="font-mono text-[11px] font-semibold text-emerald-400">
                {player.hasRecoveryKey ? 'KEY ACTIVE' : 'NO KEY YET'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              No email or password is ever required to play GAMEVERSE. If you switch browsers or devices, enter your username + Progress Save Key on the Recover Profile tab to bring back your XP, coins, frames, and leaderboard rank.
            </p>

            {generatedKey && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/40 bg-[#07090F] px-4 py-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    New Progress Save Key (Shown Once)
                  </p>
                  <p className="mt-0.5 font-mono text-base font-bold tracking-widest text-[#F59E0B]">
                    {generatedKey}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyKey(generatedKey)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#10141F] px-3 py-1.5 text-xs font-semibold text-white hover:border-white/25 cursor-pointer"
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
              className="inline-flex items-center gap-2 rounded-lg bg-[#F59E0B] px-4 py-2 text-xs font-semibold text-[#07090F] transition hover:bg-[#D97706] disabled:opacity-60 cursor-pointer"
            >
              {generatingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              {player.hasRecoveryKey ? 'Rotate Progress Save Key' : 'Generate Progress Save Key'}
            </button>
          </div>
        </div>

        {/* Progression Summary Card */}
        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#10141F] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Campaign Rank</p>
              <p className="mt-1 font-display text-3xl font-bold text-white tabular-nums">
                Level {player.level}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Virtual Wallet</p>
              <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-2xl font-bold text-[#F59E0B] tabular-nums">
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
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#07090F]">
              <div
                className="h-full rounded-full bg-[#E11D48] transition-all duration-300"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {[
              { label: 'Total Score', value: player.points.toLocaleString(), icon: Trophy, color: 'text-[#F59E0B]' },
              { label: 'Current Streak', value: `${player.currentStreak} wins`, icon: Flame, color: 'text-[#E11D48]' },
              { label: 'Best Streak', value: `${player.bestStreak} wins`, icon: Sparkles, color: 'text-emerald-400' },
              { label: 'Badges', value: `${unlockedCount} / ${achievements.length}`, icon: Award, color: 'text-sky-400' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-white/[0.06] bg-[#0B0E17] p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{stat.label}</span>
                  <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                </div>
                <p className="mt-1.5 font-mono text-lg font-bold text-white tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.08] pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Game Breakdown</p>
            <div className="mt-3 space-y-2 text-xs">
              {(
                [
                  ['Tic-Tac-Toe', player.stats.byGame.tictactoe],
                  ['Rock-Paper-Scissors', player.stats.byGame.rps],
                  ['Guess the Number', player.stats.byGame.guess_number],
                ] as const
              ).map(([title, s]) => (
                <div
                  key={title}
                  className="flex items-center justify-between rounded-lg bg-[#0B0E17] px-3 py-2 text-slate-300 tabular-nums"
                >
                  <span className="font-medium text-white">{title}</span>
                  <span className="font-mono text-slate-400">
                    {s.wins}W · {s.played}G · Best {s.bestScore}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cosmetic Avatar Frame Vault (Earned Coins Only — Zero Gambling) */}
      <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/[0.08] pb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">Avatar Frame Vault</h2>
            <p className="text-xs text-slate-400">
              Unlock cosmetic profile frames using virtual Game Coins earned from playing and completing challenges.
            </p>
          </div>
          <span className="font-mono text-sm font-bold text-[#F59E0B] tabular-nums">
            Balance: {player.coins.toLocaleString()} Coins
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {rewards.map((reward) => (
            <div
              key={reward.id}
              className={`flex flex-col justify-between rounded-xl border p-4 ${
                reward.equipped ? 'border-[#E11D48] bg-[#171220]' : 'border-white/[0.08] bg-[#0B0E17]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className="h-5 w-5 rounded-md border"
                    style={{ borderColor: reward.accentHex, backgroundColor: `${reward.accentHex}22` }}
                  />
                  <span className="font-mono text-xs text-[#F59E0B] tabular-nums">
                    {reward.coinCost === 0 ? 'FREE' : `${reward.coinCost} COINS`}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-white">{reward.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{reward.description}</p>
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
                    ? 'bg-[#F59E0B] text-[#07090F] hover:bg-[#D97706]'
                    : 'bg-white/[0.04] text-slate-500 cursor-not-allowed'
                }`}
              >
                {unlockingId === reward.id
                  ? 'Processing...'
                  : reward.equipped
                  ? 'Equipped'
                  : reward.unlocked
                  ? 'Equip Frame'
                  : player.coins >= reward.coinCost
                  ? `Unlock (${reward.coinCost})`
                  : 'Not Enough Coins'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Challenges & Achievements */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
          <h2 className="font-display text-xl font-bold text-white">Daily & Weekly Challenges</h2>
          <p className="mt-1 text-xs text-slate-400">Auto-tracked across every validated match.</p>
          <div className="mt-4 space-y-3">
            {challenges.map((c) => {
              const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.targetCount)) * 100));
              return (
                <div key={c.id} className="rounded-lg border border-white/[0.08] bg-[#0B0E17] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#F59E0B]">
                        {c.kind} challenge
                      </span>
                      <h3 className="font-display text-sm font-bold text-white">{c.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-400">{c.description}</p>
                    </div>
                    <div className="text-right shrink-0 font-mono text-xs">
                      <p className="text-emerald-400">+{c.xpReward} XP</p>
                      <p className="text-[#F59E0B]">+{c.coinReward} Coins</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#07090F]">
                      <div
                        className={`h-full rounded-full ${c.completed ? 'bg-emerald-500' : 'bg-[#E11D48]'}`}
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

        <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
          <h2 className="font-display text-xl font-bold text-white">Achievements ({unlockedCount}/{achievements.length})</h2>
          <p className="mt-1 text-xs text-slate-400">Permanent milestones unlocked through skillful play.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {achievements.map((a) => (
              <div
                key={a.key}
                className={`rounded-lg border p-3.5 ${
                  a.unlocked
                    ? 'border-emerald-500/35 bg-emerald-950/15'
                    : 'border-white/[0.06] bg-[#0B0E17] opacity-75'
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
                <p className="mt-2 font-mono text-[11px] text-[#F59E0B]">
                  +{a.xpReward} XP · +{a.coinReward} Coins
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Match History */}
      <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
        <h2 className="font-display text-xl font-bold text-white">Recent Match Activity</h2>
        {matches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No completed matches yet. Jump into any arena game to start your record.</p>
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
