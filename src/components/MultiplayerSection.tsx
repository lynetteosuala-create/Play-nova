import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Gamepad2,
  Play,
  Radio,
  Search,
  Sparkles,
  Swords,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { GAME_CATALOG, GAME_CATEGORIES } from '../game/catalog.ts';
import type { GameCategory, GameId, PlayerProfile } from '../types.ts';
import { soundFx } from '../utils/sound.ts';
import { wsClient, type RealtimeSnapshot } from '../utils/wsClient.ts';
import { getGameArtwork } from './HomepageHero.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';

interface MultiplayerSectionProps {
  player: PlayerProfile;
  defaultGame?: GameId;
  onLaunchGame: (gameId: GameId) => void;
}

export function MultiplayerSection({
  player,
  defaultGame,
  onLaunchGame,
}: MultiplayerSectionProps) {
  const [rt, setRt] = useState<RealtimeSnapshot>(wsClient.getSnapshot());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | GameCategory>('All');

  useEffect(() => {
    const unsub = wsClient.subscribe((next) => setRt(next));
    return unsub;
  }, []);

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return GAME_CATALOG.filter((g) => {
      const catOk = selectedCategory === 'All' || g.categories.includes(selectedCategory);
      if (!catOk) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.tagline.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.categories.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  const otherOnlinePlayers = rt.onlinePlayers.filter((p) => p.playerId !== player.id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#38BDF8]">
            PLAYNOVA Universal Auto-Matchmaking
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
            Live Multiplayer & Adaptive AI Arena
          </h1>
          <p className="mt-1.5 max-w-2xl text-xs text-slate-400 sm:text-sm">
            Zero room codes or waiting lobbies. Pick any of our {GAME_CATALOG.length} games to automatically pair with an online human opponent—or drop straight into an intelligent AI match if no human is queued.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0E1324] px-3.5 py-2 text-xs font-mono">
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

      {/* Active Match Shortcut if already paired */}
      {rt.currentRoom && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/25 px-5 py-4">
          <div className="flex items-center gap-3">
            <Swords className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-display text-sm font-bold text-white">
                Active Match Ready: {rt.currentRoom.title}
              </p>
              <p className="text-xs text-emerald-200/80">
                Your live 1v1 WebSocket match is currently active.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundFx.playSelect();
              onLaunchGame(rt.currentRoom!.gameId);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-[#060811] hover:bg-emerald-400 whitespace-nowrap cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Resume Live Match
          </button>
        </div>
      )}

      {/* Quick Featured Launch if navigated with defaultGame */}
      {defaultGame && !rt.currentRoom && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#8B5CF6]/40 bg-[#121631] px-5 py-4">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-[#38BDF8]" />
            <div>
              <p className="font-display text-sm font-bold text-white">
                Ready to Matchmake:{' '}
                {GAME_CATALOG.find((g) => g.id === defaultGame)?.name || defaultGame}
              </p>
              <p className="text-xs text-slate-300">
                Searches online players automatically for 3.5s, then engages smart AI if needed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundFx.playSelect();
              onLaunchGame(defaultGame);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#8B5CF6] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#7C3AED] whitespace-nowrap cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Find Match Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 cols: Searchable 22-Game Instant Matchmaking Launcher */}
        <div className="lg:col-span-8 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search all 22 multiplayer & AI games..."
                className="w-full rounded-xl border border-white/[0.1] bg-[#0E1324] py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-500 focus:border-[#38BDF8] focus:outline-none"
              />
            </div>
            <span className="font-mono text-xs text-slate-400 shrink-0 tabular-nums">
              {filteredGames.length} of {GAME_CATALOG.length} Arenas
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['All', ...GAME_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                    : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filteredGames.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.12] bg-[#0E1324] p-10 text-center">
              <Gamepad2 className="mx-auto h-8 w-8 text-slate-500" />
              <p className="mt-2 text-sm font-semibold text-white">No games matched &ldquo;{searchQuery}&rdquo;</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                className="mt-3 rounded-lg bg-[#8B5CF6] px-4 py-1.5 text-xs font-semibold text-white cursor-pointer"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredGames.map((game) => (
                <div
                  key={game.id}
                  className="group flex items-center gap-3.5 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-3.5 transition hover:border-[#38BDF8]/50"
                >
                  <img
                    src={getGameArtwork(game.id)}
                    alt={game.name}
                    referrerPolicy="no-referrer"
                    className="h-16 w-20 shrink-0 rounded-xl object-cover bg-[#060811]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-sm font-bold text-white">{game.name}</h3>
                      {game.recentlyAdded && (
                        <span className="rounded bg-[#38BDF8]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#38BDF8]">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{game.tagline}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      Auto-Match 1v1 · Adaptive AI · {game.estimatedTime}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.playSelect();
                      onLaunchGame(game.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#8B5CF6] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#7C3AED] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    Play
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right 4 cols: How Auto-Matchmaking Works & Online Contenders Radar */}
        <div className="lg:col-span-4 space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#F97316]" />
              <h2 className="font-display text-base font-bold text-white">How Universal Matchmaking Works</h2>
            </div>
            <ol className="space-y-2 text-xs text-slate-300">
              <li className="rounded-xl border border-white/[0.06] bg-[#060811] p-3">
                <strong className="text-white">1. Instant Search:</strong> Selecting any game opens the arena immediately and checks for an online human rival.
              </li>
              <li className="rounded-xl border border-white/[0.06] bg-[#060811] p-3">
                <strong className="text-white">2. Live Human Pairing:</strong> If a rival is queued, your real-time 1v1 board or shared-seed duel starts right away with chat &amp; rematches.
              </li>
              <li className="rounded-xl border border-white/[0.06] bg-[#060811] p-3">
                <strong className="text-white">3. Zero Wait Fallback:</strong> If no human joins within 3.5 seconds (or you click Play AI Now), an intelligent AI opponent takes the seat seamlessly.
              </li>
            </ol>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-[#38BDF8]" />
                Online Contenders ({otherOnlinePlayers.length})
              </h2>
              <Bot className="h-4 w-4 text-[#8B5CF6]" />
            </div>

            {otherOnlinePlayers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#060811] p-4 text-center text-xs text-slate-400">
                No other players online at this second—our adaptive AI opponents across all 22 games are ready whenever you click Play!
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {otherOnlinePlayers.map((op) => (
                  <div
                    key={op.playerId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#060811] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar
                        username={op.username}
                        profilePictureUrl={op.profilePictureUrl}
                        activeFrame={op.activeFrame}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{op.username}</p>
                        <p className="font-mono text-[10px] text-slate-400">Level {op.level}</p>
                      </div>
                    </div>
                    <span
                      className={`font-mono text-[10px] uppercase shrink-0 ${
                        op.status === 'queued'
                          ? 'text-[#38BDF8]'
                          : op.status === 'in_match'
                          ? 'text-[#F97316]'
                          : 'text-emerald-400'
                      }`}
                    >
                      {op.status.replace('_', ' ')}
                    </span>
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
