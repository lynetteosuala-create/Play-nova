import type {
  AvatarConfig,
  DifficultyLevel,
  GameCategory,
  GameId,
  MultiplayerGameId,
  PlayerSettings,
} from '../types.ts';

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  soundEnabled: true,
  soundVolume: 0.7,
  reducedMotion: false,
};

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  mode: 'emblem',
  emblem: 'nova',
  bgHex: '#131932',
  accentHex: '#8B5CF6',
  themeId: 'theme_midnight_nova',
};

export const GAME_CATEGORIES: GameCategory[] = [
  'Strategy Games',
  'Brain Challenges',
  'Multiplayer Games',
  'Quick Challenges',
  'Competitive Games',
  'AI Games',
  'Party Games',
];

export const MULTIPLAYER_GAME_IDS: MultiplayerGameId[] = [
  'tictactoe',
  'rps',
  'guess_number',
  'connect_four',
  'chess',
];

export interface GameCatalogEntry {
  id: GameId;
  name: string;
  tagline: string;
  description: string;
  difficultySummary: string;
  categories: GameCategory[];
  supportsMultiplayer: boolean;
  recentlyAdded?: boolean;
  popularChallenge?: boolean;
  estimatedTime: string;
  rules: string[];
  accentHex: string;
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    tagline: 'Custom 3×3 to 15×15 N-in-a-Row Strategy',
    description:
      'Choose classic 3×3 or dynamically expand grids for 4, 5, 6, 7+ in a row against adaptive AI, local rivals, or live WebSocket rooms.',
    difficultySummary: '3×3 to 15×15 · AI & Online',
    categories: ['Strategy Games', 'Multiplayer Games', 'Quick Challenges', 'AI Games', 'Competitive Games'],
    supportsMultiplayer: true,
    popularChallenge: true,
    estimatedTime: '1–3 min',
    rules: [
      'Choose 3, 4, 5, 6, 7, or custom N-in-a-row win rules before starting.',
      'The board automatically expands so your selected winning line fits cleanly.',
      'Winning lines count horizontally, vertically, and diagonally.',
      'Play solo vs AI, local pass-and-play, or live Online & Mixed AI+Human arenas.',
    ],
    accentHex: '#8B5CF6',
  },
  {
    id: 'rps',
    name: 'Rock Paper Scissors',
    tagline: 'Rapid Duel · Best-of-Three & Custom Targets',
    description:
      'Outread adaptive AI or challenge live opponents in single rounds, best-of-three series, and custom multi-win tournament duels.',
    difficultySummary: 'Easy · Medium · Adaptive AI',
    categories: ['Quick Challenges', 'Multiplayer Games', 'Competitive Games', 'AI Games', 'Party Games'],
    supportsMultiplayer: true,
    popularChallenge: true,
    estimatedTime: '1 min',
    rules: [
      'Rock crushes Scissors, Scissors cuts Paper, Paper covers Rock.',
      'Play single-round sprints, Best-of-Three matches, or custom series.',
      'Adaptive AI analyzes recent throw tendencies at higher tiers.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'guess_number',
    name: 'Guess the Number',
    tagline: 'Server-Verified Deduction & Daily Vault',
    description:
      'Crack secret targets within strict attempt and countdown limits using Higher/Lower telemetry, proximity radar, and multiplayer speed races.',
    difficultySummary: '1–50 · 1–100 · 1–500 Vaults',
    categories: ['Brain Challenges', 'Quick Challenges', 'Multiplayer Games', 'AI Games'],
    supportsMultiplayer: true,
    estimatedTime: '1–2 min',
    rules: [
      'Server locks a secret whole number inside your chosen difficulty range.',
      'Receive Higher / Lower and temperature hints after each attempt.',
      'Solve with fewer guesses and time left for boosted Coins and XP.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'connect_four',
    name: 'Connect Four',
    tagline: '7×6 Tactical Gravity Disc Arena',
    description:
      'Drop neon discs down vertical columns to connect 4 horizontally, vertically, or diagonally before your AI or online opponent traps your line.',
    difficultySummary: 'Depth Search AI · Live 1v1',
    categories: ['Strategy Games', 'Multiplayer Games', 'Competitive Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    popularChallenge: true,
    estimatedTime: '2–5 min',
    rules: [
      'Take turns dropping colored discs into any of the 7 vertical columns.',
      'Connect 4 of your discs in a horizontal, vertical, or diagonal line to win.',
      'Request a Tactical AI Hint anytime when practicing solo.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'chess',
    name: 'Chess',
    tagline: 'Full Legal Rules · Minimax Bot & Online 1v1',
    description:
      'Command a full 8×8 tournament board with castling, en passant, pawn promotion, check detection, algebraic notation, AI hints, and online 1v1.',
    difficultySummary: 'Positional AI · Live 1v1',
    categories: ['Strategy Games', 'Brain Challenges', 'Competitive Games', 'Multiplayer Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    popularChallenge: true,
    estimatedTime: '5–15 min',
    rules: [
      'Includes legal move highlights, castling, en passant, and pawn promotion.',
      'Checkmate your opponent’s King or force resignation to claim victory.',
      'Play solo vs AI with 3 skill depths, local 2P, or real-time online rooms.',
    ],
    accentHex: '#8B5CF6',
  },
  {
    id: 'memory_match',
    name: 'Memory Match',
    tagline: 'Visual Grid Recall · Solo & Memory AI Duel',
    description:
      'Flip cosmic emblems across 4×4, 6×4, or 6×6 grids in solo efficiency runs or head-to-head turn battles against a Memory AI bot.',
    difficultySummary: '4×4 · 6×4 · 6×6 Decks',
    categories: ['Brain Challenges', 'Party Games', 'AI Games', 'Quick Challenges'],
    supportsMultiplayer: false,
    recentlyAdded: true,
    estimatedTime: '2–4 min',
    rules: [
      'Flip two tiles per turn to uncover matching PLAYNOVA symbol pairs.',
      'Score bonus streak multipliers for consecutive pairs found.',
      'In vs AI mode, face an opponent that remembers recently revealed tiles.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'word_battle',
    name: 'Word Battle',
    tagline: 'Letter Scramble & 5-Letter Cipher Duel',
    description:
      'Race an AI challenger through multi-round word scrambles and 5-letter cipher deductions using letter hints and bonus speed multipliers.',
    difficultySummary: 'Multi-Round · AI Rival',
    categories: ['Brain Challenges', 'Competitive Games', 'Party Games', 'AI Games'],
    supportsMultiplayer: false,
    recentlyAdded: true,
    estimatedTime: '2–4 min',
    rules: [
      'Unscramble target words or crack 5-letter clues within the countdown.',
      'Use Reveal Letter hints sparingly for tactical recovery.',
      'Outscore the AI Challenger across 5 escalating rounds.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'trivia_challenge',
    name: 'Trivia Challenge',
    tagline: 'Timed Knowledge Blitz · 50/50 AI Hint',
    description:
      'Answer 10 rapid-fire questions across Gaming, Science, Geography, History, and Logic while racing a live AI opponent scoreboard.',
    difficultySummary: '5 Topics · Timed 10Q Blitz',
    categories: ['Brain Challenges', 'Party Games', 'Competitive Games', 'AI Games'],
    supportsMultiplayer: false,
    recentlyAdded: true,
    estimatedTime: '2–3 min',
    rules: [
      'Select your preferred trivia deck and race the 15-second question clock.',
      'Consecutive right answers build your streak multiplier.',
      'Activate the 50/50 Hint lifeline up to twice per match.',
    ],
    accentHex: '#8B5CF6',
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    tagline: 'Verified 9×9 Logic Grid · Notes & AI Hint',
    description:
      'Solve freshly generated 9×9 Latin-square puzzles with unique solutions, pencil-mark notes, conflict highlights, and an AI Logical Hint assistant.',
    difficultySummary: 'Easy · Medium · Hard Grids',
    categories: ['Brain Challenges', 'Strategy Games', 'AI Games'],
    supportsMultiplayer: false,
    recentlyAdded: true,
    estimatedTime: '4–10 min',
    rules: [
      'Fill every row, column, and 3×3 box with digits 1 through 9.',
      'Toggle Notes mode to sketch candidate numbers in open cells.',
      'Complete with fewer than 3 mistakes to claim full Coin & XP rewards.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'quick_math',
    name: 'Quick Math Challenge',
    tagline: '60-Second Mental Arithmetic Sprint vs Speedbot',
    description:
      'Solve rapid-fire arithmetic and missing-operand equations before the 60-second clock hits zero while racing an AI Speedbot pace target.',
    difficultySummary: '60s Sprint · Combo x5',
    categories: ['Quick Challenges', 'Brain Challenges', 'Competitive Games', 'AI Games'],
    supportsMultiplayer: false,
    recentlyAdded: true,
    estimatedTime: '1 min',
    rules: [
      'Answer as many equations as accurately as possible in 60 seconds.',
      'Correct streaks build up to a 5× combo score multiplier.',
      'Beat the AI Speedbot score benchmark to record a victory.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'reaction_test',
    name: 'Reaction Test',
    tagline: '5-Round Millisecond Reflex Benchmark',
    description:
      'Test pure neural response speed across 5 randomized reflex signals with false-start penalties and head-to-head comparison against Ghost AI benchmarks.',
    difficultySummary: 'Sub-250ms Pro Benchmark',
    categories: ['Quick Challenges', 'Competitive Games', 'Party Games', 'AI Games'],
    supportsMultiplayer: false,
    recentlyAdded: true,
    estimatedTime: '1 min',
    rules: [
      'Wait for the midnight signal panel to flash electric green, then strike immediately.',
      'Clicking too early triggers a +150ms false-start penalty.',
      'Average under the AI benchmark target across 5 rounds to win.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'pattern_recognition',
    name: 'Pattern Recognition',
    tagline: 'Expanding Spatial Matrix Memory Trials',
    description:
      'Memorize and reconstruct illuminating geometric pulse sequences across expanding 3×3 to 5×5 matrices with 3 lives and an AI Echo Hint.',
    difficultySummary: 'Progressive Matrix · 8+ Levels',
    categories: ['Brain Challenges', 'Quick Challenges', 'AI Games'],
    supportsMultiplayer: false,
    recentlyAdded: true,
    estimatedTime: '2–3 min',
    rules: [
      'Watch the glowing tile sequence carefully before the matrix unlocks.',
      'Reproduce every tile in order or pattern recall to advance levels.',
      'Reach Level 5+ before losing 3 lives to beat the AI benchmark.',
    ],
    accentHex: '#8B5CF6',
  },
];

export const ALL_GAME_IDS: GameId[] = GAME_CATALOG.map((g) => g.id);

export const GUESS_PRESETS: Record<
  DifficultyLevel | 'daily',
  { label: string; min: number; max: number; maxAttempts: number; timeLimitSec: number; baseRewardXp: number }
> = {
  easy: { label: 'Easy (1–50)', min: 1, max: 50, maxAttempts: 8, timeLimitSec: 90, baseRewardXp: 45 },
  medium: { label: 'Standard (1–100)', min: 1, max: 100, maxAttempts: 7, timeLimitSec: 75, baseRewardXp: 75 },
  hard: { label: 'Expert (1–500)', min: 1, max: 500, maxAttempts: 9, timeLimitSec: 90, baseRewardXp: 120 },
  daily: { label: 'Daily Vault (1–200)', min: 1, max: 200, maxAttempts: 8, timeLimitSec: 85, baseRewardXp: 150 },
};

export const DEFAULT_CHALLENGES = [
  {
    id: 'daily_ttt_win',
    kind: 'daily' as const,
    gameId: 'tictactoe' as const,
    title: 'Grid Tactician',
    description: 'Win 2 matches of Tic-Tac-Toe today.',
    targetCount: 2,
    xpReward: 120,
    coinReward: 60,
  },
  {
    id: 'daily_rps_play',
    kind: 'daily' as const,
    gameId: 'rps' as const,
    title: 'Arena Duelist',
    description: 'Win 3 rounds of Rock Paper Scissors today.',
    targetCount: 3,
    xpReward: 110,
    coinReward: 55,
  },
  {
    id: 'daily_strategy_master',
    kind: 'daily' as const,
    gameId: 'connect_four' as const,
    title: 'Gravity Strategist',
    description: 'Win 1 match of Connect Four today.',
    targetCount: 1,
    xpReward: 130,
    coinReward: 70,
  },
  {
    id: 'daily_guess_crack',
    kind: 'daily' as const,
    gameId: 'guess_number' as const,
    title: 'Vault Breaker',
    description: 'Crack 1 Guess the Number vault today.',
    targetCount: 1,
    xpReward: 140,
    coinReward: 75,
  },
  {
    id: 'weekly_all_rounder',
    kind: 'weekly' as const,
    gameId: 'any' as const,
    title: 'PLAYNOVA Champion',
    description: 'Win 10 matches across any PLAYNOVA title this week.',
    targetCount: 10,
    xpReward: 480,
    coinReward: 260,
  },
  {
    id: 'weekly_streak_master',
    kind: 'weekly' as const,
    gameId: 'any' as const,
    title: 'Weekly Contender',
    description: 'Complete 18 matches across any PLAYNOVA arena this week.',
    targetCount: 18,
    xpReward: 380,
    coinReward: 210,
  },
];

export const DEFAULT_ACHIEVEMENTS = [
  {
    key: 'first_victory',
    title: 'First Victory',
    description: 'Win your very first match in any PLAYNOVA arena.',
    category: 'General',
    xpReward: 80,
    coinReward: 40,
  },
  {
    key: 'ttt_strategist',
    title: 'Grid Master',
    description: 'Win 5 Tic-Tac-Toe matches.',
    category: 'Strategy',
    xpReward: 150,
    coinReward: 75,
  },
  {
    key: 'ttt_draw_unbeatable',
    title: 'Iron Defense',
    description: 'Force a draw or win against Hard Minimax Tic-Tac-Toe AI.',
    category: 'Strategy',
    xpReward: 180,
    coinReward: 90,
  },
  {
    key: 'chess_tactician',
    title: 'Grandmaster Spark',
    description: 'Win a match in PLAYNOVA Chess.',
    category: 'Strategy',
    xpReward: 240,
    coinReward: 130,
  },
  {
    key: 'connect4_ace',
    title: 'Four-in-a-Row Ace',
    description: 'Claim victory in Connect Four.',
    category: 'Strategy',
    xpReward: 140,
    coinReward: 70,
  },
  {
    key: 'rps_streak_3',
    title: 'Triple Read',
    description: 'Reach a 3-win streak in Rock Paper Scissors.',
    category: 'Competitive',
    xpReward: 140,
    coinReward: 70,
  },
  {
    key: 'guess_sharpshooter',
    title: 'Cipher Sharpshooter',
    description: 'Guess the secret number in 4 attempts or fewer.',
    category: 'Brain Challenges',
    xpReward: 200,
    coinReward: 100,
  },
  {
    key: 'brain_polymath',
    title: 'Neural Polymath',
    description: 'Win matches across 4 different PLAYNOVA titles.',
    category: 'Brain Challenges',
    xpReward: 260,
    coinReward: 150,
  },
  {
    key: 'daily_challenger',
    title: 'Daily Vault Solver',
    description: 'Complete a Guess the Number Daily Challenge.',
    category: 'Challenges',
    xpReward: 160,
    coinReward: 85,
  },
  {
    key: 'collector_cosmetic',
    title: 'Styled Competitor',
    description: 'Unlock your first cosmetic frame or theme in the Rewards Vault.',
    category: 'Progression',
    xpReward: 100,
    coinReward: 50,
  },
  {
    key: 'veteran_15',
    title: 'PLAYNOVA Veteran',
    description: 'Complete 15 matches across PLAYNOVA.',
    category: 'General',
    xpReward: 250,
    coinReward: 135,
  },
];

export const DEFAULT_COSMETIC_REWARDS = [
  {
    id: 'frame_slate',
    name: 'Midnight Standard',
    category: 'frame' as const,
    description: 'Sleek anodized obsidian border issued to every PLAYNOVA contender.',
    coinCost: 0,
    accentHex: '#64748B',
  },
  {
    id: 'frame_purple',
    name: 'Electric Nova Ring',
    category: 'frame' as const,
    description: 'Signature electric purple ring forged for PLAYNOVA arena duelists.',
    coinCost: 90,
    accentHex: '#8B5CF6',
  },
  {
    id: 'frame_blue',
    name: 'Neon Pulse Frame',
    category: 'frame' as const,
    description: 'Cryo neon-blue avatar casing favored by chess and logic tacticians.',
    coinCost: 160,
    accentHex: '#38BDF8',
  },
  {
    id: 'frame_orange',
    name: 'Solar Flare Crest',
    category: 'frame' as const,
    description: 'High-energy vibrant orange championship ring.',
    coinCost: 240,
    accentHex: '#F97316',
  },
  {
    id: 'frame_platinum',
    name: 'Grandmaster Platinum',
    category: 'frame' as const,
    description: 'Prestige metallic crest signaling top leaderboard standing.',
    coinCost: 480,
    accentHex: '#E2E8F0',
  },
  {
    id: 'theme_midnight_nova',
    name: 'Midnight Nova Theme',
    category: 'theme' as const,
    description: 'Default PLAYNOVA electric purple & deep midnight profile card finish.',
    coinCost: 0,
    accentHex: '#8B5CF6',
  },
  {
    id: 'theme_cyber_blue',
    name: 'Cyber Horizon Theme',
    category: 'theme' as const,
    description: 'Illuminated neon-blue telemetry finish for your player profile banner.',
    coinCost: 140,
    accentHex: '#38BDF8',
  },
  {
    id: 'theme_solar_forge',
    name: 'Solar Forge Theme',
    category: 'theme' as const,
    description: 'Blazing orange tournament ember styling for champion profiles.',
    coinCost: 260,
    accentHex: '#F97316',
  },
];
