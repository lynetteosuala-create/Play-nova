import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  ALL_GAME_IDS,
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_PLAYER_SETTINGS,
  GAME_CATALOG,
  GUESS_PRESETS,
} from './src/game/catalog.ts';
import { normalizeTttConfig } from './src/game/tttRules.ts';
import type { AvatarConfig, CoinTransactionItem, DifficultyLevel, GameId, PlayerSettings } from './src/types.ts';
import {
  avatarUploadsDir,
  bumpPreviewCacheVersion,
  createNotification,
  db,
  type DbPlayer,
  dbPath,
  getPeriodKeys,
  getPreviewCacheVersion,
  hashSecret,
  listTournaments,
  logCoinTransaction,
  logLinkPreviewRequest,
  logServerError,
  recordMatchAndProgress,
  sanitizePlayer,
  sha256,
  unlockAchievement,
  verifySecret,
} from './server/db.ts';
import {
  chooseRpsAiMove,
  chooseTttAiMove,
  evaluateTttBoard,
  resolveRpsOutcome,
  type RpsMove,
  type TttCell,
} from './server/gameEngine.ts';
import { fetchLinkPreview } from './server/linkPreview.ts';
import { attachRealtimeServer } from './server/realtime.ts';

interface AuthedPlayerRequest extends Request {
  player?: DbPlayer;
  sessionToken?: string;
}

const SERVER_STARTED_AT = Date.now();
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const ADMIN_SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

// Sliding-window rate limiter per IP + bucket
const rateBuckets = new Map<string, number[]>();
function rateLimit(bucket: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const hits = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (hits.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment before trying again.' });
      return;
    }
    hits.push(now);
    rateBuckets.set(key, hits);
    next();
  };
}

function extractToken(req: Request, cookieName: string, headerName = 'authorization'): string | null {
  const headerVal = req.headers[headerName];
  if (typeof headerVal === 'string') {
    if (headerVal.startsWith('Bearer ')) return headerVal.slice(7).trim();
    if (headerVal.trim()) return headerVal.trim();
  }
  const cookieHeader = req.headers.cookie || '';
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setHttpCookie(res: Response, name: string, token: string, maxAgeMs: number) {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL?.startsWith('https://'));
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: maxAgeMs,
    path: '/',
  });
}

function createPlayerSession(res: Response, playerId: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO player_sessions (id, player_id, token_hash, expires_at, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(crypto.randomUUID(), playerId, sha256(rawToken), now + SESSION_DURATION_MS, now, now);
  setHttpCookie(res, 'gv_session', rawToken, SESSION_DURATION_MS);
  return rawToken;
}

function getAuthenticatedPlayer(req: Request): {
  player: DbPlayer;
  token: string;
  expired: boolean;
  banned: boolean;
} {
  const token = extractToken(req, 'gv_session', 'authorization');
  if (!token) return { player: undefined as unknown as DbPlayer, token: '', expired: false, banned: false };
  const now = Date.now();
  const sess = db
    .prepare('SELECT player_id, expires_at FROM player_sessions WHERE token_hash = ?')
    .get(sha256(token)) as { player_id: string; expires_at: number } | undefined;

  if (!sess) {
    return { player: undefined as unknown as DbPlayer, token, expired: true, banned: false };
  }
  if (sess.expires_at <= now) {
    db.prepare('DELETE FROM player_sessions WHERE token_hash = ?').run(sha256(token));
    return { player: undefined as unknown as DbPlayer, token, expired: true, banned: false };
  }

  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(sess.player_id) as DbPlayer | undefined;
  if (!row) {
    return { player: undefined as unknown as DbPlayer, token, expired: true, banned: false };
  }
  if (row.banned) {
    db.prepare('DELETE FROM player_sessions WHERE token_hash = ?').run(sha256(token));
    return { player: undefined as unknown as DbPlayer, token, expired: false, banned: true };
  }

  db.prepare('UPDATE player_sessions SET last_active_at = ? WHERE token_hash = ?').run(now, sha256(token));
  db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  return { player: row, token, expired: false, banned: false };
}

function requirePlayer(req: AuthedPlayerRequest, res: Response, next: NextFunction) {
  const auth = getAuthenticatedPlayer(req);
  if (auth.banned) {
    res.status(403).json({
      code: 'PLAYER_BANNED',
      error: 'This PLAYNOVA username has been suspended by an administrator.',
    });
    return;
  }
  if (!auth.player) {
    res.status(401).json({
      code: auth.expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED',
      error: auth.expired
        ? 'Your session expired. Enter your username to resume playing.'
        : 'Enter a username to access PLAYNOVA.',
    });
    return;
  }
  req.player = auth.player;
  req.sessionToken = auth.token;
  next();
}

function isAdminAuthenticated(req: Request): boolean {
  const token = extractToken(req, 'gv_admin_session', 'x-admin-token');
  if (!token) return false;
  const row = db
    .prepare('SELECT id FROM admin_sessions WHERE token_hash = ? AND expires_at > ?')
    .get(sha256(token), Date.now()) as { id: string } | undefined;
  return Boolean(row);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminAuthenticated(req)) {
    res.status(403).json({ error: 'Administrator authentication required.' });
    return;
  }
  next();
}

