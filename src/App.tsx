import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Bell,
  Bot,
  ChevronRight,
  Coins,
  Gamepad2,
  Globe,
  Link2,
  LogOut,
  Menu,
  Play,
  Shield,
  Sparkles,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { GAME_ASSETS } from './assets/gameAssets.ts';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { GuessNumberGame } from './components/GuessNumberGame.tsx';
import { HomepageHero } from './components/HomepageHero.tsx';
import { LeaderboardSection } from './components/LeaderboardSection.tsx';
import { LinkPreviewSection } from './components/LinkPreviewSection.tsx';
import { MultiplayerSection } from './components/MultiplayerSection.tsx';
import { PlayerAvatar } from './components/PlayerAvatar.tsx';
import { ProfileRewardsSection } from './components/ProfileRewardsSection.tsx';
import { RockPaperScissorsGame } from './components/RockPaperScissorsGame.tsx';
import { SessionRecoveryModal } from './components/SessionRecoveryModal.tsx';
import { TicTacToeGame } from './components/TicTacToeGame.tsx';
import { UsernameEntryModal } from './components/UsernameEntryModal.tsx';
import { GAME_CATALOG } from './game/catalog.ts';
import type {
  AchievementItem,
  AppView,
  ChallengeItem,
  CosmeticRewardItem,
  GameId,
  LeaderboardEntry,
  MatchRecord,
  NotificationItem,
  PlayerProfile,
} from './types.ts';
import { apiFetch, getStoredPlayerToken, setStoredPlayerToken } from './utils/api.ts';
import { soundFx } from './utils/sound.ts';
import { wsClient, type RealtimeSnapshot } from './utils/wsClient.ts';

const GAME_ART_MAP: Record<GameId, string> = {
  tictactoe: GAME_ASSETS.ticTacToeArt,
  rps: GAME_ASSETS.rpsArt,
  guess_number: GAME_ASSETS.guessNumberArt,
};

function parseInitialView(): AppView {
  if (typeof window === 'undefined') return 'home';
  const p = window.location.pathname.toLowerCase();
  if (p.startsWith('/lobby')) return 'lobby';
  if (p.startsWith('/multiplayer')) return 'multiplayer';
  if (p.startsWith('/games/tictactoe')) return 'tictactoe';
  if (p.startsWith('/games/rps')) return 'rps';
  if (p.startsWith('/games/guess')) return 'guess_number';
  if (p.startsWith('/games')) return 'games';
  if (p.startsWith('/leaderboard')) return 'leaderboard';
  if (p.startsWith('/link-preview')) return 'link_preview';
  if (p.startsWith('/profile')) return 'profile';
  if (p.startsWith('/admin')) return 'admin';
  return 'home';
}

function parseInitialRoomCode(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('room');
  return code ? code.trim().toUpperCase() : null;
}

