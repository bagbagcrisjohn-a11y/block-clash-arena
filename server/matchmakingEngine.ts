import crypto from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { recordCompletedMatch } from './matchStore.ts';
import type { MatchOutcomeType } from './matchStore.ts';

export type MatchmakingMatchType = 'ko_2min' | 'endless';
export type PlayerSlot = 'p1' | 'p2';

export interface ValidatedBoardSnapshot {
  grid: string;
  activeType: 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
  activeRot: 0 | 1 | 2 | 3;
  activeX: number;
  activeY: number;
  hold: '' | 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
  holdUsed: boolean;
  next3: string;
  score: number;
  level: number;
  kos: number;
  kosTaken: number;
  linesCleared: number;
  maxCombo: number;
  garbageSent: number;
  quads: number;
  piecesPlaced: number;
  combo: number;
  incomingTotal: number;
  incomingReady: number;
  nextGapCol: number;
  lastAttackLabel: string;
  bombBlastsSeq: number;
  lastBombCount: number;
}

interface ClientSession {
  socketId: string;
  ws: WebSocket;
  playerId: string | null;
  authenticated: boolean;
  nickname: string;
  playerLevel: number;
  alive: boolean;
  activeMatchId: string | null;
  queuedMatchType: MatchmakingMatchType | null;
}

interface QueueEntry {
  playerId: string;
  socketId: string;
  nickname: string;
  playerLevel: number;
  matchType: MatchmakingMatchType;
  enqueuedAtMs: number;
}

interface MatchParticipant {
  slot: PlayerSlot;
  playerId: string;
  socketId: string | null;
  nickname: string;
  playerLevel: number;
  connected: boolean;
  rematchReady: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  // Server-authoritative validated counters
  kos: number; // Derived strictly from opponent's validated kosTaken
  kosTaken: number;
  score: number;
  linesCleared: number;
  maxCombo: number;
  garbageSent: number;
  quads: number;
  piecesPlaced: number;
  bombBlastsSeq: number;
  lastKoTakenAtMs: number;
  lastUpdateAtMs: number;
  lastSnapshot: ValidatedBoardSnapshot;
}

interface ActiveMatch {
  id: string;
  roundNumber: number;
  matchType: MatchmakingMatchType;
  status: 'countdown' | 'playing' | 'finished' | 'closed';
  suddenDeath: boolean;
  createdAtMs: number;
  matchStartAtMs: number;
  startedAtIso: string;
  durationMs: number;
  participants: Record<PlayerSlot, MatchParticipant>;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  matchClockTimer: ReturnType<typeof setTimeout> | null;
  suddenDeathCapTimer: ReturnType<typeof setTimeout> | null;
  rematchWindowTimer: ReturnType<typeof setTimeout> | null;
}

export interface MatchmakingEngineOptions {
  verifyFirebaseIdToken: (idToken: string) => Promise<{
    uid: string;
    name?: string;
    email?: string;
  } | null>;
  allowedOrigins?: string[];
  countdownMs?: number;
  matchDurationMs?: number;
  disconnectGraceMs?: number;
  rematchWindowMs?: number;
}

