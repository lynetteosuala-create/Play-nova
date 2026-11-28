import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Clock,
  Coins,
  Cpu,
  Flame,
  Gamepad2,
  Globe,
  Play,
  Search,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { GAME_ASSETS } from '../assets/gameAssets.ts';
import { DEFAULT_CHALLENGES, GAME_CATALOG, GAME_CATEGORIES } from '../game/catalog.ts';
import type { AppView, GameCategory, GameId, LeaderboardEntry, MatchRecord, TournamentItem } from '../types.ts';

export function getGameArtwork(id: GameId): string {
  switch (id) {
    case 'tictactoe':
      return GAME_ASSETS.ticTacToeArt;
    case 'rps':
      return GAME_ASSETS.rpsArt;
    case 'guess_number':
      return GAME_ASSETS.guessNumberArt;
    case 'connect_four':
    case 'connect_five':
    case 'chess':
      return GAME_ASSETS.strategyArt;
    case 'checkers':
    case 'reversi':
      return GAME_ASSETS.checkersReversiArt;
    case 'battleship':
    case 'dots_and_boxes':
      return GAME_ASSETS.battleshipArt;
    case 'ludo':
      return GAME_ASSETS.ludoPartyArt;
    case 'snake':
    case 'minesweeper':
      return GAME_ASSETS.snakeMinesArt;
    case 'word_battle':
    case 'word_scramble':
    case 'hangman':
      return GAME_ASSETS.wordHangmanArt;
    case 'sudoku':
    case 'pattern_recognition':
      return GAME_ASSETS.brainArt;
    case 'memory_match':
    case 'trivia_challenge':
    case 'quick_math':
    case 'reaction_test':
    default:
      return GAME_ASSETS.arcadeArt;
  }
}

interface HomepageHeroProps {
  publicStats: {
    onlinePlayers: number;
    activeRooms: number;
    totalPlayers: number;
    totalMatches: number;
  };
  topLeaders: LeaderboardEntry[];
  tournaments: TournamentItem[];
  recentMatches?: MatchRecord[];
  recentGameIds?: GameId[];
  onPlayNow: (desiredView?: AppView) => void;
  onNavigatePublic: (view: 'games' | 'tournaments' | 'leaderboard' | 'link_preview') => void;
}