function viewToPath(view: AppView): string {
  switch (view) {
    case 'lobby':
      return '/lobby';
    case 'multiplayer':
      return '/multiplayer';
    case 'games':
      return '/games';
    case 'tictactoe':
      return '/games/tictactoe';
    case 'rps':
      return '/games/rps';
    case 'guess_number':
      return '/games/guess_number';
    case 'leaderboard':
      return '/leaderboard';
    case 'link_preview':
      return '/link-preview';
    case 'profile':
      return '/profile';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [view, setView] = useState<AppView>(parseInitialView);
  const [multiplayerGame, setMultiplayerGame] = useState<GameId>('tictactoe');
  const [rt, setRt] = useState<RealtimeSnapshot>(wsClient.getSnapshot());

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [pendingTargetView, setPendingTargetView] = useState<AppView | null>(null);
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(parseInitialRoomCode);

  const [publicStats, setPublicStats] = useState({
    onlinePlayers: 0,
    activeRooms: 0,
    totalPlayers: 0,
    totalMatches: 0,
  });

  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [rewards, setRewards] = useState<CosmeticRewardItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [topLeaders, setTopLeaders] = useState<LeaderboardEntry[]>([]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toastBanner, setToastBanner] = useState<string | null>(null);
  const [copiedQuickLink, setCopiedQuickLink] = useState<string | null>(null);

  const [sessionExpiredModal, setSessionExpiredModal] = useState<{
    open: boolean;
    message: string;
  }>({ open: false, message: '' });

  const playerRef = useRef<PlayerProfile | null>(null);
  playerRef.current = player;

  const navigate = useCallback((nextView: AppView) => {
    setView(nextView);
    setMobileNavOpen(false);
    setNotifOpen(false);
    if (typeof window !== 'undefined') {
      const targetPath = viewToPath(nextView);
      if (window.location.pathname !== targetPath || window.location.search) {
        window.history.pushState({ view: nextView }, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const loadPublicTelemetry = useCallback(async () => {
    try {
      const [statsRes, boardRes] = await Promise.all([
        apiFetch<{
          onlinePlayers: number;
          activeRooms: number;
          totalPlayers: number;
          totalMatches: number;
        }>('/api/public/stats', {}, { suppressSessionEvent: true }),
        apiFetch<{ leaderboard: LeaderboardEntry[] }>(
          '/api/leaderboard?game=all&period=all',
          {},
          { suppressSessionEvent: true }
        ),
      ]);
      setPublicStats(statsRes);
      setTopLeaders((boardRes.leaderboard || []).slice(0, 5));
    } catch {
      // non-fatal public telemetry fetch
    }
  }, []);

  const loadProgressionAndBoard = useCallback(async () => {
    try {
      const [prog, board, statsRes] = await Promise.all([
        apiFetch<{
          challenges: ChallengeItem[];
          achievements: AchievementItem[];
          rewards: CosmeticRewardItem[];
          notifications: NotificationItem[];
          matches: MatchRecord[];
        }>('/api/progression'),
        apiFetch<{ leaderboard: LeaderboardEntry[] }>('/api/leaderboard?game=all&period=all'),
        apiFetch<{
          onlinePlayers: number;
          activeRooms: number;
          totalPlayers: number;
          totalMatches: number;
        }>('/api/public/stats', {}, { suppressSessionEvent: true }),
      ]);
      setChallenges(prog.challenges || []);
      setAchievements(prog.achievements || []);
      setRewards(prog.rewards || []);
      setNotifications(prog.notifications || []);
      setMatches(prog.matches || []);
      setTopLeaders((board.leaderboard || []).slice(0, 5));
      setPublicStats(statsRes);
    } catch {
      // session expiry handled via global event listener
    }
  }, []);

  const refreshPlayerProfile = useCallback(async () => {
    try {
      const res = await apiFetch<{
        authenticated: boolean;
        player?: PlayerProfile;
      }>('/api/auth/me', {}, { suppressSessionEvent: true });
      if (res.authenticated && res.player) {
        setPlayer(res.player);
      }
      await loadProgressionAndBoard();
    } catch {
      // ignore transient error
    }
  }, [loadProgressionAndBoard]);

  // Subscribe to WebSocket state updates
  useEffect(() => {
    return wsClient.subscribe((next) => {
      setRt(next);
    });
  }, []);

  // Bootstrap session + public stats
  useEffect(() => {
    let active = true;
    async function init() {
      await loadPublicTelemetry();
      try {
        const res = await apiFetch<{
          authenticated: boolean;
          token?: string;
          player?: PlayerProfile;
        }>('/api/auth/me', {}, { suppressSessionEvent: true });
        if (!active) return;

        if (res.authenticated && res.player) {
          const activeToken = res.token || getStoredPlayerToken();
          if (activeToken) {
            setStoredPlayerToken(activeToken);
            wsClient.connect(activeToken);
          }
          setPlayer(res.player);
          soundFx.configure(res.player.settings.soundEnabled, res.player.settings.soundVolume);
          await loadProgressionAndBoard();

          if (pendingRoomCode) {
            const codeToJoin = pendingRoomCode;
            setPendingRoomCode(null);
            navigate('multiplayer');
            window.setTimeout(() => wsClient.joinRoomByCode(codeToJoin), 250);
          }
        } else if (pendingRoomCode) {
          setEntryModalOpen(true);
        }
      } catch (err) {
        const errData = err as Error & { status?: number };
        if (errData.status === 401) {
          setStoredPlayerToken(null);
        }
      } finally {
        if (active) setBooting(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward navigation
  useEffect(() => {
    function onPopState() {
      setView(parseInitialView());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Global session-expiration safety net
  useEffect(() => {
    function onSessionExpired(evt: Event) {
      if (!playerRef.current) return;
      const custom = evt as CustomEvent<{ message?: string }>;
      setSessionExpiredModal({
        open: true,
        message: custom.detail?.message || 'Your session expired. Restore your profile or pick a new username.',
      });
    }
    window.addEventListener('gv:session-expired', onSessionExpired);
    return () => window.removeEventListener('gv:session-expired', onSessionExpired);
  }, []);

  useEffect(() => {
    if (!player) return;
    soundFx.configure(player.settings.soundEnabled, player.settings.soundVolume);
  }, [player]);

  const handleAuthenticated = async (authedPlayer: PlayerProfile, token?: string) => {
    const activeToken = token || getStoredPlayerToken();
    if (activeToken) {
      setStoredPlayerToken(activeToken);
      wsClient.connect(activeToken);
    }
    setPlayer(authedPlayer);
    setEntryModalOpen(false);
    setSessionExpiredModal({ open: false, message: '' });
    soundFx.configure(authedPlayer.settings.soundEnabled, authedPlayer.settings.soundVolume);
    await loadProgressionAndBoard();

    if (pendingRoomCode) {
      const code = pendingRoomCode;
      setPendingRoomCode(null);
      setPendingTargetView(null);
      navigate('multiplayer');
      window.setTimeout(() => wsClient.joinRoomByCode(code), 300);
      return;
    }

    const nextView = pendingTargetView || 'lobby';
    setPendingTargetView(null);
    navigate(nextView === 'home' ? 'lobby' : nextView);
  };

  const handleProgressUpdated = (
    updatedPlayer: PlayerProfile,
    newlyUnlocked?: string[],
    completedChallenges?: string[]
  ) => {
    setPlayer(updatedPlayer);
    void loadProgressionAndBoard();

    const items: string[] = [];
    if (newlyUnlocked && newlyUnlocked.length > 0) {
      items.push(`Achievement Unlocked: ${newlyUnlocked.join(', ')}`);
    }
    if (completedChallenges && completedChallenges.length > 0) {
      items.push(`Challenge Completed: ${completedChallenges.join(', ')}`);
    }
    if (items.length > 0) {
      soundFx.playAchievement();
      setToastBanner(items.join(' · '));
      window.setTimeout(() => setToastBanner(null), 5000);
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }, { suppressSessionEvent: true }).catch(() => {});
    wsClient.disconnect();
    setStoredPlayerToken(null);
    setPlayer(null);
    setChallenges([]);
    setAchievements([]);
    setRewards([]);
    setNotifications([]);
    setMatches([]);
    setSessionExpiredModal({ open: false, message: '' });
    void loadPublicTelemetry();
    navigate('home');
  };

  const handlePlayAction = (desiredView: AppView = 'lobby') => {
    if (player) {
      navigate(desiredView);
      return;
    }
    setPendingTargetView(desiredView);
    setEntryModalOpen(true);
  };

  const handleOpenMultiplayerForGame = (gameId: GameId) => {
    setMultiplayerGame(gameId);
    handlePlayAction('multiplayer');
  };

  const handleMarkNotificationsRead = async () => {
    setNotifOpen((prev) => !prev);
    const unread = notifications.some((n) => !n.readAt);
    if (unread) {
      await apiFetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    }
  };

  const handleCopyGameLink = async (gameId: GameId) => {
    const shareUrl = `${window.location.origin}/games/${gameId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedQuickLink(gameId);
      soundFx.playClick();
      window.setTimeout(() => setCopiedQuickLink(null), 1800);
    } catch {
      navigate('link_preview');
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#07090F] flex flex-col items-center justify-center text-slate-300">
        <div className="h-10 w-10 rounded-xl border-2 border-[#E11D48] bg-[#10141F] flex items-center justify-center font-display font-bold text-white">
          G
        </div>
        <p className="mt-4 font-display text-sm tracking-widest uppercase text-slate-400">
          Loading GAMEVERSE Arena...
        </p>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const xpPercent = player
    ? Math.min(100, Math.round((player.currentLevelXp / Math.max(1, player.nextLevelXp)) * 100))
    : 0;

  // Determine effective view safely: public views work without player; protected views show HomepageHero + entry prompt
  const isPublicView =
    view === 'home' || view === 'leaderboard' || view === 'link_preview' || view === 'admin';
  const activeView: AppView = !player && !isPublicView ? 'home' : view;

  const navItems: Array<{ id: AppView; label: string; requiresPlayer?: boolean }> = player
    ? [
        { id: 'lobby', label: 'Lobby' },
        { id: 'games', label: 'Games' },
        { id: 'multiplayer', label: 'Multiplayer' },
        { id: 'leaderboard', label: 'Leaderboard' },
        { id: 'link_preview', label: 'Link Preview' },
        { id: 'profile', label: 'Profile' },
      ]
    : [
        { id: 'home', label: 'Home' },
        { id: 'games', label: 'Games', requiresPlayer: true },
        { id: 'multiplayer', label: 'Multiplayer', requiresPlayer: true },
        { id: 'leaderboard', label: 'Leaderboard' },
        { id: 'link_preview', label: 'Link Preview' },
      ];

  return (
    <div
      className={`min-h-screen bg-[#07090F] text-[#F8FAFC] flex flex-col ${
        player?.settings.reducedMotion ? 'reduce-motion' : ''
      }`}
    >
      {/* Top Bar Contract: 3 Clean Horizontal Zones */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#07090F]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          {/* Zone 1: Brand */}
          <button
            type="button"
            onClick={() => navigate(player ? 'lobby' : 'home')}
            className="flex items-center gap-3 text-left shrink-0 cursor-pointer"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E11D48] bg-[#10141F] font-display text-base font-bold text-white">
              G
            </div>
            <div className="leading-none">
              <span className="block font-display text-base font-bold tracking-tight text-white">
                GAMEVERSE
              </span>
              <span className="hidden sm:block mt-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[#F59E0B]">
                Play · Compete · Earn
              </span>
            </div>
          </button>

          {/* Zone 2: Single-Line Navigation */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive =
                activeView === item.id ||
                (item.id === 'games' &&
                  (activeView === 'tictactoe' || activeView === 'rps' || activeView === 'guess_number'));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.requiresPlayer && !player) {
                      handlePlayAction(item.id);
                    } else {
                      navigate(item.id);
                    }
                  }}
                  className={`relative py-1 text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[21px] h-0.5 bg-[#E11D48]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action & Utility */}
          <div className="flex items-center gap-3 shrink-0">
            {player ? (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => void handleMarkNotificationsRead()}
                    aria-label="Notifications"
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#10141F] text-slate-300 transition hover:border-white/25 hover:text-white cursor-pointer"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E11D48] px-1 font-mono text-[10px] font-bold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/[0.12] bg-[#10141F] p-4 shadow-2xl z-50">
                      <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                        <span className="font-display text-sm font-bold text-white">Notifications</span>
                        <button
                          type="button"
                          onClick={() => setNotifOpen(false)}
                          className="text-xs text-slate-400 hover:text-white cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                      <div className="mt-3 max-h-64 space-y-2.5 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="py-4 text-center text-xs text-slate-400">No notifications yet.</p>
                        ) : (
                          notifications.slice(0, 8).map((n) => (
                            <div key={n.id} className="rounded-lg border border-white/[0.06] bg-[#0B0E17] p-2.5">
                              <p className="text-xs font-semibold text-white">{n.title}</p>
                              <p className="mt-0.5 text-[11px] text-slate-400">{n.message}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => navigate('profile')}
                  className="hidden sm:flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#10141F] px-2.5 py-1.5 text-xs font-medium text-white transition hover:border-white/25 cursor-pointer"
                >
                  <PlayerAvatar
                    username={player.username}
                    profilePictureUrl={player.profilePictureUrl}
                    activeFrame={player.activeFrame}
                    size="sm"
                  />
                  <span className="font-mono text-[#F59E0B] tabular-nums">
                    {player.coins.toLocaleString()}c
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#10141F] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#E11D48] hover:text-white cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Switch Name</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handlePlayAction('lobby')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#BE123C] cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                PLAY NOW
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle Menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-[#10141F] text-slate-200 md:hidden cursor-pointer"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="border-t border-white/[0.08] bg-[#0B0E17] px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.requiresPlayer && !player) {
                      handlePlayAction(item.id);
                    } else {
                      navigate(item.id);
                    }
                  }}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                    activeView === item.id
                      ? 'bg-[#E11D48] text-white'
                      : 'text-slate-300 hover:bg-white/[0.05]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Incoming Live Multiplayer Invitations */}
      {player && rt.pendingInvites.length > 0 && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6 space-y-2">
          {rt.pendingInvites.map((invite) => (
            <div
              key={`${invite.roomId}-${invite.createdAt}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
            >
              <div className="flex items-center gap-2.5">
                <Users className="h-4 w-4 shrink-0 text-[#F59E0B]" />
                <span>
                  <strong>{invite.fromUsername}</strong> invited you to a live{' '}
                  <strong className="capitalize">{invite.gameId.replace('_', ' ')}</strong> match (Room{' '}
                  <code className="font-mono text-[#F59E0B]">{invite.roomCode}</code>)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    wsClient.joinRoom(invite.roomId);
                    wsClient.dismissInvite(invite.roomId);
                    navigate('multiplayer');
                  }}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                >
                  Accept & Join
                </button>
                <button
                  type="button"
                  onClick={() => wsClient.dismissInvite(invite.roomId)}
                  className="rounded-lg border border-white/[0.15] px-3 py-1.5 text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Celebratory Achievement / Challenge Toast */}
      {toastBanner && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="font-medium">{toastBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastBanner(null)}
              className="text-xs text-emerald-300 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {activeView === 'home' && (
          <HomepageHero
            publicStats={{
              onlinePlayers: Math.max(publicStats.onlinePlayers, rt.onlinePlayers.length),
              activeRooms: Math.max(publicStats.activeRooms, rt.publicRooms.length),
              totalPlayers: publicStats.totalPlayers,
              totalMatches: publicStats.totalMatches,
            }}
            topLeaders={topLeaders}
            onPlayNow={(desired) => handlePlayAction(desired || 'lobby')}
            onNavigatePublic={(publicView) => navigate(publicView)}
          />
        )}

        {activeView === 'lobby' && player && (
          <div className="space-y-10">
            {/* Lobby Welcome & Mode Launcher */}
            <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#10141F]">
              <img
                src={GAME_ASSETS.heroArena}
                alt="GAMEVERSE strategy arena"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#07090F] via-[#07090F]/88 to-[#07090F]/45" />

              <div className="relative z-10 grid grid-cols-1 gap-8 p-6 sm:p-10 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-7 space-y-5">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar
                      username={player.username}
                      profilePictureUrl={player.profilePictureUrl}
                      activeFrame={player.activeFrame}
                      size="lg"
                    />
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#F59E0B]">
                        Arena Lobby · Ready to Play
                      </p>
                      <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        {player.username}
                      </h1>
                    </div>
                  </div>

                  <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                    Challenge intelligent AI opponents, enter live human matchmaking rooms, or blend real players and AI bots together in Mixed Arenas. Every completed match grows your Level, Coins, and Leaderboard rank.
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('multiplayer')}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#BE123C] cursor-pointer"
                    >
                      <Users className="h-4 w-4" />
                      Multiplayer & Mixed Rooms ({rt.onlinePlayers.length} online)
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('tictactoe')}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.15] bg-[#10141F]/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#E11D48] cursor-pointer"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      Tic-Tac-Toe
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('rps')}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.15] bg-[#10141F]/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#F59E0B] cursor-pointer"
                    >
                      Rock-Paper-Scissors
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('guess_number')}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.15] bg-[#10141F]/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald-500 cursor-pointer"
                    >
                      Guess the Number
                    </button>
                  </div>
                </div>

                {/* Live Campaign Telemetry Panel */}
                <div className="lg:col-span-5 rounded-xl border border-white/[0.1] bg-[#0B0E17]/90 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-bold text-white">
                      Level {player.level} Campaign
                    </span>
                    <span className="font-mono text-xs text-[#F59E0B] tabular-nums">
                      {player.xp.toLocaleString()} Total XP
                    </span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                      <span>Next Level Progress</span>
                      <span className="font-mono text-white">
                        {player.currentLevelXp} / {player.nextLevelXp} XP
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#151B2B]">
                      <div
                        className="h-full rounded-full bg-[#E11D48] transition-all duration-300"
                        style={{ width: `${xpPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-1 text-center">
                    <div className="rounded-lg border border-white/[0.06] bg-[#10141F] p-3">
                      <p className="text-[11px] text-slate-400">Game Coins</p>
                      <p className="mt-1 font-mono text-lg font-bold text-[#F59E0B] tabular-nums">
                        {player.coins}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-[#10141F] p-3">
                      <p className="text-[11px] text-slate-400">Win Streak</p>
                      <p className="mt-1 font-mono text-lg font-bold text-[#E11D48] tabular-nums">
                        {player.currentStreak}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-[#10141F] p-3">
                      <p className="text-[11px] text-slate-400">Live Rooms</p>
                      <p className="mt-1 font-mono text-lg font-bold text-emerald-400 tabular-nums">
                        {rt.publicRooms.length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Featured Games Grid */}
            <section className="space-y-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#E11D48]">
                    Solo AI · Online Humans · Mixed Arenas
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-white">Select Your Arena</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('games')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                >
                  Rules & Breakdown <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {GAME_CATALOG.map((game) => {
                  const st = player.stats.byGame[game.id];
                  const targetView: AppView = game.id;
                  return (
                    <article
                      key={game.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#10141F] transition hover:border-white/25"
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#07090F]">
                        <img
                          src={GAME_ART_MAP[game.id]}
                          alt={`${game.name} arena illustration`}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#10141F] via-transparent to-transparent" />
                        <span
                          className="absolute left-4 bottom-3 font-mono text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: game.accentHex }}
                        >
                          {game.difficultySummary}
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                        <div>
                          <h3 className="font-display text-xl font-bold text-white">{game.name}</h3>
                          <p className="mt-1 text-xs font-medium text-slate-400">{game.tagline}</p>
                          <p className="mt-2.5 text-sm text-slate-300 leading-relaxed">
                            {game.description}
                          </p>
                        </div>

                        <div className="space-y-3 border-t border-white/[0.08] pt-4">
                          <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                            <span>
                              Record: <strong className="text-white">{st.wins}W</strong> / {st.played}G
                            </span>
                            <span className="font-mono text-[#F59E0B]">Best {st.bestScore} pts</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                soundFx.playSelect();
                                navigate(targetView);
                              }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#E11D48] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#BE123C] cursor-pointer"
                            >
                              <Gamepad2 className="h-4 w-4" />
                              Play Solo / Local
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenMultiplayerForGame(game.id)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/40 cursor-pointer"
                            >
                              <Bot className="h-3.5 w-3.5" />
                              Online
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopyGameLink(game.id)}
                              title="Copy shareable game link with Open Graph preview"
                              className="rounded-lg border border-white/[0.1] bg-[#0B0E17] px-3 py-2.5 text-xs font-medium text-slate-300 transition hover:border-white/25 hover:text-white cursor-pointer"
                            >
                              {copiedQuickLink === game.id ? 'Copied' : <Link2 className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Operational Workbench: Challenges, Leaderboard, Link Preview & Recent Matches */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7 space-y-6">
                <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-white">Active Challenges</h2>
                      <p className="text-xs text-slate-400">Complete daily & weekly goals for bonus XP and Coins</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('profile')}
                      className="text-xs font-semibold text-[#E11D48] hover:underline cursor-pointer"
                    >
                      View All
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {challenges.slice(0, 4).map((c) => {
                      const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.targetCount)) * 100));
                      return (
                        <div key={c.id} className="rounded-lg border border-white/[0.06] bg-[#0B0E17] p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-wider text-[#F59E0B]">
                                {c.kind}
                              </span>
                              <h3 className="font-display text-sm font-bold text-white">{c.title}</h3>
                              <p className="text-xs text-slate-400">{c.description}</p>
                            </div>
                            <span className="shrink-0 font-mono text-xs text-emerald-400">
                              +{c.xpReward} XP · +{c.coinReward}c
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#161C2C]">
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
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                    <h2 className="font-display text-lg font-bold text-white">Recently Played Matches</h2>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">{matches.length} recent</span>
                  </div>
                  {matches.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-400">
                      You have not completed a match yet. Launch Tic-Tac-Toe, Rock-Paper-Scissors, Guess the Number, or join Multiplayer above.
                    </p>
                  ) : (
                    <div className="mt-4 divide-y divide-white/[0.06]">
                      {matches.slice(0, 5).map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 py-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-white capitalize">
                              {m.gameId.replace('_', ' ')} ·{' '}
                              <span
                                className={
                                  m.outcome === 'win'
                                    ? 'text-emerald-400'
                                    : m.outcome === 'draw'
                                    ? 'text-amber-300'
                                    : 'text-rose-400'
                                }
                              >
                                {m.outcome.toUpperCase()}
                              </span>
                            </p>
                            <p className="truncate text-slate-400">{m.summary}</p>
                          </div>
                          <span className="shrink-0 font-mono text-[#F59E0B] tabular-nums">
                            +{m.scoreDelta} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-[#F59E0B]" />
                      <h2 className="font-display text-lg font-bold text-white">Leaderboard Top 5</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('leaderboard')}
                      className="text-xs font-semibold text-[#E11D48] hover:underline cursor-pointer"
                    >
                      Full Rankings
                    </button>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {topLeaders.map((entry) => (
                      <div
                        key={entry.playerId}
                        className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
                          entry.isCurrentPlayer
                            ? 'border-[#E11D48]/50 bg-[#E11D48]/10'
                            : 'border-white/[0.06] bg-[#0B0E17]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 font-mono text-xs font-bold text-slate-400 tabular-nums">
                            #{entry.rank}
                          </span>
                          <PlayerAvatar
                            username={entry.username}
                            profilePictureUrl={entry.profilePictureUrl}
                            activeFrame={entry.activeFrame}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white">
                              {entry.username}
                              {entry.isCurrentPlayer ? ' (You)' : ''}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500">
                              L{entry.level} · {entry.winRate}% win
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#F59E0B] tabular-nums">
                          {entry.points.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-6 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <Globe className="h-5 w-5 text-[#E11D48]" />
                    <h2 className="font-display text-lg font-bold text-white">Link Preview & Sharing</h2>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Generate live Open Graph & Twitter share previews for any GAMEVERSE game link or external URL, verify images, and share cleanly on WhatsApp, Telegram, Facebook, or X.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => navigate('link_preview')}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2 text-xs font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Open Link Preview Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('profile')}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#0B0E17] px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/25 cursor-pointer"
                    >
                      <Award className="h-3.5 w-3.5 text-[#F59E0B]" />
                      Cosmetic Rewards ({player.coins}c)
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeView === 'games' && player && (
          <div className="space-y-8">
            <div className="border-b border-white/[0.08] pb-6">
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#E11D48]">
                Three Complete Arenas
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold text-white">GAMEVERSE Arcade Catalog</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Launch Solo vs AI, Local 2-Player, Online vs Humans, or Mixed AI + Human matches on any game below.
              </p>
            </div>

            <div className="space-y-6">
              {GAME_CATALOG.map((game) => {
                const st = player.stats.byGame[game.id];
                return (
                  <div
                    key={game.id}
                    className="grid grid-cols-1 overflow-hidden rounded-xl border border-white/[0.08] bg-[#10141F] lg:grid-cols-12"
                  >
                    <div className="lg:col-span-4 aspect-[4/3] lg:aspect-auto bg-[#07090F]">
                      <img
                        src={GAME_ART_MAP[game.id]}
                        alt={game.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="lg:col-span-8 p-6 flex flex-col justify-between space-y-5">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="font-display text-2xl font-bold text-white">{game.name}</h2>
                          <span className="font-mono text-xs text-[#F59E0B]">{game.difficultySummary}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">{game.description}</p>
                        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-slate-400">
                          {game.rules.map((r) => (
                            <li key={r} className="rounded-lg border border-white/[0.06] bg-[#0B0E17] px-3 py-2">
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-4">
                        <div className="flex gap-5 font-mono text-xs text-slate-300 tabular-nums">
                          <span>Played: {st.played}</span>
                          <span className="text-emerald-400">Wins: {st.wins}</span>
                          <span className="text-[#F59E0B]">Best Score: {st.bestScore}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(game.id)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            Solo / Local
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenMultiplayerForGame(game.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40 cursor-pointer"
                          >
                            <Users className="h-3.5 w-3.5" />
                            Online / Mixed Arena
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeView === 'multiplayer' && player && (
          <MultiplayerSection
            player={player}
            defaultGame={multiplayerGame}
            onRefreshProfile={() => void refreshPlayerProfile()}
            onSwitchToSoloAi={(gameId) => navigate(gameId)}
          />
        )}

        {activeView === 'tictactoe' && player && (
          <TicTacToeGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onOpenMultiplayer={() => handleOpenMultiplayerForGame('tictactoe')}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'rps' && player && (
          <RockPaperScissorsGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onOpenMultiplayer={() => handleOpenMultiplayerForGame('rps')}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'guess_number' && player && (
          <GuessNumberGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onOpenMultiplayer={() => handleOpenMultiplayerForGame('guess_number')}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'leaderboard' && <LeaderboardSection />}

        {activeView === 'link_preview' && (
          <LinkPreviewSection onShared={() => void loadProgressionAndBoard()} />
        )}

        {activeView === 'profile' && player && (
          <ProfileRewardsSection
            player={player}
            challenges={challenges}
            achievements={achievements}
            rewards={rewards}
            matches={matches}
            onPlayerUpdated={(p) => setPlayer(p)}
            onRefreshProgression={() => void loadProgressionAndBoard()}
          />
        )}

        {activeView === 'admin' && <AdminDashboard />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#0B0E17] py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-display font-bold text-white">GAMEVERSE</span>
            <span>Play. Compete. Earn. Conquer.</span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Coins className="h-3.5 w-3.5 text-[#F59E0B]" /> Virtual reward points only
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => navigate('link_preview')} className="hover:text-white cursor-pointer">
              Link Preview
            </button>
            <button type="button" onClick={() => navigate('leaderboard')} className="hover:text-white cursor-pointer">
              Leaderboard
            </button>
            {player && (
              <button type="button" onClick={() => navigate('profile')} className="hover:text-white cursor-pointer">
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Profile
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('admin')}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-white cursor-pointer"
            >
              <Shield className="h-3.5 w-3.5" /> Owner Admin
            </button>
          </div>
        </div>
      </footer>

      {/* Username-Only Entry Modal */}
      {entryModalOpen && (
        <UsernameEntryModal
          initialPrompt={
            pendingRoomCode
              ? `Choose a unique username to join live Multiplayer Room ${pendingRoomCode}.`
              : undefined
          }
          onEntered={(enteredPlayer, token) => void handleAuthenticated(enteredPlayer, token)}
          onClose={() => {
            setEntryModalOpen(false);
            setPendingTargetView(null);
            setPendingRoomCode(null);
          }}
        />
      )}

      {/* Session Expiration Recovery Modal */}
      {sessionExpiredModal.open && (
        <SessionRecoveryModal
          defaultUsername={player?.username || ''}
          message={sessionExpiredModal.message}
          onRecovered={(p, token) => void handleAuthenticated(p, token)}
          onSignOutFully={() => void handleLogout()}
        />
      )}
    </div>
  );
}

export default App;
