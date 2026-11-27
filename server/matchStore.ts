import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type MatchOutcomeType =
  | 'normal'
  | 'sudden_death'
  | 'disconnect_forfeit'
  | 'draw'
  | 'abandoned';

export interface CompletedMatchInput {
  id: string;
  roundNumber: number;
  matchType: 'ko_2min' | 'endless';
  player1Id: string;
  player1Name: string;
  player1Level: number;
  player2Id: string;
  player2Name: string;
  player2Level: number;
  player1Kos: number;
  player2Kos: number;
  player1Score: number;
  player2Score: number;
  player1Lines: number;
  player2Lines: number;
  winnerId: string | null;
  forfeitedById: string | null;
  outcomeType: MatchOutcomeType;
  finishReason: string;
  durationMs: number;
  startedAt: string;
  endedAt: string;
}

export interface PlayerMatchRecord {
  playerId: string;
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  forfeits: number;
  totalKos: number;
  matchesPlayed: number;
  updatedAt: string | null;
}

export interface MatchHistoryItem {
  id: string;
  roundNumber: number;
  matchType: 'ko_2min' | 'endless';
  opponentName: string;
  opponentLevel: number;
  myKos: number;
  opponentKos: number;
  myScore: number;
  opponentScore: number;
  myLines: number;
  opponentLines: number;
  result: 'win' | 'loss' | 'draw' | 'abandoned';
  outcomeType: MatchOutcomeType;
  finishReason: string;
  durationMs: number;
  endedAt: string;
}

