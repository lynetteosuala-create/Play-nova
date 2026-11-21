import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Clock,
  Copy,
  Cpu,
  Grid3X3,
  Hand,
  Link2,
  Loader2,
  LogOut,
  MessageSquare,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { MULTIPLAYER_GAME_IDS } from '../game/catalog.ts';
import {
  getLegalChessMoves,
  PIECE_UNICODE,
  type ChessGameState,
  type PromoKind,
} from '../game/chessEngine.ts';
import { C4_COLS, C4_ROWS, getC4DropRow, type C4Cell } from '../game/connectFour.ts';
import {
  MAX_BOARD_SIZE,
  MAX_WIN_TARGET,
  MIN_WIN_TARGET,
  normalizeTttConfig,
  recommendedBoardSize,
} from '../game/tttRules.ts';
import type {
  DifficultyLevel,
  GameId,
  MultiplayerGameId,
  PlayerProfile,
  RoomState,
} from '../types.ts';
import { soundFx } from '../utils/sound.ts';
import { wsClient, type RealtimeSnapshot } from '../utils/wsClient.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

interface MultiplayerSectionProps {
  player: PlayerProfile;
  defaultGame?: GameId;
  onRefreshProfile: () => void;
  onSwitchToSoloAi?: (gameId: GameId) => void;
}

const GAME_LABELS: Record<MultiplayerGameId, string> = {
  tictactoe: 'Tic-Tac-Toe',
  rps: 'Rock Paper Scissors',
  guess_number: 'Guess the Number',
  connect_four: 'Connect Four',
  chess: 'Chess',
};

function toMultiplayerGameId(id?: GameId): MultiplayerGameId {
  if (id && MULTIPLAYER_GAME_IDS.includes(id as MultiplayerGameId)) {
    return id as MultiplayerGameId;
  }
  return 'tictactoe';
}

