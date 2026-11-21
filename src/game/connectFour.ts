import type { DifficultyLevel } from '../types.ts';

export const C4_COLS = 7;
export const C4_ROWS = 6;
export type C4Cell = 'R' | 'Y' | null;

export function createC4Board(): C4Cell[] {
  return Array(C4_COLS * C4_ROWS).fill(null);
}

export function getC4DropRow(board: C4Cell[], col: number): number {
  if (col < 0 || col >= C4_COLS) return -1;
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    if (board[row * C4_COLS + col] === null) return row;
  }
  return -1;
}

export function evaluateC4Board(board: C4Cell[]): {
  winner: 'R' | 'Y' | 'draw' | null;
  line: number[] | null;
} {
  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const mark = board[r * C4_COLS + c];
      if (!mark) continue;
      for (const [dr, dc] of dirs) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= C4_ROWS || ec < 0 || ec >= C4_COLS) continue;
        const line = [
          r * C4_COLS + c,
          (r + dr) * C4_COLS + (c + dc),
          (r + dr * 2) * C4_COLS + (c + dc * 2),
          er * C4_COLS + ec,
        ];
        if (line.every((idx) => board[idx] === mark)) {
          return { winner: mark, line };
        }
      }
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}

function scoreWindow(window: C4Cell[], aiMark: 'R' | 'Y', humanMark: 'R' | 'Y'): number {
  let aiCount = 0;
  let humanCount = 0;
  let emptyCount = 0;
  for (const c of window) {
    if (c === aiMark) aiCount++;
    else if (c === humanMark) humanCount++;
    else emptyCount++;
  }
  if (aiCount === 4) return 10_000;
  if (humanCount === 4) return -10_000;
  if (aiCount === 3 && emptyCount === 1) return 35;
  if (aiCount === 2 && emptyCount === 2) return 8;
  if (humanCount === 3 && emptyCount === 1) return -45;
  if (humanCount === 2 && emptyCount === 2) return -6;
  return 0;
}

function heuristicC4(board: C4Cell[], aiMark: 'R' | 'Y'): number {
  const humanMark: 'R' | 'Y' = aiMark === 'R' ? 'Y' : 'R';
  let score = 0;
  // Center column preference
  const centerCol = 3;
  for (let r = 0; r < C4_ROWS; r++) {
    if (board[r * C4_COLS + centerCol] === aiMark) score += 6;
    else if (board[r * C4_COLS + centerCol] === humanMark) score -= 4;
  }
  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      for (const [dr, dc] of dirs) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= C4_ROWS || ec < 0 || ec >= C4_COLS) continue;
        score += scoreWindow(
          [
            board[r * C4_COLS + c],
            board[(r + dr) * C4_COLS + (c + dc)],
            board[(r + dr * 2) * C4_COLS + (c + dc * 2)],
            board[er * C4_COLS + ec],
          ],
          aiMark,
          humanMark
        );
      }
    }
  }
  return score;
}

const COL_ORDER = [3, 2, 4, 1, 5, 0, 6];

function minimaxC4(
  board: C4Cell[],
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  aiMark: 'R' | 'Y'
): { col: number; score: number } {
  const humanMark: 'R' | 'Y' = aiMark === 'R' ? 'Y' : 'R';
  const validCols = COL_ORDER.filter((c) => getC4DropRow(board, c) >= 0);
  const evalRes = evaluateC4Board(board);
  if (evalRes.winner === aiMark) return { col: -1, score: 1_000_000 + depth * 100 };
  if (evalRes.winner === humanMark) return { col: -1, score: -1_000_000 - depth * 100 };
  if (evalRes.winner === 'draw' || depth === 0 || validCols.length === 0) {
    return { col: validCols[0] ?? -1, score: heuristicC4(board, aiMark) };
  }

  let bestCol = validCols[0];
  if (maximizing) {
    let value = -Infinity;
    for (const col of validCols) {
      const row = getC4DropRow(board, col);
      const idx = row * C4_COLS + col;
      board[idx] = aiMark;
      const next = minimaxC4(board, depth - 1, alpha, beta, false, aiMark).score;
      board[idx] = null;
      if (next > value) {
        value = next;
        bestCol = col;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return { col: bestCol, score: value };
  } else {
    let value = Infinity;
    for (const col of validCols) {
      const row = getC4DropRow(board, col);
      const idx = row * C4_COLS + col;
      board[idx] = humanMark;
      const next = minimaxC4(board, depth - 1, alpha, beta, true, aiMark).score;
      board[idx] = null;
      if (next < value) {
        value = next;
        bestCol = col;
      }
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return { col: bestCol, score: value };
  }
}

export function chooseC4AiMove(board: C4Cell[], difficulty: DifficultyLevel, aiMark: 'R' | 'Y' = 'Y'): number {
  const validCols = COL_ORDER.filter((c) => getC4DropRow(board, c) >= 0);
  if (validCols.length === 0) return -1;
  const copy = [...board];
  const humanMark: 'R' | 'Y' = aiMark === 'R' ? 'Y' : 'R';

  // Immediate win check
  for (const col of validCols) {
    const row = getC4DropRow(copy, col);
    copy[row * C4_COLS + col] = aiMark;
    if (evaluateC4Board(copy).winner === aiMark) {
      return col;
    }
    copy[row * C4_COLS + col] = null;
  }

  // Block immediate opponent win (easy blocks 50%, medium/hard 100%)
  for (const col of validCols) {
    const row = getC4DropRow(copy, col);
    copy[row * C4_COLS + col] = humanMark;
    if (evaluateC4Board(copy).winner === humanMark) {
      copy[row * C4_COLS + col] = null;
      if (difficulty !== 'easy' || Math.random() < 0.5) return col;
    }
    copy[row * C4_COLS + col] = null;
  }

  if (difficulty === 'easy') {
    return validCols[Math.floor(Math.random() * validCols.length)];
  }
  const depth = difficulty === 'hard' ? 5 : 3;
  return minimaxC4(copy, depth, -Infinity, Infinity, true, aiMark).col;
}
