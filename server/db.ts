import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ACHIEVEMENTS,
  DEFAULT_CHALLENGES,
  DEFAULT_COSMETIC_REWARDS,
  DEFAULT_PLAYER_SETTINGS,
} from '../src/game/catalog.ts';
import type {
  DifficultyLevel,
  GameId,
  GameStatsBreakdown,
  PlayerProfile,
  PlayerSettings,
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
    unlocked_cosmetics_json TEXT NOT NULL DEFAULT '["frame_slate"]',
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_players_username_nocase ON players(LOWER(username));

  CREATE TABLE IF NOT EXISTS email_codes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );

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
  const parsed = row ? Number(row.value) : 3;
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 3;
}

const existingOgVer = db.prepare("SELECT value FROM site_settings WHERE key = 'og_preview_version'").get() as
  | { value: string }
  | undefined;
if (!existingOgVer || Number(existingOgVer.value) < 3) {
  db.prepare(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ('og_preview_version', '3', ?)
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
  const chCount = (db.prepare('SELECT COUNT(*) as c FROM challenge_configs').get() as { c: number }).c;
  if (chCount === 0) {
    const ins = db.prepare(
      'INSERT INTO challenge_configs (id, kind, game_id, title, description, target_count, xp_reward, coin_reward, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
    );
    for (const c of DEFAULT_CHALLENGES) {
      ins.run(c.id, c.kind, c.gameId, c.title, c.description, c.targetCount, c.xpReward, c.coinReward, now);
    }
  }

  const achCount = (db.prepare('SELECT COUNT(*) as c FROM achievement_configs').get() as { c: number }).c;
  if (achCount === 0) {
    const ins = db.prepare(
      'INSERT INTO achievement_configs (key, title, description, category, xp_reward, coin_reward, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const a of DEFAULT_ACHIEVEMENTS) {
      ins.run(a.key, a.title, a.description, a.category, a.xpReward, a.coinReward, now);
    }
  }

  const rwCount = (db.prepare('SELECT COUNT(*) as c FROM reward_catalog').get() as { c: number }).c;
  if (rwCount === 0) {
    const ins = db.prepare(
      'INSERT INTO reward_catalog (id, name, category, description, coin_cost, accent_hex, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const r of DEFAULT_COSMETIC_REWARDS) {
      ins.run(r.id, r.name, r.category, r.description, r.coinCost, r.accentHex, now);
    }
  }

  // Ensure newer columns exist and migrate legacy NOT NULL email/password constraints safely
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
        unlocked_cosmetics_json TEXT NOT NULL DEFAULT '["frame_slate"]',
        settings_json TEXT NOT NULL DEFAULT '{}',
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
  } else if (!colMap.has('recovery_key_hash')) {
    db.exec('ALTER TABLE players ADD COLUMN recovery_key_hash TEXT');
  }

  const tttCols = db.prepare('PRAGMA table_info(active_ttt_sessions)').all() as Array<{ name: string }>;
  const tttColSet = new Set(tttCols.map((c) => c.name));
  if (!tttColSet.has('board_size')) {
    db.exec('ALTER TABLE active_ttt_sessions ADD COLUMN board_size INTEGER NOT NULL DEFAULT 3');
  }
  if (!tttColSet.has('win_target')) {
    db.exec('ALTER TABLE active_ttt_sessions ADD COLUMN win_target INTEGER NOT NULL DEFAULT 3');
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
  unlocked_cosmetics_json: string;
  settings_json: string;
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
  kind: 'reward' | 'achievement' | 'challenge' | 'system'
) {
  db.prepare(
    'INSERT INTO notifications (id, player_id, title, message, kind, read_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)'
  ).run(crypto.randomUUID(), playerId, title, message, kind, new Date().toISOString());
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
  const lvl = computeLevelFromXp(nextXp);
  db.prepare('UPDATE players SET xp = ?, level = ?, coins = coins + ?, updated_at = ? WHERE id = ?').run(
    nextXp,
    lvl.level,
    cfg.coin_reward,
    now,
    playerId
  );

  createNotification(
    playerId,
    `Achievement Unlocked: ${cfg.title}`,
    `Earned +${cfg.xp_reward} XP and +${cfg.coin_reward} Coins.`,
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
  const unlockedCosmetics = JSON.parse(row.unlocked_cosmetics_json || '["frame_slate"]') as string[];

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

  const byGame: Record<GameId, GameStatsBreakdown> = {
    tictactoe: emptyGame(),
    rps: emptyGame(),
    guess_number: emptyGame(),
  };

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
    unlockedCosmetics,
    settings,
    stats: {
      totalPlayed: matchRows.length,
      totalWins,
      totalLosses,
      totalDraws,
      byGame,
    },
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
  const lvl = computeLevelFromXp(nextXp);

  db.prepare(
    `UPDATE players
     SET xp = ?, level = ?, coins = coins + ?, points = points + ?,
         current_streak = ?, best_streak = ?, updated_at = ?, last_seen_at = ?
     WHERE id = ?`
  ).run(
    nextXp,
    lvl.level,
    params.coinsEarned,
    params.scoreDelta,
    nextStreak,
    nextBestStreak,
    now,
    now,
    params.playerId
  );

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
    // Win-targeted challenges only increment on win; Weekly Contender increments on any completed match
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
      const latest = db.prepare('SELECT xp FROM players WHERE id = ?').get(params.playerId) as { xp: number };
      const bonusXp = latest.xp + ch.xp_reward;
      const bonusLvl = computeLevelFromXp(bonusXp);
      db.prepare('UPDATE players SET xp = ?, level = ?, coins = coins + ?, updated_at = ? WHERE id = ?').run(
        bonusXp,
        bonusLvl.level,
        ch.coin_reward,
        now,
        params.playerId
      );
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

  const totalMatches = (
    db.prepare('SELECT COUNT(*) as c FROM match_records WHERE player_id = ?').get(params.playerId) as { c: number }
  ).c;
  if (totalMatches >= 15 && unlockAchievement(params.playerId, 'veteran_15')) {
    newlyUnlocked.push('veteran_15');
  }

  const updatedRow = db.prepare('SELECT * FROM players WHERE id = ?').get(params.playerId) as DbPlayer;
  return {
    matchId,
    player: sanitizePlayer(updatedRow),
    newlyUnlocked,
    completedChallenges: completedChallengeTitles,
  };
}
