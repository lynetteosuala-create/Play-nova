export type TttCell = 'X' | 'O' | null;

export const MIN_WIN_TARGET = 3;
export const MAX_WIN_TARGET = 12;
export const MIN_BOARD_SIZE = 3;
export const MAX_BOARD_SIZE = 15;

export function recommendedBoardSize(winTarget: number): number {
  const k = Math.max(MIN_WIN_TARGET, Math.min(MAX_WIN_TARGET, Math.round(winTarget)));
  if (k === 3) return 3;
  if (k === 4) return 5;
  return Math.min(MAX_BOARD_SIZE, k + 2);
}

export function normalizeTttConfig(
  winTargetInput: unknown,
  boardSizeInput?: unknown
): { winTarget: number; boardSize: number } {
  const rawTarget = Number(winTargetInput);
  const winTarget = Number.isFinite(rawTarget)
    ? Math.max(MIN_WIN_TARGET, Math.min(MAX_WIN_TARGET, Math.floor(rawTarget)))
    : 3;

  const autoSize = recommendedBoardSize(winTarget);
  const rawSize = boardSizeInput === undefined || boardSizeInput === null || boardSizeInput === 'auto'
    ? autoSize
    : Number(boardSizeInput);

  const requestedSize = Number.isFinite(rawSize) ? Math.floor(rawSize) : autoSize;
  const boardSize = Math.max(winTarget, Math.min(MAX_BOARD_SIZE, Math.max(MIN_BOARD_SIZE, requestedSize)));

  return { winTarget, boardSize };
}

/**
 * Evaluates any NxN Tic-Tac-Toe board for K-in-a-row horizontally,
 * vertically, and across both main diagonals and anti-diagonals.
 */
export function evaluateTttBoard(
  board: TttCell[],
  boardSizeInput = 3,
  winTargetInput = 3
): {
  winner: 'X' | 'O' | 'draw' | null;
  line: number[] | null;
} {
  const boardSize = Math.max(MIN_BOARD_SIZE, Math.round(Math.sqrt(board.length)) || boardSizeInput);
  const winTarget = Math.max(MIN_WIN_TARGET, Math.min(boardSize, winTargetInput));

  const directions: Array<[number, number]> = [
    [0, 1], // horizontal →
    [1, 0], // vertical ↓
    [1, 1], // diagonal ↘
    [1, -1], // anti-diagonal ↙
  ];

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const startIdx = r * boardSize + c;
      const mark = board[startIdx];
      if (!mark) continue;

      for (const [dr, dc] of directions) {
        const endR = r + dr * (winTarget - 1);
        const endC = c + dc * (winTarget - 1);
        if (endR < 0 || endR >= boardSize || endC < 0 || endC >= boardSize) continue;

        const line: number[] = [startIdx];
        let matched = true;
        for (let step = 1; step < winTarget; step++) {
          const idx = (r + dr * step) * boardSize + (c + dc * step);
          if (board[idx] !== mark) {
            matched = false;
            break;
          }
          line.push(idx);
        }
        if (matched) {
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
