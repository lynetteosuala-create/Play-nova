import type { DifficultyLevel } from '../types.ts';

export type GravityCell = 'R' | 'Y' | null;

export function getGravityDropRow(board: GravityCell[], cols: number, rows: number, col: number): number {
  if (col < 0 || col >= cols) return -1;
  for (let r = rows - 1; r >= 0; r--) {
    if (board[r * cols + col] === null) return r;
  }
  return -1;
}

export function canPopOutCol(board: GravityCell[], cols: number, rows: number, col: number, team: 'R' | 'Y'): boolean {
  if (col < 0 || col >= cols) return false;
  return board[(rows - 1) * cols + col] === team;
}

export function applyPopOutCol(board: GravityCell[], cols: number, rows: number, col: number): GravityCell[] {
  const next = [...board];
  for (let r = rows - 1; r > 0; r--) {
    next[r * cols + col] = next[(r - 1) * cols + col];
  }
  next[col] = null;
  return next;
}

export function evaluateGravityBoard(
  board: GravityCell[],
  cols: number,
  rows: number,
  winTarget: number
): { winner: 'R' | 'Y' | 'draw' | null; line: number[] | null } {
  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = board[r * cols + c];
      if (!start) continue;
      for (const [dr, dc] of dirs) {
        const line: number[] = [r * cols + c];
        let matched = true;
        for (let step = 1; step < winTarget; step++) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || board[nr * cols + nc] !== start) {
            matched = false;
            break;
          }
          line.push(nr * cols + nc);
        }
        if (matched) return { winner: start, line };
      }
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}

function scoreGravityWindow(windowCells: GravityCell[], aiTeam: 'R' | 'Y'): number {
  const opp: 'R' | 'Y' = aiTeam === 'R' ? 'Y' : 'R';
  let aiCnt = 0;
  let oppCnt = 0;
  for (const c of windowCells) {
    if (c === aiTeam) aiCnt += 1;
    else if (c === opp) oppCnt += 1;
  }
  if (aiCnt > 0 && oppCnt > 0) return 0;
  if (aiCnt === 0 && oppCnt === 0) return 0;
  if (aiCnt > 0) return Math.pow(aiCnt, 3) * 4;
  return -Math.pow(oppCnt, 3) * 5;
}

function heuristicGravityScore(
  board: GravityCell[],
  cols: number,
  rows: number,
  winTarget: number,
  aiTeam: 'R' | 'Y'
): number {
  let score = 0;
  const center = Math.floor(cols / 2);
  for (let r = 0; r < rows; r++) {
    if (board[r * cols + center] === aiTeam) score += 8;
  }

  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of dirs) {
        const endR = r + dr * (winTarget - 1);
        const endC = c + dc * (winTarget - 1);
        if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue;
        const win: GravityCell[] = [];
        for (let k = 0; k < winTarget; k++) {
          win.push(board[(r + dr * k) * cols + (c + dc * k)]);
        }
        score += scoreGravityWindow(win, aiTeam);
      }
    }
  }
  return score;
}

export function chooseConnectFiveAiMove(
  board: GravityCell[],
  cols: number,
  rows: number,
  winTarget: number,
  difficulty: DifficultyLevel,
  aiTeam: 'R' | 'Y'
): number {
  const opp: 'R' | 'Y' = aiTeam === 'R' ? 'Y' : 'R';
  const validCols: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (getGravityDropRow(board, cols, rows, c) >= 0) validCols.push(c);
  }
  if (validCols.length === 0) return -1;

  // Immediate win check
  for (const c of validCols) {
    const r = getGravityDropRow(board, cols, rows, c);
    const copy = [...board];
    copy[r * cols + c] = aiTeam;
    if (evaluateGravityBoard(copy, cols, rows, winTarget).winner === aiTeam) return c;
  }

  // Immediate block check
  if (difficulty !== 'easy' || Math.random() < 0.5) {
    for (const c of validCols) {
      const r = getGravityDropRow(board, cols, rows, c);
      const copy = [...board];
      copy[r * cols + c] = opp;
      if (evaluateGravityBoard(copy, cols, rows, winTarget).winner === opp) return c;
    }
  }

  if (difficulty === 'easy') {
    return validCols[Math.floor(Math.random() * validCols.length)];
  }

  // Evaluate 2-ply lookahead
  const center = Math.floor(cols / 2);
  validCols.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));

  let bestCol = validCols[0];
  let bestVal = -Infinity;
  for (const c of validCols) {
    const r = getGravityDropRow(board, cols, rows, c);
    const copy = [...board];
    copy[r * cols + c] = aiTeam;

    if (difficulty === 'medium') {
      const val = heuristicGravityScore(copy, cols, rows, winTarget, aiTeam);
      if (val > bestVal) {
        bestVal = val;
        bestCol = c;
      }
      continue;
    }

    // Hard: 2-ply worst-case check against opponent reply
    let worstOpp = Infinity;
    for (let oc = 0; oc < cols; oc++) {
      const or = getGravityDropRow(copy, cols, rows, oc);
      if (or < 0) continue;
      const copy2 = [...copy];
      copy2[or * cols + oc] = opp;
      const ev = evaluateGravityBoard(copy2, cols, rows, winTarget);
      const v = ev.winner === opp ? -50000 : heuristicGravityScore(copy2, cols, rows, winTarget, aiTeam);
      if (v < worstOpp) worstOpp = v;
    }
    if (worstOpp > bestVal) {
      bestVal = worstOpp;
      bestCol = c;
    }
  }
  return bestCol;
}
