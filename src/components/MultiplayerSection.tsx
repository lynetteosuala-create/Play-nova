import React, { useEffect, useState } from 'react';
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
import {
  MAX_BOARD_SIZE,
  MAX_WIN_TARGET,
  MIN_WIN_TARGET,
  normalizeTttConfig,
  recommendedBoardSize,
} from '../game/tttRules.ts';
import type { DifficultyLevel, GameId, PlayerProfile, RoomState } from '../types.ts';
import { soundFx } from '../utils/sound.ts';
import { wsClient, type RealtimeSnapshot } from '../utils/wsClient.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

interface MultiplayerSectionProps {
  player: PlayerProfile;
  defaultGame?: GameId;
  onRefreshProfile: () => void;
  onSwitchToSoloAi?: (gameId: GameId) => void;
}

const GAME_LABELS: Record<GameId, string> = {
  tictactoe: 'Tic-Tac-Toe',
  rps: 'Rock-Paper-Scissors',
  guess_number: 'Guess the Number',
};

export function MultiplayerSection({
  player,
  defaultGame = 'tictactoe',
  onRefreshProfile,
  onSwitchToSoloAi,
}: MultiplayerSectionProps) {
  const [rt, setRt] = useState<RealtimeSnapshot>(wsClient.getSnapshot());
  const [selectedGame, setSelectedGame] = useState<GameId>(defaultGame);
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
  const [copiedCode, setCopiedCode] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const createTttCfg = normalizeTttConfig(tttWinTarget, tttBoardAuto ? 'auto' : tttCustomBoardSize);

  useEffect(() => {
    setSelectedGame(defaultGame);
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

  const room = rt.currentRoom;
  const isHost = Boolean(room && room.hostPlayerId === player.id);
  const mySeat = room?.seats.find((s) => s.kind === 'human' && s.playerId === player.id);
  const otherOnlinePlayers = rt.onlinePlayers.filter((p) => p.playerId !== player.id);

  return (
    <div className="space-y-6">
      {/* Connection Status Header */}
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-emerald-400">
            Real-Time WebSocket Arena
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#10141F] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-[#E11D48] cursor-pointer"
            >
              <Cpu className="h-3.5 w-3.5 text-[#E11D48]" />
              Play Solo vs AI Instead
            </button>
          )}
          <div className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#10141F] px-3 py-2 text-xs font-mono">
            {rt.status === 'connected' ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">LIVE · {rt.onlinePlayers.length} ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-300 uppercase">{rt.status}</span>
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
            <div className="rounded-2xl border border-white/[0.1] bg-[#10141F] p-6 space-y-5">
              {/* Room Banner */}
              <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="text-[#E11D48] font-bold uppercase">{GAME_LABELS[room.gameId]}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-[#F59E0B] uppercase">
                      {room.mode === 'mixed' ? 'Mixed (AI + Humans)' : 'Human Multiplayer'}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-300">CODE: <strong className="text-white">{room.code}</strong></span>
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-white">{room.title}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyRoomInvite(room)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#0B0E17] px-3 py-2 text-xs font-semibold text-white hover:border-[#F59E0B] cursor-pointer"
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
                  <div className="rounded-xl border border-white/[0.08] bg-[#0B0E17] p-5 space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-display text-base font-bold text-white">
                          Waiting for Participants ({room.seats.length}/{room.maxSeats} seats filled)
                        </h3>
                        <p className="text-xs text-slate-400">
                          Share Room Code <strong className="font-mono text-[#F59E0B]">{room.code}</strong> or invite an online player from the sidebar. Add AI opponents anytime for a Mixed Match!
                        </p>
                      </div>
                      {isHost && (
                        <button
                          type="button"
                          disabled={room.seats.length < 2}
                          onClick={() => wsClient.emit('room:start')}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#BE123C] disabled:opacity-50 cursor-pointer"
                        >
                          <Play className="h-4 w-4 fill-current" />
                          Start Match
                        </button>
                      )}
                    </div>

                    {/* Agreed Match Rules Banner + Live Host Adjustment */}
                    {(room.gameId === 'tictactoe' || room.gameId === 'rps') && (
                      <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <Grid3X3 className="h-3.5 w-3.5 text-[#F59E0B]" />
                            Agreed Match Rules
                          </span>
                          <span className="font-mono text-xs font-bold text-[#F59E0B]">
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
                                      ? 'border-[#E11D48] bg-[#E11D48]/20 text-white'
                                      : 'border-white/[0.1] bg-[#0B0E17] text-slate-300'
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
                                className="w-12 rounded border border-white/[0.15] bg-[#0B0E17] px-1.5 py-0.5 text-center font-mono text-xs text-white"
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
                                className="w-12 rounded border border-white/[0.15] bg-[#0B0E17] px-1.5 py-0.5 text-center font-mono text-xs text-white"
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
                                    ? 'border-[#E11D48] bg-[#E11D48]/20 text-white'
                                    : 'border-white/[0.1] bg-[#0B0E17] text-slate-300'
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
                              className="w-12 rounded border border-white/[0.15] bg-[#0B0E17] px-1.5 py-0.5 text-center font-mono text-xs text-white"
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
                            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#10141F] px-3 py-1.5 text-xs font-semibold text-white capitalize hover:border-[#F59E0B] cursor-pointer"
                          >
                            <Plus className="h-3 w-3 text-[#F59E0B]" /> {diff} AI
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ACTIVE OR FINISHED TIC-TAC-TOE BOARD (Dynamic N×N) */}
              {room.gameId === 'tictactoe' && room.tttState && room.status !== 'waiting' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#0B0E17] px-4 py-3 text-sm">
                    {room.status === 'finished' ? (
                      <span className="font-display font-bold text-emerald-400 flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-[#F59E0B]" />
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
                    <span className="font-mono text-xs text-[#F59E0B]">
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
                              ? 'border-[#E11D48]/40 bg-[#0B0E17] text-[#E11D48]'
                              : cell === 'O'
                              ? 'border-[#F59E0B]/40 bg-[#0B0E17] text-[#F59E0B]'
                              : isMyTurn
                              ? 'border-white/[0.15] bg-[#0B0E17] hover:border-[#E11D48] cursor-pointer'
                              : 'border-white/[0.06] bg-[#07090F] cursor-default'
                          }`}
                        >
                          {cell}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ACTIVE OR FINISHED ROCK-PAPER-SCISSORS */}
              {room.gameId === 'rps' && room.rpsState && room.status !== 'waiting' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#0B0E17] px-4 py-3 text-sm">
                    <span className="font-medium text-white">
                      {room.status === 'finished' ? room.winnerSummary : room.rpsState.lastRoundSummary}
                    </span>
                    {room.status === 'active' && room.rpsState.roundDeadlineAt && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-[#F59E0B] tabular-nums">
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
                              ? 'border-white/[0.06] bg-[#07090F] opacity-60 cursor-not-allowed'
                              : 'border-white/[0.12] bg-[#0B0E17] hover:border-[#E11D48] cursor-pointer'
                          }`}
                        >
                          <m.icon className="h-8 w-8 text-[#F59E0B]" />
                          <span className="font-display text-sm font-bold text-white">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {room.seats.map((s) => (
                      <div
                        key={s.seatIndex}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#0B0E17] p-3.5 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-white">
                            {s.username}{' '}
                            <span className="font-mono text-[10px] text-slate-400">
                              ({s.kind === 'ai' ? 'AI' : 'HUMAN'})
                            </span>
                          </p>
                          <p className="mt-0.5 font-mono text-[#F59E0B]">Score: {s.score} / {room.rpsState?.targetWins}</p>
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
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#0B0E17] px-4 py-3 text-sm">
                    <span className="font-medium text-white">
                      {room.status === 'finished'
                        ? room.winnerSummary
                        : `Secret Vault Range: ${room.guessState.min}–${room.guessState.max} · First to crack wins!`}
                    </span>
                    {room.status === 'active' && room.guessState.deadlineAt && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-[#F59E0B] tabular-nums">
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
                        className="flex-1 rounded-xl border border-white/[0.12] bg-[#07090F] px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                      >
                        <Send className="h-4 w-4" /> Submit Guess
                      </button>
                    </form>
                  )}

                  <div className="rounded-xl border border-white/[0.08] bg-[#0B0E17] p-4 space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
                      Live Deduction Feed
                    </p>
                    {room.guessState.feed.length === 0 ? (
                      <p className="text-xs text-slate-500">Waiting for the opening guess...</p>
                    ) : (
                      room.guessState.feed.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded-lg bg-[#10141F] px-3 py-2 text-xs"
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
                                ? 'text-amber-400'
                                : 'text-sky-400'
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
                    className="inline-flex items-center gap-2 rounded-xl bg-[#E11D48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" /> Play Rematch
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Room Sidebar: Seats & Online Invite Roster */}
          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-5 space-y-3">
              <h3 className="font-display text-base font-bold text-white">
                Seated Participants ({room.seats.length}/{room.maxSeats})
              </h3>
              <div className="space-y-2.5">
                {room.seats.map((seat) => (
                  <div
                    key={seat.seatIndex}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0B0E17] p-3 text-xs"
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
                              ? 'text-[#F59E0B]'
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

            {room.status === 'waiting' && (
              <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-5 space-y-3">
                <h3 className="font-display text-base font-bold text-white">
                  Invite Online Players ({otherOnlinePlayers.length})
                </h3>
                {otherOnlinePlayers.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No other human players are currently in the lobby. Share your Room Code{' '}
                    <strong className="font-mono text-[#F59E0B]">{room.code}</strong> or add an AI bot to play a Mixed Match!
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {otherOnlinePlayers.map((op) => (
                      <div
                        key={op.playerId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#0B0E17] px-3 py-2 text-xs"
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
                          className="inline-flex items-center gap-1 rounded bg-[#E11D48] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
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
            {/* Quick Matchmaking + Room Builder */}
            <div className="rounded-2xl border border-white/[0.08] bg-[#10141F] p-6 space-y-5">
              <div>
                <h2 className="font-display text-xl font-bold text-white">Choose Game & Match Format</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Play real-time 1v1 against human players or launch Mixed Matches combining Humans and AI opponents.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {(['tictactoe', 'rps', 'guess_number'] as GameId[]).map((gId) => (
                  <button
                    key={gId}
                    type="button"
                    onClick={() => setSelectedGame(gId)}
                    className={`rounded-xl border px-4 py-3 text-left text-xs font-semibold transition cursor-pointer ${
                      selectedGame === gId
                        ? 'border-[#E11D48] bg-[#E11D48]/15 text-white'
                        : 'border-white/[0.08] bg-[#0B0E17] text-slate-400 hover:text-white'
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
                      : 'border-white/[0.08] bg-[#0B0E17]'
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
                      ? 'border-[#F59E0B] bg-amber-950/25'
                      : 'border-white/[0.08] bg-[#0B0E17]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Bot className="h-4 w-4 text-[#F59E0B]" /> Mixed (Humans + AI)
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    2–4 seat arena blending online human friends with intelligent AI bots.
                  </p>
                </button>
              </div>

              {createMode === 'mixed' && (
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.08] bg-[#0B0E17] p-4 sm:grid-cols-2">
                  <label className="text-xs text-slate-300">
                    AI Bot Difficulty
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value as DifficultyLevel)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#10141F] px-3 py-2 text-white"
                    >
                      <option value="easy">Easy AI</option>
                      <option value="medium">Medium AI</option>
                      <option value="hard">Hard AI</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-300">
                    Starting AI Bots
                    <select
                      value={aiBotCount}
                      onChange={(e) => setAiBotCount(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#10141F] px-3 py-2 text-white"
                    >
                      <option value={1}>1 AI Bot</option>
                      <option value={2}>2 AI Bots</option>
                      <option value={3}>3 AI Bots</option>
                    </select>
                  </label>
                </div>
              )}

              {selectedGame === 'tictactoe' && (
                <div className="rounded-xl border border-white/[0.08] bg-[#0B0E17] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">Tic-Tac-Toe Winning Rules</span>
                    <span className="font-mono text-xs font-bold text-[#F59E0B]">
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
                            ? 'border-[#E11D48] bg-[#E11D48]/20 text-white'
                            : 'border-white/[0.1] bg-[#10141F] text-slate-300'
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
                        className="w-14 rounded-lg border border-white/[0.15] bg-[#10141F] px-2 py-1 text-center font-mono text-xs text-white"
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
                        className="accent-[#F59E0B]"
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
                        className="w-14 rounded-lg border border-white/[0.15] bg-[#10141F] px-2 py-1 text-center font-mono text-xs text-white"
                      />
                    )}
                  </div>
                </div>
              )}

              {selectedGame === 'rps' && (
                <div className="rounded-xl border border-white/[0.08] bg-[#0B0E17] p-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-white">Wins Required to Finish Match</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 3, 5, 7].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setRpsTargetWins(w)}
                        className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-bold cursor-pointer ${
                          rpsTargetWins === w
                            ? 'border-[#E11D48] bg-[#E11D48]/20 text-white'
                            : 'border-white/[0.1] bg-[#10141F] text-slate-300'
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
                      className="w-14 rounded-lg border border-white/[0.15] bg-[#10141F] px-2 py-1 text-center font-mono text-xs text-white"
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
                    className="accent-[#E11D48]"
                  />
                  Private Room (Invite / Room Code Only)
                </label>

                <div className="flex flex-wrap gap-2.5">
                  {rt.queueState.queued ? (
                    <button
                      type="button"
                      onClick={() => wsClient.emit('queue:leave')}
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-2.5 text-xs font-semibold text-amber-200 cursor-pointer"
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
                      className="inline-flex items-center gap-2 rounded-xl border border-white/[0.15] bg-[#0B0E17] px-4 py-2.5 text-xs font-semibold text-white hover:border-emerald-500 cursor-pointer"
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
                        aiCount: aiBotCount,
                        tttWinTarget: createTttCfg.winTarget,
                        tttBoardSize: createTttCfg.boardSize,
                        rpsTargetWins,
                      })
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-[#E11D48] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#BE123C] cursor-pointer"
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
              className="rounded-xl border border-white/[0.08] bg-[#10141F] p-5 flex flex-col gap-3 sm:flex-row sm:items-center"
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
                  className="w-36 rounded-lg border border-white/[0.12] bg-[#07090F] px-3 py-2 text-center font-mono text-sm uppercase tracking-widest text-white focus:border-[#E11D48] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#F59E0B] px-4 py-2 text-xs font-bold text-[#07090F] hover:bg-[#D97706] cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5" /> Join Code
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Open Public Rooms & Online Human Players */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-5 space-y-3">
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
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#0B0E17] p-3 text-xs"
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
                        className="rounded-lg bg-[#E11D48] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#BE123C] disabled:opacity-40 cursor-pointer"
                      >
                        {r.status === 'waiting' ? 'Join' : 'In Play'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#10141F] p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="font-display text-base font-bold text-white">Online Human Players</h3>
                <span className="font-mono text-xs text-emerald-400">{rt.onlinePlayers.length} active</span>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {rt.onlinePlayers.map((p) => (
                  <div
                    key={p.playerId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#0B0E17] px-3 py-2 text-xs"
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
