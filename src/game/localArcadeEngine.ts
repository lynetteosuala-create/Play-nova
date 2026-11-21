import {
  ALL_GAME_IDS,
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_PLAYER_SETTINGS,
  GAME_CATALOG,
} from './catalog.ts';
import { evaluateTttBoard, type TttCell } from './tttRules.ts';
import type {
  DifficultyLevel,
  GameId,
  GameStatsBreakdown,
  MatchRecord,
  PlayerProfile,
} from '../types.ts';
import { apiFetch, getStoredPlayerToken } from '../utils/api.ts';

export type RpsMove = 'rock' | 'paper' | 'scissors';

const INSTANT_PLAYER_STORAGE_KEY = 'pn_instant_local_player_v1';
const INSTANT_MATCHES_STORAGE_KEY = 'pn_instant_local_matches_v1';

function createEmptyStatsByGame(): Record<GameId, GameStatsBreakdown> {
  const rec = {} as Record<GameId, GameStatsBreakdown>;
  for (const id of ALL_GAME_IDS) {
    rec[id] = { played: 0, wins: 0, losses: 0, draws: 0, points: 0, bestScore: 0 };
  }
  return rec;
}

export function getOrCreateInstantLocalPlayer(): PlayerProfile {
  try {
    const raw = localStorage.getItem(INSTANT_PLAYER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlayerProfile;
      if (parsed && parsed.id && parsed.stats?.byGame) {
        for (const gid of ALL_GAME_IDS) {
          if (!parsed.stats.byGame[gid]) {
            parsed.stats.byGame[gid] = { played: 0, wins: 0, losses: 0, draws: 0, points: 0, bestScore: 0 };
          }
        }
        return parsed;
      }
    }
  } catch {
    // ignore storage read errors
  }

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const created: PlayerProfile = {
    id: `local-${Date.now().toString(36)}-${suffix}`,
    username: `Guest #${suffix}`,
    xp: 0,
    level: 1,
    currentLevelXp: 0,
    nextLevelXp: 250,
    coins: 100,
    points: 0,
    currentStreak: 0,
    bestStreak: 0,
    profilePictureUrl: null,
    activeFrame: 'frame_slate',
    profileTheme: 'theme_midnight_nova',
    avatarConfig: { ...DEFAULT_AVATAR_CONFIG },
    favoriteGames: [],
    unlockedCosmetics: ['frame_slate', 'theme_midnight_nova'],
    settings: { ...DEFAULT_PLAYER_SETTINGS },
    stats: {
      totalPlayed: 0,
      totalWins: 0,
      totalLosses: 0,
      totalDraws: 0,
      byGame: createEmptyStatsByGame(),
    },
    banned: false,
    hasRecoveryKey: false,
    createdAt: new Date().toISOString(),
  };
  saveInstantLocalPlayer(created);
  return created;
}

