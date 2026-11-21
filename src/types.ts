export type GameId = 'tictactoe' | 'rps' | 'guess_number';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type AppView =
  | 'home'
  | 'lobby'
  | 'games'
  | 'tictactoe'
  | 'rps'
  | 'guess_number'
  | 'multiplayer'
  | 'leaderboard'
  | 'link_preview'
  | 'profile'
  | 'admin';

export interface PlayerSettings {
  soundEnabled: boolean;
  soundVolume: number;
  reducedMotion: boolean;
}

export interface GameStatsBreakdown {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  bestScore: number;
}

export interface PlayerStats {
  totalPlayed: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  byGame: Record<GameId, GameStatsBreakdown>;
}

export interface PlayerProfile {
  id: string;
  username: string;
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  coins: number;
  points: number;
  currentStreak: number;
  bestStreak: number;
  profilePictureUrl: string | null;
  activeFrame: string;
  unlockedCosmetics: string[];
  settings: PlayerSettings;
  stats: PlayerStats;
  hasRecoveryKey: boolean;
  createdAt: string;
}

export type SeatKind = 'human' | 'ai';

export interface OnlinePlayerSummary {
  playerId: string;
  username: string;
  profilePictureUrl: string | null;
  activeFrame: string;
  level: number;
  status: 'lobby' | 'queued' | 'in_room' | 'in_match';
  roomId: string | null;
}

export interface RoomSeat {
  seatIndex: number;
  kind: SeatKind;
  playerId: string | null;
  username: string;
  profilePictureUrl: string | null;
  activeFrame: string;
  aiDifficulty?: DifficultyLevel;
  team?: 'X' | 'O';
  connectionStatus: 'online' | 'reconnecting' | 'bot';
  score: number;
  hasPicked?: boolean;
  revealedPick?: 'rock' | 'paper' | 'scissors' | null;
  guessCount?: number;
  lastGuess?: number | null;
  lastClue?: 'higher' | 'lower' | 'correct' | null;
  lastProximity?: string | null;
  crackedAtMs?: number | null;
}

export interface PublicRoomSummary {
  id: string;
  code: string;
  gameId: GameId;
  title: string;
  mode: 'vs_human' | 'mixed';
  isPrivate: boolean;
  status: 'waiting' | 'active' | 'finished';
  maxSeats: number;
  humanCount: number;
  aiCount: number;
  hostUsername: string;
  tttBoardSize?: number;
  tttWinTarget?: number;
  rpsTargetWins?: number;
}

export interface RoomState {
  id: string;
  code: string;
  gameId: GameId;
  title: string;
  mode: 'vs_human' | 'mixed';
  isPrivate: boolean;
  hostPlayerId: string;
  status: 'waiting' | 'active' | 'finished';
  maxSeats: number;
  roundNumber: number;
  seats: RoomSeat[];
  tttBoardSize?: number;
  tttWinTarget?: number;
  rpsTargetWins?: number;
  tttState?: {
    board: Array<'X' | 'O' | null>;
    boardSize: number;
    winTarget: number;
    currentTeam: 'X' | 'O';
    xSeatCursor: number;
    oSeatCursor: number;
    activeSeatIndex: number;
    winnerTeam: 'X' | 'O' | 'draw' | null;
    winLine: number[] | null;
  };
  rpsState?: {
    targetWins: number;
    roundDeadlineAt: number | null;
    lastRoundSummary: string | null;
    winnerSeatIndexes: number[];
  };
  guessState?: {
    difficulty: DifficultyLevel;
    min: number;
    max: number;
    maxAttempts: number;
    deadlineAt: number | null;
    winnerSeatIndex: number | null;
    revealedSecret: number | null;
    feed: Array<{
      id: string;
      seatIndex: number;
      username: string;
      kind: SeatKind;
      guess: number;
      clue: 'higher' | 'lower' | 'correct';
      proximity?: string;
      ts: number;
    }>;
  };
  winnerSummary: string | null;
  rewardNotice?: {
    xpEarned: number;
    coinsEarned: number;
    scoreDelta: number;
  } | null;
}

