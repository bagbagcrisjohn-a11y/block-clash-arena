import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const ALLOWED_AVATAR_IDS = [
  'crest_cyan',
  'crest_amber',
  'crest_crimson',
  'crest_emerald',
  'crest_violet',
  'crest_cobalt',
  'crest_gold',
  'crest_prism',
] as const;

export type AvatarId = (typeof ALLOWED_AVATAR_IDS)[number];

const ALLOWED_AVATAR_SET = new Set<string>(ALLOWED_AVATAR_IDS);
const PLAYER_ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const MAX_LEVEL = 300;

export interface ServerPlayerProfile {
  uid: string;
  publicPlayerId: string;
  username: string;
  avatarId: AvatarId;
  photoUrl: string | null;
  level: number;
  currentXP: number;
  totalXP: number;
  totalKOs: number;
  totalWins: number;
  totalMatches: number;
  providers: string[];
  migratedLocalAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  publicPlayerId: string;
  username: string;
  avatarId: AvatarId;
  level: number;
  totalWins: number;
  totalKOs: number;
  totalMatches: number;
}

interface PlayerRow {
  uid: string;
  public_player_id: string;
  username: string;
  avatar_id: string;
  photo_url: string | null;
  level: number;
  current_xp: number;
  total_xp: number;
  total_kos: number;
  total_wins: number;
  total_matches: number;
  providers_json: string;
  migrated_local_at: string | null;
  created_at: string;
  updated_at: string;
}