export function saveInstantLocalPlayer(profile: PlayerProfile) {
  try {
    localStorage.setItem(INSTANT_PLAYER_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage quota
  }
}

export function getLocalInstantMatches(): MatchRecord[] {
  try {
    const raw = localStorage.getItem(INSTANT_MATCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MatchRecord[]) : [];
  } catch {
    return [];
  }
}

export interface LocalCompleteInput {
  gameId: GameId;
  mode: string;
  difficulty: DifficultyLevel;
  outcome: 'win' | 'loss' | 'draw';
  opponentLabel: string;
  scoreDelta: number;
  durationSec: number;
  summary: string;
}

export interface CompleteGameResponse {
  rewards: { scoreDelta: number; xpEarned: number; coinsEarned: number };
  player: PlayerProfile;
  newlyUnlocked: string[];
  completedChallenges: string[];
}

export function recordLocalInstantMatch(
  basePlayer: PlayerProfile,
  input: LocalCompleteInput
): CompleteGameResponse {
  const safeScore = Math.max(0, Math.min(2000, Math.round(input.scoreDelta || 0)));
  const xpEarned =
    input.outcome === 'win'
      ? Math.max(25, Math.min(240, Math.round(35 + safeScore * 0.45)))
      : input.outcome === 'draw'
      ? 25
      : 12;
  const coinsEarned =
    input.outcome === 'win'
      ? Math.max(15, Math.min(120, Math.round(20 + safeScore * 0.2)))
      : input.outcome === 'draw'
      ? 10
      : 5;

  const prevStats = basePlayer.stats.byGame[input.gameId] || {
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    bestScore: 0,
  };

  const nextStreak =
    input.outcome === 'win' ? basePlayer.currentStreak + 1 : input.outcome === 'loss' ? 0 : basePlayer.currentStreak;
  const nextXp = basePlayer.xp + xpEarned;
  const nextLevel = Math.max(1, Math.floor(nextXp / 250) + 1);
  const currentLevelXp = nextXp % 250;

  const updatedPlayer: PlayerProfile = {
    ...basePlayer,
    xp: nextXp,
    level: nextLevel,
    currentLevelXp,
    nextLevelXp: 250,
    coins: basePlayer.coins + coinsEarned,
    points: basePlayer.points + safeScore,
    currentStreak: nextStreak,
    bestStreak: Math.max(basePlayer.bestStreak, nextStreak),
    stats: {
      totalPlayed: basePlayer.stats.totalPlayed + 1,
      totalWins: basePlayer.stats.totalWins + (input.outcome === 'win' ? 1 : 0),
      totalLosses: basePlayer.stats.totalLosses + (input.outcome === 'loss' ? 1 : 0),
      totalDraws: basePlayer.stats.totalDraws + (input.outcome === 'draw' ? 1 : 0),
      byGame: {
        ...basePlayer.stats.byGame,
        [input.gameId]: {
          played: prevStats.played + 1,
          wins: prevStats.wins + (input.outcome === 'win' ? 1 : 0),
          losses: prevStats.losses + (input.outcome === 'loss' ? 1 : 0),
          draws: prevStats.draws + (input.outcome === 'draw' ? 1 : 0),
          points: prevStats.points + safeScore,
          bestScore: Math.max(prevStats.bestScore, safeScore),
        },
      },
    },
  };

  saveInstantLocalPlayer(updatedPlayer);

  try {
    const existing = getLocalInstantMatches();
    const record: MatchRecord = {
      id: `local-match-${Date.now().toString(36)}`,
      gameId: input.gameId,
      mode: input.mode,
      difficulty: input.difficulty,
      outcome: input.outcome,
      opponentLabel: input.opponentLabel,
      scoreDelta: safeScore,
      xpEarned,
      coinsEarned,
      durationSec: input.durationSec,
      summary: input.summary,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(INSTANT_MATCHES_STORAGE_KEY, JSON.stringify([record, ...existing].slice(0, 30)));
  } catch {
    // ignore storage errors
  }

  return {
    rewards: { scoreDelta: safeScore, xpEarned, coinsEarned },
    player: updatedPlayer,
    newlyUnlocked: [],
    completedChallenges: [],
  };
}

export async function completeSinglePlayerGame(
  currentPlayer: PlayerProfile,
  input: LocalCompleteInput
): Promise<CompleteGameResponse> {
  const hasServerSession = Boolean(getStoredPlayerToken()) && !currentPlayer.id.startsWith('local-');
  if (hasServerSession) {
    try {
      return await apiFetch<CompleteGameResponse>(
        '/api/games/complete',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
        { suppressSessionEvent: true }
      );
    } catch {
      // Fall through cleanly to local instant rewards so browser gameplay is never disrupted
    }
  }
  return recordLocalInstantMatch(currentPlayer, input);
}

// ---------------------------------------------------------------------------
// Pure Browser AI Engines (Tic-Tac-Toe 3x3..15x15, Rock Paper Scissors, Guess)
// ---------------------------------------------------------------------------

function minimaxTtt(
  board: TttCell[],
  depth: number,
  isMaximizing: boolean,
  aiMark: 'X' | 'O',
  humanMark: 'X' | 'O'
): number {
  const { winner } = evaluateTttBoard(board, 3, 3);
  if (winner === aiMark) return 10 - depth;
  if (winner === humanMark) return depth - 10;
  if (winner === 'draw') return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = aiMark;
        const score = minimaxTtt(board, depth + 1, false, aiMark, humanMark);
        board[i] = null;
        if (score > best) best = score;
      }
    }
    return best;
  }
  let best = Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = humanMark;
      const score = minimaxTtt(board, depth + 1, true, aiMark, humanMark);
      board[i] = null;
      if (score < best) best = score;
    }
  }
  return best;
}

