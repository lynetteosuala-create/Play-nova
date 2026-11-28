export type GameId =
  | 'tictactoe'
  | 'rps'
  | 'guess_number'
  | 'connect_four'
  | 'chess'
  | 'checkers'
  | 'ludo'
  | 'memory_match'
  | 'word_battle'
  | 'word_scramble'
  | 'hangman'
  | 'trivia_challenge'
  | 'sudoku'
  | 'quick_math'
  | 'reaction_test'
  | 'pattern_recognition'
  | 'snake'
  | 'minesweeper'
  | 'battleship'
  | 'dots_and_boxes'
  | 'reversi'
  | 'connect_five';

export type MultiplayerGameId = GameId;

export type GameCategory =
  | 'Strategy Games'
  | 'Brain Challenges'
  | 'Multiplayer Games'
  | 'Quick Challenges'
  | 'Competitive Games'
  | 'AI Games'
  | 'Party Games'
  | 'Arcade & Classic';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type AppView =
  | 'home'
  | 'lobby'
  | 'games'
  | 'multiplayer'
  | 'tournaments'
  | 'leaderboard'
  | 'link_preview'
  | 'profile'
  | 'admin'
  | GameId;

export interface AvatarConfig {
  mode: 'emblem' | 'photo';
  emblem: 'nova' | 'crown' | 'bolt' | 'shield' | 'cyber' | 'chess' | 'phoenix' | 'atom';
  bgHex: string;
  accentHex: string;
  themeId: string;
}

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
  profileTheme: string;
  avatarConfig: AvatarConfig;
  favoriteGames: GameId[];
  unlockedCosmetics: string[];
  settings: PlayerSettings;
  stats: PlayerStats;
  banned: boolean;
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
  status: 'lobby' | 'queued' | 'in_match';
  matchId: string | null;
}

export interface RoomSeat {
  seatIndex: number;
  kind: SeatKind;
  playerId: string | null;
  username: string;
  profilePictureUrl: string | null;
  activeFrame: string;
  aiDifficulty?: DifficultyLevel;
  team?: 'X' | 'O' | 'R' | 'Y' | 'W' | 'B' | 'A';
  connectionStatus: 'online' | 'reconnecting' | 'bot';
  score: number;
  hasPicked?: boolean;
  revealedPick?: 'rock' | 'paper' | 'scissors' | null;
  guessCount?: number;
  lastGuess?: number | null;
  lastClue?: 'higher' | 'lower' | 'correct' | null;
  lastProximity?: string | null;
  crackedAtMs?: number | null;
  duelProgress?: number;
  duelMaxProgress?: number;
  duelFinished?: boolean;
  duelSummary?: string | null;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  username: string;
  kind: SeatKind | 'system';
  text: string;
  ts: number;
}

export interface PublicRoomSummary {
  id: string;
  gameId: MultiplayerGameId;
  title: string;
  mode: 'vs_human' | 'mixed';
  status: 'active' | 'finished';
  maxSeats: number;
  humanCount: number;
}

