import type { User } from 'firebase/auth';
import { MatchType, PieceType } from './types';

export type MatchmakingRole = 'p1' | 'p2';

export interface ServerBoardSnapshot {
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
}

export interface ServerMatchParticipantStats {
  nickname: string;
  level: number;
  kos: number;
  score: number;
  linesCleared: number;
  maxCombo: number;
  garbageSent: number;
  quads: number;
  piecesPlaced: number;
}

export interface PlayerMatchRecordSummary {
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

export interface MatchHistoryRecord {
  id: string;
  roundNumber: number;
  matchType: MatchType;
  opponentName: string;
  opponentLevel: number;
  myKos: number;
  opponentKos: number;
  myScore: number;
  opponentScore: number;
  myLines: number;
  opponentLines: number;
  result: 'win' | 'loss' | 'draw' | 'abandoned';
  outcomeType: 'normal' | 'sudden_death' | 'disconnect_forfeit' | 'draw' | 'abandoned';
  finishReason: string;
  durationMs: number;
  endedAt: string;
}

export type MatchmakingServerEvent =
  | {
      type: 'auth:ready';
      playerId: string;
      authenticated: boolean;
      serverNowMs: number;
    }
  | {
      type: 'auth:error';
      code: string;
      message: string;
    }
  | {
      type: 'queue:joined';
      matchType: MatchType;
      enqueuedAtMs: number;
      serverNowMs: number;
    }
  | {
      type: 'queue:cancelled';
      removed: boolean;
      serverNowMs: number;
    }
  | {
      type: 'queue:error';
      code: string;
      message: string;
    }
  | {
      type: 'match:found';
      matchId: string;
      roundNumber: number;
      matchType: MatchType;
      role: MatchmakingRole;
      isRematch: boolean;
      serverNowMs: number;
      matchStartAtMs: number;
      countdownMs: number;
      durationMs: number;
      opponent: {
        nickname: string;
        level: number;
      };
    }
  | {
      type: 'match:start';
      matchId: string;
      roundNumber: number;
      serverNowMs: number;
      matchStartAtMs: number;
      durationMs: number;
    }
  | {
      type: 'match:resumed';
      matchId: string;
      roundNumber: number;
      matchType: MatchType;
      role: MatchmakingRole;
      serverNowMs: number;
      matchStartAtMs: number;
      durationMs: number;
      suddenDeath: boolean;
      opponent: {
        nickname: string;
        level: number;
        snapshot: ServerBoardSnapshot;
      };
      myKos: number;
      myScore: number;
    }
  | {
      type: 'opponent:state';
      matchId: string;
      roundNumber: number;
      nickname: string;
      playerLevel: number;
      snapshot: ServerBoardSnapshot;
      garbageAttack: number;
      attackLabel: string;
      bombBurstCount: number;
    }
  | {
      type: 'ko:event';
      matchId: string;
      roundNumber: number;
      koVictimSlot: MatchmakingRole;
      koScorerSlot: MatchmakingRole;
      p1Kos: number;
      p2Kos: number;
      p1Score: number;
      p2Score: number;
    }
  | {
      type: 'match:sudden_death';
      matchId: string;
      roundNumber: number;
      serverNowMs: number;
    }
  | {
      type: 'opponent:reconnecting';
      matchId: string;
      graceMs: number;
      opponentName: string;
    }
  | {
      type: 'opponent:reconnected';
      matchId: string;
      opponentName: string;
    }
  | {
      type: 'match:abandoned';
      matchId: string;
      roundNumber: number;
      reason: string;
    }
  | {
      type: 'match:finished';
      matchId: string;
      roundNumber: number;
      outcome: 'win' | 'loss' | 'draw';
      outcomeType: 'normal' | 'sudden_death' | 'disconnect_forfeit' | 'draw' | 'abandoned';
      finishReason: string;
      durationMs: number;
      opponentConnected: boolean;
      myStats: ServerMatchParticipantStats;
      opponentStats: ServerMatchParticipantStats;
    }
  | {
      type: 'rematch:status';
      matchId: string;
      myReady: boolean;
      opponentReady: boolean;
    }
  | {
      type: 'rematch:opponent_left';
      matchId: string;
    }
  | {
      type: 'rematch:expired';
      matchId: string;
    }
  | {
      type: 'pong';
      serverNowMs: number;
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };

const GUEST_SESSION_STORAGE_KEY = 'block_clash_mm_guest_id_v1';

/**
 * Generates or retrieves a per-tab guest session ID (sessionStorage), allowing
 * seamless two-tab testing locally while keeping each tab's session distinct.
 */
export function getOrCreateMatchmakingGuestId(): string {
  try {
    const existing = window.sessionStorage.getItem(GUEST_SESSION_STORAGE_KEY);
    if (existing && /^gst_[a-zA-Z0-9_-]{12,48}$/.test(existing)) {
      return existing;
    }
  } catch {
    // Ignore storage restriction
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let rand = '';
  const bytes = new Uint8Array(20);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      rand += alphabet[bytes[i] % alphabet.length];
    }
  } else {
    for (let i = 0; i < 20; i++) {
      rand += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  const id = `gst_${rand}`;
  try {
    window.sessionStorage.setItem(GUEST_SESSION_STORAGE_KEY, id);
  } catch {
    // Ignore
  }
  return id;
}

export function resolveMatchmakingWsUrl(): string {
  const configured = (import.meta.env.VITE_MATCHMAKING_WS_URL ?? '').trim();
  if (configured) {
    if (configured.startsWith('ws://') || configured.startsWith('wss://')) {
      return configured;
    }
    if (configured.startsWith('https://')) {
      return configured.replace(/^https:\/\//, 'wss://');
    }
    if (configured.startsWith('http://')) {
      return configured.replace(/^http:\/\//, 'ws://');
    }
  }

  if (typeof window === 'undefined') {
    return 'ws://localhost:3000/ws/matchmaking';
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/matchmaking`;
}

export function resolveApiBaseUrl(): string {
  const configuredApi = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
  if (configuredApi) {
    return configuredApi.replace(/\/+$/, '');
  }
  const configuredWs = (import.meta.env.VITE_MATCHMAKING_WS_URL ?? '').trim();
  if (configuredWs) {
    try {
      const parsed = new URL(
        configuredWs.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
      );
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Fallback to same-origin
    }
  }
  return '';
}

export async function fetchMatchmakingRecord(
  user: User | null
): Promise<{ record: PlayerMatchRecordSummary; history: MatchHistoryRecord[] }> {
  const fallback: { record: PlayerMatchRecordSummary; history: MatchHistoryRecord[] } = {
    record: {
      playerId: '',
      nickname: 'Player',
      wins: 0,
      losses: 0,
      draws: 0,
      forfeits: 0,
      totalKos: 0,
      matchesPlayed: 0,
      updatedAt: null,
    },
    history: [],
  };

  if (!user) {
    return fallback;
  }

  try {
    const base = resolveApiBaseUrl();
    const idToken = await user.getIdToken();
    const res = await fetch(`${base}/api/matchmaking/record`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      record?: PlayerMatchRecordSummary;
      history?: MatchHistoryRecord[];
    };
    return {
      record: data.record ?? fallback.record,
      history: Array.isArray(data.history) ? data.history : [],
    };
  } catch {
    return fallback;
  }
}

export interface MatchmakingClientCallbacks {
  onEvent: (event: MatchmakingServerEvent) => void;
  onConnectionChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', detail?: string) => void;
}

export class MatchmakingSocketClient {
  private ws: WebSocket | null = null;
  private callbacks: MatchmakingClientCallbacks;
  private closedByClient = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private pendingHello: {
    idToken?: string;
    guestSessionId: string;
    nickname: string;
    playerLevel: number;
  } | null = null;
  private readyPromiseResolve: (() => void) | null = null;
  private readyPromiseReject: ((err: Error) => void) | null = null;
  private isAuthedReady = false;
  public serverClockOffsetMs = 0;

  constructor(callbacks: MatchmakingClientCallbacks) {
    this.callbacks = callbacks;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isAuthedReady;
  }

  public async connect(params: {
    user: User | null;
    nickname: string;
    playerLevel: number;
  }): Promise<void> {
    this.closedByClient = false;

    if (!params.user) {
      throw new Error('Please sign in to play 1v1 Online Matchmaking.');
    }

    let idToken: string;
    try {
      idToken = await params.user.getIdToken();
    } catch {
      throw new Error('Your session expired. Please sign in again.');
    }

    const guestSessionId = getOrCreateMatchmakingGuestId();
    this.pendingHello = {
      idToken,
      guestSessionId,
      nickname: params.nickname,
      playerLevel: params.playerLevel,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthedReady) {
      return;
    }

    this.openSocket();

    return new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (!this.isAuthedReady) {
          this.readyPromiseResolve = null;
          this.readyPromiseReject = null;
          reject(
            new Error(
              'Could not reach the real-time matchmaking server. Check your connection or server URL.'
            )
          );
        }
      }, 8000);

      this.readyPromiseResolve = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      this.readyPromiseReject = (err: Error) => {
        window.clearTimeout(timeoutId);
        reject(err);
      };
    });
  }

  private openSocket(): void {
    this.cleanupTimers();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    this.isAuthedReady = false;
    this.callbacks.onConnectionChange?.('connecting');

    const url = resolveMatchmakingWsUrl();
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.pendingHello) {
        this.sendRaw({
          type: 'auth:hello',
          idToken: this.pendingHello.idToken,
          guestSessionId: this.pendingHello.guestSessionId,
          nickname: this.pendingHello.nickname,
          playerLevel: this.pendingHello.playerLevel,
        });
      }
      this.pingTimer = window.setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.sendRaw({ type: 'ping' });
        }
      }, 4500);
    };

    ws.onmessage = (ev) => {
      let parsed: MatchmakingServerEvent;
      try {
        parsed = JSON.parse(String(ev.data)) as MatchmakingServerEvent;
      } catch {
        return;
      }

      if ('serverNowMs' in parsed && typeof parsed.serverNowMs === 'number') {
        this.serverClockOffsetMs = parsed.serverNowMs - Date.now();
      }

      if (parsed.type === 'auth:ready') {
        this.isAuthedReady = true;
        this.callbacks.onConnectionChange?.('connected');
        if (this.readyPromiseResolve) {
          const resolve = this.readyPromiseResolve;
          this.readyPromiseResolve = null;
          this.readyPromiseReject = null;
          resolve();
        }
      } else if (parsed.type === 'auth:error') {
        this.isAuthedReady = false;
        this.closedByClient = true;
        if (this.readyPromiseReject) {
          const reject = this.readyPromiseReject;
          this.readyPromiseResolve = null;
          this.readyPromiseReject = null;
          reject(new Error(parsed.message || 'Sign in is required for 1v1 Online Matchmaking.'));
        }
      }

      this.callbacks.onEvent(parsed);
    };

    ws.onerror = () => {
      this.callbacks.onConnectionChange?.('error', 'Real-time matchmaking connection error.');
    };

    ws.onclose = () => {
      this.cleanupTimers();
      const wasReady = this.isAuthedReady;
      this.isAuthedReady = false;

      if (this.readyPromiseReject) {
        const reject = this.readyPromiseReject;
        this.readyPromiseResolve = null;
        this.readyPromiseReject = null;
        reject(
          new Error(
            'Unable to connect to the live 1v1 matchmaking server. Please try again shortly.'
          )
        );
      }

      if (this.closedByClient) {
        this.callbacks.onConnectionChange?.('disconnected');
        return;
      }

      // Attempt quick automatic reconnect for active matches during grace window
      if (wasReady && this.reconnectAttempts < 3 && this.pendingHello) {
        this.reconnectAttempts += 1;
        this.callbacks.onConnectionChange?.('connecting', 'Reconnecting to match server...');
        this.reconnectTimer = window.setTimeout(() => {
          if (!this.closedByClient) {
            this.openSocket();
          }
        }, 1200 * this.reconnectAttempts);
      } else {
        this.callbacks.onConnectionChange?.(
          'disconnected',
          'Disconnected from the matchmaking server.'
        );
      }
    };
  }

  private cleanupTimers(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendRaw(payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  public joinQueue(params: {
    matchType: MatchType;
    nickname: string;
    playerLevel: number;
  }): boolean {
    if (this.pendingHello) {
      this.pendingHello.nickname = params.nickname;
      this.pendingHello.playerLevel = params.playerLevel;
    }
    return this.sendRaw({
      type: 'queue:join',
      matchType: params.matchType,
      nickname: params.nickname,
      playerLevel: params.playerLevel,
    });
  }

  public cancelQueue(): boolean {
    return this.sendRaw({ type: 'queue:cancel' });
  }

  public sendStateUpdate(params: {
    matchId: string;
    roundNumber: number;
    snapshot: ServerBoardSnapshot;
  }): boolean {
    return this.sendRaw({
      type: 'state:update',
      matchId: params.matchId,
      roundNumber: params.roundNumber,
      ...params.snapshot,
    });
  }

  public requestRematch(matchId: string): boolean {
    return this.sendRaw({ type: 'rematch:request', matchId });
  }

  public sendEndlessFinish(matchId: string): boolean {
    return this.sendRaw({ type: 'match:endless_finish', matchId });
  }

  public forfeitMatch(): boolean {
    return this.sendRaw({ type: 'match:forfeit' });
  }

  public disconnect(sendForfeitFirst = false): void {
    this.closedByClient = true;
    if (sendForfeitFirst) {
      this.forfeitMatch();
    }
    this.cleanupTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, 'client_disconnect');
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.isAuthedReady = false;
  }
}