export function MultiplayerSection({
  player,
  defaultGame = 'tictactoe',
  onRefreshProfile,
  onSwitchToSoloAi,
}: MultiplayerSectionProps) {
  const [rt, setRt] = useState<RealtimeSnapshot>(wsClient.getSnapshot());
  const [selectedGame, setSelectedGame] = useState<MultiplayerGameId>(() => toMultiplayerGameId(defaultGame));
  const [createMode, setCreateMode] = useState<'vs_human' | 'mixed'>('vs_human');
  const [isPrivate, setIsPrivate] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<DifficultyLevel>('medium');
  const [aiBotCount, setAiBotCount] = useState(1);
  const [tttWinTarget, setTttWinTarget] = useState(3);
  const [tttBoardAuto, setTttBoardAuto] = useState(true);
  const [tttCustomBoardSize, setTttCustomBoardSize] = useState(3);
  const [rpsTargetWins, setRpsTargetWins] = useState(3);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // Chess board UI selection
  const [chessFromSq, setChessFromSq] = useState<number | null>(null);
  const [chessPromo, setChessPromo] = useState<PromoKind>('Q');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const createTttCfg = normalizeTttConfig(tttWinTarget, tttBoardAuto ? 'auto' : tttCustomBoardSize);

  useEffect(() => {
    setSelectedGame(toMultiplayerGameId(defaultGame));
  }, [defaultGame]);

  useEffect(() => {
    const unsub = wsClient.subscribe((next) => {
      setRt(next);
    });
    return unsub;
  }, []);

  // Tick timer for active RPS / Guess deadlines
  useEffect(() => {
    if (!rt.currentRoom || rt.currentRoom.status !== 'active') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [rt.currentRoom]);

  // Refresh XP/coins/stats whenever a multiplayer room finishes
  const roomStatus = rt.currentRoom?.status;
  useEffect(() => {
    if (roomStatus === 'finished') {
      soundFx.playWin();
      onRefreshProfile();
    }
  }, [roomStatus, onRefreshProfile]);

  // Auto scroll chat feed
  const chatLen = rt.currentRoom?.chatMessages.length || 0;
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatLen]);

  // Clear stale chess selection on turn change
  const chessTurn = rt.currentRoom?.chessState?.turn;
  useEffect(() => {
    setChessFromSq(null);
  }, [chessTurn, roomStatus]);

  async function copyRoomInvite(room: RoomState) {
    const url = `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(true);
      soundFx.playClick();
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore
    }
  }

  function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = roomCodeInput.trim().toUpperCase();
    if (!clean) return;
    wsClient.clearError();
    wsClient.emit('room:join', { code: clean });
  }

  function handleGuessSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(guessInput);
    if (!Number.isInteger(num)) return;
    wsClient.emit('guess:submit', { guess: num });
    setGuessInput('');
    soundFx.playClick();
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    wsClient.sendChatMessage(trimmed);
    setChatInput('');
    soundFx.playClick();
  }

  const room = rt.currentRoom;
  const isHost = Boolean(room && room.hostPlayerId === player.id);
  const mySeat = room?.seats.find((s) => s.kind === 'human' && s.playerId === player.id);
  const otherOnlinePlayers = rt.onlinePlayers.filter((p) => p.playerId !== player.id);

  // Legal moves for selected chess piece if it's our turn
  const chessSnapshot: ChessGameState | null = useMemo(() => {
    if (!room?.chessState) return null;
    return {
      board: room.chessState.board,
      turn: room.chessState.turn,
      castling: room.chessState.castling,
      enPassant: room.chessState.enPassant,
      halfMoveClock: room.chessState.halfMoveClock,
      moveHistory: room.chessState.moveHistory,
      inCheck: room.chessState.inCheck,
      winnerTeam: room.chessState.winnerTeam,
      statusText: room.chessState.statusText,
      lastFrom: room.chessState.lastFrom,
      lastTo: room.chessState.lastTo,
    };
  }, [room?.chessState]);

  const legalMovesForSelected = useMemo(() => {
    if (!chessSnapshot || chessFromSq === null) return [];
    return getLegalChessMoves(chessSnapshot, chessFromSq);
  }, [chessSnapshot, chessFromSq]);

  const is1v1OnlyGame = selectedGame === 'connect_four' || selectedGame === 'chess';

  return (
    <div className="space-y-6">
      {/* Connection Status Header */}
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#38BDF8]">
            PLAYNOVA Real-Time WebSocket Arena
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
            Multiplayer & Mixed AI+Human Rooms
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {onSwitchToSoloAi && !room && (
            <button
              type="button"
              onClick={() => onSwitchToSoloAi(selectedGame)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#0E1324] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-[#8B5CF6] cursor-pointer"
            >
              <Cpu className="h-3.5 w-3.5 text-[#8B5CF6]" />
              Play Solo vs AI Instead
            </button>
          )}
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0E1324] px-3 py-2 text-xs font-mono">
            {rt.status === 'connected' ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">LIVE · {rt.onlinePlayers.length} ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-[#F97316]" />
                <span className="text-[#F97316] uppercase">{rt.status}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {rt.lastError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/35 px-4 py-3 text-xs text-rose-200">
          <span>{rt.lastError}</span>
          <button
            type="button"
            onClick={() => wsClient.clearError()}
            className="font-semibold text-rose-300 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {inviteNotice && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-200">
          {inviteNotice}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ACTIVE ROOM VIEW                                                      */}
      {/* ===================================================================== */}
      {room ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Game / Waiting Surface */}
          <div className="lg:col-span-8 space-y-5">
            <div className="rounded-2xl border border-white/[0.1] bg-[#0E1324] p-6 space-y-5">
              {/* Room Banner */}
              <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="text-[#8B5CF6] font-bold uppercase">{GAME_LABELS[room.gameId]}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-[#38BDF8] uppercase">
                      {room.mode === 'mixed' ? 'Mixed (AI + Humans)' : 'Human Multiplayer'}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-300">
                      CODE: <strong className="text-white">{room.code}</strong>
                    </span>
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-white">{room.title}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyRoomInvite(room)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#090D1A] px-3 py-2 text-xs font-semibold text-white hover:border-[#38BDF8] cursor-pointer"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode ? 'Invite Copied!' : 'Copy Invite Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => wsClient.emit('room:leave')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-950/25 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-950/50 cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Leave Room
                  </button>
                </div>
              </div>

              {/* WAITING ROOM CONTROLS & AGREED MATCH RULES */}
              {room.status === 'waiting' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-white/[0.08] bg-[#090D1A] p-5 space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-display text-base font-bold text-white">
                          Waiting for Participants ({room.seats.length}/{room.maxSeats} seats filled)
                        </h3>
                        <p className="text-xs text-slate-400">
                          Share Room Code <strong className="font-mono text-[#F97316]">{room.code}</strong> or invite an online player from the sidebar. Add AI bots anytime for a Mixed Match.
                        </p>
                      </div>
                      {isHost && (
                        <button
                          type="button"
                          disabled={room.seats.length < 2}
                          onClick={() => wsClient.emit('room:start')}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:opacity-50 cursor-pointer"
                        >
                          <Play className="h-4 w-4 fill-current" />
                          Start Match
                        </button>
                      )}
                    </div>

                    {/* Agreed Match Rules Banner + Live Host Adjustment */}
                    {(room.gameId === 'tictactoe' || room.gameId === 'rps') && (
                      <div className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Grid3X3 className="h-3.5 w-3.5 text-[#F97316]" />
                            Agreed Match Rules
                          </span>
                          <span className="font-mono text-xs font-bold text-[#38BDF8]">
                            {room.gameId === 'tictactoe'
                              ? `Board: ${room.tttBoardSize || 3}×${room.tttBoardSize || 3} · ${room.tttWinTarget || 3}-in-a-row`
                              : `First to ${room.rpsTargetWins || 3} Wins`}
                          </span>
                        </div>

                        {isHost && room.gameId === 'tictactoe' && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                            <span className="text-[11px] text-slate-400">Target in a row:</span>
                            {[3, 4, 5, 6, 7].map((k) => {
                              const cfg = normalizeTttConfig(k, 'auto');
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() =>
                                    wsClient.emit('room:update_settings', {
                                      tttWinTarget: cfg.winTarget,
                                      tttBoardSize: cfg.boardSize,
                                    })
                                  }
                                  className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-bold cursor-pointer ${
                                    (room.tttWinTarget || 3) === k
                                      ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                                      : 'border-white/[0.1] bg-[#090D1A] text-slate-300'
                                  }`}
                                >
                                  {k} ({cfg.boardSize}×{cfg.boardSize})
                                </button>
                              );
                            })}
                            <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                              Custom:
                              <input
                                type="number"
                                min={MIN_WIN_TARGET}
                                max={MAX_WIN_TARGET}
                                value={room.tttWinTarget || 3}
                                onChange={(e) => {
                                  const cfg = normalizeTttConfig(Number(e.target.value), 'auto');
                                  wsClient.emit('room:update_settings', {
                                    tttWinTarget: cfg.winTarget,
                                    tttBoardSize: cfg.boardSize,
                                  });
                                }}
                                className="w-12 rounded border border-white/[0.15] bg-[#090D1A] px-1.5 py-0.5 text-center font-mono text-xs text-white"
                              />
                            </label>
                            <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                              Grid:
                              <input
                                type="number"
                                min={room.tttWinTarget || 3}
                                max={MAX_BOARD_SIZE}
                                value={room.tttBoardSize || 3}
                                onChange={(e) => {
                                  const cfg = normalizeTttConfig(
                                    room.tttWinTarget || 3,
                                    Number(e.target.value)
                                  );
                                  wsClient.emit('room:update_settings', {
                                    tttWinTarget: cfg.winTarget,
                                    tttBoardSize: cfg.boardSize,
                                  });
                                }}
                                className="w-12 rounded border border-white/[0.15] bg-[#090D1A] px-1.5 py-0.5 text-center font-mono text-xs text-white"
                              />
                            </label>
                          </div>
                        )}

                        {isHost && room.gameId === 'rps' && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
                            <span className="text-[11px] text-slate-400">Wins Required:</span>
                            {[1, 3, 5, 7].map((w) => (
                              <button
                                key={w}
                                type="button"
                                onClick={() => wsClient.emit('room:update_settings', { rpsTargetWins: w })}
                                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-bold cursor-pointer ${
                                  (room.rpsTargetWins || 3) === w
                                    ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                                    : 'border-white/[0.1] bg-[#090D1A] text-slate-300'
                                }`}
                              >
                                First to {w}
                              </button>
                            ))}
                            <input
                              type="number"
                              min={1}
                              max={15}
                              value={room.rpsTargetWins || 3}
                              onChange={(e) =>
                                wsClient.emit('room:update_settings', {
                                  rpsTargetWins: Math.max(1, Math.min(15, Number(e.target.value) || 3)),
                                })
                              }
                              className="w-12 rounded border border-white/[0.15] bg-[#090D1A] px-1.5 py-0.5 text-center font-mono text-xs text-white"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {isHost && room.seats.length < room.maxSeats && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
                        <span className="text-xs font-medium text-slate-400">Add AI Bot to Seat:</span>
                        {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((diff) => (
                          <button
                            key={diff}
                            type="button"
                            onClick={() => wsClient.emit('room:add_ai', { difficulty: diff })}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#0E1324] px-3 py-1.5 text-xs font-semibold text-white capitalize hover:border-[#F97316] cursor-pointer"
                          >
                            <Plus className="h-3 w-3 text-[#F97316]" /> {diff} AI
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ACTIVE OR FINISHED TIC-TAC-TOE BOARD */}
              {room.gameId === 'tictactoe' && room.tttState && room.status !== 'waiting' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#090D1A] px-4 py-3 text-sm">
                    {room.status === 'finished' ? (
                      <span className="font-display font-bold text-emerald-400 flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-[#F97316]" />
                        {room.winnerSummary}
                      </span>
                    ) : (
                      <span className="text-slate-200">
                        Active Turn:{' '}
                        <strong className="text-white">
                          {room.seats[room.tttState.activeSeatIndex]?.username} (Team {room.tttState.currentTeam})
                        </strong>
                        {room.tttState.activeSeatIndex === mySeat?.seatIndex && (
                          <span className="ml-2 font-mono text-xs text-emerald-400">YOUR TURN</span>
                        )}
                      </span>
                    )}
                    <span className="font-mono text-xs text-[#38BDF8]">
                      {room.tttState.boardSize}×{room.tttState.boardSize} · {room.tttState.winTarget}-in-a-row
                    </span>
                  </div>

                  <div
                    style={{ gridTemplateColumns: `repeat(${room.tttState.boardSize}, minmax(0, 1fr))` }}
                    className={`mx-auto grid w-full ${
                      room.tttState.boardSize <= 3
                        ? 'max-w-xs gap-3'
                        : room.tttState.boardSize <= 5
                        ? 'max-w-md gap-2'
                        : room.tttState.boardSize <= 8
                        ? 'max-w-lg gap-1.5'
                        : 'max-w-xl gap-1'
                    }`}
                  >
                    {room.tttState.board.map((cell, idx) => {
                      const isWinCell = room.tttState?.winLine?.includes(idx);
                      const isMyTurn =
                        room.status === 'active' &&
                        mySeat &&
                        room.tttState?.activeSeatIndex === mySeat.seatIndex &&
                        cell === null;
                      const bSize = room.tttState?.boardSize || 3;
                      const cellTextClass =
                        bSize <= 3
                          ? 'rounded-xl text-4xl'
                          : bSize <= 5
                          ? 'rounded-lg text-2xl sm:text-3xl'
                          : bSize <= 8
                          ? 'rounded-lg text-lg sm:text-xl'
                          : bSize <= 11
                          ? 'rounded-md text-xs sm:text-base'
                          : 'rounded text-[10px] sm:text-xs';
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={!isMyTurn}
                          onClick={() => {
                            soundFx.playClick();
                            wsClient.emit('ttt:move', { cellIndex: idx });
                          }}
                          className={`flex aspect-square items-center justify-center border font-display font-bold transition ${cellTextClass} ${
                            isWinCell
                              ? 'border-emerald-400 bg-emerald-950/40 text-emerald-300'
                              : cell === 'X'
                              ? 'border-[#8B5CF6]/50 bg-[#090D1A] text-[#8B5CF6]'
                              : cell === 'O'
                              ? 'border-[#38BDF8]/50 bg-[#090D1A] text-[#38BDF8]'
                              : isMyTurn
                              ? 'border-white/[0.15] bg-[#090D1A] hover:border-[#8B5CF6] cursor-pointer'
                              : 'border-white/[0.06] bg-[#060811] cursor-default'
                          }`}
                        >
                          {cell}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ACTIVE OR FINISHED CONNECT FOUR BOARD */}
              {room.gameId === 'connect_four' && room.connectFourState && room.status !== 'waiting' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#090D1A] px-4 py-3 text-sm">
                    {room.status === 'finished' ? (
                      <span className="font-display font-bold text-emerald-400 flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-[#F97316]" />
                        {room.winnerSummary}
                      </span>
                    ) : (
                      <span className="text-slate-200">
                        Active Turn:{' '}
                        <strong className="text-white">
                          {room.seats[room.connectFourState.activeSeatIndex]?.username} (
                          {room.connectFourState.currentTeam === 'R' ? 'Orange Discs' : 'Blue Discs'})
                        </strong>
                        {room.connectFourState.activeSeatIndex === mySeat?.seatIndex && (
                          <span className="ml-2 font-mono text-xs text-emerald-400">YOUR TURN</span>
                        )}
                      </span>
                    )}
                    <span className="font-mono text-xs text-[#38BDF8]">7×6 Gravity Grid · Connect 4</span>
                  </div>

                  {/* Column drop selectors */}
                  <div className="mx-auto max-w-md space-y-2">
                    <div className="grid grid-cols-7 gap-2 px-3">
                      {Array.from({ length: C4_COLS }).map((_, col) => {
                        const isMyTurn =
                          room.status === 'active' &&
                          mySeat &&
                          room.connectFourState?.activeSeatIndex === mySeat.seatIndex &&
                          getC4DropRow(room.connectFourState.board as C4Cell[], col) >= 0;
                        return (
                          <button
                            key={col}
                            type="button"
                            disabled={!isMyTurn}
                            onClick={() => {
                              soundFx.playClick();
                              wsClient.dropConnectFour(col);
                            }}
                            className={`rounded-lg border py-1.5 font-mono text-xs font-bold transition ${
                              isMyTurn
                                ? 'border-[#38BDF8]/60 bg-[#38BDF8]/15 text-white hover:bg-[#38BDF8]/30 cursor-pointer'
                                : 'border-white/[0.06] bg-[#060811] text-slate-600 cursor-not-allowed'
                            }`}
                          >
                            ↓ {col + 1}
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl border border-[#38BDF8]/25 bg-[#0A1024] p-3">
                      <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: C4_ROWS * C4_COLS }).map((_, idx) => {
                          const cell = room.connectFourState!.board[idx];
                          const isWin = room.connectFourState!.winLine?.includes(idx);
                          const col = idx % C4_COLS;
                          const isMyTurn =
                            room.status === 'active' &&
                            mySeat &&
                            room.connectFourState?.activeSeatIndex === mySeat.seatIndex &&
                            getC4DropRow(room.connectFourState.board as C4Cell[], col) >= 0;
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={!isMyTurn}
                              onClick={() => {
                                if (!isMyTurn) return;
                                soundFx.playClick();
                                wsClient.dropConnectFour(col);
                              }}
                              aria-label={`Column ${col + 1}`}
                              className={`aspect-square rounded-full border-2 transition ${
                                cell === 'R'
                                  ? 'border-[#FDBA74] bg-[#F97316] shadow-[0_0_16px_rgba(249,115,22,0.5)]'
                                  : cell === 'Y'
                                  ? 'border-[#BAE6FD] bg-[#38BDF8] shadow-[0_0_16px_rgba(56,189,248,0.5)]'
                                  : 'border-white/[0.08] bg-[#060811]'
                              } ${isWin ? 'ring-2 ring-emerald-400 scale-105' : ''} ${
                                isMyTurn ? 'cursor-pointer hover:border-white/30' : 'cursor-default'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ACTIVE OR FINISHED CHESS BOARD */}
              {room.gameId === 'chess' && room.chessState && room.status !== 'waiting' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#090D1A] px-4 py-3 text-sm">
                    <span className="font-medium text-white flex items-center gap-2">
                      {room.status === 'finished' ? (
                        <>
                          <Trophy className="h-4 w-4 text-[#F97316]" />
                          <span className="text-emerald-400 font-bold">{room.winnerSummary}</span>
                        </>
                      ) : (
                        <>
                          <span>{room.chessState.statusText}</span>
                          {room.chessState.activeSeatIndex === mySeat?.seatIndex && (
                            <span className="font-mono text-xs font-bold text-emerald-400">· YOUR MOVE</span>
                          )}
                        </>
                      )}
                    </span>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Promote to:</span>
                      {(['Q', 'R', 'B', 'N'] as PromoKind[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setChessPromo(p)}
                          className={`rounded border px-2 py-0.5 font-mono font-bold cursor-pointer ${
                            chessPromo === p
                              ? 'border-[#8B5CF6] bg-[#8B5CF6]/25 text-white'
                              : 'border-white/[0.1] bg-[#0E1324] text-slate-400'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-12 items-start">
                    <div className="md:col-span-8">
                      <div className="mx-auto grid max-w-[440px] grid-cols-8 overflow-hidden rounded-xl border border-white/[0.15]">
                        {Array.from({ length: 64 }).map((_, displayIdx) => {
                          const flipBoard = mySeat?.team === 'B';
                          const sq = flipBoard ? 63 - displayIdx : displayIdx;
                          const row = Math.floor(sq / 8);
                          const col = sq % 8;
                          const isDark = (row + col) % 2 === 1;
                          const piece = room.chessState!.board[sq];
                          const isSelected = chessFromSq === sq;
                          const legalTarget = legalMovesForSelected.find((m) => m.to === sq);
                          const isLastMove = room.chessState!.lastFrom === sq || room.chessState!.lastTo === sq;
                          const isMyTurn =
                            room.status === 'active' &&
                            mySeat &&
                            room.chessState!.activeSeatIndex === mySeat.seatIndex;
                          const myColor = mySeat?.team === 'B' ? 'b' : 'w';

                          return (
                            <button
                              key={sq}
                              type="button"
                              onClick={() => {
                                if (!isMyTurn) return;
                                if (legalTarget && chessFromSq !== null) {
                                  soundFx.playSelect();
                                  wsClient.makeChessMove(chessFromSq, sq, legalTarget.promo ? chessPromo : undefined);
                                  setChessFromSq(null);
                                  return;
                                }
                                if (piece && piece[0] === myColor) {
                                  soundFx.playClick();
                                  setChessFromSq(sq === chessFromSq ? null : sq);
                                } else {
                                  setChessFromSq(null);
                                }
                              }}
                              className={`relative flex aspect-square items-center justify-center text-2xl sm:text-3xl transition ${
                                isSelected
                                  ? 'bg-[#8B5CF6]/55'
                                  : isLastMove
                                  ? 'bg-[#38BDF8]/25'
                                  : isDark
                                  ? 'bg-[#121933]'
                                  : 'bg-[#1D264A]'
                              } ${isMyTurn ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
                            >
                              {piece && (
                                <span
                                  className={
                                    piece[0] === 'w'
                                      ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'
                                      : 'text-[#FDBA74] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'
                                  }
                                >
                                  {PIECE_UNICODE[piece]}
                                </span>
                              )}
                              {legalTarget && (
                                <span
                                  className={`pointer-events-none absolute rounded-full ${
                                    piece
                                      ? 'inset-1 border-2 border-emerald-400'
                                      : 'h-3 w-3 bg-emerald-400/75'
                                  }`}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-4 rounded-xl border border-white/[0.08] bg-[#090D1A] p-4 space-y-2">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                        Notation Log ({room.chessState.moveHistory.length} moves)
                      </p>
                      <div className="max-h-64 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
                        {room.chessState.moveHistory.length === 0 ? (
                          <p className="text-slate-500">White opens the match.</p>
                        ) : (
                          room.chessState.moveHistory.map((mv, i) => (
                            <span key={`${mv}-${i}`} className="inline-block w-1/2 pr-2">
                              <span className="text-slate-500">{i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''}</span>{' '}
                              {mv}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ACTIVE OR FINISHED ROCK-PAPER-SCISSORS */}
              {room.gameId === 'rps' && room.rpsState && room.status !== 'waiting' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#090D1A] px-4 py-3 text-sm">
                    <span className="font-medium text-white">
                      {room.status === 'finished' ? room.winnerSummary : room.rpsState.lastRoundSummary}
                    </span>
                    {room.status === 'active' && room.rpsState.roundDeadlineAt && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-[#F97316] tabular-nums">
                        <Clock className="h-3.5 w-3.5" />
                        {Math.max(0, Math.ceil((room.rpsState.roundDeadlineAt - nowMs) / 1000))}s
                      </span>
                    )}
                  </div>

                  {room.status === 'active' && mySeat && (
                    <div className="grid grid-cols-3 gap-3">
                      {(
                        [
                          { id: 'rock', label: 'Rock', icon: Shield },
                          { id: 'paper', label: 'Paper', icon: Hand },
                          { id: 'scissors', label: 'Scissors', icon: Scissors },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          disabled={Boolean(mySeat.hasPicked)}
                          onClick={() => {
                            soundFx.playSelect();
                            wsClient.emit('rps:pick', { move: m.id });
                          }}
                          className={`flex flex-col items-center gap-2 rounded-xl border p-5 transition ${
                            mySeat.hasPicked
                              ? 'border-white/[0.06] bg-[#060811] opacity-60 cursor-not-allowed'
                              : 'border-white/[0.12] bg-[#090D1A] hover:border-[#8B5CF6] cursor-pointer'
                          }`}
                        >
                          <m.icon className="h-8 w-8 text-[#F97316]" />
                          <span className="font-display text-sm font-bold text-white">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {room.seats.map((s) => (
                      <div
                        key={s.seatIndex}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#090D1A] p-3.5 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-white">
                            {s.username}{' '}
                            <span className="font-mono text-[10px] text-slate-400">
                              ({s.kind === 'ai' ? 'AI BOT' : 'HUMAN'})
                            </span>
                          </p>
                          <p className="mt-0.5 font-mono text-[#38BDF8]">
                            Score: {s.score} / {room.rpsState?.targetWins}
                          </p>
                        </div>
                        <span className="font-mono uppercase text-emerald-400">
                          {s.revealedPick ? s.revealedPick : s.hasPicked ? 'Locked' : 'Choosing...'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ACTIVE OR FINISHED GUESS THE NUMBER RACE */}
              {room.gameId === 'guess_number' && room.guessState && room.status !== 'waiting' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#090D1A] px-4 py-3 text-sm">
                    <span className="font-medium text-white">
                      {room.status === 'finished'
                        ? room.winnerSummary
                        : `Secret Vault Range: ${room.guessState.min}–${room.guessState.max} · First to crack wins!`}
                    </span>
                    {room.status === 'active' && room.guessState.deadlineAt && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-[#F97316] tabular-nums">
                        <Clock className="h-3.5 w-3.5" />
                        {Math.max(0, Math.ceil((room.guessState.deadlineAt - nowMs) / 1000))}s
                      </span>
                    )}
                  </div>

                  {room.status === 'active' && mySeat && (
                    <form onSubmit={handleGuessSubmit} className="flex flex-col gap-3 sm:flex-row">
                      <input
                        type="number"
                        min={room.guessState.min}
                        max={room.guessState.max}
                        value={guessInput}
                        onChange={(e) => setGuessInput(e.target.value)}
                        placeholder={`Enter ${room.guessState.min}–${room.guessState.max} (${room.guessState.maxAttempts - (mySeat.guessCount || 0)} left)`}
                        className="flex-1 rounded-xl border border-white/[0.12] bg-[#060811] px-4 py-2.5 text-sm text-white focus:border-[#38BDF8] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#38BDF8] px-5 py-2.5 text-sm font-bold text-[#060811] hover:bg-[#0EA5E9] cursor-pointer"
                      >
                        <Send className="h-4 w-4" /> Submit Guess
                      </button>
                    </form>
                  )}

                  <div className="rounded-xl border border-white/[0.08] bg-[#090D1A] p-4 space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      Live Deduction Feed
                    </p>
                    {room.guessState.feed.length === 0 ? (
                      <p className="text-xs text-slate-500">Waiting for the opening guess...</p>
                    ) : (
                      room.guessState.feed.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-lg bg-[#0E1324] px-3 py-2 text-xs"
                        >
                          <span className="text-slate-200">
                            <strong>{entry.username}</strong>{' '}
                            <span className="font-mono text-[10px] text-slate-400">
                              [{entry.kind.toUpperCase()}]
                            </span>{' '}
                            guessed <strong className="font-mono text-white">{entry.guess}</strong>
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 font-mono font-semibold ${
                              entry.clue === 'correct'
                                ? 'text-emerald-400'
                                : entry.clue === 'higher'
                                ? 'text-[#F97316]'
                                : 'text-[#38BDF8]'
                            }`}
                          >
                            {entry.clue === 'higher' && <ArrowUp className="h-3 w-3" />}
                            {entry.clue === 'lower' && <ArrowDown className="h-3 w-3" />}
                            {entry.clue.toUpperCase()}
                            {entry.proximity ? ` · ${entry.proximity}` : ''}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {room.status === 'finished' && isHost && (
                <div className="flex justify-end border-t border-white/[0.08] pt-4">
                  <button
                    type="button"
                    onClick={() => wsClient.emit('room:rematch')}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" /> Play Rematch
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Room Sidebar: Seats, Live Chat & Online Invite Roster */}
          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-white">
                Seated Participants ({room.seats.length}/{room.maxSeats})
              </h3>
              <div className="space-y-2.5">
                {room.seats.map((seat) => (
                  <div
                    key={seat.seatIndex}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#090D1A] p-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar
                        username={seat.username}
                        profilePictureUrl={seat.profilePictureUrl}
                        activeFrame={seat.activeFrame}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {seat.username}
                          {seat.team ? ` · Team ${seat.team}` : ''}
                        </p>
                        <p
                          className={`font-mono text-[10px] uppercase ${
                            seat.kind === 'ai'
                              ? 'text-[#F97316]'
                              : seat.connectionStatus === 'online'
                              ? 'text-emerald-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {seat.kind === 'ai'
                            ? `AI BOT (${seat.aiDifficulty || 'medium'})`
                            : seat.connectionStatus === 'online'
                            ? 'HUMAN · ONLINE'
                            : 'RECONNECTING...'}
                        </p>
                      </div>
                    </div>

                    {isHost && room.status === 'waiting' && seat.kind === 'ai' && (
                      <button
                        type="button"
                        onClick={() => wsClient.emit('room:remove_seat', { seatIndex: seat.seatIndex })}
                        title="Remove AI Bot"
                        className="text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Live In-Room Chat */}
            <div className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#38BDF8]" />
                  Live Room Chat
                </h3>
                <span className="font-mono text-[10px] text-slate-400">{room.chatMessages.length} msgs</span>
              </div>
              <div
                ref={chatScrollRef}
                className="h-44 overflow-y-auto rounded-lg border border-white/[0.06] bg-[#090D1A] p-3 space-y-2 text-xs"
              >
                {room.chatMessages.length === 0 ? (
                  <p className="text-slate-500">Say hello to opponents in this room.</p>
                ) : (
                  room.chatMessages.map((m) => (
                    <div key={m.id} className="leading-snug">
                      {m.kind === 'system' ? (
                        <p className="font-mono text-[11px] text-[#38BDF8]">[ARENA] {m.text}</p>
                      ) : (
                        <p className="text-slate-200">
                          <strong className="text-white">{m.username}:</strong> {m.text}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  type="text"
                  maxLength={220}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-lg border border-white/[0.1] bg-[#060811] px-3 py-1.5 text-xs text-white focus:border-[#38BDF8] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

            {room.status === 'waiting' && (
              <div className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
                <h3 className="font-display text-base font-bold text-white">
                  Invite Online Players ({otherOnlinePlayers.length})
                </h3>
                {otherOnlinePlayers.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No other human players are currently in the lobby. Share your Room Code{' '}
                    <strong className="font-mono text-[#F97316]">{room.code}</strong> or add an AI bot to play a Mixed Match.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {otherOnlinePlayers.map((op) => (
                      <div
                        key={op.playerId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#090D1A] px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">{op.username}</p>
                          <p className="font-mono text-[10px] uppercase text-slate-400">{op.status}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            wsClient.emit('invite:send', { targetPlayerId: op.playerId });
                            setInviteNotice(`Invitation sent to ${op.username}!`);
                            window.setTimeout(() => setInviteNotice(null), 2500);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-[#8B5CF6] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                        >
                          <UserPlus className="h-3 w-3" /> Invite
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===================================================================== */
        /* MATCHMAKING, ROOM CREATION, JOIN CODE & ONLINE PLAYERS DIRECTORY      */
        /* ===================================================================== */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Choose Game & Match Format</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Play real-time 1v1 against human players across 5 flagship arenas or launch Mixed Matches blending Humans and AI opponents.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {MULTIPLAYER_GAME_IDS.map((gId) => (
                  <button
                    key={gId}
                    type="button"
                    onClick={() => setSelectedGame(gId)}
                    className={`rounded-xl border px-3.5 py-3 text-left text-xs font-semibold transition cursor-pointer ${
                      selectedGame === gId
                        ? 'border-[#8B5CF6] bg-[#8B5CF6]/15 text-white'
                        : 'border-white/[0.08] bg-[#090D1A] text-slate-400 hover:text-white'
                    }`}
                  >
                    {GAME_LABELS[gId]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCreateMode('vs_human')}
                  className={`rounded-xl border p-4 text-left transition cursor-pointer ${
                    createMode === 'vs_human'
                      ? 'border-emerald-500 bg-emerald-950/25'
                      : 'border-white/[0.08] bg-[#090D1A]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Users className="h-4 w-4 text-emerald-400" /> Human vs Human
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Online matchmaking or private invite room strictly for real human players.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode('mixed')}
                  className={`rounded-xl border p-4 text-left transition cursor-pointer ${
                    createMode === 'mixed'
                      ? 'border-[#F97316] bg-[#F97316]/15'
                      : 'border-white/[0.08] bg-[#090D1A]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Bot className="h-4 w-4 text-[#F97316]" /> Mixed (Humans + AI)
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {is1v1OnlyGame
                      ? '1v1 arena paired with a clearly labeled AI challenger bot.'
                      : '2–4 seat arena blending online human friends with intelligent AI bots.'}
                  </p>
                </button>
              </div>

              {createMode === 'mixed' && (
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.08] bg-[#090D1A] p-4 sm:grid-cols-2">
                  <label className="text-xs text-slate-300">
                    AI Bot Difficulty
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value as DifficultyLevel)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#0E1324] px-3 py-2 text-white"
                    >
                      <option value="easy">Easy AI</option>
                      <option value="medium">Medium AI</option>
                      <option value="hard">Hard AI</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-300">
                    Starting AI Bots
                    <select
                      value={is1v1OnlyGame ? 1 : aiBotCount}
                      disabled={is1v1OnlyGame}
                      onChange={(e) => setAiBotCount(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#0E1324] px-3 py-2 text-white disabled:opacity-60"
                    >
                      <option value={1}>1 AI Bot</option>
                      {!is1v1OnlyGame && <option value={2}>2 AI Bots</option>}
                      {!is1v1OnlyGame && <option value={3}>3 AI Bots</option>}
                    </select>
                  </label>
                </div>
              )}

              {selectedGame === 'tictactoe' && (
                <div className="rounded-xl border border-white/[0.08] bg-[#090D1A] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">Tic-Tac-Toe Winning Rules</span>
                    <span className="font-mono text-xs font-bold text-[#38BDF8]">
                      {createTttCfg.boardSize}×{createTttCfg.boardSize} Grid · {createTttCfg.winTarget}-in-a-row
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[3, 4, 5, 6, 7].map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setTttWinTarget(k);
                          if (tttBoardAuto) setTttCustomBoardSize(recommendedBoardSize(k));
                          else if (tttCustomBoardSize < k) setTttCustomBoardSize(recommendedBoardSize(k));
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold cursor-pointer ${
                          tttWinTarget === k
                            ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                            : 'border-white/[0.1] bg-[#0E1324] text-slate-300'
                        }`}
                      >
                        {k} in a row
                      </button>
                    ))}
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                      Custom Target:
                      <input
                        type="number"
                        min={MIN_WIN_TARGET}
                        max={MAX_WIN_TARGET}
                        value={tttWinTarget}
                        onChange={(e) => {
                          const v = Math.max(MIN_WIN_TARGET, Math.min(MAX_WIN_TARGET, Number(e.target.value) || 3));
                          setTttWinTarget(v);
                          if (tttBoardAuto || tttCustomBoardSize < v) {
                            setTttCustomBoardSize(recommendedBoardSize(v));
                          }
                        }}
                        className="w-14 rounded-lg border border-white/[0.15] bg-[#0E1324] px-2 py-1 text-center font-mono text-xs text-white"
                      />
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={!tttBoardAuto}
                        onChange={(e) => {
                          const custom = e.target.checked;
                          setTttBoardAuto(!custom);
                          if (custom) setTttCustomBoardSize(recommendedBoardSize(tttWinTarget));
                        }}
                        className="accent-[#F97316]"
                      />
                      Custom Grid:
                    </label>
                    {!tttBoardAuto && (
                      <input
                        type="number"
                        min={tttWinTarget}
                        max={MAX_BOARD_SIZE}
                        value={Math.max(tttWinTarget, tttCustomBoardSize)}
                        onChange={(e) => setTttCustomBoardSize(Number(e.target.value) || tttWinTarget)}
                        className="w-14 rounded-lg border border-white/[0.15] bg-[#0E1324] px-2 py-1 text-center font-mono text-xs text-white"
                      />
                    )}
                  </div>
                </div>
              )}

              {selectedGame === 'rps' && (
                <div className="rounded-xl border border-white/[0.08] bg-[#090D1A] p-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-white">Wins Required to Finish Match</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 3, 5, 7].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setRpsTargetWins(w)}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                          rpsTargetWins === w
                            ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                            : 'border-white/[0.1] bg-[#0E1324] text-slate-300'
                        }`}
                      >
                        First to {w}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={rpsTargetWins}
                      onChange={(e) => setRpsTargetWins(Math.max(1, Math.min(15, Number(e.target.value) || 3)))}
                      className="w-14 rounded-lg border border-white/[0.15] bg-[#0E1324] px-2 py-1 text-center font-mono text-xs text-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="accent-[#8B5CF6]"
                  />
                  Private Room (Invite / Room Code Only)
                </label>

                <div className="flex flex-wrap gap-2.5">
                  {rt.queueState.queued ? (
                    <button
                      type="button"
                      onClick={() => wsClient.emit('queue:leave')}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#F97316]/40 bg-[#F97316]/15 px-4 py-2.5 text-xs font-semibold text-orange-200 cursor-pointer"
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Searching for Human Opponent... (Cancel)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        wsClient.emit('queue:join', { gameId: selectedGame, mode: createMode })
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-white/[0.15] bg-[#090D1A] px-4 py-2.5 text-xs font-semibold text-white hover:border-emerald-500 cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                      Find Online Match
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      wsClient.emit('room:create', {
                        gameId: selectedGame,
                        mode: createMode,
                        isPrivate,
                        aiDifficulty,
                        aiCount: is1v1OnlyGame ? 1 : aiBotCount,
                        tttWinTarget: createTttCfg.winTarget,
                        tttBoardSize: createTttCfg.boardSize,
                        rpsTargetWins,
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Multiplayer Room
                  </button>
                </div>
              </div>
            </div>

            {/* Join by Room Code */}
            <form
              onSubmit={handleJoinByCode}
              className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-5 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                <p className="text-xs font-semibold text-white">Have a Private Room Code?</p>
                <p className="text-[11px] text-slate-400">Enter a 6-character code shared by a friend.</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={8}
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="A7K9P2"
                  className="w-36 rounded-lg border border-white/[0.12] bg-[#060811] px-3 py-2 text-center font-mono text-sm uppercase tracking-widest text-white focus:border-[#8B5CF6] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-xs font-bold text-[#060811] hover:bg-[#EA580C] cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5" /> Join Code
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Open Public Rooms & Online Human Players */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="font-display text-base font-bold text-white">Open Public Rooms</h3>
                <span className="font-mono text-xs text-slate-400">{rt.publicRooms.length} open</span>
              </div>
              {rt.publicRooms.length === 0 ? (
                <p className="py-5 text-center text-xs text-slate-400">
                  No open public rooms right now. Create a room on the left to host a match!
                </p>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto">
                  {rt.publicRooms.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#090D1A] p-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{r.title}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                          {GAME_LABELS[r.gameId]} ·{' '}
                          {r.gameId === 'tictactoe'
                            ? `${r.tttBoardSize || 3}×${r.tttBoardSize || 3} (${r.tttWinTarget || 3}-in-row) · `
                            : r.gameId === 'rps'
                            ? `First to ${r.rpsTargetWins || 3} · `
                            : ''}
                          {r.humanCount}H + {r.aiCount}AI / {r.maxSeats} · {r.code}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={r.status !== 'waiting'}
                        onClick={() => wsClient.emit('room:join', { roomId: r.id })}
                        className="rounded-lg bg-[#8B5CF6] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7C3AED] disabled:opacity-40 cursor-pointer"
                      >
                        {r.status === 'waiting' ? 'Join' : 'In Play'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="font-display text-base font-bold text-white">Online Human Players</h3>
                <span className="font-mono text-xs text-emerald-400">{rt.onlinePlayers.length} active</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {rt.onlinePlayers.map((p) => (
                  <div
                    key={p.playerId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#090D1A] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar
                        username={p.username}
                        profilePictureUrl={p.profilePictureUrl}
                        activeFrame={p.activeFrame}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {p.username}
                          {p.playerId === player.id ? ' (You)' : ''}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400">LVL {p.level}</p>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] uppercase text-emerald-400">
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
