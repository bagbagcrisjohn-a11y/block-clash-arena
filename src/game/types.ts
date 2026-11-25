export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type CellValue = PieceType | 'G' | 'B' | null; // 'G' = Garbage block, 'B' = Garbage Bomb block

export type GameMode = 'vs_ai' | 'local_2p' | 'online_1v1';
export type MatchType = 'ko_2min' | 'endless';
export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'master';
export type ThemeId = 'neon' | 'retro' | 'modern';
export type GamePhase = 'TITLE' | 'ONLINE_LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'SUMMARY';

export type PlayerId = 'p1' | 'p2';
export type OnlineRole = 'host' | 'guest';
export type OnlineRoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished' | 'abandoned';

export interface OnlineRoomDoc {
  roomCode: string;
  matchType: MatchType;
  status: OnlineRoomStatus;
  roundNumber: number;
  hostId: string;
  hostName: string;
  hostLevel: number;
  guestId: string;
  guestName: string;
  guestLevel: number;
  matchStartAtMs: number;
  suddenDeath: boolean;
  winnerRole: '' | 'host' | 'guest' | 'draw';
  finishReason: string;
  hostRematch: boolean;
  guestRematch: boolean;
}

export interface OnlinePlayerSyncDoc {
  role: OnlineRole;
  playerId: string;
  nickname: string;
  playerLevel: number;
  roundNumber: number;
  grid: string;
  activeType: PieceType;
  activeRot: 0 | 1 | 2 | 3;
  activeX: number;
  activeY: number;
  hold: '' | PieceType;
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
  connected: boolean;
  heartbeatMs: number;
}

export interface ActivePiece {
  type: PieceType;
  rotation: 0 | 1 | 2 | 3;
  x: number;
  y: number;
}

export interface IncomingGarbageBatch {
  id: number;
  lines: number;
  gapCol: number; // Column where the Bomb Block will be placed
  timerMs: number; // Brief telegraph delay before ready to rise on next non-clearing lock
}

export interface HardDropTrail {
  x: number;
  fromY: number;
  toY: number;
  cells: Array<[number, number]>;
  colorKey: PieceType;
  alpha: number;
}

export interface LineClearFlash {
  rows: number[];
  alpha: number;
  kind: 'line' | 'bomb';
}

export interface BoardParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingCallout {
  id: number;
  playerId: PlayerId;
  text: string;
  subtext?: string;
  tone: 'neutral' | 'combo' | 'quad' | 'counter' | 'ko' | 'bomb';
  createdAt: number;
}

export interface AttackProjectile {
  id: number;
  from: PlayerId;
  to: PlayerId;
  lines: number;
  progress: number; // 0 to 1
  durationMs: number;
  arcHeight: number;
  color: string;
  startYNorm: number; // 0..1 vertical position on attacker board
}

export interface PlayerStats {
  score: number;
  level: number;
  kos: number;
  linesCleared: number;
  maxCombo: number;
  garbageSent: number;
  quads: number;
  piecesPlaced: number;
  bombChains: number;
}

export interface PlayerBoardState {
  id: PlayerId;
  label: string;
  grid: CellValue[][]; // TOTAL_ROWS x COLS (top BUFFER_ROWS are hidden spawn buffer)
  active: ActivePiece;
  hold: PieceType | null;
  holdUsed: boolean;
  queue: PieceType[]; // Always has >= 7 pieces; display first 3
  bag: PieceType[];
  combo: number;
  incomingGarbage: IncomingGarbageBatch[];
  gravityAccMs: number;
  lockTimerMs: number;
  lockResets: number;
  isGrounded: boolean;
  stats: PlayerStats;
  // Visual feedback state (updated smoothly in RAF)
  shakeX: number;
  shakeY: number;
  shakeTimerMs: number;
  koFlashAlpha: number;
  hardDropTrails: HardDropTrail[];
  clearFlashes: LineClearFlash[];
  particles: BoardParticle[];
}

export interface MatchConfig {
  mode: GameMode;
  difficulty: AIDifficulty;
  matchType: MatchType;
  theme: ThemeId;
}

export interface LockResult {
  clearedLines: number;
  attackSent: number;
  garbageCancelled: number;
  garbageRisen: number;
  combo: number;
  isPerfectClear: boolean;
  isKO: boolean;
  clearedRowIndices: number[];
  bombsDetonated: number;
  bombClearedRowIndices: number[];
  bombCoords: Array<[number, number]>;
}

export interface AIPlan {
  targetRotation: 0 | 1 | 2 | 3;
  targetX: number;
  useHold: boolean;
  executedHold: boolean;
}
