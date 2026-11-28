import type { DifficultyLevel } from '../types.ts';

export type ReversiCell = 'B' | 'W' | null;

export interface ReversiGameState {
  board: ReversiCell[];
  turn: 'B' | 'W';
  winnerTeam: 'B' | 'W' | 'draw' | null;
  lastMove: number | null;
  blackCount: number;
  whiteCount: number;
  statusText: string;
}

const DIRS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const WEIGHTS = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

export function createInitialReversiState(): ReversiGameState {
  const board: ReversiCell[] = Array(64).fill(null);
  board[27] = 'W';
  board[28] = 'B';
  board[35] = 'B';
  board[36] = 'W';
  return {
    board,
    turn: 'B',
    winnerTeam: null,
    lastMove: null,
    blackCount: 2,
    whiteCount: 2,
    statusText: 'Black moves first. Outflank opponent discs to flip them.',
  };
}

export function getReversiFlips(board: ReversiCell[], idx: number, turn: 'B' | 'W'): number[] {
  if (board[idx] !== null) return [];
  const opp: 'B' | 'W' = turn === 'B' ? 'W' : 'B';
  const r = Math.floor(idx / 8);
  const c = idx % 8;
  const flips: number[] = [];

  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const ni = nr * 8 + nc;
      const cell = board[ni];
      if (cell === opp) {
        line.push(ni);
      } else if (cell === turn) {
        if (line.length > 0) flips.push(...line);
        break;
      } else {
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return flips;
}

export function getReversiValidMoves(board: ReversiCell[], turn: 'B' | 'W'): number[] {
  const valid: number[] = [];
  for (let i = 0; i < 64; i++) {
    if (getReversiFlips(board, i, turn).length > 0) valid.push(i);
  }
  return valid;
}

function countDiscs(board: ReversiCell[]): { blackCount: number; whiteCount: number } {
  let blackCount = 0;
  let whiteCount = 0;
  for (const cell of board) {
    if (cell === 'B') blackCount += 1;
    else if (cell === 'W') whiteCount += 1;
  }
  return { blackCount, whiteCount };
}

export function applyReversiMove(state: ReversiGameState, idx: number): ReversiGameState | null {
  if (state.winnerTeam) return null;
  const flips = getReversiFlips(state.board, idx, state.turn);
  if (flips.length === 0) return null;

  const board = [...state.board];
  board[idx] = state.turn;
  for (const f of flips) board[f] = state.turn;

  const { blackCount, whiteCount } = countDiscs(board);
  const opp: 'B' | 'W' = state.turn === 'B' ? 'W' : 'B';
  const oppMoves = getReversiValidMoves(board, opp);
  if (oppMoves.length > 0) {
    return {
      board,
      turn: opp,
      winnerTeam: null,
      lastMove: idx,
      blackCount,
      whiteCount,
      statusText: `${opp === 'B' ? 'Black' : 'White'}'s turn (${oppMoves.length} legal squares).`,
    };
  }

  const selfMoves = getReversiValidMoves(board, state.turn);
  if (selfMoves.length > 0) {
    return {
      board,
      turn: state.turn,
      winnerTeam: null,
      lastMove: idx,
      blackCount,
      whiteCount,
      statusText: `${opp === 'B' ? 'Black' : 'White'} had no legal moves — turn passes back to ${state.turn === 'B' ? 'Black' : 'White'}!`,
    };
  }

  const winnerTeam: 'B' | 'W' | 'draw' =
    blackCount > whiteCount ? 'B' : whiteCount > blackCount ? 'W' : 'draw';
  return {
    board,
    turn: opp,
    winnerTeam,
    lastMove: idx,
    blackCount,
    whiteCount,
    statusText:
      winnerTeam === 'draw'
        ? `Draw! Both players finished with ${blackCount} discs.`
        : `${winnerTeam === 'B' ? 'Black' : 'White'} wins ${Math.max(blackCount, whiteCount)}–${Math.min(blackCount, whiteCount)}!`,
  };
}

function scoreReversiBoard(board: ReversiCell[], aiTeam: 'B' | 'W'): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    if (board[i] === aiTeam) score += WEIGHTS[i];
    else if (board[i] !== null) score -= WEIGHTS[i];
  }
  const myMoves = getReversiValidMoves(board, aiTeam).length;
  const oppMoves = getReversiValidMoves(board, aiTeam === 'B' ? 'W' : 'B').length;
  score += (myMoves - oppMoves) * 6;
  return score;
}

function minimaxReversi(
  state: ReversiGameState,
  depth: number,
  alpha: number,
  beta: number,
  aiTeam: 'B' | 'W'
): number {
  if (state.winnerTeam) {
    if (state.winnerTeam === 'draw') return 0;
    return state.winnerTeam === aiTeam ? 10000 + depth : -10000 - depth;
  }
  if (depth <= 0) return scoreReversiBoard(state.board, aiTeam);
  const moves = getReversiValidMoves(state.board, state.turn);
  if (moves.length === 0) return scoreReversiBoard(state.board, aiTeam);

  const maximizing = state.turn === aiTeam;
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyReversiMove(state, m)!;
      const v = minimaxReversi(next, depth - 1, alpha, beta, aiTeam);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    const next = applyReversiMove(state, m)!;
    const v = minimaxReversi(next, depth - 1, alpha, beta, aiTeam);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseReversiAiMove(state: ReversiGameState, difficulty: DifficultyLevel): number {
  const moves = getReversiValidMoves(state.board, state.turn);
  if (moves.length === 0) return -1;
  if (difficulty === 'easy') {
    if (Math.random() < 0.55) return moves[Math.floor(Math.random() * moves.length)];
    // Greedy flips on easy
    return moves.reduce((best, m) =>
      getReversiFlips(state.board, m, state.turn).length >
      getReversiFlips(state.board, best, state.turn).length
        ? m
        : best
    );
  }
  const depth = difficulty === 'hard' ? 4 : 2;
  const aiTeam = state.turn;
  let bestMove = moves[0];
  let bestVal = -Infinity;
  for (const m of moves) {
    const next = applyReversiMove(state, m)!;
    const val = minimaxReversi(next, depth - 1, -Infinity, Infinity, aiTeam);
    if (val > bestVal) {
      bestVal = val;
      bestMove = m;
    }
  }
  return bestMove;
}
