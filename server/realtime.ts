import crypto from 'node:crypto';
import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  generateRandomBattleshipBoard,
  resolveShotAgainstGrid,
  validateBattleshipPlacement,
  type ShotCell,
} from '../src/game/battleshipEngine.ts';
import {
  ALL_GAME_IDS,
  GAME_CATALOG,
  GUESS_PRESETS,
} from '../src/game/catalog.ts';
import {
  applyCheckersMove,
  createInitialCheckersState,
  getLegalCheckersMoves,
} from '../src/game/checkersEngine.ts';
import {
  applyChessMove,
  createInitialChessState,
  getLegalChessMoves,
  type PromoKind,
} from '../src/game/chessEngine.ts';
import {
  applyPopOutCol,
  canPopOutCol,
  evaluateGravityBoard,
  getGravityDropRow,
  type GravityCell,
} from '../src/game/connectFiveEngine.ts';
import {
  C4_COLS,
  createC4Board,
  evaluateC4Board,
  getC4DropRow,
  type C4Cell,
} from '../src/game/connectFour.ts';
import {
  applyDotsMove,
  createInitialDotsState,
} from '../src/game/dotsAndBoxesEngine.ts';
import {
  applyLudoTokenMove,
  createInitialLudoState,
  rollLudoDice,
} from '../src/game/ludoEngine.ts';
import {
  applyReversiMove,
  createInitialReversiState,
} from '../src/game/reversiEngine.ts';
import { normalizeTttConfig } from '../src/game/tttRules.ts';
import type {
  DifficultyLevel,
  GameId,
  MultiplayerGameId,
  OnlinePlayerSummary,
  PublicRoomSummary,
  RoomChatMessage,
  RoomSeat,
  RoomState,
} from '../src/types.ts';
import { db, type DbPlayer, recordMatchAndProgress, sha256 } from './db.ts';
import {
  evaluateTttBoard,
  resolveRpsOutcome,
  type RpsMove,
  type TttCell,
} from './gameEngine.ts';

interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  username: string;
  profilePictureUrl: string | null;
  activeFrame: string;
  level: number;
  matchId: string | null;
  queuedFor: {
    gameId: MultiplayerGameId;
    tttWinTarget?: number;
    tttBoardSize?: number;
    rpsTargetWins?: number;
  } | null;
}