function resolveDbPath(): string {
  const custom = (process.env.MATCHMAKING_DB_PATH ?? '').trim();
  if (custom) {
    return path.resolve(custom);
  }
  return path.resolve(process.cwd(), 'data', 'matchmaking.db');
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

    CREATE TABLE IF NOT EXISTS online_matches (
      id TEXT PRIMARY KEY,
      round_number INTEGER NOT NULL DEFAULT 1,
      match_type TEXT NOT NULL CHECK (match_type IN ('ko_2min', 'endless')),
      player1_id TEXT NOT NULL,
      player1_name TEXT NOT NULL,
      player1_level INTEGER NOT NULL DEFAULT 1,
      player2_id TEXT NOT NULL,
      player2_name TEXT NOT NULL,
      player2_level INTEGER NOT NULL DEFAULT 1,
      player1_kos INTEGER NOT NULL DEFAULT 0,
      player2_kos INTEGER NOT NULL DEFAULT 0,
      player1_score INTEGER NOT NULL DEFAULT 0,
      player2_score INTEGER NOT NULL DEFAULT 0,
      player1_lines INTEGER NOT NULL DEFAULT 0,
      player2_lines INTEGER NOT NULL DEFAULT 0,
      winner_id TEXT,
      forfeited_by_id TEXT,
      outcome_type TEXT NOT NULL CHECK (
        outcome_type IN ('normal', 'sudden_death', 'disconnect_forfeit', 'draw', 'abandoned')
      ),
      finish_reason TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_online_matches_p1
      ON online_matches (player1_id, ended_at DESC);

    CREATE INDEX IF NOT EXISTS idx_online_matches_p2
      ON online_matches (player2_id, ended_at DESC);

    CREATE TABLE IF NOT EXISTS player_match_records (
      player_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      forfeits INTEGER NOT NULL DEFAULT 0,
      total_kos INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  dbInstance = db;
  return db;
}

function upsertPlayerRecord(
  db: DatabaseSync,
  params: {
    playerId: string;
    nickname: string;
    winDelta: number;
    lossDelta: number;
    drawDelta: number;
    forfeitDelta: number;
    koDelta: number;
    now: string;
  }
): void {
  db.prepare(`
    INSERT INTO player_match_records (
      player_id,
      nickname,
      wins,
      losses,
      draws,
      forfeits,
      total_kos,
      matches_played,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      nickname = excluded.nickname,
      wins = player_match_records.wins + excluded.wins,
      losses = player_match_records.losses + excluded.losses,
      draws = player_match_records.draws + excluded.draws,
      forfeits = player_match_records.forfeits + excluded.forfeits,
      total_kos = player_match_records.total_kos + excluded.total_kos,
      matches_played = player_match_records.matches_played + 1,
      updated_at = excluded.updated_at
  `).run(
    params.playerId,
    params.nickname,
    params.winDelta,
    params.lossDelta,
    params.drawDelta,
    params.forfeitDelta,
    params.koDelta,
    params.now
  );
}

/**
 * Atomically records a server-validated match outcome and updates both players' W/L/D stats.
 * Matches cancelled before start ('abandoned') are logged without penalizing either player's record.
 */
export function recordCompletedMatch(input: CompletedMatchInput): boolean {
  const db = getDb();
  const now = input.endedAt || new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    const insertRes = db
      .prepare(`
        INSERT OR IGNORE INTO online_matches (
          id,
          round_number,
          match_type,
          player1_id,
          player1_name,
          player1_level,
          player2_id,
          player2_name,
          player2_level,
          player1_kos,
          player2_kos,
          player1_score,
          player2_score,
          player1_lines,
          player2_lines,
          winner_id,
          forfeited_by_id,
          outcome_type,
          finish_reason,
          duration_ms,
          started_at,
          ended_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.id,
        input.roundNumber,
        input.matchType,
        input.player1Id,
        input.player1Name,
        input.player1Level,
        input.player2Id,
        input.player2Name,
        input.player2Level,
        input.player1Kos,
        input.player2Kos,
        input.player1Score,
        input.player2Score,
        input.player1Lines,
        input.player2Lines,
        input.winnerId,
        input.forfeitedById,
        input.outcomeType,
        input.finishReason,
        Math.max(0, Math.floor(input.durationMs)),
        input.startedAt,
        now
      );

    if (Number(insertRes.changes) === 0) {
      db.exec('COMMIT');
      return false;
    }

    if (input.outcomeType !== 'abandoned') {
      const isDraw = !input.winnerId;
      const p1Won = input.winnerId === input.player1Id;
      const p2Won = input.winnerId === input.player2Id;

      upsertPlayerRecord(db, {
        playerId: input.player1Id,
        nickname: input.player1Name,
        winDelta: p1Won ? 1 : 0,
        lossDelta: p2Won ? 1 : 0,
        drawDelta: isDraw ? 1 : 0,
        forfeitDelta: input.forfeitedById === input.player1Id ? 1 : 0,
        koDelta: Math.max(0, input.player1Kos),
        now,
      });

      upsertPlayerRecord(db, {
        playerId: input.player2Id,
        nickname: input.player2Name,
        winDelta: p2Won ? 1 : 0,
        lossDelta: p1Won ? 1 : 0,
        drawDelta: isDraw ? 1 : 0,
        forfeitDelta: input.forfeitedById === input.player2Id ? 1 : 0,
        koDelta: Math.max(0, input.player2Kos),
        now,
      });
    }

    db.exec('COMMIT');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getPlayerRecordAndHistory(
  playerId: string,
  limit = 12
): { record: PlayerMatchRecord; history: MatchHistoryItem[] } {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));

  const recRow = db
    .prepare(`
      SELECT
        player_id,
        nickname,
        wins,
        losses,
        draws,
        forfeits,
        total_kos,
        matches_played,
        updated_at
      FROM player_match_records
      WHERE player_id = ?
    `)
    .get(playerId) as
    | {
        player_id: string;
        nickname: string;
        wins: number;
        losses: number;
        draws: number;
        forfeits: number;
        total_kos: number;
        matches_played: number;
        updated_at: string;
      }
    | undefined;

  const record: PlayerMatchRecord = recRow
    ? {
        playerId: recRow.player_id,
        nickname: recRow.nickname,
        wins: recRow.wins,
        losses: recRow.losses,
        draws: recRow.draws,
        forfeits: recRow.forfeits,
        totalKos: recRow.total_kos,
        matchesPlayed: recRow.matches_played,
        updatedAt: recRow.updated_at,
      }
    : {
        playerId,
        nickname: 'Player',
        wins: 0,
        losses: 0,
        draws: 0,
        forfeits: 0,
        totalKos: 0,
        matchesPlayed: 0,
        updatedAt: null,
      };

  const rows = db
    .prepare(`
      SELECT
        id,
        round_number,
        match_type,
        player1_id,
        player1_name,
        player1_level,
        player2_id,
        player2_name,
        player2_level,
        player1_kos,
        player2_kos,
        player1_score,
        player2_score,
        player1_lines,
        player2_lines,
        winner_id,
        outcome_type,
        finish_reason,
        duration_ms,
        ended_at
      FROM online_matches
      WHERE player1_id = ? OR player2_id = ?
      ORDER BY ended_at DESC
      LIMIT ?
    `)
    .all(playerId, playerId, safeLimit) as Array<{
    id: string;
    round_number: number;
    match_type: 'ko_2min' | 'endless';
    player1_id: string;
    player1_name: string;
    player1_level: number;
    player2_id: string;
    player2_name: string;
    player2_level: number;
    player1_kos: number;
    player2_kos: number;
    player1_score: number;
    player2_score: number;
    player1_lines: number;
    player2_lines: number;
    winner_id: string | null;
    outcome_type: MatchOutcomeType;
    finish_reason: string;
    duration_ms: number;
    ended_at: string;
  }>;

  const history: MatchHistoryItem[] = rows.map((row) => {
    const isP1 = row.player1_id === playerId;
    const result: MatchHistoryItem['result'] =
      row.outcome_type === 'abandoned'
        ? 'abandoned'
        : !row.winner_id
          ? 'draw'
          : row.winner_id === playerId
            ? 'win'
            : 'loss';

    return {
      id: row.id,
      roundNumber: row.round_number,
      matchType: row.match_type,
      opponentName: isP1 ? row.player2_name : row.player1_name,
      opponentLevel: isP1 ? row.player2_level : row.player1_level,
      myKos: isP1 ? row.player1_kos : row.player2_kos,
      opponentKos: isP1 ? row.player2_kos : row.player1_kos,
      myScore: isP1 ? row.player1_score : row.player2_score,
      opponentScore: isP1 ? row.player2_score : row.player1_score,
      myLines: isP1 ? row.player1_lines : row.player2_lines,
      opponentLines: isP1 ? row.player2_lines : row.player1_lines,
      result,
      outcomeType: row.outcome_type,
      finishReason: row.finish_reason,
      durationMs: row.duration_ms,
      endedAt: row.ended_at,
    };
  });

  return { record, history };
}
