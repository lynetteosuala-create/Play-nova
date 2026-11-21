import type { DifficultyLevel } from '../types.ts';

export type ChessColor = 'w' | 'b';
export type PromoKind = 'Q' | 'R' | 'B' | 'N';

export interface ChessMove {
  from: number;
  to: number;
  promo?: PromoKind;
  isCastle?: 'K' | 'Q';
  isEnPassant?: boolean;
}

export interface ChessGameState {
  board: Array<string | null>; // 64 squares, index 0 = a8 (top-left), index 63 = h1 (bottom-right)
  turn: ChessColor;
  castling: string; // combination of K Q k q
  enPassant: number | null;
  halfMoveClock: number;
  moveHistory: string[];
  inCheck: boolean;
  winnerTeam: 'w' | 'b' | 'draw' | null;
  statusText: string;
  lastFrom: number | null;
  lastTo: number | null;
}

export const PIECE_VALUES: Record<string, number> = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 20000,
};

export const PIECE_UNICODE: Record<string, string> = {
  wK: '♔',
  wQ: '♕',
  wR: '♖',
  wB: '♗',
  wN: '♘',
  wP: '♙',
  bK: '♚',
  bQ: '♛',
  bR: '♜',
  bB: '♝',
  bN: '♞',
  bP: '♟',
};

export function createInitialChessState(): ChessGameState {
  const board: Array<string | null> = [
    'bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR',
    'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP',
    null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null,
    'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP',
    'wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR',
  ];
  return {
    board,
    turn: 'w',
    castling: 'KQkq',
    enPassant: null,
    halfMoveClock: 0,
    moveHistory: [],
    inCheck: false,
    winnerTeam: null,
    statusText: 'White to move',
    lastFrom: null,
    lastTo: null,
  };
}

export function squareName(idx: number): string {
  const file = 'abcdefgh'[idx % 8];
  const rank = 8 - Math.floor(idx / 8);
  return `${file}${rank}`;
}

function pieceColor(p: string | null): ChessColor | null {
  if (!p) return null;
  return p[0] === 'w' ? 'w' : 'b';
}

function isSquareAttacked(board: Array<string | null>, sq: number, byColor: ChessColor): boolean {
  const r = Math.floor(sq / 8);
  const c = sq % 8;

  // Pawns attacking sq
  const pawnDir = byColor === 'w' ? 1 : -1; // white pawns attack upward (-1 row), so attacker stands at r+1
  const pr = r + pawnDir;
  if (pr >= 0 && pr < 8) {
    if (c - 1 >= 0 && board[pr * 8 + (c - 1)] === `${byColor}P`) return true;
    if (c + 1 < 8 && board[pr * 8 + (c + 1)] === `${byColor}P`) return true;
  }

  // Knights
  const knightSteps = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightSteps) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === `${byColor}N`) return true;
  }

  // King
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr * 8 + nc] === `${byColor}K`) return true;
    }
  }

  // Orthogonal rays (Rook / Queen)
  const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of ortho) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr * 8 + nc];
      if (p) {
        if (p === `${byColor}R` || p === `${byColor}Q`) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Diagonal rays (Bishop / Queen)
  const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diag) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[nr * 8 + nc];
      if (p) {
        if (p === `${byColor}B` || p === `${byColor}Q`) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return false;
}

export function isKingInCheck(board: Array<string | null>, color: ChessColor): boolean {
  const kingIdx = board.indexOf(`${color}K`);
  if (kingIdx === -1) return false;
  return isSquareAttacked(board, kingIdx, color === 'w' ? 'b' : 'w');
}

