import type { DifficultyLevel } from '../types.ts';

export type CheckersPiece = 'r' | 'R' | 'b' | 'B' | null;

export interface CheckersGameState {
  board: CheckersPiece[];
  turn: 'r' | 'b';
  mustContinueFrom: number | null;
  winnerTeam: 'r' | 'b' | 'draw' | null;
  lastFrom: number | null;
  lastTo: number | null;
  statusText: string;
}

export interface CheckersMove {
  from: number;
  to: number;
  capturedIdx: number | null;
}

export function createInitialCheckersState(): CheckersGameState {
  const board: CheckersPiece[] = Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) board[r * 8 + c] = 'b';
        else if (r > 4) board[r * 8 + c] = 'r';
      }
    }
  }
  return {
    board,
    turn: 'r',
    mustContinueFrom: null,
    winnerTeam: null,
    lastFrom: null,
    lastTo: null,
    statusText: 'Red moves first. Select a piece to move or jump.',
  };
}

export function checkersPieceColor(p: CheckersPiece): 'r' | 'b' | null {
  if (!p) return null;
  return p === 'r' || p === 'R' ? 'r' : 'b';
}

function getMoveDirs(p: CheckersPiece): Array<[number, number]> {
  if (!p) return [];
  if (p === 'R' || p === 'B') {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  return p === 'r'
    ? [
        [-1, -1],
        [-1, 1],
      ]
    : [
        [1, -1],
        [1, 1],
      ];
}

function getCapturesFromSquare(board: CheckersPiece[], idx: number, turn: 'r' | 'b'): CheckersMove[] {
  const piece = board[idx];
  if (!piece || checkersPieceColor(piece) !== turn) return [];
  const r = Math.floor(idx / 8);
  const c = idx % 8;
  const out: CheckersMove[] = [];
  for (const [dr, dc] of getMoveDirs(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const jr = r + dr * 2;
    const jc = c + dc * 2;
    if (jr < 0 || jr >= 8 || jc < 0 || jc >= 8) continue;
    const midIdx = mr * 8 + mc;
    const jumpIdx = jr * 8 + jc;
    const midPiece = board[midIdx];
    if (midPiece && checkersPieceColor(midPiece) !== turn && board[jumpIdx] === null) {
      out.push({ from: idx, to: jumpIdx, capturedIdx: midIdx });
    }
  }
  return out;
}

export function getLegalCheckersMoves(state: CheckersGameState): CheckersMove[] {
  if (state.winnerTeam) return [];
  const { board, turn, mustContinueFrom } = state;
  if (mustContinueFrom !== null) {
    return getCapturesFromSquare(board, mustContinueFrom, turn);
  }

  const captures: CheckersMove[] = [];
  const steps: CheckersMove[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || checkersPieceColor(p) !== turn) continue;
    const caps = getCapturesFromSquare(board, i, turn);
    if (caps.length > 0) {
      captures.push(...caps);
      continue;
    }
    const r = Math.floor(i / 8);
    const c = i % 8;
    for (const [dr, dc] of getMoveDirs(p)) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      const ni = nr * 8 + nc;
      if (board[ni] === null) {
        steps.push({ from: i, to: ni, capturedIdx: null });
      }
    }
  }
  return captures.length > 0 ? captures : steps;
}

