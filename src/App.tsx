import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Bell,
  ChevronRight,
  Clock,
  Coins,
  Flame,
  Gamepad2,
  Globe,
  Heart,
  Link2,
  LogOut,
  Megaphone,
  Menu,
  Play,
  Search,
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
import { getGameArtwork, HomepageHero } from './components/HomepageHero.tsx';
import { LeaderboardSection } from './components/LeaderboardSection.tsx';
import { LinkPreviewSection } from './components/LinkPreviewSection.tsx';
import { MultiplayerSection } from './components/MultiplayerSection.tsx';
import { PlayerAvatar } from './components/PlayerAvatar.tsx';
import { ProfileRewardsSection } from './components/ProfileRewardsSection.tsx';
import { RockPaperScissorsGame } from './components/RockPaperScissorsGame.tsx';
import { SessionRecoveryModal } from './components/SessionRecoveryModal.tsx';
import { TicTacToeGame } from './components/TicTacToeGame.tsx';
import { TournamentsSection } from './components/TournamentsSection.tsx';
import { BattleshipGame } from './components/games/BattleshipGame.tsx';
import { CheckersGame } from './components/games/CheckersGame.tsx';
import { ChessGame } from './components/games/ChessGame.tsx';
import { ConnectFiveGame } from './components/games/ConnectFiveGame.tsx';
import { ConnectFourGame } from './components/games/ConnectFourGame.tsx';
import { DotsAndBoxesGame } from './components/games/DotsAndBoxesGame.tsx';
import { HangmanGame } from './components/games/HangmanGame.tsx';
import { LudoGame } from './components/games/LudoGame.tsx';
import { MemoryMatchGame } from './components/games/MemoryMatchGame.tsx';
import { MinesweeperGame } from './components/games/MinesweeperGame.tsx';
import { PatternRecognitionGame } from './components/games/PatternRecognitionGame.tsx';
import { QuickMathGame } from './components/games/QuickMathGame.tsx';
import { ReactionTestGame } from './components/games/ReactionTestGame.tsx';
import { ReversiGame } from './components/games/ReversiGame.tsx';
import { SnakeGame } from './components/games/SnakeGame.tsx';
import { SudokuGame } from './components/games/SudokuGame.tsx';
import { TriviaChallengeGame } from './components/games/TriviaChallengeGame.tsx';
import { WordBattleGame } from './components/games/WordBattleGame.tsx';
import { WordScrambleGame } from './components/games/WordScrambleGame.tsx';
import { ALL_GAME_IDS, DEFAULT_CHALLENGES, GAME_CATALOG, GAME_CATEGORIES, MULTIPLAYER_GAME_IDS } from './game/catalog.ts';
import {
  getLocalInstantMatches,
  getOrCreateInstantLocalPlayer,
  saveInstantLocalPlayer,
} from './game/localArcadeEngine.ts';
import type {
  AchievementItem,
  AppView,
  ChallengeItem,
  CosmeticRewardItem,
  GameCategory,
  GameId,
  LeaderboardEntry,
  MatchRecord,
  MultiplayerGameId,
  NotificationItem,
  PlatformAnnouncement,
  PlayerProfile,
  TournamentItem,
} from './types.ts';
import { apiFetch, getStoredPlayerToken, setStoredPlayerToken } from './utils/api.ts';
import {
  ensureAnonymousGuestSession,
  parseLocationToRoute,
  resolveGameIdFromSlug,
  viewToPath,
} from './utils/gameLauncher.ts';
import { soundFx } from './utils/sound.ts';
import { wsClient, type RealtimeSnapshot } from './utils/wsClient.ts';

