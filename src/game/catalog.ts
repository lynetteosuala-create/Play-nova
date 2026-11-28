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
  'Arcade & Classic',
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
      'Choose classic 3×3 or dynamically expand grids for 4, 5, 6, 7+ in a row with auto-matchmaking and adaptive AI.',
    difficultySummary: '3×3 to 15×15 · AI & 1v1',
    categories: ['Strategy Games', 'Multiplayer Games', 'Quick Challenges', 'AI Games', 'Competitive Games'],
    supportsMultiplayer: true,
    popularChallenge: true,
    estimatedTime: '1–3 min',
    rules: [
      'Choose 3, 4, 5, 6, 7, or custom N-in-a-row win rules before starting.',
      'Auto-searches for live online opponents and falls back seamlessly to Minimax AI.',
      'Winning lines count horizontally, vertically, and diagonally.',
    ],
    accentHex: '#8B5CF6',
  },
  {
    id: 'rps',
    name: 'Rock Paper Scissors',
    tagline: 'Rapid Duel · Best-of-Three & Custom Targets',
    description:
      'Outread adaptive AI or live matched opponents in single rounds, best-of-three series, and tournament duels.',
    difficultySummary: 'Easy · Medium · Adaptive AI',
    categories: ['Quick Challenges', 'Multiplayer Games', 'Competitive Games', 'AI Games', 'Party Games'],
    supportsMultiplayer: true,
    popularChallenge: true,
    estimatedTime: '1 min',
    rules: [
      'Rock crushes Scissors, Scissors cuts Paper, Paper covers Rock.',
      'Auto-matches human rivals online or drops directly into an AI duel.',
      'Adaptive AI analyzes recent throw tendencies at higher difficulties.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'guess_number',
    name: 'Guess the Number',
    tagline: 'Vault Deduction & Speed Race',
    description:
      'Crack secret targets within strict attempt and countdown limits using Higher/Lower telemetry and live 1v1 races.',
    difficultySummary: '1–50 · 1–100 · 1–500 Vaults',
    categories: ['Brain Challenges', 'Quick Challenges', 'Multiplayer Games', 'AI Games'],
    supportsMultiplayer: true,
    estimatedTime: '1–2 min',
    rules: [
      'Guess the secret whole number inside your selected difficulty range.',
      'Receive Higher / Lower and temperature hints after every attempt.',
      'Auto-matches online contenders or pits your speed against a Deduction AI.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'connect_four',
    name: 'Connect Four',
    tagline: '7×6 Tactical Gravity Disc Arena',
    description:
      'Drop discs down vertical columns to connect 4 horizontally, vertically, or diagonally against live players or depth-search AI.',
    difficultySummary: 'Depth Search AI · Live 1v1',
    categories: ['Strategy Games', 'Multiplayer Games', 'Competitive Games', 'AI Games'],
    supportsMultiplayer: true,
    popularChallenge: true,
    estimatedTime: '2–5 min',
    rules: [
      'Take turns dropping colored discs into any of the 7 vertical columns.',
      'Connect 4 of your discs horizontally, vertically, or diagonally to win.',
      'Auto-matches live players online or triggers Tactical AI automatically.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'connect_five',
    name: 'Connect Five (9×7 Variant)',
    tagline: 'Expanded 9×7 Gravity Arena · 5-in-a-Row & Pop-Out',
    description:
      'Next-level Four-in-a-Row variant on an expanded 9×7 gravity grid requiring 5 connected discs with optional Pop-Out bottom column rules.',
    difficultySummary: '9×7 Grid · Standard & Pop-Out',
    categories: ['Strategy Games', 'Multiplayer Games', 'Competitive Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    popularChallenge: true,
    estimatedTime: '3–6 min',
    rules: [
      'Drop discs across 9 columns to align 5 in any direction.',
      'Try Classic 5-in-a-Row or Pop-Out Variant (pop your own disc from row bottom).',
      'Matches human rivals automatically or deploys an intelligent tactical AI.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'chess',
    name: 'Chess',
    tagline: 'Full Legal Rules · Minimax Bot & Online 1v1',
    description:
      'Command a full 8×8 tournament board with castling, en passant, pawn promotion, check detection, algebraic notation, and live matchmaking.',
    difficultySummary: 'Positional AI · Live 1v1',
    categories: ['Strategy Games', 'Brain Challenges', 'Competitive Games', 'Multiplayer Games', 'AI Games'],
    supportsMultiplayer: true,
    popularChallenge: true,
    estimatedTime: '5–15 min',
    rules: [
      'Includes legal move highlights, castling, en passant, and pawn promotion.',
      'Checkmate your opponent’s King to win or force a stalemate draw.',
      'Automatically pairs online human players or engages positional AI.',
    ],
    accentHex: '#8B5CF6',
  },
  {
    id: 'checkers',
    name: 'Checkers',
    tagline: '8×8 Draughts · Forced Multi-Jumps & Kings',
    description:
      'Slide diagonally across dark squares, execute mandatory multi-jump captures, crown Kings on the far rank, and outsmart alpha-beta AI or live opponents.',
    difficultySummary: 'Alpha-Beta AI · Live 1v1',
    categories: ['Strategy Games', 'Arcade & Classic', 'Multiplayer Games', 'Competitive Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    popularChallenge: true,
    estimatedTime: '3–8 min',
    rules: [
      'Move diagonally forward on dark squares; Kings move forward and backward.',
      'Mandatory jump rules highlight available captures and multi-jump chains.',
      'Capture all opponent pieces or block all legal moves to claim victory.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'ludo',
    name: 'Ludo',
    tagline: '4-Corner Dice Race · Captures & Safe Stars',
    description:
      'Roll a 6 to launch tokens from your home yard, land on safe star tiles, knock rivals back to base, and race all 4 tokens into the center crown.',
    difficultySummary: '2P & 4P · Smart AI & Online',
    categories: ['Party Games', 'Arcade & Classic', 'Multiplayer Games', 'Strategy Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    popularChallenge: true,
    estimatedTime: '4–8 min',
    rules: [
      'Roll a 6 to deploy a token from your yard and earn a bonus dice roll.',
      'Landing on an opponent outside Safe Star squares sends their token back home.',
      'Roll the exact distance to enter your colored Home Column and finish all 4 tokens.',
    ],
    accentHex: '#10B981',
  },
  {
    id: 'reversi',
    name: 'Reversi',
    tagline: '8×8 Territory Flipping · Corners & Mobility AI',
    description:
      'Outflank your rival’s discs horizontally, vertically, and diagonally to flip territory across an 8×8 board in classic Othello strategy.',
    difficultySummary: 'Corner Heuristic AI · 1v1',
    categories: ['Strategy Games', 'Brain Challenges', 'Arcade & Classic', 'Multiplayer Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    estimatedTime: '3–6 min',
    rules: [
      'Place a disc so one or more opponent discs sit between yours in a straight line.',
      'All outflanked opponent discs immediately flip to your color.',
      'Hold the most discs when neither side has a legal move to win.',
    ],
    accentHex: '#8B5CF6',
  },
  {
    id: 'battleship',
    name: 'Battleship',
    tagline: '10×10 Naval Fleet Command · Hunt & Sink AI',
    description:
      'Deploy your 5-ship fleet secretly across a 10×10 grid, fire coordinated salvos, and sink every enemy vessel before yours go down.',
    difficultySummary: 'Hunt-Target AI · Live 1v1',
    categories: ['Strategy Games', 'Arcade & Classic', 'Multiplayer Games', 'Competitive Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    popularChallenge: true,
    estimatedTime: '3–7 min',
    rules: [
      'Arrange 5 vessels (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2).',
      'Take turns firing shots at opponent coordinates to score Hits and Sinks.',
      'Sink all 5 enemy ships first to claim naval victory.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'dots_and_boxes',
    name: 'Dots and Boxes',
    tagline: 'Chain-Logic Territory Capture · Extra Turn Combos',
    description:
      'Connect adjacent grid dots line by line. Close the 4th edge of any box to claim it and immediately earn an extra turn.',
    difficultySummary: 'Chain-Aware AI · 4×4 & 5×5',
    categories: ['Strategy Games', 'Brain Challenges', 'Party Games', 'Multiplayer Games', 'AI Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    estimatedTime: '2–5 min',
    rules: [
      'Click any open horizontal or vertical edge between two adjacent dots.',
      'Completing a square claims 1 point and grants another consecutive turn.',
      'Claim more total boxes than your human or AI rival to win.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'memory_match',
    name: 'Memory Match',
    tagline: 'Visual Grid Recall · Head-to-Head AI & Online Duel',
    description:
      'Flip cosmic emblems across 4×4, 6×4, or 6×6 grids in head-to-head turn battles against Memory AI or synchronized live 1v1 speed duels.',
    difficultySummary: '4×4 · 6×4 · 6×6 Decks',
    categories: ['Brain Challenges', 'Party Games', 'AI Games', 'Quick Challenges', 'Multiplayer Games'],
    supportsMultiplayer: true,
    estimatedTime: '2–4 min',
    rules: [
      'Flip two tiles per turn to uncover matching PLAYNOVA symbol pairs.',
      'Score bonus streak multipliers for consecutive pairs found.',
      'In AI mode, face an opponent that remembers recently revealed tiles.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'word_battle',
    name: 'Word Battle',
    tagline: '5-Letter Cipher & Word Duel vs AI or Online',
    description:
      'Race an AI challenger or live matched human through multi-round word deductions with letter telemetry and speed bonuses.',
    difficultySummary: 'Multi-Round · AI & 1v1',
    categories: ['Brain Challenges', 'Competitive Games', 'Party Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    estimatedTime: '2–4 min',
    rules: [
      'Crack 5-letter clues or word ciphers within the round countdown.',
      'Use Reveal Letter hints sparingly for tactical recovery.',
      'Outscore your opponent across 5 escalating rounds.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'word_scramble',
    name: 'Word Scramble',
    tagline: 'Rapid-Fire Anagram Sprint · Hint & Streak Blitz',
    description:
      'Unscramble jumbled vocabulary across themed decks under pressure with skip controls, letter reveal lifelines, and live AI/1v1 pace racing.',
    difficultySummary: '8-Word Blitz · AI Rival',
    categories: ['Brain Challenges', 'Quick Challenges', 'Party Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    estimatedTime: '1–3 min',
    rules: [
      'Click scrambled letter tiles or type the decoded word to lock each round.',
      'Maintain consecutive solves without skipping to multiply your score.',
      'Outscore the Scramble AI or matched opponent before time runs out.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'hangman',
    name: 'Hangman',
    tagline: 'Classic Secret Word Deduction · 6-Strike Challenge',
    description:
      'Deduce hidden words letter-by-letter across Gaming, Science, Tech, and World topics with SVG gallows telemetry and competitive multi-word AI duels.',
    difficultySummary: '6 Lives · 4 Decks · AI & 1v1',
    categories: ['Brain Challenges', 'Arcade & Classic', 'Party Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    estimatedTime: '2–3 min',
    rules: [
      'Select letters on the on-screen keyboard or type directly with your physical keyboard.',
      'Solve each secret word before 6 wrong guesses complete the gallows.',
      'Earn streak bonuses and outscore the Wordsmith AI or live 1v1 challenger.',
    ],
    accentHex: '#EC4899',
  },
  {
    id: 'trivia_challenge',
    name: 'Trivia Challenge',
    tagline: 'Timed Knowledge Blitz · 50/50 AI Hint',
    description:
      'Answer 10 rapid-fire questions across Gaming, Science, Geography, History, and Logic while racing an AI or matched human scoreboard.',
    difficultySummary: '5 Topics · Timed 10Q Blitz',
    categories: ['Brain Challenges', 'Party Games', 'Competitive Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    estimatedTime: '2–3 min',
    rules: [
      'Select your trivia deck and race the 15-second question clock.',
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
      'Solve freshly generated 9×9 Latin-square puzzles with unique solutions, pencil-mark notes, conflict highlights, and shared-seed 1v1 speed duels.',
    difficultySummary: 'Easy · Medium · Hard Grids',
    categories: ['Brain Challenges', 'Strategy Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    estimatedTime: '4–10 min',
    rules: [
      'Fill every row, column, and 3×3 box with digits 1 through 9.',
      'Toggle Notes mode to sketch candidate numbers in open cells.',
      'Beat the AI target time or matched human opponent with under 3 mistakes.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'quick_math',
    name: 'Quick Math Challenge',
    tagline: '60-Second Mental Arithmetic Sprint vs Speedbot',
    description:
      'Solve rapid-fire arithmetic and missing-operand equations before the 60-second clock hits zero against Speedbot AI or live 1v1 challengers.',
    difficultySummary: '60s Sprint · Combo x5',
    categories: ['Quick Challenges', 'Brain Challenges', 'Competitive Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    estimatedTime: '1 min',
    rules: [
      'Answer as many equations as accurately as possible in 60 seconds.',
      'Correct streaks build up to a 5× combo score multiplier.',
      'Beat the AI Speedbot or online duel opponent score to win.',
    ],
    accentHex: '#F97316',
  },
  {
    id: 'reaction_test',
    name: 'Reaction Speed Challenge',
    tagline: '5-Round Millisecond Reflex Benchmark',
    description:
      'Test pure neural response speed across 5 randomized reflex signals with false-start penalties against Ghost AI or live 1v1 opponents.',
    difficultySummary: 'Sub-250ms Pro Benchmark',
    categories: ['Quick Challenges', 'Competitive Games', 'Party Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    estimatedTime: '1 min',
    rules: [
      'Wait for the signal panel to flash electric green, then strike immediately.',
      'Clicking too early triggers a +150ms false-start penalty.',
      'Average faster than the AI benchmark or matched rival across 5 rounds.',
    ],
    accentHex: '#38BDF8',
  },
  {
    id: 'pattern_recognition',
    name: 'Pattern Recognition',
    tagline: 'Expanding Spatial Matrix Memory Trials',
    description:
      'Memorize and reconstruct illuminating geometric pulse sequences across expanding 3×3 to 5×5 matrices against an Echo AI benchmark or online duel.',
    difficultySummary: 'Progressive Matrix · 8+ Levels',
    categories: ['Brain Challenges', 'Quick Challenges', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    estimatedTime: '2–3 min',
    rules: [
      'Watch the glowing tile sequence carefully before the matrix unlocks.',
      'Reproduce every tile in exact order to advance to higher stages.',
      'Beat the AI level benchmark or matched rival score before losing 3 lives.',
    ],
    accentHex: '#8B5CF6',
  },
  {
    id: 'snake',
    name: 'Snake',
    tagline: 'Arcade Serpent Arena · Combo Orbs & AI Pace',
    description:
      'Steer across a sleek 20×20 arcade grid with WASD, Arrow keys, or touch D-pad—devour combo orbs while racing an AI Rival Snake score.',
    difficultySummary: '3 Speeds · AI Score Duel',
    categories: ['Arcade & Classic', 'Quick Challenges', 'Competitive Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    popularChallenge: true,
    estimatedTime: '1–4 min',
    rules: [
      'Control direction with Arrow keys, WASD, or on-screen directional buttons.',
      'Collect standard orbs (+10) and timed golden energy orbs (+35) to grow.',
      'Avoid walls and your own tail while outscoring the AI or live opponent.',
    ],
    accentHex: '#10B981',
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    tagline: 'Tactical Hazard Grid · Safe First Click & Flag Mode',
    description:
      'Sweep hidden minefields using logical adjacency clues, instant flood-fill reveals, flag toggles, and Ghost Solver AI speed comparisons.',
    difficultySummary: '9×9 · 12×12 · 16×16 Fields',
    categories: ['Brain Challenges', 'Arcade & Classic', 'Strategy Games', 'AI Games', 'Multiplayer Games'],
    supportsMultiplayer: true,
    recentlyAdded: true,
    estimatedTime: '2–5 min',
    rules: [
      'Your very first click is always guaranteed safe and opens an initial pocket.',
      'Right-click (or switch to Flag Mode) to mark suspected mines safely.',
      'Clear every non-mine square faster than the Ghost Solver AI or live rival.',
    ],
    accentHex: '#F97316',
  },
];

export const MULTIPLAYER_GAME_IDS: MultiplayerGameId[] = GAME_CATALOG.map((g) => g.id);

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
