import type { DifficultyLevel } from '../types.ts';

// Ludo track model:
// -1: in home yard
// 0..51: shared 52-cell outer loop
// 52..57: player-specific home stretch (57 = Goal / Finished = 58)
// Wait: we represent token progress relative to that player's start!
// progress: -1 (yard), 0..50 (outer loop steps from start), 51..55 (home column), 56 (crown finished)
export const LUDO_START_OFFSETS = [0, 26, 13, 39] as const; // for 2P uses [0, 26] (opposite corners); for 4P uses [0, 13, 26, 39]
export const LUDO_SAFE_GLOBAL = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export interface LudoGameState {
  playersCount: number;
  tokens: number[][]; // progress per player (4 tokens each), -1=yard, 0..50=outer, 51..55=home stretch, 56=finished
  turnSeatIndex: number;
  diceValue: number | null;
  phase: 'roll' | 'move' | 'finished';
  winnerSeatIndex: number | null;
  statusText: string;
}

export function getLudoStartOffsets(playersCount: number): number[] {
  return playersCount === 2 ? [0, 26] : [0, 13, 26, 39];
}

export function ludoProgressToGlobalOuter(
  seatIndex: number,
  progress: number,
  playersCount: number
): number | null {
  if (progress < 0 || progress > 50) return null;
  const offsets = getLudoStartOffsets(playersCount);
  const start = offsets[seatIndex % offsets.length] || 0;
  return (start + progress) % 52;
}

export function createInitialLudoState(playersCount = 2): LudoGameState {
  const count = playersCount === 4 ? 4 : 2;
  return {
    playersCount: count,
    tokens: Array.from({ length: count }, () => [-1, -1, -1, -1]),
    turnSeatIndex: 0,
    diceValue: null,
    phase: 'roll',
    winnerSeatIndex: null,
    statusText: 'Player 1 starts! Roll the dice to launch your Ludo tokens.',
  };
}

export function getMovableLudoTokenIndexes(
  state: LudoGameState,
  seatIndex: number,
  dice: number
): number[] {
  const list = state.tokens[seatIndex] || [];
  const movable: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const pos = list[i];
    if (pos === 56) continue;
    if (pos === -1) {
      if (dice === 6) movable.push(i);
    } else if (pos + dice <= 56) {
      movable.push(i);
    }
  }
  return movable;
}

export function rollLudoDice(
  state: LudoGameState,
  explicitRoll?: number
): { nextState: LudoGameState; roll: number; autoPassed: boolean } {
  const roll = explicitRoll ?? Math.floor(Math.random() * 6) + 1;
  const movable = getMovableLudoTokenIndexes(state, state.turnSeatIndex, roll);
  if (movable.length === 0) {
    const nextSeat = (state.turnSeatIndex + 1) % state.playersCount;
    return {
      roll,
      autoPassed: true,
      nextState: {
        ...state,
        diceValue: roll,
        turnSeatIndex: nextSeat,
        phase: 'roll',
        statusText: `Player ${state.turnSeatIndex + 1} rolled ${roll} with no legal moves — turn passes to Player ${nextSeat + 1}.`,
      },
    };
  }
  return {
    roll,
    autoPassed: false,
    nextState: {
      ...state,
      diceValue: roll,
      phase: 'move',
      statusText: `Player ${state.turnSeatIndex + 1} rolled ${roll}! Choose a highlighted token to move.`,
    },
  };
}

export function applyLudoTokenMove(state: LudoGameState, tokenIdx: number): LudoGameState | null {
  if (state.phase !== 'move' || state.diceValue === null) return null;
  const seat = state.turnSeatIndex;
  const dice = state.diceValue;
  const movable = getMovableLudoTokenIndexes(state, seat, dice);
  if (!movable.includes(tokenIdx)) return null;

  const tokens = state.tokens.map((arr) => [...arr]);
  const currentPos = tokens[seat][tokenIdx];
  const nextPos = currentPos === -1 ? 0 : currentPos + dice;
  tokens[seat][tokenIdx] = nextPos;

  let captured = false;
  const landedGlobal = ludoProgressToGlobalOuter(seat, nextPos, state.playersCount);
  if (landedGlobal !== null && !LUDO_SAFE_GLOBAL.has(landedGlobal)) {
    for (let opp = 0; opp < state.playersCount; opp++) {
      if (opp === seat) continue;
      for (let ti = 0; ti < 4; ti++) {
        const oppGlobal = ludoProgressToGlobalOuter(opp, tokens[opp][ti], state.playersCount);
        if (oppGlobal === landedGlobal) {
          tokens[opp][ti] = -1;
          captured = true;
        }
      }
    }
  }

  const finishedAll = tokens[seat].every((p) => p === 56);
  if (finishedAll) {
    return {
      ...state,
      tokens,
      phase: 'finished',
      winnerSeatIndex: seat,
      statusText: `Player ${seat + 1} crowned all 4 tokens and wins Ludo!`,
    };
  }

  const reachedGoal = nextPos === 56;
  const bonusTurn = dice === 6 || captured || reachedGoal;
  const nextSeat = bonusTurn ? seat : (seat + 1) % state.playersCount;

  return {
    ...state,
    tokens,
    turnSeatIndex: nextSeat,
    diceValue: null,
    phase: 'roll',
    statusText: captured
      ? `Player ${seat + 1} captured a rival token and earned a bonus roll!`
      : reachedGoal
      ? `Player ${seat + 1} crowned a token home and earned a bonus roll!`
      : dice === 6
      ? `Rolled 6! Player ${seat + 1} rolls again.`
      : `Player ${nextSeat + 1}'s turn to roll.`,
  };
}

export function chooseLudoAiToken(state: LudoGameState, difficulty: DifficultyLevel): number {
  const dice = state.diceValue;
  if (dice === null) return -1;
  const seat = state.turnSeatIndex;
  const movable = getMovableLudoTokenIndexes(state, seat, dice);
  if (movable.length === 0) return -1;
  if (movable.length === 1 || difficulty === 'easy') {
    return movable[Math.floor(Math.random() * movable.length)];
  }

  let bestToken = movable[0];
  let bestScore = -Infinity;

  for (const ti of movable) {
    const pos = state.tokens[seat][ti];
    const nextPos = pos === -1 ? 0 : pos + dice;
    let score = nextPos;

    if (nextPos === 56) score += 200; // Finish a token!
    if (pos === -1) score += 80; // Deploy onto board
    if (nextPos >= 51 && pos < 51) score += 95; // Enter safe home stretch

    const globalSq = ludoProgressToGlobalOuter(seat, nextPos, state.playersCount);
    if (globalSq !== null) {
      if (LUDO_SAFE_GLOBAL.has(globalSq)) score += 45;
      else {
        for (let opp = 0; opp < state.playersCount; opp++) {
          if (opp === seat) continue;
          for (let oti = 0; oti < 4; oti++) {
            const og = ludoProgressToGlobalOuter(opp, state.tokens[opp][oti], state.playersCount);
            if (og === globalSq) score += difficulty === 'hard' ? 160 : 120;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestToken = ti;
    }
  }
  return bestToken;
}