export function App() {
  const initialRoute = parseLocationToRoute();
  const initialHasStoredToken = Boolean(getStoredPlayerToken());
  const initialNeedsInstantSolo =
    initialRoute.matched &&
    (initialRoute.view === 'lobby' ||
      initialRoute.view === 'profile' ||
      ALL_GAME_IDS.includes(initialRoute.view as GameId));

  const [booting, setBooting] = useState(
    Boolean(initialHasStoredToken || initialRoute.view === 'multiplayer')
  );
  const [player, setPlayer] = useState<PlayerProfile | null>(() =>
    initialNeedsInstantSolo && !initialHasStoredToken ? getOrCreateInstantLocalPlayer() : null
  );
  const [view, setView] = useState<AppView>(initialRoute.view);
  const [invalidRoutePath, setInvalidRoutePath] = useState<string | null>(
    initialRoute.matched ? null : initialRoute.invalidPath
  );
  const [multiplayerGame, setMultiplayerGame] = useState<GameId>(
    initialRoute.multiplayerGame || 'tictactoe'
  );
  const [selectedCategory, setSelectedCategory] = useState<'All' | GameCategory>('All');
  const [librarySearch, setLibrarySearch] = useState('');
  const [recentGameIds, setRecentGameIds] = useState<GameId[]>(() => {
    try {
      const raw = localStorage.getItem('playnova_recent_games');
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      return parsed.filter((id): id is GameId => ALL_GAME_IDS.includes(id as GameId)).slice(0, 8);
    } catch {
      return [];
    }
  });
  const [rt, setRt] = useState<RealtimeSnapshot>(wsClient.getSnapshot());

  const [enteringGuest, setEnteringGuest] = useState(false);
  const [launchError, setLaunchError] = useState<{
    message: string;
    retryView: AppView;
    retryMultiplayerGame?: GameId;
  } | null>(null);

  const [publicStats, setPublicStats] = useState({
    onlinePlayers: 0,
    activeRooms: 0,
    totalPlayers: 0,
    totalMatches: 0,
  });

  const [tournaments, setTournaments] = useState<TournamentItem[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [rewards, setRewards] = useState<CosmeticRewardItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>(() =>
    initialNeedsInstantSolo && !initialHasStoredToken ? getLocalInstantMatches() : []
  );
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

  const recordRecentGame = useCallback((gameId: GameId) => {
    setRecentGameIds((prev) => {
      const next = [gameId, ...prev.filter((id) => id !== gameId)].slice(0, 8);
      try {
        localStorage.setItem('playnova_recent_games', JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  const navigate = useCallback((nextView: AppView, mpGameOverride?: MultiplayerGameId) => {
    setView(nextView);
    setInvalidRoutePath(null);
    setLaunchError(null);
    setMobileNavOpen(false);
    setNotifOpen(false);
    if (ALL_GAME_IDS.includes(nextView as GameId)) {
      recordRecentGame(nextView as GameId);
    }
    if (typeof window !== 'undefined') {
      const targetPath = viewToPath(nextView, nextView === 'multiplayer' ? mpGameOverride : undefined);
      const currentFull = `${window.location.pathname}${window.location.search}`;
      if (currentFull !== targetPath) {
        window.history.pushState({ view: nextView }, '', targetPath);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [recordRecentGame]);

  const loadPublicTelemetry = useCallback(async () => {
    try {
      const [statsRes, boardRes, tourRes, annRes] = await Promise.all([
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
        apiFetch<{ tournaments: TournamentItem[] }>('/api/tournaments', {}, { suppressSessionEvent: true }),
        apiFetch<{ announcements: PlatformAnnouncement[] }>('/api/announcements', {}, { suppressSessionEvent: true }),
      ]);
      setPublicStats(statsRes);
      setTopLeaders((boardRes.leaderboard || []).slice(0, 5));
      setTournaments(tourRes.tournaments || []);
      setAnnouncements(annRes.announcements || []);
    } catch {
      // non-fatal public telemetry fetch
    }
  }, []);

  const loadProgressionAndBoard = useCallback(async () => {
    if (playerRef.current?.id.startsWith('local-')) {
      setMatches(getLocalInstantMatches());
      await loadPublicTelemetry();
      return;
    }
    try {
      const [prog, board, statsRes, tourRes, annRes] = await Promise.all([
        apiFetch<{
          challenges: ChallengeItem[];
          achievements: AchievementItem[];
          rewards: CosmeticRewardItem[];
          notifications: NotificationItem[];
          matches: MatchRecord[];
        }>('/api/progression', {}, { suppressSessionEvent: true }),
        apiFetch<{ leaderboard: LeaderboardEntry[] }>(
          '/api/leaderboard?game=all&period=all',
          {},
          { suppressSessionEvent: true }
        ),
        apiFetch<{
          onlinePlayers: number;
          activeRooms: number;
          totalPlayers: number;
          totalMatches: number;
        }>('/api/public/stats', {}, { suppressSessionEvent: true }),
        apiFetch<{ tournaments: TournamentItem[] }>('/api/tournaments', {}, { suppressSessionEvent: true }),
        apiFetch<{ announcements: PlatformAnnouncement[] }>('/api/announcements', {}, { suppressSessionEvent: true }),
      ]);
      setChallenges(prog.challenges || []);
      setAchievements(prog.achievements || []);
      setRewards(prog.rewards || []);
      setNotifications(prog.notifications || []);
      setMatches(prog.matches || []);
      setTopLeaders((board.leaderboard || []).slice(0, 5));
      setPublicStats(statsRes);
      setTournaments(tourRes.tournaments || []);
      setAnnouncements(annRes.announcements || []);
    } catch {
      // non-fatal progression fetch
    }
  }, [loadPublicTelemetry]);

  const syncGuestSessionInBackground = useCallback(async () => {
    try {
      const { player: serverPlayer, token } = await ensureAnonymousGuestSession();
      if (token) {
        setStoredPlayerToken(token);
        wsClient.connect(token);
      }
      const current = playerRef.current;
      const keepLocalProgress =
        current && current.id.startsWith('local-') && current.stats.totalPlayed > 0;
      if (!keepLocalProgress) {
        setPlayer(serverPlayer);
        soundFx.configure(serverPlayer.settings.soundEnabled, serverPlayer.settings.soundVolume);
        setSessionExpiredModal({ open: false, message: '' });
        try {
          const prog = await apiFetch<{
            challenges: ChallengeItem[];
            achievements: AchievementItem[];
            rewards: CosmeticRewardItem[];
            notifications: NotificationItem[];
            matches: MatchRecord[];
          }>('/api/progression', {}, { suppressSessionEvent: true });
          setChallenges(prog.challenges || []);
          setAchievements(prog.achievements || []);
          setRewards(prog.rewards || []);
          setNotifications(prog.notifications || []);
          setMatches(prog.matches || []);
        } catch {
          // ignore if progression fails
        }
      }
    } catch {
      // Backend guest session unavailable (e.g. static hosting / offline) — keep local instant play active with zero disruption
    }
  }, []);

  const refreshPlayerProfile = useCallback(async () => {
    if (playerRef.current?.id.startsWith('local-')) {
      setMatches(getLocalInstantMatches());
      return;
    }
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

  // Bootstrap session + public telemetry (non-blocking for solo games & lobby)
  useEffect(() => {
    let active = true;
    async function init() {
      void loadPublicTelemetry();
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
          const current = playerRef.current;
          const keepLocalProgress =
            current && current.id.startsWith('local-') && current.stats.totalPlayed > 0;
          if (!keepLocalProgress) {
            setPlayer(res.player);
            soundFx.configure(res.player.settings.soundEnabled, res.player.settings.soundVolume);
            await loadProgressionAndBoard();
          }
        } else {
          setStoredPlayerToken(null);
          const parsed = parseLocationToRoute();
          const needsMultiplayer = parsed.matched && parsed.view === 'multiplayer';
          const needsSoloInstant =
            parsed.matched &&
            (parsed.view === 'lobby' ||
              parsed.view === 'profile' ||
              ALL_GAME_IDS.includes(parsed.view as GameId));

          if (needsMultiplayer) {
            await enterAsAnonymousGuest('multiplayer', parsed.multiplayerGame || undefined);
          } else if (needsSoloInstant) {
            if (!playerRef.current) {
              const localGuest = getOrCreateInstantLocalPlayer();
              setPlayer(localGuest);
              setMatches(getLocalInstantMatches());
              soundFx.configure(localGuest.settings.soundEnabled, localGuest.settings.soundVolume);
            }
            void syncGuestSessionInBackground();
          }
        }
      } catch (err) {
        const errData = err as Error & { status?: number };
        if (errData.status === 401) {
          setStoredPlayerToken(null);
        }
        const parsed = parseLocationToRoute();
        const needsMultiplayer = parsed.matched && parsed.view === 'multiplayer';
        const needsSoloInstant =
          parsed.matched &&
          (parsed.view === 'lobby' ||
            parsed.view === 'profile' ||
            ALL_GAME_IDS.includes(parsed.view as GameId));
        if (active && needsSoloInstant && !playerRef.current) {
          const localGuest = getOrCreateInstantLocalPlayer();
          setPlayer(localGuest);
          setMatches(getLocalInstantMatches());
          soundFx.configure(localGuest.settings.soundEnabled, localGuest.settings.soundVolume);
        } else if (active && needsMultiplayer) {
          await enterAsAnonymousGuest('multiplayer', parsed.multiplayerGame || undefined);
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
      const parsed = parseLocationToRoute();
      setView(parsed.view);
      setInvalidRoutePath(parsed.matched ? null : parsed.invalidPath);
      if (parsed.multiplayerGame) {
        setMultiplayerGame(parsed.multiplayerGame);
      }
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
        message: custom.detail?.message || 'Your guest session expired. Restore your progress or launch a fresh guest session.',
      });
    }
    window.addEventListener('gv:session-expired', onSessionExpired);
    return () => window.removeEventListener('gv:session-expired', onSessionExpired);
  }, []);

  useEffect(() => {
    if (!player) return;
    soundFx.configure(player.settings.soundEnabled, player.settings.soundVolume);
  }, [player]);

  const handleAuthenticated = async (
    authedPlayer: PlayerProfile,
    token?: string,
    targetViewOverride?: AppView,
    mpGameOverride?: MultiplayerGameId
  ) => {
    const activeToken = token || getStoredPlayerToken();
    if (activeToken) {
      setStoredPlayerToken(activeToken);
      wsClient.connect(activeToken);
    }
    setPlayer(authedPlayer);
    setLaunchError(null);
    setSessionExpiredModal({ open: false, message: '' });
    soundFx.configure(authedPlayer.settings.soundEnabled, authedPlayer.settings.soundVolume);
    await loadProgressionAndBoard();

    const nextView = targetViewOverride || 'lobby';
    navigate(nextView === 'home' ? 'lobby' : nextView, mpGameOverride);
  };

  const enterAsAnonymousGuest = async (
    desiredView: AppView = 'lobby',
    mpGameOverride?: MultiplayerGameId
  ) => {
    setEnteringGuest(true);
    setLaunchError(null);
    try {
      const { player: guestPlayer, token } = await ensureAnonymousGuestSession();
      soundFx.playWin();
      await handleAuthenticated(guestPlayer, token, desiredView, mpGameOverride);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not initialize PLAYNOVA guest session.';
      setLaunchError({
        message,
        retryView: desiredView,
        retryMultiplayerGame: mpGameOverride,
      });
      setToastBanner(message);
    } finally {
      setEnteringGuest(false);
    }
  };

  const handleProgressUpdated = (
    updatedPlayer: PlayerProfile,
    newlyUnlocked?: string[],
    completedChallenges?: string[]
  ) => {
    setPlayer(updatedPlayer);
    if (updatedPlayer.id.startsWith('local-')) {
      saveInstantLocalPlayer(updatedPlayer);
      setMatches(getLocalInstantMatches());
    } else {
      void loadProgressionAndBoard();
    }

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
    const resolvedTarget: AppView =
      typeof desiredView === 'string' && desiredView !== 'home' && desiredView !== 'lobby' &&
      desiredView !== 'games' && desiredView !== 'multiplayer' && desiredView !== 'tournaments' &&
      desiredView !== 'leaderboard' && desiredView !== 'link_preview' && desiredView !== 'profile' &&
      desiredView !== 'admin'
        ? resolveGameIdFromSlug(desiredView) || 'lobby'
        : desiredView;

    if (resolvedTarget === 'multiplayer') {
      handleOpenMultiplayerForGame();
      return;
    }

    soundFx.playSelect();
    if (!player) {
      const localGuest = getOrCreateInstantLocalPlayer();
      setPlayer(localGuest);
      setMatches(getLocalInstantMatches());
      soundFx.configure(localGuest.settings.soundEnabled, localGuest.settings.soundVolume);
      navigate(resolvedTarget);
      void syncGuestSessionInBackground();
      return;
    }

    navigate(resolvedTarget);
    if (player.id.startsWith('local-')) {
      void syncGuestSessionInBackground();
    }
  };

  const handleOpenMultiplayerForGame = (gameId?: GameId) => {
    const mpTarget: MultiplayerGameId =
      gameId && MULTIPLAYER_GAME_IDS.includes(gameId as MultiplayerGameId)
        ? (gameId as MultiplayerGameId)
        : 'tictactoe';
    setMultiplayerGame(mpTarget);
    if (player && !player.id.startsWith('local-')) {
      navigate('multiplayer', mpTarget);
      return;
    }
    void enterAsAnonymousGuest('multiplayer', mpTarget);
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
      <div className="min-h-screen bg-[#060811] flex flex-col items-center justify-center text-slate-300">
        <div className="h-11 w-11 rounded-xl border border-[#8B5CF6]/60 bg-gradient-to-br from-[#8B5CF6] to-[#38BDF8] flex items-center justify-center font-display text-lg font-bold text-white shadow-[0_0_24px_rgba(139,92,246,0.45)]">
          P
        </div>
        <p className="mt-4 font-display text-sm tracking-widest uppercase text-slate-400">
          Loading PLAYNOVA Universe...
        </p>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const xpPercent = player
    ? Math.min(100, Math.round((player.currentLevelXp / Math.max(1, player.nextLevelXp)) * 100))
    : 0;

  const isPublicView =
    view === 'home' ||
    view === 'games' ||
    view === 'tournaments' ||
    view === 'leaderboard' ||
    view === 'link_preview' ||
    view === 'admin';
  const activeView: AppView = !player && !isPublicView ? 'home' : view;

  const isGameDetailView = ALL_GAME_IDS.includes(activeView as GameId);

  const navItems: Array<{ id: AppView; label: string; requiresPlayer?: boolean }> = player
    ? [
        { id: 'lobby', label: 'Lobby' },
        { id: 'games', label: 'Games' },
        { id: 'multiplayer', label: 'Multiplayer' },
        { id: 'tournaments', label: 'Tournaments' },
        { id: 'leaderboard', label: 'Leaderboard' },
        { id: 'link_preview', label: 'Link Preview' },
        { id: 'profile', label: 'Profile' },
      ]
    : [
        { id: 'home', label: 'Home' },
        { id: 'games', label: 'Games', requiresPlayer: true },
        { id: 'multiplayer', label: 'Multiplayer', requiresPlayer: true },
        { id: 'tournaments', label: 'Tournaments' },
        { id: 'leaderboard', label: 'Leaderboard' },
        { id: 'link_preview', label: 'Link Preview' },
      ];

  const normalizedQuery = librarySearch.trim().toLowerCase();
  const filteredCatalog = GAME_CATALOG.filter((g) => {
    const catOk = selectedCategory === 'All' || g.categories.includes(selectedCategory);
    if (!catOk) return false;
    if (!normalizedQuery) return true;
    return (
      g.name.toLowerCase().includes(normalizedQuery) ||
      g.tagline.toLowerCase().includes(normalizedQuery) ||
      g.description.toLowerCase().includes(normalizedQuery) ||
      g.categories.some((c) => c.toLowerCase().includes(normalizedQuery))
    );
  });

  const popularCatalog = GAME_CATALOG.filter((g) => g.popularChallenge).slice(0, 6);
  const recentlyPlayedCatalog = recentGameIds
    .map((gid) => GAME_CATALOG.find((g) => g.id === gid))
    .filter((g): g is (typeof GAME_CATALOG)[number] => Boolean(g))
    .slice(0, 4);

  return (
    <div
      className={`min-h-screen bg-[#060811] text-[#F8FAFC] flex flex-col ${
        player?.settings.reducedMotion ? 'reduce-motion' : ''
      }`}
    >
      {/* Top Bar Contract: 3 Clean Horizontal Zones */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#060811]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          {/* Zone 1: Brand */}
          <button
            type="button"
            onClick={() => navigate(player ? 'lobby' : 'home')}
            className="flex items-center gap-3 text-left shrink-0 cursor-pointer"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#8B5CF6]/70 bg-gradient-to-br from-[#8B5CF6] to-[#38BDF8] font-display text-base font-bold text-white shadow-[0_0_16px_rgba(139,92,246,0.4)]">
              P
            </div>
            <div className="leading-none">
              <span className="block font-display text-base font-bold tracking-tight text-white">
                PLAYNOVA
              </span>
              <span className="hidden sm:block mt-0.5 text-[10px] font-mono uppercase tracking-[0.18em] text-[#38BDF8]">
                ENTER. COMPETE. CONQUER.
              </span>
            </div>
          </button>

          {/* Zone 2: Single-Line Navigation */}
          <nav className="hidden lg:flex items-center gap-5" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive =
                activeView === item.id || (item.id === 'games' && isGameDetailView);
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
                    <span className="absolute inset-x-0 -bottom-[21px] h-0.5 bg-[#8B5CF6]" />
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
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#0E1324] text-slate-300 transition hover:border-white/25 hover:text-white cursor-pointer"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#8B5CF6] px-1 font-mono text-[10px] font-bold text-white">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/[0.12] bg-[#0E1324] p-4 shadow-2xl z-50">
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
                            <div key={n.id} className="rounded-lg border border-white/[0.06] bg-[#090D1A] p-2.5">
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
                  className="hidden sm:flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0E1324] px-2.5 py-1.5 text-xs font-medium text-white transition hover:border-white/25 cursor-pointer"
                >
                  <PlayerAvatar
                    username={player.username}
                    profilePictureUrl={player.profilePictureUrl}
                    activeFrame={player.activeFrame}
                    avatarConfig={player.avatarConfig}
                    size="sm"
                  />
                  <span className="font-mono text-[#F97316] tabular-nums">
                    {player.coins.toLocaleString()}c
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#0E1324] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#8B5CF6] hover:text-white cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exit Session</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={enteringGuest}
                onClick={() => handlePlayAction('lobby')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#8B5CF6] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#7C3AED] shadow-[0_0_20px_rgba(139,92,246,0.35)] disabled:opacity-60 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {enteringGuest ? 'ENTERING...' : 'PLAY NOW'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle Menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-[#0E1324] text-slate-200 lg:hidden cursor-pointer"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="border-t border-white/[0.08] bg-[#090D1A] px-4 py-3 lg:hidden">
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
                      ? 'bg-[#8B5CF6] text-white'
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

      {/* Live Announcements Strip (when signed in or browsing Lobby) */}
      {announcements.length > 0 && activeView === 'lobby' && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#38BDF8]/30 bg-[#0E1324] px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 text-slate-200">
              <Megaphone className="h-4 w-4 shrink-0 text-[#38BDF8]" />
              <strong className="text-white">{announcements[0].title}:</strong>
              <span className="text-slate-300">{announcements[0].message}</span>
            </div>
            <span className="font-mono text-[10px] uppercase text-[#38BDF8]">{announcements[0].level}</span>
          </div>
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

      {/* Launch Error Banner with Solo Fallback & Retry */}
      {launchError && (
        <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/45 px-4 py-3 text-sm text-rose-100">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">
                {launchError.retryView === 'multiplayer'
                  ? 'Live Online Multiplayer Server Unavailable'
                  : 'Unable to connect to PLAYNOVA backend'}
              </p>
              <p className="mt-0.5 text-xs text-rose-200">{launchError.message}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {launchError.retryView === 'multiplayer' && (
                <button
                  type="button"
                  onClick={() => handlePlayAction(launchError.retryMultiplayerGame || 'tictactoe')}
                  className="rounded-lg bg-[#8B5CF6] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  Play Solo vs AI Instead
                </button>
              )}
              <button
                type="button"
                disabled={enteringGuest}
                onClick={() => {
                  if (launchError.retryView === 'multiplayer') {
                    handleOpenMultiplayerForGame(launchError.retryMultiplayerGame);
                  } else {
                    handlePlayAction(launchError.retryView);
                  }
                }}
                className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60 cursor-pointer"
              >
                {enteringGuest ? 'Retrying...' : 'Retry Launch'}
              </button>
              <button
                type="button"
                onClick={() => setLaunchError(null)}
                className="rounded-lg border border-white/[0.15] px-3 py-1.5 text-xs text-rose-200 hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {invalidRoutePath && (
          <div className="mb-8 rounded-2xl border border-[#F97316]/35 bg-[#0E1324] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#F97316]">
                  Route Not Recognized · {invalidRoutePath}
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-white">
                  Choose a Valid PLAYNOVA Arena Below
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate(player ? 'lobby' : 'home')}
                className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
              >
                {player ? 'Back to Lobby' : 'Back to Homepage'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {GAME_CATALOG.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => handlePlayAction(g.id)}
                  className="rounded-lg border border-white/[0.1] bg-[#090D1A] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#8B5CF6] hover:text-white cursor-pointer"
                >
                  Play {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeView === 'home' && (
          <HomepageHero
            publicStats={{
              onlinePlayers: Math.max(publicStats.onlinePlayers, rt.onlinePlayers.length),
              activeRooms: publicStats.activeRooms,
              totalPlayers: publicStats.totalPlayers,
              totalMatches: publicStats.totalMatches,
            }}
            topLeaders={topLeaders}
            tournaments={tournaments}
            recentMatches={matches}
            recentGameIds={recentGameIds}
            onPlayNow={(desired) => handlePlayAction(desired || 'lobby')}
            onNavigatePublic={(publicView) => navigate(publicView)}
          />
        )}

        {activeView === 'lobby' && player && (
          <div className="space-y-10">
            {/* Lobby Welcome & Mode Launcher */}
            <section className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1324]">
              <img
                src={GAME_ASSETS.heroUniverse}
                alt="PLAYNOVA multiplayer gaming universe"
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover opacity-35"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#060811] via-[#060811]/90 to-[#060811]/45" />

              <div className="relative z-10 grid grid-cols-1 gap-8 p-6 sm:p-10 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-7 space-y-5">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar
                      username={player.username}
                      profilePictureUrl={player.profilePictureUrl}
                      activeFrame={player.activeFrame}
                      avatarConfig={player.avatarConfig}
                      size="lg"
                    />
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#38BDF8]">
                        PLAYNOVA Lobby · Universal Matchmaking Ready
                      </p>
                      <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        {player.username}
                      </h1>
                    </div>
                  </div>

                  <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                    Jump straight into {GAME_CATALOG.length} interactive games with automatic online opponent matching, adaptive AI fallback, virtual rewards, and tournaments.
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('multiplayer')}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7C3AED] cursor-pointer"
                    >
                      <Users className="h-4 w-4" />
                      Matchmaking Hub ({rt.onlinePlayers.length} online)
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('tournaments')}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#F97316]/50 bg-[#F97316]/15 px-4 py-2.5 text-sm font-semibold text-[#FDBA74] transition hover:bg-[#F97316]/25 cursor-pointer"
                    >
                      <Trophy className="h-4 w-4" />
                      Tournaments ({tournaments.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlayAction('chess')}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.15] bg-[#0E1324]/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#38BDF8] cursor-pointer"
                    >
                      Chess
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlayAction('connect_four')}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.15] bg-[#0E1324]/90 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-[#38BDF8] cursor-pointer"
                    >
                      Connect Four
                    </button>
                  </div>
                </div>

                {/* Live Campaign Telemetry Panel */}
                <div className="lg:col-span-5 rounded-xl border border-white/[0.1] bg-[#090D1A]/90 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-bold text-white">
                      Level {player.level} Contender
                    </span>
                    <span className="font-mono text-xs text-[#38BDF8] tabular-nums">
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
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#141A2E]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#38BDF8] transition-all duration-300"
                        style={{ width: `${xpPercent}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-1 text-center">
                    <div className="rounded-lg border border-white/[0.06] bg-[#0E1324] p-3">
                      <p className="text-[11px] text-slate-400">Virtual Coins</p>
                      <p className="mt-1 font-mono text-lg font-bold text-[#F97316] tabular-nums">
                        {player.coins}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-[#0E1324] p-3">
                      <p className="text-[11px] text-slate-400">Win Streak</p>
                      <p className="mt-1 font-mono text-lg font-bold text-[#8B5CF6] tabular-nums">
                        {player.currentStreak}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-[#0E1324] p-3">
                      <p className="text-[11px] text-slate-400">Online Now</p>
                      <p className="mt-1 font-mono text-lg font-bold text-emerald-400 tabular-nums">
                        {Math.max(publicStats.onlinePlayers, rt.onlinePlayers.length)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Pinned Favourite Games */}
            {player.favoriteGames.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                    <Heart className="h-4 w-4 fill-[#F97316] text-[#F97316]" />
                    Your Pinned Favourites
                  </h2>
                  <button
                    type="button"
                    onClick={() => navigate('profile')}
                    className="text-xs font-semibold text-[#38BDF8] hover:underline cursor-pointer"
                  >
                    Edit Favourites
                  </button>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {player.favoriteGames.map((fid) => {
                    const g = GAME_CATALOG.find((item) => item.id === fid);
                    if (!g) return null;
                    return (
                      <button
                        key={fid}
                        type="button"
                        onClick={() => handlePlayAction(fid)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#F97316]/35 bg-[#0E1324] px-4 py-2 text-xs font-semibold text-white hover:border-[#F97316] cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5 text-[#F97316] fill-current" />
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recently Played & Popular Quick Strips */}
            {(recentlyPlayedCatalog.length > 0 || popularCatalog.length > 0) && (
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {recentlyPlayedCatalog.length > 0 && (
                  <div className="lg:col-span-5 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
                    <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#38BDF8]" />
                      Recently Played
                    </h2>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {recentlyPlayedCatalog.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => handlePlayAction(g.id)}
                          className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#060811] px-3 py-2.5 text-left text-xs transition hover:border-[#38BDF8]/60 cursor-pointer"
                        >
                          <span className="truncate font-semibold text-white">{g.name}</span>
                          <Play className="h-3.5 w-3.5 shrink-0 text-[#38BDF8] fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`${recentlyPlayedCatalog.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'} rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3`}>
                  <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Flame className="h-4 w-4 text-[#F97316]" />
                    Popular Competitive Picks
                  </h2>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {popularCatalog.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handlePlayAction(g.id)}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#060811] px-3 py-2.5 text-left text-xs transition hover:border-[#F97316]/60 cursor-pointer"
                      >
                        <span className="truncate font-semibold text-white">{g.name}</span>
                        <Play className="h-3.5 w-3.5 shrink-0 text-[#F97316] fill-current" />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* 22-Game Catalog with Live Search & 8 Category Filters */}
            <section className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#38BDF8]">
                    {GAME_CATALOG.length} Interactive Arenas · Auto-Match Human 1v1 &amp; Smart AI
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-white">Select Your Game</h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder={`Search ${GAME_CATALOG.length} games...`}
                      className="w-full rounded-lg border border-white/[0.1] bg-[#0E1324] py-2 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-[#38BDF8] focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('games')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                  >
                    Full Rules &amp; Catalog <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(['All', ...GAME_CATEGORIES] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                        : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCatalog.map((game) => {
                  const st = player.stats.byGame[game.id] || { played: 0, wins: 0, bestScore: 0 };
                  return (
                    <article
                      key={game.id}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1324] transition hover:border-[#8B5CF6]/50"
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#060811]">
                        <img
                          src={getGameArtwork(game.id)}
                          alt={`${game.name} arena illustration`}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0E1324] via-transparent to-transparent" />
                        <span
                          className="absolute left-4 bottom-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider"
                          style={{ color: game.accentHex }}
                        >
                          {game.difficultySummary}
                        </span>
                        {game.recentlyAdded && (
                          <span className="absolute right-3 top-3 rounded bg-[#38BDF8] px-2 py-0.5 font-mono text-[10px] font-bold text-[#060811]">
                            NEW
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-display text-lg font-bold text-white">{game.name}</h3>
                            <span className="font-mono text-[10px] text-slate-400">{game.estimatedTime}</span>
                          </div>
                          <p className="mt-1 text-xs font-medium text-slate-400">{game.tagline}</p>
                          <p className="mt-2 text-xs text-slate-300 leading-relaxed line-clamp-2">
                            {game.description}
                          </p>
                        </div>

                        <div className="space-y-3 border-t border-white/[0.08] pt-3.5">
                          <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                            <span>
                              Record: <strong className="text-white">{st.wins}W</strong> / {st.played}G
                            </span>
                            <span className="font-mono text-[#F97316]">Best {st.bestScore} pts</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handlePlayAction(game.id)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#8B5CF6] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#7C3AED] cursor-pointer"
                            >
                              <Gamepad2 className="h-4 w-4" />
                              Play Now
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopyGameLink(game.id)}
                              title="Copy shareable game link"
                              className="rounded-lg border border-white/[0.1] bg-[#090D1A] px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:border-white/25 hover:text-white cursor-pointer"
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
                <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-white">Active Challenges</h2>
                      <p className="text-xs text-slate-400">Complete daily & weekly goals for bonus XP and Coins</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('profile')}
                      className="text-xs font-semibold text-[#8B5CF6] hover:underline cursor-pointer"
                    >
                      View All
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {(challenges.length > 0
                      ? challenges
                      : DEFAULT_CHALLENGES.map((c) => ({ ...c, progress: 0, completed: false }))
                    )
                      .slice(0, 4)
                      .map((c) => {
                      const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.targetCount)) * 100));
                      return (
                        <div key={c.id} className="rounded-lg border border-white/[0.06] bg-[#090D1A] p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-wider text-[#F97316]">
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
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                    <h2 className="font-display text-lg font-bold text-white">Recently Played Matches</h2>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">{matches.length} recent</span>
                  </div>
                  {matches.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-400">
                      You have not completed a match yet. Pick any of the {GAME_CATALOG.length} PLAYNOVA arenas above to start building your record!
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
                          <span className="shrink-0 font-mono text-[#F97316] tabular-nums">
                            +{m.scoreDelta} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-6">
                <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6">
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-[#F97316]" />
                      <h2 className="font-display text-lg font-bold text-white">Leaderboard Top 5</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('leaderboard')}
                      className="text-xs font-semibold text-[#8B5CF6] hover:underline cursor-pointer"
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
                            ? 'border-[#8B5CF6]/50 bg-[#8B5CF6]/10'
                            : 'border-white/[0.06] bg-[#090D1A]'
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
                        <span className="font-mono text-xs font-bold text-[#F97316] tabular-nums">
                          {entry.points.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <Globe className="h-5 w-5 text-[#38BDF8]" />
                    <h2 className="font-display text-lg font-bold text-white">Link Preview & Sharing</h2>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Generate live Open Graph & Twitter share previews for any PLAYNOVA game link or external URL and share cleanly on WhatsApp, Telegram, Facebook, or X.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => navigate('link_preview')}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Open Link Preview Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('profile')}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#090D1A] px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/25 cursor-pointer"
                    >
                      <Award className="h-3.5 w-3.5 text-[#F97316]" />
                      Rewards & Wallet ({player.coins}c)
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeView === 'games' && (
          <div className="space-y-8">
            <div className="border-b border-white/[0.08] pb-6 space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#38BDF8]">
                    Complete {GAME_CATALOG.length}-Game Collection
                  </p>
                  <h1 className="mt-1 font-display text-3xl font-bold text-white">PLAYNOVA Arcade Catalog</h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-400">
                    Filter by genre or search below—every game automatically searches for online human opponents and connects to intelligent AI with zero wait.
                  </p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder={`Search all ${GAME_CATALOG.length} games...`}
                    className="w-full rounded-xl border border-white/[0.1] bg-[#0E1324] py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-500 focus:border-[#38BDF8] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['All', ...GAME_CATEGORIES] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                        : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {filteredCatalog.map((game) => {
                const st = player?.stats.byGame[game.id] || { played: 0, wins: 0, bestScore: 0 };
                return (
                  <div
                    key={game.id}
                    className="grid grid-cols-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1324] lg:grid-cols-12"
                  >
                    <div className="lg:col-span-4 aspect-[4/3] lg:aspect-auto bg-[#060811]">
                      <img
                        src={getGameArtwork(game.id)}
                        alt={game.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="lg:col-span-8 p-6 flex flex-col justify-between space-y-5">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="font-display text-2xl font-bold text-white">{game.name}</h2>
                          <span className="font-mono text-xs text-[#F97316]">{game.difficultySummary}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">{game.description}</p>
                        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-slate-400">
                          {game.rules.map((r) => (
                            <li key={r} className="rounded-lg border border-white/[0.06] bg-[#090D1A] px-3 py-2">
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-4">
                        <div className="flex gap-5 font-mono text-xs text-slate-300 tabular-nums">
                          <span>Played: {st.played}</span>
                          <span className="text-emerald-400">Wins: {st.wins}</span>
                          <span className="text-[#F97316]">Best Score: {st.bestScore}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handlePlayAction(game.id)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#8B5CF6] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            Play Now (Auto-Match / AI)
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
            onLaunchGame={(gameId) => handlePlayAction(gameId)}
          />
        )}

        {activeView === 'tournaments' && (
          <TournamentsSection
            player={player}
            onRequirePlayer={() => handlePlayAction('tournaments')}
            onPlayerUpdated={(p) => {
              setPlayer(p);
              void loadProgressionAndBoard();
            }}
          />
        )}

        {activeView === 'tictactoe' && player && (
          <TicTacToeGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'rps' && player && (
          <RockPaperScissorsGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'guess_number' && player && (
          <GuessNumberGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'connect_four' && player && (
          <ConnectFourGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'connect_five' && player && (
          <ConnectFiveGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'chess' && player && (
          <ChessGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'checkers' && player && (
          <CheckersGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'ludo' && player && (
          <LudoGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'reversi' && player && (
          <ReversiGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'battleship' && player && (
          <BattleshipGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'dots_and_boxes' && player && (
          <DotsAndBoxesGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'memory_match' && player && (
          <MemoryMatchGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'word_battle' && player && (
          <WordBattleGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'word_scramble' && player && (
          <WordScrambleGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'hangman' && player && (
          <HangmanGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'trivia_challenge' && player && (
          <TriviaChallengeGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'sudoku' && player && (
          <SudokuGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'quick_math' && player && (
          <QuickMathGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'reaction_test' && player && (
          <ReactionTestGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'pattern_recognition' && player && (
          <PatternRecognitionGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'snake' && player && (
          <SnakeGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
            onBack={() => navigate('lobby')}
          />
        )}

        {activeView === 'minesweeper' && player && (
          <MinesweeperGame
            player={player}
            recentMatches={matches}
            onProgressUpdated={handleProgressUpdated}
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
            onPlayerUpdated={(p) => {
              setPlayer(p);
              if (p.id.startsWith('local-')) {
                saveInstantLocalPlayer(p);
              }
            }}
            onRefreshProgression={() => void loadProgressionAndBoard()}
          />
        )}

        {activeView === 'admin' && <AdminDashboard />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#090D1A] py-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-display font-bold text-white">PLAYNOVA</span>
            <span>ENTER. COMPETE. CONQUER.</span>
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Coins className="h-3.5 w-3.5 text-[#F97316]" /> Virtual reward points only
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => navigate('tournaments')} className="hover:text-white cursor-pointer">
              Tournaments
            </button>
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

      {/* Session Expiration Recovery Modal */}
      {sessionExpiredModal.open && (
        <SessionRecoveryModal
          message={sessionExpiredModal.message}
          onRecovered={(p, token) => void handleAuthenticated(p, token)}
          onStartFreshGuest={() => {
            setStoredPlayerToken(null);
            setSessionExpiredModal({ open: false, message: '' });
            void enterAsAnonymousGuest('lobby');
          }}
        />
      )}
    </div>
  );
}

export default App;