function findImmediateTttWin(
  board: TttCell[],
  mark: 'X' | 'O',
  boardSize: number,
  winTarget: number,
  candidates: number[]
): number | null {
  for (const i of candidates) {
    if (board[i] === null) {
      board[i] = mark;
      const { winner } = evaluateTttBoard(board, boardSize, winTarget);
      board[i] = null;
      if (winner === mark) return i;
    }
  }
  return null;
}

function getTttCandidates(board: TttCell[], boardSize: number): number[] {
  const occupied: Array<[number, number]> = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null) occupied.push([Math.floor(i / boardSize), i % boardSize]);
  }
  if (occupied.length === 0) {
    const mid = Math.floor(boardSize / 2);
    return [mid * boardSize + mid];
  }
  const set = new Set<number>();
  for (const [r0, c0] of occupied) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
          const idx = r * boardSize + c;
          if (board[idx] === null) set.add(idx);
        }
      }
    }
  }
  if (set.size > 0) return Array.from(set);
  const all: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) all.push(i);
  }
  return all;
}

function scoreTttLine(
  board: TttCell[],
  boardSize: number,
  winTarget: number,
  r: number,
  c: number,
  mark: 'X' | 'O'
): number {
  const opponent: 'X' | 'O' = mark === 'X' ? 'O' : 'X';
  const axes: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  let score = 0;
  for (const [dr, dc] of axes) {
    for (let offset = -(winTarget - 1); offset <= 0; offset++) {
      const startR = r + dr * offset;
      const startC = c + dc * offset;
      const endR = startR + dr * (winTarget - 1);
      const endC = startC + dc * (winTarget - 1);
      if (
        startR < 0 ||
        startR >= boardSize ||
        startC < 0 ||
        startC >= boardSize ||
        endR < 0 ||
        endR >= boardSize ||
        endC < 0 ||
        endC >= boardSize
      ) {
        continue;
      }
      let ownCount = 1;
      let blocked = false;
      for (let step = 0; step < winTarget; step++) {
        const cr = startR + dr * step;
        const cc = startC + dc * step;
        if (cr === r && cc === c) continue;
        const val = board[cr * boardSize + cc];
        if (val === opponent) {
          blocked = true;
          break;
        }
        if (val === mark) ownCount += 1;
      }
      if (!blocked) {
        score += ownCount >= winTarget ? 1_000_000 : Math.pow(6, ownCount);
      }
    }
  }
  return score;
}

