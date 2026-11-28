import type { DifficultyLevel } from '../types.ts';

export type DotsOwner = 'A' | 'B' | null;

export interface DotsAndBoxesState {
  rows: number; // number of boxes vertically (e.g. 4 => 5 dot rows)
  cols: number; // number of boxes horizontally (e.g. 4 => 5 dot cols)
  hEdges: DotsOwner[]; // (rows + 1) * cols
  vEdges: DotsOwner[]; // rows * (cols + 1)
  boxes: DotsOwner[]; // rows * cols
  turn: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  winnerTeam: 'A' | 'B' | 'draw' | null;
  statusText: string;
}

export interface DotsEdgeMove {
  orientation: 'h' | 'v';
  index: number;
}

export function createInitialDotsState(rows = 4, cols = 4): DotsAndBoxesState {
  return {
    rows,
    cols,
    hEdges: Array((rows + 1) * cols).fill(null),
    vEdges: Array(rows * (cols + 1)).fill(null),
    boxes: Array(rows * cols).fill(null),
    turn: 'A',
    scoreA: 0,
    scoreB: 0,
    winnerTeam: null,
    statusText: 'Connect two adjacent dots. Closing a square scores 1 point and gives an extra turn!',
  };
}

function countBoxSides(
  rows: number,
  cols: number,
  hEdges: DotsOwner[],
  vEdges: DotsOwner[],
  br: number,
  bc: number
): number {
  let count = 0;
  if (hEdges[br * cols + bc] !== null) count += 1;
  if (hEdges[(br + 1) * cols + bc] !== null) count += 1;
  if (vEdges[br * (cols + 1) + bc] !== null) count += 1;
  if (vEdges[br * (cols + 1) + (bc + 1)] !== null) count += 1;
  return count;
}

export function applyDotsMove(state: DotsAndBoxesState, move: DotsEdgeMove): DotsAndBoxesState | null {
  if (state.winnerTeam) return null;
  const hEdges = [...state.hEdges];
  const vEdges = [...state.vEdges];
  const boxes = [...state.boxes];

  if (move.orientation === 'h') {
    if (move.index < 0 || move.index >= hEdges.length || hEdges[move.index] !== null) return null;
    hEdges[move.index] = state.turn;
  } else {
    if (move.index < 0 || move.index >= vEdges.length || vEdges[move.index] !== null) return null;
    vEdges[move.index] = state.turn;
  }

  let newlyClaimed = 0;
  for (let br = 0; br < state.rows; br++) {
    for (let bc = 0; bc < state.cols; bc++) {
      const bi = br * state.cols + bc;
      if (boxes[bi] === null && countBoxSides(state.rows, state.cols, hEdges, vEdges, br, bc) === 4) {
        boxes[bi] = state.turn;
        newlyClaimed += 1;
      }
    }
  }

  const scoreA = boxes.filter((b) => b === 'A').length;
  const scoreB = boxes.filter((b) => b === 'B').length;
  const totalBoxes = state.rows * state.cols;

  if (scoreA + scoreB === totalBoxes) {
    const winnerTeam: 'A' | 'B' | 'draw' = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw';
    return {
      ...state,
      hEdges,
      vEdges,
      boxes,
      scoreA,
      scoreB,
      winnerTeam,
      statusText:
        winnerTeam === 'draw'
          ? `Draw at ${scoreA}–${scoreB}!`
          : `${winnerTeam === 'A' ? 'Player 1' : 'Opponent'} wins ${Math.max(scoreA, scoreB)}–${Math.min(scoreA, scoreB)}!`,
    };
  }

  const nextTurn: 'A' | 'B' = newlyClaimed > 0 ? state.turn : state.turn === 'A' ? 'B' : 'A';
  return {
    ...state,
    hEdges,
    vEdges,
    boxes,
    scoreA,
    scoreB,
    turn: nextTurn,
    statusText:
      newlyClaimed > 0
        ? `${state.turn === 'A' ? 'Player 1' : 'Opponent'} completed ${newlyClaimed} box${newlyClaimed > 1 ? 'es' : ''} and keeps the turn!`
        : `${nextTurn === 'A' ? 'Player 1' : 'Opponent'}'s turn.`,
  };
}

export function getAllOpenDotsMoves(state: DotsAndBoxesState): DotsEdgeMove[] {
  const out: DotsEdgeMove[] = [];
  for (let i = 0; i < state.hEdges.length; i++) {
    if (state.hEdges[i] === null) out.push({ orientation: 'h', index: i });
  }
  for (let i = 0; i < state.vEdges.length; i++) {
    if (state.vEdges[i] === null) out.push({ orientation: 'v', index: i });
  }
  return out;
}

function maxAdjacentBoxSidesIfPlayed(state: DotsAndBoxesState, move: DotsEdgeMove): number {
  const adjacent: Array<[number, number]> = [];
  if (move.orientation === 'h') {
    const r = Math.floor(move.index / state.cols);
    const c = move.index % state.cols;
    if (r > 0) adjacent.push([r - 1, c]);
    if (r < state.rows) adjacent.push([r, c]);
  } else {
    const r = Math.floor(move.index / (state.cols + 1));
    const c = move.index % (state.cols + 1);
    if (c > 0) adjacent.push([r, c - 1]);
    if (c < state.cols) adjacent.push([r, c]);
  }
  let maxSides = 0;
  for (const [br, bc] of adjacent) {
    const sides = countBoxSides(state.rows, state.cols, state.hEdges, state.vEdges, br, bc);
    if (sides > maxSides) maxSides = sides;
  }
  return maxSides;
}

export function chooseDotsAiMove(state: DotsAndBoxesState, difficulty: DifficultyLevel): DotsEdgeMove | null {
  const moves = getAllOpenDotsMoves(state);
  if (moves.length === 0) return null;

  if (difficulty === 'easy' && Math.random() < 0.5) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // 1. Always capture any 3-sided box immediately
  const captures = moves.filter((m) => maxAdjacentBoxSidesIfPlayed(state, m) === 3);
  if (captures.length > 0) {
    return captures[0];
  }

  // 2. Play safe moves (not creating a 3rd side for the opponent)
  const safeMoves = moves.filter((m) => maxAdjacentBoxSidesIfPlayed(state, m) < 2);
  if (safeMoves.length > 0) {
    return safeMoves[Math.floor(Math.random() * safeMoves.length)];
  }

  if (difficulty === 'medium') {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // 3. Hard: Pick the sacrifice edge that gives away the smallest chain
  let bestMove = moves[0];
  let smallestChain = Infinity;
  for (const m of moves) {
    let sim = applyDotsMove(state, m);
    if (!sim) continue;
    let givenAway = 0;
    while (sim && !sim.winnerTeam) {
      const avail = getAllOpenDotsMoves(sim);
      const forced = avail.find((am) => maxAdjacentBoxSidesIfPlayed(sim!, am) === 3);
      if (!forced) break;
      givenAway += 1;
      sim = applyDotsMove(sim, forced);
    }
    if (givenAway < smallestChain) {
      smallestChain = givenAway;
      bestMove = m;
    }
  }
  return bestMove;
}
