import { useEffect, useState } from 'react';
import { ArrowLeft, Cpu, Lightbulb, RotateCcw, ShieldAlert, Trophy, Users } from 'lucide-react';
import { GAME_CATALOG } from '../../game/catalog.ts';
import {
  applyChessMove,
  chooseChessAiMove,
  createInitialChessState,
  getLegalChessMoves,
  PIECE_UNICODE,
  type ChessGameState,
  type ChessMove,
} from '../../game/chessEngine.ts';

function pieceColor(p: string | null): 'w' | 'b' | null {
  if (!p) return null;
  return p[0] === 'w' ? 'w' : 'b';
}

function pieceSymbol(p: string): string {
  return PIECE_UNICODE[p] || '';
}
import type { DifficultyLevel, MatchRecord, PlayerProfile } from '../../types.ts';
import { completeSinglePlayerGame } from '../../game/localArcadeEngine.ts';
import { soundFx } from '../../utils/sound.ts';

interface ChessGameProps {
  player: PlayerProfile;
  recentMatches: MatchRecord[];
  onProgressUpdated: (player: PlayerProfile, newlyUnlocked?: string[], completedChallenges?: string[]) => void;
  onOpenMultiplayer?: () => void;
  onBack: () => void;
}

export function ChessGame({
  player,
  recentMatches,
  onProgressUpdated,
  onOpenMultiplayer,
  onBack,
}: ChessGameProps) {
  const catalog = GAME_CATALOG.find((g) => g.id === 'chess')!;
  const [mode, setMode] = useState<'vs_ai' | 'local_2p'>('vs_ai');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [state, setState] = useState<ChessGameState>(() => createInitialChessState());
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [legalTargets, setLegalTargets] = useState<ChessMove[]>([]);
  const [pendingPromo, setPendingPromo] = useState<{ from: number; to: number } | null>(null);
  const [hintMove, setHintMove] = useState<ChessMove | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(Date.now());
  const [reported, setReported] = useState(false);
  const [rewardBanner, setRewardBanner] = useState<{ scoreDelta: number; xpEarned: number; coinsEarned: number } | null>(
    null
  );

  const chessHistory = recentMatches.filter((m) => m.gameId === 'chess');

  const submitMatchResult = async (winner: 'w' | 'b' | 'draw', reason: string) => {
    if (reported) return;
    setReported(true);
    const outcome: 'win' | 'loss' | 'draw' =
      winner === 'draw' ? 'draw' : mode === 'local_2p' ? 'win' : winner === 'w' ? 'win' : 'loss';

    if (outcome === 'win') soundFx.playWin();
    else if (outcome === 'draw') soundFx.playDraw();
    else soundFx.playLoss();

    const scoreDelta =
      outcome === 'win'
        ? mode === 'local_2p'
          ? 70
          : difficulty === 'hard'
          ? 240
          : difficulty === 'medium'
          ? 180
          : 130
        : outcome === 'draw'
        ? 60
        : 15;

    try {
      const res = await completeSinglePlayerGame(player, {
        gameId: 'chess',
        mode,
        difficulty,
        outcome,
        opponentLabel: mode === 'local_2p' ? 'Local Player 2' : `Chess AI (${difficulty})`,
        scoreDelta,
        durationSec: Math.max(8, Math.round((Date.now() - startedAt) / 1000)),
        summary: reason,
      });
      setRewardBanner(res.rewards);
      onProgressUpdated(res.player, res.newlyUnlocked, res.completedChallenges);
    } catch {
      // keep board visible
    }
  };

  useEffect(() => {
    if (state.winnerTeam && !reported) {
      void submitMatchResult(state.winnerTeam, state.statusText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.winnerTeam]);

  useEffect(() => {
    if (mode !== 'vs_ai' || state.turn !== 'b' || state.winnerTeam) return;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const aiMove = chooseChessAiMove(state, difficulty);
      setAiThinking(false);
      if (aiMove) {
        soundFx.playClick();
        setState((prev) => applyChessMove(prev, aiMove));
      }
    }, 340);
    return () => window.clearTimeout(timer);
  }, [mode, state, difficulty]);

  const resetMatch = () => {
    soundFx.playClick();
    setState(createInitialChessState());
    setSelectedIdx(null);
    setLegalTargets([]);
    setPendingPromo(null);
    setHintMove(null);
    setAiThinking(false);
    setStartedAt(Date.now());
    setReported(false);
    setRewardBanner(null);
  };

  const handleSquareClick = (idx: number) => {
    if (state.winnerTeam || aiThinking || pendingPromo) return;
    if (mode === 'vs_ai' && state.turn !== 'w') return;

    const matchingMove = legalTargets.find((m) => m.to === idx);
    if (matchingMove && selectedIdx !== null) {
      const piece = state.board[selectedIdx];
      const toRank = Math.floor(idx / 8);
      if (piece && piece[1] === 'P' && (toRank === 0 || toRank === 7)) {
        setPendingPromo({ from: selectedIdx, to: idx });
        return;
      }
      soundFx.playSelect();
      setState((prev) => applyChessMove(prev, matchingMove));
      setSelectedIdx(null);
      setLegalTargets([]);
      setHintMove(null);
      return;
    }

    const clickedPiece = state.board[idx];
    if (clickedPiece && pieceColor(clickedPiece) === state.turn) {
      soundFx.playClick();
      const allLegal = getLegalChessMoves(state).filter((m) => m.from === idx);
      setSelectedIdx(idx);
      setLegalTargets(allLegal);
    } else {
      setSelectedIdx(null);
      setLegalTargets([]);
    }
  };

  const handlePromoPick = (promo: 'Q' | 'R' | 'B' | 'N') => {
    if (!pendingPromo) return;
    const move = getLegalChessMoves(state).find(
      (m) => m.from === pendingPromo.from && m.to === pendingPromo.to && (m.promo || 'Q') === promo
    );
    if (move) {
      soundFx.playSelect();
      setState((prev) => applyChessMove(prev, move));
    }
    setPendingPromo(null);
    setSelectedIdx(null);
    setLegalTargets([]);
  };

  const handleHint = () => {
    if (state.winnerTeam || aiThinking) return;
    const best = chooseChessAiMove(state, 'medium');
    if (best) {
      setHintMove(best);
      soundFx.playSelect();
    }
  };

  const handleResign = () => {
    if (state.winnerTeam) return;
    const winner: 'w' | 'b' = state.turn === 'w' ? 'b' : 'w';
    setState((prev) => ({
      ...prev,
      winnerTeam: winner,
      statusText: `${state.turn === 'w' ? 'White' : 'Black'} resigned.`,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Hub
          </button>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">PLAYNOVA Chess</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums text-slate-300">
          <span>Wins: {player.stats.byGame.chess.wins}</span>
          <span>Points: {player.stats.byGame.chess.points}</span>
          {onOpenMultiplayer && (
            <button
              type="button"
              onClick={onOpenMultiplayer}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#38BDF8]/40 bg-[#38BDF8]/10 px-3 py-1.5 font-sans text-xs font-semibold text-[#38BDF8] hover:bg-[#38BDF8]/20 cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" /> Online 1v1 Chess
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('vs_ai');
                  resetMatch();
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  mode === 'vs_ai'
                    ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-300'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" /> vs AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('local_2p');
                  resetMatch();
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer ${
                  mode === 'local_2p'
                    ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                    : 'border-slate-700 bg-[#060811] text-slate-300'
                }`}
              >
                <Users className="h-3.5 w-3.5" /> Local 2P
              </button>
            </div>

            {mode === 'vs_ai' && (
              <div className="flex gap-1.5">
                {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDifficulty(d);
                      resetMatch();
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold capitalize cursor-pointer ${
                      difficulty === d
                        ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                        : 'border-slate-700 bg-[#060811] text-slate-400'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleHint}
                disabled={Boolean(state.winnerTeam) || aiThinking}
                className="inline-flex items-center gap-1 rounded-lg border border-[#F97316]/40 bg-[#F97316]/10 px-2.5 py-1.5 text-xs font-semibold text-[#FDBA74] disabled:opacity-40 cursor-pointer"
              >
                <Lightbulb className="h-3.5 w-3.5" /> Hint
              </button>
              <button
                type="button"
                onClick={handleResign}
                disabled={Boolean(state.winnerTeam)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1.5 text-xs font-semibold text-rose-300 disabled:opacity-40 cursor-pointer"
              >
                <ShieldAlert className="h-3.5 w-3.5" /> Resign
              </button>
              <button
                type="button"
                onClick={resetMatch}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#060811] px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={`font-semibold ${state.inCheck ? 'text-[#F97316]' : 'text-slate-200'}`}>
                {aiThinking ? 'AI is evaluating board lines...' : state.statusText}
              </span>
              <span className="font-mono text-slate-400">Moves: {state.moveHistory.length}</span>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-[480px] overflow-hidden rounded-xl border-2 border-[#8B5CF6]/40 bg-[#060811]">
              <div className="grid h-full w-full grid-cols-8 grid-rows-8">
                {state.board.map((piece, idx) => {
                  const row = Math.floor(idx / 8);
                  const col = idx % 8;
                  const dark = (row + col) % 2 === 1;
                  const isSelected = selectedIdx === idx;
                  const isTarget = legalTargets.some((m) => m.to === idx);
                  const isLast = state.lastFrom === idx || state.lastTo === idx;
                  const isHint = hintMove && (hintMove.from === idx || hintMove.to === idx);
                  const isKingInCheck = state.inCheck && piece === `${state.turn}K`;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSquareClick(idx)}
                      aria-label={`Square ${String.fromCharCode(97 + col)}${8 - row}`}
                      className={`relative flex items-center justify-center text-2xl sm:text-3xl select-none transition cursor-pointer ${
                        isKingInCheck
                          ? 'bg-rose-600/60'
                          : isSelected
                          ? 'bg-[#8B5CF6]/55'
                          : isHint
                          ? 'bg-[#F97316]/40'
                          : isLast
                          ? dark
                            ? 'bg-[#28325C]'
                            : 'bg-[#36447A]'
                          : dark
                          ? 'bg-[#12182E]'
                          : 'bg-[#20294B]'
                      }`}
                    >
                      {isTarget && (
                        <span
                          className={`pointer-events-none absolute rounded-full ${
                            piece
                              ? 'inset-1 border-2 border-[#38BDF8]'
                              : 'h-3 w-3 bg-[#38BDF8]/80'
                          }`}
                        />
                      )}
                      {piece && (
                        <span
                          className={`relative z-10 leading-none ${
                            piece[0] === 'w'
                              ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]'
                              : 'text-[#C4B5FD] drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]'
                          }`}
                        >
                          {pieceSymbol(piece)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {pendingPromo && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#060811]/85 p-4">
                  <div className="rounded-2xl border border-[#8B5CF6]/40 bg-[#0E1324] p-5 text-center space-y-3">
                    <p className="font-display text-sm font-bold text-white">Promote Pawn To:</p>
                    <div className="flex gap-2">
                      {(['Q', 'R', 'B', 'N'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handlePromoPick(p)}
                          className="h-12 w-12 rounded-xl border border-white/15 bg-[#060811] text-2xl text-white hover:border-[#38BDF8] cursor-pointer"
                        >
                          {pieceSymbol(`${state.turn}${p}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {state.winnerTeam && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#8B5CF6]/40 bg-[#060811] px-4 py-3">
                <div>
                  <p className="font-display text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[#F97316]" />
                    {state.statusText}
                  </p>
                  {rewardBanner && (
                    <p className="font-mono text-xs text-slate-300 mt-0.5">
                      +{rewardBanner.scoreDelta} Pts · +{rewardBanner.xpEarned} XP · +{rewardBanner.coinsEarned} Coins
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={resetMatch}
                  className="rounded-xl bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] cursor-pointer"
                >
                  New Chess Match
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
            <h3 className="font-display text-lg font-bold text-white">Algebraic Move Log</h3>
            {state.moveHistory.length === 0 ? (
              <p className="text-xs text-slate-400">White (Light pieces) moves first. Tap any piece to highlight legal squares.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto font-mono text-xs">
                {state.moveHistory.map((notation, i) => (
                  <div key={i} className="rounded-lg border border-white/[0.06] bg-[#060811] px-2.5 py-1.5 text-slate-200">
                    {Math.floor(i / 2) + 1}.{i % 2 === 1 ? '..' : ''} {notation}
                  </div>
                ))}
              </div>
            )}
            <ul className="space-y-1.5 border-t border-white/[0.06] pt-3 text-xs text-slate-300">
              {catalog.rules.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <h3 className="font-display text-lg font-bold text-white">Recent Chess Matches</h3>
            {chessHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No recorded chess matches yet.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {chessHistory.slice(0, 6).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-200 truncate">{m.summary}</span>
                    <span className="font-mono text-[#8B5CF6]">+{m.scoreDelta} pts</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