export function chooseLocalTttAiMove(
  board: TttCell[],
  difficulty: DifficultyLevel,
  aiMark: 'X' | 'O' = 'O',
  boardSize = 3,
  winTarget = 3
): number {
  const humanMark: 'X' | 'O' = aiMark === 'O' ? 'X' : 'O';
  const openIndices: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) openIndices.push(i);
  }
  if (openIndices.length === 0) return -1;

  if (boardSize === 3 && winTarget === 3 && board.length === 9) {
    const winNow = findImmediateTttWin(board, aiMark, 3, 3, openIndices);
    if (winNow !== null && (difficulty !== 'easy' || Math.random() < 0.65)) return winNow;

    if (difficulty === 'easy') {
      const block = findImmediateTttWin(board, humanMark, 3, 3, openIndices);
      if (block !== null && Math.random() < 0.4) return block;
      return openIndices[Math.floor(Math.random() * openIndices.length)];
    }

    if (difficulty === 'medium') {
      const block = findImmediateTttWin(board, humanMark, 3, 3, openIndices);
      if (block !== null) return block;
      if (Math.random() < 0.35) {
        const preferred = [4, 0, 2, 6, 8].filter((idx) => board[idx] === null);
        if (preferred.length > 0) return preferred[Math.floor(Math.random() * preferred.length)];
      }
    }

    let bestScore = -Infinity;
    let bestMoves: number[] = [];
    const copy = [...board];
    for (const idx of openIndices) {
      copy[idx] = aiMark;
      const score = minimaxTtt(copy, 0, false, aiMark, humanMark);
      copy[idx] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [idx];
      } else if (score === bestScore) {
        bestMoves.push(idx);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  const candidates = getTttCandidates(board, boardSize);
  const winNow = findImmediateTttWin(board, aiMark, boardSize, winTarget, candidates);
  if (winNow !== null && (difficulty !== 'easy' || Math.random() < 0.75)) return winNow;

  const urgentBlock = findImmediateTttWin(board, humanMark, boardSize, winTarget, candidates);
  if (urgentBlock !== null && (difficulty !== 'easy' || Math.random() < 0.5)) return urgentBlock;

  const center = (boardSize - 1) / 2;
  const defenseWeight = difficulty === 'hard' ? 1.12 : difficulty === 'medium' ? 0.92 : 0.45;
  const ranked = candidates
    .map((idx) => {
      const r = Math.floor(idx / boardSize);
      const c = idx % boardSize;
      const attack = scoreTttLine(board, boardSize, winTarget, r, c, aiMark);
      const defense = scoreTttLine(board, boardSize, winTarget, r, c, humanMark);
      const centerBonus = Math.max(0, boardSize - (Math.abs(r - center) + Math.abs(c - center))) * 0.6;
      const jitter = difficulty === 'easy' ? Math.random() * 12 : difficulty === 'medium' ? Math.random() * 3 : 0;
      return { idx, score: attack + defense * defenseWeight + centerBonus + jitter };
    })
    .sort((a, b) => b.score - a.score);

  if (difficulty === 'easy') {
    const pool = ranked.slice(0, Math.min(5, ranked.length));
    return pool[Math.floor(Math.random() * pool.length)].idx;
  }
  if (difficulty === 'medium' && Math.random() < 0.25 && ranked.length > 1) {
    return ranked[1].idx;
  }
  return ranked[0].idx;
}

export function chooseLocalRpsAiMove(difficulty: DifficultyLevel, recentPlayerMoves: RpsMove[]): RpsMove {
  const all: RpsMove[] = ['rock', 'paper', 'scissors'];
  const counterOf: Record<RpsMove, RpsMove> = {
    rock: 'paper',
    paper: 'scissors',
    scissors: 'rock',
  };
  if (difficulty === 'easy' || recentPlayerMoves.length === 0) {
    return all[Math.floor(Math.random() * 3)];
  }
  const freq: Record<RpsMove, number> = { rock: 0, paper: 0, scissors: 0 };
  for (const m of recentPlayerMoves.slice(0, 6)) {
    freq[m]++;
  }
  const favorite = (Object.keys(freq) as RpsMove[]).sort((a, b) => freq[b] - freq[a])[0];
  const adaptChance = difficulty === 'hard' ? 0.52 : 0.32;
  if (Math.random() < adaptChance) return counterOf[favorite];
  return all[Math.floor(Math.random() * 3)];
}

export function resolveLocalRpsOutcome(playerMove: RpsMove, opponentMove: RpsMove): 'win' | 'loss' | 'draw' {
  if (playerMove === opponentMove) return 'draw';
  if (
    (playerMove === 'rock' && opponentMove === 'scissors') ||
    (playerMove === 'scissors' && opponentMove === 'paper') ||
    (playerMove === 'paper' && opponentMove === 'rock')
  ) {
    return 'win';
  }
  return 'loss';
}

export function computeGuessProximity(guess: number, secret: number, min: number, max: number): string {
  const span = Math.max(10, max - min);
  const diff = Math.abs(guess - secret);
  if (diff <= Math.max(2, Math.round(span * 0.03))) return 'Scorching Hot (Within 3%)';
  if (diff <= Math.max(5, Math.round(span * 0.08))) return 'Warm (Close!)';
  if (diff <= Math.max(12, Math.round(span * 0.2))) return 'Mild';
  return 'Cold (Far)';
}

export function isValidSinglePlayerGame(id: GameId): boolean {
  return GAME_CATALOG.some((g) => g.id === id);
}