function generatePseudoMoves(state: ChessGameState, fromSq?: number): ChessMove[] {
  const moves: ChessMove[] = [];
  const color = state.turn;
  const opp: ChessColor = color === 'w' ? 'b' : 'w';
  const start = fromSq !== undefined ? fromSq : 0;
  const end = fromSq !== undefined ? fromSq : 63;

  for (let sq = start; sq <= end; sq++) {
    const piece = state.board[sq];
    if (!piece || piece[0] !== color) continue;
    const type = piece[1];
    const r = Math.floor(sq / 8);
    const c = sq % 8;

    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;

      const oneR = r + dir;
      if (oneR >= 0 && oneR < 8) {
        const oneSq = oneR * 8 + c;
        if (!state.board[oneSq]) {
          if (oneR === promoRow) {
            moves.push({ from: sq, to: oneSq, promo: 'Q' });
            moves.push({ from: sq, to: oneSq, promo: 'R' });
            moves.push({ from: sq, to: oneSq, promo: 'B' });
            moves.push({ from: sq, to: oneSq, promo: 'N' });
          } else {
            moves.push({ from: sq, to: oneSq });
            if (r === startRow) {
              const twoSq = (r + dir * 2) * 8 + c;
              if (!state.board[twoSq]) moves.push({ from: sq, to: twoSq });
            }
          }
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc >= 8) continue;
          const capSq = oneR * 8 + nc;
          const target = state.board[capSq];
          if (target && pieceColor(target) === opp) {
            if (oneR === promoRow) {
              moves.push({ from: sq, to: capSq, promo: 'Q' });
              moves.push({ from: sq, to: capSq, promo: 'N' });
            } else {
              moves.push({ from: sq, to: capSq });
            }
          } else if (state.enPassant === capSq) {
            moves.push({ from: sq, to: capSq, isEnPassant: true });
          }
        }
      }
    } else if (type === 'N') {
      for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
        const to = nr * 8 + nc;
        if (pieceColor(state.board[to]) !== color) moves.push({ from: sq, to });
      }
    } else if (type === 'B' || type === 'R' || type === 'Q') {
      const rays: Array<[number, number]> = [];
      if (type !== 'B') rays.push([-1, 0], [1, 0], [0, -1], [0, 1]);
      if (type !== 'R') rays.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
      for (const [dr, dc] of rays) {
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const to = nr * 8 + nc;
          const target = state.board[to];
          if (!target) {
            moves.push({ from: sq, to });
          } else {
            if (pieceColor(target) === opp) moves.push({ from: sq, to });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    } else if (type === 'K') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
          const to = nr * 8 + nc;
          if (pieceColor(state.board[to]) !== color) moves.push({ from: sq, to });
        }
      }
      // Castling
      const homeRow = color === 'w' ? 7 : 0;
      const kingSq = homeRow * 8 + 4;
      if (sq === kingSq && !isSquareAttacked(state.board, kingSq, opp)) {
        const kFlag = color === 'w' ? 'K' : 'k';
        const qFlag = color === 'w' ? 'Q' : 'q';
        if (
          state.castling.includes(kFlag) &&
          !state.board[homeRow * 8 + 5] &&
          !state.board[homeRow * 8 + 6] &&
          state.board[homeRow * 8 + 7] === `${color}R` &&
          !isSquareAttacked(state.board, homeRow * 8 + 5, opp) &&
          !isSquareAttacked(state.board, homeRow * 8 + 6, opp)
        ) {
          moves.push({ from: kingSq, to: homeRow * 8 + 6, isCastle: 'K' });
        }
        if (
          state.castling.includes(qFlag) &&
          !state.board[homeRow * 8 + 3] &&
          !state.board[homeRow * 8 + 2] &&
          !state.board[homeRow * 8 + 1] &&
          state.board[homeRow * 8 + 0] === `${color}R` &&
          !isSquareAttacked(state.board, homeRow * 8 + 3, opp) &&
          !isSquareAttacked(state.board, homeRow * 8 + 2, opp)
        ) {
          moves.push({ from: kingSq, to: homeRow * 8 + 2, isCastle: 'Q' });
        }
      }
    }
  }
  return moves;
}

