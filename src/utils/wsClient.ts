import type {
  GameId,
  OnlinePlayerSummary,
  RoomState,
} from '../types.ts';
import type { PromoKind } from '../game/chessEngine.ts';
import { getStoredPlayerToken } from './api.ts';

export type WsConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface RealtimeSnapshot {
  status: WsConnectionStatus;
  onlinePlayers: OnlinePlayerSummary[];
  currentRoom: RoomState | null;
  queueState: { queued: boolean; gameId?: GameId; position?: number };
  lastError: string | null;
}

type Listener = (snapshot: RealtimeSnapshot) => void;

class PlaynovaWsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private activeToken: string | null = null;
  private shouldStayConnected = false;
  private pendingEmits: Array<{ event: string; payload: Record<string, unknown> }> = [];
  private listeners = new Set<Listener>();

  private state: RealtimeSnapshot = {
    status: 'disconnected',
    onlinePlayers: [],
    currentRoom: null,
    queueState: { queued: false },
    lastError: null,
  };

  public getSnapshot(): RealtimeSnapshot {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<RealtimeSnapshot>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  public clearError() {
    if (this.state.lastError) this.update({ lastError: null });
  }

  public connect(explicitToken?: string | null) {
    const token = explicitToken || getStoredPlayerToken();
    if (!token) return;
    if (
      this.ws &&
      this.activeToken === token &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.activeToken = token;
    this.shouldStayConnected = true;
    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.update({ status: this.state.status === 'reconnecting' ? 'reconnecting' : 'connecting' });
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(wsUrl);
    this.ws = socket;

    socket.onopen = () => {
      this.update({ status: 'connected', lastError: null });
      const queued = this.pendingEmits.splice(0);
      for (const item of queued) {
        socket.send(JSON.stringify(item));
      }
      this.pingTimer = window.setInterval(() => {
        this.emit('ping');
      }, 20_000);
    };

    socket.onmessage = (evt) => {
      let msg: { event?: string; payload?: Record<string, unknown> } = {};
      try {
        msg = JSON.parse(String(evt.data || '{}')) as { event?: string; payload?: Record<string, unknown> };
      } catch {
        return;
      }
      const p = msg.payload || {};
      switch (msg.event) {
        case 'ws:ready':
          if (p.rejoinedRoom) {
            this.update({ currentRoom: p.rejoinedRoom as RoomState });
          }
          break;
        case 'presence:list':
          this.update({ onlinePlayers: (p.players as OnlinePlayerSummary[]) || [] });
          break;
        case 'room:state':
          this.update({
            currentRoom: p.room as RoomState,
            queueState: { queued: false },
            lastError: null,
          });
          break;
        case 'room:left':
          this.update({ currentRoom: null });
          break;
        case 'room:error':
          this.update({ lastError: String(p.error || 'Match action failed.') });
          break;
        case 'queue:status':
          this.update({
            queueState: {
              queued: Boolean(p.queued),
              gameId: p.gameId as GameId | undefined,
              position: p.position as number | undefined,
            },
          });
          break;
      }
    };

    socket.onclose = (evt) => {
      this.clearTimers();
      this.ws = null;
      if (!this.shouldStayConnected || evt.code === 4001) {
        this.update({ status: 'disconnected' });
        return;
      }
      this.update({ status: 'reconnecting' });
      this.reconnectTimer = window.setTimeout(() => {
        if (this.shouldStayConnected) this.connect(this.activeToken);
      }, 1500);
    };
  }

  public disconnect() {
    this.shouldStayConnected = false;
    this.activeToken = null;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.update({
      status: 'disconnected',
      onlinePlayers: [],
      currentRoom: null,
      queueState: { queued: false },
      lastError: null,
    });
  }

  private clearTimers() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public emit(event: string, payload: Record<string, unknown> = {}) {
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.CONNECTING) {
      this.pendingEmits.push({ event, payload });
      return;
    }
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ event, payload }));
  }

  public findMatch(
    gameId: GameId,
    options: { tttWinTarget?: number; tttBoardSize?: number; rpsTargetWins?: number } = {}
  ) {
    this.emit('matchmaking:find', { gameId, ...options });
  }

  public cancelMatchmaking() {
    this.emit('matchmaking:cancel');
    this.update({ queueState: { queued: false } });
  }

  public leaveMatch() {
    this.emit('match:leave');
    this.update({ currentRoom: null });
  }

  public rematch() {
    this.emit('match:rematch');
  }

  public sendChatMessage(text: string) {
    this.emit('chat:send', { text });
  }

  public dropConnectFour(col: number) {
    this.emit('c4:drop', { col });
  }

  public dropConnectFive(col: number, popOut = false) {
    this.emit('c5:drop', { col, popOut });
  }

  public makeChessMove(from: number, to: number, promo?: PromoKind) {
    this.emit('chess:move', { from, to, promo });
  }

  public submitDuelProgress(payload: {
    score: number;
    progress: number;
    maxProgress: number;
    finished?: boolean;
    summary?: string;
  }) {
    this.emit('duel:progress', payload);
  }
}

export const wsClient = new PlaynovaWsClient();