export function HomepageHero({
  publicStats,
  topLeaders,
  tournaments,
  recentMatches = [],
  recentGameIds = [],
  onPlayNow,
  onNavigatePublic,
}: HomepageHeroProps) {
  const [selectedCategory, setSelectedCategory] = useState<'All' | GameCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

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
  }, [selectedCategory, searchQuery]);

  const popularGames = useMemo(
    () => GAME_CATALOG.filter((g) => g.popularChallenge).slice(0, 6),
    []
  );
  const recentlyAdded = useMemo(
    () => GAME_CATALOG.filter((g) => g.recentlyAdded).slice(0, 6),
    []
  );
  const recentlyPlayedGames = useMemo(() => {
    const seen = new Set<GameId>();
    const list: typeof GAME_CATALOG = [];
    for (const gid of recentGameIds) {
      if (seen.has(gid)) continue;
      const item = GAME_CATALOG.find((g) => g.id === gid);
      if (item) {
        seen.add(gid);
        list.push(item);
      }
    }
    for (const m of recentMatches) {
      if (seen.has(m.gameId)) continue;
      const item = GAME_CATALOG.find((g) => g.id === m.gameId);
      if (item) {
        seen.add(m.gameId);
        list.push(item);
      }
    }
    return list.slice(0, 4);
  }, [recentGameIds, recentMatches]);

  return (
    <div className="space-y-14">
      {/* Main PLAYNOVA Gaming Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-[#8B5CF6]/25 bg-[#0E1324] shadow-[0_24px_90px_rgba(6,8,17,0.85)]">
        <img
          src={GAME_ASSETS.heroUniverse}
          alt="PLAYNOVA futuristic multiplayer gaming universe"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#060811] via-[#060811]/88 to-[#060811]/35" />

        <div className="relative z-10 grid grid-cols-1 gap-8 px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#8B5CF6] bg-[#0B0F1E] font-display text-xl font-extrabold text-white shadow-[0_0_24px_rgba(139,92,246,0.45)]">
                P
              </div>
              <div>
                <span className="block font-display text-sm font-bold tracking-[0.18em] text-white">PLAYNOVA</span>
                <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#38BDF8]">
                  <Sparkles className="h-3 w-3 text-[#F97316]" />
                  ENTER. COMPETE. CONQUER.
                </p>
              </div>
            </div>

            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl text-balance">
              YOUR NEXT VICTORY{' '}
              <span className="bg-gradient-to-r from-[#8B5CF6] via-[#38BDF8] to-[#F97316] bg-clip-text text-transparent">
                STARTS HERE.
              </span>
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-slate-300">
              {GAME_CATALOG.length} skill-based strategy, word, puzzle, and classic arcade games ready to play in one click. Launch any title for instant auto-matchmaking—pair live with online rivals or battle intelligent adaptive AI with zero waiting or registration.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => onPlayNow('lobby')}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] px-8 py-3.5 text-base font-bold text-white shadow-[0_10px_32px_rgba(139,92,246,0.4)] transition hover:brightness-110 whitespace-nowrap cursor-pointer"
              >
                <Play className="h-5 w-5 fill-current" />
                PLAY NOW
              </button>
              <button
                type="button"
                onClick={() => onNavigatePublic('games')}
                className="inline-flex items-center gap-2 rounded-xl border border-[#38BDF8]/40 bg-[#0B0F1E]/85 px-6 py-3.5 text-sm font-bold text-white transition hover:border-[#38BDF8] hover:bg-[#111833] whitespace-nowrap cursor-pointer"
              >
                <Gamepad2 className="h-4 w-4 text-[#38BDF8]" />
                EXPLORE {GAME_CATALOG.length} GAMES
              </button>
              <button
                type="button"
                onClick={() => onNavigatePublic('tournaments')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.15] bg-[#0B0F1E]/80 px-5 py-3.5 text-sm font-semibold text-slate-200 transition hover:border-white/35 hover:text-white whitespace-nowrap cursor-pointer"
              >
                <Trophy className="h-4 w-4 text-[#F97316]" />
                Tournaments
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
            {[
              { label: 'Online Players', val: publicStats.onlinePlayers, sub: 'Auto-matchmaking live', icon: Users, accent: 'text-[#38BDF8]' },
              { label: 'Live Matches', val: publicStats.activeRooms, sub: 'Human 1v1 & AI duels', icon: Globe, accent: 'text-[#8B5CF6]' },
              { label: 'Playable Games', val: GAME_CATALOG.length, sub: 'Strategy, Brain & Arcade', icon: Gamepad2, accent: 'text-[#F97316]' },
              { label: 'Matches Logged', val: publicStats.totalMatches, sub: 'Verified results', icon: Coins, accent: 'text-emerald-400' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/[0.1] bg-[#060811]/88 p-4 backdrop-blur-sm"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{stat.label}</span>
                  <stat.icon className={`h-4 w-4 ${stat.accent}`} />
                </div>
                <p className="mt-2 font-mono text-3xl font-bold text-white tabular-nums">
                  {stat.val.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recently Played Quick Resume Strip (when player has played games) */}
      {recentlyPlayedGames.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#38BDF8]" />
            <h2 className="font-display text-lg font-bold text-white">Recently Played</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentlyPlayedGames.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPlayNow(g.id)}
                className="flex items-center gap-3 rounded-2xl border border-[#38BDF8]/25 bg-[#0E1324] p-3 text-left transition hover:border-[#38BDF8] cursor-pointer"
              >
                <img
                  src={getGameArtwork(g.id)}
                  alt={g.name}
                  referrerPolicy="no-referrer"
                  className="h-12 w-16 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold text-white">{g.name}</p>
                  <p className="truncate text-[11px] text-slate-400">{g.estimatedTime}</p>
                </div>
                <Play className="h-4 w-4 shrink-0 text-[#38BDF8] fill-current" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Full 22-Game Library with Search + 8 Category Filters */}
      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#8B5CF6]">
              {GAME_CATALOG.length} Playable Arenas · Instant Matchmaking
            </p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold text-white">
              PLAYNOVA Game Library
            </h2>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search all ${GAME_CATALOG.length} games...`}
              className="w-full rounded-xl border border-white/[0.1] bg-[#0E1324] py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-slate-500 focus:border-[#38BDF8] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
              selectedCategory === 'All'
                ? 'border-[#8B5CF6] bg-[#8B5CF6]/20 text-white'
                : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
            }`}
          >
            All ({GAME_CATALOG.length})
          </button>
          {GAME_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                selectedCategory === cat
                  ? 'border-[#38BDF8] bg-[#38BDF8]/20 text-white'
                  : 'border-white/[0.08] bg-[#0E1324] text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredGames.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.12] bg-[#0E1324] p-10 text-center">
            <p className="text-sm font-semibold text-white">No games matched your filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              className="mt-3 rounded-lg bg-[#8B5CF6] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Reset Search &amp; Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGames.map((game) => (
              <div
                key={game.id}
                className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1324] flex flex-col justify-between transition hover:border-[#8B5CF6]/60"
              >
                <div>
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#060811]">
                    <img
                      src={getGameArtwork(game.id)}
                      alt={`${game.name} arena artwork`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0E1324] via-transparent to-transparent" />
                    <div className="absolute right-3 top-3 flex items-center gap-1.5">
                      {game.recentlyAdded && (
                        <span className="rounded-md bg-[#38BDF8] px-2 py-0.5 font-mono text-[10px] font-bold text-[#060811]">
                          NEW
                        </span>
                      )}
                      {game.popularChallenge && (
                        <span className="rounded-md bg-[#F97316] px-2 py-0.5 font-mono text-[10px] font-bold text-[#060811]">
                          POPULAR
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="font-mono text-[11px] text-[#38BDF8]">
                      {game.categories.slice(0, 2).join(' · ')} · {game.estimatedTime}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-white">{game.name}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{game.description}</p>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    onClick={() => onPlayNow(game.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#151D38] border border-white/[0.08] px-4 py-2.5 text-xs font-bold text-white transition group-hover:bg-[#8B5CF6] group-hover:border-[#8B5CF6] cursor-pointer"
                  >
                    Play Now
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Popular Games & Featured Competitions */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#38BDF8]">
                Auto-Matchmaking · Human &amp; AI
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-white">
                Popular Competitive Games
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onPlayNow('multiplayer')}
              className="text-xs font-semibold text-[#38BDF8] hover:text-white cursor-pointer"
            >
              Matchmaking Hub →
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {popularGames.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPlayNow(g.id)}
                className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#060811] p-3.5 text-left transition hover:border-[#38BDF8]/50 cursor-pointer"
              >
                <div className="min-w-0 pr-2">
                  <p className="truncate font-display text-sm font-bold text-white">{g.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Live 1v1 · Adaptive AI</p>
                </div>
                <Play className="h-4 w-4 shrink-0 text-[#38BDF8] fill-current" />
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#F97316]">
                Scheduled &amp; Exhibition Cups
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-white">Featured Competitions</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigatePublic('tournaments')}
              className="text-xs font-semibold text-[#F97316] hover:text-white cursor-pointer"
            >
              All Brackets →
            </button>
          </div>
          <div className="space-y-2.5">
            {(tournaments.length > 0 ? tournaments.slice(0, 3) : []).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#060811] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase text-[#38BDF8]">
                    {t.competitionType === 'exhibition_demo' ? 'Exhibition AI Bracket (Demo)' : 'Scheduled Player Cup'}
                  </p>
                  <p className="truncate font-display text-sm font-bold text-white">{t.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigatePublic('tournaments')}
                  className="shrink-0 rounded-lg border border-white/[0.12] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#F97316] cursor-pointer"
                >
                  {t.prizeCoins} Coins
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Daily Challenges, Rankings & Newly Added Games */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#F97316]">
              Daily &amp; Weekly Quests
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-white">Daily Challenges</h2>
          </div>
          <div className="space-y-2.5">
            {DEFAULT_CHALLENGES.slice(0, 4).map((ch) => (
              <div key={ch.id} className="rounded-xl border border-white/[0.08] bg-[#060811] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold text-white">{ch.title}</span>
                  <span className="font-mono text-xs text-[#F97316]">+{ch.coinReward} Coins</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{ch.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#8B5CF6]">
                Rankings &amp; Achievements
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-white">Top Contenders</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigatePublic('leaderboard')}
              className="text-xs font-semibold text-[#8B5CF6] hover:text-white cursor-pointer"
            >
              Full Table →
            </button>
          </div>
          {topLeaders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-[#060811] p-5 text-center text-xs text-slate-400">
              Rankings update live after your first match. Click PLAY NOW to claim #1.
            </div>
          ) : (
            <div className="space-y-2">
              {topLeaders.slice(0, 5).map((leader) => (
                <div
                  key={leader.playerId}
                  className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3.5 py-2.5 text-xs"
                >
                  <span className="font-medium text-white truncate">
                    <span className="mr-2 font-mono text-[#F97316]">#{leader.rank}</span>
                    {leader.username}
                  </span>
                  <span className="font-mono text-slate-300 tabular-nums shrink-0">
                    {leader.points} pts · {leader.achievementsCount} badges
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 rounded-2xl border border-white/[0.08] bg-[#0E1324] p-6 space-y-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-emerald-400">
              Fresh Releases
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-white">New Games Added</h2>
          </div>
          <div className="space-y-2">
            {recentlyAdded.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onPlayNow(g.id)}
                className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-[#060811] px-3.5 py-2.5 text-left text-xs transition hover:border-emerald-400/50 cursor-pointer"
              >
                <span className="font-semibold text-white">{g.name}</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#38BDF8]">
                  <Flame className="h-3 w-3 text-[#F97316]" /> Play
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom Highlights */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            icon: Cpu,
            title: 'Intelligent Adaptive AI',
            desc: 'Alpha-Beta Chess & Checkers, Chain-Aware Dots and Boxes, Corner-Heuristic Reversi, Hunt-Target Battleship, and Minimax Connect Four & Five.',
          },
          {
            icon: Users,
            title: 'Universal Auto-Matchmaking',
            desc: 'Every title searches automatically for an available online opponent and connects seamlessly to smart AI with zero waiting rooms or codes.',
          },
          {
            icon: Calendar,
            title: 'Virtual Coins & Custom Profiles',
            desc: 'Earn Virtual Coins from wins and tournaments, unlock cosmetics, review full transaction history, and climb global leaderboards.',
          },
        ].map((box) => (
          <div key={box.title} className="rounded-2xl border border-white/[0.08] bg-[#0E1324] p-5">
            <box.icon className="h-5 w-5 text-[#8B5CF6]" />
            <h3 className="mt-3 font-display text-base font-bold text-white">{box.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{box.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
