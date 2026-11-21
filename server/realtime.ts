import crypto from 'node:crypto';
import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  applyChessMove,
  chooseChessAiMove,
  createInitialChessState,
  getLegalChessMoves,
  type PromoKind,
} from '../src/game/chessEngine.ts';
import {
  C4_COLS,
  chooseC4AiMove,
  createC4Board,
  evaluateC4Board,
  getC4DropRow,
  type C4Cell,
} from '../src/game/connectFour.ts';
import { GUESS_PRESETS, MULTIPLAYER_GAME_IDS } from '../src/game/catalog.ts';
import { normalizeTttConfig } from '../src/game/tttRules.ts';
import type {
  DifficultyLevel,
  MultiplayerGameId,
  OnlinePlayerSummary,
  PublicRoomSummary,
  RoomChatMessage,
  RoomSeat,
  RoomState,
} from '../src/types.ts';
import { createNotification, db, type DbPlayer, recordMatchAndProgress, sha256 } from './db.ts';
import {
  chooseRpsAiMove,
  chooseTttAiMove,
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
  roomId: string | null;
  queuedFor: { gameId: MultiplayerGameId; mode: 'vs_human' | 'mixed' } | null;
}

interface InternalSeat extends RoomSeat {
  secretPick: RpsMove | null;
  aiLow?: number;
  aiHigh?: number;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

interface InternalRoom {
  id: string;
  code: string;
  gameId: MultiplayerGameId;
  title: string;
  mode: 'vs_human' | 'mixed';
  isPrivate: boolean;
  hostPlayerId: string;
  status: 'waiting' | 'active' | 'finished';
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
  chessState?: RoomState['chessState'];
  winnerSummary: string | null;
  aiTimers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>;
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

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

function assignSeatTeam(gameId: MultiplayerGameId, seatIndex: number): RoomSeat['team'] {
  if (gameId === 'tictactoe') return seatIndex % 2 === 0 ? 'X' : 'O';
  if (gameId === 'connect_four') return seatIndex % 2 === 0 ? 'R' : 'Y';
  if (gameId === 'chess') return seatIndex % 2 === 0 ? 'W' : 'B';
  return undefined;
}

function gameDisplayName(gameId: MultiplayerGameId): string {
  switch (gameId) {
    case 'tictactoe':
      return 'Tic-Tac-Toe';
    case 'rps':
      return 'Rock Paper Scissors';
    case 'guess_number':
      return 'Guess the Number';
    case 'connect_four':
      return 'Connect Four';
    case 'chess':
      return 'Chess';
  }
}

export class RealtimeHub {
  private wss: WebSocketServer;
  private clients = new Map<string, ConnectedClient>();
  private rooms = new Map<string, InternalRoom>();
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
      activeRooms: this.rooms.size,
      queuedPlayers,
      liveRooms: this.getPublicRoomSummaries(true),
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
    return Array.from(this.clients.values()).map((c) => {
      const room = c.roomId ? this.rooms.get(c.roomId) : undefined;
      return {
        playerId: c.playerId,
        username: c.username,
        profilePictureUrl: c.profilePictureUrl,
        activeFrame: c.activeFrame,
        level: c.level,
        status: room
          ? room.status === 'active'
            ? 'in_match'
            : 'in_room'
          : c.queuedFor
          ? 'queued'
          : 'lobby',
        roomId: c.roomId,
      };
    });
  }

  private getPublicRoomSummaries(includePrivate = false): PublicRoomSummary[] {
    const list: PublicRoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (!includePrivate && room.isPrivate) continue;
      const host = room.seats.find((s) => s.playerId === room.hostPlayerId) || room.seats[0];
      list.push({
        id: room.id,
        code: room.code,
        gameId: room.gameId,
        title: room.title,
        mode: room.mode,
        isPrivate: room.isPrivate,
        status: room.status,
        maxSeats: room.maxSeats,
        humanCount: room.seats.filter((s) => s.kind === 'human').length,
        aiCount: room.seats.filter((s) => s.kind === 'ai').length,
        hostUsername: host?.username || 'Host',
        tttBoardSize: room.gameId === 'tictactoe' ? room.tttBoardSize : undefined,
        tttWinTarget: room.gameId === 'tictactoe' ? room.tttWinTarget : undefined,
        rpsTargetWins: room.gameId === 'rps' ? room.rpsTargetWins : undefined,
      });
    }
    return list;
  }

  private broadcastPresenceAndRooms() {
    this.broadcastAll('presence:list', { players: this.getOnlineSummaries() });
    this.broadcastAll('rooms:list', { rooms: this.getPublicRoomSummaries(false) });
  }

  private pushSystemChat(room: InternalRoom, text: string) {
    room.chatMessages.push({
      id: crypto.randomUUID(),
      senderId: 'system',
      username: 'PLAYNOVA Arena',
      kind: 'system',
      text,
      ts: Date.now(),
    });
    if (room.chatMessages.length > 60) {
      room.chatMessages = room.chatMessages.slice(-60);
    }
  }

  private serializeRoom(room: InternalRoom): RoomState {
    return {
      id: room.id,
      code: room.code,
      gameId: room.gameId,
      title: room.title,
      mode: room.mode,
      isPrivate: room.isPrivate,
      hostPlayerId: room.hostPlayerId,
      status: room.status,
      maxSeats: room.maxSeats,
      roundNumber: room.roundNumber,
      tttBoardSize: room.gameId === 'tictactoe' ? room.tttBoardSize : undefined,
      tttWinTarget: room.gameId === 'tictactoe' ? room.tttWinTarget : undefined,
      rpsTargetWins: room.gameId === 'rps' ? room.rpsTargetWins : undefined,
      seats: room.seats.map((s) => ({
        seatIndex: s.seatIndex,
        kind: s.kind,
        playerId: s.playerId,
        username: s.username,
        profilePictureUrl: s.profilePictureUrl,
        activeFrame: s.activeFrame,
        aiDifficulty: s.aiDifficulty,
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
      })),
      chatMessages: room.chatMessages,
      tttState: room.tttState,
      rpsState: room.rpsState,
      guessState: room.guessState
        ? {
            difficulty: room.guessState.difficulty,
            min: room.guessState.min,
            max: room.guessState.max,
            maxAttempts: room.guessState.maxAttempts,
            deadlineAt: room.guessState.deadlineAt,
            winnerSeatIndex: room.guessState.winnerSeatIndex,
            revealedSecret: room.guessState.revealedSecret,
            feed: room.guessState.feed,
          }
        : undefined,
      connectFourState: room.connectFourState,
      chessState: room.chessState,
      winnerSummary: room.winnerSummary,
    };
  }