function resolveDbPath(): string {
  const custom = (process.env.PLAYERS_DB_PATH ?? '').trim();
  if (custom) {
    return path.resolve(custom);
  }
  return path.resolve(process.cwd(), 'data', 'players.db');
}

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS player_profiles (
      uid TEXT PRIMARY KEY,
      public_player_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      avatar_id TEXT NOT NULL DEFAULT 'crest_cyan',
      photo_url TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      current_xp INTEGER NOT NULL DEFAULT 0,
      total_xp INTEGER NOT NULL DEFAULT 0,
      total_kos INTEGER NOT NULL DEFAULT 0,
      total_wins INTEGER NOT NULL DEFAULT 0,
      total_matches INTEGER NOT NULL DEFAULT 0,
      providers_json TEXT NOT NULL DEFAULT '[]',
      migrated_local_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_player_profiles_leaderboard
      ON player_profiles (total_wins DESC, level DESC, total_xp DESC);
  `);

  dbInstance = db;
  return db;
}

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(val)));
}

export function xpNeededForNextLevel(level: number): number {
  const lvl = clampInt(level, 1, MAX_LEVEL, 1);
  if (lvl >= MAX_LEVEL) return 0;
  return Math.floor(100 + lvl * 25 + Math.pow(lvl, 1.35));
}

export function sanitizeUsername(raw: unknown, fallback = 'Pilot'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw
    .replace(/[\r\n\t\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 16);
  if (cleaned.length < 2) return fallback;
  return cleaned;
}

export function sanitizeAvatarId(raw: unknown, fallback: AvatarId = 'crest_cyan'): AvatarId {
  if (typeof raw === 'string' && ALLOWED_AVATAR_SET.has(raw)) {
    return raw as AvatarId;
  }
  return fallback;
}

function sanitizePhotoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeProviders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(['google.com', 'phone', 'password']);
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string' && allowed.has(item)) {
      out.add(item);
    }
  }
  return Array.from(out);
}

function generatePublicPlayerId(): string {
  const bytes = crypto.randomBytes(8);
  let partA = '';
  let partB = '';
  for (let i = 0; i < 4; i++) {
    partA += PLAYER_ID_ALPHABET[bytes[i] % PLAYER_ID_ALPHABET.length];
    partB += PLAYER_ID_ALPHABET[bytes[i + 4] % PLAYER_ID_ALPHABET.length];
  }
  return `BC-${partA}-${partB}`;
}

function rowToProfile(row: PlayerRow): ServerPlayerProfile {
  let providers: string[] = [];
  try {
    const parsed = JSON.parse(row.providers_json) as unknown;
    providers = sanitizeProviders(parsed);
  } catch {
    providers = [];
  }
  return {
    uid: row.uid,
    publicPlayerId: row.public_player_id,
    username: row.username,
    avatarId: sanitizeAvatarId(row.avatar_id),
    photoUrl: row.photo_url,
    level: clampInt(row.level, 1, MAX_LEVEL, 1),
    currentXP: Math.max(0, Math.floor(row.current_xp)),
    totalXP: Math.max(0, Math.floor(row.total_xp)),
    totalKOs: Math.max(0, Math.floor(row.total_kos)),
    totalWins: Math.max(0, Math.floor(row.total_wins)),
    totalMatches: Math.max(0, Math.floor(row.total_matches)),
    providers,
    migratedLocalAt: row.migrated_local_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeLevelFromTotalXp(totalXp: number): { level: number; currentXP: number } {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < MAX_LEVEL) {
    const needed = xpNeededForNextLevel(level);
    if (remaining >= needed) {
      remaining -= needed;
      level += 1;
    } else {
      break;
    }
  }
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, currentXP: 0 };
  }
  return { level, currentXP: remaining };
}

export function getPlayerProfileByUid(uid: string): ServerPlayerProfile | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
    .get(uid) as PlayerRow | undefined;
  return row ? rowToProfile(row) : null;
}

/**
 * Fetches an authenticated player's profile, or atomically creates one with an immutable
 * permanent Public Player ID (BC-XXXX-XXXX) on their very first verified login.
 */
export function getOrCreatePlayerProfile(params: {
  uid: string;
  defaultName?: string;
  photoUrl?: string;
  providers?: string[];
}): ServerPlayerProfile {
  const db = getDb();
  const now = new Date().toISOString();
  const safeProviders = sanitizeProviders(params.providers ?? []);
  const safePhoto = sanitizePhotoUrl(params.photoUrl);

  const existing = db
    .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
    .get(params.uid) as PlayerRow | undefined;

  if (existing) {
    const mergedProviders = Array.from(
      new Set([...rowToProfile(existing).providers, ...safeProviders])
    );
    const nextPhoto = safePhoto ?? existing.photo_url;
    const providersChanged = JSON.stringify(mergedProviders) !== existing.providers_json;
    const photoChanged = nextPhoto !== existing.photo_url;

    if (providersChanged || photoChanged) {
      db.prepare(`
        UPDATE player_profiles
        SET providers_json = ?, photo_url = ?, updated_at = ?
        WHERE uid = ?
      `).run(JSON.stringify(mergedProviders), nextPhoto, now, params.uid);
      const updated = db
        .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
        .get(params.uid) as unknown as PlayerRow;
      return rowToProfile(updated);
    }
    return rowToProfile(existing);
  }

  const fallbackName = sanitizeUsername(params.defaultName, 'Pilot');
  for (let attempt = 0; attempt < 10; attempt++) {
    const publicId = generatePublicPlayerId();
    try {
      db.prepare(`
        INSERT INTO player_profiles (
          uid,
          public_player_id,
          username,
          avatar_id,
          photo_url,
          level,
          current_xp,
          total_xp,
          total_kos,
          total_wins,
          total_matches,
          providers_json,
          migrated_local_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 'crest_cyan', ?, 1, 0, 0, 0, 0, 0, ?, NULL, ?, ?)
      `).run(
        params.uid,
        publicId,
        fallbackName,
        safePhoto,
        JSON.stringify(safeProviders),
        now,
        now
      );

      const created = db
        .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
        .get(params.uid) as unknown as PlayerRow;
      return rowToProfile(created);
    } catch (err) {
      // Retry on rare public_player_id collision or race on uid insert
      const raceExisting = db
        .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
        .get(params.uid) as PlayerRow | undefined;
      if (raceExisting) return rowToProfile(raceExisting);
      if (attempt === 9) throw err;
    }
  }

  throw new Error('Could not provision permanent player ID.');
}

export function updatePlayerIdentity(
  uid: string,
  updates: { username?: unknown; avatarId?: unknown }
): { ok: true; profile: ServerPlayerProfile } | { ok: false; error: string; message: string } {
  const db = getDb();
  const existing = db
    .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
    .get(uid) as PlayerRow | undefined;

  if (!existing) {
    return { ok: false, error: 'PROFILE_NOT_FOUND', message: 'Player profile not found.' };
  }

  let nextUsername = existing.username;
  if (updates.username !== undefined) {
    if (typeof updates.username !== 'string') {
      return { ok: false, error: 'INVALID_USERNAME', message: 'Username must be text.' };
    }
    const trimmed = updates.username
      .replace(/[\r\n\t\u0000-\u001F\u007F]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (trimmed.length < 2 || trimmed.length > 16) {
      return {
        ok: false,
        error: 'INVALID_USERNAME',
        message: 'Username must be between 2 and 16 characters.',
      };
    }
    nextUsername = trimmed;
  }

  let nextAvatar = sanitizeAvatarId(existing.avatar_id);
  if (updates.avatarId !== undefined) {
    if (typeof updates.avatarId !== 'string' || !ALLOWED_AVATAR_SET.has(updates.avatarId)) {
      return {
        ok: false,
        error: 'INVALID_AVATAR',
        message: 'Selected avatar preset is not valid.',
      };
    }
    nextAvatar = updates.avatarId as AvatarId;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE player_profiles
    SET username = ?, avatar_id = ?, updated_at = ?
    WHERE uid = ?
  `).run(nextUsername, nextAvatar, now, uid);

  const updated = db
    .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
    .get(uid) as unknown as PlayerRow;
  return { ok: true, profile: rowToProfile(updated) };
}

