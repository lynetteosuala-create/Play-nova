import {
  Atom,
  Bolt,
  Crown,
  Flame,
  Shield,
  Sparkles,
  Swords,
  Terminal,
} from 'lucide-react';
import { DEFAULT_AVATAR_CONFIG, DEFAULT_COSMETIC_REWARDS } from '../game/catalog.ts';
import type { AvatarConfig } from '../types.ts';

interface PlayerAvatarProps {
  username: string;
  profilePictureUrl: string | null;
  activeFrame?: string;
  avatarConfig?: AvatarConfig;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
};

const ICON_SIZE_MAP: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
  xl: 'h-10 w-10',
};

export function renderAvatarEmblem(emblem: AvatarConfig['emblem'], className: string) {
  switch (emblem) {
    case 'crown':
      return <Crown className={className} />;
    case 'bolt':
      return <Bolt className={className} />;
    case 'shield':
      return <Shield className={className} />;
    case 'cyber':
      return <Terminal className={className} />;
    case 'chess':
      return <Swords className={className} />;
    case 'phoenix':
      return <Flame className={className} />;
    case 'atom':
      return <Atom className={className} />;
    case 'nova':
    default:
      return <Sparkles className={className} />;
  }
}

export function PlayerAvatar({
  username,
  profilePictureUrl,
  activeFrame = 'frame_slate',
  avatarConfig,
  size = 'md',
  className = '',
}: PlayerAvatarProps) {
  const frame =
    DEFAULT_COSMETIC_REWARDS.find((r) => r.id === activeFrame) || DEFAULT_COSMETIC_REWARDS[0];
  const cfg = avatarConfig || DEFAULT_AVATAR_CONFIG;
  const initials = (username || 'P')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const showPhoto = Boolean(profilePictureUrl) && (!avatarConfig || cfg.mode === 'photo');

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl flex items-center justify-center font-display font-bold text-white ${SIZE_MAP[size]} ${className}`}
      style={{
        backgroundColor: cfg.bgHex || '#131932',
        border: `2px solid ${frame.accentHex}`,
        boxShadow: `0 0 0 1px rgba(15, 23, 42, 0.85)`,
      }}
      title={`${username} (${frame.name})`}
    >
      {showPhoto && profilePictureUrl ? (
        <img
          src={profilePictureUrl}
          alt={`${username} avatar`}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : avatarConfig ? (
        <span style={{ color: cfg.accentHex || '#8B5CF6' }}>
          {renderAvatarEmblem(cfg.emblem, ICON_SIZE_MAP[size])}
        </span>
      ) : (
        <span>{initials || 'P'}</span>
      )}
    </div>
  );
}
