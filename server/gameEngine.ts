import { evaluateTttBoard, type TttCell } from '../src/game/tttRules.ts';
import type { DifficultyLevel } from '../src/types.ts';

export type { TttCell };
export type RpsMove = 'rock' | 'paper' | 'scissors';

export { evaluateTttBoard };

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
  } else {
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
}

function findImmediateWinningMove(
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

function getCandidateCells(board: TttCell[], boardSize: number): number[] {
  const occupied: Array<[number, number]> = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== null) {
      occupied.push([Math.floor(i / boardSize), i % boardSize]);
    }
  }
  if (occupied.length === 0) {
    const mid = Math.floor(boardSize / 2);
    return [mid * boardSize + mid];
  }

  const candidateSet = new Set<number>();
  const radius = 2;
  for (const [r0, c0] of occupied) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
          const idx = r * boardSize + c;
          if (board[idx] === null) candidateSet.add(idx);
        }
      }
    }
  }
  if (candidateSet.size > 0) return Array.from(candidateSet);

  const fallback: number[] = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) fallback.push(i);
  }
  return fallback;
}

function scoreLineForMark(
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
    // Slide windows of length winTarget that contain (r, c)
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

      let ownCount = 1; // counting candidate placement
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
        if (ownCount >= winTarget) score += 1_000_000;
        else score += Math.pow(6, ownCount);
      }
    }
  }
  return score;
}

export function chooseTttAiMove(
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

  // Classic 3x3 exact Minimax path
  if (boardSize === 3 && winTarget === 3 && board.length === 9) {
    const immediateWin = findImmediateWinningMove(board, aiMark, 3, 3, openIndices);
    if (immediateWin !== null && (difficulty !== 'easy' || Math.random() < 0.65)) {
      return immediateWin;
    }

    if (difficulty === 'easy') {
      const block = findImmediateWinningMove(board, humanMark, 3, 3, openIndices);
      if (block !== null && Math.random() < 0.4) return block;
      return openIndices[Math.floor(Math.random() * openIndices.length)];
    }

    if (difficulty === 'medium') {
      const block = findImmediateWinningMove(board, humanMark, 3, 3, openIndices);
      if (block !== null) return block;
      if (Math.random() < 0.35) {
        const preferred = [4, 0, 2, 6, 8].filter((idx) => board[idx] === null);
        if (preferred.length > 0) return preferred[Math.floor(Math.random() * preferred.length)];
      }
    }

    let bestScore = -Infinity;
    let bestMoves: number[] = [];
    for (const idx of openIndices) {
      board[idx] = aiMark;
      const score = minimaxTtt(board, 0, false, aiMark, humanMark);
      board[idx] = null;
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [idx];
      } else if (score === bestScore) {
        bestMoves.push(idx);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // Generalized NxN / K-in-a-row Heuristic AI
  const candidates = getCandidateCells(board, boardSize);
  const immediateWin = findImmediateWinningMove(board, aiMark, boardSize, winTarget, candidates);
  if (immediateWin !== null && (difficulty !== 'easy' || Math.random() < 0.75)) {
    return immediateWin;
  }

  const urgentBlock = findImmediateWinningMove(board, humanMark, boardSize, winTarget, candidates);
  if (urgentBlock !== null && (difficulty !== 'easy' || Math.random() < 0.5)) {
    return urgentBlock;
  }

  const center = (boardSize - 1) / 2;
  const defenseWeight = difficulty === 'hard' ? 1.12 : difficulty === 'medium' ? 0.92 : 0.45;
  const ranked = candidates
    .map((idx) => {
      const r = Math.floor(idx / boardSize);
      const c = idx % boardSize;
      const attack = scoreLineForMark(board, boardSize, winTarget, r, c, aiMark);
      const defense = scoreLineForMark(board, boardSize, winTarget, r, c, humanMark);
      const centerBonus = Math.max(0, boardSize - (Math.abs(r - center) + Math.abs(c - center))) * 0.6;
      const jitter = difficulty === 'easy' ? Math.random() * 12 : difficulty === 'medium' ? Math.random() * 3 : 0;
      return {
        idx,
        score: attack + defense * defenseWeight + centerBonus + jitter,
      };
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

export function chooseRpsAiMove(difficulty: DifficultyLevel, recentPlayerMoves: RpsMove[]): RpsMove {
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
  if (Math.random() < adaptChance) {
    return counterOf[favorite];
  }
  return all[Math.floor(Math.random() * 3)];
}

export function resolveRpsOutcome(playerMove: RpsMove, opponentMove: RpsMove): 'win' | 'loss' | 'draw' {
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