function executeRawMove(state: ChessGameState, move: ChessMove): Array<string | null> {
  const next = [...state.board];
  const piece = next[move.from]!;
  const color = piece[0] as ChessColor;
  next[move.to] = move.promo ? `${color}${move.promo}` : piece;
  next[move.from] = null;

  if (move.isEnPassant) {
    const capRow = color === 'w' ? Math.floor(move.to / 8) + 1 : Math.floor(move.to / 8) - 1;
    next[capRow * 8 + (move.to % 8)] = null;
  }
  if (move.isCastle === 'K') {
    const row = color === 'w' ? 7 : 0;
    next[row * 8 + 5] = next[row * 8 + 7];
    next[row * 8 + 7] = null;
  } else if (move.isCastle === 'Q') {
    const row = color === 'w' ? 7 : 0;
    next[row * 8 + 3] = next[row * 8 + 0];
    next[row * 8 + 0] = null;
  }
  return next;
}

export function getLegalChessMoves(state: ChessGameState, fromSq?: number): ChessMove[] {
  if (state.winnerTeam) return [];
  const pseudo = generatePseudoMoves(state, fromSq);
  return pseudo.filter((m) => {
    const nextBoard = executeRawMove(state, m);
    return !isKingInCheck(nextBoard, state.turn);
  });
}

function hasInsufficientMaterial(board: Array<string | null>): boolean {
  const pieces = board.filter((p): p is string => Boolean(p));
  if (pieces.length <= 2) return true; // K vs K
  if (pieces.length === 3) {
    return pieces.some((p) => p[1] === 'N' || p[1] === 'B');
  }
  return false;
}

export function applyChessMove(state: ChessGameState, move: ChessMove): ChessGameState {
  const piece = state.board[move.from];
  if (!piece) return state;
  const color = piece[0] as ChessColor;
  const opp: ChessColor = color === 'w' ? 'b' : 'w';
  const captured = Boolean(state.board[move.to]) || Boolean(move.isEnPassant);

  const nextBoard = executeRawMove(state, move);

  // Update castling rights
  let castling = state.castling;
  if (piece === 'wK') castling = castling.replace('K', '').replace('Q', '');
  if (piece === 'bK') castling = castling.replace('k', '').replace('q', '');
  if (move.from === 63 || move.to === 63) castling = castling.replace('K', '');
  if (move.from === 56 || move.to === 56) castling = castling.replace('Q', '');
  if (move.from === 7 || move.to === 7) castling = castling.replace('k', '');
  if (move.from === 0 || move.to === 0) castling = castling.replace('q', '');

  // Update enPassant target
  let enPassant: number | null = null;
  if (piece[1] === 'P' && Math.abs(Math.floor(move.from / 8) - Math.floor(move.to / 8)) === 2) {
    enPassant = Math.floor((move.from + move.to) / 2);
  }

  const halfMoveClock = piece[1] === 'P' || captured ? 0 : state.halfMoveClock + 1;
  const inCheck = isKingInCheck(nextBoard, opp);

  const probeState: ChessGameState = {
    board: nextBoard,
    turn: opp,
    castling,
    enPassant,
    halfMoveClock,
    moveHistory: state.moveHistory,
    inCheck,
    winnerTeam: null,
    statusText: '',
    lastFrom: move.from,
    lastTo: move.to,
  };

  const oppMoves = getLegalChessMoves(probeState);
  let winnerTeam: 'w' | 'b' | 'draw' | null = null;
  let statusText = `${opp === 'w' ? 'White' : 'Black'} to move`;

  if (oppMoves.length === 0) {
    if (inCheck) {
      winnerTeam = color;
      statusText = `Checkmate — ${color === 'w' ? 'White' : 'Black'} wins!`;
    } else {
      winnerTeam = 'draw';
      statusText = 'Stalemate — Draw!';
    }
  } else if (halfMoveClock >= 100) {
    winnerTeam = 'draw';
    statusText = 'Draw by 50-move rule';
  } else if (hasInsufficientMaterial(nextBoard)) {
    winnerTeam = 'draw';
    statusText = 'Draw — Insufficient material';
  } else if (inCheck) {
    statusText = `Check — ${opp === 'w' ? 'White' : 'Black'} to move`;
  }

  const prefix = piece[1] === 'P' ? (captured ? squareName(move.from)[0] : '') : piece[1];
  const suffix = winnerTeam && winnerTeam !== 'draw' ? '#' : inCheck ? '+' : '';
  const notation =
    move.isCastle === 'K'
      ? `O-O${suffix}`
      : move.isCastle === 'Q'
      ? `O-O-O${suffix}`
      : `${prefix}${captured ? 'x' : ''}${squareName(move.to)}${move.promo ? `=${move.promo}` : ''}${suffix}`;

  return {
    ...probeState,
    winnerTeam,
    statusText,
    moveHistory: [...state.moveHistory, notation],
  };
}

