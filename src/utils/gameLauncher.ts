import { ALL_GAME_IDS, GAME_CATALOG, MULTIPLAYER_GAME_IDS, type GameCatalogEntry } from '../game/catalog.ts';
import type { AppView, GameId, MultiplayerGameId, PlayerProfile } from '../types.ts';
import { apiFetch, getStoredPlayerToken, setStoredPlayerToken, setStoredRecoveryKey } from './api.ts';

export interface ParsedRouteResult {
  view: AppView;
  matched: boolean;
  gameId: GameId | null;
  invalidPath: string | null;
  multiplayerGame: MultiplayerGameId | null;
}

const GAME_SLUG_ALIASES: Record<string, GameId> = {
  tictactoe: 'tictactoe',
  'tic-tac-toe': 'tictactoe',
  rps: 'rps',
  'rock-paper-scissors': 'rps',
  guess: 'guess_number',
  guess_number: 'guess_number',
  'guess-number': 'guess_number',
  'guess-the-number': 'guess_number',
  connect_four: 'connect_four',
  'connect-four': 'connect_four',
  connect4: 'connect_four',
  connect_five: 'connect_five',
  'connect-five': 'connect_five',
  connect5: 'connect_five',
  'four-in-a-row': 'connect_five',
  chess: 'chess',
  checkers: 'checkers',
  draughts: 'checkers',
  ludo: 'ludo',
  memory: 'memory_match',
  memory_match: 'memory_match',
  'memory-match': 'memory_match',
  word: 'word_battle',
  word_battle: 'word_battle',
  'word-battle': 'word_battle',
  word_scramble: 'word_scramble',
  'word-scramble': 'word_scramble',
  scramble: 'word_scramble',
  hangman: 'hangman',
  trivia: 'trivia_challenge',
  trivia_challenge: 'trivia_challenge',
  'trivia-challenge': 'trivia_challenge',
  sudoku: 'sudoku',
  quick_math: 'quick_math',
  'quick-math': 'quick_math',
  math: 'quick_math',
  'math-challenge': 'quick_math',
  reaction: 'reaction_test',
  reaction_test: 'reaction_test',
  'reaction-test': 'reaction_test',
  'reaction-speed': 'reaction_test',
  pattern: 'pattern_recognition',
  pattern_recognition: 'pattern_recognition',
  'pattern-recognition': 'pattern_recognition',
  snake: 'snake',
  minesweeper: 'minesweeper',
  mines: 'minesweeper',
  battleship: 'battleship',
  dots_and_boxes: 'dots_and_boxes',
  'dots-and-boxes': 'dots_and_boxes',
  dots: 'dots_and_boxes',
  reversi: 'reversi',
  othello: 'reversi',
};

export function resolveGameIdFromSlug(rawSlug: string): GameId | null {
  const clean = rawSlug.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  if (GAME_SLUG_ALIASES[clean]) return GAME_SLUG_ALIASES[clean];
  const normalized = clean.replace(/-/g, '_');
  if (ALL_GAME_IDS.includes(normalized as GameId)) {
    return normalized as GameId;
  }
  return null;
}

export function getGameCatalogEntry(gameId: GameId): GameCatalogEntry | undefined {
  return GAME_CATALOG.find((g) => g.id === gameId);
}