/**
 * Safely merges post-match progression or a one-time guest local migration into the player's
 * authoritative cloud profile. Strictly monotonic: never erases higher cloud stats, and bounds
 * per-request deltas against malformed/tampered payloads.
 */
export function syncPlayerProgression(
  uid: string,
  input: {
    totalXP?: unknown;
    totalKOs?: unknown;
    totalWins?: unknown;
    totalMatches?: unknown;
    username?: unknown;
    isMigration?: boolean;
  }
): ServerPlayerProfile | null {
  const db = getDb();
  const existingRow = db
    .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
    .get(uid) as PlayerRow | undefined;
  if (!existingRow) return null;

  const current = rowToProfile(existingRow);

  // If this is a one-time guest migration and already migrated earlier, simply return existing cloud profile
  if (input.isMigration && current.migratedLocalAt) {
    return current;
  }

  const reqTotalXP = clampInt(input.totalXP, 0, 50_000_000, current.totalXP);
  const reqTotalKOs = clampInt(input.totalKOs, 0, 1_000_000, current.totalKOs);
  const reqTotalWins = clampInt(input.totalWins, 0, 1_000_000, current.totalWins);
  const reqTotalMatches = clampInt(input.totalMatches, 0, 2_000_000, current.totalMatches);

  // Guard single post-match sync delta against extreme jumps (migrations allow a generous historical cap)
  const maxXpDelta = input.isMigration ? 2_500_000 : 12_000;
  const maxMatchDelta = input.isMigration ? 50_000 : 5;
  const maxKoDelta = input.isMigration ? 250_000 : 120;

  let nextTotalXP: number;
  let nextTotalKOs: number;
  let nextTotalWins: number;
  let nextTotalMatches: number;

  if (input.isMigration) {
    // Take the higher of cloud vs local guest stats (or add cleanly if cloud was brand new)
    if (current.totalMatches === 0 && current.totalXP === 0) {
      nextTotalXP = Math.min(maxXpDelta, reqTotalXP);
      nextTotalKOs = Math.min(maxKoDelta, reqTotalKOs);
      nextTotalWins = Math.min(maxMatchDelta, reqTotalWins);
      nextTotalMatches = Math.max(nextTotalWins, Math.min(maxMatchDelta, reqTotalMatches));
    } else {
      nextTotalXP = Math.max(current.totalXP, Math.min(current.totalXP + maxXpDelta, reqTotalXP));
      nextTotalKOs = Math.max(current.totalKOs, Math.min(current.totalKOs + maxKoDelta, reqTotalKOs));
      nextTotalWins = Math.max(current.totalWins, Math.min(current.totalWins + maxMatchDelta, reqTotalWins));
      nextTotalMatches = Math.max(
        current.totalMatches,
        nextTotalWins,
        Math.min(current.totalMatches + maxMatchDelta, reqTotalMatches)
      );
    }
  } else {
    nextTotalXP = Math.max(current.totalXP, Math.min(current.totalXP + maxXpDelta, reqTotalXP));
    nextTotalKOs = Math.max(current.totalKOs, Math.min(current.totalKOs + maxKoDelta, reqTotalKOs));
    nextTotalWins = Math.max(current.totalWins, Math.min(current.totalWins + maxMatchDelta, reqTotalWins));
    nextTotalMatches = Math.max(
      current.totalMatches,
      nextTotalWins,
      Math.min(current.totalMatches + maxMatchDelta, reqTotalMatches)
    );
  }

  const { level, currentXP } = computeLevelFromTotalXp(nextTotalXP);
  const now = new Date().toISOString();
  const nextMigratedAt = input.isMigration ? now : current.migratedLocalAt;

  // Optionally inherit guest nickname ONLY if player still has the generic default name
  let nextUsername = current.username;
  if (
    input.isMigration &&
    (current.username === 'Pilot' || current.username === 'Player') &&
    typeof input.username === 'string'
  ) {
    const candidate = sanitizeUsername(input.username, current.username);
    if (candidate !== 'Player' && candidate !== 'Pilot') {
      nextUsername = candidate;
    }
  }

  db.prepare(`
    UPDATE player_profiles
    SET
      username = ?,
      level = ?,
      current_xp = ?,
      total_xp = ?,
      total_kos = ?,
      total_wins = ?,
      total_matches = ?,
      migrated_local_at = ?,
      updated_at = ?
    WHERE uid = ?
  `).run(
    nextUsername,
    level,
    currentXP,
    nextTotalXP,
    nextTotalKOs,
    nextTotalWins,
    nextTotalMatches,
    nextMigratedAt,
    now,
    uid
  );

  const updated = db
    .prepare(`SELECT * FROM player_profiles WHERE uid = ? LIMIT 1`)
    .get(uid) as unknown as PlayerRow;
  return rowToProfile(updated);
}

export function getPublicLeaderboard(limit = 20): LeaderboardEntry[] {
  const db = getDb();
  const safeLimit = clampInt(limit, 1, 50, 20);
  const rows = db
    .prepare(`
      SELECT
        public_player_id,
        username,
        avatar_id,
        level,
        total_wins,
        total_kos,
        total_matches
      FROM player_profiles
      ORDER BY total_wins DESC, level DESC, total_xp DESC
      LIMIT ?
    `)
    .all(safeLimit) as Array<{
    public_player_id: string;
    username: string;
    avatar_id: string;
    level: number;
    total_wins: number;
    total_kos: number;
    total_matches: number;
  }>;

  return rows.map((r) => ({
    publicPlayerId: r.public_player_id,
    username: r.username,
    avatarId: sanitizeAvatarId(r.avatar_id),
    level: clampInt(r.level, 1, MAX_LEVEL, 1),
    totalWins: Math.max(0, Math.floor(r.total_wins)),
    totalKOs: Math.max(0, Math.floor(r.total_kos)),
    totalMatches: Math.max(0, Math.floor(r.total_matches)),
  }));
}
