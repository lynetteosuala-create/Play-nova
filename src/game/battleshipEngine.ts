import type { DifficultyLevel } from '../types.ts';

export interface ShipSpec {
  id: string;
  name: string;
  size: number;
}

export const BATTLESHIP_FLEET: ShipSpec[] = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 },
];

export type ShotCell = 'unknown' | 'miss' | 'hit' | 'sunk';

export interface PlacedShip {
  id: string;
  name: string;
  size: number;
  cells: number[];
}

export function generateRandomBattleshipBoard(): { grid: number[]; ships: PlacedShip[] } {
  const grid = Array(100).fill(-1);
  const ships: PlacedShip[] = [];

  for (let sIdx = 0; sIdx < BATTLESHIP_FLEET.length; sIdx++) {
    const spec = BATTLESHIP_FLEET[sIdx];
    let placed = false;
    for (let attempt = 0; attempt < 250 && !placed; attempt++) {
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (horiz ? 10 : 10 - spec.size + 1));
      const c = Math.floor(Math.random() * (horiz ? 10 - spec.size + 1 : 10));
      const cells: number[] = [];
      let conflict = false;
      for (let k = 0; k < spec.size; k++) {
        const idx = (r + (horiz ? 0 : k)) * 10 + (c + (horiz ? k : 0));
        if (grid[idx] !== -1) {
          conflict = true;
          break;
        }
        cells.push(idx);
      }
      if (!conflict) {
        for (const cell of cells) grid[cell] = sIdx;
        ships.push({ id: spec.id, name: spec.name, size: spec.size, cells });
        placed = true;
      }
    }
  }
  return { grid, ships };
}

export function validateBattleshipPlacement(grid: number[]): boolean {
  if (!Array.isArray(grid) || grid.length !== 100) return false;
  const counts = new Map<number, number>();
  for (const val of grid) {
    if (val !== -1) {
      counts.set(val, (counts.get(val) || 0) + 1);
    }
  }
  return BATTLESHIP_FLEET.every((spec, idx) => counts.get(idx) === spec.size);
}

export function resolveShotAgainstGrid(
  shipGrid: number[],
  shots: ShotCell[],
  targetIdx: number
): {
  result: 'miss' | 'hit' | 'sunk';
  sunkShipName: string | null;
  allSunk: boolean;
  nextShots: ShotCell[];
} {
  const nextShots = [...shots];
  const shipIdx = shipGrid[targetIdx];
  if (shipIdx === undefined || shipIdx < 0) {
    nextShots[targetIdx] = 'miss';
    return { result: 'miss', sunkShipName: null, allSunk: false, nextShots };
  }

  nextShots[targetIdx] = 'hit';
  const shipCells = shipGrid
    .map((val, idx) => (val === shipIdx ? idx : -1))
    .filter((idx) => idx >= 0);

  const isSunk = shipCells.every((c) => nextShots[c] === 'hit' || nextShots[c] === 'sunk');
  let sunkShipName: string | null = null;
  if (isSunk) {
    for (const c of shipCells) nextShots[c] = 'sunk';
    sunkShipName = BATTLESHIP_FLEET[shipIdx]?.name || 'Ship';
  }

  const allSunk = shipGrid.every((val, idx) => val === -1 || nextShots[idx] === 'sunk');
  return {
    result: isSunk ? 'sunk' : 'hit',
    sunkShipName,
    allSunk,
    nextShots,
  };
}

export function chooseBattleshipAiShot(shots: ShotCell[], difficulty: DifficultyLevel): number {
  const unknown: number[] = [];
  const activeHits: number[] = [];
  for (let i = 0; i < 100; i++) {
    if (shots[i] === 'unknown') unknown.push(i);
    else if (shots[i] === 'hit') activeHits.push(i);
  }
  if (unknown.length === 0) return -1;

  if (difficulty !== 'easy' && activeHits.length > 0) {
    // Check directional alignment if 2+ active hits exist
    const targets = new Set<number>();
    for (const hit of activeHits) {
      const r = Math.floor(hit / 10);
      const c = hit % 10;
      const neighbors = [
        r > 0 ? (r - 1) * 10 + c : -1,
        r < 9 ? (r + 1) * 10 + c : -1,
        c > 0 ? r * 10 + (c - 1) : -1,
        c < 9 ? r * 10 + (c + 1) : -1,
      ].filter((n) => n >= 0 && shots[n] === 'unknown');

      if (difficulty === 'hard' && activeHits.length >= 2) {
        const hasHorizNeighbor = activeHits.some(
          (other) => other !== hit && Math.floor(other / 10) === r && Math.abs((other % 10) - c) === 1
        );
        const hasVertNeighbor = activeHits.some(
          (other) => other !== hit && other % 10 === c && Math.abs(Math.floor(other / 10) - r) === 1
        );
        if (hasHorizNeighbor) {
          for (const n of neighbors) {
            if (Math.floor(n / 10) === r) targets.add(n);
          }
        } else if (hasVertNeighbor) {
          for (const n of neighbors) {
            if (n % 10 === c) targets.add(n);
          }
        }
      }
      if (targets.size === 0) {
        for (const n of neighbors) targets.add(n);
      }
    }
    if (targets.size > 0) {
      const arr = Array.from(targets);
      return arr[Math.floor(Math.random() * arr.length)];
    }
  }

  if (difficulty === 'hard') {
    const parity = unknown.filter((i) => (Math.floor(i / 10) + (i % 10)) % 2 === 0);
    if (parity.length > 0) return parity[Math.floor(Math.random() * parity.length)];
  }
  return unknown[Math.floor(Math.random() * unknown.length)];
}