function evaluateChessBoard(state: ChessGameState, aiColor: ChessColor): number {
  if (state.winnerTeam === aiColor) return 100_000;
  if (state.winnerTeam && state.winnerTeam !== 'draw') return -100_000;
  if (state.winnerTeam === 'draw') return 0;

  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (!p) continue;
    const base = PIECE_VALUES[p[1]] || 0;
    const r = Math.floor(sq / 8);
    const c = sq % 8;
    // Slight central & advancement bonus
    const centerBonus = (3.5 - Math.abs(c - 3.5)) * 4 + (3.5 - Math.abs(r - 3.5)) * 4;
    const advanceBonus = p[1] === 'P' ? (p[0] === 'w' ? (6 - r) * 10 : (r - 1) * 10) : 0;
    const total = base + (p[1] === 'K' ? 0 : centerBonus) + advanceBonus;
    score += p[0] === aiColor ? total : -total;
  }
  return score;
}

function minimaxChess(
  state: ChessGameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  aiColor: ChessColor
): { move: ChessMove | null; score: number } {
  const legal = getLegalChessMoves(state);
  if (depth === 0 || legal.length === 0 || state.winnerTeam) {
    return { move: null, score: evaluateChessBoard(state, aiColor) };
  }

  // Prioritize captures & checks for better alpha-beta pruning
  legal.sort((a, b) => {
    const capA = state.board[a.to] ? PIECE_VALUES[state.board[a.to]![1]] || 0 : 0;
    const capB = state.board[b.to] ? PIECE_VALUES[state.board[b.to]![1]] || 0 : 0;
    return capB - capA;
  });

  let bestMove = legal[0];
  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of legal) {
      const next = applyChessMove(state, move);
      const val = minimaxChess(next, depth - 1, alpha, beta, false, aiColor).score;
      if (val > maxEval) {
        maxEval = val;
        bestMove = move;
      }
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return { move: bestMove, score: maxEval };
  } else {
    let minEval = Infinity;
    for (const move of legal) {
      const next = applyChessMove(state, move);
      const val = minimaxChess(next, depth - 1, alpha, beta, true, aiColor).score;
      if (val < minEval) {
        minEval = val;
        bestMove = move;
      }
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return { move: bestMove, score: minEval };
  }
}

export function chooseChessAiMove(state: ChessGameState, difficulty: DifficultyLevel): ChessMove | null {
  const legal = getLegalChessMoves(state);
  if (legal.length === 0) return null;
  if (difficulty === 'easy') {
    const captures = legal.filter((m) => Boolean(state.board[m.to]));
    if (captures.length > 0 && Math.random() < 0.55) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    return legal[Math.floor(Math.random() * legal.length)];
  }
  const depth = difficulty === 'hard' ? 3 : 2;
  return minimaxChess(state, depth, -Infinity, Infinity, true, state.turn).move || legal[0];
}
