import { DEFAULT_COSMETIC_REWARDS } from '../game/catalog.ts';

interface PlayerAvatarProps {
  username: string;
  profilePictureUrl: string | null;
  activeFrame?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
};

export function PlayerAvatar({
  username,
  profilePictureUrl,
  activeFrame = 'frame_slate',
  size = 'md',
  className = '',
}: PlayerAvatarProps) {
  const frame =
    DEFAULT_COSMETIC_REWARDS.find((r) => r.id === activeFrame) || DEFAULT_COSMETIC_REWARDS[0];
  const initials = (username || 'P')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-[#111622] flex items-center justify-center font-display font-bold text-white ${SIZE_MAP[size]} ${className}`}
      style={{
        border: `2px solid ${frame.accentHex}`,
        boxShadow: `0 0 0 1px rgba(15, 23, 42, 0.8)`,
      }}
      title={`${username} (${frame.name})`}
    >
      {profilePictureUrl ? (
        <img
          src={profilePictureUrl}
          alt={`${username} avatar`}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{initials || 'P'}</span>
      )}
    </div>
  );
}
