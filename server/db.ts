import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ALL_GAME_IDS,
  DEFAULT_ACHIEVEMENTS,
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_CHALLENGES,
  DEFAULT_COSMETIC_REWARDS,
  DEFAULT_PLAYER_SETTINGS,
} from '../src/game/catalog.ts';
import type {
  AvatarConfig,
  DifficultyLevel,
  GameId,
  GameStatsBreakdown,
  PlayerProfile,
  PlayerSettings,
  TournamentItem,
  TournamentMatchItem,
} from '../src/types.ts';

const dataDir = path.resolve(process.cwd(), 'data');
export const avatarUploadsDir = path.join(dataDir, 'uploads', 'avatars');
fs.mkdirSync(avatarUploadsDir, { recursive: true });

export const dbPath = path.join(dataDir, 'gameverse.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    username TEXT NOT NULL,
    password_hash TEXT,
    email_verified INTEGER NOT NULL DEFAULT 1,
    security_password_hash TEXT,
    security_password_enabled INTEGER NOT NULL DEFAULT 0,
    recovery_key_hash TEXT,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    coins INTEGER NOT NULL DEFAULT 100,
    points INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    profile_picture_file TEXT,
    active_frame TEXT NOT NULL DEFAULT 'frame_slate',
    profile_theme TEXT NOT NULL DEFAULT 'theme_midnight_nova',
    avatar_config_json TEXT NOT NULL DEFAULT '{}',
    favorite_games_json TEXT NOT NULL DEFAULT '[]',
    unlocked_cosmetics_json TEXT NOT NULL DEFAULT '["frame_slate","theme_midnight_nova"]',
    settings_json TEXT NOT NULL DEFAULT '{}',
    banned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_players_username_nocase ON players(LOWER(username));

  CREATE TABLE IF NOT EXISTS player_sessions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS active_ttt_sessions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    difficulty TEXT NOT NULL,
    player_mark TEXT NOT NULL,
    board_size INTEGER NOT NULL DEFAULT 3,
    win_target INTEGER NOT NULL DEFAULT 3,
    board_json TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS active_guess_sessions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    difficulty TEXT NOT NULL,
    min_val INTEGER NOT NULL,
    max_val INTEGER NOT NULL,
    max_attempts INTEGER NOT NULL,
    time_limit_sec INTEGER NOT NULL,
    secret_number INTEGER NOT NULL,
    guesses_json TEXT NOT NULL DEFAULT '[]',
    is_daily INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS match_records (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    outcome TEXT NOT NULL,
    opponent_label TEXT NOT NULL,
    score_delta INTEGER NOT NULL,
    xp_earned INTEGER NOT NULL,
    coins_earned INTEGER NOT NULL,
    duration_sec INTEGER NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coin_transactions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS challenge_configs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    game_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    target_count INTEGER NOT NULL,
    xp_reward INTEGER NOT NULL,
    coin_reward INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_challenge_progress (
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    challenge_id TEXT NOT NULL,
    period_key TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (player_id, challenge_id, period_key)
  );

  CREATE TABLE IF NOT EXISTS achievement_configs (
    key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    xp_reward INTEGER NOT NULL,
    coin_reward INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_achievements (
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    achievement_key TEXT NOT NULL,
    unlocked_at TEXT NOT NULL,
    PRIMARY KEY (player_id, achievement_key)
  );

  CREATE TABLE IF NOT EXISTS reward_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    coin_cost INTEGER NOT NULL,
    accent_hex TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    game_id TEXT NOT NULL,
    competition_type TEXT NOT NULL DEFAULT 'scheduled',
    status TEXT NOT NULL DEFAULT 'registration',
    max_players INTEGER NOT NULL DEFAULT 4,
    entry_fee_coins INTEGER NOT NULL DEFAULT 0,
    prize_coins INTEGER NOT NULL DEFAULT 250,
    starts_at TEXT NOT NULL,
    description TEXT NOT NULL,
    winner_player_id TEXT,
    winner_username TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tournament_participants (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    is_ai INTEGER NOT NULL DEFAULT 0,
    seed INTEGER NOT NULL DEFAULT 1,
    eliminated INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    match_order INTEGER NOT NULL,
    player_a_id TEXT,
    player_b_id TEXT,
    player_a_name TEXT NOT NULL,
    player_b_name TEXT NOT NULL,
    winner_id TEXT,
    winner_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    score_text TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform_announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    kind TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shared_links (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    site_name TEXT,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS link_preview_logs (
    id TEXT PRIMARY KEY,
    player_id TEXT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    fallback_reason TEXT,
    latency_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS error_logs (
    id TEXT PRIMARY KEY,
    route TEXT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_credentials (
    id TEXT PRIMARY KEY,
    passkey_hash TEXT NOT NULL,
    owner_label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export function getPreviewCacheVersion(): number {
  const row = db.prepare("SELECT value FROM site_settings WHERE key = 'og_preview_version'").get() as
    | { value: string }
    | undefined;
  const parsed = row ? Number(row.value) : 6;
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 6;
}

const existingOgVer = db.prepare("SELECT value FROM site_settings WHERE key = 'og_preview_version'").get() as
  | { value: string }
  | undefined;
if (!existingOgVer || Number(existingOgVer.value) < 6) {
  db.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('og_preview_version', '6', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(new Date().toISOString());
}

export function bumpPreviewCacheVersion(): { version: number; updatedAt: string } {
  const next = getPreviewCacheVersion() + 1;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('og_preview_version', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(String(next), now);
  return { version: next, updatedAt: now };
}

function seedDefaults() {
  const now = new Date().toISOString();

  // Upsert newly introduced challenges/achievements/rewards without overwriting custom edits
  const insChallenge = db.prepare(
    'INSERT OR IGNORE INTO challenge_configs (id, kind, game_id, title, description, target_count, xp_reward, coin_reward, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
  );
  for (const c of DEFAULT_CHALLENGES) {
    insChallenge.run(c.id, c.kind, c.gameId, c.title, c.description, c.targetCount, c.xpReward, c.coinReward, now);
  }

  const insAchievement = db.prepare(
    'INSERT OR IGNORE INTO achievement_configs (key, title, description, category, xp_reward, coin_reward, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const a of DEFAULT_ACHIEVEMENTS) {
    insAchievement.run(a.key, a.title, a.description, a.category, a.xpReward, a.coinReward, now);
  }

  const insReward = db.prepare(
    'INSERT OR IGNORE INTO reward_catalog (id, name, category, description, coin_cost, accent_hex, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const r of DEFAULT_COSMETIC_REWARDS) {
    insReward.run(r.id, r.name, r.category, r.description, r.coinCost, r.accentHex, now);
  }

  // Migrate legacy player table columns safely
  const cols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string; notnull: number }>;
  const colMap = new Map(cols.map((c) => [c.name, c]));
  const emailCol = colMap.get('email');
  const passwordCol = colMap.get('password_hash');

  if ((emailCol && emailCol.notnull === 1) || (passwordCol && passwordCol.notnull === 1)) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE players_migrated (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        username TEXT NOT NULL,
        password_hash TEXT,
        email_verified INTEGER NOT NULL DEFAULT 1,
        security_password_hash TEXT,
        security_password_enabled INTEGER NOT NULL DEFAULT 0,
        recovery_key_hash TEXT,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        coins INTEGER NOT NULL DEFAULT 100,
        points INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        profile_picture_file TEXT,
        active_frame TEXT NOT NULL DEFAULT 'frame_slate',
        profile_theme TEXT NOT NULL DEFAULT 'theme_midnight_nova',
        avatar_config_json TEXT NOT NULL DEFAULT '{}',
        favorite_games_json TEXT NOT NULL DEFAULT '[]',
        unlocked_cosmetics_json TEXT NOT NULL DEFAULT '["frame_slate","theme_midnight_nova"]',
        settings_json TEXT NOT NULL DEFAULT '{}',
        banned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      INSERT INTO players_migrated (
        id, email, username, password_hash, email_verified, security_password_hash, security_password_enabled,
        recovery_key_hash, xp, level, coins, points, current_streak, best_streak, profile_picture_file,
        active_frame, unlocked_cosmetics_json, settings_json, created_at, updated_at, last_seen_at
      )
      SELECT
        id, email, username, password_hash, email_verified, security_password_hash,
        COALESCE(security_password_enabled, 0),
        ${colMap.has('recovery_key_hash') ? 'recovery_key_hash' : 'NULL'},
        xp, level, coins, points, current_streak, best_streak, profile_picture_file,
        active_frame, unlocked_cosmetics_json, settings_json, created_at, updated_at, last_seen_at
      FROM players;
      DROP TABLE players;
      ALTER TABLE players_migrated RENAME TO players;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_players_username_nocase ON players(LOWER(username));
      COMMIT;
    `);
    db.pragma('foreign_keys = ON');
  } else {
    if (!colMap.has('recovery_key_hash')) db.exec('ALTER TABLE players ADD COLUMN recovery_key_hash TEXT');
    if (!colMap.has('profile_theme')) {
      db.exec("ALTER TABLE players ADD COLUMN profile_theme TEXT NOT NULL DEFAULT 'theme_midnight_nova'");
    }
    if (!colMap.has('avatar_config_json')) {
      db.exec("ALTER TABLE players ADD COLUMN avatar_config_json TEXT NOT NULL DEFAULT '{}'");
    }
    if (!colMap.has('favorite_games_json')) {
      db.exec("ALTER TABLE players ADD COLUMN favorite_games_json TEXT NOT NULL DEFAULT '[]'");
    }
    if (!colMap.has('banned')) {
      db.exec('ALTER TABLE players ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
    }
  }

  const tttCols = db.prepare('PRAGMA table_info(active_ttt_sessions)').all() as Array<{ name: string }>;
  const tttColSet = new Set(tttCols.map((c) => c.name));
  if (!tttColSet.has('board_size')) {
    db.exec('ALTER TABLE active_ttt_sessions ADD COLUMN board_size INTEGER NOT NULL DEFAULT 3');
  }
  if (!tttColSet.has('win_target')) {
    db.exec('ALTER TABLE active_ttt_sessions ADD COLUMN win_target INTEGER NOT NULL DEFAULT 3');
  }

  // Seed initial announcements & competitions
  const annCount = (db.prepare('SELECT COUNT(*) as c FROM platform_announcements').get() as { c: number }).c;
  if (annCount === 0) {
    db.prepare(
      'INSERT INTO platform_announcements (id, title, message, level, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(
      'ann_launch_playnova',
      'Welcome to PLAYNOVA — 12 Playable Arenas Live',
      'Explore Strategy, Brain, Quick & Party arenas, chat inside real-time multiplayer rooms, earn Virtual Coins, and join scheduled or exhibition tournaments.',
      'event',
      now
    );
  }

  const tourCount = (db.prepare('SELECT COUNT(*) as c FROM tournaments').get() as { c: number }).c;
  if (tourCount === 0) {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const weekend = new Date(Date.now() + 3 * 86_400_000).toISOString();

    db.prepare(
      `INSERT INTO tournaments
       (id, title, game_id, competition_type, status, max_players, entry_fee_coins, prize_coins, starts_at, description, created_at, updated_at)
       VALUES (?, ?, ?, 'scheduled', 'registration', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'tour_nova_open',
      'PLAYNOVA Tic-Tac-Toe Open Cup',
      'tictactoe',
      4,
      0,
      300,
      tomorrow,
      'Real player bracket: 4 competitors clash in 5×5 (4-in-a-row) single elimination. Free entry.',
      now,
      now
    );

    db.prepare(
      `INSERT INTO tournaments
       (id, title, game_id, competition_type, status, max_players, entry_fee_coins, prize_coins, starts_at, description, created_at, updated_at)
       VALUES (?, ?, ?, 'scheduled', 'registration', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'tour_chess_cup',
      'Midnight Grandmaster Chess Qualifier',
      'chess',
      4,
      25,
      500,
      weekend,
      'Real player scheduled qualifier. Enter with 25 Virtual Coins for a chance at the 500 Coin champion purse.',
      now,
      now
    );

    // Clearly labeled Exhibition / Demonstration bracket so bracket rendering & AI showcase works immediately
    db.prepare(
      `INSERT INTO tournaments
       (id, title, game_id, competition_type, status, max_players, entry_fee_coins, prize_coins, starts_at, description, winner_username, created_at, updated_at)
       VALUES (?, ?, ?, 'exhibition_demo', 'completed', 4, 0, 150, ?, ?, 'Apex AI Bot', ?, ?)`
    ).run(
      'tour_demo_c4',
      'Connect Four Showcase Bracket (Demo / AI Exhibition)',
      'connect_four',
      now,
      'Demonstration showcase bracket populated with Exhibition AI bots to preview PLAYNOVA bracket progression. Use Practice vs AI to start your own live exhibition run.',
      now,
      now
    );

    const demoParts = [
      { id: 'dp1', name: 'Apex AI Bot (Demo)', seed: 1, elim: 0 },
      { id: 'dp2', name: 'Tactician AI (Demo)', seed: 2, elim: 1 },
      { id: 'dp3', name: 'Nova Bot (Demo)', seed: 3, elim: 1 },
      { id: 'dp4', name: 'Scout AI (Demo)', seed: 4, elim: 1 },
    ];
    for (const p of demoParts) {
      db.prepare(
        'INSERT INTO tournament_participants (id, tournament_id, player_id, username, is_ai, seed, eliminated, joined_at) VALUES (?, ?, NULL, ?, 1, ?, ?, ?)'
      ).run(p.id, 'tour_demo_c4', p.name, p.seed, p.elim, now);
    }
    const demoMatches = [
      { id: 'dm1', r: 1, o: 1, a: 'Apex AI Bot (Demo)', b: 'Scout AI (Demo)', w: 'Apex AI Bot (Demo)', s: '4-1 (Demo)' },
      { id: 'dm2', r: 1, o: 2, a: 'Tactician AI (Demo)', b: 'Nova Bot (Demo)', w: 'Tactician AI (Demo)', s: '4-2 (Demo)' },
      { id: 'dm3', r: 2, o: 1, a: 'Apex AI Bot (Demo)', b: 'Tactician AI (Demo)', w: 'Apex AI Bot (Demo)', s: 'Championship Demo' },
    ];
    for (const m of demoMatches) {
      db.prepare(
        `INSERT INTO tournament_matches
         (id, tournament_id, round_number, match_order, player_a_name, player_b_name, winner_name, status, score_text, updated_at)
         VALUES (?, 'tour_demo_c4', ?, ?, ?, ?, ?, 'completed', ?, ?)`
      ).run(m.id, m.r, m.o, m.a, m.b, m.w, m.s, now);
    }
  }
}
seedDefaults();

export interface DbPlayer {
  id: string;
  email: string | null;
  username: string;
  password_hash: string | null;
  email_verified: number;
  security_password_hash: string | null;
  security_password_enabled: number;
  recovery_key_hash: string | null;
  xp: number;
  level: number;
  coins: number;
  points: number;
  current_streak: number;
  best_streak: number;
  profile_picture_file: string | null;
  active_frame: string;
  profile_theme: string;
  avatar_config_json: string;
  favorite_games_json: string;
  unlocked_cosmetics_json: string;
  settings_json: string;
  banned: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(secret, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function computeLevelFromXp(totalXp: number) {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  let needed = 250;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = 250 + (level - 1) * 125;
  }
  return { level, currentLevelXp: remaining, nextLevelXp: needed };
}

export function getPeriodKeys(date = new Date()) {
  const dailyKey = date.toISOString().slice(0, 10);
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weeklyKey = `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  return { dailyKey, weeklyKey };
}

export function createNotification(
  playerId: string,
  title: string,
  message: string,
  kind: 'reward' | 'achievement' | 'challenge' | 'tournament' | 'invite' | 'announcement' | 'system'
) {
  db.prepare(
    'INSERT INTO notifications (id, player_id, title, message, kind, read_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)'
  ).run(crypto.randomUUID(), playerId, title, message, kind, new Date().toISOString());
}

export function logCoinTransaction(params: {
  playerId: string;
  amount: number;
  balanceAfter: number;
  category: 'starter' | 'match' | 'challenge' | 'achievement' | 'tournament' | 'shop' | 'admin';
  description: string;
}) {
  db.prepare(
    'INSERT INTO coin_transactions (id, player_id, amount, balance_after, category, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    params.playerId,
    Math.round(params.amount),
    Math.max(0, Math.round(params.balanceAfter)),
    params.category,
    params.description.slice(0, 180),
    new Date().toISOString()
  );
}

export function logLinkPreviewRequest(params: {
  playerId: string | null;
  url: string;
  status: 'ok' | 'fallback' | 'error';
  fallbackReason?: string | null;
  latencyMs: number;
}) {
  db.prepare(
    'INSERT INTO link_preview_logs (id, player_id, url, status, fallback_reason, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    crypto.randomUUID(),
    params.playerId,
    params.url.slice(0, 500),
    params.status,
    params.fallbackReason || null,
    Math.round(params.latencyMs),
    new Date().toISOString()
  );
}

export function logServerError(route: string, level: 'warn' | 'error', message: string) {
  db.prepare('INSERT INTO error_logs (id, route, level, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
    crypto.randomUUID(),
    route,
    level,
    message.slice(0, 400),
    new Date().toISOString()
  );
}

export function unlockAchievement(playerId: string, key: string): boolean {
  const existing = db
    .prepare('SELECT 1 FROM player_achievements WHERE player_id = ? AND achievement_key = ?')
    .get(playerId, key);
  if (existing) return false;

  const cfg = db.prepare('SELECT title, xp_reward, coin_reward FROM achievement_configs WHERE key = ?').get(key) as
    | { title: string; xp_reward: number; coin_reward: number }
    | undefined;
  if (!cfg) return false;

  const now = new Date().toISOString();
  db.prepare('INSERT INTO player_achievements (player_id, achievement_key, unlocked_at) VALUES (?, ?, ?)').run(
    playerId,
    key,
    now
  );

  const player = db.prepare('SELECT xp, coins FROM players WHERE id = ?').get(playerId) as { xp: number; coins: number };
  const nextXp = player.xp + cfg.xp_reward;
  const nextCoins = player.coins + cfg.coin_reward;
  const lvl = computeLevelFromXp(nextXp);
  db.prepare('UPDATE players SET xp = ?, level = ?, coins = ?, updated_at = ? WHERE id = ?').run(
    nextXp,
    lvl.level,
    nextCoins,
    now,
    playerId
  );

  logCoinTransaction({
    playerId,
    amount: cfg.coin_reward,
    balanceAfter: nextCoins,
    category: 'achievement',
    description: `Achievement unlocked: ${cfg.title}`,
  });

  createNotification(
    playerId,
    `Achievement Unlocked: ${cfg.title}`,
    `Earned +${cfg.xp_reward} XP and +${cfg.coin_reward} Virtual Coins.`,
    'achievement'
  );
  return true;
}

export function sanitizePlayer(row: DbPlayer): PlayerProfile {
  const lvl = computeLevelFromXp(row.xp);
  const settings: PlayerSettings = {
    ...DEFAULT_PLAYER_SETTINGS,
    ...(JSON.parse(row.settings_json || '{}') as Partial<PlayerSettings>),
  };
  const avatarConfig: AvatarConfig = {
    ...DEFAULT_AVATAR_CONFIG,
    ...(JSON.parse(row.avatar_config_json || '{}') as Partial<AvatarConfig>),
  };
  const favoriteGames = JSON.parse(row.favorite_games_json || '[]') as GameId[];
  const unlockedCosmetics = JSON.parse(
    row.unlocked_cosmetics_json || '["frame_slate","theme_midnight_nova"]'
  ) as string[];

  const matchRows = db
    .prepare(
      `SELECT game_id, outcome, score_delta
       FROM match_records
       WHERE player_id = ?`
    )
    .all(row.id) as Array<{ game_id: GameId; outcome: 'win' | 'loss' | 'draw'; score_delta: number }>;

  const emptyGame = (): GameStatsBreakdown => ({
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    bestScore: 0,
  });

  const byGame = {} as Record<GameId, GameStatsBreakdown>;
  for (const gid of ALL_GAME_IDS) {
    byGame[gid] = emptyGame();
  }

  let totalWins = 0;
  let totalLosses = 0;
  let totalDraws = 0;

  for (const m of matchRows) {
    const bucket = byGame[m.game_id];
    if (!bucket) continue;
    bucket.played += 1;
    bucket.points += Math.max(0, m.score_delta);
    if (m.score_delta > bucket.bestScore) bucket.bestScore = m.score_delta;
    if (m.outcome === 'win') {
      bucket.wins += 1;
      totalWins += 1;
    } else if (m.outcome === 'loss') {
      bucket.losses += 1;
      totalLosses += 1;
    } else {
      bucket.draws += 1;
      totalDraws += 1;
    }
  }

  return {
    id: row.id,
    username: row.username,
    xp: row.xp,
    level: lvl.level,
    currentLevelXp: lvl.currentLevelXp,
    nextLevelXp: lvl.nextLevelXp,
    coins: row.coins,
    points: row.points,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    profilePictureUrl: row.profile_picture_file ? `/api/uploads/avatars/${row.profile_picture_file}` : null,
    activeFrame: row.active_frame || 'frame_slate',
    profileTheme: row.profile_theme || 'theme_midnight_nova',
    avatarConfig,
    favoriteGames,
    unlockedCosmetics,
    settings,
    stats: {
      totalPlayed: matchRows.length,
      totalWins,
      totalLosses,
      totalDraws,
      byGame,
    },
    banned: Boolean(row.banned),
    hasRecoveryKey: Boolean(row.recovery_key_hash),
    createdAt: row.created_at,
  };
}

export function recordMatchAndProgress(params: {
  playerId: string;
  gameId: GameId;
  mode: string;
  difficulty: DifficultyLevel;
  outcome: 'win' | 'loss' | 'draw';
  opponentLabel: string;
  scoreDelta: number;
  xpEarned: number;
  coinsEarned: number;
  durationSec: number;
  summary: string;
  attemptsUsed?: number;
  isDailyChallenge?: boolean;
}) {
  const now = new Date().toISOString();
  const matchId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO match_records
     (id, player_id, game_id, mode, difficulty, outcome, opponent_label, score_delta, xp_earned, coins_earned, duration_sec, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    matchId,
    params.playerId,
    params.gameId,
    params.mode,
    params.difficulty,
    params.outcome,
    params.opponentLabel,
    params.scoreDelta,
    params.xpEarned,
    params.coinsEarned,
    Math.max(1, params.durationSec),
    params.summary,
    now
  );

  const cur = db.prepare('SELECT xp, coins, points, current_streak, best_streak FROM players WHERE id = ?').get(
    params.playerId
  ) as { xp: number; coins: number; points: number; current_streak: number; best_streak: number };

  const nextStreak =
    params.outcome === 'win' ? cur.current_streak + 1 : params.outcome === 'draw' ? cur.current_streak : 0;
  const nextBestStreak = Math.max(cur.best_streak, nextStreak);
  const nextXp = cur.xp + params.xpEarned;
  const nextCoins = cur.coins + params.coinsEarned;
  const lvl = computeLevelFromXp(nextXp);

  db.prepare(
    `UPDATE players
     SET xp = ?, level = ?, coins = ?, points = points + ?,
         current_streak = ?, best_streak = ?, updated_at = ?, last_seen_at = ?
     WHERE id = ?`
  ).run(
    nextXp,
    lvl.level,
    nextCoins,
    params.scoreDelta,
    nextStreak,
    nextBestStreak,
    now,
    now,
    params.playerId
  );

  if (params.coinsEarned > 0) {
    logCoinTransaction({
      playerId: params.playerId,
      amount: params.coinsEarned,
      balanceAfter: nextCoins,
      category: 'match',
      description: `${params.gameId.replace('_', ' ')} (${params.outcome}): ${params.summary}`,
    });
  }

  // Update Daily & Weekly Challenge Progress
  const { dailyKey, weeklyKey } = getPeriodKeys();
  const challenges = db.prepare('SELECT * FROM challenge_configs WHERE active = 1').all() as Array<{
    id: string;
    kind: 'daily' | 'weekly';
    game_id: string;
    title: string;
    target_count: number;
    xp_reward: number;
    coin_reward: number;
  }>;

  const completedChallengeTitles: string[] = [];
  for (const ch of challenges) {
    if (ch.game_id !== 'any' && ch.game_id !== params.gameId) continue;
    const requiresWin = ch.id !== 'weekly_streak_master';
    if (requiresWin && params.outcome !== 'win') continue;

    const periodKey = ch.kind === 'daily' ? dailyKey : weeklyKey;
    const row = db
      .prepare('SELECT progress, completed_at FROM player_challenge_progress WHERE player_id = ? AND challenge_id = ? AND period_key = ?')
      .get(params.playerId, ch.id, periodKey) as { progress: number; completed_at: string | null } | undefined;

    if (row?.completed_at) continue;
    const nextProg = Math.min(ch.target_count, (row?.progress ?? 0) + 1);
    const finished = nextProg >= ch.target_count;
    db.prepare(
      `INSERT INTO player_challenge_progress (player_id, challenge_id, period_key, progress, completed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(player_id, challenge_id, period_key) DO UPDATE SET
         progress = excluded.progress,
         completed_at = COALESCE(player_challenge_progress.completed_at, excluded.completed_at)`
    ).run(params.playerId, ch.id, periodKey, nextProg, finished ? now : null);

    if (finished) {
      completedChallengeTitles.push(ch.title);
      const latest = db.prepare('SELECT xp, coins FROM players WHERE id = ?').get(params.playerId) as {
        xp: number;
        coins: number;
      };
      const bonusXp = latest.xp + ch.xp_reward;
      const bonusCoins = latest.coins + ch.coin_reward;
      const bonusLvl = computeLevelFromXp(bonusXp);
      db.prepare('UPDATE players SET xp = ?, level = ?, coins = ?, updated_at = ? WHERE id = ?').run(
        bonusXp,
        bonusLvl.level,
        bonusCoins,
        now,
        params.playerId
      );
      logCoinTransaction({
        playerId: params.playerId,
        amount: ch.coin_reward,
        balanceAfter: bonusCoins,
        category: 'challenge',
        description: `Challenge completed: ${ch.title}`,
      });
      createNotification(
        params.playerId,
        `Challenge Complete: ${ch.title}`,
        `Bonus awarded: +${ch.xp_reward} XP & +${ch.coin_reward} Coins!`,
        'challenge'
      );
    }
  }

  // Evaluate Achievements
  const newlyUnlocked: string[] = [];
  if (params.outcome === 'win' && unlockAchievement(params.playerId, 'first_victory')) {
    newlyUnlocked.push('first_victory');
  }
  if (params.gameId === 'tictactoe' && params.difficulty === 'hard' && params.outcome !== 'loss') {
    if (unlockAchievement(params.playerId, 'ttt_draw_unbeatable')) newlyUnlocked.push('ttt_draw_unbeatable');
  }
  if (params.gameId === 'chess' && params.outcome === 'win') {
    if (unlockAchievement(params.playerId, 'chess_tactician')) newlyUnlocked.push('chess_tactician');
  }
  if (params.gameId === 'connect_four' && params.outcome === 'win') {
    if (unlockAchievement(params.playerId, 'connect4_ace')) newlyUnlocked.push('connect4_ace');
  }
  if (params.gameId === 'rps' && nextStreak >= 3) {
    if (unlockAchievement(params.playerId, 'rps_streak_3')) newlyUnlocked.push('rps_streak_3');
  }
  if (params.gameId === 'guess_number' && params.outcome === 'win' && (params.attemptsUsed ?? 99) <= 4) {
    if (unlockAchievement(params.playerId, 'guess_sharpshooter')) newlyUnlocked.push('guess_sharpshooter');
  }
  if (params.gameId === 'guess_number' && params.outcome === 'win' && params.isDailyChallenge) {
    if (unlockAchievement(params.playerId, 'daily_challenger')) newlyUnlocked.push('daily_challenger');
  }

  const tttWins = (
    db
      .prepare("SELECT COUNT(*) as c FROM match_records WHERE player_id = ? AND game_id = 'tictactoe' AND outcome = 'win'")
      .get(params.playerId) as { c: number }
  ).c;
  if (tttWins >= 5 && unlockAchievement(params.playerId, 'ttt_strategist')) {
    newlyUnlocked.push('ttt_strategist');
  }

  const distinctWins = (
    db
      .prepare("SELECT COUNT(DISTINCT game_id) as c FROM match_records WHERE player_id = ? AND outcome = 'win'")
      .get(params.playerId) as { c: number }
  ).c;
  if (distinctWins >= 4 && unlockAchievement(params.playerId, 'brain_polymath')) {
    newlyUnlocked.push('brain_polymath');
  }

  const totalMatches = (
    db.prepare('SELECT COUNT(*) as c FROM match_records WHERE player_id = ?').get(params.playerId) as { c: number }
  ).c;
  if (totalMatches >= 15 && unlockAchievement(params.playerId, 'veteran_15')) {
    newlyUnlocked.push('veteran_15');
  }

  const updatedRow = db.prepare('SELECT * FROM players WHERE id = ?').get(params.playerId) as DbPlayer;
  return {
    player: sanitizePlayer(updatedRow),
    newlyUnlocked,
    completedChallenges: completedChallengeTitles,
  };
}

export function listTournaments(currentPlayerId: string | null = null): TournamentItem[] {
  const rows = db
    .prepare('SELECT * FROM tournaments ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    title: string;
    game_id: GameId;
    competition_type: 'scheduled' | 'exhibition_demo';
    status: 'registration' | 'active' | 'completed';
    max_players: number;
    entry_fee_coins: number;
    prize_coins: number;
    starts_at: string;
    description: string;
    winner_username: string | null;
  }>;

  return rows.map((t) => {
    const parts = db
      .prepare(
        'SELECT id, player_id as playerId, username, is_ai as isAi, seed, eliminated FROM tournament_participants WHERE tournament_id = ? ORDER BY seed ASC'
      )
      .all(t.id) as Array<{
      id: string;
      playerId: string | null;
      username: string;
      isAi: number;
      seed: number;
      eliminated: number;
    }>;

    const matches = db
      .prepare(
        `SELECT id, round_number as roundNumber, match_order as matchOrder,
                player_a_name as playerAName, player_b_name as playerBName,
                player_a_id as playerAId, player_b_id as playerBId,
                winner_name as winnerName, winner_id as winnerId,
                status, score_text as scoreText
         FROM tournament_matches
         WHERE tournament_id = ?
         ORDER BY round_number ASC, match_order ASC`
      )
      .all(t.id) as TournamentMatchItem[];

    return {
      id: t.id,
      title: t.title,
      gameId: t.game_id,
      competitionType: t.competition_type,
      status: t.status,
      maxPlayers: t.max_players,
      entryFeeCoins: t.entry_fee_coins,
      prizeCoins: t.prize_coins,
      startsAt: t.starts_at,
      description: t.description,
      winnerUsername: t.winner_username,
      participantCount: parts.length,
      isRegistered: Boolean(currentPlayerId && parts.some((p) => p.playerId === currentPlayerId)),
      participants: parts.map((p) => ({
        id: p.id,
        playerId: p.playerId,
        username: p.username,
        isAi: Boolean(p.isAi),
        seed: p.seed,
        eliminated: Boolean(p.eliminated),
      })),
      matches,
    };
  });
}
