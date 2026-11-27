import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { BUFFER_ROWS, COLS, TOTAL_ROWS, VISIBLE_ROWS } from './constants';
import {
  CellValue,
  MatchType,
  OnlinePlayerSyncDoc,
  OnlineRole,
  OnlineRoomDoc,
  PieceType,
  PlayerBoardState,
} from './types';

// Unambiguous uppercase alphabet (omits I, L, O to prevent misreading codes)
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const VALID_PIECE_SET = new Set<string>(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
const VALID_CELL_SET = new Set<string>(['.', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'G', 'B']);
const SESSION_PLAYER_ID_KEY = 'block_clash_player_id_v1';
const SAVED_NICKNAME_KEY = 'block_clash_nickname_v1';

export function getOrCreateGuestPlayerId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_PLAYER_ID_KEY);
    if (existing && /^[a-zA-Z0-9_\-]{8,64}$/.test(existing)) {
      return existing;
    }
  } catch {
    // Ignore storage access restrictions
  }
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 16; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  const id = `plr_${suffix}`;
  try {
    window.sessionStorage.setItem(SESSION_PLAYER_ID_KEY, id);
  } catch {
    // Ignore
  }
  return id;
}

export function loadSavedNickname(): string {
  try {
    const saved = window.localStorage.getItem(SAVED_NICKNAME_KEY);
    if (saved) return sanitizeNickname(saved, '');
  } catch {
    // Ignore
  }
  return '';
}

export function saveNickname(name: string): void {
  try {
    const clean = sanitizeNickname(name, '');
    if (clean) window.localStorage.setItem(SAVED_NICKNAME_KEY, clean);
  } catch {
    // Ignore
  }
}

export function sanitizeNickname(raw: string, fallback = 'Player'): string {
  const cleaned = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 16);
  return cleaned.length > 0 ? cleaned : fallback.slice(0, 16);
}

export function sanitizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

function clampInt(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, Math.trunc(val)));
}

export function encodeVisibleGrid(grid: CellValue[][]): string {
  let out = '';
  for (let r = BUFFER_ROWS; r < TOTAL_ROWS; r++) {
    const row = grid[r];
    for (let c = 0; c < COLS; c++) {
      const cell = row ? row[c] : null;
      if (cell && VALID_CELL_SET.has(cell)) {
        out += cell;
      } else {
        out += '.';
      }
    }
  }
  if (out.length !== VISIBLE_ROWS * COLS) {
    return '.'.repeat(VISIBLE_ROWS * COLS);
  }
  return out;
}

export function decodeVisibleGridIntoBoard(encoded: string, board: PlayerBoardState): void {
  for (let r = 0; r < BUFFER_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board.grid[r][c] = null;
    }
  }
  if (!encoded || encoded.length !== VISIBLE_ROWS * COLS) return;
  let idx = 0;
  for (let r = BUFFER_ROWS; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = encoded[idx++];
      if (ch === '.' || !VALID_CELL_SET.has(ch)) {
        board.grid[r][c] = null;
      } else {
        board.grid[r][c] = ch as CellValue;
      }
    }
  }
}

export function decodeNext3Pieces(encoded: string): PieceType[] {
  const out: PieceType[] = [];
  for (let i = 0; i < Math.min(3, encoded.length); i++) {
    const ch = encoded[i];
    if (VALID_PIECE_SET.has(ch)) {
      out.push(ch as PieceType);
    }
  }
  return out;
}

export interface LocalSyncMeta {
  role: OnlineRole;
  playerId: string;
  nickname: string;
  playerLevel: number;
  roundNumber: number;
  kosTaken: number;
  lastAttackLabel: string;
  bombBlastsSeq: number;
  lastBombCount: number;
  connected: boolean;
}

