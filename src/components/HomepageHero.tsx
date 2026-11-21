import {
  Bot,
  ChevronRight,
  Coins,
  Cpu,
  Gamepad2,
  Globe,
  Link2,
  Play,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { GAME_ASSETS } from '../assets/gameAssets.ts';
import { GAME_CATALOG } from '../game/catalog.ts';
import type { AppView, GameId, LeaderboardEntry } from '../types.ts';

const GAME_ART_MAP: Record<GameId, string> = {
  tictactoe: GAME_ASSETS.ticTacToeArt,
  rps: GAME_ASSETS.rpsArt,
  guess_number: GAME_ASSETS.guessNumberArt,
};

interface HomepageHeroProps {
  publicStats: {
    onlinePlayers: number;
    activeRooms: number;
    totalPlayers: number;
    totalMatches: number;
  };
  topLeaders: LeaderboardEntry[];
  onPlayNow: (desiredView?: AppView) => void;
  onNavigatePublic: (view: 'leaderboard' | 'link_preview') => void;
}

export function HomepageHero({
  publicStats,
  topLeaders,
  onPlayNow,
  onNavigatePublic,
}: HomepageHeroProps) {
  return (
    <div className="space-y-14">
      {/* Main Gaming Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-[#10141F]">
        <img
          src={GAME_ASSETS.heroArena}
          alt="GAMEVERSE multiplayer mini-gaming arena"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07090F] via-[#07090F]/85 to-[#07090F]/30" />

        <div className="relative z-10 grid grid-cols-1 gap-8 px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E11D48] bg-[#10141F] font-display text-lg font-bold text-white shadow-lg shadow-[#E11D48]/20">
                G
              </div>
              <div>
                <span className="block font-display text-sm font-bold tracking-wider text-white">GAMEVERSE</span>
                <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">
                  <Sparkles className="h-3 w-3" />
                  Play · Compete · Earn · Conquer
                </p>
              </div>
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl text-balance">
              Enter <span className="text-[#E11D48]">GAMEVERSE</span>. Three Arenas, Live Multiplayer & Intelligent AI.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-300">
              Jump straight in with just a username—no email or password required. Duel smart AI opponents, matchmake against real players worldwide, or team up in Mixed AI + Human arenas to earn virtual Game Coins and climb the global leaderboard.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => onPlayNow('lobby')}
                className="inline-flex items-center gap-2.5 rounded-xl bg-[#E11D48] px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-[#E11D48]/25 transition hover:bg-[#BE123C] cursor-pointer"
              >
                <Play className="h-5 w-5 fill-current" />
                PLAY NOW
              </button>
              <button
                type="button"
                onClick={() => onNavigatePublic('leaderboard')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.15] bg-[#0B0E17]/85 px-5 py-3.5 text-sm font-semibold text-white transition hover:border-white/35 cursor-pointer"
              >
                <Trophy className="h-4 w-4 text-[#F59E0B]" />
                View Leaderboard
              </button>
              <button
                type="button"
                onClick={() => onNavigatePublic('link_preview')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.15] bg-[#0B0E17]/85 px-5 py-3.5 text-sm font-semibold text-white transition hover:border-white/35 cursor-pointer"
              >
                <Link2 className="h-4 w-4 text-emerald-400" />
                Link Preview Tool
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
            {[
              { label: 'Online Players', val: publicStats.onlinePlayers, sub: 'Live WebSocket hub', icon: Users, accent: 'text-emerald-400' },
              { label: 'Active Rooms', val: publicStats.activeRooms, sub: 'Public & private arenas', icon: Globe, accent: 'text-[#E11D48]' },
              { label: 'Registered Names', val: publicStats.totalPlayers, sub: 'Username profiles', icon: Gamepad2, accent: 'text-sky-400' },
              { label: 'Matches Played', val: publicStats.totalMatches, sub: 'Verified completions', icon: Coins, accent: 'text-[#F59E0B]' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/[0.1] bg-[#0B0E17]/90 p-4 backdrop-blur-sm"
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

      {/* Three Match Modes */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[
          {
            icon: Cpu,
            title: 'Play Against AI',
            accent: '#E11D48',
            desc: 'Challenge server-authoritative Minimax, adaptive pattern-reading, and deduction AI across Easy, Medium, and Hard tiers.',
            action: 'Challenge AI',
            view: 'games' as AppView,
          },
          {
            icon: Users,
            title: 'Play Against Humans',
            accent: '#10B981',
            desc: 'Queue for instant 1v1 matchmaking, create public or private rooms with 6-character invite codes, and see live online availability.',
            action: 'Open Multiplayer',
            view: 'multiplayer' as AppView,
          },
          {
            icon: Bot,
            title: 'Mixed Matches (AI + Humans)',
            accent: '#F59E0B',
            desc: 'Combine real online players and AI bots in the same room—2v2 Tic-Tac-Toe tag teams, multi-seat RPS arenas, and Number Vault races.',
            action: 'Join Mixed Arena',
            view: 'multiplayer' as AppView,
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#10141F] p-6"
          >
            <div>
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border"
                style={{ borderColor: `${item.accent}55`, backgroundColor: `${item.accent}1A`, color: item.accent }}
              >
                <item.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-xl font-bold text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => onPlayNow(item.view)}
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-[#E11D48] cursor-pointer"
            >
              {item.action} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </section>

      {/* Featured Games Showcase */}
      <section className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#E11D48]">
              Three Signature Arenas
            </p>
            <h2 className="mt-1 font-display text-3xl font-bold text-white">Featured Mini-Games</h2>
          </div>
          <button
            type="button"
            onClick={() => onPlayNow('lobby')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#F59E0B] hover:underline cursor-pointer"
          >
            Enter with Username to Play <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {GAME_CATALOG.map((game) => (
            <article
              key={game.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#10141F] transition hover:border-white/25"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#07090F]">
                <img
                  src={GAME_ART_MAP[game.id]}
                  alt={game.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#10141F] via-transparent to-transparent" />
                <span
                  className="absolute bottom-3 left-4 font-mono text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: game.accentHex }}
                >
                  AI · Online Humans · Mixed
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-between p-5 space-y-4">
                <div>
                  <h3 className="font-display text-xl font-bold text-white">{game.name}</h3>
                  <p className="mt-1 text-xs text-slate-400">{game.tagline}</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{game.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onPlayNow(game.id)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#E11D48] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#BE123C] cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Play {game.name}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Public Leaderboard Preview & Link Preview Banner */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#10141F] p-6">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#F59E0B]" />
              <h2 className="font-display text-lg font-bold text-white">Top Arena Champions</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigatePublic('leaderboard')}
              className="text-xs font-semibold text-[#E11D48] hover:underline cursor-pointer"
            >
              View Full Rankings
            </button>
          </div>
          {topLeaders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              No ranked matches yet—click PLAY NOW to claim the #1 spot on the global leaderboard!
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {topLeaders.map((entry) => (
                <div
                  key={entry.playerId}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#0B0E17] px-4 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 font-mono font-bold text-[#F59E0B]">#{entry.rank}</span>
                    <span className="font-semibold text-white">{entry.username}</span>
                    <span className="font-mono text-slate-500">LVL {entry.level}</span>
                  </div>
                  <span className="font-mono font-bold text-[#F59E0B] tabular-nums">
                    {entry.points.toLocaleString()} PTS
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#10141F] p-6 flex flex-col justify-between space-y-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              Verified Social Cards
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-white">
              Link Preview & Invite Sharing
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Generate live Open Graph & Twitter previews for any website or GAMEVERSE match link before sharing to WhatsApp, Telegram, or Facebook.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigatePublic('link_preview')}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F59E0B] px-4 py-2.5 text-xs font-bold text-[#07090F] transition hover:bg-[#D97706] cursor-pointer"
            >
              <Link2 className="h-4 w-4" />
              Open Link Preview Studio
            </button>
            <button
              type="button"
              onClick={() => onPlayNow('lobby')}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#0B0E17] px-4 py-2.5 text-xs font-semibold text-white hover:border-white/30 cursor-pointer"
            >
              Enter Arena Now
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