interface InternalSeat extends RoomSeat {
  secretPick: RpsMove | null;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

interface InternalMatch {
  id: string;
  gameId: MultiplayerGameId;
  title: string;
  mode: 'vs_human';
  hostPlayerId: string;
  status: 'active' | 'finished';
  maxSeats: number;
  roundNumber: number;
  seats: InternalSeat[];
  chatMessages: RoomChatMessage[];
  startedAt: number;
  tttBoardSize: number;
  tttWinTarget: number;
  rpsTargetWins: number;
  tttState?: RoomState['tttState'];
  rpsState?: RoomState['rpsState'];
  guessState?: {
    difficulty: DifficultyLevel;
    min: number;
    max: number;
    maxAttempts: number;
    secretNumber: number;
    deadlineAt: number | null;
    winnerSeatIndex: number | null;
    revealedSecret: number | null;
    feed: NonNullable<RoomState['guessState']>['feed'];
  };
  connectFourState?: RoomState['connectFourState'];
  connectFiveState?: RoomState['connectFiveState'];
  chessState?: RoomState['chessState'];
  checkersState?: RoomState['checkersState'];
  reversiState?: RoomState['reversiState'];
  dotsState?: RoomState['dotsState'];
  battleshipInternal?: {
    turnSeatIndex: number;
    phase: 'placing' | 'battle' | 'finished';
    winnerSeatIndex: number | null;
    readyBySeat: Record<number, boolean>;
    shipsBySeat: Record<number, number[]>;
    shotsOnSeat: Record<number, ShotCell[]>;
    sunkShipsBySeat: Record<number, string[]>;
    statusText: string;
  };
  ludoState?: RoomState['ludoState'];
  duelState?: RoomState['duelState'];
  winnerSummary: string | null;
  timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>;
}

function parseCookieToken(cookieHeader: string, cookieName: string): string | null {
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function authenticateWsRequest(req: http.IncomingMessage): DbPlayer | null {
  try {
    const reqUrl = new URL(req.url || '/ws', 'http://localhost');
    const token =
      reqUrl.searchParams.get('token')?.trim() ||
      parseCookieToken(req.headers.cookie || '', 'gv_session');
    if (!token) return null;

    const sess = db
      .prepare('SELECT player_id, expires_at FROM player_sessions WHERE token_hash = ?')
      .get(sha256(token)) as { player_id: string; expires_at: number } | undefined;
    if (!sess || sess.expires_at <= Date.now()) return null;

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(sess.player_id) as DbPlayer | undefined;
    if (!player || player.banned) return null;
    return player;
  } catch {
    return null;
  }
}

function assignSeatTeam(gameId: MultiplayerGameId, seatIndex: number): RoomSeat['team'] {
  if (gameId === 'tictactoe') return seatIndex % 2 === 0 ? 'X' : 'O';
  if (gameId === 'connect_four' || gameId === 'connect_five') return seatIndex % 2 === 0 ? 'R' : 'Y';
  if (gameId === 'chess' || gameId === 'reversi') return seatIndex % 2 === 0 ? 'W' : 'B';
  if (gameId === 'checkers') return seatIndex % 2 === 0 ? 'R' : 'B';
  if (gameId === 'dots_and_boxes') return seatIndex % 2 === 0 ? 'A' : 'B';
  return undefined;
}

function gameDisplayName(gameId: MultiplayerGameId): string {
  return GAME_CATALOG.find((g) => g.id === gameId)?.name || gameId;
}

function isTurnBasedBoardGame(gameId: GameId): boolean {
  return (
    gameId === 'tictactoe' ||
    gameId === 'rps' ||
    gameId === 'guess_number' ||
    gameId === 'connect_four' ||
    gameId === 'connect_five' ||
    gameId === 'chess' ||
    gameId === 'checkers' ||
    gameId === 'reversi' ||
    gameId === 'dots_and_boxes' ||
    gameId === 'battleship' ||
    gameId === 'ludo'
  );
}

function getDuelDurationSec(gameId: GameId): number {
  switch (gameId) {
    case 'reaction_test':
      return 45;
    case 'quick_math':
      return 65;
    case 'word_scramble':
    case 'hangman':
      return 120;
    case 'sudoku':
      return 300;
    case 'minesweeper':
    case 'snake':
      return 150;
    default:
      return 120;
  }
}

export class RealtimeHub {
  private wss: WebSocketServer;
  private clients = new Map<string, ConnectedClient>();
  private matches = new Map<string, InternalMatch>();
  private queues = new Map<string, string[]>();

  constructor(httpServer: http.Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  public getTelemetry() {
    let queuedPlayers = 0;
    for (const q of this.queues.values()) queuedPlayers += q.length;
    return {
      onlineConnections: this.clients.size,
      activeRooms: this.matches.size,
      queuedPlayers,
      liveRooms: this.getActiveMatchSummaries(),
    };
  }

  private send(ws: WebSocket, event: string, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, payload }));
    }
  }

  private sendToPlayer(playerId: string, event: string, payload: unknown) {
    const client = this.clients.get(playerId);
    if (client) this.send(client.ws, event, payload);
  }

  private broadcastAll(event: string, payload: unknown) {
    for (const client of this.clients.values()) {
      this.send(client.ws, event, payload);
    }
  }

  private getOnlineSummaries(): OnlinePlayerSummary[] {
    return Array.from(this.clients.values()).map((c) => ({
      playerId: c.playerId,
      username: c.username,
      profilePictureUrl: c.profilePictureUrl,
      activeFrame: c.activeFrame,
      level: c.level,
      status: c.matchId ? 'in_match' : c.queuedFor ? 'queued' : 'lobby',
      matchId: c.matchId,
    }));
  }

  private getActiveMatchSummaries(): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    for (const m of this.matches.values()) {
      list.push({
        id: m.id,
        gameId: m.gameId,
        title: m.title,
        mode: m.mode,
        status: m.status,
        maxSeats: m.maxSeats,
        humanCount: m.seats.filter((s) => s.kind === 'human').length,
      });
    }
    return list;
  }

  private broadcastPresence() {
    this.broadcastAll('presence:list', { players: this.getOnlineSummaries() });
  }

  private pushSystemChat(match: InternalMatch, text: string) {
    match.chatMessages.push({
      id: crypto.randomUUID(),
      senderId: 'system',
      username: 'PLAYNOVA Matchmaker',
      kind: 'system',
      text,
      ts: Date.now(),
    });
    if (match.chatMessages.length > 60) {
      match.chatMessages = match.chatMessages.slice(-60);
    }
  }

  private serializeMatchForPlayer(match: InternalMatch, recipientPlayerId: string | null): RoomState {
    const mySeatIdx = match.seats.findIndex((s) => s.playerId === recipientPlayerId);
    let battleshipState: RoomState['battleshipState'] | undefined;
    if (match.battleshipInternal) {
      const bs = match.battleshipInternal;
      const ownShipBoards: Record<number, number[]> = {};
      if (mySeatIdx >= 0 && bs.shipsBySeat[mySeatIdx]) {
        ownShipBoards[mySeatIdx] = bs.shipsBySeat[mySeatIdx];
      }
      battleshipState = {
        turnSeatIndex: bs.turnSeatIndex,
        phase: bs.phase,
        winnerSeatIndex: bs.winnerSeatIndex,
        readyBySeat: bs.readyBySeat,
        shotsOnSeat: bs.shotsOnSeat,
        ownShipBoards,
        sunkShipsBySeat: bs.sunkShipsBySeat,
        statusText: bs.statusText,
      };
    }

    return {
      id: match.id,
      gameId: match.gameId,
      title: match.title,
      mode: match.mode,
      hostPlayerId: match.hostPlayerId,
      status: match.status,
      maxSeats: match.maxSeats,
      roundNumber: match.roundNumber,
      tttBoardSize: match.gameId === 'tictactoe' ? match.tttBoardSize : undefined,
      tttWinTarget: match.gameId === 'tictactoe' ? match.tttWinTarget : undefined,
      rpsTargetWins: match.gameId === 'rps' ? match.rpsTargetWins : undefined,
      seats: match.seats.map((s) => ({
        seatIndex: s.seatIndex,
        kind: s.kind,
        playerId: s.playerId,
        username: s.username,
        profilePictureUrl: s.profilePictureUrl,
        activeFrame: s.activeFrame,
        team: s.team,
        connectionStatus: s.connectionStatus,
        score: s.score,
        hasPicked: s.hasPicked,
        revealedPick: s.revealedPick,
        guessCount: s.guessCount,
        lastGuess: s.lastGuess,
        lastClue: s.lastClue,
        lastProximity: s.lastProximity,
        crackedAtMs: s.crackedAtMs,
        duelProgress: s.duelProgress,
        duelMaxProgress: s.duelMaxProgress,
        duelFinished: s.duelFinished,
        duelSummary: s.duelSummary,
      })),
      chatMessages: match.chatMessages,
      tttState: match.tttState,
      rpsState: match.rpsState,
      guessState: match.guessState
        ? {
            difficulty: match.guessState.difficulty,
            min: match.guessState.min,
            max: match.guessState.max,
            maxAttempts: match.guessState.maxAttempts,
            deadlineAt: match.guessState.deadlineAt,
            winnerSeatIndex: match.guessState.winnerSeatIndex,
            revealedSecret: match.guessState.revealedSecret,
            feed: match.guessState.feed,
          }
        : undefined,
      connectFourState: match.connectFourState,
      connectFiveState: match.connectFiveState,
      chessState: match.chessState,
      checkersState: match.checkersState,
      reversiState: match.reversiState,
      dotsState: match.dotsState,
      battleshipState,
      ludoState: match.ludoState,
      duelState: match.duelState,
      winnerSummary: match.winnerSummary,
    };
  }

  private broadcastMatch(match: InternalMatch, extraEvent?: { event: string; payload: unknown }) {
    for (const seat of match.seats) {
      if (seat.kind === 'human' && seat.playerId) {
        this.sendToPlayer(seat.playerId, 'room:state', {
          room: this.serializeMatchForPlayer(match, seat.playerId),
        });
        if (extraEvent) {
          this.sendToPlayer(seat.playerId, extraEvent.event, extraEvent.payload);
        }
      }
    }
  }

  private clearMatchTimers(match: InternalMatch) {
    for (const t of match.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    match.timers = [];
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    const player = authenticateWsRequest(req);
    if (!player) {
      ws.close(4001, 'Guest session required');
      return;
    }

    const existing = this.clients.get(player.id);
    if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
      existing.ws.close(4000, 'Replaced by newer connection');
    }

    let rejoinedMatch: InternalMatch | null = null;
    for (const match of this.matches.values()) {
      const seat = match.seats.find((s) => s.kind === 'human' && s.playerId === player.id);
      if (seat) {
        if (seat.disconnectTimer) {
          clearTimeout(seat.disconnectTimer);
          seat.disconnectTimer = undefined;
        }
        seat.connectionStatus = 'online';
        seat.username = player.username;
        seat.profilePictureUrl = player.profile_picture_file
          ? `/api/uploads/avatars/${player.profile_picture_file}`
          : null;
        seat.activeFrame = player.active_frame || 'frame_slate';
        rejoinedMatch = match;
        break;
      }
    }

    const client: ConnectedClient = {
      ws,
      playerId: player.id,
      username: player.username,
      profilePictureUrl: player.profile_picture_file
        ? `/api/uploads/avatars/${player.profile_picture_file}`
        : null,
      activeFrame: player.active_frame || 'frame_slate',
      level: player.level,
      matchId: rejoinedMatch?.id || null,
      queuedFor: null,
    };
    this.clients.set(player.id, client);

    this.send(ws, 'ws:ready', {
      playerId: player.id,
      username: player.username,
      rejoinedRoom: rejoinedMatch ? this.serializeMatchForPlayer(rejoinedMatch, player.id) : null,
    });
    if (rejoinedMatch) {
      this.broadcastMatch(rejoinedMatch);
    }
    this.broadcastPresence();

    ws.on('message', (raw) => {
      let parsed: { event?: string; payload?: Record<string, unknown> } = {};
      try {
        parsed = JSON.parse(raw.toString()) as { event?: string; payload?: Record<string, unknown> };
      } catch {
        return;
      }
      if (!parsed.event) return;
      this.handleEvent(client, parsed.event, parsed.payload || {});
    });

    ws.on('close', () => {
      const current = this.clients.get(player.id);
      if (!current || current.ws !== ws) return;

      this.removeFromQueue(player.id);
      this.clients.delete(player.id);

      if (current.matchId) {
        const match = this.matches.get(current.matchId);
        if (match) {
          const seat = match.seats.find((s) => s.kind === 'human' && s.playerId === player.id);
          if (seat) {
            seat.connectionStatus = 'reconnecting';
            this.broadcastMatch(match);
            seat.disconnectTimer = setTimeout(() => {
              this.removeHumanFromMatch(match.id, player.id);
            }, 30_000);
          }
        }
      }
      this.broadcastPresence();
    });
  }

  private removeFromQueue(playerId: string) {
    for (const [key, list] of this.queues.entries()) {
      const filtered = list.filter((id) => id !== playerId);
      if (filtered.length !== list.length) {
        this.queues.set(key, filtered);
      }
    }
    const client = this.clients.get(playerId);
    if (client) client.queuedFor = null;
  }

  private makeHumanSeat(client: ConnectedClient, seatIndex: number, team?: RoomSeat['team']): InternalSeat {
    return {
      seatIndex,
      kind: 'human',
      playerId: client.playerId,
      username: client.username,
      profilePictureUrl: client.profilePictureUrl,
      activeFrame: client.activeFrame,
      connectionStatus: 'online',
      team,
      score: 0,
      hasPicked: false,
      secretPick: null,
      revealedPick: null,
      guessCount: 0,
      duelProgress: 0,
      duelMaxProgress: 100,
      duelFinished: false,
      duelSummary: null,
    };
  }

  private createMatchedPair(
    playerA: ConnectedClient,
    playerB: ConnectedClient,
    opts: {
      gameId: MultiplayerGameId;
      tttWinTarget?: number;
      tttBoardSize?: number;
      rpsTargetWins?: number;
    }
  ): InternalMatch {
    if (playerA.matchId) this.removeHumanFromMatch(playerA.matchId, playerA.playerId);
    if (playerB.matchId) this.removeHumanFromMatch(playerB.matchId, playerB.playerId);
    this.removeFromQueue(playerA.playerId);
    this.removeFromQueue(playerB.playerId);

    const id = crypto.randomUUID();
    const tttCfg = normalizeTttConfig(opts.tttWinTarget, opts.tttBoardSize);
    const rpsTargetWins = Math.max(1, Math.min(15, Math.floor(Number(opts.rpsTargetWins || 3))));
    const gameLabel = gameDisplayName(opts.gameId);

    const match: InternalMatch = {
      id,
      gameId: opts.gameId,
      title: `${gameLabel} · Live 1v1`,
      mode: 'vs_human',
      hostPlayerId: playerA.playerId,
      status: 'active',
      maxSeats: 2,
      roundNumber: 0,
      seats: [
        this.makeHumanSeat(playerA, 0, assignSeatTeam(opts.gameId, 0)),
        this.makeHumanSeat(playerB, 1, assignSeatTeam(opts.gameId, 1)),
      ],
      chatMessages: [],
      startedAt: Date.now(),
      tttBoardSize: tttCfg.boardSize,
      tttWinTarget: tttCfg.winTarget,
      rpsTargetWins,
      winnerSummary: null,
      timers: [],
    };

    this.matches.set(id, match);
    playerA.matchId = id;
    playerB.matchId = id;
    this.pushSystemChat(match, `Matched ${playerA.username} vs ${playerB.username} for ${gameLabel}!`);
    this.startMatch(match);
    return match;
  }

  private removeHumanFromMatch(matchId: string, playerId: string) {
    const match = this.matches.get(matchId);
    if (!match) return;

    const idx = match.seats.findIndex((s) => s.kind === 'human' && s.playerId === playerId);
    let leftName = 'Player';
    if (idx !== -1) {
      const removed = match.seats[idx];
      leftName = removed.username;
      if (removed.disconnectTimer) clearTimeout(removed.disconnectTimer);
      match.seats.splice(idx, 1);
      match.seats.forEach((s, i) => {
        s.seatIndex = i;
        s.team = assignSeatTeam(match.gameId, i);
      });
    }

    const client = this.clients.get(playerId);
    if (client && client.matchId === matchId) {
      client.matchId = null;
      this.send(client.ws, 'room:left', { matchId });
    }

    const remainingHumans = match.seats.filter((s) => s.kind === 'human');
    if (remainingHumans.length === 0) {
      this.clearMatchTimers(match);
      this.matches.delete(matchId);
    } else {
      this.pushSystemChat(match, `${leftName} left the match.`);
      if (match.hostPlayerId === playerId) {
        match.hostPlayerId = remainingHumans[0].playerId!;
      }
      if (match.status === 'active') {
        this.clearMatchTimers(match);
        match.status = 'finished';
        match.winnerSummary = `${remainingHumans[0].username} won by opponent disconnect.`;
        this.recordSeatOutcome(match, remainingHumans[0], 'win', 100, 50, 25, match.winnerSummary);
      }
      this.broadcastMatch(match);
    }
    this.broadcastPresence();
  }

  private recordSeatOutcome(
    match: InternalMatch,
    seat: InternalSeat,
    outcome: 'win' | 'loss' | 'draw',
    scoreDelta: number,
    xpEarned: number,
    coinsEarned: number,
    summary: string,
    attemptsUsed?: number
  ) {
    if (!seat.playerId) return;
    recordMatchAndProgress({
      playerId: seat.playerId,
      gameId: match.gameId,
      mode: 'vs_human',
      difficulty: 'medium',
      outcome,
      opponentLabel: 'Online Human Rival',
      scoreDelta,
      xpEarned,
      coinsEarned,
      durationSec: Math.max(4, Math.round((Date.now() - match.startedAt) / 1000)),
      summary,
      attemptsUsed,
    });
  }

  private finalizeTwoPlayerBoardMatch(
    match: InternalMatch,
    winnerTeam: string | 'draw',
    summary: string,
    winScore = 135
  ) {
    this.clearMatchTimers(match);
    match.status = 'finished';
    match.winnerSummary = summary;
    for (const s of match.seats) {
      if (s.kind !== 'human' || !s.playerId) continue;
      const outcome: 'win' | 'loss' | 'draw' =
        winnerTeam === 'draw' ? 'draw' : s.team === winnerTeam ? 'win' : 'loss';
      if (outcome === 'win') s.score += 1;
      this.recordSeatOutcome(
        match,
        s,
        outcome,
        outcome === 'win' ? winScore : outcome === 'draw' ? 45 : 15,
        outcome === 'win' ? 80 : outcome === 'draw' ? 35 : 16,
        outcome === 'win' ? 42 : outcome === 'draw' ? 16 : 6,
        summary
      );
    }
    this.pushSystemChat(match, summary);
    this.broadcastMatch(match);
    this.broadcastPresence();
  }

  private handleEvent(client: ConnectedClient, event: string, payload: Record<string, unknown>) {
    switch (event) {
      case 'ping': {
        this.send(client.ws, 'pong', { ts: Date.now() });
        break;
      }

      case 'chat:send': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match) return;
        const text = String(payload.text || '').trim().replace(/\s+/g, ' ').slice(0, 220);
        if (!text) return;
        match.chatMessages.push({
          id: crypto.randomUUID(),
          senderId: client.playerId,
          username: client.username,
          kind: 'human',
          text,
          ts: Date.now(),
        });
        if (match.chatMessages.length > 60) {
          match.chatMessages = match.chatMessages.slice(-60);
        }
        this.broadcastMatch(match);
        break;
      }

      case 'matchmaking:find':
      case 'queue:join': {
        const rawGame = String(payload.gameId || 'tictactoe') as GameId;
        const gameId: MultiplayerGameId = ALL_GAME_IDS.includes(rawGame) ? rawGame : 'tictactoe';

        if (client.matchId) {
          this.removeHumanFromMatch(client.matchId, client.playerId);
        }
        this.removeFromQueue(client.playerId);

        const list = this.queues.get(gameId) || [];
        const partnerId = list.find((id) => id !== client.playerId && this.clients.has(id));
        if (partnerId) {
          this.queues.set(
            gameId,
            list.filter((id) => id !== partnerId && id !== client.playerId)
          );
          const partner = this.clients.get(partnerId)!;
          const opts = {
            gameId,
            tttWinTarget: Number(payload.tttWinTarget || partner.queuedFor?.tttWinTarget || 3),
            tttBoardSize: Number(payload.tttBoardSize || partner.queuedFor?.tttBoardSize || 3),
            rpsTargetWins: Number(payload.rpsTargetWins || partner.queuedFor?.rpsTargetWins || 3),
          };
          partner.queuedFor = null;
          client.queuedFor = null;
          this.createMatchedPair(partner, client, opts);
          this.broadcastPresence();
          return;
        }

        list.push(client.playerId);
        this.queues.set(gameId, list);
        client.queuedFor = {
          gameId,
          tttWinTarget: Number(payload.tttWinTarget || 3),
          tttBoardSize: Number(payload.tttBoardSize || 3),
          rpsTargetWins: Number(payload.rpsTargetWins || 3),
        };
        this.send(client.ws, 'queue:status', { queued: true, gameId, position: list.length });
        this.broadcastPresence();
        break;
      }

      case 'matchmaking:cancel':
      case 'queue:leave': {
        this.removeFromQueue(client.playerId);
        this.send(client.ws, 'queue:status', { queued: false });
        this.broadcastPresence();
        break;
      }

      case 'match:leave':
      case 'room:leave': {
        if (client.matchId) {
          this.removeHumanFromMatch(client.matchId, client.playerId);
        }
        break;
      }

      case 'match:rematch':
      case 'room:rematch': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.seats.length < 2) return;
        this.pushSystemChat(match, `${client.username} started a rematch!`);
        this.startMatch(match);
        this.broadcastPresence();
        break;
      }

      case 'ttt:move': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'tictactoe' || match.status !== 'active' || !match.tttState) return;
        const activeSeat = match.seats[match.tttState.activeSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId) return;
        this.applyTttMove(match, Number(payload.cellIndex));
        break;
      }

      case 'rps:pick': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'rps' || match.status !== 'active' || !match.rpsState) return;
        const seat = match.seats.find((s) => s.playerId === client.playerId);
        if (!seat || seat.hasPicked) return;
        const move = (payload.move || payload.pick) as RpsMove;
        if (!['rock', 'paper', 'scissors'].includes(move)) return;
        seat.secretPick = move;
        seat.hasPicked = true;
        this.broadcastMatch(match);
        if (match.seats.every((s) => s.hasPicked)) {
          this.resolveRpsRound(match);
        }
        break;
      }

      case 'guess:submit': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'guess_number' || match.status !== 'active' || !match.guessState) return;
        const seat = match.seats.find((s) => s.playerId === client.playerId);
        if (!seat || (seat.guessCount || 0) >= match.guessState.maxAttempts) return;
        const guess = Number(payload.guess);
        if (!Number.isInteger(guess) || guess < match.guessState.min || guess > match.guessState.max) return;
        this.applyGuessAttempt(match, seat, guess);
        break;
      }

      case 'c4:drop': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'connect_four' || match.status !== 'active' || !match.connectFourState) return;
        const activeSeat = match.seats[match.connectFourState.activeSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId) return;
        this.applyC4Move(match, Number(payload.col));
        break;
      }

      case 'c5:drop': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'connect_five' || match.status !== 'active' || !match.connectFiveState) return;
        const activeSeat = match.seats[match.connectFiveState.activeSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId) return;
        this.applyC5Move(match, Number(payload.col), Boolean(payload.popOut));
        break;
      }

      case 'chess:move': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'chess' || match.status !== 'active' || !match.chessState) return;
        const activeSeat = match.seats[match.chessState.activeSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId) return;
        const from = Number(payload.from);
        const to = Number(payload.to);
        const promo = (['Q', 'R', 'B', 'N'].includes(String(payload.promo)) ? payload.promo : undefined) as
          | PromoKind
          | undefined;
        const legal = getLegalChessMoves(match.chessState, from);
        const matched = legal.find((m) => m.to === to && (!m.promo || m.promo === (promo || 'Q')));
        if (!matched) {
          this.send(client.ws, 'room:error', { error: 'Illegal chess move.' });
          return;
        }
        const next = applyChessMove(match.chessState, matched);
        const nextSeatIdx = next.turn === 'w' ? 0 : 1;
        match.chessState = { ...next, activeSeatIndex: nextSeatIdx };
        if (next.winnerTeam) {
          const winCode = next.winnerTeam === 'w' ? 'W' : next.winnerTeam === 'b' ? 'B' : 'draw';
          const summary =
            next.winnerTeam === 'draw'
              ? next.statusText
              : `${match.seats[next.winnerTeam === 'w' ? 0 : 1]?.username || 'Player'} wins Chess by Checkmate!`;
          this.finalizeTwoPlayerBoardMatch(match, winCode, summary, 180);
          return;
        }
        this.broadcastMatch(match);
        break;
      }

      case 'checkers:move': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'checkers' || match.status !== 'active' || !match.checkersState) return;
        const activeSeat = match.seats[match.checkersState.activeSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId) return;
        const from = Number(payload.from);
        const to = Number(payload.to);
        const legal = getLegalCheckersMoves(match.checkersState);
        const matched = legal.find((m) => m.from === from && m.to === to);
        if (!matched) {
          this.send(client.ws, 'room:error', { error: 'Illegal Checkers move (remember jumps are mandatory).' });
          return;
        }
        const next = applyCheckersMove(match.checkersState, matched);
        match.checkersState = {
          ...next,
          activeSeatIndex: next.turn === 'r' ? 0 : 1,
        };
        if (next.winnerTeam) {
          const winCode = next.winnerTeam === 'r' ? 'R' : next.winnerTeam === 'b' ? 'B' : 'draw';
          const winnerName = match.seats[next.winnerTeam === 'r' ? 0 : 1]?.username || 'Player';
          this.finalizeTwoPlayerBoardMatch(match, winCode, `${winnerName} wins Checkers!`, 150);
          return;
        }
        this.broadcastMatch(match);
        break;
      }

      case 'reversi:move': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'reversi' || match.status !== 'active' || !match.reversiState) return;
        const activeSeat = match.seats[match.reversiState.activeSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId) return;
        const idx = Number(payload.index);
        const next = applyReversiMove(match.reversiState, idx);
        if (!next) {
          this.send(client.ws, 'room:error', { error: 'Invalid Reversi move.' });
          return;
        }
        match.reversiState = {
          ...next,
          activeSeatIndex: next.turn === 'B' ? 0 : 1,
        };
        if (next.winnerTeam) {
          const winCode = next.winnerTeam === 'B' ? 'W' : next.winnerTeam === 'W' ? 'B' : 'draw';
          // Wait: seat 0 team is 'W' for reversi? Let's keep Reversi seat 0='B', seat 1='W' cleanly!
          const wTeam = next.winnerTeam;
          const winnerIdx = wTeam === 'B' ? 0 : 1;
          this.clearMatchTimers(match);
          match.status = 'finished';
          match.winnerSummary = next.statusText;
          for (const s of match.seats) {
            if (!s.playerId) continue;
            const outcome: 'win' | 'loss' | 'draw' =
              wTeam === 'draw' ? 'draw' : s.seatIndex === winnerIdx ? 'win' : 'loss';
            if (outcome === 'win') s.score += 1;
            this.recordSeatOutcome(match, s, outcome, outcome === 'win' ? 140 : 30, outcome === 'win' ? 80 : 20, outcome === 'win' ? 40 : 10, next.statusText);
          }
          this.pushSystemChat(match, next.statusText);
          this.broadcastMatch(match);
          this.broadcastPresence();
          return;
        }
        this.broadcastMatch(match);
        break;
      }

      case 'dots:move': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'dots_and_boxes' || match.status !== 'active' || !match.dotsState) return;
        const activeSeat = match.seats[match.dotsState.activeSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId) return;
        const orientation = payload.orientation === 'v' ? 'v' : 'h';
        const index = Number(payload.index);
        const next = applyDotsMove(match.dotsState, { orientation, index });
        if (!next) return;
        match.dotsState = {
          ...next,
          activeSeatIndex: next.turn === 'A' ? 0 : 1,
        };
        if (next.winnerTeam) {
          this.finalizeTwoPlayerBoardMatch(match, next.winnerTeam, next.statusText, 130);
          return;
        }
        this.broadcastMatch(match);
        break;
      }

      case 'battleship:place': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'battleship' || match.status !== 'active' || !match.battleshipInternal) return;
        const seatIdx = match.seats.findIndex((s) => s.playerId === client.playerId);
        if (seatIdx < 0 || match.battleshipInternal.phase !== 'placing') return;
        const grid = Array.isArray(payload.grid) ? payload.grid.map(Number) : [];
        if (!validateBattleshipPlacement(grid)) {
          this.send(client.ws, 'room:error', { error: 'Invalid Battleship fleet placement.' });
          return;
        }
        const bs = match.battleshipInternal;
        bs.shipsBySeat[seatIdx] = grid;
        bs.readyBySeat[seatIdx] = true;
        if (bs.readyBySeat[0] && bs.readyBySeat[1]) {
          bs.phase = 'battle';
          bs.turnSeatIndex = 0;
          bs.statusText = `Both fleets locked! ${match.seats[0].username} fires first.`;
        } else {
          bs.statusText = `${match.seats[seatIdx].username} deployed their fleet. Waiting for opponent deployment...`;
        }
        this.broadcastMatch(match);
        break;
      }

      case 'battleship:fire': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'battleship' || match.status !== 'active' || !match.battleshipInternal) return;
        const bs = match.battleshipInternal;
        if (bs.phase !== 'battle') return;
        const shooterIdx = bs.turnSeatIndex;
        const shooterSeat = match.seats[shooterIdx];
        if (!shooterSeat || shooterSeat.playerId !== client.playerId) return;

        const targetIdx = Number(payload.targetIndex);
        const oppIdx = shooterIdx === 0 ? 1 : 0;
        const oppShots = bs.shotsOnSeat[oppIdx];
        if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= 100 || oppShots[targetIdx] !== 'unknown') {
          return;
        }

        const res = resolveShotAgainstGrid(bs.shipsBySeat[oppIdx], oppShots, targetIdx);
        bs.shotsOnSeat[oppIdx] = res.nextShots;
        if (res.sunkShipName) {
          bs.sunkShipsBySeat[oppIdx].push(res.sunkShipName);
        }

        if (res.allSunk) {
          bs.phase = 'finished';
          bs.winnerSeatIndex = shooterIdx;
          bs.statusText = `${shooterSeat.username} sank the entire enemy fleet and wins Battleship!`;
          this.clearMatchTimers(match);
          match.status = 'finished';
          match.winnerSummary = bs.statusText;
          for (const s of match.seats) {
            if (!s.playerId) continue;
            const outcome = s.seatIndex === shooterIdx ? 'win' : 'loss';
            if (outcome === 'win') s.score += 1;
            this.recordSeatOutcome(match, s, outcome, outcome === 'win' ? 165 : 20, outcome === 'win' ? 95 : 20, outcome === 'win' ? 48 : 8, bs.statusText);
          }
          this.pushSystemChat(match, bs.statusText);
          this.broadcastMatch(match);
          this.broadcastPresence();
          return;
        }

        bs.turnSeatIndex = oppIdx;
        bs.statusText =
          res.result === 'sunk'
            ? `Direct hit! ${shooterSeat.username} sank opponent's ${res.sunkShipName}! ${match.seats[oppIdx].username}'s turn.`
            : res.result === 'hit'
            ? `Hit at target grid! ${match.seats[oppIdx].username}'s turn.`
            : `Splash miss! ${match.seats[oppIdx].username}'s turn.`;
        this.broadcastMatch(match);
        break;
      }

      case 'ludo:roll': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'ludo' || match.status !== 'active' || !match.ludoState) return;
        const activeSeat = match.seats[match.ludoState.turnSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId || match.ludoState.phase !== 'roll') return;
        const { nextState } = rollLudoDice(match.ludoState);
        match.ludoState = nextState;
        this.broadcastMatch(match);
        break;
      }

      case 'ludo:move': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.gameId !== 'ludo' || match.status !== 'active' || !match.ludoState) return;
        const activeSeat = match.seats[match.ludoState.turnSeatIndex];
        if (!activeSeat || activeSeat.playerId !== client.playerId || match.ludoState.phase !== 'move') return;
        const tokenIdx = Number(payload.tokenIndex);
        const next = applyLudoTokenMove(match.ludoState, tokenIdx);
        if (!next) return;
        match.ludoState = next;
        if (next.phase === 'finished' && next.winnerSeatIndex !== null) {
          const winnerName = match.seats[next.winnerSeatIndex]?.username || 'Player';
          const summary = `${winnerName} crowned all 4 tokens and won Ludo!`;
          this.clearMatchTimers(match);
          match.status = 'finished';
          match.winnerSummary = summary;
          for (const s of match.seats) {
            if (!s.playerId) continue;
            const outcome = s.seatIndex === next.winnerSeatIndex ? 'win' : 'loss';
            if (outcome === 'win') s.score += 1;
            this.recordSeatOutcome(match, s, outcome, outcome === 'win' ? 155 : 20, outcome === 'win' ? 90 : 20, outcome === 'win' ? 45 : 8, summary);
          }
          this.pushSystemChat(match, summary);
          this.broadcastMatch(match);
          this.broadcastPresence();
          return;
        }
        this.broadcastMatch(match);
        break;
      }

      case 'duel:progress': {
        const match = client.matchId ? this.matches.get(client.matchId) : undefined;
        if (!match || match.status !== 'active' || !match.duelState) return;
        const seat = match.seats.find((s) => s.playerId === client.playerId);
        if (!seat) return;
        seat.score = Math.max(0, Math.round(Number(payload.score || 0)));
        seat.duelProgress = Math.max(0, Number(payload.progress || 0));
        seat.duelMaxProgress = Math.max(1, Number(payload.maxProgress || 100));
        if (Boolean(payload.finished)) {
          seat.duelFinished = true;
        }
        if (typeof payload.summary === 'string') {
          seat.duelSummary = payload.summary.slice(0, 120);
        }

        if (match.seats.every((s) => s.duelFinished)) {
          this.finishDuelMatch(match);
        } else {
          this.broadcastMatch(match);
        }
        break;
      }
    }
  }

  private finishDuelMatch(match: InternalMatch) {
    if (!match.duelState || match.status === 'finished') return;
    this.clearMatchTimers(match);
    match.status = 'finished';

    const s0 = match.seats[0];
    const s1 = match.seats[1];
    let winnerSeatIdx: number | null = null;
    if (s0 && s1) {
      if (s0.score > s1.score) winnerSeatIdx = 0;
      else if (s1.score > s0.score) winnerSeatIdx = 1;
    }
    match.duelState.winnerSeatIndex = winnerSeatIdx;
    const summary =
      winnerSeatIdx === null
        ? `Draw in ${gameDisplayName(match.gameId)}! Both players scored ${s0?.score || 0} pts.`
        : `${match.seats[winnerSeatIdx].username} wins ${gameDisplayName(match.gameId)} (${match.seats[winnerSeatIdx].score} vs ${match.seats[winnerSeatIdx === 0 ? 1 : 0]?.score || 0})!`;
    match.duelState.statusText = summary;
    match.winnerSummary = summary;

    for (const s of match.seats) {
      if (!s.playerId) continue;
      const outcome: 'win' | 'loss' | 'draw' =
        winnerSeatIdx === null ? 'draw' : s.seatIndex === winnerSeatIdx ? 'win' : 'loss';
      this.recordSeatOutcome(
        match,
        s,
        outcome,
        outcome === 'win' ? 140 : outcome === 'draw' ? 50 : 18,
        outcome === 'win' ? 80 : outcome === 'draw' ? 35 : 16,
        outcome === 'win' ? 40 : outcome === 'draw' ? 16 : 6,
        summary
      );
    }

    this.pushSystemChat(match, summary);
    this.broadcastMatch(match);
    this.broadcastPresence();
  }

  private startMatch(match: InternalMatch) {
    this.clearMatchTimers(match);
    match.status = 'active';
    match.roundNumber += 1;
    match.startedAt = Date.now();
    match.winnerSummary = null;

    for (const s of match.seats) {
      s.score = 0;
      s.hasPicked = false;
      s.secretPick = null;
      s.revealedPick = null;
      s.guessCount = 0;
      s.lastGuess = null;
      s.lastClue = null;
      s.lastProximity = null;
      s.crackedAtMs = null;
      s.duelProgress = 0;
      s.duelMaxProgress = 100;
      s.duelFinished = false;
      s.duelSummary = null;
      s.team = assignSeatTeam(match.gameId, s.seatIndex);
    }

    if (match.gameId === 'tictactoe') {
      const boardSize = match.tttBoardSize || 3;
      const winTarget = match.tttWinTarget || 3;
      match.tttState = {
        board: Array(boardSize * boardSize).fill(null),
        boardSize,
        winTarget,
        currentTeam: 'X',
        xSeatCursor: 0,
        oSeatCursor: 1,
        activeSeatIndex: 0,
        winnerTeam: null,
        winLine: null,
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'connect_four') {
      match.connectFourState = {
        board: createC4Board(),
        currentTeam: 'R',
        activeSeatIndex: 0,
        winnerTeam: null,
        winLine: null,
        lastCol: null,
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'connect_five') {
      match.connectFiveState = {
        cols: 9,
        rows: 7,
        winTarget: 5,
        board: Array(9 * 7).fill(null),
        currentTeam: 'R',
        activeSeatIndex: 0,
        winnerTeam: null,
        winLine: null,
        lastCol: null,
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'chess') {
      match.chessState = {
        ...createInitialChessState(),
        activeSeatIndex: 0,
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'checkers') {
      match.checkersState = {
        ...createInitialCheckersState(),
        activeSeatIndex: 0,
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'reversi') {
      match.reversiState = {
        ...createInitialReversiState(),
        activeSeatIndex: 0,
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'dots_and_boxes') {
      match.dotsState = {
        ...createInitialDotsState(4, 4),
        activeSeatIndex: 0,
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'battleship') {
      const fleet0 = generateRandomBattleshipBoard();
      const fleet1 = generateRandomBattleshipBoard();
      match.battleshipInternal = {
        turnSeatIndex: 0,
        phase: 'placing',
        winnerSeatIndex: null,
        readyBySeat: { 0: false, 1: false },
        shipsBySeat: { 0: fleet0.grid, 1: fleet1.grid },
        shotsOnSeat: {
          0: Array(100).fill('unknown'),
          1: Array(100).fill('unknown'),
        },
        sunkShipsBySeat: { 0: [], 1: [] },
        statusText: 'Lock your 5-ship fleet to start firing salvos!',
      };
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'ludo') {
      match.ludoState = createInitialLudoState(2);
      this.broadcastMatch(match);
      return;
    }

    if (match.gameId === 'rps') {
      match.rpsState = {
        targetWins: match.rpsTargetWins || 3,
        roundDeadlineAt: Date.now() + 18_000,
        lastRoundSummary: `Round 1 started (First to ${match.rpsTargetWins || 3} wins) — pick Rock, Paper, or Scissors!`,
        winnerSeatIndexes: [],
      };
      this.broadcastMatch(match);
      const timer = setTimeout(() => this.handleRpsTimeout(match.id), 18_200);
      match.timers.push(timer);
      return;
    }

    if (match.gameId === 'guess_number') {
      const preset = GUESS_PRESETS.medium;
      const secretNumber = crypto.randomInt(preset.min, preset.max + 1);
      match.guessState = {
        difficulty: 'medium',
        min: preset.min,
        max: preset.max,
        maxAttempts: 10,
        secretNumber,
        deadlineAt: Date.now() + 90_000,
        winnerSeatIndex: null,
        revealedSecret: null,
        feed: [],
      };
      this.broadcastMatch(match);
      const deadlineTimer = setTimeout(() => this.handleGuessTimeout(match.id), 90_200);
      match.timers.push(deadlineTimer);
      return;
    }

    // Seeded Synchronized Live 1v1 Duel for all remaining skill/arcade/puzzle titles
    if (!isTurnBasedBoardGame(match.gameId)) {
      const durationSec = getDuelDurationSec(match.gameId);
      const seed = crypto.randomInt(100_000, 99_999_999);
      const startedAt = Date.now();
      match.duelState = {
        seed,
        durationSec,
        startedAt,
        endsAt: startedAt + durationSec * 1000,
        winnerSeatIndex: null,
        statusText: `Live 1v1 ${gameDisplayName(match.gameId)} Duel started! Outscore your opponent.`,
      };
      this.broadcastMatch(match);
      const endTimer = setTimeout(() => this.finishDuelMatch(match), durationSec * 1000 + 500);
      match.timers.push(endTimer);
    }
  }

  private applyC4Move(match: InternalMatch, col: number) {
    if (!match.connectFourState) return;
    const c4 = match.connectFourState;
    const row = getC4DropRow(c4.board as C4Cell[], col);
    if (row < 0) return;

    c4.board[row * C4_COLS + col] = c4.currentTeam;
    c4.lastCol = col;
    const evalRes = evaluateC4Board(c4.board as C4Cell[]);
    if (evalRes.winner) {
      c4.winnerTeam = evalRes.winner;
      c4.winLine = evalRes.line;
      const winners = evalRes.winner === 'draw' ? [] : match.seats.filter((s) => s.team === evalRes.winner);
      const summary =
        evalRes.winner === 'draw'
          ? 'Connect Four ended in a draw!'
          : `${winners.map((w) => w.username).join(' & ')} connected 4!`;
      this.finalizeTwoPlayerBoardMatch(match, evalRes.winner, summary, 130);
      return;
    }

    c4.currentTeam = c4.currentTeam === 'R' ? 'Y' : 'R';
    c4.activeSeatIndex = c4.currentTeam === 'R' ? 0 : 1;
    this.broadcastMatch(match);
  }

  private applyC5Move(match: InternalMatch, col: number, popOut: boolean) {
    if (!match.connectFiveState) return;
    const c5 = match.connectFiveState;
    if (popOut) {
      if (!canPopOutCol(c5.board as GravityCell[], c5.cols, c5.rows, col, c5.currentTeam)) return;
      c5.board = applyPopOutCol(c5.board as GravityCell[], c5.cols, c5.rows, col);
    } else {
      const row = getGravityDropRow(c5.board as GravityCell[], c5.cols, c5.rows, col);
      if (row < 0) return;
      c5.board[row * c5.cols + col] = c5.currentTeam;
    }
    c5.lastCol = col;
    const evalRes = evaluateGravityBoard(c5.board as GravityCell[], c5.cols, c5.rows, c5.winTarget);
    if (evalRes.winner) {
      c5.winnerTeam = evalRes.winner;
      c5.winLine = evalRes.line;
      const winners = evalRes.winner === 'draw' ? [] : match.seats.filter((s) => s.team === evalRes.winner);
      const summary =
        evalRes.winner === 'draw'
          ? 'Connect Five ended in a draw!'
          : `${winners.map((w) => w.username).join(' & ')} connected 5!`;
      this.finalizeTwoPlayerBoardMatch(match, evalRes.winner, summary, 150);
      return;
    }
    c5.currentTeam = c5.currentTeam === 'R' ? 'Y' : 'R';
    c5.activeSeatIndex = c5.currentTeam === 'R' ? 0 : 1;
    this.broadcastMatch(match);
  }

  private applyTttMove(match: InternalMatch, cellIndex: number) {
    if (!match.tttState) return;
    const totalCells = match.tttState.boardSize * match.tttState.boardSize;
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalCells) return;
    if (match.tttState.board[cellIndex] !== null) return;

    const team = match.tttState.currentTeam;
    match.tttState.board[cellIndex] = team;

    const evalRes = evaluateTttBoard(
      match.tttState.board as TttCell[],
      match.tttState.boardSize,
      match.tttState.winTarget
    );
    if (evalRes.winner) {
      match.tttState.winnerTeam = evalRes.winner;
      match.tttState.winLine = evalRes.line;
      const winners = evalRes.winner === 'draw' ? [] : match.seats.filter((s) => s.team === evalRes.winner);
      const summary =
        evalRes.winner === 'draw'
          ? 'Tic-Tac-Toe ended in a draw!'
          : `${winners.map((w) => w.username).join(' & ')} (${evalRes.winner}) wins!`;
      this.finalizeTwoPlayerBoardMatch(match, evalRes.winner, summary, 120);
      return;
    }

    match.tttState.currentTeam = team === 'X' ? 'O' : 'X';
    match.tttState.activeSeatIndex = match.tttState.currentTeam === 'X' ? 0 : 1;
    this.broadcastMatch(match);
  }

  private handleRpsTimeout(matchId: string) {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active' || match.gameId !== 'rps') return;
    const moves: RpsMove[] = ['rock', 'paper', 'scissors'];
    for (const s of match.seats) {
      if (!s.hasPicked) {
        s.secretPick = moves[crypto.randomInt(0, 3)];
        s.hasPicked = true;
      }
    }
    this.resolveRpsRound(match);
  }

  private resolveRpsRound(match: InternalMatch) {
    if (!match.rpsState) return;
    this.clearMatchTimers(match);

    for (const s of match.seats) {
      s.revealedPick = s.secretPick;
    }

    const roundGain = new Map<number, number>();
    for (const a of match.seats) {
      let pts = 0;
      for (const b of match.seats) {
        if (a.seatIndex === b.seatIndex || !a.secretPick || !b.secretPick) continue;
        if (resolveRpsOutcome(a.secretPick, b.secretPick) === 'win') pts += 1;
      }
      roundGain.set(a.seatIndex, pts);
      a.score += pts;
    }

    const topRound = Math.max(...Array.from(roundGain.values()), 0);
    const roundWinners = match.seats.filter((s) => (roundGain.get(s.seatIndex) || 0) === topRound && topRound > 0);
    const summary =
      roundWinners.length > 0
        ? `Round complete: ${roundWinners.map((w) => `${w.username} (${w.revealedPick})`).join(', ')} led!`
        : 'Round tied — both chose evenly!';

    const leaderScore = Math.max(...match.seats.map((s) => s.score));
    if (leaderScore >= match.rpsState.targetWins) {
      match.status = 'finished';
      const winners = match.seats.filter((s) => s.score === leaderScore);
      match.rpsState.winnerSeatIndexes = winners.map((w) => w.seatIndex);
      match.rpsState.lastRoundSummary = summary;
      match.winnerSummary =
        winners.length === 1
          ? `${winners[0].username} wins Rock Paper Scissors (${winners[0].score} pts)!`
          : `Draw at ${leaderScore} pts!`;

      for (const s of match.seats) {
        if (!s.playerId) continue;
        const isWin = s.score === leaderScore;
        const outcome: 'win' | 'loss' | 'draw' =
          isWin && winners.length > 1 ? 'draw' : isWin ? 'win' : 'loss';
        this.recordSeatOutcome(
          match,
          s,
          outcome,
          outcome === 'win' ? 115 : outcome === 'draw' ? 45 : 15,
          outcome === 'win' ? 60 : outcome === 'draw' ? 30 : 15,
          outcome === 'win' ? 32 : outcome === 'draw' ? 14 : 6,
          match.winnerSummary
        );
      }
      this.pushSystemChat(match, match.winnerSummary);
      this.broadcastMatch(match);
      this.broadcastPresence();
      return;
    }

    match.rpsState.lastRoundSummary = summary;
    match.rpsState.roundDeadlineAt = Date.now() + 3000;
    this.broadcastMatch(match);

    const nextTimer = setTimeout(() => {
      if (match.status !== 'active' || !match.rpsState) return;
      for (const s of match.seats) {
        s.hasPicked = false;
        s.secretPick = null;
        s.revealedPick = null;
      }
      match.rpsState.roundDeadlineAt = Date.now() + 18_000;
      match.rpsState.lastRoundSummary = 'Next round open — lock your move!';
      this.broadcastMatch(match);
      const t2 = setTimeout(() => this.handleRpsTimeout(match.id), 18_200);
      match.timers.push(t2);
    }, 2400);
    match.timers.push(nextTimer);
  }

  private applyGuessAttempt(match: InternalMatch, seat: InternalSeat, guess: number) {
    if (!match.guessState || match.status !== 'active') return;
    const gs = match.guessState;
    seat.guessCount = (seat.guessCount || 0) + 1;
    seat.lastGuess = guess;

    if (guess === gs.secretNumber) {
      seat.lastClue = 'correct';
      seat.lastProximity = 'Exact Match!';
      seat.crackedAtMs = Date.now();
      seat.score += 1;

      gs.feed.unshift({
        id: crypto.randomUUID(),
        seatIndex: seat.seatIndex,
        username: seat.username,
        kind: seat.kind,
        guess,
        clue: 'correct',
        proximity: 'Exact Match!',
        ts: Date.now(),
      });
      gs.winnerSeatIndex = seat.seatIndex;
      gs.revealedSecret = gs.secretNumber;
      this.clearMatchTimers(match);
      match.status = 'finished';
      match.winnerSummary = `${seat.username} cracked secret #${gs.secretNumber} in ${seat.guessCount} guesses!`;

      for (const s of match.seats) {
        if (!s.playerId) continue;
        const outcome: 'win' | 'loss' = s.seatIndex === seat.seatIndex ? 'win' : 'loss';
        this.recordSeatOutcome(
          match,
          s,
          outcome,
          outcome === 'win' ? 145 : 15,
          outcome === 'win' ? 80 : 18,
          outcome === 'win' ? 40 : 6,
          match.winnerSummary,
          s.guessCount || 10
        );
      }
      this.pushSystemChat(match, match.winnerSummary);
      this.broadcastMatch(match);
      this.broadcastPresence();
      return;
    }

    const clue: 'higher' | 'lower' = guess < gs.secretNumber ? 'higher' : 'lower';
    const diff = Math.abs(gs.secretNumber - guess);
    const span = gs.max - gs.min;
    const proximity = diff <= Math.max(2, span * 0.04) ? 'Scorching close' : diff <= span * 0.14 ? 'Warm' : 'Cold';

    seat.lastClue = clue;
    seat.lastProximity = proximity;
    gs.feed.unshift({
      id: crypto.randomUUID(),
      seatIndex: seat.seatIndex,
      username: seat.username,
      kind: seat.kind,
      guess,
      clue,
      proximity,
      ts: Date.now(),
    });
    gs.feed = gs.feed.slice(0, 24);

    if (match.seats.every((s) => (s.guessCount || 0) >= gs.maxAttempts)) {
      this.handleGuessTimeout(match.id);
      return;
    }

    this.broadcastMatch(match);
  }

  private handleGuessTimeout(matchId: string) {
    const match = this.matches.get(matchId);
    if (!match || match.status !== 'active' || !match.guessState) return;
    this.clearMatchTimers(match);
    match.status = 'finished';
    match.guessState.revealedSecret = match.guessState.secretNumber;
    match.winnerSummary = `Time expired — secret was #${match.guessState.secretNumber}.`;

    for (const s of match.seats) {
      if (!s.playerId) continue;
      this.recordSeatOutcome(match, s, 'draw', 20, 18, 8, match.winnerSummary);
    }
    this.pushSystemChat(match, match.winnerSummary);
    this.broadcastMatch(match);
    this.broadcastPresence();
  }
}

export function attachRealtimeServer(httpServer: http.Server): RealtimeHub {
  return new RealtimeHub(httpServer);
}