export function buildPlayerSyncDoc(
  board: PlayerBoardState,
  meta: LocalSyncMeta
): OnlinePlayerSyncDoc {
  let incomingTotal = 0;
  let incomingReady = 0;
  for (const batch of board.incomingGarbage) {
    incomingTotal += batch.lines;
    if (batch.timerMs <= 0) incomingReady += batch.lines;
  }
  const nextGapCol = board.incomingGarbage.length > 0 ? board.incomingGarbage[0].gapCol : -1;
  const next3Str = board.queue
    .slice(0, 3)
    .filter((p) => VALID_PIECE_SET.has(p))
    .join('')
    .slice(0, 3);

  return {
    role: meta.role,
    playerId: meta.playerId,
    nickname: sanitizeNickname(meta.nickname, meta.role === 'host' ? 'Host' : 'Guest'),
    playerLevel: clampInt(meta.playerLevel, 1, 300),
    roundNumber: clampInt(meta.roundNumber, 1, 999),
    grid: encodeVisibleGrid(board.grid),
    activeType: VALID_PIECE_SET.has(board.active.type) ? board.active.type : 'T',
    activeRot: clampInt(board.active.rotation, 0, 3) as 0 | 1 | 2 | 3,
    activeX: clampInt(board.active.x, -4, 12),
    activeY: clampInt(board.active.y, -4, 24),
    hold: board.hold && VALID_PIECE_SET.has(board.hold) ? board.hold : '',
    holdUsed: Boolean(board.holdUsed),
    next3: next3Str,
    score: clampInt(board.stats.score, 0, 99999999),
    level: clampInt(board.stats.level, 1, 99),
    kos: clampInt(board.stats.kos, 0, 999),
    kosTaken: clampInt(meta.kosTaken, 0, 999),
    linesCleared: clampInt(board.stats.linesCleared, 0, 99999),
    maxCombo: clampInt(board.stats.maxCombo, 0, 999),
    garbageSent: clampInt(board.stats.garbageSent, 0, 99999),
    quads: clampInt(board.stats.quads, 0, 9999),
    piecesPlaced: clampInt(board.stats.piecesPlaced, 0, 99999),
    combo: clampInt(board.combo, 0, 999),
    incomingTotal: clampInt(incomingTotal, 0, 40),
    incomingReady: clampInt(incomingReady, 0, 40),
    nextGapCol: clampInt(nextGapCol, -1, 9),
    lastAttackLabel: meta.lastAttackLabel.trim().slice(0, 48),
    bombBlastsSeq: clampInt(meta.bombBlastsSeq, 0, 99999),
    lastBombCount: clampInt(meta.lastBombCount, 0, 20),
    connected: Boolean(meta.connected),
    heartbeatMs: Math.floor(Date.now()),
  };
}