function normalizeUsername(raw: unknown): string {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9 _.-]{2,24}$/.test(username);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detectImageTypeFromBuffer(buf: Buffer): { mime: string; ext: 'png' | 'jpg' | 'webp' } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  const httpServer = http.createServer(app);
  const realtime = attachRealtimeServer(httpServer);

  // Clean SVG brand emblem favicon
  app.get('/favicon.svg', (_req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#060811"/><rect x="4" y="4" width="56" height="56" rx="11" fill="#0E1324" stroke="#8B5CF6" stroke-width="2.5"/><path d="M22 18h14a10 10 0 0 1 0 20H22V18Zm0 20v10" stroke="#38BDF8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="44" cy="44" r="5" fill="#F97316"/></svg>`
    );
  });

  // Crawler-friendly robots.txt (explicitly allow all social link-preview bots)
  app.get('/robots.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('X-Robots-Tag', 'all');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Allow: /og-hero.jpg',
        'Allow: /share-media/',
        'Allow: /games/',
        'Allow: /tournaments',
        'Allow: /leaderboard',
        'Disallow: /api/admin/',
        '',
        'User-agent: WhatsApp',
        'Allow: /',
        '',
        'User-agent: TelegramBot',
        'Allow: /',
        '',
        'User-agent: facebookexternalhit',
        'Allow: /',
        '',
        'User-agent: Facebot',
        'Allow: /',
        '',
        'User-agent: Twitterbot',
        'Allow: /',
        '',
        'User-agent: Discordbot',
        'Allow: /',
        '',
        'User-agent: Slackbot',
        'Allow: /',
        '',
        'User-agent: LinkedInBot',
        'Allow: /',
        '',
      ].join('\n')
    );
  });

  function sendPublicShareImage(req: Request, res: Response, filePath: string) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'all');
    const hasVersionQuery = typeof req.query.v === 'string' && req.query.v.length > 0;
    res.setHeader(
      'Cache-Control',
      hasVersionQuery ? 'public, max-age=31536000, immutable' : 'public, max-age=300, must-revalidate'
    );
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }

  // Primary public HTTPS Open Graph / Twitter Card hero image
  app.get('/og-hero.jpg', (req, res) => {
    const filePath = path.resolve(process.cwd(), 'src/assets/images', 'pn_social_preview_1795280294177.jpg');
    sendPublicShareImage(req, res, filePath);
  });

  // Shareable generated game artwork for WhatsApp / Telegram / Facebook / X social cards
  app.get('/share-media/:key', (req, res) => {
    const cleanKey = String(req.params.key || 'hero').replace(/\.(jpg|jpeg)$/i, '').toLowerCase();
    const mediaMap: Record<string, string> = {
      hero: 'pn_social_preview_1795280294177.jpg',
      strategy: 'pn_cat_strategy_1795280295307.jpg',
      brain: 'pn_cat_brain_1795280296543.jpg',
      arcade: 'pn_cat_arcade_1795280296081.jpg',
      tictactoe: 'gv_card_tictactoe_1794676068935.jpg',
      rps: 'gv_card_rps_1794676069274.jpg',
      guess_number: 'gv_card_guess_1794676069754.jpg',
      connect_four: 'pn_cat_strategy_1795280295307.jpg',
      chess: 'pn_cat_strategy_1795280295307.jpg',
      sudoku: 'pn_cat_brain_1795280296543.jpg',
      word_battle: 'pn_cat_brain_1795280296543.jpg',
      pattern_recognition: 'pn_cat_brain_1795280296543.jpg',
      memory_match: 'pn_cat_arcade_1795280296081.jpg',
      trivia_challenge: 'pn_cat_arcade_1795280296081.jpg',
      quick_math: 'pn_cat_arcade_1795280296081.jpg',
      reaction_test: 'pn_cat_arcade_1795280296081.jpg',
    };
    const filename = mediaMap[cleanKey] || mediaMap.hero;
    const filePath = path.resolve(process.cwd(), 'src/assets/images', filename);
    sendPublicShareImage(req, res, filePath);
  });

  // Serve uploaded profile pictures safely
  app.get('/api/uploads/avatars/:filename', (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    if (!/^[a-zA-Z0-9._-]+\.(png|jpg|webp)$/.test(safeName)) {
      res.status(400).json({ error: 'Invalid filename.' });
      return;
    }
    const targetPath = path.join(avatarUploadsDir, safeName);
    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'Profile picture not found.' });
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.sendFile(targetPath);
  });

  const DEFAULT_PUBLISHED_URL = 'https://ais-pre-vbuddmjblu7tkeur2qw7jw-599653174653.europe-west2.run.app';

  function resolveCanonicalPublishedBaseUrl(req?: Request): string {
    if (process.env.PUBLIC_APP_URL) {
      return process.env.PUBLIC_APP_URL.replace(/\/+$/, '');
    }
    if (req) {
      const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
      const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const lowerHost = host.toLowerCase();
      if (
        lowerHost &&
        !lowerHost.startsWith('localhost') &&
        !lowerHost.startsWith('127.0.0.1') &&
        !lowerHost.startsWith('0.0.0.0') &&
        !lowerHost.startsWith('ais-dev-')
      ) {
        return `${proto === 'http' ? 'https' : proto}://${host}`;
      }
    }
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace('https://ais-dev-', 'https://ais-pre-').replace(/\/+$/, '');
    }
    return DEFAULT_PUBLISHED_URL;
  }

  function resolveShareMetadata(req?: Request, pathOverride?: string) {
    const baseUrl = resolveCanonicalPublishedBaseUrl(req);
    const reqPath = pathOverride ?? req?.path ?? '/';
    const cleanPath = reqPath.toLowerCase();
    const versionFromQuery = typeof req?.query?.v === 'string' && /^\d+$/.test(req.query.v) ? req.query.v : null;
    const version = versionFromQuery || String(getPreviewCacheVersion());
    const canonicalPath = reqPath === '/' ? '/' : reqPath;

    const matchedGame = GAME_CATALOG.find((g) => cleanPath.includes(`/games/${g.id}`) || cleanPath.endsWith(`/${g.id}`));
    if (matchedGame) {
      return {
        title: `${matchedGame.name} — PLAYNOVA`,
        description: `${matchedGame.description} Enter with just a username on PLAYNOVA.`,
        imageUrl: `${baseUrl}/share-media/${matchedGame.id}.jpg?v=${version}`,
        imageWidth: 1200,
        imageHeight: 896,
        imageAlt: `PLAYNOVA ${matchedGame.name} arena artwork`,
        canonicalUrl: `${baseUrl}${canonicalPath}`,
        version,
      };
    }
    if (cleanPath.includes('tournaments')) {
      return {
        title: 'Tournaments & Brackets — PLAYNOVA',
        description:
          'Join scheduled multiplayer cups and exhibition brackets on PLAYNOVA. Win virtual coins and climb rankings.',
        imageUrl: `${baseUrl}/og-hero.jpg?v=${version}`,
        imageWidth: 1376,
        imageHeight: 768,
        imageAlt: 'PLAYNOVA Tournaments and Brackets',
        canonicalUrl: `${baseUrl}${canonicalPath}`,
        version,
      };
    }
    if (cleanPath.includes('leaderboard')) {
      return {
        title: 'Global Leaderboards — PLAYNOVA',
        description:
          'Compare all-time, monthly, and weekly rankings across 12 playable arenas on PLAYNOVA.',
        imageUrl: `${baseUrl}/og-hero.jpg?v=${version}`,
        imageWidth: 1376,
        imageHeight: 768,
        imageAlt: 'PLAYNOVA Global Leaderboards arena',
        canonicalUrl: `${baseUrl}${canonicalPath}`,
        version,
      };
    }
    return {
      title: 'PLAYNOVA — Enter. Compete. Conquer.',
      description:
        'Challenge intelligent AI opponents, compete in real-time multiplayer rooms, play 12 skill mini-games, and earn virtual rewards with just a username.',
      imageUrl: `${baseUrl}/og-hero.jpg?v=${version}`,
      imageWidth: 1376,
      imageHeight: 768,
      imageAlt: 'PLAYNOVA — Enter. Compete. Conquer. futuristic gaming preview with gamers, coins and trophies',
      canonicalUrl: `${baseUrl}${canonicalPath}`,
      version,
    };
  }

  function injectSocialMetaTags(rawHtml: string, req: Request): string {
    const meta = resolveShareMetadata(req);
    const metaBlock = [
      `<title>${escapeHtml(meta.title)}</title>`,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`,
      `<meta name="robots" content="index, follow, max-image-preview:large" />`,
      `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />`,
      `<meta property="og:site_name" content="PLAYNOVA" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:locale" content="en_US" />`,
      `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />`,
      `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
      `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`,
      `<meta property="og:image:secure_url" content="${escapeHtml(meta.imageUrl)}" />`,
      `<meta property="og:image:type" content="image/jpeg" />`,
      `<meta property="og:image:width" content="${meta.imageWidth}" />`,
      `<meta property="og:image:height" content="${meta.imageHeight}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`,
      `<meta name="twitter:image:alt" content="${escapeHtml(meta.imageAlt)}" />`,
    ].join('\n    ');

    return rawHtml
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>\s*/gi, '')
      .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
      .replace('<meta name="viewport"', `${metaBlock}\n    <meta name="viewport"`);
  }

  // =========================================================================
  // 01. USERNAME-ONLY PLAYER ENTRY, OPTIONAL PROGRESS RECOVERY & SESSIONS
  // =========================================================================

  app.get('/api/public/stats', (_req, res) => {
    const rt = realtime.getTelemetry();
    const totalPlayers = (db.prepare('SELECT COUNT(*) as c FROM players').get() as { c: number }).c;
    const totalMatches = (db.prepare('SELECT COUNT(*) as c FROM match_records').get() as { c: number }).c;
    res.json({
      onlinePlayers: rt.onlineConnections,
      activeRooms: rt.activeRooms,
      totalPlayers,
      totalMatches,
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const auth = getAuthenticatedPlayer(req);
    if (auth.banned) {
      res.status(403).json({
        authenticated: false,
        code: 'PLAYER_BANNED',
        error: 'This PLAYNOVA username has been suspended by an administrator.',
      });
      return;
    }
    if (!auth.player) {
      if (auth.expired) {
        res.status(401).json({
          authenticated: false,
          code: 'SESSION_EXPIRED',
          error: 'Your session expired. Enter your username to continue.',
        });
        return;
      }
      res.json({
        authenticated: false,
      });
      return;
    }
    res.json({
      authenticated: true,
      token: auth.token,
      player: sanitizePlayer(auth.player),
    });
  });

  app.get('/api/players/check-username', (req, res) => {
    const username = normalizeUsername(req.query.username);
    if (!isValidUsername(username)) {
      res.json({
        valid: false,
        available: false,
        reason: 'Use 2–24 characters (letters, numbers, spaces, dots, hyphens, underscores).',
      });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM players WHERE LOWER(username) = LOWER(?)')
      .get(username) as { id: string } | undefined;
    res.json({
      valid: true,
      available: !existing,
      reason: existing ? 'That username is already active. Pick a fresh username to jump right in.' : undefined,
    });
  });

  app.post('/api/players/enter', rateLimit('player-enter', 30, 60_000), (req, res) => {
    const username = normalizeUsername(req.body?.username);
    if (!isValidUsername(username)) {
      res.status(400).json({
        error: 'Username must be 2–24 characters (letters, numbers, spaces, dots, hyphens, underscores).',
      });
      return;
    }

    const existing = db
      .prepare('SELECT id, banned FROM players WHERE LOWER(username) = LOWER(?)')
      .get(username) as { id: string; banned: number } | undefined;
    if (existing) {
      if (existing.banned) {
        res.status(403).json({
          error: 'That username is suspended. Please choose a different username.',
        });
        return;
      }
      res.status(409).json({
        error: 'That username is already taken. Try adding a number or tag to claim your arena handle.',
      });
      return;
    }

    const playerId = crypto.randomUUID();
    const now = new Date().toISOString();
    const recoveryKey = `PN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    db.prepare(
      `INSERT INTO players
       (id, email, username, password_hash, email_verified, security_password_hash, security_password_enabled, recovery_key_hash,
        xp, level, coins, points, current_streak, best_streak,
        profile_picture_file, active_frame, profile_theme, avatar_config_json, favorite_games_json,
        unlocked_cosmetics_json, settings_json, banned, created_at, updated_at, last_seen_at)
       VALUES (?, NULL, ?, NULL, 1, NULL, 0, ?, 0, 1, 100, 0, 0, 0, NULL, 'frame_slate', 'theme_midnight_nova', ?, '[]', '["frame_slate","theme_midnight_nova"]', ?, 0, ?, ?, ?)`
    ).run(
      playerId,
      username,
      hashSecret(recoveryKey),
      JSON.stringify(DEFAULT_AVATAR_CONFIG),
      JSON.stringify(DEFAULT_PLAYER_SETTINGS),
      now,
      now,
      now
    );

    logCoinTransaction({
      playerId,
      amount: 100,
      balanceAfter: 100,
      category: 'starter',
      description: 'PLAYNOVA welcome virtual coin bonus',
    });

    createNotification(
      playerId,
      'Welcome to PLAYNOVA',
      'You received 100 starter Virtual Coins! Play all 12 games, enter tournaments, and challenge rivals online.',
      'system'
    );

    const token = createPlayerSession(res, playerId);
    const created = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as DbPlayer;
    res.status(201).json({
      ok: true,
      token,
      recoveryKey,
      player: sanitizePlayer(created),
    });
  });

  app.post('/api/players/recover', rateLimit('player-recover', 15, 60_000), (req, res) => {
    const username = normalizeUsername(req.body?.username);
    const recoveryKey = String(req.body?.recoveryKey || '').trim().toUpperCase();
    if (!username || !recoveryKey) {
      res.status(400).json({ error: 'Enter both your username and your Progress Save Key.' });
      return;
    }

    const player = db
      .prepare('SELECT * FROM players WHERE LOWER(username) = LOWER(?)')
      .get(username) as DbPlayer | undefined;

    if (player?.banned) {
      res.status(403).json({ error: 'This PLAYNOVA username has been suspended by an administrator.' });
      return;
    }

    if (!player || !player.recovery_key_hash || !verifySecret(recoveryKey, player.recovery_key_hash)) {
      res.status(401).json({ error: 'Username or Progress Save Key did not match any saved profile.' });
      return;
    }

    const token = createPlayerSession(res, player.id);
    db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), player.id);
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id) as DbPlayer;
    res.json({ ok: true, token, player: sanitizePlayer(updated) });
  });

  app.post('/api/profile/recovery-key', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const recoveryKey = `PN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    db.prepare('UPDATE players SET recovery_key_hash = ?, updated_at = ? WHERE id = ?').run(
      hashSecret(recoveryKey),
      new Date().toISOString(),
      req.player!.id
    );
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({ ok: true, recoveryKey, player: sanitizePlayer(updated) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractToken(req, 'gv_session', 'authorization');
    if (token) {
      db.prepare('DELETE FROM player_sessions WHERE token_hash = ?').run(sha256(token));
    }
    res.clearCookie('gv_session', { path: '/' });
    res.json({ ok: true });
  });

  // =========================================================================
  // 02. PROFILE, PROFILE PICTURE UPLOAD & ACCOUNT SETTINGS
  // =========================================================================

  app.patch('/api/profile/username', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const username = normalizeUsername(req.body?.username);
    if (!isValidUsername(username)) {
      res.status(400).json({ error: 'Username must be 2–24 valid characters.' });
      return;
    }
    const conflict = db
      .prepare('SELECT id FROM players WHERE LOWER(username) = LOWER(?) AND id != ?')
      .get(username, req.player!.id) as { id: string } | undefined;
    if (conflict) {
      res.status(409).json({ error: 'That display name is already claimed by another player.' });
      return;
    }
    db.prepare('UPDATE players SET username = ?, updated_at = ? WHERE id = ?').run(
      username,
      new Date().toISOString(),
      req.player!.id
    );
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({ ok: true, player: sanitizePlayer(updated) });
  });

  app.post('/api/profile/picture', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const player = req.player!;
    const dataUrl = String(req.body?.dataUrl || '');
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Please upload a valid PNG, JPG, or WEBP image.' });
      return;
    }

    const buf = Buffer.from(match[2], 'base64');
    if (buf.length === 0 || buf.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Optimized image must be smaller than 2 MB.' });
      return;
    }

    const detected = detectImageTypeFromBuffer(buf);
    if (!detected) {
      res.status(400).json({ error: 'File signature does not match a valid PNG, JPG, or WEBP image.' });
      return;
    }

    if (player.profile_picture_file) {
      const oldPath = path.join(avatarUploadsDir, path.basename(player.profile_picture_file));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const filename = `${player.id}-${crypto.randomBytes(6).toString('hex')}.${detected.ext}`;
    fs.writeFileSync(path.join(avatarUploadsDir, filename), buf);

    db.prepare('UPDATE players SET profile_picture_file = ?, updated_at = ? WHERE id = ?').run(
      filename,
      new Date().toISOString(),
      player.id
    );
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id) as DbPlayer;
    res.json({ ok: true, player: sanitizePlayer(updated) });
  });

  app.delete('/api/profile/picture', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const player = req.player!;
    if (player.profile_picture_file) {
      const oldPath = path.join(avatarUploadsDir, path.basename(player.profile_picture_file));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    db.prepare('UPDATE players SET profile_picture_file = NULL, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      player.id
    );
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id) as DbPlayer;
    res.json({ ok: true, player: sanitizePlayer(updated) });
  });

  app.patch('/api/profile/settings', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const current = {
      ...DEFAULT_PLAYER_SETTINGS,
      ...(JSON.parse(req.player!.settings_json || '{}') as Partial<PlayerSettings>),
    };
    const incoming = (req.body?.settings || {}) as Partial<PlayerSettings>;
    const merged: PlayerSettings = {
      soundEnabled: typeof incoming.soundEnabled === 'boolean' ? incoming.soundEnabled : current.soundEnabled,
      soundVolume:
        typeof incoming.soundVolume === 'number'
          ? Math.min(1, Math.max(0, incoming.soundVolume))
          : current.soundVolume,
      reducedMotion:
        typeof incoming.reducedMotion === 'boolean' ? incoming.reducedMotion : current.reducedMotion,
    };

    db.prepare('UPDATE players SET settings_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(merged),
      new Date().toISOString(),
      req.player!.id
    );
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({ ok: true, player: sanitizePlayer(updated) });
  });

  app.patch('/api/profile/avatar', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const current: AvatarConfig = {
      ...DEFAULT_AVATAR_CONFIG,
      ...(JSON.parse(req.player!.avatar_config_json || '{}') as Partial<AvatarConfig>),
    };
    const body = (req.body || {}) as Partial<AvatarConfig>;
    const validEmblems: AvatarConfig['emblem'][] = [
      'nova',
      'crown',
      'bolt',
      'shield',
      'cyber',
      'chess',
      'phoenix',
      'atom',
    ];
    const hexRx = /^#[0-9A-Fa-f]{6}$/;

    const owned = new Set(JSON.parse(req.player!.unlocked_cosmetics_json || '["frame_slate","theme_midnight_nova"]') as string[]);
    let nextTheme = req.player!.profile_theme || 'theme_midnight_nova';
    if (typeof body.themeId === 'string' && body.themeId.trim()) {
      const candidateTheme = body.themeId.trim();
      const row = db
        .prepare("SELECT id, coin_cost FROM reward_catalog WHERE id = ? AND category = 'theme'")
        .get(candidateTheme) as { id: string; coin_cost: number } | undefined;
      if (row && (owned.has(row.id) || row.coin_cost === 0)) {
        nextTheme = row.id;
      }
    }

    const nextAvatar: AvatarConfig = {
      mode: body.mode === 'photo' ? 'photo' : body.mode === 'emblem' ? 'emblem' : current.mode,
      emblem: body.emblem && validEmblems.includes(body.emblem) ? body.emblem : current.emblem,
      bgHex: typeof body.bgHex === 'string' && hexRx.test(body.bgHex) ? body.bgHex : current.bgHex,
      accentHex: typeof body.accentHex === 'string' && hexRx.test(body.accentHex) ? body.accentHex : current.accentHex,
      themeId: nextTheme,
    };

    db.prepare('UPDATE players SET avatar_config_json = ?, profile_theme = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(nextAvatar),
      nextTheme,
      new Date().toISOString(),
      req.player!.id
    );
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({ ok: true, player: sanitizePlayer(updated) });
  });

  app.patch('/api/profile/favorites', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const incoming = Array.isArray(req.body?.favoriteGames) ? req.body.favoriteGames : [];
    const filtered = Array.from(
      new Set(incoming.filter((g: unknown): g is GameId => typeof g === 'string' && ALL_GAME_IDS.includes(g as GameId)))
    ).slice(0, 12);

    db.prepare('UPDATE players SET favorite_games_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(filtered),
      new Date().toISOString(),
      req.player!.id
    );
    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({ ok: true, player: sanitizePlayer(updated) });
  });

  app.get('/api/wallet/transactions', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const transactions = db
      .prepare(
        `SELECT id, amount, balance_after as balanceAfter, category, description, created_at as createdAt
         FROM coin_transactions
         WHERE player_id = ?
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .all(req.player!.id) as CoinTransactionItem[];

    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalEarned,
                COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) as totalSpent
         FROM coin_transactions
         WHERE player_id = ?`
      )
      .get(req.player!.id) as { totalEarned: number; totalSpent: number };

    res.json({
      ok: true,
      currentCoins: req.player!.coins,
      totalEarned: totals.totalEarned ?? 0,
      totalSpent: totals.totalSpent ?? 0,
      transactions,
    });
  });

  app.get('/api/announcements', (_req, res) => {
    const announcements = db
      .prepare('SELECT id, title, message, level, created_at as createdAt FROM platform_announcements ORDER BY created_at DESC LIMIT 12')
      .all();
    res.json({ announcements });
  });

  // =========================================================================
  // 03. SERVER-AUTHORITATIVE GAMEPLAY (TIC-TAC-TOE, RPS, GUESS THE NUMBER)
  // =========================================================================

  // --- TIC-TAC-TOE ---
  app.post('/api/games/tictactoe/start', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const difficulty = (['easy', 'medium', 'hard'].includes(req.body?.difficulty)
      ? req.body.difficulty
      : 'medium') as DifficultyLevel;
    const playerMark = req.body?.playerMark === 'O' ? 'O' : 'X';
    const { winTarget, boardSize } = normalizeTttConfig(req.body?.winTarget, req.body?.boardSize);
    const board: TttCell[] = Array(boardSize * boardSize).fill(null);

    if (playerMark === 'O') {
      const aiIdx = chooseTttAiMove(board, difficulty, 'X', boardSize, winTarget);
      if (aiIdx >= 0) board[aiIdx] = 'X';
    }

    const sessionId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO active_ttt_sessions (id, player_id, difficulty, player_mark, board_size, win_target, board_json, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      sessionId,
      req.player!.id,
      difficulty,
      playerMark,
      boardSize,
      winTarget,
      JSON.stringify(board),
      'active',
      Date.now()
    );

    res.json({ ok: true, sessionId, board, boardSize, winTarget, difficulty, playerMark });
  });

  app.post('/api/games/tictactoe/move', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const sessionId = String(req.body?.sessionId || '');
    const cellIndex = Number(req.body?.cellIndex);

    const session = db
      .prepare('SELECT * FROM active_ttt_sessions WHERE id = ? AND player_id = ?')
      .get(sessionId, req.player!.id) as
      | {
          id: string;
          player_id: string;
          difficulty: DifficultyLevel;
          player_mark: 'X' | 'O';
          board_size: number;
          win_target: number;
          board_json: string;
          status: string;
          started_at: number;
        }
      | undefined;

    if (!session || session.status !== 'active') {
      res.status(400).json({ error: 'Tic-Tac-Toe match is no longer active. Start a new round.' });
      return;
    }

    const boardSize = Math.max(3, Number(session.board_size || 3));
    const winTarget = Math.max(3, Number(session.win_target || 3));
    const totalCells = boardSize * boardSize;

    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalCells) {
      res.status(400).json({ error: 'Invalid board cell selected.' });
      return;
    }

    const board = JSON.parse(session.board_json) as TttCell[];
    if (board[cellIndex] !== null) {
      res.status(400).json({ error: 'That square is already occupied.' });
      return;
    }

    const aiMark: 'X' | 'O' = session.player_mark === 'X' ? 'O' : 'X';
    board[cellIndex] = session.player_mark;

    let evaluation = evaluateTttBoard(board, boardSize, winTarget);
    let aiMoveIndex: number | null = null;

    if (!evaluation.winner) {
      aiMoveIndex = chooseTttAiMove(board, session.difficulty, aiMark, boardSize, winTarget);
      if (aiMoveIndex >= 0) {
        board[aiMoveIndex] = aiMark;
      }
      evaluation = evaluateTttBoard(board, boardSize, winTarget);
    }

    if (!evaluation.winner) {
      db.prepare('UPDATE active_ttt_sessions SET board_json = ? WHERE id = ?').run(
        JSON.stringify(board),
        session.id
      );
      res.json({
        ok: true,
        board,
        boardSize,
        winTarget,
        aiMoveIndex,
        finished: false,
      });
      return;
    }

    db.prepare('UPDATE active_ttt_sessions SET board_json = ?, status = ? WHERE id = ?').run(
      JSON.stringify(board),
      'completed',
      session.id
    );

    const outcome: 'win' | 'loss' | 'draw' =
      evaluation.winner === 'draw' ? 'draw' : evaluation.winner === session.player_mark ? 'win' : 'loss';

    const mult = (session.difficulty === 'hard' ? 1.7 : session.difficulty === 'medium' ? 1.25 : 1) * (winTarget > 3 ? 1 + (winTarget - 3) * 0.15 : 1);
    const scoreDelta = outcome === 'win' ? Math.round(100 * mult) : outcome === 'draw' ? Math.round(35 * mult) : 5;
    const xpEarned = outcome === 'win' ? Math.round(55 * mult) : outcome === 'draw' ? Math.round(25 * mult) : 10;
    const coinsEarned = outcome === 'win' ? Math.round(28 * mult) : outcome === 'draw' ? Math.round(12 * mult) : 4;
    const durationSec = Math.max(2, Math.round((Date.now() - session.started_at) / 1000));

    const ruleDesc = `${boardSize}×${boardSize} (${winTarget}-in-a-row)`;
    const progress = recordMatchAndProgress({
      playerId: req.player!.id,
      gameId: 'tictactoe',
      mode: 'vs_ai',
      difficulty: session.difficulty,
      outcome,
      opponentLabel: `AI (${session.difficulty})`,
      scoreDelta,
      xpEarned,
      coinsEarned,
      durationSec,
      summary:
        outcome === 'win'
          ? `Defeated ${session.difficulty} AI on ${ruleDesc} as ${session.player_mark}`
          : outcome === 'draw'
          ? `Drew vs ${session.difficulty} AI on ${ruleDesc}`
          : `Outplayed by ${session.difficulty} AI on ${ruleDesc}`,
    });

    res.json({
      ok: true,
      board,
      boardSize,
      winTarget,
      aiMoveIndex,
      finished: true,
      outcome,
      winLine: evaluation.line,
      rewards: { scoreDelta, xpEarned, coinsEarned },
      ...progress,
    });
  });

  app.post('/api/games/tictactoe/local-complete', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const winner = req.body?.winner as 'X' | 'O' | 'draw';
    if (!['X', 'O', 'draw'].includes(winner)) {
      res.status(400).json({ error: 'Invalid local match result.' });
      return;
    }
    const { winTarget, boardSize } = normalizeTttConfig(req.body?.winTarget, req.body?.boardSize);
    const outcome: 'win' | 'draw' = winner === 'draw' ? 'draw' : 'win';
    const ruleDesc = `${boardSize}×${boardSize} (${winTarget}-in-a-row)`;
    const progress = recordMatchAndProgress({
      playerId: req.player!.id,
      gameId: 'tictactoe',
      mode: 'local_2p',
      difficulty: 'medium',
      outcome,
      opponentLabel: 'Local Player 2',
      scoreDelta: winner === 'draw' ? 20 : 40,
      xpEarned: 25,
      coinsEarned: 12,
      durationSec: Math.max(3, Math.min(600, Math.round(Number(req.body?.durationSec || 20)))),
      summary:
        winner === 'draw'
          ? `Local 2-Player Draw on ${ruleDesc}`
          : `Local 2-Player (${winner} won ${ruleDesc})`,
    });
    res.json({ ok: true, rewards: { scoreDelta: winner === 'draw' ? 20 : 40, xpEarned: 25, coinsEarned: 12 }, ...progress });
  });

  // --- ROCK-PAPER-SCISSORS ---
  app.post('/api/games/rps/play', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const mode = req.body?.mode === 'local_2p' ? 'local_2p' : 'vs_ai';
    const difficulty = (['easy', 'medium', 'hard'].includes(req.body?.difficulty)
      ? req.body.difficulty
      : 'medium') as DifficultyLevel;
    const playerMove = req.body?.playerMove as RpsMove;
    const validMoves: RpsMove[] = ['rock', 'paper', 'scissors'];

    if (!validMoves.includes(playerMove)) {
      res.status(400).json({ error: 'Choose rock, paper, or scissors.' });
      return;
    }

    let opponentMove: RpsMove;
    if (mode === 'local_2p') {
      const p2Move = req.body?.playerTwoMove as RpsMove;
      if (!validMoves.includes(p2Move)) {
        res.status(400).json({ error: 'Player 2 must choose rock, paper, or scissors.' });
        return;
      }
      opponentMove = p2Move;
    } else {
      const recent = Array.isArray(req.body?.recentMoves)
        ? (req.body.recentMoves.filter((m: unknown) => validMoves.includes(m as RpsMove)) as RpsMove[])
        : [];
      opponentMove = chooseRpsAiMove(difficulty, recent);
    }

    const outcome = resolveRpsOutcome(playerMove, opponentMove);
    const mult = mode === 'local_2p' ? 0.75 : difficulty === 'hard' ? 1.5 : difficulty === 'medium' ? 1.2 : 1;
    const streakBonus = outcome === 'win' ? Math.min(40, req.player!.current_streak * 8) : 0;

    const scoreDelta =
      outcome === 'win'
        ? Math.round(70 * mult) + streakBonus
        : outcome === 'draw'
        ? Math.round(20 * mult)
        : 5;
    const xpEarned =
      outcome === 'win'
        ? Math.round(40 * mult) + Math.round(streakBonus * 0.5)
        : outcome === 'draw'
        ? 15
        : 8;
    const coinsEarned = outcome === 'win' ? Math.round(22 * mult) + Math.floor(streakBonus / 4) : outcome === 'draw' ? 8 : 3;

    const progress = recordMatchAndProgress({
      playerId: req.player!.id,
      gameId: 'rps',
      mode,
      difficulty,
      outcome,
      opponentLabel: mode === 'local_2p' ? 'Local Player 2' : `AI (${difficulty})`,
      scoreDelta,
      xpEarned,
      coinsEarned,
      durationSec: 4,
      summary: `${playerMove.toUpperCase()} vs ${opponentMove.toUpperCase()} — ${outcome.toUpperCase()}`,
    });

    res.json({
      ok: true,
      playerMove,
      opponentMove,
      outcome,
      rewards: { scoreDelta, xpEarned, coinsEarned },
      ...progress,
    });
  });

  // --- GUESS THE NUMBER (SERVER-SIDE SECRET NUMBER & VALIDATION) ---
  app.post('/api/games/guess/start', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const rawDifficulty = String(req.body?.difficulty || 'medium');
    const isDaily = rawDifficulty === 'daily';
    const presetKey = (['easy', 'medium', 'hard', 'daily'].includes(rawDifficulty)
      ? rawDifficulty
      : 'medium') as keyof typeof GUESS_PRESETS;
    const preset = GUESS_PRESETS[presetKey];

    const todayKey = new Date().toISOString().slice(0, 10);
    if (isDaily) {
      const alreadyWonToday = db
        .prepare(
          `SELECT id FROM match_records
           WHERE player_id = ? AND game_id = 'guess_number' AND mode = 'daily_challenge'
             AND outcome = 'win' AND substr(created_at, 1, 10) = ?`
        )
        .get(req.player!.id, todayKey);
      if (alreadyWonToday) {
        res.status(409).json({ error: 'You have already cracked today’s Daily Vault! Come back tomorrow or play standard difficulties.' });
        return;
      }
    }

    let secretNumber: number;
    if (isDaily) {
      const hash = crypto.createHash('sha256').update(`gv-daily-${todayKey}`).digest();
      const num = hash.readUInt32BE(0);
      secretNumber = preset.min + (num % (preset.max - preset.min + 1));
    } else {
      secretNumber = crypto.randomInt(preset.min, preset.max + 1);
    }

    const sessionId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO active_guess_sessions
       (id, player_id, difficulty, min_val, max_val, max_attempts, time_limit_sec, secret_number, guesses_json, is_daily, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, NULL)`
    ).run(
      sessionId,
      req.player!.id,
      isDaily ? 'medium' : presetKey,
      preset.min,
      preset.max,
      preset.maxAttempts,
      preset.timeLimitSec,
      secretNumber,
      isDaily ? 1 : 0,
      Date.now()
    );

    res.json({
      ok: true,
      sessionId,
      difficulty: isDaily ? 'daily' : presetKey,
      min: preset.min,
      max: preset.max,
      maxAttempts: preset.maxAttempts,
      timeLimitSec: preset.timeLimitSec,
      isDaily,
    });
  });

  app.post('/api/games/guess/attempt', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const sessionId = String(req.body?.sessionId || '');
    const guess = Number(req.body?.guess);
    const timedOut = Boolean(req.body?.timedOut);

    const session = db
      .prepare('SELECT * FROM active_guess_sessions WHERE id = ? AND player_id = ?')
      .get(sessionId, req.player!.id) as
      | {
          id: string;
          player_id: string;
          difficulty: DifficultyLevel;
          min_val: number;
          max_val: number;
          max_attempts: number;
          time_limit_sec: number;
          secret_number: number;
          guesses_json: string;
          is_daily: number;
          started_at: number;
          completed_at: number | null;
        }
      | undefined;

    if (!session || session.completed_at) {
      res.status(400).json({ error: 'This number challenge has ended. Start a new round.' });
      return;
    }

    const elapsedSec = Math.round((Date.now() - session.started_at) / 1000);
    const guesses = JSON.parse(session.guesses_json) as Array<{ value: number; hint: 'higher' | 'lower' | 'correct' }>;

    if (timedOut || elapsedSec > session.time_limit_sec + 2) {
      db.prepare('UPDATE active_guess_sessions SET completed_at = ? WHERE id = ?').run(Date.now(), session.id);
      const progress = recordMatchAndProgress({
        playerId: req.player!.id,
        gameId: 'guess_number',
        mode: session.is_daily ? 'daily_challenge' : 'standard',
        difficulty: session.difficulty,
        outcome: 'loss',
        opponentLabel: `Vault ${session.min_val}–${session.max_val}`,
        scoreDelta: 5,
        xpEarned: 12,
        coinsEarned: 5,
        durationSec: session.time_limit_sec,
        summary: `Countdown expired before cracking ${session.secret_number}`,
      });
      res.json({
        ok: true,
        status: 'timeout',
        secretNumber: session.secret_number,
        guesses,
        attemptsRemaining: 0,
        rewards: { scoreDelta: 5, xpEarned: 12, coinsEarned: 5 },
        ...progress,
      });
      return;
    }

    if (!Number.isInteger(guess) || guess < session.min_val || guess > session.max_val) {
      res.status(400).json({
        error: `Enter a whole number between ${session.min_val} and ${session.max_val}.`,
      });
      return;
    }

    if (guess === session.secret_number) {
      guesses.push({ value: guess, hint: 'correct' });
      db.prepare('UPDATE active_guess_sessions SET guesses_json = ?, completed_at = ? WHERE id = ?').run(
        JSON.stringify(guesses),
        Date.now(),
        session.id
      );

      const unusedAttempts = Math.max(0, session.max_attempts - guesses.length);
      const timeBonus = Math.max(0, session.time_limit_sec - elapsedSec);
      const diffMult = session.is_daily ? 1.8 : session.difficulty === 'hard' ? 1.6 : session.difficulty === 'medium' ? 1.2 : 1;

      const scoreDelta = Math.round((120 + unusedAttempts * 35 + timeBonus * 2) * diffMult);
      const xpEarned = Math.round((50 + unusedAttempts * 14) * diffMult);
      const coinsEarned = Math.round((25 + unusedAttempts * 8) * diffMult);

      const progress = recordMatchAndProgress({
        playerId: req.player!.id,
        gameId: 'guess_number',
        mode: session.is_daily ? 'daily_challenge' : 'standard',
        difficulty: session.difficulty,
        outcome: 'win',
        opponentLabel: `Vault ${session.min_val}–${session.max_val}`,
        scoreDelta,
        xpEarned,
        coinsEarned,
        durationSec: Math.max(2, elapsedSec),
        summary: `Cracked secret ${session.secret_number} in ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}`,
        attemptsUsed: guesses.length,
        isDailyChallenge: Boolean(session.is_daily),
      });

      res.json({
        ok: true,
        status: 'correct',
        secretNumber: session.secret_number,
        guesses,
        attemptsUsed: guesses.length,
        attemptsRemaining: unusedAttempts,
        rewards: { scoreDelta, xpEarned, coinsEarned },
        ...progress,
      });
      return;
    }

    const hint: 'higher' | 'lower' = guess < session.secret_number ? 'higher' : 'lower';
    guesses.push({ value: guess, hint });
    const attemptsRemaining = Math.max(0, session.max_attempts - guesses.length);

    if (attemptsRemaining === 0) {
      db.prepare('UPDATE active_guess_sessions SET guesses_json = ?, completed_at = ? WHERE id = ?').run(
        JSON.stringify(guesses),
        Date.now(),
        session.id
      );
      const progress = recordMatchAndProgress({
        playerId: req.player!.id,
        gameId: 'guess_number',
        mode: session.is_daily ? 'daily_challenge' : 'standard',
        difficulty: session.difficulty,
        outcome: 'loss',
        opponentLabel: `Vault ${session.min_val}–${session.max_val}`,
        scoreDelta: 8,
        xpEarned: 15,
        coinsEarned: 5,
        durationSec: Math.max(2, elapsedSec),
        summary: `Out of attempts (Secret was ${session.secret_number})`,
      });
      res.json({
        ok: true,
        status: 'out_of_attempts',
        hint,
        secretNumber: session.secret_number,
        guesses,
        attemptsUsed: guesses.length,
        attemptsRemaining: 0,
        rewards: { scoreDelta: 8, xpEarned: 15, coinsEarned: 5 },
        ...progress,
      });
      return;
    }

    db.prepare('UPDATE active_guess_sessions SET guesses_json = ? WHERE id = ?').run(
      JSON.stringify(guesses),
      session.id
    );

    const diff = Math.abs(session.secret_number - guess);
    const rangeSpan = session.max_val - session.min_val;
    const proximity = diff <= Math.max(2, rangeSpan * 0.04) ? 'Scorching close' : diff <= rangeSpan * 0.14 ? 'Warm' : 'Cold';

    res.json({
      ok: true,
      status: hint,
      hint,
      proximity,
      guesses,
      attemptsUsed: guesses.length,
      attemptsRemaining,
    });
  });

  app.post('/api/games/complete', requirePlayer, rateLimit('game_complete', 60, 60_000), (req: AuthedPlayerRequest, res) => {
    const rawGame = typeof req.body?.gameId === 'string' ? req.body.gameId : typeof req.body?.game === 'string' ? req.body.game : '';
    if (!ALL_GAME_IDS.includes(rawGame as GameId)) {
      res.status(400).json({ error: 'Invalid game identifier.' });
      return;
    }
    const gameId = rawGame as GameId;
    const outcome: 'win' | 'loss' | 'draw' =
      req.body?.outcome === 'win' || req.body?.outcome === 'loss' || req.body?.outcome === 'draw'
        ? req.body.outcome
        : 'win';
    const difficulty: DifficultyLevel =
      req.body?.difficulty === 'easy' || req.body?.difficulty === 'hard' ? req.body.difficulty : 'medium';
    const mode = typeof req.body?.mode === 'string' && req.body.mode.trim() ? req.body.mode.trim().slice(0, 40) : 'solo';
    const opponentLabel =
      typeof req.body?.opponentLabel === 'string' && req.body.opponentLabel.trim()
        ? req.body.opponentLabel.trim().slice(0, 80)
        : 'PLAYNOVA Arena';

    const rawScore = Number(req.body?.scoreDelta ?? 0);
    const maxScoreCap = outcome === 'win' ? 350 : outcome === 'draw' ? 140 : 60;
    const defaultScore = outcome === 'win' ? (difficulty === 'hard' ? 150 : difficulty === 'medium' ? 110 : 80) : outcome === 'draw' ? 50 : 15;
    const scoreDelta = Number.isFinite(rawScore) && rawScore > 0 ? Math.min(maxScoreCap, Math.round(rawScore)) : defaultScore;

    const diffMult = difficulty === 'hard' ? 1.45 : difficulty === 'medium' ? 1.15 : 1;
    const xpEarned = Math.round((outcome === 'win' ? 45 : outcome === 'draw' ? 24 : 12) * diffMult);
    const coinsEarned = Math.round((outcome === 'win' ? 25 : outcome === 'draw' ? 12 : 5) * diffMult);

    const rawDuration =
      typeof req.body?.durationSec === 'number'
        ? req.body.durationSec
        : typeof req.body?.durationMs === 'number'
        ? Math.round(req.body.durationMs / 1000)
        : 30;
    const durationSec = Math.max(1, Math.min(7200, Math.round(rawDuration || 30)));

    const summary =
      typeof req.body?.summary === 'string' && req.body.summary.trim()
        ? req.body.summary.trim().slice(0, 160)
        : `${gameId.replace('_', ' ')} (${outcome})`;

    const progress = recordMatchAndProgress({
      playerId: req.player!.id,
      gameId,
      mode,
      difficulty,
      outcome,
      opponentLabel,
      scoreDelta,
      xpEarned,
      coinsEarned,
      durationSec,
      summary,
    });

    res.json({
      ok: true,
      rewards: { scoreDelta, xpEarned, coinsEarned },
      ...progress,
    });
  });

  // =========================================================================
  // 04. PROGRESSION, CHALLENGES, ACHIEVEMENTS, REWARDS, NOTIFICATIONS, LEADERBOARD
  // =========================================================================

  app.get('/api/progression', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const playerId = req.player!.id;
    const { dailyKey, weeklyKey } = getPeriodKeys();

    const chRows = db.prepare('SELECT * FROM challenge_configs WHERE active = 1').all() as Array<{
      id: string;
      kind: 'daily' | 'weekly';
      game_id: GameId | 'any';
      title: string;
      description: string;
      target_count: number;
      xp_reward: number;
      coin_reward: number;
    }>;

    const progRows = db
      .prepare('SELECT challenge_id, period_key, progress, completed_at FROM player_challenge_progress WHERE player_id = ?')
      .all(playerId) as Array<{
      challenge_id: string;
      period_key: string;
      progress: number;
      completed_at: string | null;
    }>;

    const challenges = chRows.map((c) => {
      const targetPeriod = c.kind === 'daily' ? dailyKey : weeklyKey;
      const p = progRows.find((r) => r.challenge_id === c.id && r.period_key === targetPeriod);
      return {
        id: c.id,
        kind: c.kind,
        gameId: c.game_id,
        title: c.title,
        description: c.description,
        targetCount: c.target_count,
        xpReward: c.xp_reward,
        coinReward: c.coin_reward,
        progress: p?.progress ?? 0,
        completed: Boolean(p?.completed_at),
      };
    });

    const achRows = db.prepare('SELECT * FROM achievement_configs').all() as Array<{
      key: string;
      title: string;
      description: string;
      category: string;
      xp_reward: number;
      coin_reward: number;
    }>;
    const unlockedRows = db
      .prepare('SELECT achievement_key, unlocked_at FROM player_achievements WHERE player_id = ?')
      .all(playerId) as Array<{ achievement_key: string; unlocked_at: string }>;
    const unlockedMap = new Map(unlockedRows.map((u) => [u.achievement_key, u.unlocked_at]));

    const achievements = achRows.map((a) => ({
      key: a.key,
      title: a.title,
      description: a.description,
      category: a.category,
      xpReward: a.xp_reward,
      coinReward: a.coin_reward,
      unlocked: unlockedMap.has(a.key),
      unlockedAt: unlockedMap.get(a.key) || null,
    }));

    const owned = new Set(
      JSON.parse(req.player!.unlocked_cosmetics_json || '["frame_slate","theme_midnight_nova"]') as string[]
    );
    const rewardRows = db.prepare('SELECT * FROM reward_catalog ORDER BY coin_cost ASC').all() as Array<{
      id: string;
      name: string;
      category: 'frame' | 'title' | 'theme';
      description: string;
      coin_cost: number;
      accent_hex: string;
    }>;

    const rewards = rewardRows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description,
      coinCost: r.coin_cost,
      accentHex: r.accent_hex,
      unlocked: owned.has(r.id) || r.coin_cost === 0,
      equipped:
        r.category === 'theme'
          ? (req.player!.profile_theme || 'theme_midnight_nova') === r.id
          : req.player!.active_frame === r.id,
    }));

    const notifications = db
      .prepare(
        'SELECT id, title, message, kind, read_at as readAt, created_at as createdAt FROM notifications WHERE player_id = ? ORDER BY created_at DESC LIMIT 25'
      )
      .all(playerId);

    const matches = db
      .prepare(
        `SELECT id, game_id as gameId, mode, difficulty, outcome, opponent_label as opponentLabel,
                score_delta as scoreDelta, xp_earned as xpEarned, coins_earned as coinsEarned,
                duration_sec as durationSec, summary, created_at as createdAt
         FROM match_records
         WHERE player_id = ?
         ORDER BY created_at DESC
         LIMIT 30`
      )
      .all(playerId);

    res.json({ challenges, achievements, rewards, notifications, matches });
  });

  app.post('/api/rewards/:id/unlock', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const rewardId = req.params.id;
    const reward = db.prepare('SELECT * FROM reward_catalog WHERE id = ?').get(rewardId) as
      | { id: string; name: string; category: 'frame' | 'title' | 'theme'; coin_cost: number }
      | undefined;

    if (!reward) {
      res.status(404).json({ error: 'Reward item not found.' });
      return;
    }

    const owned = new Set(
      JSON.parse(req.player!.unlocked_cosmetics_json || '["frame_slate","theme_midnight_nova"]') as string[]
    );
    const now = new Date().toISOString();
    const isTheme = reward.category === 'theme';

    if (!owned.has(reward.id) && reward.coin_cost > 0) {
      if (req.player!.coins < reward.coin_cost) {
        res.status(400).json({ error: `Need ${reward.coin_cost} Virtual Coins to unlock ${reward.name}.` });
        return;
      }
      owned.add(reward.id);
      const nextCoins = req.player!.coins - reward.coin_cost;
      if (isTheme) {
        const avatarCfg: AvatarConfig = {
          ...DEFAULT_AVATAR_CONFIG,
          ...(JSON.parse(req.player!.avatar_config_json || '{}') as Partial<AvatarConfig>),
          themeId: reward.id,
        };
        db.prepare(
          'UPDATE players SET coins = ?, unlocked_cosmetics_json = ?, profile_theme = ?, avatar_config_json = ?, updated_at = ? WHERE id = ?'
        ).run(nextCoins, JSON.stringify(Array.from(owned)), reward.id, JSON.stringify(avatarCfg), now, req.player!.id);
      } else {
        db.prepare(
          'UPDATE players SET coins = ?, unlocked_cosmetics_json = ?, active_frame = ?, updated_at = ? WHERE id = ?'
        ).run(nextCoins, JSON.stringify(Array.from(owned)), reward.id, now, req.player!.id);
      }
      logCoinTransaction({
        playerId: req.player!.id,
        amount: -reward.coin_cost,
        balanceAfter: nextCoins,
        category: 'shop',
        description: `Unlocked ${reward.name}`,
      });
      unlockAchievement(req.player!.id, 'collector_cosmetic');
      createNotification(
        req.player!.id,
        `Reward Unlocked: ${reward.name}`,
        `Equipped on your PLAYNOVA profile (-${reward.coin_cost} Virtual Coins).`,
        'reward'
      );
    } else {
      if (isTheme) {
        const avatarCfg: AvatarConfig = {
          ...DEFAULT_AVATAR_CONFIG,
          ...(JSON.parse(req.player!.avatar_config_json || '{}') as Partial<AvatarConfig>),
          themeId: reward.id,
        };
        db.prepare('UPDATE players SET profile_theme = ?, avatar_config_json = ?, updated_at = ? WHERE id = ?').run(
          reward.id,
          JSON.stringify(avatarCfg),
          now,
          req.player!.id
        );
      } else {
        db.prepare('UPDATE players SET active_frame = ?, updated_at = ? WHERE id = ?').run(
          reward.id,
          now,
          req.player!.id
        );
      }
    }

    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({ ok: true, player: sanitizePlayer(updated) });
  });

  app.post('/api/notifications/read-all', requirePlayer, (req: AuthedPlayerRequest, res) => {
    db.prepare('UPDATE notifications SET read_at = ? WHERE player_id = ? AND read_at IS NULL').run(
      new Date().toISOString(),
      req.player!.id
    );
    res.json({ ok: true });
  });

  app.get('/api/leaderboard', (req, res) => {
    const auth = getAuthenticatedPlayer(req);
    if (auth.expired) {
      res.status(401).json({ code: 'SESSION_EXPIRED', error: 'Your session expired. Enter your username to continue.' });
      return;
    }
    const currentPlayerId = auth.player?.id || null;
    const gameFilter = String(req.query.game || 'all');
    const periodFilter =
      req.query.period === 'weekly' ? 'weekly' : req.query.period === 'monthly' ? 'monthly' : 'all';
    const days = periodFilter === 'weekly' ? 7 : periodFilter === 'monthly' ? 30 : 0;
    const sinceIso = days > 0 ? new Date(Date.now() - days * 86400 * 1000).toISOString() : '1970-01-01T00:00:00.000Z';

    const validGame = ALL_GAME_IDS.includes(gameFilter as GameId);

    const rows = db
      .prepare(
        `SELECT p.id as playerId, p.username, p.profile_picture_file as picFile, p.active_frame as activeFrame,
                p.level, p.xp, p.points as allTimePoints,
                COALESCE(SUM(CASE WHEN m.created_at >= ? ${validGame ? 'AND m.game_id = ?' : ''} THEN m.score_delta ELSE 0 END), 0) as filteredPoints,
                SUM(CASE WHEN m.created_at >= ? ${validGame ? 'AND m.game_id = ?' : ''} AND m.outcome = 'win' THEN 1 ELSE 0 END) as wins,
                COUNT(CASE WHEN m.created_at >= ? ${validGame ? 'AND m.game_id = ?' : ''} THEN m.id ELSE NULL END) as played,
                (SELECT COUNT(*) FROM player_achievements pa WHERE pa.player_id = p.id) as achievementsCount
         FROM players p
         LEFT JOIN match_records m ON m.player_id = p.id
         WHERE p.banned = 0
         GROUP BY p.id
         ORDER BY filteredPoints DESC, p.xp DESC
         LIMIT 50`
      )
      .all(
        ...(validGame
          ? [sinceIso, gameFilter, sinceIso, gameFilter, sinceIso, gameFilter]
          : [sinceIso, sinceIso, sinceIso])
      ) as Array<{
      playerId: string;
      username: string;
      picFile: string | null;
      activeFrame: string;
      level: number;
      xp: number;
      allTimePoints: number;
      filteredPoints: number;
      wins: number;
      played: number;
      achievementsCount: number;
    }>;

    res.json({
      leaderboard: rows.map((r, idx) => ({
        rank: idx + 1,
        playerId: r.playerId,
        username: r.username,
        profilePictureUrl: r.picFile ? `/api/uploads/avatars/${r.picFile}` : null,
        activeFrame: r.activeFrame || 'frame_slate',
        level: r.level,
        xp: r.xp,
        points: periodFilter === 'all' && !validGame ? Math.max(r.allTimePoints, r.filteredPoints) : r.filteredPoints,
        wins: r.wins ?? 0,
        played: r.played ?? 0,
        winRate: r.played > 0 ? Math.round(((r.wins ?? 0) / r.played) * 100) : 0,
        achievementsCount: r.achievementsCount ?? 0,
        isCurrentPlayer: Boolean(currentPlayerId && r.playerId === currentPlayerId),
      })),
    });
  });

  // =========================================================================
  // 04B. TOURNAMENTS & COMPETITIONS (REAL SCHEDULED + EXHIBITION AI BRACKETS)
  // =========================================================================

  function seedTournamentBracket(tournamentId: string) {
    const parts = db
      .prepare('SELECT id, player_id, username, is_ai, seed FROM tournament_participants WHERE tournament_id = ? ORDER BY seed ASC')
      .all(tournamentId) as Array<{
      id: string;
      player_id: string | null;
      username: string;
      is_ai: number;
      seed: number;
    }>;
    if (parts.length < 2) return;

    const now = new Date().toISOString();
    db.prepare('DELETE FROM tournament_matches WHERE tournament_id = ?').run(tournamentId);
    const totalMatchesR1 = Math.floor(parts.length / 2);
    for (let i = 0; i < totalMatchesR1; i++) {
      const a = parts[i * 2];
      const b = parts[i * 2 + 1];
      db.prepare(
        `INSERT INTO tournament_matches
         (id, tournament_id, round_number, match_order, player_a_id, player_b_id, player_a_name, player_b_name, status, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'ready', ?)`
      ).run(
        crypto.randomUUID(),
        tournamentId,
        i + 1,
        a.player_id || a.id,
        b.player_id || b.id,
        a.username,
        b.username,
        now
      );
    }
    db.prepare("UPDATE tournaments SET status = 'active', updated_at = ? WHERE id = ?").run(now, tournamentId);
  }

  app.get('/api/tournaments', (req, res) => {
    const auth = getAuthenticatedPlayer(req);
    res.json({
      tournaments: listTournaments(auth.player?.id || null),
    });
  });

  app.post('/api/tournaments', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 70);
    const gameId = String(req.body?.gameId || 'tictactoe') as GameId;
    const maxPlayers = Number(req.body?.maxPlayers) === 8 ? 8 : 4;
    const entryFeeCoins = Math.max(0, Math.min(500, Math.round(Number(req.body?.entryFeeCoins ?? 0))));
    const prizeCoins = Math.max(50, Math.min(2000, Math.round(Number(req.body?.prizeCoins ?? 200))));
    const description =
      String(req.body?.description || '').trim().slice(0, 220) ||
      'Player-organized single-elimination bracket on PLAYNOVA.';

    if (title.length < 4 || !ALL_GAME_IDS.includes(gameId)) {
      res.status(400).json({ error: 'Provide a valid tournament title (4+ characters) and game arena.' });
      return;
    }

    const id = `tour_${crypto.randomBytes(5).toString('hex')}`;
    const now = new Date().toISOString();
    const startsAt = new Date(Date.now() + 3600_000).toISOString();

    db.prepare(
      `INSERT INTO tournaments
       (id, title, game_id, competition_type, status, max_players, entry_fee_coins, prize_coins, starts_at, description, created_at, updated_at)
       VALUES (?, ?, ?, 'scheduled', 'registration', ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, gameId, maxPlayers, entryFeeCoins, prizeCoins, startsAt, description, now, now);

    db.prepare(
      'INSERT INTO tournament_participants (id, tournament_id, player_id, username, is_ai, seed, eliminated, joined_at) VALUES (?, ?, ?, ?, 0, 1, 0, ?)'
    ).run(crypto.randomUUID(), id, req.player!.id, req.player!.username, now);

    res.status(201).json({
      ok: true,
      tournamentId: id,
      tournaments: listTournaments(req.player!.id),
    });
  });

  app.post('/api/tournaments/:id/register', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const tId = req.params.id;
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tId) as
      | {
          id: string;
          title: string;
          status: string;
          max_players: number;
          entry_fee_coins: number;
          competition_type: string;
        }
      | undefined;
    if (!t || t.status !== 'registration') {
      res.status(400).json({ error: 'Tournament registration is closed.' });
      return;
    }

    const already = db
      .prepare('SELECT id FROM tournament_participants WHERE tournament_id = ? AND player_id = ?')
      .get(tId, req.player!.id);
    if (already) {
      res.status(409).json({ error: 'You are already registered in this tournament.' });
      return;
    }

    const countRow = db
      .prepare('SELECT COUNT(*) as c FROM tournament_participants WHERE tournament_id = ?')
      .get(tId) as { c: number };
    if (countRow.c >= t.max_players) {
      res.status(400).json({ error: 'This tournament bracket is already full.' });
      return;
    }

    if (t.entry_fee_coins > 0 && req.player!.coins < t.entry_fee_coins) {
      res.status(400).json({ error: `Need ${t.entry_fee_coins} Virtual Coins to enter ${t.title}.` });
      return;
    }

    const now = new Date().toISOString();
    if (t.entry_fee_coins > 0) {
      const nextCoins = req.player!.coins - t.entry_fee_coins;
      db.prepare('UPDATE players SET coins = ?, updated_at = ? WHERE id = ?').run(nextCoins, now, req.player!.id);
      logCoinTransaction({
        playerId: req.player!.id,
        amount: -t.entry_fee_coins,
        balanceAfter: nextCoins,
        category: 'tournament',
        description: `Entry fee: ${t.title}`,
      });
    }

    db.prepare(
      'INSERT INTO tournament_participants (id, tournament_id, player_id, username, is_ai, seed, eliminated, joined_at) VALUES (?, ?, ?, ?, 0, ?, 0, ?)'
    ).run(crypto.randomUUID(), tId, req.player!.id, req.player!.username, countRow.c + 1, now);

    createNotification(
      req.player!.id,
      `Tournament Registered: ${t.title}`,
      'You secured a seed in the bracket. Play your round when the bracket activates.',
      'tournament'
    );

    if (countRow.c + 1 >= t.max_players) {
      seedTournamentBracket(tId);
    }

    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({
      ok: true,
      player: sanitizePlayer(updated),
      tournaments: listTournaments(req.player!.id),
    });
  });

  app.post('/api/tournaments/launch-exhibition', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const gameId = (ALL_GAME_IDS.includes(req.body?.gameId as GameId) ? req.body.gameId : 'tictactoe') as GameId;
    const gameMeta = GAME_CATALOG.find((g) => g.id === gameId)!;
    const tId = `exh_${crypto.randomBytes(5).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tournaments
       (id, title, game_id, competition_type, status, max_players, entry_fee_coins, prize_coins, starts_at, description, created_at, updated_at)
       VALUES (?, ?, ?, 'exhibition_demo', 'active', 4, 0, 140, ?, ?, ?, ?)`
    ).run(
      tId,
      `${gameMeta.name} Exhibition Cup (Demo AI Bracket)`,
      gameId,
      now,
      'Instant 4-seed practice bracket pitting you against 3 clearly labeled Exhibition AI bots. Win 2 rounds to claim the 140 Coin exhibition purse.',
      now,
      now
    );

    const participants = [
      { id: crypto.randomUUID(), playerId: req.player!.id, username: req.player!.username, isAi: 0, seed: 1 },
      { id: crypto.randomUUID(), playerId: null, username: 'Nova Tactician (Demo AI)', isAi: 1, seed: 2 },
      { id: crypto.randomUUID(), playerId: null, username: 'Cyber Sentinel (Demo AI)', isAi: 1, seed: 3 },
      { id: crypto.randomUUID(), playerId: null, username: 'Orbit Striker (Demo AI)', isAi: 1, seed: 4 },
    ];
    for (const p of participants) {
      db.prepare(
        'INSERT INTO tournament_participants (id, tournament_id, player_id, username, is_ai, seed, eliminated, joined_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(p.id, tId, p.playerId, p.username, p.isAi, p.seed, now);
    }

    seedTournamentBracket(tId);
    res.status(201).json({
      ok: true,
      tournamentId: tId,
      tournaments: listTournaments(req.player!.id),
    });
  });

  app.post('/api/tournaments/:id/matches/:matchId/resolve', requirePlayer, (req: AuthedPlayerRequest, res) => {
    const { id: tId, matchId } = req.params;
    const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tId) as
      | { id: string; title: string; game_id: GameId; status: string; max_players: number; prize_coins: number }
      | undefined;
    const match = db
      .prepare('SELECT * FROM tournament_matches WHERE id = ? AND tournament_id = ?')
      .get(matchId, tId) as
      | {
          id: string;
          round_number: number;
          match_order: number;
          player_a_id: string | null;
          player_b_id: string | null;
          player_a_name: string;
          player_b_name: string;
          status: string;
        }
      | undefined;

    if (!t || !match || match.status === 'completed') {
      res.status(400).json({ error: 'Tournament match is already completed or unavailable.' });
      return;
    }

    const winnerSide = req.body?.winnerSide === 'b' ? 'b' : 'a';
    const involvesPlayer = match.player_a_id === req.player!.id || match.player_b_id === req.player!.id;
    const isAiVsAi = match.player_a_name.includes('(Demo AI)') && match.player_b_name.includes('(Demo AI)');
    if (!involvesPlayer && !isAiVsAi) {
      res.status(403).json({ error: 'You can only report outcomes for your own bracket match or simulate Demo AI pairings.' });
      return;
    }

    const winnerId = winnerSide === 'a' ? match.player_a_id : match.player_b_id;
    const winnerName = winnerSide === 'a' ? match.player_a_name : match.player_b_name;
    const loserName = winnerSide === 'a' ? match.player_b_name : match.player_a_name;
    const scoreText = String(req.body?.scoreText || 'Match Won').trim().slice(0, 40);
    const now = new Date().toISOString();

    db.prepare(
      "UPDATE tournament_matches SET winner_id = ?, winner_name = ?, status = 'completed', score_text = ?, updated_at = ? WHERE id = ?"
    ).run(winnerId, winnerName, scoreText, now, match.id);

    db.prepare(
      'UPDATE tournament_participants SET eliminated = 1 WHERE tournament_id = ? AND username = ?'
    ).run(tId, loserName);

    // Check if current round is completely finished -> generate next round or finish tournament
    const roundMatches = db
      .prepare('SELECT * FROM tournament_matches WHERE tournament_id = ? AND round_number = ? ORDER BY match_order ASC')
      .all(tId, match.round_number) as Array<{
      winner_id: string | null;
      winner_name: string | null;
      status: string;
    }>;

    if (roundMatches.every((rm) => rm.status === 'completed')) {
      if (roundMatches.length === 1) {
        // Championship Final complete!
        db.prepare(
          "UPDATE tournaments SET status = 'completed', winner_player_id = ?, winner_username = ?, updated_at = ? WHERE id = ?"
        ).run(winnerId, winnerName, now, tId);

        if (winnerId && !winnerName.includes('(Demo AI)')) {
          const champ = db.prepare('SELECT id, coins FROM players WHERE id = ?').get(winnerId) as
            | { id: string; coins: number }
            | undefined;
          if (champ) {
            const nextCoins = champ.coins + t.prize_coins;
            db.prepare('UPDATE players SET coins = ?, xp = xp + 120, points = points + 150, updated_at = ? WHERE id = ?').run(
              nextCoins,
              now,
              champ.id
            );
            logCoinTransaction({
              playerId: champ.id,
              amount: t.prize_coins,
              balanceAfter: nextCoins,
              category: 'tournament',
              description: `Champion prize: ${t.title}`,
            });
            createNotification(
              champ.id,
              `Tournament Champion: ${t.title}`,
              `You won the bracket and claimed +${t.prize_coins} Virtual Coins!`,
              'tournament'
            );
          }
        }
      } else {
        const nextRound = match.round_number + 1;
        for (let i = 0; i < Math.floor(roundMatches.length / 2); i++) {
          const left = roundMatches[i * 2];
          const right = roundMatches[i * 2 + 1];
          db.prepare(
            `INSERT INTO tournament_matches
             (id, tournament_id, round_number, match_order, player_a_id, player_b_id, player_a_name, player_b_name, status, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`
          ).run(
            crypto.randomUUID(),
            tId,
            nextRound,
            i + 1,
            left.winner_id,
            right.winner_id,
            left.winner_name || 'TBD',
            right.winner_name || 'TBD',
            now
          );
        }
      }
    }

    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.player!.id) as DbPlayer;
    res.json({
      ok: true,
      player: sanitizePlayer(updated),
      tournaments: listTournaments(req.player!.id),
    });
  });

  // =========================================================================
  // 05. MANDATORY LINK PREVIEW & SOCIAL SHARING ENDPOINTS
  // =========================================================================

  app.get('/api/link-preview', rateLimit('link-preview', 30, 60_000), async (req, res) => {
    const auth = getAuthenticatedPlayer(req);
    if (auth.expired) {
      res.status(401).json({
        code: 'SESSION_EXPIRED',
        error: 'Your session expired. Re-enter with your username to continue.',
      });
      return;
    }
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      res.status(400).json({ error: 'Please enter a URL to preview.' });
      return;
    }
    const started = Date.now();
    try {
      const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
      const selfOrigin = `${proto}://${host}`;
      const preview = await fetchLinkPreview(rawUrl, selfOrigin);

      logLinkPreviewRequest({
        playerId: auth.player?.id || null,
        url: rawUrl,
        status: preview.fallback ? 'fallback' : 'ok',
        fallbackReason: preview.fallbackReason || null,
        latencyMs: Date.now() - started,
      });

      res.json({ ok: true, preview });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid URL';
      logLinkPreviewRequest({
        playerId: auth.player?.id || null,
        url: rawUrl,
        status: 'error',
        fallbackReason: msg,
        latencyMs: Date.now() - started,
      });
      res.status(400).json({ error: msg });
    }
  });

  app.get('/api/shared-links', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT s.id, s.url, s.title, s.description, s.image_url as imageUrl, s.site_name as siteName,
                s.note, s.created_at as createdAt, p.username, p.profile_picture_file as picFile
         FROM shared_links s
         JOIN players p ON p.id = s.player_id
         ORDER BY s.created_at DESC
         LIMIT 20`
      )
      .all() as Array<{
      id: string;
      url: string;
      title: string;
      description: string;
      imageUrl: string | null;
      siteName: string | null;
      note: string | null;
      createdAt: string;
      username: string;
      picFile: string | null;
    }>;

    res.json({
      links: rows.map((r) => ({
        id: r.id,
        url: r.url,
        title: r.title,
        description: r.description,
        imageUrl: r.imageUrl,
        siteName: r.siteName,
        note: r.note,
        createdAt: r.createdAt,
        username: r.username,
        profilePictureUrl: r.picFile ? `/api/uploads/avatars/${r.picFile}` : null,
      })),
    });
  });

  app.post('/api/shared-links', requirePlayer, async (req: AuthedPlayerRequest, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 180);
    if (!rawUrl) {
      res.status(400).json({ error: 'Please provide a valid URL to share.' });
      return;
    }
    try {
      const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
      const selfOrigin = `${proto}://${host}`;
      const preview = await fetchLinkPreview(rawUrl, selfOrigin);
      if (preview.fallback) {
        res.status(400).json({
          error: preview.fallbackReason || 'Cannot publish preview for an unreachable or restricted destination.',
        });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO shared_links (id, player_id, url, title, description, image_url, site_name, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        req.player!.id,
        preview.finalUrl,
        preview.title,
        preview.description,
        preview.image,
        preview.siteName,
        note || null,
        now
      );

      res.status(201).json({
        ok: true,
        sharedLink: {
          id,
          url: preview.finalUrl,
          title: preview.title,
          description: preview.description,
          imageUrl: preview.image,
          siteName: preview.siteName,
          note: note || null,
          createdAt: now,
          username: req.player!.username,
          profilePictureUrl: req.player!.profile_picture_file
            ? `/api/uploads/avatars/${req.player!.profile_picture_file}`
            : null,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to share link.' });
    }
  });

  // Website-level Social Preview Metadata Status, Cache-Buster Refresh & Published URL Audit
  app.get('/api/social-preview/status', (req, res) => {
    const meta = resolveShareMetadata(req, '/');
    const baseUrl = resolveCanonicalPublishedBaseUrl(req);
    res.json({
      ok: true,
      publishedBaseUrl: baseUrl,
      shareUrlWithVersion: `${baseUrl}/?v=${meta.version}`,
      robotsTxtUrl: `${baseUrl}/robots.txt`,
      previewVersion: Number(meta.version),
      metadata: {
        ogTitle: meta.title,
        ogDescription: meta.description,
        ogImage: meta.imageUrl,
        ogUrl: meta.canonicalUrl,
        ogType: 'website',
        twitterCard: 'summary_large_image',
        twitterTitle: meta.title,
        twitterDescription: meta.description,
        twitterImage: meta.imageUrl,
      },
    });
  });

  app.post('/api/social-preview/refresh', (req, res) => {
    const bumped = bumpPreviewCacheVersion();
    const baseUrl = resolveCanonicalPublishedBaseUrl(req);
    const meta = resolveShareMetadata(req, '/');
    res.json({
      ok: true,
      previewVersion: bumped.version,
      updatedAt: bumped.updatedAt,
      publishedBaseUrl: baseUrl,
      shareUrlWithVersion: `${baseUrl}/?v=${bumped.version}`,
      ogImage: meta.imageUrl,
      message: `Social preview cache version bumped to v=${bumped.version}. Share the refreshed URL or run platform scrapers to update cached cards.`,
    });
  });

  app.post('/api/social-preview/verify', rateLimit('social-verify', 15, 60_000), async (req, res) => {
    const targetMode = req.body?.target === 'local' ? 'local' : 'published';
    const publishedBase = resolveCanonicalPublishedBaseUrl(req);
    const targetBase = targetMode === 'local' ? 'http://127.0.0.1:3000' : publishedBase;
    const crawlerUa = 'WhatsApp/2.23.20.0';

    const result: {
      targetMode: 'published' | 'local';
      targetUrl: string;
      reachable: boolean;
      httpStatus: number | null;
      blockedByAuthOrCookieGate: boolean;
      robotsAllowed: boolean | null;
      robotsStatus: number | null;
      imageReachable: boolean;
      imageStatus: number | null;
      imageContentType: string | null;
      meta: Record<string, string | null>;
      issues: string[];
    } = {
      targetMode,
      targetUrl: `${targetBase}/`,
      reachable: false,
      httpStatus: null,
      blockedByAuthOrCookieGate: false,
      robotsAllowed: null,
      robotsStatus: null,
      imageReachable: false,
      imageStatus: null,
      imageContentType: null,
      meta: {},
      issues: [],
    };

    try {
      const htmlResp = await fetch(`${targetBase}/`, {
        headers: { 'User-Agent': crawlerUa, Accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
      });
      result.httpStatus = htmlResp.status;
      const html = await htmlResp.text();
      if (htmlResp.url.includes('__cookie_check') || html.includes('Cookie check')) {
        result.blockedByAuthOrCookieGate = true;
        result.issues.push('Hosting proxy redirected crawler to a cookie/auth check page.');
      }
      result.reachable = htmlResp.ok && !result.blockedByAuthOrCookieGate;
      if (!htmlResp.ok) {
        result.issues.push(`Destination returned HTTP ${htmlResp.status}. Publish/deploy the app to activate the live public URL.`);
      }

      const pickMeta = (key: string) => {
        const rx = new RegExp(
          `<meta\\b[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>|<meta\\b[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
          'i'
        );
        const m = html.match(rx);
        return m ? (m[1] ?? m[2] ?? '').trim() : null;
      };

      result.meta = {
        ogTitle: pickMeta('og:title'),
        ogDescription: pickMeta('og:description'),
        ogImage: pickMeta('og:image'),
        ogUrl: pickMeta('og:url'),
        ogType: pickMeta('og:type'),
        twitterCard: pickMeta('twitter:card'),
        twitterTitle: pickMeta('twitter:title'),
        twitterImage: pickMeta('twitter:image'),
      };

      if (result.reachable) {
        if (!result.meta.ogTitle) result.issues.push('Missing og:title in initial HTML.');
        if (!result.meta.ogDescription) result.issues.push('Missing og:description in initial HTML.');
        if (!result.meta.ogImage) result.issues.push('Missing og:image in initial HTML.');
        if (!result.meta.twitterCard) result.issues.push('Missing twitter:card in initial HTML.');
      }

      // Check robots.txt
      try {
        const robotsResp = await fetch(`${targetBase}/robots.txt`, {
          headers: { 'User-Agent': crawlerUa },
          signal: AbortSignal.timeout(5000),
        });
        result.robotsStatus = robotsResp.status;
        const robotsText = await robotsResp.text();
        result.robotsAllowed = robotsResp.ok && !/Disallow:\s*\/\s*$/im.test(robotsText);
        if (!result.robotsAllowed) {
          result.issues.push(`robots.txt check failed (HTTP ${robotsResp.status}).`);
        }
      } catch {
        result.robotsAllowed = false;
        result.issues.push('Could not fetch /robots.txt.');
      }

      // Check og:image public accessibility
      const rawImgUrl = result.meta.ogImage || `${targetBase}/og-hero.jpg`;
      let imgFetchUrl = rawImgUrl;
      if (targetMode === 'local') {
        try {
          const parsedImg = new URL(rawImgUrl, targetBase);
          imgFetchUrl = `${targetBase}${parsedImg.pathname}${parsedImg.search}`;
        } catch {
          imgFetchUrl = `${targetBase}/og-hero.jpg`;
        }
      }
      try {
        const imgResp = await fetch(imgFetchUrl, {
          headers: { 'User-Agent': crawlerUa },
          signal: AbortSignal.timeout(6000),
        });
        result.imageStatus = imgResp.status;
        result.imageContentType = imgResp.headers.get('content-type');
        result.imageReachable = imgResp.ok && Boolean(result.imageContentType?.startsWith('image/'));
        if (!result.imageReachable) {
          result.issues.push(`Preview image returned HTTP ${imgResp.status} (${result.imageContentType || 'unknown'}).`);
        }
      } catch {
        result.issues.push('Preview image URL was unreachable.');
      }
    } catch (err) {
      result.issues.push(err instanceof Error ? err.message : 'Unable to connect to target URL.');
    }

    res.json({ ok: true, audit: result });
  });

  // =========================================================================
  // 06. PRIVATE OWNER ADMIN DASHBOARD (SEPARATE AUTH & SERVER AUTHORIZATION)
  // =========================================================================

  app.get('/api/admin/status', (req, res) => {
    const envManaged = Boolean(process.env.ADMIN_PASSKEY && process.env.ADMIN_PASSKEY.length >= 8);
    const credRow = db.prepare('SELECT id FROM admin_credentials LIMIT 1').get();
    res.json({
      configured: envManaged || Boolean(credRow),
      envManaged,
      authenticated: isAdminAuthenticated(req),
    });
  });

  app.post('/api/admin/setup', rateLimit('admin-setup', 6, 60_000), (req, res) => {
    if (process.env.ADMIN_PASSKEY && process.env.ADMIN_PASSKEY.length >= 8) {
      res.status(409).json({ error: 'Administrator passkey is managed by environment variables.' });
      return;
    }
    const existing = db.prepare('SELECT id FROM admin_credentials LIMIT 1').get();
    if (existing) {
      res.status(409).json({ error: 'Administrator passkey has already been initialized.' });
      return;
    }
    const passkey = String(req.body?.passkey || '').trim();
    if (passkey.length < 8) {
      res.status(400).json({ error: 'Administrator passkey must be at least 8 characters.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO admin_credentials (id, passkey_hash, owner_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run('owner', hashSecret(passkey), 'Owner', now, now);

    const rawToken = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_sessions (id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      crypto.randomUUID(),
      sha256(rawToken),
      Date.now() + ADMIN_SESSION_DURATION_MS,
      Date.now()
    );
    setHttpCookie(res, 'gv_admin_session', rawToken, ADMIN_SESSION_DURATION_MS);
    res.status(201).json({ ok: true, adminToken: rawToken });
  });

  app.post('/api/admin/login', rateLimit('admin-login', 10, 60_000), (req, res) => {
    const passkey = String(req.body?.passkey || '');
    if (!passkey) {
      res.status(400).json({ error: 'Administrator passkey is required.' });
      return;
    }

    let valid = false;
    const envPasskey = process.env.ADMIN_PASSKEY;
    if (envPasskey && envPasskey.length >= 8) {
      const a = Buffer.from(passkey);
      const b = Buffer.from(envPasskey);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else {
      const cred = db.prepare('SELECT passkey_hash FROM admin_credentials LIMIT 1').get() as
        | { passkey_hash: string }
        | undefined;
      if (cred) valid = verifySecret(passkey, cred.passkey_hash);
    }

    if (!valid) {
      logServerError('/api/admin/login', 'warn', 'Rejected invalid administrator passkey attempt');
      res.status(401).json({ error: 'Invalid administrator passkey.' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO admin_sessions (id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
      crypto.randomUUID(),
      sha256(rawToken),
      Date.now() + ADMIN_SESSION_DURATION_MS,
      Date.now()
    );
    setHttpCookie(res, 'gv_admin_session', rawToken, ADMIN_SESSION_DURATION_MS);
    res.json({ ok: true, adminToken: rawToken });
  });

  app.post('/api/admin/logout', (req, res) => {
    const token = extractToken(req, 'gv_admin_session', 'x-admin-token');
    if (token) {
      db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
    }
    res.clearCookie('gv_admin_session', { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    const now = Date.now();
    const rt = realtime.getTelemetry();
    const totalPlayers = (db.prepare('SELECT COUNT(*) as c FROM players').get() as { c: number }).c;
    const activeSessions = (
      db.prepare('SELECT COUNT(*) as c FROM player_sessions WHERE expires_at > ?').get(now) as { c: number }
    ).c;
    const totalMatches = (db.prepare('SELECT COUNT(*) as c FROM match_records').get() as { c: number }).c;
    const totalTournaments = (db.prepare('SELECT COUNT(*) as c FROM tournaments').get() as { c: number }).c;
    const lpTotals = db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) as failed
         FROM link_preview_logs`
      )
      .get() as { total: number; failed: number | null };
    const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const walMode = String(db.pragma('journal_mode', { simple: true }) || 'wal');

    const players = db
      .prepare(
        `SELECT p.id, p.username, p.level, p.points, p.coins, p.banned,
                p.last_seen_at as lastSeenAt, COUNT(m.id) as totalMatches
         FROM players p
         LEFT JOIN match_records m ON m.player_id = p.id
         GROUP BY p.id
         ORDER BY p.last_seen_at DESC
         LIMIT 50`
      )
      .all()
      .map((r) => {
        const row = r as Record<string, unknown>;
        return { ...row, banned: Boolean(row.banned) };
      });

    const gameBreakdownRows = db
      .prepare(
        `SELECT game_id as gameId, COUNT(*) as matches,
                SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) as wins
         FROM match_records
         GROUP BY game_id`
      )
      .all() as Array<{ gameId: GameId; matches: number; wins: number }>;

    const gameBreakdownMap = new Map(gameBreakdownRows.map((g) => [g.gameId, g]));
    const gameBreakdown = ALL_GAME_IDS.map((gid) => ({
      gameId: gid,
      matches: gameBreakdownMap.get(gid)?.matches ?? 0,
      wins: gameBreakdownMap.get(gid)?.wins ?? 0,
    }));

    const sessions = db
      .prepare(
        `SELECT s.id, s.player_id as playerId, p.username, s.last_active_at as lastActiveAt, s.expires_at as expiresAt
         FROM player_sessions s
         JOIN players p ON p.id = s.player_id
         WHERE s.expires_at > ?
         ORDER BY s.last_active_at DESC
         LIMIT 50`
      )
      .all(now);

    const recentActivity = db
      .prepare(
        `SELECT m.id, p.username, m.game_id as gameId, m.outcome, m.score_delta as scoreDelta,
                m.xp_earned as xpEarned, m.coins_earned as coinsEarned, m.created_at as createdAt
         FROM match_records m
         JOIN players p ON p.id = m.player_id
         ORDER BY m.created_at DESC
         LIMIT 30`
      )
      .all();

    const challenges = db
      .prepare(
        `SELECT id, kind, game_id as gameId, title, description, target_count as targetCount,
                xp_reward as xpReward, coin_reward as coinReward, active
         FROM challenge_configs`
      )
      .all()
      .map((r) => {
        const row = r as Record<string, unknown>;
        return { ...row, active: Boolean(row.active) };
      });

    const achievements = db
      .prepare(
        'SELECT key, title, description, category, xp_reward as xpReward, coin_reward as coinReward FROM achievement_configs'
      )
      .all();

    const rewards = db
      .prepare(
        'SELECT id, name, category, description, coin_cost as coinCost, accent_hex as accentHex FROM reward_catalog ORDER BY coin_cost ASC'
      )
      .all();

    const announcements = db
      .prepare('SELECT id, title, message, level, created_at as createdAt FROM platform_announcements ORDER BY created_at DESC LIMIT 20')
      .all();

    const linkPreviewLogs = db
      .prepare(
        `SELECT l.id, l.url, l.status, l.fallback_reason as fallbackReason, l.latency_ms as latencyMs,
                p.username, l.created_at as createdAt
         FROM link_preview_logs l
         LEFT JOIN players p ON p.id = l.player_id
         ORDER BY l.created_at DESC
         LIMIT 30`
      )
      .all();

    const errorLogs = db
      .prepare('SELECT id, route, level, message, created_at as createdAt FROM error_logs ORDER BY created_at DESC LIMIT 30')
      .all();

    res.json({
      stats: {
        totalPlayers,
        activeSessions,
        onlineConnections: rt.onlineConnections,
        activeRooms: rt.activeRooms,
        queuedPlayers: rt.queuedPlayers,
        totalMatches,
        totalTournaments,
        totalLinkPreviews: lpTotals.total ?? 0,
        failedLinkPreviews: lpTotals.failed ?? 0,
        dbSizeBytes,
        walMode,
        uptimeSec: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
      },
      players,
      gameBreakdown,
      sessions,
      liveRooms: rt.liveRooms,
      tournaments: listTournaments(null),
      announcements,
      recentActivity,
      challenges,
      achievements,
      rewards,
      linkPreviewLogs,
      errorLogs,
    });
  });

  app.post('/api/admin/players/:id/coins', requireAdmin, (req, res) => {
    const player = db.prepare('SELECT id, username, coins FROM players WHERE id = ?').get(req.params.id) as
      | { id: string; username: string; coins: number }
      | undefined;
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }
    const delta = Math.max(-10000, Math.min(10000, Math.round(Number(req.body?.amount ?? 0))));
    if (!delta) {
      res.status(400).json({ error: 'Enter a non-zero coin adjustment.' });
      return;
    }
    const reason = String(req.body?.reason || 'Admin coin adjustment').trim().slice(0, 120);
    const nextCoins = Math.max(0, player.coins + delta);
    const now = new Date().toISOString();
    db.prepare('UPDATE players SET coins = ?, updated_at = ? WHERE id = ?').run(nextCoins, now, player.id);

    logCoinTransaction({
      playerId: player.id,
      amount: nextCoins - player.coins,
      balanceAfter: nextCoins,
      category: 'admin',
      description: reason,
    });
    createNotification(
      player.id,
      delta > 0 ? `Virtual Coin Grant (+${delta})` : `Virtual Coin Adjustment (${delta})`,
      `${reason}. Current balance: ${nextCoins} Coins.`,
      'reward'
    );
    res.json({ ok: true, coins: nextCoins });
  });

  app.patch('/api/admin/players/:id/moderate', requireAdmin, (req, res) => {
    const player = db.prepare('SELECT id FROM players WHERE id = ?').get(req.params.id) as { id: string } | undefined;
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }
    const banned = req.body?.banned === true ? 1 : 0;
    db.prepare('UPDATE players SET banned = ?, updated_at = ? WHERE id = ?').run(
      banned,
      new Date().toISOString(),
      player.id
    );
    if (banned) {
      db.prepare('DELETE FROM player_sessions WHERE player_id = ?').run(player.id);
    }
    res.json({ ok: true, banned: Boolean(banned) });
  });

  app.post('/api/admin/announcements', requireAdmin, (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 80);
    const message = String(req.body?.message || '').trim().slice(0, 320);
    const level = ['info', 'event', 'alert'].includes(req.body?.level) ? req.body.level : 'info';
    if (title.length < 3 || message.length < 5) {
      res.status(400).json({ error: 'Provide both an announcement title and message.' });
      return;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO platform_announcements (id, title, message, level, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      title,
      message,
      level,
      now
    );
    const activePlayers = db.prepare('SELECT id FROM players WHERE banned = 0 LIMIT 100').all() as Array<{ id: string }>;
    for (const p of activePlayers) {
      createNotification(p.id, title, message, 'announcement');
    }
    res.status(201).json({ ok: true, id });
  });

  app.delete('/api/admin/announcements/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM platform_announcements WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/admin/tournaments', requireAdmin, (req, res) => {
    const title = String(req.body?.title || '').trim().slice(0, 70);
    const gameId = String(req.body?.gameId || 'tictactoe') as GameId;
    const competitionType = req.body?.competitionType === 'exhibition_demo' ? 'exhibition_demo' : 'scheduled';
    const maxPlayers = Number(req.body?.maxPlayers) === 8 ? 8 : 4;
    const entryFeeCoins = Math.max(0, Math.min(500, Math.round(Number(req.body?.entryFeeCoins ?? 0))));
    const prizeCoins = Math.max(50, Math.min(5000, Math.round(Number(req.body?.prizeCoins ?? 300))));
    const description =
      String(req.body?.description || '').trim().slice(0, 220) || 'Official PLAYNOVA scheduled tournament.';
    if (title.length < 4 || !ALL_GAME_IDS.includes(gameId)) {
      res.status(400).json({ error: 'Provide valid tournament title and game.' });
      return;
    }
    const id = `tour_${crypto.randomBytes(5).toString('hex')}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tournaments
       (id, title, game_id, competition_type, status, max_players, entry_fee_coins, prize_coins, starts_at, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'registration', ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, gameId, competitionType, maxPlayers, entryFeeCoins, prizeCoins, new Date(Date.now() + 86400_000).toISOString(), description, now, now);
    res.status(201).json({ ok: true, id });
  });

  app.post('/api/admin/tournaments/:id/start', requireAdmin, (req, res) => {
    const tId = req.params.id;
    const count = (db.prepare('SELECT COUNT(*) as c FROM tournament_participants WHERE tournament_id = ?').get(tId) as { c: number }).c;
    if (count < 2) {
      res.status(400).json({ error: 'Need at least 2 participants to start the bracket.' });
      return;
    }
    seedTournamentBracket(tId);
    res.json({ ok: true });
  });

  app.delete('/api/admin/tournaments/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/sessions/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM player_sessions WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/admin/leaderboard/:playerId', requireAdmin, (req, res) => {
    const playerId = req.params.playerId;
    db.prepare('DELETE FROM match_records WHERE player_id = ?').run(playerId);
    db.prepare('UPDATE players SET points = 0, xp = 0, level = 1, current_streak = 0, best_streak = 0 WHERE id = ?').run(
      playerId
    );
    res.json({ ok: true });
  });

  app.put('/api/admin/challenges/:id', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM challenge_configs WHERE id = ?').get(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Challenge not found.' });
      return;
    }
    const body = req.body || {};
    db.prepare(
      'UPDATE challenge_configs SET title = ?, target_count = ?, xp_reward = ?, coin_reward = ?, active = ?, updated_at = ? WHERE id = ?'
    ).run(
      String(body.title || '').trim().slice(0, 60) || 'Challenge',
      Math.max(1, Math.min(100, Math.round(Number(body.targetCount || 1)))),
      Math.max(10, Math.min(5000, Math.round(Number(body.xpReward || 100)))),
      Math.max(5, Math.min(2000, Math.round(Number(body.coinReward || 50)))),
      body.active === false ? 0 : 1,
      new Date().toISOString(),
      req.params.id
    );
    res.json({ ok: true });
  });

  app.put('/api/admin/achievements/:key', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM achievement_configs WHERE key = ?').get(req.params.key);
    if (!row) {
      res.status(404).json({ error: 'Achievement not found.' });
      return;
    }
    const body = req.body || {};
    db.prepare(
      'UPDATE achievement_configs SET title = ?, xp_reward = ?, coin_reward = ?, updated_at = ? WHERE key = ?'
    ).run(
      String(body.title || '').trim().slice(0, 60) || 'Achievement',
      Math.max(10, Math.min(5000, Math.round(Number(body.xpReward || 100)))),
      Math.max(5, Math.min(2000, Math.round(Number(body.coinReward || 50)))),
      new Date().toISOString(),
      req.params.key
    );
    res.json({ ok: true });
  });

  app.put('/api/admin/rewards/:id', requireAdmin, (req, res) => {
    const row = db.prepare('SELECT * FROM reward_catalog WHERE id = ?').get(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Reward item not found.' });
      return;
    }
    const body = req.body || {};
    db.prepare('UPDATE reward_catalog SET name = ?, coin_cost = ?, updated_at = ? WHERE id = ?').run(
      String(body.name || '').trim().slice(0, 60) || 'Reward',
      Math.max(0, Math.min(50000, Math.round(Number(body.coinCost ?? 100)))),
      new Date().toISOString(),
      req.params.id
    );
    res.json({ ok: true });
  });

  // Global error handler logging into error_logs
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logServerError(req.originalUrl, 'error', err.message || 'Unhandled server error');
    if (!res.headersSent) {
      res.status(500).json({ error: 'An internal server error occurred.' });
    }
  });

  // =========================================================================
  // 07. VITE / STATIC SERVING WITH SERVER-RENDERED OPEN GRAPH & TWITTER META
  // =========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });

    app.get(
      [
        '/',
        '/lobby',
        '/multiplayer',
        '/tournaments',
        '/games',
        '/games/:game',
        '/leaderboard',
        '/link-preview',
        '/profile',
        '/admin',
        '/share/:slug',
      ],
      async (req, res, next) => {
      try {
        const templatePath = path.resolve(process.cwd(), 'index.html');
        const template = fs.readFileSync(templatePath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, template);
        const htmlWithMeta = injectSocialMetaTags(transformed, req);
        const hasBust = Boolean(req.query.v || req.query.refresh);
        res.setHeader(
          'Cache-Control',
          hasBust ? 'no-cache, no-store, must-revalidate' : 'public, max-age=0, must-revalidate'
        );
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('X-Robots-Tag', 'all');
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(htmlWithMeta);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const distHtmlPath = path.join(distDir, 'index.html');
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, servedPath) => {
          if (servedPath.endsWith('og-hero.jpg')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('X-Robots-Tag', 'all');
          }
        },
      })
    );
    app.get('/{*splat}', (req, res) => {
      const template = fs.readFileSync(distHtmlPath, 'utf-8');
      const htmlWithMeta = injectSocialMetaTags(template, req);
      const hasBust = Boolean(req.query.v || req.query.refresh);
      res.setHeader(
        'Cache-Control',
        hasBust ? 'no-cache, no-store, must-revalidate' : 'public, max-age=0, must-revalidate'
      );
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('X-Robots-Tag', 'all');
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(htmlWithMeta);
    });
  }

  const port = 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`PLAYNOVA server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PLAYNOVA server:', err);
  process.exit(1);
});
