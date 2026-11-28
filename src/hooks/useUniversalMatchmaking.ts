import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DifficultyLevel, GameId, PlayerProfile, RoomSeat, RoomState } from '../types.ts';
import { getStoredPlayerToken } from '../utils/api.ts';
import { type RealtimeSnapshot, wsClient } from '../utils/wsClient.ts';

export type MatchPhase = 'searching' | 'human' | 'ai';

interface UseUniversalMatchmakingOptions {
  player: PlayerProfile;
  enabled?: boolean;
  searchMs?: number;
  tttBoardSize?: number;
  tttWinTarget?: number;
  rpsTargetWins?: number;
}

export function useUniversalMatchmaking(gameId: GameId, opts: UseUniversalMatchmakingOptions) {
  const { player, enabled = true, searchMs = 3500, tttBoardSize, tttWinTarget, rpsTargetWins } = opts;

  const [rt, setRt] = useState<RealtimeSnapshot>(() => wsClient.getSnapshot());
  const [matchPhase, setMatchPhase] = useState<MatchPhase>(() => {
    const snap = wsClient.getSnapshot();
    if (snap.currentRoom?.gameId === gameId) return 'human';
    return 'searching';
  });
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [secondsLeft, setSecondsLeft] = useState<number>(searchMs / 1000);
  const [localSeed, setLocalSeed] = useState<number>(() => Math.floor(100000 + Math.random() * 899999));

  const phaseRef = useRef<MatchPhase>(matchPhase);
  phaseRef.current = matchPhase;

  const deadlineRef = useRef<number>(Date.now() + searchMs);
  const timerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const unsub = wsClient.subscribe((snap) => setRt(snap));
    return unsub;
  }, []);

  const beginSearch = useCallback(
    (customWindowMs = searchMs) => {
      clearTimers();
      const token = getStoredPlayerToken();
      if (!enabled || !token || player.id.startsWith('local-')) {
        // Offline / local guest: seamlessly drop into AI immediately after brief tick
        setMatchPhase('ai');
        setSecondsLeft(0);
        return;
      }

      if (rt.currentRoom && rt.currentRoom.gameId !== gameId) {
        wsClient.leaveMatch();
      }

      wsClient.connect(token);
      wsClient.findMatch(gameId, { tttBoardSize, tttWinTarget, rpsTargetWins });
      setMatchPhase('searching');
      deadlineRef.current = Date.now() + customWindowMs;
      setSecondsLeft(Number((customWindowMs / 1000).toFixed(1)));

      timerRef.current = window.setInterval(() => {
        const remaining = deadlineRef.current - Date.now();
        if (remaining <= 0) {
          clearTimers();
          if (phaseRef.current === 'searching') {
            wsClient.cancelMatchmaking();
            setMatchPhase('ai');
            setSecondsLeft(0);
          }
        } else {
          setSecondsLeft(Number((remaining / 1000).toFixed(1)));
        }
      }, 150);
    },
    [clearTimers, enabled, gameId, player.id, rpsTargetWins, rt.currentRoom, searchMs, tttBoardSize, tttWinTarget]
  );

  // Initial auto-matchmaking on mount or gameId change
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setMatchPhase('ai');
      return;
    }
    const snap = wsClient.getSnapshot();
    if (snap.currentRoom?.gameId === gameId) {
      setMatchPhase('human');
      clearTimers();
      return;
    }
    beginSearch(searchMs);
    return () => {
      clearTimers();
      const latest = wsClient.getSnapshot();
      if (latest.queueState.queued) {
        wsClient.cancelMatchmaking();
      }
      if (latest.currentRoom?.gameId === gameId) {
        wsClient.leaveMatch();
      }
    };
    // Intentionally run once per gameId / enabled transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, enabled]);

  // React to live WebSocket room assignment or opponent departure
  useEffect(() => {
    if (rt.currentRoom?.gameId === gameId) {
      clearTimers();
      if (matchPhase !== 'human') {
        setMatchPhase('human');
        setSecondsLeft(0);
      }
    } else if (matchPhase === 'human' && !rt.currentRoom) {
      setMatchPhase('ai');
    }
  }, [clearTimers, gameId, matchPhase, rt.currentRoom]);

  const liveMatch: RoomState | null = useMemo(() => {
    return rt.currentRoom && rt.currentRoom.gameId === gameId ? rt.currentRoom : null;
  }, [gameId, rt.currentRoom]);

  const mySeatIndex = useMemo(() => {
    if (!liveMatch) return 0;
    const idx = liveMatch.seats.findIndex((s) => s.playerId === player.id);
    return idx >= 0 ? idx : 0;
  }, [liveMatch, player.id]);

  const mySeat: RoomSeat | null = liveMatch ? liveMatch.seats[mySeatIndex] || null : null;
  const opponentSeat: RoomSeat | null = useMemo(() => {
    if (!liveMatch) return null;
    return liveMatch.seats.find((s) => s.seatIndex !== mySeatIndex) || null;
  }, [liveMatch, mySeatIndex]);

  const skipToAi = useCallback(() => {
    clearTimers();
    wsClient.cancelMatchmaking();
    if (liveMatch) {
      wsClient.leaveMatch();
    }
    setMatchPhase('ai');
    setSecondsLeft(0);
  }, [clearTimers, liveMatch]);

  const searchForHuman = useCallback(() => {
    setLocalSeed(Math.floor(100000 + Math.random() * 899999));
    beginSearch(5000);
  }, [beginSearch]);

  const leaveHumanMatch = useCallback(() => {
    clearTimers();
    wsClient.leaveMatch();
    setMatchPhase('ai');
  }, [clearTimers]);

  const rematchHuman = useCallback(() => {
    wsClient.rematch();
  }, []);

  const sendChat = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    wsClient.sendChatMessage(clean);
  }, []);

  const sendDuelProgress = useCallback(
    (payload: {
      score: number;
      progress: number;
      maxProgress: number;
      finished?: boolean;
      summary?: string;
    }) => {
      if (matchPhase !== 'human' || !liveMatch) return;
      wsClient.submitDuelProgress(payload);
    },
    [liveMatch, matchPhase]
  );

  const rotateLocalSeed = useCallback(() => {
    const next = Math.floor(100000 + Math.random() * 899999);
    setLocalSeed(next);
    return next;
  }, []);

  const seed = liveMatch?.duelState?.seed ?? localSeed;

  return {
    matchPhase,
    secondsLeft,
    difficulty,
    setDifficulty,
    liveMatch,
    mySeatIndex,
    mySeat,
    opponentSeat,
    seed,
    rotateLocalSeed,
    wsStatus: rt.status,
    onlineCount: rt.onlinePlayers.length,
    wsError: rt.lastError,
    skipToAi,
    searchForHuman,
    leaveHumanMatch,
    rematchHuman,
    sendChat,
    sendDuelProgress,
  };
}