export async function createOnlineRoom(
  rawNickname: string,
  hostLevel: number,
  matchType: MatchType,
  initialBoard: PlayerBoardState
): Promise<{ roomCode: string; playerId: string; nickname: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to create an Online 1v1 Room.');
  }
  const playerId = currentUser.uid;
  const nickname = sanitizeNickname(rawNickname, 'Player 1');
  const safeHostLevel = clampInt(hostLevel, 1, 300);
  saveNickname(nickname);

  for (let attempt = 0; attempt < 6; attempt++) {
    const roomCode = generateRoomCode();
    const roomPath = `rooms/${roomCode}`;
    const roomRef = doc(db, 'rooms', roomCode);

    let existingSnap;
    try {
      existingSnap = await getDoc(roomRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, roomPath);
    }

    if (existingSnap.exists()) {
      continue;
    }

    const hostPlayerRef = doc(db, 'rooms', roomCode, 'players', 'host');
    const hostSync = buildPlayerSyncDoc(initialBoard, {
      role: 'host',
      playerId,
      nickname,
      playerLevel: safeHostLevel,
      roundNumber: 1,
      kosTaken: 0,
      lastAttackLabel: '',
      bombBlastsSeq: 0,
      lastBombCount: 0,
      connected: true,
    });

    const batch = writeBatch(db);
    batch.set(roomRef, {
      roomCode,
      matchType,
      status: 'waiting',
      roundNumber: 1,
      hostId: playerId,
      hostName: nickname,
      hostLevel: safeHostLevel,
      guestId: '',
      guestName: '',
      guestLevel: 0,
      matchStartAtMs: 0,
      suddenDeath: false,
      winnerRole: '',
      finishReason: '',
      hostRematch: false,
      guestRematch: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(hostPlayerRef, {
      ...hostSync,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      return { roomCode, playerId, nickname };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, roomPath);
    }
  }

  throw new Error('Could not allocate an open room code. Please try again.');
}

export async function joinOnlineRoom(
  rawCode: string,
  rawNickname: string,
  guestLevel: number,
  initialBoard: PlayerBoardState
): Promise<{
  roomCode: string;
  playerId: string;
  nickname: string;
  hostName: string;
  hostLevel: number;
  matchType: MatchType;
}> {
  const roomCode = sanitizeRoomCode(rawCode);
  if (roomCode.length !== 4) {
    throw new Error('Please enter a valid 4-letter Room Code.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to join an Online 1v1 Room.');
  }
  const playerId = currentUser.uid;
  const nickname = sanitizeNickname(rawNickname, 'Player 2');
  const safeGuestLevel = clampInt(guestLevel, 1, 300);
  saveNickname(nickname);

  const roomPath = `rooms/${roomCode}`;
  const roomRef = doc(db, 'rooms', roomCode);

  let snap;
  try {
    snap = await getDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, roomPath);
  }

  if (!snap.exists()) {
    throw new Error(`Room "${roomCode}" was not found. Double-check the 4-letter code.`);
  }

  const data = snap.data() as OnlineRoomDoc;
  if (data.status === 'abandoned') {
    throw new Error(`Room "${roomCode}" has already been closed.`);
  }
  if (data.status !== 'waiting' || data.guestId !== '') {
    throw new Error(`Room "${roomCode}" already has 2 players in battle.`);
  }
  if (data.hostId === playerId) {
    throw new Error('You are already hosting this room in this browser tab. Open a second tab or phone to join.');
  }

  const guestPlayerRef = doc(db, 'rooms', roomCode, 'players', 'guest');
  const guestSync = buildPlayerSyncDoc(initialBoard, {
    role: 'guest',
    playerId,
    nickname,
    playerLevel: safeGuestLevel,
    roundNumber: data.roundNumber || 1,
    kosTaken: 0,
    lastAttackLabel: '',
    bombBlastsSeq: 0,
    lastBombCount: 0,
    connected: true,
  });

  const matchStartAtMs = Math.floor(Date.now()) + 2600;
  const batch = writeBatch(db);
  batch.update(roomRef, {
    guestId: playerId,
    guestName: nickname,
    guestLevel: safeGuestLevel,
    status: 'countdown',
    matchStartAtMs,
    updatedAt: serverTimestamp(),
  });
  batch.set(guestPlayerRef, {
    ...guestSync,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, roomPath);
  }

  return {
    roomCode,
    playerId,
    nickname,
    hostName: data.hostName,
    hostLevel: typeof data.hostLevel === 'number' ? clampInt(data.hostLevel, 1, 300) : 1,
    matchType: data.matchType,
  };
}