export function applyCheckersMove(state: CheckersGameState, move: CheckersMove): CheckersGameState {
  const board = [...state.board];
  let piece = board[move.from]!;
  board[move.from] = null;
  if (move.capturedIdx !== null) {
    board[move.capturedIdx] = null;
  }

  const toRow = Math.floor(move.to / 8);
  let promoted = false;
  if (piece === 'r' && toRow === 0) {
    piece = 'R';
    promoted = true;
  } else if (piece === 'b' && toRow === 7) {
    piece = 'B';
    promoted = true;
  }
  board[move.to] = piece;

  // Multi-jump check (if captured and not newly crowned into a stop)
  if (move.capturedIdx !== null && !promoted) {
    const moreCaps = getCapturesFromSquare(board, move.to, state.turn);
    if (moreCaps.length > 0) {
      return {
        board,
        turn: state.turn,
        mustContinueFrom: move.to,
        winnerTeam: null,
        lastFrom: move.from,
        lastTo: move.to,
        statusText: `${state.turn === 'r' ? 'Red' : 'Black'} must continue multi-jump capture!`,
      };
    }
  }

  const nextTurn: 'r' | 'b' = state.turn === 'r' ? 'b' : 'r';
  const nextBase: CheckersGameState = {
    board,
    turn: nextTurn,
    mustContinueFrom: null,
    winnerTeam: null,
    lastFrom: move.from,
    lastTo: move.to,
    statusText: '',
  };
  const nextMoves = getLegalCheckersMoves(nextBase);
  if (nextMoves.length === 0) {
    return {
      ...nextBase,
      winnerTeam: state.turn,
      statusText: `${state.turn === 'r' ? 'Red' : 'Black'} wins! Opponent has no legal moves.`,
    };
  }
  const hasForcedJump = nextMoves[0].capturedIdx !== null;
  return {
    ...nextBase,
    statusText: hasForcedJump
      ? `${nextTurn === 'r' ? 'Red' : 'Black'} to move (jump capture available).`
      : `${nextTurn === 'r' ? 'Red' : 'Black'}'s turn.`,
  };
}

function evaluateCheckersBoard(board: CheckersPiece[], aiTeam: 'r' | 'b'): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const row = Math.floor(i / 8);
    const col = i % 8;
    const isKing = p === 'R' || p === 'B';
    const color = checkersPieceColor(p)!;
    const baseVal = isKing ? 185 : 100;
    const advBonus = isKing ? 0 : color === 'r' ? (7 - row) * 4 : row * 4;
    const centerBonus = col >= 2 && col <= 5 && row >= 2 && row <= 5 ? 8 : 0;
    const edgeSafety = col === 0 || col === 7 ? 5 : 0;
    const val = baseVal + advBonus + centerBonus + edgeSafety;
    score += color === aiTeam ? val : -val;
  }
  return score;
}

function alphabetaCheckers(
  state: CheckersGameState,
  depth: number,
  alpha: number,
  beta: number,
  aiTeam: 'r' | 'b'
): number {
  if (state.winnerTeam) {
    return state.winnerTeam === aiTeam ? 10000 + depth : -10000 - depth;
  }
  if (depth <= 0) {
    return evaluateCheckersBoard(state.board, aiTeam);
  }
  const moves = getLegalCheckersMoves(state);
  if (moves.length === 0) {
    return state.turn === aiTeam ? -9999 : 9999;
  }
  const maximizing = state.turn === aiTeam;
  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyCheckersMove(state, m);
      const nextDepth = next.turn === state.turn ? depth : depth - 1;
      const val = alphabetaCheckers(next, nextDepth, alpha, beta, aiTeam);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const next = applyCheckersMove(state, m);
      const nextDepth = next.turn === state.turn ? depth : depth - 1;
      const val = alphabetaCheckers(next, nextDepth, alpha, beta, aiTeam);
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
}

export function chooseCheckersAiMove(
  state: CheckersGameState,
  difficulty: DifficultyLevel
): CheckersMove | null {
  const moves = getLegalCheckersMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  if (difficulty === 'easy' && Math.random() < 0.45) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = difficulty === 'hard' ? 5 : difficulty === 'medium' ? 3 : 1;
  const aiTeam = state.turn;
  let bestScore = -Infinity;
  let bestMoves: CheckersMove[] = [];

  for (const m of moves) {
    const next = applyCheckersMove(state, m);
    const val = alphabetaCheckers(next, next.turn === state.turn ? depth : depth - 1, -Infinity, Infinity, aiTeam);
    if (val > bestScore) {
      bestScore = val;
      bestMoves = [m];
    } else if (val === bestScore) {
      bestMoves.push(m);
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] || moves[0];
}