export function parseLocationToRoute(
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
  search = typeof window !== 'undefined' ? window.location.search : ''
): ParsedRouteResult {
  const cleanPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const rawMpGame = params.get('game');
  const parsedMpGame = rawMpGame ? resolveGameIdFromSlug(rawMpGame) : null;
  const multiplayerGame =
    parsedMpGame && MULTIPLAYER_GAME_IDS.includes(parsedMpGame as MultiplayerGameId)
      ? (parsedMpGame as MultiplayerGameId)
      : null;

  if (cleanPath === '/' || cleanPath === '') {
    return { view: 'home', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/lobby') {
    return { view: 'lobby', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/multiplayer') {
    return { view: 'multiplayer', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/tournaments') {
    return { view: 'tournaments', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/games') {
    return { view: 'games', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/leaderboard') {
    return { view: 'leaderboard', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/link-preview') {
    return { view: 'link_preview', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/profile') {
    return { view: 'profile', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }
  if (cleanPath === '/admin') {
    return { view: 'admin', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }

  if (cleanPath.startsWith('/games/')) {
    const slug = cleanPath.slice('/games/'.length).split('/')[0] || '';
    const resolvedGame = resolveGameIdFromSlug(slug);
    if (resolvedGame) {
      return {
        view: resolvedGame,
        matched: true,
        gameId: resolvedGame,
        invalidPath: null,
        multiplayerGame,
      };
    }
    return {
      view: 'home',
      matched: false,
      gameId: null,
      invalidPath: pathname,
      multiplayerGame,
    };
  }

  if (cleanPath.startsWith('/share/')) {
    return { view: 'link_preview', matched: true, gameId: null, invalidPath: null, multiplayerGame };
  }

  return {
    view: 'home',
    matched: false,
    gameId: null,
    invalidPath: pathname,
    multiplayerGame,
  };
}

export function viewToPath(view: AppView, multiplayerGame?: MultiplayerGameId): string {
  switch (view) {
    case 'lobby':
      return '/lobby';
    case 'multiplayer':
      return multiplayerGame ? `/multiplayer?game=${encodeURIComponent(multiplayerGame)}` : '/multiplayer';
    case 'tournaments':
      return '/tournaments';
    case 'games':
      return '/games';
    case 'leaderboard':
      return '/leaderboard';
    case 'link_preview':
      return '/link-preview';
    case 'profile':
      return '/profile';
    case 'admin':
      return '/admin';
    case 'home':
      return '/';
    default:
      return `/games/${view}`;
  }
}

export interface GuestBootstrapResult {
  player: PlayerProfile;
  token: string;
}

let inFlightGuestPromise: Promise<GuestBootstrapResult> | null = null;

async function requestAnonymousGuest(): Promise<GuestBootstrapResult> {
  const endpoints = ['/api/players/guest', '/api/players/enter'] as const;
  let lastError: (Error & { status?: number }) | null = null;

  for (const endpoint of endpoints) {
    try {
      const res = await apiFetch<{
        ok: boolean;
        token: string;
        recoveryKey?: string;
        player: PlayerProfile;
      }>(endpoint, { method: 'POST' }, { suppressSessionEvent: true });

      if (!res?.player) {
        throw new Error(`Invalid guest session response from ${endpoint}.`);
      }

      const activeToken = res.token || getStoredPlayerToken() || '';
      if (activeToken) {
        setStoredPlayerToken(activeToken);
      }
      if (res.recoveryKey) {
        setStoredRecoveryKey(res.recoveryKey);
      }
      return { player: res.player, token: activeToken };
    } catch (err) {
      const e = err as Error & { status?: number };
      lastError = e;
      if (e.status !== 404) {
        throw e;
      }
    }
  }

  // Verify backend health to produce an informative diagnostic message when 404 occurs
  try {
    const healthRes = await fetch('/api/health', { credentials: 'include' });
    if (healthRes.status === 404) {
      throw new Error(
        'Game backend service is not mounted at /api (HTTP 404). Make sure PLAYNOVA is running via the Node server (npm start) rather than static-only hosting.'
      );
    }
  } catch (healthErr) {
    if (healthErr instanceof Error && healthErr.message.includes('HTTP 404')) {
      throw healthErr;
    }
  }

  throw lastError || new Error('Could not reach the PLAYNOVA guest session service (HTTP 404).');
}

export function ensureAnonymousGuestSession(): Promise<GuestBootstrapResult> {
  if (!inFlightGuestPromise) {
    inFlightGuestPromise = requestAnonymousGuest().finally(() => {
      inFlightGuestPromise = null;
    });
  }
  return inFlightGuestPromise;
}