export function subscribeToRoom(
  roomCode: string,
  onRoom: (room: OnlineRoomDoc) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `rooms/${roomCode}`;
  return onSnapshot(
    doc(db, 'rooms', roomCode),
    (snapshot) => {
      if (!snapshot.exists()) return;
      onRoom(snapshot.data() as OnlineRoomDoc);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeToOpponent(
  roomCode: string,
  opponentRole: OnlineRole,
  onOpponent: (docData: OnlinePlayerSyncDoc) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `rooms/${roomCode}/players/${opponentRole}`;
  return onSnapshot(
    doc(db, 'rooms', roomCode, 'players', opponentRole),
    (snapshot) => {
      if (!snapshot.exists()) return;
      onOpponent(snapshot.data() as OnlinePlayerSyncDoc);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function pushLocalPlayerState(
  roomCode: string,
  role: OnlineRole,
  payload: OnlinePlayerSyncDoc
): Promise<void> {
  const path = `rooms/${roomCode}/players/${role}`;
  try {
    await updateDoc(doc(db, 'rooms', roomCode, 'players', role), {
      playerLevel: payload.playerLevel,
      roundNumber: payload.roundNumber,
      grid: payload.grid,
      activeType: payload.activeType,
      activeRot: payload.activeRot,
      activeX: payload.activeX,
      activeY: payload.activeY,
      hold: payload.hold,
      holdUsed: payload.holdUsed,
      next3: payload.next3,
      score: payload.score,
      level: payload.level,
      kos: payload.kos,
      kosTaken: payload.kosTaken,
      linesCleared: payload.linesCleared,
      maxCombo: payload.maxCombo,
      garbageSent: payload.garbageSent,
      quads: payload.quads,
      piecesPlaced: payload.piecesPlaced,
      combo: payload.combo,
      incomingTotal: payload.incomingTotal,
      incomingReady: payload.incomingReady,
      nextGapCol: payload.nextGapCol,
      lastAttackLabel: payload.lastAttackLabel,
      bombBlastsSeq: payload.bombBlastsSeq,
      lastBombCount: payload.lastBombCount,
      connected: payload.connected,
      heartbeatMs: payload.heartbeatMs,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function pushPlayerHeartbeat(roomCode: string, role: OnlineRole): Promise<void> {
  const path = `rooms/${roomCode}/players/${role}`;
  try {
    await updateDoc(doc(db, 'rooms', roomCode, 'players', role), {
      connected: true,
      heartbeatMs: Math.floor(Date.now()),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Heartbeat failures are non-fatal if room just closed
  }
}

export async function markPlayerDisconnected(roomCode: string, role: OnlineRole): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomCode, 'players', role), {
      connected: false,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Best-effort disconnect marker
  }
}

export async function transitionRoomToPlaying(roomCode: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      status: 'playing',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Safe to ignore if opponent already transitioned countdown -> playing
  }
}

export async function triggerRoomSuddenDeath(roomCode: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      suddenDeath: true,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Safe to ignore if already in sudden death
  }
}

export async function finishOnlineRoom(
  roomCode: string,
  winnerRole: 'host' | 'guest' | 'draw',
  finishReason: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      status: 'finished',
      winnerRole,
      finishReason: finishReason.slice(0, 80) || 'Match Complete',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Safe to ignore if opponent already finalized match
  }
}

export async function requestOrStartRematch(
  roomCode: string,
  myRole: OnlineRole,
  currentRoom: OnlineRoomDoc
): Promise<void> {
  const path = `rooms/${roomCode}`;
  const opponentReady = myRole === 'host' ? currentRoom.guestRematch : currentRoom.hostRematch;

  try {
    if (opponentReady) {
      await updateDoc(doc(db, 'rooms', roomCode), {
        status: 'countdown',
        roundNumber: clampInt(currentRoom.roundNumber + 1, 1, 999),
        matchStartAtMs: Math.floor(Date.now()) + 2600,
        suddenDeath: false,
        winnerRole: '',
        finishReason: '',
        hostRematch: false,
        guestRematch: false,
        updatedAt: serverTimestamp(),
      });
    } else if (myRole === 'host') {
      await updateDoc(doc(db, 'rooms', roomCode), {
        hostRematch: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'rooms', roomCode), {
        guestRematch: true,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function abandonOnlineRoom(roomCode: string, reason: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      status: 'abandoned',
      finishReason: reason.slice(0, 80),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Best-effort room cleanup
  }
}