  private broadcastRoom(room: InternalRoom, extraEvent?: { event: string; payload: unknown }) {
    const snapshot = this.serializeRoom(room);
    for (const seat of room.seats) {
      if (seat.kind === 'human' && seat.playerId) {
        this.sendToPlayer(seat.playerId, 'room:state', { room: snapshot });
        if (extraEvent) {
          this.sendToPlayer(seat.playerId, extraEvent.event, extraEvent.payload);
        }
      }
    }
  }

  private clearRoomTimers(room: InternalRoom) {
    for (const t of room.aiTimers) {
      clearTimeout(t);
      clearInterval(t);
    }
    room.aiTimers = [];
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    const player = authenticateWsRequest(req);
    if (!player) {
      ws.close(4001, 'Username session required');
      return;
    }

    const existing = this.clients.get(player.id);
    if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
      existing.ws.close(4000, 'Replaced by newer connection');
    }

    let rejoinedRoom: InternalRoom | null = null;
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s.kind === 'human' && s.playerId === player.id);
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
        rejoinedRoom = room;
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
      roomId: rejoinedRoom?.id || null,
      queuedFor: null,
    };
    this.clients.set(player.id, client);

    this.send(ws, 'ws:ready', {
      playerId: player.id,
      username: player.username,
      rejoinedRoom: rejoinedRoom ? this.serializeRoom(rejoinedRoom) : null,
    });
    if (rejoinedRoom) {
      this.broadcastRoom(rejoinedRoom);
    }
    this.broadcastPresenceAndRooms();

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

      if (current.roomId) {
        const room = this.rooms.get(current.roomId);
        if (room) {
          const seat = room.seats.find((s) => s.kind === 'human' && s.playerId === player.id);
          if (seat) {
            seat.connectionStatus = 'reconnecting';
            this.broadcastRoom(room);
            seat.disconnectTimer = setTimeout(() => {
              this.removeHumanFromRoom(room.id, player.id);
            }, 60_000);
          }
        }
      }
      this.broadcastPresenceAndRooms();
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
    };
  }

  private makeAiSeat(seatIndex: number, difficulty: DifficultyLevel, team?: RoomSeat['team']): InternalSeat {
    const label =
      difficulty === 'hard'
        ? `Apex AI Bot #${seatIndex + 1}`
        : difficulty === 'medium'
        ? `Tactician AI Bot #${seatIndex + 1}`
        : `Scout AI Bot #${seatIndex + 1}`;
    return {
      seatIndex,
      kind: 'ai',
      playerId: null,
      username: label,
      profilePictureUrl: null,
      activeFrame: difficulty === 'hard' ? 'frame_orange' : difficulty === 'medium' ? 'frame_purple' : 'frame_slate',
      aiDifficulty: difficulty,
      connectionStatus: 'bot',
      team,
      score: 0,
      hasPicked: false,
      secretPick: null,
      revealedPick: null,
      guessCount: 0,
    };
  }

  private createRoom(
    host: ConnectedClient,
    opts: {
      gameId: MultiplayerGameId;
      mode: 'vs_human' | 'mixed';
      isPrivate: boolean;
      title?: string;
      maxSeats?: number;
      aiBots?: DifficultyLevel[];
      tttWinTarget?: number;
      tttBoardSize?: number;
      rpsTargetWins?: number;
    }
  ): InternalRoom {
    if (host.roomId) {
      this.removeHumanFromRoom(host.roomId, host.playerId);
    }
    this.removeFromQueue(host.playerId);

    const id = crypto.randomUUID();
    let code = generateRoomCode();
    while (Array.from(this.rooms.values()).some((r) => r.code === code)) {
      code = generateRoomCode();
    }

    const isStrictly1v1 = opts.gameId === 'connect_four' || opts.gameId === 'chess';
    const defaultMax = isStrictly1v1 ? 2 : opts.mode === 'mixed' ? 4 : 2;
    const maxSeats = isStrictly1v1 ? 2 : Math.max(2, Math.min(4, opts.maxSeats || defaultMax));

    const seats: InternalSeat[] = [this.makeHumanSeat(host, 0, assignSeatTeam(opts.gameId, 0))];

    if (opts.mode === 'mixed' && opts.aiBots && opts.aiBots.length > 0) {
      for (const diff of opts.aiBots) {
        if (seats.length >= maxSeats) break;
        const idx = seats.length;
        seats.push(this.makeAiSeat(idx, diff, assignSeatTeam(opts.gameId, idx)));
      }
    }

    const tttCfg = normalizeTttConfig(opts.tttWinTarget, opts.tttBoardSize);
    const rpsTargetWins = Math.max(1, Math.min(15, Math.floor(Number(opts.rpsTargetWins || 3))));
    const gameLabel = gameDisplayName(opts.gameId);

    const room: InternalRoom = {
      id,
      code,
      gameId: opts.gameId,
      title: (opts.title || `${host.username}'s ${gameLabel} Arena`).slice(0, 48),
      mode: opts.mode,
      isPrivate: Boolean(opts.isPrivate),
      hostPlayerId: host.playerId,
      status: 'waiting',
      maxSeats,
      roundNumber: 0,
      seats,
      chatMessages: [],
      startedAt: Date.now(),
      tttBoardSize: tttCfg.boardSize,
      tttWinTarget: tttCfg.winTarget,
      rpsTargetWins,
      winnerSummary: null,
      aiTimers: [],
    };
    this.pushSystemChat(room, `${host.username} opened a ${gameLabel} room (${code}).`);

    this.rooms.set(id, room);
    host.roomId = id;
    return room;
  }

  private removeHumanFromRoom(roomId: string, playerId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const idx = room.seats.findIndex((s) => s.kind === 'human' && s.playerId === playerId);
    let leftName = 'Player';
    if (idx !== -1) {
      const removed = room.seats[idx];
      leftName = removed.username;
      if (removed.disconnectTimer) clearTimeout(removed.disconnectTimer);
      room.seats.splice(idx, 1);
      room.seats.forEach((s, i) => {
        s.seatIndex = i;
        s.team = assignSeatTeam(room.gameId, i);
      });
    }

    const client = this.clients.get(playerId);
    if (client && client.roomId === roomId) {
      client.roomId = null;
      this.send(client.ws, 'room:left', { roomId });
    }

    const remainingHumans = room.seats.filter((s) => s.kind === 'human');
    if (remainingHumans.length === 0) {
      this.clearRoomTimers(room);
      this.rooms.delete(roomId);
    } else {
      this.pushSystemChat(room, `${leftName} left the arena.`);
      if (room.hostPlayerId === playerId) {
        room.hostPlayerId = remainingHumans[0].playerId!;
      }
      if (room.status === 'active' && remainingHumans.length === 1 && room.mode === 'vs_human') {
        this.clearRoomTimers(room);
        room.status = 'finished';
        room.winnerSummary = `${remainingHumans[0].username} won by opponent forfeit.`;
        this.payoutSingleHumanVictory(room, remainingHumans[0], 'Opponent disconnected');
      }
      this.broadcastRoom(room);
    }
    this.broadcastPresenceAndRooms();
  }

  private payoutSingleHumanVictory(room: InternalRoom, winnerSeat: InternalSeat, summary: string) {
    if (!winnerSeat.playerId) return;
    recordMatchAndProgress({
      playerId: winnerSeat.playerId,
      gameId: room.gameId,
      mode: room.mode,
      difficulty: 'medium',
      outcome: 'win',
      opponentLabel: 'Online Opponent',
      scoreDelta: 90,
      xpEarned: 45,
      coinsEarned: 25,
      durationSec: Math.max(5, Math.round((Date.now() - room.startedAt) / 1000)),
      summary,
    });
  }

  private handleEvent(client: ConnectedClient, event: string, payload: Record<string, unknown>) {
    switch (event) {
      case 'ping': {
        this.send(client.ws, 'pong', { ts: Date.now() });
        break;
      }

      case 'chat:send': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room) return;
        const text = String(payload.text || '').trim().replace(/\s+/g, ' ').slice(0, 220);
        if (!text) return;
        room.chatMessages.push({
          id: crypto.randomUUID(),
          senderId: client.playerId,
          username: client.username,
          kind: 'human',
          text,
          ts: Date.now(),
        });
        if (room.chatMessages.length > 60) {
          room.chatMessages = room.chatMessages.slice(-60);
        }
        this.broadcastRoom(room);
        break;
      }

      case 'queue:join': {
        const gameId = (MULTIPLAYER_GAME_IDS.includes(String(payload.gameId) as MultiplayerGameId)
          ? payload.gameId
          : 'tictactoe') as MultiplayerGameId;
        const mode = payload.mode === 'mixed' ? 'mixed' : 'vs_human';

        if (client.roomId) {
          this.removeHumanFromRoom(client.roomId, client.playerId);
        }
        this.removeFromQueue(client.playerId);

        const qKey = `${gameId}:${mode}`;
        const list = this.queues.get(qKey) || [];
        const partnerId = list.find((id) => id !== client.playerId && this.clients.has(id));
        if (partnerId) {
          this.queues.set(
            qKey,
            list.filter((id) => id !== partnerId && id !== client.playerId)
          );
          const partner = this.clients.get(partnerId)!;
          partner.queuedFor = null;
          client.queuedFor = null;

          const is1v1 = gameId === 'connect_four' || gameId === 'chess';
          const room = this.createRoom(partner, {
            gameId,
            mode: is1v1 ? 'vs_human' : mode,
            isPrivate: false,
            title: mode === 'mixed' && !is1v1 ? 'Mixed Matchmaking Arena' : `Ranked 1v1 ${gameDisplayName(gameId)}`,
            maxSeats: is1v1 ? 2 : mode === 'mixed' ? 4 : 2,
            aiBots: mode === 'mixed' && !is1v1 ? ['medium', 'hard'] : undefined,
          });
          const seatIdx = room.seats.length;
          room.seats.push(this.makeHumanSeat(client, seatIdx, assignSeatTeam(gameId, seatIdx)));
          client.roomId = room.id;

          this.pushSystemChat(room, `Random Matchmaking paired ${partner.username} and ${client.username}!`);
          this.startMatch(room);
          this.broadcastPresenceAndRooms();
          return;
        }

        list.push(client.playerId);
        this.queues.set(qKey, list);
        client.queuedFor = { gameId, mode };
        this.send(client.ws, 'queue:status', { queued: true, gameId, mode, position: list.length });
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'queue:leave': {
        this.removeFromQueue(client.playerId);
        this.send(client.ws, 'queue:status', { queued: false });
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'room:create': {
        const gameId = (MULTIPLAYER_GAME_IDS.includes(String(payload.gameId) as MultiplayerGameId)
          ? payload.gameId
          : 'tictactoe') as MultiplayerGameId;
        const mode = payload.mode === 'mixed' ? 'mixed' : 'vs_human';
        const isPrivate = Boolean(payload.isPrivate);
        const aiDiff = (['easy', 'medium', 'hard'].includes(String(payload.aiDifficulty))
          ? payload.aiDifficulty
          : 'medium') as DifficultyLevel;
        const maxBots = gameId === 'connect_four' || gameId === 'chess' ? 1 : 3;
        const aiCount = mode === 'mixed' ? Math.max(1, Math.min(maxBots, Number(payload.aiCount || 1))) : 0;
        const aiBots = Array.from({ length: aiCount }, (_, idx) =>
          idx === 1 && aiDiff !== 'hard' ? 'hard' : aiDiff
        ) as DifficultyLevel[];
        const tttCfg = normalizeTttConfig(payload.tttWinTarget, payload.tttBoardSize);
        const rpsTargetWins = Math.max(1, Math.min(15, Math.floor(Number(payload.rpsTargetWins || 3))));

        const room = this.createRoom(client, {
          gameId,
          mode,
          isPrivate,
          title: typeof payload.title === 'string' ? payload.title : undefined,
          maxSeats: Number(payload.maxSeats || (mode === 'mixed' ? 4 : 2)),
          aiBots,
          tttWinTarget: tttCfg.winTarget,
          tttBoardSize: tttCfg.boardSize,
          rpsTargetWins,
        });
        this.broadcastRoom(room);
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'room:update_settings': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.hostPlayerId !== client.playerId || room.status === 'active') return;
        if (room.gameId === 'tictactoe') {
          const tttCfg = normalizeTttConfig(payload.tttWinTarget ?? room.tttWinTarget, payload.tttBoardSize);
          room.tttWinTarget = tttCfg.winTarget;
          room.tttBoardSize = tttCfg.boardSize;
        }
        if (room.gameId === 'rps' && payload.rpsTargetWins !== undefined) {
          room.rpsTargetWins = Math.max(1, Math.min(15, Math.floor(Number(payload.rpsTargetWins || 3))));
        }
        this.broadcastRoom(room);
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'room:join': {
        const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : '';
        const roomCode = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
        const target = roomId
          ? this.rooms.get(roomId)
          : Array.from(this.rooms.values()).find((r) => r.code === roomCode);

        if (!target) {
          this.send(client.ws, 'room:error', { error: 'Room not found. Verify the room code or ask the host for a fresh invite.' });
          return;
        }
        const alreadyIn = target.seats.find((s) => s.kind === 'human' && s.playerId === client.playerId);
        if (alreadyIn) {
          client.roomId = target.id;
          this.send(client.ws, 'room:state', { room: this.serializeRoom(target) });
          return;
        }
        if (target.status === 'active') {
          this.send(client.ws, 'room:error', { error: 'This match is already underway.' });
          return;
        }
        if (target.seats.length >= target.maxSeats) {
          const aiIdx = target.seats.findIndex((s) => s.kind === 'ai');
          if (target.mode === 'mixed' && aiIdx !== -1) {
            const team = target.seats[aiIdx].team;
            target.seats.splice(aiIdx, 1);
            target.seats.forEach((s, i) => {
              s.seatIndex = i;
              s.team = assignSeatTeam(target.gameId, i);
            });
            target.seats.push(this.makeHumanSeat(client, target.seats.length, team));
          } else {
            this.send(client.ws, 'room:error', { error: 'Room is currently full.' });
            return;
          }
        } else {
          if (client.roomId && client.roomId !== target.id) {
            this.removeHumanFromRoom(client.roomId, client.playerId);
          }
          this.removeFromQueue(client.playerId);
          const idx = target.seats.length;
          target.seats.push(this.makeHumanSeat(client, idx, assignSeatTeam(target.gameId, idx)));
        }

        client.roomId = target.id;
        this.pushSystemChat(target, `${client.username} joined the room.`);
        this.broadcastRoom(target);
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'room:leave': {
        if (client.roomId) {
          this.removeHumanFromRoom(client.roomId, client.playerId);
        }
        break;
      }

      case 'room:add_ai': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.hostPlayerId !== client.playerId || room.status !== 'waiting') return;
        if (room.seats.length >= room.maxSeats) {
          this.send(client.ws, 'room:error', { error: 'All seats in this room are filled.' });
          return;
        }
        const diff = (['easy', 'medium', 'hard'].includes(String(payload.difficulty))
          ? payload.difficulty
          : 'medium') as DifficultyLevel;
        room.mode = 'mixed';
        const idx = room.seats.length;
        const aiSeat = this.makeAiSeat(idx, diff, assignSeatTeam(room.gameId, idx));
        room.seats.push(aiSeat);
        this.pushSystemChat(room, `Added AI Bot (${aiSeat.username}).`);
        this.broadcastRoom(room);
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'room:remove_seat': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.hostPlayerId !== client.playerId || room.status !== 'waiting') return;
        const seatIndex = Number(payload.seatIndex);
        const target = room.seats[seatIndex];
        if (!target || target.kind !== 'ai') return;
        room.seats.splice(seatIndex, 1);
        room.seats.forEach((s, i) => {
          s.seatIndex = i;
          s.team = assignSeatTeam(room.gameId, i);
        });
        if (room.seats.every((s) => s.kind === 'human')) {
          room.mode = 'vs_human';
        }
        this.broadcastRoom(room);
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'invite:send': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        const targetId = String(payload.targetPlayerId || payload.toPlayerId || '');
        if (!room || !targetId || targetId === client.playerId) return;
        const target = this.clients.get(targetId);
        if (!target) {
          this.send(client.ws, 'room:error', { error: 'That player went offline.' });
          return;
        }
        this.send(target.ws, 'invite:received', {
          roomId: room.id,
          roomCode: room.code,
          gameId: room.gameId,
          fromPlayerId: client.playerId,
          fromUsername: client.username,
          createdAt: new Date().toISOString(),
        });
        createNotification(
          targetId,
          'Match Invitation',
          `${client.username} invited you to join ${gameDisplayName(room.gameId)} (Room ${room.code}).`,
          'invite'
        );
        this.send(client.ws, 'invite:sent', { toUsername: target.username });
        break;
      }

      case 'room:start':
      case 'room:rematch': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.hostPlayerId !== client.playerId) return;
        if (room.seats.length < 2) {
          this.send(client.ws, 'room:error', {
            error: 'Need at least 2 participants (invite an online player or add an AI bot).',
          });
          return;
        }
        if (event === 'room:rematch') {
          this.pushSystemChat(room, `${client.username} initiated a rematch!`);
        }
        this.startMatch(room);
        this.broadcastPresenceAndRooms();
        break;
      }

      case 'ttt:move': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.gameId !== 'tictactoe' || room.status !== 'active' || !room.tttState) return;
        const activeSeat = room.seats[room.tttState.activeSeatIndex];
        if (!activeSeat || activeSeat.kind !== 'human' || activeSeat.playerId !== client.playerId) {
          this.send(client.ws, 'room:error', { error: 'Wait for your turn.' });
          return;
        }
        this.applyTttMove(room, Number(payload.cellIndex));
        break;
      }

      case 'rps:pick': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.gameId !== 'rps' || room.status !== 'active' || !room.rpsState) return;
        const seat = room.seats.find((s) => s.kind === 'human' && s.playerId === client.playerId);
        if (!seat || seat.hasPicked) return;
        const move = (payload.move || payload.pick) as RpsMove;
        if (!['rock', 'paper', 'scissors'].includes(move)) return;

        seat.secretPick = move;
        seat.hasPicked = true;
        this.broadcastRoom(room);

        if (room.seats.filter((s) => s.kind === 'human').every((s) => s.hasPicked)) {
          this.resolveRpsRound(room);
        }
        break;
      }

      case 'guess:submit': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.gameId !== 'guess_number' || room.status !== 'active' || !room.guessState) return;
        const seat = room.seats.find((s) => s.kind === 'human' && s.playerId === client.playerId);
        if (!seat) return;
        if ((seat.guessCount || 0) >= room.guessState.maxAttempts) {
          this.send(client.ws, 'room:error', { error: 'You have used all attempts this round.' });
          return;
        }
        const guess = Number(payload.guess);
        if (!Number.isInteger(guess) || guess < room.guessState.min || guess > room.guessState.max) {
          this.send(client.ws, 'room:error', {
            error: `Guess a whole number between ${room.guessState.min} and ${room.guessState.max}.`,
          });
          return;
        }
        this.applyGuessAttempt(room, seat, guess);
        break;
      }

      case 'c4:drop': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.gameId !== 'connect_four' || room.status !== 'active' || !room.connectFourState) return;
        const activeSeat = room.seats[room.connectFourState.activeSeatIndex];
        if (!activeSeat || activeSeat.kind !== 'human' || activeSeat.playerId !== client.playerId) {
          this.send(client.ws, 'room:error', { error: 'Wait for your turn.' });
          return;
        }
        this.applyC4Move(room, Number(payload.col));
        break;
      }

      case 'chess:move': {
        const room = client.roomId ? this.rooms.get(client.roomId) : undefined;
        if (!room || room.gameId !== 'chess' || room.status !== 'active' || !room.chessState) return;
        const activeSeat = room.seats[room.chessState.activeSeatIndex];
        if (!activeSeat || activeSeat.kind !== 'human' || activeSeat.playerId !== client.playerId) {
          this.send(client.ws, 'room:error', { error: 'Wait for your turn.' });
          return;
        }
        const from = Number(payload.from);
        const to = Number(payload.to);
        const promo = (['Q', 'R', 'B', 'N'].includes(String(payload.promo)) ? payload.promo : undefined) as
          | PromoKind
          | undefined;
        const legal = getLegalChessMoves(room.chessState, from);
        const matched = legal.find((m) => m.to === to && (!m.promo || m.promo === (promo || 'Q')));
        if (!matched) {
          this.send(client.ws, 'room:error', { error: 'Illegal chess move.' });
          return;
        }
        this.applyChessRoomMove(room, matched);
        break;
      }
    }
  }

  private startMatch(room: InternalRoom) {
    this.clearRoomTimers(room);
    room.status = 'active';
    room.roundNumber += 1;
    room.startedAt = Date.now();
    room.winnerSummary = null;

    for (const s of room.seats) {
      s.score = 0;
      s.hasPicked = false;
      s.secretPick = null;
      s.revealedPick = null;
      s.guessCount = 0;
      s.lastGuess = null;
      s.lastClue = null;
      s.lastProximity = null;
      s.crackedAtMs = null;
      s.team = assignSeatTeam(room.gameId, s.seatIndex);
    }

    if (room.gameId === 'tictactoe') {
      const boardSize = room.tttBoardSize || 3;
      const winTarget = room.tttWinTarget || 3;
      const firstX = room.seats.findIndex((s) => s.team === 'X');
      room.tttState = {
        board: Array(boardSize * boardSize).fill(null),
        boardSize,
        winTarget,
        currentTeam: 'X',
        xSeatCursor: firstX >= 0 ? firstX : 0,
        oSeatCursor: room.seats.findIndex((s) => s.team === 'O'),
        activeSeatIndex: firstX >= 0 ? firstX : 0,
        winnerTeam: null,
        winLine: null,
      };
      this.broadcastRoom(room);
      this.maybeScheduleTttAi(room);
      return;
    }

    if (room.gameId === 'connect_four') {
      room.connectFourState = {
        board: createC4Board(),
        currentTeam: 'R',
        activeSeatIndex: 0,
        winnerTeam: null,
        winLine: null,
        lastCol: null,
      };
      this.broadcastRoom(room);
      this.maybeScheduleC4Ai(room);
      return;
    }

    if (room.gameId === 'chess') {
      room.chessState = {
        ...createInitialChessState(),
        activeSeatIndex: 0,
      };
      this.broadcastRoom(room);
      this.maybeScheduleChessAi(room);
      return;
    }

    if (room.gameId === 'rps') {
      room.rpsState = {
        targetWins: room.rpsTargetWins || 3,
        roundDeadlineAt: Date.now() + 18_000,
        lastRoundSummary: `Round 1 started (First to ${room.rpsTargetWins || 3} wins) — pick Rock, Paper, or Scissors!`,
        winnerSeatIndexes: [],
      };
      this.broadcastRoom(room);
      const timer = setTimeout(() => this.handleRpsTimeout(room.id), 18_200);
      room.aiTimers.push(timer);
      return;
    }

    const preset = GUESS_PRESETS.medium;
    const secretNumber = crypto.randomInt(preset.min, preset.max + 1);
    for (const s of room.seats) {
      if (s.kind === 'ai') {
        s.aiLow = preset.min;
        s.aiHigh = preset.max;
      }
    }
    room.guessState = {
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
    this.broadcastRoom(room);
    const aiInterval = setInterval(() => this.stepGuessAiBots(room.id), 2400);
    const deadlineTimer = setTimeout(() => this.handleGuessTimeout(room.id), 90_200);
    room.aiTimers.push(aiInterval, deadlineTimer);
  }

  private maybeScheduleC4Ai(room: InternalRoom) {
    if (room.status !== 'active' || !room.connectFourState) return;
    const activeSeat = room.seats[room.connectFourState.activeSeatIndex];
    if (!activeSeat || activeSeat.kind !== 'ai') return;

    const timer = setTimeout(() => {
      if (room.status !== 'active' || !room.connectFourState) return;
      const col = chooseC4AiMove(
        room.connectFourState.board as C4Cell[],
        activeSeat.aiDifficulty || 'medium',
        room.connectFourState.currentTeam
      );
      if (col >= 0) this.applyC4Move(room, col);
    }, 600);
    room.aiTimers.push(timer);
  }

  private applyC4Move(room: InternalRoom, col: number) {
    if (!room.connectFourState) return;
    const c4 = room.connectFourState;
    const row = getC4DropRow(c4.board as C4Cell[], col);
    if (row < 0) {
      const seat = room.seats[c4.activeSeatIndex];
      if (seat?.kind === 'human' && seat.playerId) {
        this.sendToPlayer(seat.playerId, 'room:error', { error: 'Column is full. Choose another column.' });
      }
      return;
    }

    c4.board[row * C4_COLS + col] = c4.currentTeam;
    c4.lastCol = col;
    const evalRes = evaluateC4Board(c4.board as C4Cell[]);
    if (evalRes.winner) {
      this.clearRoomTimers(room);
      room.status = 'finished';
      c4.winnerTeam = evalRes.winner;
      c4.winLine = evalRes.line;

      const winners = evalRes.winner === 'draw' ? [] : room.seats.filter((s) => s.team === evalRes.winner);
      room.winnerSummary =
        evalRes.winner === 'draw'
          ? 'Connect Four ended in a draw!'
          : `${winners.map((w) => w.username).join(' & ')} (${evalRes.winner === 'R' ? 'Orange' : 'Blue'}) connected 4!`;

      const durationSec = Math.max(4, Math.round((Date.now() - room.startedAt) / 1000));
      for (const s of room.seats) {
        if (s.kind === 'human' && s.playerId) {
          const outcome: 'win' | 'loss' | 'draw' =
            evalRes.winner === 'draw' ? 'draw' : s.team === evalRes.winner ? 'win' : 'loss';
          if (outcome === 'win') s.score += 1;
          recordMatchAndProgress({
            playerId: s.playerId,
            gameId: 'connect_four',
            mode: room.mode,
            difficulty: 'medium',
            outcome,
            opponentLabel: room.mode === 'mixed' ? 'Mixed Arena' : 'Online Rival',
            scoreDelta: outcome === 'win' ? 130 : outcome === 'draw' ? 45 : 15,
            xpEarned: outcome === 'win' ? 75 : outcome === 'draw' ? 35 : 18,
            coinsEarned: outcome === 'win' ? 40 : outcome === 'draw' ? 16 : 6,
            durationSec,
            summary: room.winnerSummary,
          });
        }
      }
      this.pushSystemChat(room, room.winnerSummary);
      this.broadcastRoom(room);
      this.broadcastPresenceAndRooms();
      return;
    }

    c4.currentTeam = c4.currentTeam === 'R' ? 'Y' : 'R';
    const nextIdx = room.seats.findIndex((s) => s.team === c4.currentTeam);
    c4.activeSeatIndex = nextIdx >= 0 ? nextIdx : (c4.activeSeatIndex + 1) % room.seats.length;
    this.broadcastRoom(room);
    this.maybeScheduleC4Ai(room);
  }

  private maybeScheduleChessAi(room: InternalRoom) {
    if (room.status !== 'active' || !room.chessState) return;
    const activeSeat = room.seats[room.chessState.activeSeatIndex];
    if (!activeSeat || activeSeat.kind !== 'ai') return;

    const timer = setTimeout(() => {
      if (room.status !== 'active' || !room.chessState) return;
      const move = chooseChessAiMove(room.chessState, activeSeat.aiDifficulty || 'medium');
      if (move) this.applyChessRoomMove(room, move);
    }, 650);
    room.aiTimers.push(timer);
  }

  private applyChessRoomMove(room: InternalRoom, move: { from: number; to: number; promo?: PromoKind; isCastle?: 'K' | 'Q'; isEnPassant?: boolean }) {
    if (!room.chessState) return;
    const next = applyChessMove(room.chessState, move);
    const nextSeatIdx = next.turn === 'w' ? 0 : 1;
    room.chessState = {
      ...next,
      activeSeatIndex: nextSeatIdx < room.seats.length ? nextSeatIdx : 0,
    };

    if (next.winnerTeam) {
      this.clearRoomTimers(room);
      room.status = 'finished';
      const winTeamCode = next.winnerTeam === 'w' ? 'W' : next.winnerTeam === 'b' ? 'B' : null;
      const winners = winTeamCode ? room.seats.filter((s) => s.team === winTeamCode) : [];
      room.winnerSummary =
        next.winnerTeam === 'draw'
          ? next.statusText
          : `${winners.map((w) => w.username).join(' & ')} (${next.winnerTeam === 'w' ? 'White' : 'Black'}) wins by Checkmate!`;

      const durationSec = Math.max(5, Math.round((Date.now() - room.startedAt) / 1000));
      for (const s of room.seats) {
        if (s.kind === 'human' && s.playerId) {
          const outcome: 'win' | 'loss' | 'draw' =
            next.winnerTeam === 'draw' ? 'draw' : s.team === winTeamCode ? 'win' : 'loss';
          if (outcome === 'win') s.score += 1;
          recordMatchAndProgress({
            playerId: s.playerId,
            gameId: 'chess',
            mode: room.mode,
            difficulty: 'medium',
            outcome,
            opponentLabel: room.mode === 'mixed' ? 'Mixed Chess AI' : 'Online Grandmaster Rival',
            scoreDelta: outcome === 'win' ? 180 : outcome === 'draw' ? 60 : 20,
            xpEarned: outcome === 'win' ? 110 : outcome === 'draw' ? 45 : 22,
            coinsEarned: outcome === 'win' ? 55 : outcome === 'draw' ? 22 : 8,
            durationSec,
            summary: room.winnerSummary,
          });
        }
      }
      this.pushSystemChat(room, room.winnerSummary);
      this.broadcastRoom(room);
      this.broadcastPresenceAndRooms();
      return;
    }

    this.broadcastRoom(room);
    this.maybeScheduleChessAi(room);
  }

  private maybeScheduleTttAi(room: InternalRoom) {
    if (room.status !== 'active' || !room.tttState) return;
    const activeSeat = room.seats[room.tttState.activeSeatIndex];
    if (!activeSeat || activeSeat.kind !== 'ai') return;

    const timer = setTimeout(() => {
      if (room.status !== 'active' || !room.tttState) return;
      const move = chooseTttAiMove(
        room.tttState.board as TttCell[],
        activeSeat.aiDifficulty || 'medium',
        (activeSeat.team === 'X' ? 'X' : 'O') as 'X' | 'O',
        room.tttState.boardSize,
        room.tttState.winTarget
      );
      if (move >= 0) this.applyTttMove(room, move);
    }, 550);
    room.aiTimers.push(timer);
  }

  private applyTttMove(room: InternalRoom, cellIndex: number) {
    if (!room.tttState) return;
    const totalCells = room.tttState.boardSize * room.tttState.boardSize;
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalCells) return;
    if (room.tttState.board[cellIndex] !== null) return;

    const team = room.tttState.currentTeam;
    room.tttState.board[cellIndex] = team;

    const evalRes = evaluateTttBoard(
      room.tttState.board as TttCell[],
      room.tttState.boardSize,
      room.tttState.winTarget
    );
    if (evalRes.winner) {
      this.clearRoomTimers(room);
      room.status = 'finished';
      room.tttState.winnerTeam = evalRes.winner;
      room.tttState.winLine = evalRes.line;

      const winners = evalRes.winner === 'draw' ? [] : room.seats.filter((s) => s.team === evalRes.winner);
      room.winnerSummary =
        evalRes.winner === 'draw'
          ? 'Match ended in a draw!'
          : `Team ${evalRes.winner} (${winners.map((w) => w.username).join(' & ')}) wins!`;

      const durationSec = Math.max(3, Math.round((Date.now() - room.startedAt) / 1000));
      for (const s of room.seats) {
        if (s.kind === 'human' && s.playerId) {
          const outcome: 'win' | 'loss' | 'draw' =
            evalRes.winner === 'draw' ? 'draw' : s.team === evalRes.winner ? 'win' : 'loss';
          if (outcome === 'win') s.score += 1;
          recordMatchAndProgress({
            playerId: s.playerId,
            gameId: 'tictactoe',
            mode: room.mode,
            difficulty: 'medium',
            outcome,
            opponentLabel: room.mode === 'mixed' ? 'Mixed Arena' : 'Online Player',
            scoreDelta: outcome === 'win' ? 120 : outcome === 'draw' ? 40 : 10,
            xpEarned: outcome === 'win' ? 65 : outcome === 'draw' ? 30 : 15,
            coinsEarned: outcome === 'win' ? 35 : outcome === 'draw' ? 15 : 5,
            durationSec,
            summary: room.winnerSummary,
          });
        }
      }
      this.pushSystemChat(room, room.winnerSummary);
      this.broadcastRoom(room);
      this.broadcastPresenceAndRooms();
      return;
    }

    const nextTeam: 'X' | 'O' = team === 'X' ? 'O' : 'X';
    const nextTeamSeats = room.seats.filter((s) => s.team === nextTeam);
    if (nextTeamSeats.length > 0) {
      const prevCursor = nextTeam === 'X' ? room.tttState.xSeatCursor : room.tttState.oSeatCursor;
      const posInTeam = Math.max(0, nextTeamSeats.findIndex((s) => s.seatIndex === prevCursor));
      const nextSeat = nextTeamSeats[(posInTeam + 1) % nextTeamSeats.length];
      if (nextTeam === 'X') room.tttState.xSeatCursor = nextSeat.seatIndex;
      else room.tttState.oSeatCursor = nextSeat.seatIndex;
      room.tttState.activeSeatIndex = nextSeat.seatIndex;
    }
    room.tttState.currentTeam = nextTeam;
    this.broadcastRoom(room);
    this.maybeScheduleTttAi(room);
  }

  private handleRpsTimeout(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'active' || room.gameId !== 'rps') return;
    const moves: RpsMove[] = ['rock', 'paper', 'scissors'];
    for (const s of room.seats) {
      if (s.kind === 'human' && !s.hasPicked) {
        s.secretPick = moves[crypto.randomInt(0, 3)];
        s.hasPicked = true;
      }
    }
    this.resolveRpsRound(room);
  }

  private resolveRpsRound(room: InternalRoom) {
    if (!room.rpsState) return;
    this.clearRoomTimers(room);

    for (const s of room.seats) {
      if (s.kind === 'ai') {
        s.secretPick = chooseRpsAiMove(s.aiDifficulty || 'medium', []);
        s.hasPicked = true;
      }
      s.revealedPick = s.secretPick;
    }

    const roundGain = new Map<number, number>();
    for (const a of room.seats) {
      let pts = 0;
      for (const b of room.seats) {
        if (a.seatIndex === b.seatIndex || !a.secretPick || !b.secretPick) continue;
        if (resolveRpsOutcome(a.secretPick, b.secretPick) === 'win') pts += 1;
      }
      roundGain.set(a.seatIndex, pts);
      a.score += pts;
    }

    const topRound = Math.max(...Array.from(roundGain.values()), 0);
    const roundWinners = room.seats.filter((s) => (roundGain.get(s.seatIndex) || 0) === topRound && topRound > 0);
    const summary =
      roundWinners.length > 0
        ? `Round complete: ${roundWinners.map((w) => `${w.username} (${w.revealedPick})`).join(', ')} led!`
        : 'Round tied — everyone chose evenly!';

    const leaderScore = Math.max(...room.seats.map((s) => s.score));
    const reachedTarget = leaderScore >= room.rpsState.targetWins;

    if (reachedTarget) {
      room.status = 'finished';
      const winners = room.seats.filter((s) => s.score === leaderScore);
      room.rpsState.winnerSeatIndexes = winners.map((w) => w.seatIndex);
      room.rpsState.lastRoundSummary = summary;
      room.winnerSummary =
        winners.length === 1
          ? `${winners[0].username} wins the RPS Arena (${winners[0].score} pts)!`
          : `Tie at ${leaderScore} pts between ${winners.map((w) => w.username).join(' & ')}!`;

      const durationSec = Math.max(4, Math.round((Date.now() - room.startedAt) / 1000));
      for (const s of room.seats) {
        if (s.kind === 'human' && s.playerId) {
          const isWin = s.score === leaderScore;
          const outcome: 'win' | 'loss' | 'draw' =
            isWin && winners.length > 1 ? 'draw' : isWin ? 'win' : 'loss';
          recordMatchAndProgress({
            playerId: s.playerId,
            gameId: 'rps',
            mode: room.mode,
            difficulty: 'medium',
            outcome,
            opponentLabel: room.mode === 'mixed' ? 'Mixed RPS Arena' : 'Online Duelist',
            scoreDelta: outcome === 'win' ? 115 : outcome === 'draw' ? 45 : 15,
            xpEarned: outcome === 'win' ? 60 : outcome === 'draw' ? 30 : 15,
            coinsEarned: outcome === 'win' ? 32 : outcome === 'draw' ? 14 : 6,
            durationSec,
            summary: room.winnerSummary,
          });
        }
      }
      this.pushSystemChat(room, room.winnerSummary);
      this.broadcastRoom(room);
      this.broadcastPresenceAndRooms();
      return;
    }

    room.rpsState.lastRoundSummary = summary;
    room.rpsState.roundDeadlineAt = Date.now() + 3000;
    this.broadcastRoom(room);

    const nextTimer = setTimeout(() => {
      if (room.status !== 'active' || !room.rpsState) return;
      for (const s of room.seats) {
        s.hasPicked = false;
        s.secretPick = null;
        s.revealedPick = null;
      }
      room.rpsState.roundDeadlineAt = Date.now() + 18_000;
      room.rpsState.lastRoundSummary = 'Next round open — lock your move!';
      this.broadcastRoom(room);
      const t2 = setTimeout(() => this.handleRpsTimeout(room.id), 18_200);
      room.aiTimers.push(t2);
    }, 2600);
    room.aiTimers.push(nextTimer);
  }

  private stepGuessAiBots(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'active' || !room.guessState) return;
    const gs = room.guessState;

    const aiSeats = room.seats.filter((s) => s.kind === 'ai' && (s.guessCount || 0) < gs.maxAttempts);
    if (aiSeats.length === 0) return;
    const bot = aiSeats[crypto.randomInt(0, aiSeats.length)];
    const low = Math.max(gs.min, bot.aiLow ?? gs.min);
    const high = Math.min(gs.max, bot.aiHigh ?? gs.max);

    let guess: number;
    if (bot.aiDifficulty === 'hard') {
      guess = Math.floor((low + high) / 2);
    } else if (bot.aiDifficulty === 'medium') {
      const mid = Math.floor((low + high) / 2);
      const jitter = Math.max(1, Math.floor((high - low) * 0.2));
      guess = Math.max(low, Math.min(high, mid + crypto.randomInt(-jitter, jitter + 1)));
    } else {
      guess = crypto.randomInt(low, high + 1);
    }

    this.applyGuessAttempt(room, bot, guess);
  }

  private applyGuessAttempt(room: InternalRoom, seat: InternalSeat, guess: number) {
    if (!room.guessState || room.status !== 'active') return;
    const gs = room.guessState;
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
      this.clearRoomTimers(room);
      room.status = 'finished';
      room.winnerSummary = `${seat.username} (${seat.kind === 'ai' ? 'AI' : 'Human'}) cracked secret #${gs.secretNumber} in ${seat.guessCount} guesses!`;

      const durationSec = Math.max(4, Math.round((Date.now() - room.startedAt) / 1000));
      for (const s of room.seats) {
        if (s.kind === 'human' && s.playerId) {
          const outcome: 'win' | 'loss' = s.seatIndex === seat.seatIndex ? 'win' : 'loss';
          recordMatchAndProgress({
            playerId: s.playerId,
            gameId: 'guess_number',
            mode: room.mode,
            difficulty: gs.difficulty,
            outcome,
            opponentLabel: room.mode === 'mixed' ? 'Mixed Vault Race' : 'Online Vault Rival',
            scoreDelta: outcome === 'win' ? 145 : 15,
            xpEarned: outcome === 'win' ? 80 : 18,
            coinsEarned: outcome === 'win' ? 40 : 6,
            durationSec,
            summary: room.winnerSummary,
            attemptsUsed: s.guessCount || 10,
          });
        }
      }
      this.pushSystemChat(room, room.winnerSummary);
      this.broadcastRoom(room);
      this.broadcastPresenceAndRooms();
      return;
    }

    const clue: 'higher' | 'lower' = guess < gs.secretNumber ? 'higher' : 'lower';
    const diff = Math.abs(gs.secretNumber - guess);
    const span = gs.max - gs.min;
    const proximity = diff <= Math.max(2, span * 0.04) ? 'Scorching close' : diff <= span * 0.14 ? 'Warm' : 'Cold';

    seat.lastClue = clue;
    seat.lastProximity = proximity;

    for (const s of room.seats) {
      if (s.kind === 'ai') {
        if (clue === 'higher') s.aiLow = Math.max(s.aiLow ?? gs.min, guess + 1);
        else s.aiHigh = Math.min(s.aiHigh ?? gs.max, guess - 1);
      }
    }

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

    if (room.seats.every((s) => (s.guessCount || 0) >= gs.maxAttempts)) {
      this.handleGuessTimeout(room.id);
      return;
    }

    this.broadcastRoom(room);
  }

  private handleGuessTimeout(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'active' || !room.guessState) return;
    this.clearRoomTimers(room);
    room.status = 'finished';
    room.guessState.revealedSecret = room.guessState.secretNumber;
    room.winnerSummary = `Time expired — no one cracked secret #${room.guessState.secretNumber}.`;

    const durationSec = Math.max(5, Math.round((Date.now() - room.startedAt) / 1000));
    for (const s of room.seats) {
      if (s.kind === 'human' && s.playerId) {
        recordMatchAndProgress({
          playerId: s.playerId,
          gameId: 'guess_number',
          mode: room.mode,
          difficulty: room.guessState.difficulty,
          outcome: 'draw',
          opponentLabel: room.mode === 'mixed' ? 'Mixed Vault Race' : 'Online Vault Rival',
          scoreDelta: 20,
          xpEarned: 18,
          coinsEarned: 8,
          durationSec,
          summary: room.winnerSummary,
        });
      }
    }
    this.pushSystemChat(room, room.winnerSummary);
    this.broadcastRoom(room);
    this.broadcastPresenceAndRooms();
  }
}

export function attachRealtimeServer(httpServer: http.Server): RealtimeHub {
  return new RealtimeHub(httpServer);
}