export interface RoomState {
  id: string;
  gameId: MultiplayerGameId;
  title: string;
  mode: 'vs_human' | 'mixed';
  hostPlayerId: string;
  status: 'waiting' | 'active' | 'finished';
  maxSeats: number;
  roundNumber: number;
  seats: RoomSeat[];
  chatMessages: RoomChatMessage[];
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
  connectFourState?: {
    board: Array<'R' | 'Y' | null>;
    currentTeam: 'R' | 'Y';
    activeSeatIndex: number;
    winnerTeam: 'R' | 'Y' | 'draw' | null;
    winLine: number[] | null;
    lastCol: number | null;
  };
  connectFiveState?: {
    cols: number;
    rows: number;
    winTarget: number;
    board: Array<'R' | 'Y' | null>;
    currentTeam: 'R' | 'Y';
    activeSeatIndex: number;
    winnerTeam: 'R' | 'Y' | 'draw' | null;
    winLine: number[] | null;
    lastCol: number | null;
  };
  chessState?: {
    board: Array<string | null>;
    turn: 'w' | 'b';
    activeSeatIndex: number;
    castling: string;
    enPassant: number | null;
    halfMoveClock: number;
    moveHistory: string[];
    inCheck: boolean;
    winnerTeam: 'w' | 'b' | 'draw' | null;
    statusText: string;
    lastFrom: number | null;
    lastTo: number | null;
  };
  checkersState?: {
    board: Array<'r' | 'R' | 'b' | 'B' | null>;
    turn: 'r' | 'b';
    activeSeatIndex: number;
    mustContinueFrom: number | null;
    winnerTeam: 'r' | 'b' | 'draw' | null;
    lastFrom: number | null;
    lastTo: number | null;
    statusText: string;
  };
  reversiState?: {
    board: Array<'B' | 'W' | null>;
    turn: 'B' | 'W';
    activeSeatIndex: number;
    winnerTeam: 'B' | 'W' | 'draw' | null;
    lastMove: number | null;
    blackCount: number;
    whiteCount: number;
    statusText: string;
  };
  dotsState?: {
    rows: number;
    cols: number;
    hEdges: Array<'A' | 'B' | null>;
    vEdges: Array<'A' | 'B' | null>;
    boxes: Array<'A' | 'B' | null>;
    turn: 'A' | 'B';
    activeSeatIndex: number;
    scoreA: number;
    scoreB: number;
    winnerTeam: 'A' | 'B' | 'draw' | null;
    statusText: string;
  };
  battleshipState?: {
    turnSeatIndex: number;
    phase: 'placing' | 'battle' | 'finished';
    winnerSeatIndex: number | null;
    readyBySeat: Record<number, boolean>;
    shotsOnSeat: Record<number, Array<'unknown' | 'miss' | 'hit' | 'sunk'>>;
    ownShipBoards?: Record<number, number[]>;
    sunkShipsBySeat: Record<number, string[]>;
    statusText: string;
  };
  ludoState?: {
    playersCount: number;
    tokens: number[][]; // per seat 0..3: 4 positions (-1 yard, 0..51 outer, 52..57 home col, 58 finished)
    turnSeatIndex: number;
    diceValue: number | null;
    phase: 'roll' | 'move' | 'finished';
    winnerSeatIndex: number | null;
    statusText: string;
  };
  duelState?: {
    seed: number;
    durationSec: number;
    startedAt: number;
    endsAt: number;
    winnerSeatIndex: number | null;
    statusText: string;
  };
  winnerSummary: string | null;
}

export interface RoomInviteEvent {
  matchId: string;
  gameId: MultiplayerGameId;
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

export interface CoinTransactionItem {
  id: string;
  amount: number;
  balanceAfter: number;
  category: 'starter' | 'match' | 'challenge' | 'achievement' | 'tournament' | 'shop' | 'admin';
  description: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  kind: 'reward' | 'achievement' | 'challenge' | 'tournament' | 'invite' | 'announcement' | 'system';
  readAt: string | null;
  createdAt: string;
}

export interface PlatformAnnouncement {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'event' | 'alert';
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

export interface TournamentMatchItem {
  id: string;
  roundNumber: number;
  matchOrder: number;
  playerAName: string;
  playerBName: string;
  playerAId: string | null;
  playerBId: string | null;
  winnerName: string | null;
  winnerId: string | null;
  status: 'pending' | 'ready' | 'completed';
  scoreText: string | null;
}

export interface TournamentItem {
  id: string;
  title: string;
  gameId: GameId;
  competitionType: 'scheduled' | 'exhibition_demo';
  status: 'registration' | 'active' | 'completed';
  maxPlayers: number;
  entryFeeCoins: number;
  prizeCoins: number;
  startsAt: string;
  description: string;
  winnerUsername: string | null;
  participantCount: number;
  isRegistered: boolean;
  participants: Array<{
    id: string;
    playerId: string | null;
    username: string;
    isAi: boolean;
    seed: number;
    eliminated: boolean;
  }>;
  matches: TournamentMatchItem[];
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
    totalTournaments: number;
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
    banned: boolean;
    totalMatches: number;
    lastSeenAt: string;
  }>;
  gameBreakdown: Array<{
    gameId: GameId;
    matches: number;
    wins: number;
  }>;
  sessions: Array<{
    id: string;
    playerId: string;
    username: string;
    lastActiveAt: number;
    expiresAt: number;
  }>;
  liveRooms: PublicRoomSummary[];
  tournaments: TournamentItem[];
  announcements: PlatformAnnouncement[];
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