export interface RoomInviteEvent {
  roomId: string;
  roomCode: string;
  gameId: GameId;
  fromPlayerId: string;
  fromUsername: string;
  createdAt: string;
}

export interface ChallengeItem {
  id: string;
  kind: 'daily' | 'weekly';
  gameId: GameId | 'any';
  title: string;
  description: string;
  targetCount: number;
  xpReward: number;
  coinReward: number;
  progress: number;
  completed: boolean;
}

export interface AchievementItem {
  key: string;
  title: string;
  description: string;
  category: string;
  xpReward: number;
  coinReward: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface CosmeticRewardItem {
  id: string;
  name: string;
  category: 'frame' | 'title' | 'theme';
  description: string;
  coinCost: number;
  accentHex: string;
  unlocked: boolean;
  equipped: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  kind: 'reward' | 'achievement' | 'challenge' | 'system';
  readAt: string | null;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  gameId: GameId;
  mode: string;
  difficulty: DifficultyLevel;
  outcome: 'win' | 'loss' | 'draw';
  opponentLabel: string;
  scoreDelta: number;
  xpEarned: number;
  coinsEarned: number;
  durationSec: number;
  summary: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  profilePictureUrl: string | null;
  activeFrame: string;
  level: number;
  xp: number;
  points: number;
  wins: number;
  played: number;
  winRate: number;
  achievementsCount: number;
  isCurrentPlayer: boolean;
}

export interface LinkPreviewData {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  favicon: string | null;
  fallback: boolean;
  fallbackReason?: string;
  metaTags?: {
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    ogType: string | null;
    twitterCard: string | null;
    twitterTitle: string | null;
    twitterImage: string | null;
  };
}

export interface SharedLinkItem {
  id: string;
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  siteName: string | null;
  note: string | null;
  createdAt: string;
  username: string;
  profilePictureUrl: string | null;
}

export interface AdminOverviewData {
  stats: {
    totalPlayers: number;
    activeSessions: number;
    onlineConnections: number;
    activeRooms: number;
    queuedPlayers: number;
    totalMatches: number;
    totalLinkPreviews: number;
    failedLinkPreviews: number;
    dbSizeBytes: number;
    walMode: string;
    uptimeSec: number;
  };
  players: Array<{
    id: string;
    username: string;
    level: number;
    points: number;
    coins: number;
    totalMatches: number;
    lastSeenAt: string;
  }>;
  sessions: Array<{
    id: string;
    playerId: string;
    username: string;
    lastActiveAt: number;
    expiresAt: number;
  }>;
  liveRooms: PublicRoomSummary[];
  recentActivity: Array<{
    id: string;
    username: string;
    gameId: GameId;
    outcome: string;
    scoreDelta: number;
    xpEarned: number;
    coinsEarned: number;
    createdAt: string;
  }>;
  challenges: Array<{
    id: string;
    kind: 'daily' | 'weekly';
    gameId: GameId | 'any';
    title: string;
    description: string;
    targetCount: number;
    xpReward: number;
    coinReward: number;
    active: boolean;
  }>;
  achievements: Array<{
    key: string;
    title: string;
    description: string;
    category: string;
    xpReward: number;
    coinReward: number;
  }>;
  rewards: Array<{
    id: string;
    name: string;
    category: 'frame' | 'title' | 'theme';
    description: string;
    coinCost: number;
    accentHex: string;
  }>;
  linkPreviewLogs: Array<{
    id: string;
    url: string;
    status: string;
    fallbackReason: string | null;
    latencyMs: number;
    username: string | null;
    createdAt: string;
  }>;
  errorLogs: Array<{
    id: string;
    route: string;
    level: string;
    message: string;
    createdAt: string;
  }>;
}
