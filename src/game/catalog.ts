import type { DifficultyLevel, GameId, PlayerSettings } from '../types.ts';

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  soundEnabled: true,
  soundVolume: 0.7,
  reducedMotion: false,
};

export interface GameCatalogEntry {
  id: GameId;
  name: string;
  tagline: string;
  description: string;
  difficultySummary: string;
  rules: string[];
  accentHex: string;
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    tagline: 'Custom N×N Grid Strategy (3 to 12+ in a Row)',
    description:
      'Choose classic 3×3 or expand dynamically to custom boards for 4, 5, 6, 7, or higher in-a-row targets against smart AI or human rivals.',
    difficultySummary: '3×3 to 15×15 · Smart AI & Humans',
    rules: [
      'Choose 3, 4, 5, 6, 7, or custom N-in-a-row winning rules before starting.',
      'The board automatically expands so your selected winning line fits cleanly.',
      'Winning lines count horizontally, vertically, and diagonally across the grid.',
      'Play solo against adaptive AI, pass-and-play locally, or enter live Multiplayer.',
    ],
    accentHex: '#E11D48',
  },
  {
    id: 'rps',
    name: 'Rock-Paper-Scissors',
    tagline: 'Rapid Duel & Custom Win Target Arena',
    description:
      'Lock in your move before the countdown completes, set custom win targets in multiplayer rooms, and stack streaks for bonus coins.',
    difficultySummary: 'Easy · Medium · Adaptive AI',
    rules: [
      'Rock crushes Scissors.',
      'Scissors cuts Paper.',
      'Paper covers Rock.',
      'Set your desired wins-to-finish target in multiplayer or stack streaks solo.',
    ],
    accentHex: '#F59E0B',
  },
  {
    id: 'guess_number',
    name: 'Guess the Number',
    tagline: 'Precision Deduction & Daily Vault',
    description:
      'Crack a server-generated secret code within strict attempt and time limits using Higher/Lower telemetry and daily seeded challenges.',
    difficultySummary: '1–50 · 1–100 · 1–500 Ranges',
    rules: [
      'The server locks a secret whole number inside your chosen difficulty range.',
      'Submit a guess before the countdown expires to receive a Higher or Lower clue.',
      'Solve the vault in fewer attempts with remaining time to maximize points and coins.',
      'Try the Daily Challenge once per day for a boosted reward payout.',
    ],
    accentHex: '#10B981',
  },
];

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
    description: 'Win 2 matches of Tic-Tac-Toe against AI today.',
    targetCount: 2,
    xpReward: 120,
    coinReward: 60,
  },
  {
    id: 'daily_rps_play',
    kind: 'daily' as const,
    gameId: 'rps' as const,
    title: 'Arena Duelist',
    description: 'Win 3 rounds of Rock-Paper-Scissors today.',
    targetCount: 3,
    xpReward: 110,
    coinReward: 55,
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
    title: 'Gameverse Champion',
    description: 'Win 12 matches across any GAMEVERSE title this week.',
    targetCount: 12,
    xpReward: 450,
    coinReward: 250,
  },
  {
    id: 'weekly_streak_master',
    kind: 'weekly' as const,
    gameId: 'any' as const,
    title: 'Weekly Contender',
    description: 'Complete 20 total matches this week.',
    targetCount: 20,
    xpReward: 380,
    coinReward: 200,
  },
];

export const DEFAULT_ACHIEVEMENTS = [
  {
    key: 'first_victory',
    title: 'First Blood',
    description: 'Win your very first match in any GAMEVERSE game.',
    category: 'General',
    xpReward: 80,
    coinReward: 40,
  },
  {
    key: 'ttt_strategist',
    title: 'Grid Master',
    description: 'Win 5 Tic-Tac-Toe matches against AI.',
    category: 'Tic-Tac-Toe',
    xpReward: 150,
    coinReward: 75,
  },
  {
    key: 'ttt_draw_unbeatable',
    title: 'Iron Defense',
    description: 'Force a draw or win against Hard Minimax Tic-Tac-Toe AI.',
    category: 'Tic-Tac-Toe',
    xpReward: 180,
    coinReward: 90,
  },
  {
    key: 'rps_streak_3',
    title: 'Triple Read',
    description: 'Reach a 3-win streak in Rock-Paper-Scissors.',
    category: 'Rock-Paper-Scissors',
    xpReward: 140,
    coinReward: 70,
  },
  {
    key: 'guess_sharpshooter',
    title: 'Sharpshooter',
    description: 'Guess the secret number in 4 attempts or fewer.',
    category: 'Guess the Number',
    xpReward: 200,
    coinReward: 100,
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
    description: 'Unlock your first cosmetic reward in the Rewards Vault.',
    category: 'Progression',
    xpReward: 100,
    coinReward: 50,
  },
  {
    key: 'veteran_15',
    title: 'Arena Veteran',
    description: 'Play 15 completed matches across GAMEVERSE.',
    category: 'General',
    xpReward: 240,
    coinReward: 125,
  },
];

export const DEFAULT_COSMETIC_REWARDS = [
  {
    id: 'frame_slate',
    name: 'Obsidian Standard',
    category: 'frame' as const,
    description: 'Clean graphite border issued to every registered competitor.',
    coinCost: 0,
    accentHex: '#64748B',
  },
  {
    id: 'frame_crimson',
    name: 'Crimson Vanguard',
    category: 'frame' as const,
    description: 'Anodized crimson profile ring forged for Tic-Tac-Toe duelists.',
    coinCost: 120,
    accentHex: '#E11D48',
  },
  {
    id: 'frame_amber',
    name: 'Solar Brass Crest',
    category: 'frame' as const,
    description: 'Brushed gold frame earned through consistent arena streaks.',
    coinCost: 220,
    accentHex: '#F59E0B',
  },
  {
    id: 'frame_emerald',
    name: 'Cipher Emerald',
    category: 'frame' as const,
    description: 'Precision emerald casing favored by vault deduction experts.',
    coinCost: 300,
    accentHex: '#10B981',
  },
  {
    id: 'frame_platinum',
    name: 'Grandmaster Platinum',
    category: 'frame' as const,
    description: 'High-tier metallic frame signaling top leaderboard standing.',
    coinCost: 500,
    accentHex: '#E2E8F0',
  },
];