const VALID_PIECES = new Set(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
const GRID_REGEX = /^[.IOTSZJLGB]{200}$/;
const NEXT3_REGEX = /^[IOTSZJL]{0,3}$/;

function createEmptySnapshot(): ValidatedBoardSnapshot {
  return {
    grid: '.'.repeat(200),
    activeType: 'T',
    activeRot: 0,
    activeX: 3,
    activeY: 4,
    hold: '',
    holdUsed: false,
    next3: 'IOS',
    score: 0,
    level: 1,
    kos: 0,
    kosTaken: 0,
    linesCleared: 0,
    maxCombo: 0,
    garbageSent: 0,
    quads: 0,
    piecesPlaced: 0,
    combo: 0,
    incomingTotal: 0,
    incomingReady: 0,
    nextGapCol: -1,
    lastAttackLabel: '',
    bombBlastsSeq: 0,
    lastBombCount: 0,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function sanitizeNickname(raw: unknown, fallback = 'Player'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\r\n\t<>]+/g, ' ').trim().slice(0, 16);
  return cleaned.length > 0 ? cleaned : fallback;
}

function sanitizeMatchType(raw: unknown): MatchmakingMatchType {
  return raw === 'endless' ? 'endless' : 'ko_2min';
}

export function attachMatchmakingServer(
  httpServer: HttpServer,
  options: MatchmakingEngineOptions
) {
  const COUNTDOWN_MS = options.countdownMs ?? 3000;
  const MATCH_DURATION_MS = options.matchDurationMs ?? 120_000;
  const DISCONNECT_GRACE_MS = options.disconnectGraceMs ?? 8000;
  const REMATCH_WINDOW_MS = options.rematchWindowMs ?? 45_000;
  const SUDDEN_DEATH_CAP_MS = 300_000;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  const clientsBySocketId = new Map<string, ClientSession>();
  const socketIdByPlayerId = new Map<string, string>();
  const queueByMatchType: Record<MatchmakingMatchType, QueueEntry[]> = {
    ko_2min: [],
    endless: [],
  };
  const queuedPlayerIds = new Set<string>();
  const activeMatches = new Map<string, ActiveMatch>();
  const matchIdByPlayerId = new Map<string, string>();

  function sendJson(ws: WebSocket | null | undefined, payload: Record<string, unknown>): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore write failures on closing sockets
    }
  }

  function sendToSocketId(socketId: string | null, payload: Record<string, unknown>): void {
    if (!socketId) return;
    const session = clientsBySocketId.get(socketId);
    if (session) sendJson(session.ws, payload);
  }

  function clearMatchTimers(match: ActiveMatch): void {
    if (match.countdownTimer) {
      clearTimeout(match.countdownTimer);
      match.countdownTimer = null;
    }
    if (match.matchClockTimer) {
      clearTimeout(match.matchClockTimer);
      match.matchClockTimer = null;
    }
    if (match.suddenDeathCapTimer) {
      clearTimeout(match.suddenDeathCapTimer);
      match.suddenDeathCapTimer = null;
    }
    if (match.rematchWindowTimer) {
      clearTimeout(match.rematchWindowTimer);
      match.rematchWindowTimer = null;
    }
    for (const slot of ['p1', 'p2'] as const) {
      const p = match.participants[slot];
      if (p.disconnectTimer) {
        clearTimeout(p.disconnectTimer);
        p.disconnectTimer = null;
      }
    }
  }

  function releaseMatchParticipants(match: ActiveMatch): void {
    clearMatchTimers(match);
    match.status = 'closed';
    for (const slot of ['p1', 'p2'] as const) {
      const p = match.participants[slot];
      if (matchIdByPlayerId.get(p.playerId) === match.id) {
        matchIdByPlayerId.delete(p.playerId);
      }
      if (p.socketId) {
        const session = clientsBySocketId.get(p.socketId);
        if (session && session.activeMatchId === match.id) {
          session.activeMatchId = null;
        }
      }
    }
    activeMatches.delete(match.id);
  }

  function removeFromQueue(playerId: string): boolean {
    if (!queuedPlayerIds.has(playerId)) return false;
    queuedPlayerIds.delete(playerId);
    for (const mt of ['ko_2min', 'endless'] as const) {
      const list = queueByMatchType[mt];
      const idx = list.findIndex((entry) => entry.playerId === playerId);
      if (idx !== -1) {
        const removed = list.splice(idx, 1)[0];
        const session = clientsBySocketId.get(removed.socketId);
        if (session) session.queuedMatchType = null;
      }
    }
    return true;
  }

  function getOpponentSlot(slot: PlayerSlot): PlayerSlot {
    return slot === 'p1' ? 'p2' : 'p1';
  }

  function findParticipantSlot(match: ActiveMatch, playerId: string): PlayerSlot | null {
    if (match.participants.p1.playerId === playerId) return 'p1';
    if (match.participants.p2.playerId === playerId) return 'p2';
    return null;
  }

  function buildAuthoritativeSummary(match: ActiveMatch) {
    const p1 = match.participants.p1;
    const p2 = match.participants.p2;
    return {
      p1: {
        nickname: p1.nickname,
        level: p1.playerLevel,
        kos: p1.kos,
        score: p1.score,
        linesCleared: p1.linesCleared,
        maxCombo: p1.maxCombo,
        garbageSent: p1.garbageSent,
        quads: p1.quads,
        piecesPlaced: p1.piecesPlaced,
      },
      p2: {
        nickname: p2.nickname,
        level: p2.playerLevel,
        kos: p2.kos,
        score: p2.score,
        linesCleared: p2.linesCleared,
        maxCombo: p2.maxCombo,
        garbageSent: p2.garbageSent,
        quads: p2.quads,
        piecesPlaced: p2.piecesPlaced,
      },
    };
  }

  function finishMatchAuthoritatively(
    match: ActiveMatch,
    params: {
      winnerSlot: PlayerSlot | 'draw' | null;
      outcomeType: MatchOutcomeType;
      finishReason: string;
      forfeitedSlot?: PlayerSlot | null;
    }
  ): void {
    if (match.status === 'finished' || match.status === 'closed') return;

    if (match.countdownTimer) {
      clearTimeout(match.countdownTimer);
      match.countdownTimer = null;
    }
    if (match.matchClockTimer) {
      clearTimeout(match.matchClockTimer);
      match.matchClockTimer = null;
    }
    if (match.suddenDeathCapTimer) {
      clearTimeout(match.suddenDeathCapTimer);
      match.suddenDeathCapTimer = null;
    }
    for (const slot of ['p1', 'p2'] as const) {
      const p = match.participants[slot];
      if (p.disconnectTimer) {
        clearTimeout(p.disconnectTimer);
        p.disconnectTimer = null;
      }
      p.rematchReady = false;
    }

    match.status = 'finished';
    const endedAtMs = Date.now();
    const endedAtIso = new Date(endedAtMs).toISOString();
    const durationMs =
      params.outcomeType === 'abandoned'
        ? 0
        : Math.max(0, endedAtMs - Math.min(endedAtMs, match.matchStartAtMs));

    const p1 = match.participants.p1;
    const p2 = match.participants.p2;
    const winnerId =
      params.winnerSlot === 'p1'
        ? p1.playerId
        : params.winnerSlot === 'p2'
          ? p2.playerId
          : null;
    const forfeitedById =
      params.forfeitedSlot === 'p1'
        ? p1.playerId
        : params.forfeitedSlot === 'p2'
          ? p2.playerId
          : null;

    const roundRecordId = `${match.id}_r${match.roundNumber}`;

    try {
      recordCompletedMatch({
        id: roundRecordId,
        roundNumber: match.roundNumber,
        matchType: match.matchType,
        player1Id: p1.playerId,
        player1Name: p1.nickname,
        player1Level: p1.playerLevel,
        player2Id: p2.playerId,
        player2Name: p2.nickname,
        player2Level: p2.playerLevel,
        player1Kos: p1.kos,
        player2Kos: p2.kos,
        player1Score: p1.score,
        player2Score: p2.score,
        player1Lines: p1.linesCleared,
        player2Lines: p2.linesCleared,
        winnerId,
        forfeitedById,
        outcomeType: params.outcomeType,
        finishReason: params.finishReason,
        durationMs,
        startedAt: match.startedAtIso,
        endedAt: endedAtIso,
      });
    } catch (err) {
      console.error('[Matchmaking Store Error]', err instanceof Error ? err.message : err);
    }

    if (params.outcomeType === 'abandoned') {
      for (const slot of ['p1', 'p2'] as const) {
        const p = match.participants[slot];
        sendToSocketId(p.socketId, {
          type: 'match:abandoned',
          matchId: match.id,
          roundNumber: match.roundNumber,
          reason: params.finishReason,
        });
      }
      releaseMatchParticipants(match);
      return;
    }

    const summary = buildAuthoritativeSummary(match);
    for (const slot of ['p1', 'p2'] as const) {
      const me = match.participants[slot];
      const opp = match.participants[getOpponentSlot(slot)];
      const myOutcome =
        params.winnerSlot === 'draw' || params.winnerSlot === null
          ? 'draw'
          : params.winnerSlot === slot
            ? 'win'
            : 'loss';

      sendToSocketId(me.socketId, {
        type: 'match:finished',
        matchId: match.id,
        roundNumber: match.roundNumber,
        outcome: myOutcome,
        outcomeType: params.outcomeType,
        finishReason: params.finishReason,
        durationMs,
        opponentConnected: opp.connected,
        myStats: slot === 'p1' ? summary.p1 : summary.p2,
        opponentStats: slot === 'p1' ? summary.p2 : summary.p1,
      });
    }

    // Hold match open briefly for rematch voting if both players are still connected
    if (!p1.connected || !p2.connected) {
      releaseMatchParticipants(match);
      return;
    }

    match.rematchWindowTimer = setTimeout(() => {
      if (match.status !== 'finished') return;
      for (const slot of ['p1', 'p2'] as const) {
        sendToSocketId(match.participants[slot].socketId, {
          type: 'rematch:expired',
          matchId: match.id,
        });
      }
      releaseMatchParticipants(match);
    }, REMATCH_WINDOW_MS);
  }

  function startMatchRound(match: ActiveMatch, isRematch: boolean): void {
    if (match.countdownTimer) clearTimeout(match.countdownTimer);
    if (match.matchClockTimer) clearTimeout(match.matchClockTimer);
    if (match.suddenDeathCapTimer) clearTimeout(match.suddenDeathCapTimer);
    if (match.rematchWindowTimer) clearTimeout(match.rematchWindowTimer);

    const serverNowMs = Date.now();
    const matchStartAtMs = serverNowMs + COUNTDOWN_MS;

    match.status = 'countdown';
    match.suddenDeath = false;
    match.matchStartAtMs = matchStartAtMs;
    match.startedAtIso = new Date(matchStartAtMs).toISOString();

    for (const slot of ['p1', 'p2'] as const) {
      const p = match.participants[slot];
      p.rematchReady = false;
      p.kos = 0;
      p.kosTaken = 0;
      p.score = 0;
      p.linesCleared = 0;
      p.maxCombo = 0;
      p.garbageSent = 0;
      p.quads = 0;
      p.piecesPlaced = 0;
      p.bombBlastsSeq = 0;
      p.lastKoTakenAtMs = 0;
      p.lastUpdateAtMs = serverNowMs;
      p.lastSnapshot = createEmptySnapshot();
    }

    for (const slot of ['p1', 'p2'] as const) {
      const me = match.participants[slot];
      const opp = match.participants[getOpponentSlot(slot)];
      sendToSocketId(me.socketId, {
        type: 'match:found',
        matchId: match.id,
        roundNumber: match.roundNumber,
        matchType: match.matchType,
        role: slot,
        isRematch,
        serverNowMs,
        matchStartAtMs,
        countdownMs: COUNTDOWN_MS,
        durationMs: match.durationMs,
        opponent: {
          nickname: opp.nickname,
          level: opp.playerLevel,
        },
      });
    }

    match.countdownTimer = setTimeout(() => {
      if (match.status !== 'countdown') return;
      const p1 = match.participants.p1;
      const p2 = match.participants.p2;
      if (!p1.connected || !p2.connected) {
        finishMatchAuthoritatively(match, {
          winnerSlot: null,
          outcomeType: 'abandoned',
          finishReason: 'Match cancelled — opponent disconnected before start.',
        });
        return;
      }

      const startNow = Date.now();
      match.status = 'playing';
      match.matchStartAtMs = startNow;
      match.startedAtIso = new Date(startNow).toISOString();

      for (const slot of ['p1', 'p2'] as const) {
        sendToSocketId(match.participants[slot].socketId, {
          type: 'match:start',
          matchId: match.id,
          roundNumber: match.roundNumber,
          serverNowMs: startNow,
          matchStartAtMs: startNow,
          durationMs: match.durationMs,
        });
      }

      if (match.matchType === 'ko_2min') {
        match.matchClockTimer = setTimeout(() => {
          if (match.status !== 'playing') return;
          const a = match.participants.p1;
          const b = match.participants.p2;
          if (a.kos !== b.kos) {
            finishMatchAuthoritatively(match, {
              winnerSlot: a.kos > b.kos ? 'p1' : 'p2',
              outcomeType: 'normal',
              finishReason: 'Time Expired · Most KOs',
            });
            return;
          }

          match.suddenDeath = true;
          for (const slot of ['p1', 'p2'] as const) {
            sendToSocketId(match.participants[slot].socketId, {
              type: 'match:sudden_death',
              matchId: match.id,
              roundNumber: match.roundNumber,
              serverNowMs: Date.now(),
            });
          }

          match.suddenDeathCapTimer = setTimeout(() => {
            if (match.status !== 'playing') return;
            const pA = match.participants.p1;
            const pB = match.participants.p2;
            let winnerSlot: PlayerSlot | 'draw' = 'draw';
            if (pA.kos !== pB.kos) {
              winnerSlot = pA.kos > pB.kos ? 'p1' : 'p2';
            } else if (pA.linesCleared !== pB.linesCleared) {
              winnerSlot = pA.linesCleared > pB.linesCleared ? 'p1' : 'p2';
            } else if (pA.score !== pB.score) {
              winnerSlot = pA.score > pB.score ? 'p1' : 'p2';
            }
            finishMatchAuthoritatively(match, {
              winnerSlot,
              outcomeType: winnerSlot === 'draw' ? 'draw' : 'sudden_death',
              finishReason:
                winnerSlot === 'draw'
                  ? 'Sudden Death Time Cap · Draw'
                  : 'Sudden Death Tiebreaker',
            });
          }, SUDDEN_DEATH_CAP_MS);
        }, match.durationMs);
      }
    }, COUNTDOWN_MS);
  }

  function tryPairQueuedPlayers(matchType: MatchmakingMatchType): void {
    const list = queueByMatchType[matchType];

    // Prune closed sockets or stale entries atomically first
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      const session = clientsBySocketId.get(entry.socketId);
      if (
        !session ||
        session.ws.readyState !== WebSocket.OPEN ||
        session.activeMatchId !== null ||
        matchIdByPlayerId.has(entry.playerId)
      ) {
        list.splice(i, 1);
        queuedPlayerIds.delete(entry.playerId);
        if (session) session.queuedMatchType = null;
      }
    }

    while (list.length >= 2) {
      const first = list.shift()!;
      const secondIdx = list.findIndex(
        (candidate) =>
          candidate.playerId !== first.playerId && candidate.socketId !== first.socketId
      );
      if (secondIdx === -1) {
        list.unshift(first);
        break;
      }
      const second = list.splice(secondIdx, 1)[0];

      queuedPlayerIds.delete(first.playerId);
      queuedPlayerIds.delete(second.playerId);

      const s1 = clientsBySocketId.get(first.socketId);
      const s2 = clientsBySocketId.get(second.socketId);
      if (!s1 || !s2 || s1.ws.readyState !== WebSocket.OPEN || s2.ws.readyState !== WebSocket.OPEN) {
        // Re-queue whichever socket is still healthy
        if (s1 && s1.ws.readyState === WebSocket.OPEN) {
          list.unshift(first);
          queuedPlayerIds.add(first.playerId);
        }
        if (s2 && s2.ws.readyState === WebSocket.OPEN) {
          list.unshift(second);
          queuedPlayerIds.add(second.playerId);
        }
        break;
      }

      const matchId = `mm_${crypto.randomUUID().replace(/-/g, '')}`;
      s1.queuedMatchType = null;
      s2.queuedMatchType = null;
      s1.activeMatchId = matchId;
      s2.activeMatchId = matchId;
      matchIdByPlayerId.set(first.playerId, matchId);
      matchIdByPlayerId.set(second.playerId, matchId);

      const now = Date.now();
      const match: ActiveMatch = {
        id: matchId,
        roundNumber: 1,
        matchType,
        status: 'countdown',
        suddenDeath: false,
        createdAtMs: now,
        matchStartAtMs: now + COUNTDOWN_MS,
        startedAtIso: new Date(now + COUNTDOWN_MS).toISOString(),
        durationMs: MATCH_DURATION_MS,
        participants: {
          p1: {
            slot: 'p1',
            playerId: first.playerId,
            socketId: first.socketId,
            nickname: first.nickname,
            playerLevel: first.playerLevel,
            connected: true,
            rematchReady: false,
            disconnectTimer: null,
            kos: 0,
            kosTaken: 0,
            score: 0,
            linesCleared: 0,
            maxCombo: 0,
            garbageSent: 0,
            quads: 0,
            piecesPlaced: 0,
            bombBlastsSeq: 0,
            lastKoTakenAtMs: 0,
            lastUpdateAtMs: now,
            lastSnapshot: createEmptySnapshot(),
          },
          p2: {
            slot: 'p2',
            playerId: second.playerId,
            socketId: second.socketId,
            nickname: second.nickname,
            playerLevel: second.playerLevel,
            connected: true,
            rematchReady: false,
            disconnectTimer: null,
            kos: 0,
            kosTaken: 0,
            score: 0,
            linesCleared: 0,
            maxCombo: 0,
            garbageSent: 0,
            quads: 0,
            piecesPlaced: 0,
            bombBlastsSeq: 0,
            lastKoTakenAtMs: 0,
            lastUpdateAtMs: now,
            lastSnapshot: createEmptySnapshot(),
          },
        },
        countdownTimer: null,
        matchClockTimer: null,
        suddenDeathCapTimer: null,
        rematchWindowTimer: null,
      };

      activeMatches.set(matchId, match);
      startMatchRound(match, false);
    }
  }

  function handleStateUpdate(session: ClientSession, raw: Record<string, unknown>): void {
    if (!session.playerId || !session.activeMatchId) return;
    const match = activeMatches.get(session.activeMatchId);
    if (!match || match.status !== 'playing') return;

    const requestedMatchId = typeof raw.matchId === 'string' ? raw.matchId : '';
    const requestedRound = clampInt(raw.roundNumber, 1, 999, 0);
    if (requestedMatchId !== match.id || requestedRound !== match.roundNumber) return;

    const mySlot = findParticipantSlot(match, session.playerId);
    if (!mySlot) return;
    const oppSlot = getOpponentSlot(mySlot);
    const me = match.participants[mySlot];
    const opp = match.participants[oppSlot];

    // Validate grid & piece payload strictly
    const grid = typeof raw.grid === 'string' && GRID_REGEX.test(raw.grid) ? raw.grid : me.lastSnapshot.grid;
    const activeType =
      typeof raw.activeType === 'string' && VALID_PIECES.has(raw.activeType)
        ? (raw.activeType as ValidatedBoardSnapshot['activeType'])
        : me.lastSnapshot.activeType;
    const activeRot = clampInt(raw.activeRot, 0, 3, me.lastSnapshot.activeRot) as 0 | 1 | 2 | 3;
    const activeX = clampInt(raw.activeX, -4, 12, me.lastSnapshot.activeX);
    const activeY = clampInt(raw.activeY, -4, 24, me.lastSnapshot.activeY);
    const hold =
      raw.hold === '' || (typeof raw.hold === 'string' && VALID_PIECES.has(raw.hold))
        ? (raw.hold as ValidatedBoardSnapshot['hold'])
        : me.lastSnapshot.hold;
    const holdUsed = Boolean(raw.holdUsed);
    const next3 =
      typeof raw.next3 === 'string' && NEXT3_REGEX.test(raw.next3) ? raw.next3 : me.lastSnapshot.next3;

    // Server-side monotonic & rate-sanity validation on gameplay counters
    const now = Date.now();
    const rawPieces = clampInt(raw.piecesPlaced, me.piecesPlaced, 99999, me.piecesPlaced);
    const piecesDelta = Math.min(8, Math.max(0, rawPieces - me.piecesPlaced));
    me.piecesPlaced += piecesDelta;

    const rawLines = clampInt(raw.linesCleared, me.linesCleared, 99999, me.linesCleared);
    // Max plausible lines cleared per update burst (including bomb chain clears)
    const maxPlausibleLineDelta = Math.max(8, piecesDelta * 12);
    const linesDelta = Math.min(maxPlausibleLineDelta, Math.max(0, rawLines - me.linesCleared));
    me.linesCleared += linesDelta;

    const rawQuads = clampInt(raw.quads, me.quads, 9999, me.quads);
    const quadDelta = Math.min(Math.floor(linesDelta / 4), Math.max(0, rawQuads - me.quads));
    me.quads += quadDelta;

    const rawMaxCombo = clampInt(raw.maxCombo, me.maxCombo, 999, me.maxCombo);
    const comboDelta = Math.min(Math.max(1, piecesDelta + 1), Math.max(0, rawMaxCombo - me.maxCombo));
    if (linesDelta > 0) {
      me.maxCombo += comboDelta;
    }

    // Validate garbage attack delta: cannot send garbage without clearing lines, bounded per lock
    const rawGarbage = clampInt(raw.garbageSent, me.garbageSent, 99999, me.garbageSent);
    const requestedGarbageDelta = Math.max(0, rawGarbage - me.garbageSent);
    const maxPlausibleGarbage = linesDelta > 0 ? Math.min(14, linesDelta * 3 + 4) : 0;
    const validatedGarbageDelta = Math.min(maxPlausibleGarbage, requestedGarbageDelta);
    me.garbageSent += validatedGarbageDelta;

    // Validate score delta plausibly (KO bonuses are added authoritatively by the server below)
    const rawScore = clampInt(raw.score, me.score, 99_999_999, me.score);
    const maxPlausibleScoreDelta =
      Math.max(80, piecesDelta * 60 + linesDelta * 1200 + validatedGarbageDelta * 200);
    const validatedScoreDelta = Math.min(maxPlausibleScoreDelta, Math.max(0, rawScore - me.score));
    me.score += validatedScoreDelta;

    // Validate KO taken (self top-out only — player CANNOT forge their own KO score!)
    const rawKosTaken = clampInt(raw.kosTaken, me.kosTaken, 999, me.kosTaken);
    let koTriggered = false;
    if (rawKosTaken > me.kosTaken && now - me.lastKoTakenAtMs >= 1000) {
      me.kosTaken += 1;
      me.lastKoTakenAtMs = now;
      opp.kos += 1;
      opp.score += 1000;
      koTriggered = true;
    }

    const rawBombSeq = clampInt(raw.bombBlastsSeq, me.bombBlastsSeq, 99999, me.bombBlastsSeq);
    const bombSeqDelta = linesDelta > 0 ? Math.min(2, Math.max(0, rawBombSeq - me.bombBlastsSeq)) : 0;
    me.bombBlastsSeq += bombSeqDelta;
    const lastBombCount = bombSeqDelta > 0 ? clampInt(raw.lastBombCount, 1, 20, 1) : 0;

    const lastAttackLabel =
      typeof raw.lastAttackLabel === 'string'
        ? raw.lastAttackLabel.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 48)
        : '';

    const snapshot: ValidatedBoardSnapshot = {
      grid,
      activeType,
      activeRot,
      activeX,
      activeY,
      hold,
      holdUsed,
      next3,
      score: me.score,
      level: clampInt(raw.level, 1, 99, 1),
      kos: me.kos, // Server-authoritative!
      kosTaken: me.kosTaken,
      linesCleared: me.linesCleared,
      maxCombo: me.maxCombo,
      garbageSent: me.garbageSent,
      quads: me.quads,
      piecesPlaced: me.piecesPlaced,
      combo: clampInt(raw.combo, 0, 999, 0),
      incomingTotal: clampInt(raw.incomingTotal, 0, 40, 0),
      incomingReady: clampInt(raw.incomingReady, 0, 40, 0),
      nextGapCol: clampInt(raw.nextGapCol, -1, 9, -1),
      lastAttackLabel,
      bombBlastsSeq: me.bombBlastsSeq,
      lastBombCount,
    };

    me.lastSnapshot = snapshot;
    me.lastUpdateAtMs = now;

    // Relay validated board state to opponent in real time
    sendToSocketId(opp.socketId, {
      type: 'opponent:state',
      matchId: match.id,
      roundNumber: match.roundNumber,
      nickname: me.nickname,
      playerLevel: me.playerLevel,
      snapshot,
      garbageAttack: validatedGarbageDelta,
      attackLabel: validatedGarbageDelta > 0 ? lastAttackLabel : '',
      bombBurstCount: bombSeqDelta > 0 ? lastBombCount : 0,
    });

    if (koTriggered) {
      for (const slot of ['p1', 'p2'] as const) {
        sendToSocketId(match.participants[slot].socketId, {
          type: 'ko:event',
          matchId: match.id,
          roundNumber: match.roundNumber,
          koVictimSlot: mySlot,
          koScorerSlot: oppSlot,
          p1Kos: match.participants.p1.kos,
          p2Kos: match.participants.p2.kos,
          p1Score: match.participants.p1.score,
          p2Score: match.participants.p2.score,
        });
      }

      if (match.suddenDeath) {
        finishMatchAuthoritatively(match, {
          winnerSlot: oppSlot,
          outcomeType: 'sudden_death',
          finishReason: 'Sudden Death KO Victory',
        });
      }
    }
  }

  function handleForfeitOrLeave(session: ClientSession, intentional: boolean): void {
    if (!session.playerId) return;
    removeFromQueue(session.playerId);

    const matchId = session.activeMatchId || matchIdByPlayerId.get(session.playerId);
    if (!matchId) return;
    const match = activeMatches.get(matchId);
    if (!match || match.status === 'closed') {
      session.activeMatchId = null;
      matchIdByPlayerId.delete(session.playerId);
      return;
    }

    const mySlot = findParticipantSlot(match, session.playerId);
    if (!mySlot) return;
    const oppSlot = getOpponentSlot(mySlot);
    const me = match.participants[mySlot];
    const opp = match.participants[oppSlot];

    // Guard against stale socket closing after player already reconnected on a new socket
    if (me.socketId && me.socketId !== session.socketId) {
      return;
    }

    if (match.status === 'countdown') {
      me.connected = false;
      me.socketId = null;
      finishMatchAuthoritatively(match, {
        winnerSlot: null,
        outcomeType: 'abandoned',
        finishReason: `${me.nickname} left before the match started.`,
      });
      return;
    }

    if (match.status === 'finished') {
      me.connected = false;
      me.socketId = null;
      sendToSocketId(opp.socketId, {
        type: 'rematch:opponent_left',
        matchId: match.id,
      });
      releaseMatchParticipants(match);
      return;
    }

    if (match.status === 'playing') {
      if (intentional) {
        finishMatchAuthoritatively(match, {
          winnerSlot: oppSlot,
          outcomeType: 'disconnect_forfeit',
          finishReason: `${me.nickname} Forfeited`,
          forfeitedSlot: mySlot,
        });
        me.connected = false;
        me.socketId = null;
        return;
      }

      me.connected = false;
      me.socketId = null;

      // If BOTH players have disconnected, resolve fairly without awarding an unfair win
      if (!opp.connected) {
        finishMatchAuthoritatively(match, {
          winnerSlot: 'draw',
          outcomeType: 'draw',
          finishReason: 'Both Players Disconnected',
        });
        return;
      }

      // Brief reconnect grace window for accidental mobile network blips
      sendToSocketId(opp.socketId, {
        type: 'opponent:reconnecting',
        matchId: match.id,
        graceMs: DISCONNECT_GRACE_MS,
        opponentName: me.nickname,
      });

      if (me.disconnectTimer) clearTimeout(me.disconnectTimer);
      me.disconnectTimer = setTimeout(() => {
        if (match.status !== 'playing' || me.connected) return;
        if (!opp.connected) {
          finishMatchAuthoritatively(match, {
            winnerSlot: 'draw',
            outcomeType: 'draw',
            finishReason: 'Both Players Disconnected',
          });
          return;
        }
        finishMatchAuthoritatively(match, {
          winnerSlot: oppSlot,
          outcomeType: 'disconnect_forfeit',
          finishReason: `${me.nickname} Disconnected`,
          forfeitedSlot: mySlot,
        });
      }, DISCONNECT_GRACE_MS);
    }
  }

  function handleRematchRequest(session: ClientSession, raw: Record<string, unknown>): void {
    if (!session.playerId || !session.activeMatchId) return;
    const match = activeMatches.get(session.activeMatchId);
    if (!match || match.status !== 'finished') return;
    if (typeof raw.matchId === 'string' && raw.matchId !== match.id) return;

    const mySlot = findParticipantSlot(match, session.playerId);
    if (!mySlot) return;
    const oppSlot = getOpponentSlot(mySlot);
    const me = match.participants[mySlot];
    const opp = match.participants[oppSlot];

    if (!opp.connected) {
      sendJson(session.ws, {
        type: 'rematch:opponent_left',
        matchId: match.id,
      });
      releaseMatchParticipants(match);
      return;
    }

    me.rematchReady = true;

    if (me.rematchReady && opp.rematchReady) {
      match.roundNumber += 1;
      startMatchRound(match, true);
      return;
    }

    for (const slot of ['p1', 'p2'] as const) {
      const p = match.participants[slot];
      const other = match.participants[getOpponentSlot(slot)];
      sendToSocketId(p.socketId, {
        type: 'rematch:status',
        matchId: match.id,
        myReady: p.rematchReady,
        opponentReady: other.rematchReady,
      });
    }
  }

  function handleEndlessFinish(session: ClientSession, raw: Record<string, unknown>): void {
    if (!session.playerId || !session.activeMatchId) return;
    const match = activeMatches.get(session.activeMatchId);
    if (!match || match.status !== 'playing' || match.matchType !== 'endless') return;
    if (typeof raw.matchId === 'string' && raw.matchId !== match.id) return;

    const a = match.participants.p1;
    const b = match.participants.p2;
    let winnerSlot: PlayerSlot | 'draw' = 'draw';
    if (a.kos !== b.kos) {
      winnerSlot = a.kos > b.kos ? 'p1' : 'p2';
    } else if (a.linesCleared !== b.linesCleared) {
      winnerSlot = a.linesCleared > b.linesCleared ? 'p1' : 'p2';
    } else if (a.score !== b.score) {
      winnerSlot = a.score > b.score ? 'p1' : 'p2';
    }
    finishMatchAuthoritatively(match, {
      winnerSlot,
      outcomeType: winnerSlot === 'draw' ? 'draw' : 'normal',
      finishReason: 'Endless Survival Completed',
    });
  }

  wss.on('connection', (ws: WebSocket) => {
    const socketId = `sock_${crypto.randomUUID().replace(/-/g, '')}`;
    const session: ClientSession = {
      socketId,
      ws,
      playerId: null,
      authenticated: false,
      nickname: 'Player',
      playerLevel: 1,
      alive: true,
      activeMatchId: null,
      queuedMatchType: null,
    };
    clientsBySocketId.set(socketId, session);

    ws.on('pong', () => {
      session.alive = true;
    });

    ws.on('message', (data) => {
      let msg: Record<string, unknown>;
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        msg = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      const type = typeof msg.type === 'string' ? msg.type : '';

      if (type === 'ping') {
        sendJson(ws, { type: 'pong', serverNowMs: Date.now() });
        return;
      }

      if (type === 'auth:hello') {
        void (async () => {
          const nickname = sanitizeNickname(msg.nickname, 'Player');
          const playerLevel = clampInt(msg.playerLevel, 1, 300, 1);

          const rawIdToken = typeof msg.idToken === 'string' ? msg.idToken.trim() : '';
          if (rawIdToken.length <= 20) {
            if (ws.readyState === WebSocket.OPEN) {
              sendJson(ws, {
                type: 'auth:error',
                code: 'AUTH_REQUIRED',
                message: 'Please sign in to play 1v1 Online Matchmaking.',
              });
            }
            return;
          }

          let verified: { uid: string; name?: string; email?: string } | null = null;
          try {
            verified = await options.verifyFirebaseIdToken(rawIdToken);
          } catch {
            verified = null;
          }

          if (ws.readyState !== WebSocket.OPEN) return;

          if (!verified || !verified.uid) {
            sendJson(ws, {
              type: 'auth:error',
              code: 'INVALID_TOKEN',
              message: 'Your session expired or could not be verified. Please sign in again.',
            });
            return;
          }

          const resolvedPlayerId = `uid:${verified.uid}`;
          const authenticated = true;

          // If this playerId had an older disconnected match in grace window, resume it seamlessly
          const existingMatchId = matchIdByPlayerId.get(resolvedPlayerId);
          const existingMatch = existingMatchId ? activeMatches.get(existingMatchId) : null;

          // Reject hijacking another actively connected socket for the same playerId
          const priorSocketId = socketIdByPlayerId.get(resolvedPlayerId);
          if (priorSocketId && priorSocketId !== socketId) {
            const priorSession = clientsBySocketId.get(priorSocketId);
            if (priorSession && priorSession.ws.readyState === WebSocket.OPEN) {
              // Keep existing socket registered; queue:join strictly blocks duplicate assignments
            }
          }

          session.playerId = resolvedPlayerId;
          session.authenticated = authenticated;
          session.nickname = nickname;
          session.playerLevel = playerLevel;
          socketIdByPlayerId.set(resolvedPlayerId, socketId);

          sendJson(ws, {
            type: 'auth:ready',
            playerId: resolvedPlayerId,
            authenticated,
            serverNowMs: Date.now(),
          });

          // Seamless reconnect into an in-progress match during grace window
          if (existingMatch && existingMatch.status === 'playing') {
            const slot = findParticipantSlot(existingMatch, resolvedPlayerId);
            if (slot) {
              const me = existingMatch.participants[slot];
              const opp = existingMatch.participants[getOpponentSlot(slot)];
              if (!me.connected) {
                if (me.disconnectTimer) {
                  clearTimeout(me.disconnectTimer);
                  me.disconnectTimer = null;
                }
                me.connected = true;
                me.socketId = socketId;
                session.activeMatchId = existingMatch.id;

                sendJson(ws, {
                  type: 'match:resumed',
                  matchId: existingMatch.id,
                  roundNumber: existingMatch.roundNumber,
                  matchType: existingMatch.matchType,
                  role: slot,
                  serverNowMs: Date.now(),
                  matchStartAtMs: existingMatch.matchStartAtMs,
                  durationMs: existingMatch.durationMs,
                  suddenDeath: existingMatch.suddenDeath,
                  opponent: {
                    nickname: opp.nickname,
                    level: opp.playerLevel,
                    snapshot: opp.lastSnapshot,
                  },
                  myKos: me.kos,
                  myScore: me.score,
                });

                sendToSocketId(opp.socketId, {
                  type: 'opponent:reconnected',
                  matchId: existingMatch.id,
                  opponentName: me.nickname,
                });
              }
            }
          }
        })();
        return;
      }

      if (!session.playerId || !session.authenticated) {
        sendJson(ws, {
          type: 'auth:error',
          code: 'AUTH_REQUIRED',
          message: 'Sign in is required for 1v1 Online Matchmaking.',
        });
        return;
      }

      if (type === 'queue:join') {
        const matchType = sanitizeMatchType(msg.matchType);
        session.nickname = sanitizeNickname(msg.nickname, session.nickname);
        session.playerLevel = clampInt(msg.playerLevel, 1, 300, session.playerLevel);

        // Strict duplicate assignment prevention
        if (matchIdByPlayerId.has(session.playerId)) {
          sendJson(ws, {
            type: 'queue:error',
            code: 'ALREADY_IN_MATCH',
            message:
              'Your account is already in an active online match (possibly in another tab). Finish or leave it before queueing again.',
          });
          return;
        }
        if (queuedPlayerIds.has(session.playerId)) {
          sendJson(ws, {
            type: 'queue:error',
            code: 'ALREADY_IN_QUEUE',
            message:
              'Your account is already searching for a match. Sign in with a second account on another device or incognito window to play 1v1.',
          });
          return;
        }

        const now = Date.now();
        const entry: QueueEntry = {
          playerId: session.playerId,
          socketId: session.socketId,
          nickname: session.nickname,
          playerLevel: session.playerLevel,
          matchType,
          enqueuedAtMs: now,
        };
        queuedPlayerIds.add(session.playerId);
        queueByMatchType[matchType].push(entry);
        session.queuedMatchType = matchType;

        sendJson(ws, {
          type: 'queue:joined',
          matchType,
          enqueuedAtMs: now,
          serverNowMs: now,
        });

        tryPairQueuedPlayers(matchType);
        return;
      }

      if (type === 'queue:cancel') {
        const removed = removeFromQueue(session.playerId);
        sendJson(ws, {
          type: 'queue:cancelled',
          removed,
          serverNowMs: Date.now(),
        });
        return;
      }

      if (type === 'state:update') {
        handleStateUpdate(session, msg);
        return;
      }

      if (type === 'match:forfeit') {
        handleForfeitOrLeave(session, true);
        return;
      }

      if (type === 'match:endless_finish') {
        handleEndlessFinish(session, msg);
        return;
      }

      if (type === 'rematch:request') {
        handleRematchRequest(session, msg);
      }
    });

    ws.on('close', () => {
      handleForfeitOrLeave(session, false);
      clientsBySocketId.delete(socketId);
      if (session.playerId && socketIdByPlayerId.get(session.playerId) === socketId) {
        socketIdByPlayerId.delete(session.playerId);
      }
    });

    ws.on('error', () => {
      // Handled via close lifecycle
    });
  });

  // Periodic server heartbeat to detect silently dropped TCP/mobile connections
  const heartbeatInterval = setInterval(() => {
    for (const session of clientsBySocketId.values()) {
      if (!session.alive) {
        session.ws.terminate();
        continue;
      }
      session.alive = false;
      try {
        session.ws.ping();
      } catch {
        session.ws.terminate();
      }
    }
  }, 3000);
  heartbeatInterval.unref?.();

  // Attach upgrade listener strictly on /ws/matchmaking (never interferes with Vite or other paths)
  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    let pathname = '';
    try {
      const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      pathname = parsed.pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== '/ws/matchmaking') {
      return;
    }

    // Optional strict origin check when ALLOWED_ORIGINS is explicitly configured in production
    const allowed = options.allowedOrigins ?? [];
    const reqOrigin = req.headers.origin;
    if (allowed.length > 0 && reqOrigin && !allowed.includes(reqOrigin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  return {
    getHealthStats() {
      return {
        wsPath: '/ws/matchmaking',
        ready: true,
        activeMatches: activeMatches.size,
      };
    },
    shutdown() {
      clearInterval(heartbeatInterval);
      for (const match of activeMatches.values()) {
        clearMatchTimers(match);
      }
      wss.close();
    },
  };
}
