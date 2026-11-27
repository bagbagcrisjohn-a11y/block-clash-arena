import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import { Flag, Home, Pause, Play, RotateCcw, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { ArenaVFXCanvas } from './components/ArenaVFXCanvas';
import { AuthModal } from './components/AuthModal';
import { MatchSummaryModal, OnlineRematchState } from './components/MatchSummaryModal';
import {
  MatchedOpponentBanner,
  MatchmakingScreen,
  MatchmakingUiStatus,
} from './components/MatchmakingScreen';
import { OnlineLobbyScreen } from './components/OnlineLobbyScreen';
import { PiecePreviewCanvas } from './components/PiecePreviewCanvas';
import { PlayerAccountModal } from './components/PlayerAccountModal';
import { PlayerArenaPanel, PlayerHudSnapshot } from './components/PlayerArenaPanel';
import { SkinShopModal } from './components/SkinShopModal';
import { StartScreen } from './components/StartScreen';
import { TouchAction, TouchControls } from './components/TouchControls';
import { auth } from './firebase';
import { computeAIPlan } from './game/ai';
import {
  AvatarId,
  CloudPlayerProfile,
  ensureAuthPersistence,
  fetchServerPlayerBundle,
  isPhoneAuthEnabled,
  signOutPlayer,
  syncProfileWithFirestore,
  syncProgressToServer,
  updateServerPlayerIdentity,
} from './game/auth';
import {
  AI_PROFILES,
  ARR_MS,
  BUFFER_ROWS,
  COLS,
  DAS_MS,
  getGravityMs,
  LOCK_DELAY_MS,
  MATCH_DURATION_MS,
  SOFT_DROP_INTERVAL_MS,
  THEMES,
} from './game/constants';
import {
  createPlayerBoard,
  enqueueGarbage,
  getTotalIncomingGarbage,
  isPieceGrounded,
  lockActivePiece,
  performHardDrop,
  tickGarbageTelegraph,
  tryHoldPiece,
  tryMovePiece,
  tryRotatePiece,
} from './game/engine';
import {
  fetchMatchmakingRecord,
  MatchHistoryRecord,
  MatchmakingRole,
  MatchmakingServerEvent,
  MatchmakingSocketClient,
  PlayerMatchRecordSummary,
  ServerBoardSnapshot,
} from './game/matchmakingClient';
import {
  abandonOnlineRoom,
  buildPlayerSyncDoc,
  createOnlineRoom,
  decodeNext3Pieces,
  decodeVisibleGridIntoBoard,
  encodeVisibleGrid,
  finishOnlineRoom,
  joinOnlineRoom,
  loadSavedNickname,
  markPlayerDisconnected,
  pushLocalPlayerState,
  pushPlayerHeartbeat,
  requestOrStartRematch,
  sanitizeNickname,
  subscribeToOpponent,
  subscribeToRoom,
  transitionRoomToPlaying,
  triggerRoomSuddenDeath,
} from './game/onlineSync';
import {
  awardMatchXP,
  getAIRivalLevel,
  hasGuestProgressToMigrate,
  loadPlayerProfile,
  MatchXPResult,
  PlayerProfile,
  savePlayerProfile,
} from './game/progression';
import {
  CheckoutAttemptResult,
  EquipSkinResult,
  fetchPaymentGatewayConfig,
  fetchVerifiedEntitlements,
  PaymentMethodOption,
  requestEquipSkin,
  startMayaCheckout,
  verifyOrderStatus,
} from './game/payments';
import {
  buildVerifiedSkinInventory,
  getSkinById,
  loadSkinPreferences,
  PlayerSkinInventory,
  PlayerSkinPreferences,
  PREMIUM_SKIN_CATALOG,
  sanitizeServerEquippedSkinId,
  sanitizeServerOwnedSkinIds,
  saveSkinPreferences,
  TileSkinId,
} from './game/skins';
import {
  AIPlan,
  AttackProjectile,
  FloatingCallout,
  GamePhase,
  LockResult,
  MatchConfig,
  OnlinePlayerSyncDoc,
  OnlineRole,
  OnlineRoomDoc,
  PlayerBoardState,
  PlayerId,
  PlayerStats,
  ThemeId,
} from './game/types';
import { useOnlineStatus } from './hooks/useOnlineStatus';

interface KeyHoldState {
  left: boolean;
  right: boolean;
  down: boolean;
  dir: -1 | 0 | 1;
  dasMs: number;
  arrMs: number;
  softDropMs: number;
}

interface BattleFeedItem {
  id: number;
  actor: PlayerId;
  text: string;
}

interface SummaryState {
  winnerText: string;
  reasonText: string;
  durationText: string;
  p1Stats: PlayerStats;
  p2Stats: PlayerStats;
  xpResult: MatchXPResult;
}

interface OnlineSession {
  roomCode: string;
  role: OnlineRole;
  playerId: string;
  nickname: string;
  rivalName: string;
  roundNumber: number;
  matchStartAtMs: number;
}

interface OnlineSyncMeta {
  kosTaken: number;
  lastAttackLabel: string;
  bombBlastsSeq: number;
  lastBombCount: number;
  lastSeenRemoteGarbage: number;
  lastSeenRemoteKosTaken: number;
  lastSeenRemoteBombSeq: number;
  lastRemoteHeartbeatAt: number;
  remoteConnected: boolean;
  startedRoundNumber: number;
}

function createOnlineSyncMeta(): OnlineSyncMeta {
  return {
    kosTaken: 0,
    lastAttackLabel: '',
    bombBlastsSeq: 0,
    lastBombCount: 0,
    lastSeenRemoteGarbage: 0,
    lastSeenRemoteKosTaken: 0,
    lastSeenRemoteBombSeq: 0,
    lastRemoteHeartbeatAt: Date.now(),
    remoteConnected: true,
    startedRoundNumber: 0,
  };
}

interface QuickMatchSession {
  matchId: string;
  role: MatchmakingRole;
  nickname: string;
  rivalName: string;
  rivalLevel: number;
  roundNumber: number;
  matchStartAtMs: number;
  durationMs: number;
}

interface QuickMatchSyncMeta {
  kosTaken: number;
  lastAttackLabel: string;
  bombBlastsSeq: number;
  lastBombCount: number;
  remoteConnected: boolean;
}

function createQuickMatchSyncMeta(): QuickMatchSyncMeta {
  return {
    kosTaken: 0,
    lastAttackLabel: '',
    bombBlastsSeq: 0,
    lastBombCount: 0,
    remoteConnected: true,
  };
}

const EMPTY_MM_RECORD: PlayerMatchRecordSummary = {
  playerId: '',
  nickname: 'Player',
  wins: 0,
  losses: 0,
  draws: 0,
  forfeits: 0,
  totalKos: 0,
  matchesPlayed: 0,
  updatedAt: null,
};

function buildServerSnapshot(
  board: PlayerBoardState,
  meta: QuickMatchSyncMeta
): ServerBoardSnapshot {
  let incomingTotal = 0;
  let incomingReady = 0;
  for (const b of board.incomingGarbage) {
    incomingTotal += b.lines;
    if (b.timerMs <= 0) incomingReady += b.lines;
  }
  return {
    grid: encodeVisibleGrid(board.grid),
    activeType: board.active.type,
    activeRot: board.active.rotation,
    activeX: board.active.x,
    activeY: board.active.y,
    hold: board.hold ?? '',
    holdUsed: board.holdUsed,
    next3: board.queue.slice(0, 3).join(''),
    score: board.stats.score,
    level: board.stats.level,
    kos: board.stats.kos,
    kosTaken: meta.kosTaken,
    linesCleared: board.stats.linesCleared,
    maxCombo: board.stats.maxCombo,
    garbageSent: board.stats.garbageSent,
    quads: board.stats.quads,
    piecesPlaced: board.stats.piecesPlaced,
    combo: board.combo,
    incomingTotal,
    incomingReady,
    nextGapCol: board.incomingGarbage.length > 0 ? board.incomingGarbage[0].gapCol : -1,
    lastAttackLabel: meta.lastAttackLabel.slice(0, 48),
    bombBlastsSeq: meta.bombBlastsSeq,
    lastBombCount: meta.lastBombCount,
  };
}

function createKeyHoldState(): KeyHoldState {
  return {
    left: false,
    right: false,
    down: false,
    dir: 0,
    dasMs: 0,
    arrMs: 0,
    softDropMs: 0,
  };
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function makeHudSnapshot(
  board: PlayerBoardState,
  subtitle?: string,
  playerLevel?: number
): PlayerHudSnapshot {
  let incomingTotal = 0;
  let incomingReady = 0;
  for (const b of board.incomingGarbage) {
    incomingTotal += b.lines;
    if (b.timerMs <= 0) incomingReady += b.lines;
  }
  const nextGapCol = board.incomingGarbage.length > 0 ? board.incomingGarbage[0].gapCol : null;
  return {
    label: board.label,
    subtitle,
    playerLevel,
    score: board.stats.score,
    level: board.stats.level,
    kos: board.stats.kos,
    lines: board.stats.linesCleared,
    combo: board.combo,
    hold: board.hold,
    holdUsed: board.holdUsed,
    next3: board.queue.slice(0, 3),
    incomingTotal,
    incomingReady,
    nextGapCol,
    shakeX: 0,
    shakeY: 0,
  };
}

type ArenaLayoutMode = 'portrait-mobile' | 'landscape-mobile' | 'desktop';

interface ArenaLayoutMetrics {
  layoutMode: ArenaLayoutMode;
  p1CellSize: number;
  p2CellSize: number;
}

function computeArenaLayout(): ArenaLayoutMetrics {
  if (typeof window === 'undefined') {
    return { layoutMode: 'desktop', p1CellSize: 24, p2CellSize: 24 };
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  const isCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  // Portrait Phone / Narrow Portrait Tablet Mode:
  // Larger P1 board on left (~60%), compact RIVAL mini-board on right (~35%), bottom 30% thumb deck
  if (w < 768 && h >= w) {
    const availH = Math.max(180, h - 292);
    const availW = Math.max(200, w - 84);
    const maxP1ByH = Math.floor(availH / 20);
    const p1CellSize = Math.max(10, Math.min(22, maxP1ByH, Math.floor((availW * 0.62) / 10)));
    const p2CellSize = Math.max(
      8,
      Math.min(p1CellSize - 2, Math.floor((availW * 0.36) / 10), Math.floor(p1CellSize * 0.64))
    );
    return { layoutMode: 'portrait-mobile', p1CellSize, p2CellSize };
  }

  // Landscape Phone / Compact Touch Tablet Mode:
  // Even side-by-side boards in center, left & right thumb zones anchored at bottom corners
  if (w > h && (h <= 560 || (w < 1024 && isCoarsePointer))) {
    const availH = Math.max(160, h - 94);
    const availW = Math.max(180, w - 426);
    const byH = Math.floor(availH / 20);
    const byW = Math.floor(availW / 20);
    const cell = Math.max(9, Math.min(20, byH, byW));
    return { layoutMode: 'landscape-mobile', p1CellSize: cell, p2CellSize: cell };
  }

  // Desktop / Large Tablet Split-Screen Arena
  const byHeight = Math.floor((h - 210) / 20);
  const byWidth = Math.floor((w - 350) / 26);
  const candidate = Math.min(byHeight, byWidth);
  const cell = Math.max(13, Math.min(27, candidate));
  return { layoutMode: 'desktop', p1CellSize: cell, p2CellSize: cell };
}

export default function App() {
  const [config, setConfig] = useState<MatchConfig>({
    mode: 'vs_ai',
    difficulty: 'medium',
    matchType: 'ko_2min',
    theme: 'neon',
  });

  const [phase, setPhase] = useState<GamePhase>('TITLE');
  const [muted, setMuted] = useState(false);
  const [arenaLayout, setArenaLayout] = useState<ArenaLayoutMetrics>(() => computeArenaLayout());
  const { layoutMode, p1CellSize, p2CellSize } = arenaLayout;
  const [countdownStep, setCountdownStep] = useState<string>('3');
  const [suddenDeath, setSuddenDeath] = useState(false);
  const [clockDisplay, setClockDisplay] = useState('2:00');
  const [battleFeed, setBattleFeed] = useState<BattleFeedItem[]>([]);
  const [latestAttackAlert, setLatestAttackAlert] = useState<BattleFeedItem | null>(null);
  const [callouts, setCallouts] = useState<FloatingCallout[]>([]);
  const [summary, setSummary] = useState<SummaryState | null>(null);

  // Persistent Level 1-300 Player Profile
  const [profile, setProfile] = useState<PlayerProfile>(() => loadPlayerProfile());
  const profileRef = useRef<PlayerProfile>(profile);
  profileRef.current = profile;

  // Firebase Auth user, Cloud Player Profile & server-verified skin entitlements
  const [authUser, setAuthUser] = useState<User | null>(() => auth.currentUser);
  const [cloudProfile, setCloudProfile] = useState<CloudPlayerProfile | null>(null);
  const [authModalState, setAuthModalState] = useState<{
    open: boolean;
    reason: string | null;
    pendingAction: null | 'quick_match' | 'online_room' | 'account' | 'shop';
  }>({ open: false, reason: null, pendingAction: null });
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const pendingMarketplaceAuthResolveRef = useRef<((signedIn: boolean) => void) | null>(null);
  const cleanupSessionsRef = useRef<() => void>(() => {});
  const [skinPrefs, setSkinPrefs] = useState<PlayerSkinPreferences>(() => loadSkinPreferences());
  // Both ownedSkinIds and equippedSkinId are strictly governed by verified server-side records
  const [verifiedOwnedSkinIds, setVerifiedOwnedSkinIds] = useState<TileSkinId[]>(['classic']);
  const [verifiedEquippedSkinId, setVerifiedEquippedSkinId] = useState<TileSkinId>('classic');
  const [gatewayConfigured, setGatewayConfigured] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [paymentBanner, setPaymentBanner] = useState<{
    tone: 'info' | 'warning' | 'success';
    text: string;
  } | null>(null);

  const skinInventory = useMemo<PlayerSkinInventory>(
    () => buildVerifiedSkinInventory(skinPrefs, verifiedOwnedSkinIds, verifiedEquippedSkinId),
    [skinPrefs, verifiedOwnedSkinIds, verifiedEquippedSkinId]
  );
  const skinInventoryRef = useRef<PlayerSkinInventory>(skinInventory);
  skinInventoryRef.current = skinInventory;

  // Online 1v1 Room Battle & Matchmaking state
  const [nickname, setNickname] = useState<string>(
    () => profile.nickname || loadSavedNickname() || 'Player'
  );
  const nicknameRef = useRef<string>(nickname);
  nicknameRef.current = nickname;
  const authUserRef = useRef<User | null>(authUser);
  authUserRef.current = authUser;

  const [waitingRoomCode, setWaitingRoomCode] = useState<string | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomDoc | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [opponentNotice, setOpponentNotice] = useState<string | null>(null);
  const [offlineOnlineNotice, setOfflineOnlineNotice] = useState<string | null>(null);
  const isBrowserOnline = useOnlineStatus();

  // Automatic 1v1 Online Matchmaking (WebSocket Quick Match) state
  const [mmStatus, setMmStatus] = useState<MatchmakingUiStatus>('idle');
  const [mmEnqueuedAtMs, setMmEnqueuedAtMs] = useState<number | null>(null);
  const [mmMatchedOpponent, setMmMatchedOpponent] = useState<MatchedOpponentBanner | null>(null);
  const [mmError, setMmError] = useState<string | null>(null);
  const [mmInfoNotice, setMmInfoNotice] = useState<string | null>(null);
  const [mmRematchState, setMmRematchState] = useState<OnlineRematchState>('idle');
  const [mmRecord, setMmRecord] = useState<PlayerMatchRecordSummary>(EMPTY_MM_RECORD);
  const mmRecordRef = useRef<PlayerMatchRecordSummary>(mmRecord);
  mmRecordRef.current = mmRecord;
  const [mmHistory, setMmHistory] = useState<MatchHistoryRecord[]>([]);

  const applyCloudProfileToLocal = useCallback((resolved: CloudPlayerProfile) => {
    setCloudProfile(resolved);
    setNickname(resolved.username);
    nicknameRef.current = resolved.username;
    const mergedLocal: PlayerProfile = {
      level: resolved.level,
      currentXP: resolved.currentXP,
      totalXP: resolved.totalXP,
      totalKOs: resolved.totalKOs,
      totalWins: resolved.totalWins,
      totalMatches: resolved.totalMatches,
      nickname: resolved.username,
      avatarId: resolved.avatarId,
      publicPlayerId: resolved.publicPlayerId,
    };
    profileRef.current = mergedLocal;
    setProfile(mergedLocal);
    savePlayerProfile(mergedLocal);
  }, []);

  const hydrateAuthenticatedAccount = useCallback(
    async (user: User) => {
      const bundle = await fetchServerPlayerBundle(user);
      if (bundle) {
        let activeProfile = bundle.profile;

        // Safely migrate local guest XP/stats once on first sign-in without overwriting higher cloud progress
        if (hasGuestProgressToMigrate(profileRef.current) && !activeProfile.migratedLocalAt) {
          const migrated = await syncProgressToServer(user, profileRef.current, true);
          if (migrated) {
            activeProfile = migrated;
          }
        }

        // Mirror & reconcile cross-device profile in Cloud Firestore (/players/{uid})
        const syncedProfile = await syncProfileWithFirestore(
          user,
          activeProfile,
          bundle.onlineRecord
        );
        applyCloudProfileToLocal(syncedProfile);

        const owned = sanitizeServerOwnedSkinIds(bundle.ownedSkinIds);
        const equipped = sanitizeServerEquippedSkinId(bundle.equippedSkinId, owned);
        setVerifiedOwnedSkinIds(owned);
        setVerifiedEquippedSkinId(equipped);
        setMmRecord(bundle.onlineRecord);
        setMmHistory(bundle.onlineHistory);
        return;
      }

      // Fallback if Express bundle endpoint is temporarily unreachable
      const res = await fetchVerifiedEntitlements(user);
      const owned = sanitizeServerOwnedSkinIds(res.ownedSkinIds);
      const equipped = sanitizeServerEquippedSkinId(res.equippedSkinId, owned);
      setVerifiedOwnedSkinIds(owned);
      setVerifiedEquippedSkinId(equipped);
    },
    [applyCloudProfileToLocal]
  );

  // Check server payment gateway availability and enforce persistent browser auth session on boot
  useEffect(() => {
    void ensureAuthPersistence();
    void fetchPaymentGatewayConfig().then((cfg) => {
      setGatewayConfigured(cfg.gatewayConfigured);
    });
  }, []);

  // Subscribe to Firebase Auth and sync player profile, entitlements & online record
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      authUserRef.current = user;
      if (!user) {
        setCloudProfile(null);
        setAccountModalOpen(false);
        setVerifiedOwnedSkinIds(['classic']);
        setVerifiedEquippedSkinId('classic');
        setMmRecord(EMPTY_MM_RECORD);
        setMmHistory([]);
        setProfile((prev) => {
          if (!prev.publicPlayerId) return prev;
          const guestProfile: PlayerProfile = { ...prev, publicPlayerId: null };
          profileRef.current = guestProfile;
          savePlayerProfile(guestProfile);
          return guestProfile;
        });
        if (
          phaseRef.current === 'MATCHMAKING' ||
          phaseRef.current === 'ONLINE_LOBBY' ||
          configRef.current.mode === 'quick_match' ||
          configRef.current.mode === 'online_1v1'
        ) {
          cleanupSessionsRef.current();
          phaseRef.current = 'TITLE';
          setPhase('TITLE');
        }
        return;
      }
      void hydrateAuthenticatedAccount(user);
    });
    return () => unsubscribe();
  }, [hydrateAuthenticatedAccount]);

  // Handle return redirect from Maya Checkout (Sandbox) — unlocks ONLY if backend verifies PAID
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const paymentState = params.get('payment');
    const orderId = params.get('orderId');
    if (!paymentState) return;

    if (paymentState === 'cancelled') {
      setShopOpen(true);
      setPaymentBanner({
        tone: 'warning',
        text: 'Payment was cancelled. No skin was unlocked.',
      });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (paymentState === 'failed') {
      setShopOpen(true);
      setPaymentBanner({
        tone: 'warning',
        text: 'Payment could not be completed. No skin was unlocked.',
      });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (paymentState === 'success' && orderId && authUser) {
      setShopOpen(true);
      setPaymentBanner({
        tone: 'info',
        text: 'Verifying payment with Maya server...',
      });
      void verifyOrderStatus(authUser, orderId).then(async (statusRes) => {
        window.history.replaceState({}, '', window.location.pathname);
        if (statusRes && statusRes.status === 'PAID') {
          const verifiedIds = sanitizeServerOwnedSkinIds(statusRes.ownedSkinIds);
          setVerifiedOwnedSkinIds(verifiedIds);
          let nextEquipped = sanitizeServerEquippedSkinId(statusRes.equippedSkinId, verifiedIds);
          if (verifiedIds.includes(statusRes.skinId)) {
            const equipRes = await requestEquipSkin(authUser, statusRes.skinId);
            if (equipRes.ok) {
              nextEquipped = sanitizeServerEquippedSkinId(equipRes.equippedSkinId, verifiedIds);
            }
          }
          setVerifiedEquippedSkinId(nextEquipped);
          soundEngine.playLevelUp(1);
          const skinDef = getSkinById(statusRes.skinId);
          setPaymentBanner({
            tone: 'success',
            text: `Payment verified! ${skinDef.name} has been unlocked.`,
          });
        } else {
          setPaymentBanner({
            tone: 'warning',
            text: 'Payment has not been verified yet. Skins unlock only after server confirmation.',
          });
        }
      });
    }
  }, [authUser]);

  const openAuthGate = useCallback(
    (
      pendingAction: null | 'quick_match' | 'online_room' | 'account' | 'shop',
      reason: string | null
    ) => {
      setAuthModalState({ open: true, reason, pendingAction });
    },
    []
  );

  const handleMarketplaceSignIn = useCallback((): Promise<boolean> => {
    if (authUserRef.current) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      pendingMarketplaceAuthResolveRef.current = resolve;
      openAuthGate(
        'shop',
        isPhoneAuthEnabled()
          ? 'Sign in with Google or Phone to tie premium cosmetic purchases securely to your Block Clash account.'
          : 'Sign in with Google to tie premium cosmetic purchases securely to your Block Clash account.'
      );
    });
  }, [openAuthGate]);

  const handleRequestPurchase = useCallback(
    async (
      skinId: TileSkinId,
      paymentMethod: PaymentMethodOption
    ): Promise<CheckoutAttemptResult> => {
      const result = await startMayaCheckout(authUser, skinId, paymentMethod);
      if (!result.ok && result.code === 'ALREADY_OWNED' && result.ownedSkinIds) {
        setVerifiedOwnedSkinIds(sanitizeServerOwnedSkinIds(result.ownedSkinIds));
      }
      return result;
    },
    [authUser]
  );

  // Every Equip request is validated against the backend POST /api/skins/equip
  const handleEquipSkin = useCallback(
    async (skinId: TileSkinId): Promise<EquipSkinResult> => {
      const result = await requestEquipSkin(authUser, skinId);
      const owned = sanitizeServerOwnedSkinIds(result.ownedSkinIds);
      setVerifiedOwnedSkinIds(owned);
      setVerifiedEquippedSkinId(sanitizeServerEquippedSkinId(result.equippedSkinId, owned));
      return result;
    },
    [authUser]
  );

  const handleToggleReducedEffects = useCallback(() => {
    setSkinPrefs((prev) => {
      const next: PlayerSkinPreferences = { reducedEffects: !prev.reducedEffects };
      saveSkinPreferences(next);
      return next;
    });
  }, []);

  const refreshQuickMatchRecord = useCallback(async () => {
    if (!authUserRef.current) {
      setMmRecord(EMPTY_MM_RECORD);
      setMmHistory([]);
      return;
    }
    const res = await fetchMatchmakingRecord(authUserRef.current);
    setMmRecord(res.record);
    setMmHistory(res.history);
  }, []);

  useEffect(() => {
    void refreshQuickMatchRecord();
  }, [authUser, refreshQuickMatchRecord]);

  useEffect(() => {
    if (isBrowserOnline) {
      setOfflineOnlineNotice(null);
    }
  }, [isBrowserOnline]);

  const theme = THEMES[config.theme];
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const configRef = useRef(config);
  configRef.current = config;

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;

  // Mutable 60fps simulation refs
  const p1Ref = useRef<PlayerBoardState>(createPlayerBoard('p1', 'YOU'));
  const p2Ref = useRef<PlayerBoardState>(createPlayerBoard('p2', 'RIVAL'));
  const projectilesRef = useRef<AttackProjectile[]>([]);
  const rivalProfileLevelRef = useRef<number>(getAIRivalLevel('medium'));

  const [p1Hud, setP1Hud] = useState<PlayerHudSnapshot>(() =>
    makeHudSnapshot(p1Ref.current, 'Player 1', profile.level)
  );
  const [p2Hud, setP2Hud] = useState<PlayerHudSnapshot>(() =>
    makeHudSnapshot(p2Ref.current, 'Medium AI', rivalProfileLevelRef.current)
  );

  // DOM refs for projectile targeting and direct zero-react-render shake transforms
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const p1BoardElRef = useRef<HTMLDivElement | null>(null);
  const p2BoardElRef = useRef<HTMLDivElement | null>(null);

  // Timing & AI refs
  const elapsedMsRef = useRef(0);
  const suddenDeathRef = useRef(false);
  const countdownTimerRef = useRef<number | null>(null);
  const calloutIdRef = useRef(1);
  const projectileIdRef = useRef(1);
  const feedIdRef = useRef(1);

  const p1KeysRef = useRef<KeyHoldState>(createKeyHoldState());
  const p2KeysRef = useRef<KeyHoldState>(createKeyHoldState());

  const aiPlanRef = useRef<AIPlan | null>(null);
  const aiActionAccRef = useRef(0);
  const aiThinkWaitRef = useRef(0);

  // Online multiplayer refs (Private Room Firestore + Automatic Quick Match WebSocket)
  const onlineSessionRef = useRef<OnlineSession | null>(null);
  const onlineRoomRef = useRef<OnlineRoomDoc | null>(null);
  const onlineSyncMetaRef = useRef<OnlineSyncMeta>(createOnlineSyncMeta());
  const onlineUnsubsRef = useRef<Unsubscribe[]>([]);
  const onlineDirtyRef = useRef(false);
  const lastOnlinePushAtRef = useRef(0);
  const lastHeartbeatAtRef = useRef(0);

  const mmClientRef = useRef<MatchmakingSocketClient | null>(null);
  const mmSessionRef = useRef<QuickMatchSession | null>(null);
  const mmSyncMetaRef = useRef<QuickMatchSyncMeta>(createQuickMatchSyncMeta());
  const mmEventHandlerRef = useRef<(ev: MatchmakingServerEvent) => void>(() => {});

  // Responsive board sizing across desktop, portrait phone, and landscape mobile/tablet
  useEffect(() => {
    const onResize = () => setArenaLayout(computeArenaLayout());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const handleChangeNickname = useCallback((nextName: string) => {
    setNickname(nextName);
    const trimmed = nextName.trim().slice(0, 16);
    if (trimmed) {
      setProfile((prev) => {
        const updated = { ...prev, nickname: trimmed };
        profileRef.current = updated;
        savePlayerProfile(updated);
        return updated;
      });
    }
  }, []);

  const syncHuds = useCallback(() => {
    const cfg = configRef.current;
    const session = onlineSessionRef.current;
    const p1Sub =
      cfg.mode === 'quick_match'
        ? 'Quick Match 1v1'
        : cfg.mode === 'online_1v1' && session
          ? `Room ${session.roomCode}`
          : 'Player 1';
    const p2Sub =
      cfg.mode === 'quick_match'
        ? 'Online Opponent'
        : cfg.mode === 'online_1v1'
          ? 'Online Rival'
          : cfg.mode === 'vs_ai'
            ? `${AI_PROFILES[cfg.difficulty].label} AI`
            : 'Player 2';
    const p2Level =
      cfg.mode === 'online_1v1' || cfg.mode === 'quick_match'
        ? rivalProfileLevelRef.current
        : cfg.mode === 'vs_ai'
          ? getAIRivalLevel(cfg.difficulty)
          : 1;
    setP1Hud(makeHudSnapshot(p1Ref.current, p1Sub, profileRef.current.level));
    setP2Hud(makeHudSnapshot(p2Ref.current, p2Sub, p2Level));
  }, []);

  const flushLocalOnlineSync = useCallback((force = false) => {
    const mode = configRef.current.mode;
    const now = performance.now();

    if (mode === 'quick_match') {
      const mmSession = mmSessionRef.current;
      const client = mmClientRef.current;
      if (!mmSession || !client || !client.isConnected()) return;
      if (!force && now - lastOnlinePushAtRef.current < 75) return;

      lastOnlinePushAtRef.current = now;
      onlineDirtyRef.current = false;
      client.sendStateUpdate({
        matchId: mmSession.matchId,
        roundNumber: mmSession.roundNumber,
        snapshot: buildServerSnapshot(p1Ref.current, mmSyncMetaRef.current),
      });
      return;
    }

    const session = onlineSessionRef.current;
    if (!session || mode !== 'online_1v1') return;
    if (!force && now - lastOnlinePushAtRef.current < 175) return;

    lastOnlinePushAtRef.current = now;
    onlineDirtyRef.current = false;
    const meta = onlineSyncMetaRef.current;
    const payload = buildPlayerSyncDoc(p1Ref.current, {
      role: session.role,
      playerId: session.playerId,
      nickname: session.nickname,
      playerLevel: profileRef.current.level,
      roundNumber: session.roundNumber,
      kosTaken: meta.kosTaken,
      lastAttackLabel: meta.lastAttackLabel,
      bombBlastsSeq: meta.bombBlastsSeq,
      lastBombCount: meta.lastBombCount,
      connected: true,
    });
    void pushLocalPlayerState(session.roomCode, session.role, payload).catch(() => {
      // Non-fatal if room closed mid-frame
    });
  }, []);

  const pushCallout = useCallback(
    (playerId: PlayerId, text: string, tone: FloatingCallout['tone'], subtext?: string) => {
      const id = calloutIdRef.current++;
      const now = performance.now();
      setCallouts((prev) => [...prev.slice(-6), { id, playerId, text, subtext, tone, createdAt: now }]);
      window.setTimeout(() => {
        setCallouts((prev) => prev.filter((c) => c.id !== id));
      }, 1200);
    },
    []
  );

  const pushFeed = useCallback((actor: PlayerId, text: string) => {
    const id = feedIdRef.current++;
    const item: BattleFeedItem = { id, actor, text };
    setBattleFeed((prev) => [item, ...prev].slice(0, 4));
    setLatestAttackAlert(item);
    window.setTimeout(() => {
      setLatestAttackAlert((curr) => (curr?.id === id ? null : curr));
    }, 2200);
  }, []);

  const finishMatch = useCallback(
    (
      reason: string,
      forceWinner?: PlayerId,
      serverOverride?: {
        winnerOverride: PlayerId | 'draw';
        p1Stats: PlayerStats;
        p2Stats: PlayerStats;
        durationMs?: number;
      }
    ) => {
      if (phaseRef.current === 'SUMMARY') return;
      phaseRef.current = 'SUMMARY';
      setPhase('SUMMARY');

      const b1 = p1Ref.current;
      const b2 = p2Ref.current;

      const finalP1Stats: PlayerStats = serverOverride
        ? { ...serverOverride.p1Stats }
        : { ...b1.stats };
      const finalP2Stats: PlayerStats = serverOverride
        ? { ...serverOverride.p2Stats }
        : { ...b2.stats };

      let winner: PlayerId | 'draw' = 'draw';
      if (serverOverride) {
        winner = serverOverride.winnerOverride;
      } else if (forceWinner) {
        winner = forceWinner;
      } else if (finalP1Stats.kos !== finalP2Stats.kos) {
        winner = finalP1Stats.kos > finalP2Stats.kos ? 'p1' : 'p2';
      } else if (finalP1Stats.linesCleared !== finalP2Stats.linesCleared) {
        winner = finalP1Stats.linesCleared > finalP2Stats.linesCleared ? 'p1' : 'p2';
      }

      const winnerText =
        winner === 'draw'
          ? 'Draw Match'
          : winner === 'p1'
            ? `${b1.label} Wins!`
            : `${b2.label} Wins!`;

      soundEngine.playMatchEnd(winner !== 'p2');

      // Award persistent Level 1-300 XP & update player profile
      const cfg = configRef.current;
      const { nextProfile, xpResult } = awardMatchXP(profileRef.current, {
        won: winner === 'p1',
        mode: cfg.mode,
        difficulty: cfg.difficulty,
        stats: finalP1Stats,
      });
      profileRef.current = nextProfile;
      setProfile(nextProfile);

      // Persist progression cross-device to Express backend + Cloud Firestore if signed in
      const signedInUser = authUserRef.current;
      if (signedInUser) {
        void syncProgressToServer(signedInUser, nextProfile, false).then((updatedCloud) => {
          if (!updatedCloud) return;
          setCloudProfile(updatedCloud);
          void syncProfileWithFirestore(signedInUser, updatedCloud, mmRecordRef.current);
        });
      }

      setSummary({
        winnerText,
        reasonText: reason,
        durationText: formatElapsed(serverOverride?.durationMs ?? elapsedMsRef.current),
        p1Stats: finalP1Stats,
        p2Stats: finalP2Stats,
        xpResult,
      });
    },
    []
  );

  const spawnLineClearParticles = useCallback((board: PlayerBoardState, rows: number[]) => {
    const t = themeRef.current;
    const inv = skinInventoryRef.current;
    const activeSkin = inv.equippedSkinId !== 'classic' ? getSkinById(inv.equippedSkinId) : null;
    const perCellParticles = inv.reducedEffects ? 1 : 2;
    board.clearFlashes.push({ rows, alpha: 1, kind: 'line' });
    for (const rowIdx of rows) {
      const visRow = rowIdx - BUFFER_ROWS;
      if (visRow < 0) continue;
      for (let c = 0; c < COLS; c++) {
        for (let k = 0; k < perCellParticles; k++) {
          const pieceKeys = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
          const pick = pieceKeys[(c + rowIdx + k) % pieceKeys.length];
          const particleColor = activeSkin
            ? k === 0
              ? activeSkin.pieces[pick].light
              : activeSkin.pieces[pick].glow
            : t.pieces[pick].light;
          board.particles.push({
            x: c + 0.5,
            y: visRow + 0.5,
            vx: (Math.random() - 0.5) * 9,
            vy: -Math.random() * 6 - 1.5,
            size: 3 + Math.random() * 4,
            color: particleColor,
            alpha: 1,
            life: 0,
            maxLife: 0.45 + Math.random() * 0.25,
          });
        }
      }
    }
  }, []);

  const spawnBombBlastParticles = useCallback(
    (board: PlayerBoardState, rows: number[], coords: Array<[number, number]>) => {
      board.clearFlashes.push({ rows, alpha: 1, kind: 'bomb' });
      const blastColors = ['#FEF08A', '#FB923C', '#F97316', '#EF4444'];

      // Radial explosion sparks centered on every detonated Bomb Block
      for (const [bx, by] of coords) {
        const visY = by - BUFFER_ROWS;
        if (visY < 0) continue;
        for (let i = 0; i < 18; i++) {
          const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.25;
          const speed = 4.5 + Math.random() * 10;
          board.particles.push({
            x: bx + 0.5,
            y: visY + 0.5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.2,
            size: 3.5 + Math.random() * 4.5,
            color: blastColors[i % blastColors.length],
            alpha: 1,
            life: 0,
            maxLife: 0.48 + Math.random() * 0.28,
          });
        }
      }

      // Row-wide fiery debris across cleared garbage rows
      for (const rowIdx of rows) {
        const visRow = rowIdx - BUFFER_ROWS;
        if (visRow < 0) continue;
        for (let c = 0; c < COLS; c++) {
          board.particles.push({
            x: c + 0.5,
            y: visRow + 0.5,
            vx: (Math.random() - 0.5) * 8,
            vy: -Math.random() * 7 - 1.5,
            size: 3 + Math.random() * 3.5,
            color: blastColors[(c + rowIdx) % blastColors.length],
            alpha: 1,
            life: 0,
            maxLife: 0.4 + Math.random() * 0.25,
          });
        }
      }
    },
    []
  );

  const spawnKOParticles = useCallback((board: PlayerBoardState) => {
    const t = themeRef.current;
    for (let i = 0; i < 48; i++) {
      const angle = (Math.PI * 2 * i) / 48 + Math.random() * 0.2;
      const speed = 3.5 + Math.random() * 11;
      board.particles.push({
        x: COLS / 2,
        y: 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 5.5,
        color: i % 3 === 0 ? '#FEF08A' : i % 2 === 0 ? t.danger : t.warning,
        alpha: 1,
        life: 0,
        maxLife: 0.65 + Math.random() * 0.35,
      });
    }
  }, []);

  const processLockOutcome = useCallback(
    (attacker: PlayerBoardState, defender: PlayerBoardState, result: LockResult) => {
      const t = themeRef.current;
      const isRoomOnline = configRef.current.mode === 'online_1v1';
      const isQuickMatch = configRef.current.mode === 'quick_match';
      const isOnline = isRoomOnline || isQuickMatch;
      const session = onlineSessionRef.current;

      // Bomb Block Detonation & Chain Blast feedback
      if (result.bombsDetonated > 0) {
        spawnBombBlastParticles(attacker, result.bombClearedRowIndices, result.bombCoords);
        soundEngine.playBombExplosion(result.bombsDetonated);
        soundEngine.triggerHaptic(result.bombsDetonated >= 2 ? [16, 26, 22] : 14);

        if (isRoomOnline && attacker.id === 'p1') {
          onlineSyncMetaRef.current.bombBlastsSeq += 1;
          onlineSyncMetaRef.current.lastBombCount = result.bombsDetonated;
        } else if (isQuickMatch && attacker.id === 'p1') {
          mmSyncMetaRef.current.bombBlastsSeq += 1;
          mmSyncMetaRef.current.lastBombCount = result.bombsDetonated;
        }

        const isChain = result.bombsDetonated >= 2;
        pushCallout(
          attacker.id,
          isChain ? 'CHAIN BLAST!' : 'CORE BLAST!',
          'bomb',
          isChain ? `${result.bombsDetonated}x CORES DETONATED` : 'BREACH ROW CLEARED'
        );
        pushFeed(
          attacker.id,
          `${attacker.label}: ${isChain ? `Chain Blast (${result.bombsDetonated}x Cores)` : 'Core Blast!'}`
        );
      }

      if (result.clearedLines > 0) {
        spawnLineClearParticles(attacker, result.clearedRowIndices);
        soundEngine.playLineClear(result.clearedLines, result.combo);

        const clearLabel =
          result.clearedLines >= 4
            ? 'QUAD SMASH!'
            : result.clearedLines === 3
              ? 'TRIPLE!'
              : result.clearedLines === 2
                ? 'DOUBLE!'
                : result.combo >= 2
                  ? `${result.combo}x COMBO!`
                  : '';

        if (result.isPerfectClear) {
          pushCallout(attacker.id, 'PERFECT CLEAR!', 'quad', `+${result.attackSent} Attack`);
          pushFeed(attacker.id, `${attacker.label} Perfect Clear!`);
        } else if (clearLabel) {
          const tone =
            result.clearedLines >= 4
              ? 'quad'
              : result.combo >= 2
                ? 'combo'
                : 'neutral';
          const subParts: string[] = [];
          if (result.clearedLines >= 2 && result.combo >= 2) {
            subParts.push(`${result.combo}x COMBO`);
          }
          if (result.garbageCancelled > 0) {
            subParts.push(`COUNTER -${result.garbageCancelled}`);
          } else if (result.attackSent > 0) {
            subParts.push(`+${result.attackSent} SENT`);
          }
          pushCallout(attacker.id, clearLabel, tone, subParts.join(' · ') || undefined);
        } else if (result.garbageCancelled > 0) {
          pushCallout(attacker.id, `COUNTER -${result.garbageCancelled}`, 'counter');
        }

        if (result.attackSent > 0) {
          // In local modes, enqueue directly on defender board; in online modes, server/Firestore delivers it
          if (!isOnline) {
            enqueueGarbage(defender, result.attackSent);
          }
          soundEngine.playGarbageWarning();

          const avgRow =
            result.clearedRowIndices.length > 0
              ? result.clearedRowIndices.reduce((a, b) => a + b, 0) / result.clearedRowIndices.length
              : 16;
          const startYNorm = Math.max(0.15, Math.min(0.88, (avgRow - BUFFER_ROWS) / 20));

          projectilesRef.current.push({
            id: projectileIdRef.current++,
            from: attacker.id,
            to: defender.id,
            lines: result.attackSent,
            progress: 0,
            durationMs: 460,
            arcHeight: 75 + Math.min(80, result.attackSent * 14),
            color: attacker.id === 'p1' ? t.accentP1 : t.accentP2,
            startYNorm,
          });

          const attackTag =
            result.clearedLines >= 4
              ? `Quad Smash (+${result.attackSent})`
              : result.combo >= 2
                ? `${result.combo}x Combo (+${result.attackSent})`
                : `Attack (+${result.attackSent})`;
          const feedMsg = `${attacker.label}: ${attackTag}`;
          if (isRoomOnline && attacker.id === 'p1') {
            onlineSyncMetaRef.current.lastAttackLabel = feedMsg.slice(0, 48);
          } else if (isQuickMatch && attacker.id === 'p1') {
            mmSyncMetaRef.current.lastAttackLabel = feedMsg.slice(0, 48);
          }
          pushFeed(attacker.id, feedMsg);
        } else if (result.garbageCancelled > 0) {
          pushFeed(attacker.id, `${attacker.label}: Countered -${result.garbageCancelled}`);
        }
      }

      if (result.garbageRisen > 0) {
        soundEngine.playGarbageRise();
        attacker.shakeY = -5;
        attacker.shakeTimerMs = Math.max(attacker.shakeTimerMs, 140);
      }

      if (result.isKO) {
        if (isQuickMatch) {
          // In Quick Match, report local top-out to server; server authoritatively updates KOs & Sudden Death finish
          if (attacker.id === 'p1') {
            mmSyncMetaRef.current.kosTaken += 1;
          }
          spawnKOParticles(attacker);
          soundEngine.playKO();
          soundEngine.triggerHaptic([28, 30, 42]);
          pushCallout(attacker.id, 'KO!', 'ko', 'Board Reset');
          flushLocalOnlineSync(true);
          syncHuds();
          return;
        }

        defender.stats.kos++;
        defender.stats.score += 1000;
        if (isRoomOnline && attacker.id === 'p1') {
          onlineSyncMetaRef.current.kosTaken += 1;
        }
        spawnKOParticles(attacker);
        soundEngine.playKO();
        soundEngine.triggerHaptic([28, 30, 42]);
        pushCallout(attacker.id, 'KO!', 'ko', 'Board Reset');
        pushCallout(defender.id, '+1 KO!', 'quad', '+1,000 PTS');
        pushFeed(defender.id, `${defender.label} scored a KO!`);

        // Sudden Death resolves immediately on the next KO
        if (suddenDeathRef.current) {
          if (isRoomOnline && session) {
            flushLocalOnlineSync(true);
            const rivalRole = session.role === 'host' ? 'guest' : 'host';
            void finishOnlineRoom(session.roomCode, rivalRole, 'Sudden Death KO Victory');
          }
          syncHuds();
          finishMatch('Sudden Death KO Victory', defender.id);
          return;
        }
      }

      // Reset AI plan whenever AI's piece locks or garbage shifts its board
      if (!isOnline && (attacker.id === 'p2' || result.garbageRisen > 0 || result.isKO)) {
        aiPlanRef.current = null;
        aiThinkWaitRef.current = AI_PROFILES[configRef.current.difficulty].thinkDelayMs;
      }

      if (isOnline && attacker.id === 'p1') {
        flushLocalOnlineSync(true);
      }

      syncHuds();
    },
    [
      finishMatch,
      flushLocalOnlineSync,
      pushCallout,
      pushFeed,
      spawnBombBlastParticles,
      spawnKOParticles,
      spawnLineClearParticles,
      syncHuds,
    ]
  );

  // Execute a discrete action for Player 1 or Player 2
  const performPlayerAction = useCallback(
    (playerId: PlayerId, action: TouchAction) => {
      if (phaseRef.current !== 'PLAYING') return;
      if (
        (configRef.current.mode === 'online_1v1' || configRef.current.mode === 'quick_match') &&
        playerId === 'p2'
      ) {
        return;
      }
      soundEngine.unlock();

      const board = playerId === 'p1' ? p1Ref.current : p2Ref.current;
      const opponent = playerId === 'p1' ? p2Ref.current : p1Ref.current;

      switch (action) {
        case 'left':
          if (tryMovePiece(board, -1, 0)) {
            soundEngine.playMove();
            if (playerId === 'p1') onlineDirtyRef.current = true;
          }
          break;
        case 'right':
          if (tryMovePiece(board, 1, 0)) {
            soundEngine.playMove();
            if (playerId === 'p1') onlineDirtyRef.current = true;
          }
          break;
        case 'down':
          if (tryMovePiece(board, 0, 1, true)) {
            soundEngine.playSoftDrop();
            if (playerId === 'p1') onlineDirtyRef.current = true;
            syncHuds();
          }
          break;
        case 'rotateCW':
          if (tryRotatePiece(board, 1)) {
            soundEngine.playRotate();
            if (playerId === 'p1') onlineDirtyRef.current = true;
          }
          break;
        case 'rotateCCW':
          if (tryRotatePiece(board, -1)) {
            soundEngine.playRotate();
            if (playerId === 'p1') onlineDirtyRef.current = true;
          }
          break;
        case 'hold':
          if (tryHoldPiece(board)) {
            soundEngine.playHold();
            if (
              playerId === 'p1' &&
              (configRef.current.mode === 'online_1v1' ||
                configRef.current.mode === 'quick_match')
            ) {
              flushLocalOnlineSync(true);
            }
            syncHuds();
          }
          break;
        case 'hardDrop': {
          soundEngine.playHardDrop();
          if (playerId === 'p1') soundEngine.triggerHaptic(12);
          const { result } = performHardDrop(board);
          processLockOutcome(board, opponent, result);
          break;
        }
      }
    },
    [flushLocalOnlineSync, processLockOutcome, syncHuds]
  );

  const startMatch = useCallback(
    (cfg: MatchConfig) => {
      soundEngine.unlock();
      if (countdownTimerRef.current !== null) {
        window.clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      p1Ref.current = createPlayerBoard('p1', 'YOU');
      p2Ref.current = createPlayerBoard('p2', 'RIVAL');
      projectilesRef.current = [];
      p1KeysRef.current = createKeyHoldState();
      p2KeysRef.current = createKeyHoldState();
      aiPlanRef.current = null;
      aiActionAccRef.current = 0;
      aiThinkWaitRef.current = AI_PROFILES[cfg.difficulty].thinkDelayMs;
      elapsedMsRef.current = 0;
      suddenDeathRef.current = false;

      setSuddenDeath(false);
      setClockDisplay(cfg.matchType === 'ko_2min' ? '2:00' : '0:00');
      setBattleFeed([]);
      setLatestAttackAlert(null);
      setCallouts([]);
      setSummary(null);
      syncHuds();

      setPhase('COUNTDOWN');
      phaseRef.current = 'COUNTDOWN';
      setCountdownStep('3');
      soundEngine.playCountdown(false);

      countdownTimerRef.current = window.setTimeout(() => {
        setCountdownStep('2');
        soundEngine.playCountdown(false);
        countdownTimerRef.current = window.setTimeout(() => {
          setCountdownStep('1');
          soundEngine.playCountdown(false);
          countdownTimerRef.current = window.setTimeout(() => {
            setCountdownStep('CLASH!');
            soundEngine.playCountdown(true);
            phaseRef.current = 'PLAYING';
            setPhase('PLAYING');
            countdownTimerRef.current = window.setTimeout(() => {
              setCountdownStep('');
            }, 450);
          }, 680);
        }, 680);
      }, 680);
    },
    [syncHuds]
  );

  const cleanupOnlineSession = useCallback((notifyRemote = true) => {
    for (const unsub of onlineUnsubsRef.current) {
      try {
        unsub();
      } catch {
        // Ignore
      }
    }
    onlineUnsubsRef.current = [];

    const session = onlineSessionRef.current;
    const room = onlineRoomRef.current;
    if (notifyRemote && session) {
      void markPlayerDisconnected(session.roomCode, session.role);
      if (!room || room.status === 'waiting' || room.status === 'finished') {
        void abandonOnlineRoom(session.roomCode, `${session.nickname} left the room`);
      }
    }

    onlineSessionRef.current = null;
    onlineRoomRef.current = null;
    onlineSyncMetaRef.current = createOnlineSyncMeta();
    onlineDirtyRef.current = false;
    setOnlineRoom(null);
    setWaitingRoomCode(null);
    setOpponentNotice(null);
  }, []);

  const cleanupQuickMatchSession = useCallback((forfeitIfPlaying = true) => {
    const inActiveMatch =
      Boolean(mmSessionRef.current) &&
      (phaseRef.current === 'PLAYING' || phaseRef.current === 'COUNTDOWN');
    if (mmClientRef.current) {
      mmClientRef.current.disconnect(forfeitIfPlaying && inActiveMatch);
      mmClientRef.current = null;
    }
    mmSessionRef.current = null;
    mmSyncMetaRef.current = createQuickMatchSyncMeta();
    onlineDirtyRef.current = false;
    setMmStatus('idle');
    setMmEnqueuedAtMs(null);
    setMmMatchedOpponent(null);
    setMmRematchState('idle');
    setOpponentNotice(null);
  }, []);

  cleanupSessionsRef.current = () => {
    cleanupOnlineSession(true);
    cleanupQuickMatchSession(true);
  };

  // Ensure clean disconnect signal on tab close / mobile navigation away
  useEffect(() => {
    const onLeavePage = () => {
      const session = onlineSessionRef.current;
      if (session) {
        void markPlayerDisconnected(session.roomCode, session.role);
      }
      if (mmClientRef.current) {
        const active =
          Boolean(mmSessionRef.current) &&
          (phaseRef.current === 'PLAYING' || phaseRef.current === 'COUNTDOWN');
        mmClientRef.current.disconnect(active);
      }
    };
    window.addEventListener('beforeunload', onLeavePage);
    window.addEventListener('pagehide', onLeavePage);
    return () => {
      window.removeEventListener('beforeunload', onLeavePage);
      window.removeEventListener('pagehide', onLeavePage);
      cleanupOnlineSession(true);
      cleanupQuickMatchSession(true);
    };
  }, [cleanupOnlineSession, cleanupQuickMatchSession]);

  const startOnlineRound = useCallback(
    (room: OnlineRoomDoc) => {
      const session = onlineSessionRef.current;
      if (!session) return;

      soundEngine.unlock();
      if (countdownTimerRef.current !== null) {
        window.clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      const myName = session.role === 'host' ? room.hostName : room.guestName;
      const rivalName = session.role === 'host' ? room.guestName : room.hostName;
      const rivalLevel = session.role === 'host' ? room.guestLevel : room.hostLevel;
      session.nickname = myName || session.nickname;
      session.rivalName = rivalName || 'RIVAL';
      session.roundNumber = room.roundNumber;
      session.matchStartAtMs = room.matchStartAtMs;
      rivalProfileLevelRef.current = rivalLevel >= 1 ? rivalLevel : rivalProfileLevelRef.current;

      p1Ref.current = createPlayerBoard('p1', session.nickname);
      p2Ref.current = createPlayerBoard('p2', session.rivalName);
      projectilesRef.current = [];
      p1KeysRef.current = createKeyHoldState();
      p2KeysRef.current = createKeyHoldState();
      elapsedMsRef.current = 0;
      suddenDeathRef.current = false;

      onlineSyncMetaRef.current = {
        ...createOnlineSyncMeta(),
        startedRoundNumber: room.roundNumber,
        lastRemoteHeartbeatAt: Date.now(),
        remoteConnected: true,
      };
      lastHeartbeatAtRef.current = performance.now();

      setWaitingRoomCode(null);
      setOpponentNotice(null);
      setSuddenDeath(false);
      setClockDisplay(room.matchType === 'ko_2min' ? '2:00' : '0:00');
      setBattleFeed([]);
      setLatestAttackAlert(null);
      setCallouts([]);
      setSummary(null);
      syncHuds();

      // Immediately push freshly reset board for this round
      flushLocalOnlineSync(true);

      setPhase('COUNTDOWN');
      phaseRef.current = 'COUNTDOWN';

      const remainingMs = Math.max(900, Math.min(2700, room.matchStartAtMs - Date.now()));
      const stepMs = Math.round(remainingMs / 3);

      setCountdownStep('3');
      soundEngine.playCountdown(false);

      countdownTimerRef.current = window.setTimeout(() => {
        setCountdownStep('2');
        soundEngine.playCountdown(false);
        countdownTimerRef.current = window.setTimeout(() => {
          setCountdownStep('1');
          soundEngine.playCountdown(false);
          countdownTimerRef.current = window.setTimeout(() => {
            setCountdownStep('CLASH!');
            soundEngine.playCountdown(true);
            phaseRef.current = 'PLAYING';
            setPhase('PLAYING');
            if (onlineSessionRef.current) {
              onlineSessionRef.current.matchStartAtMs = Math.min(
                room.matchStartAtMs,
                Date.now()
              );
              void transitionRoomToPlaying(room.roomCode);
            }
            countdownTimerRef.current = window.setTimeout(() => {
              setCountdownStep('');
            }, 450);
          }, stepMs);
        }, stepMs);
      }, stepMs);
    },
    [flushLocalOnlineSync, syncHuds]
  );

  const attachOnlineListeners = useCallback(
    (roomCode: string, role: OnlineRole) => {
      for (const unsub of onlineUnsubsRef.current) {
        try {
          unsub();
        } catch {
          // Ignore
        }
      }
      onlineUnsubsRef.current = [];

      const opponentRole: OnlineRole = role === 'host' ? 'guest' : 'host';

      const unsubRoom = subscribeToRoom(
        roomCode,
        (room) => {
          onlineRoomRef.current = room;
          setOnlineRoom(room);

          const session = onlineSessionRef.current;
          if (!session) return;

          if (
            room.status === 'countdown' &&
            room.roundNumber !== onlineSyncMetaRef.current.startedRoundNumber
          ) {
            startOnlineRound(room);
            return;
          }

          if (room.status === 'playing' && phaseRef.current === 'COUNTDOWN') {
            if (countdownTimerRef.current !== null) {
              window.clearTimeout(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            setCountdownStep('');
            phaseRef.current = 'PLAYING';
            setPhase('PLAYING');
          }

          if (room.suddenDeath && !suddenDeathRef.current && phaseRef.current === 'PLAYING') {
            suddenDeathRef.current = true;
            setSuddenDeath(true);
            setClockDisplay('SD');
            soundEngine.playGarbageWarning();
            pushCallout('p1', 'SUDDEN DEATH!', 'ko', 'Next KO Wins');
            pushCallout('p2', 'SUDDEN DEATH!', 'ko', 'Next KO Wins');
            pushFeed('p1', 'Sudden Death — Next KO wins!');
          }

          if (room.status === 'finished' && phaseRef.current !== 'SUMMARY') {
            const winnerId: PlayerId | undefined =
              room.winnerRole === 'host'
                ? session.role === 'host'
                  ? 'p1'
                  : 'p2'
                : room.winnerRole === 'guest'
                  ? session.role === 'guest'
                    ? 'p1'
                    : 'p2'
                  : undefined;
            finishMatch(room.finishReason || 'Match Complete', winnerId);
          }

          if (room.status === 'abandoned') {
            if (phaseRef.current === 'PLAYING' || phaseRef.current === 'COUNTDOWN') {
              finishMatch(room.finishReason || 'Opponent Left Room', 'p1');
            } else if (phaseRef.current === 'ONLINE_LOBBY') {
              setWaitingRoomCode(null);
            }
          }
        },
        (err) => {
          setOnlineError(err.message);
        }
      );

      const unsubOpp = subscribeToOpponent(
        roomCode,
        opponentRole,
        (remote: OnlinePlayerSyncDoc) => {
          const session = onlineSessionRef.current;
          if (!session) return;

          // Ignore snapshots belonging to an older round
          if (remote.roundNumber < session.roundNumber) return;

          const meta = onlineSyncMetaRef.current;
          meta.lastRemoteHeartbeatAt = Date.now();
          meta.remoteConnected = remote.connected;
          if (remote.connected) {
            setOpponentNotice(null);
          }

          // Hydrate Rival board (right-hand side) smoothly
          const p2 = p2Ref.current;
          p2.label = remote.nickname || session.rivalName || 'RIVAL';
          if (typeof remote.playerLevel === 'number' && remote.playerLevel >= 1) {
            rivalProfileLevelRef.current = remote.playerLevel;
          }
          decodeVisibleGridIntoBoard(remote.grid, p2);
          p2.active = {
            type: remote.activeType,
            rotation: remote.activeRot,
            x: remote.activeX,
            y: remote.activeY,
          };
          p2.hold = remote.hold ? remote.hold : null;
          p2.holdUsed = remote.holdUsed;
          p2.queue = decodeNext3Pieces(remote.next3);
          p2.combo = remote.combo;
          p2.stats = {
            score: remote.score,
            level: remote.level,
            kos: Math.max(remote.kos, meta.kosTaken),
            linesCleared: remote.linesCleared,
            maxCombo: remote.maxCombo,
            garbageSent: remote.garbageSent,
            quads: remote.quads,
            piecesPlaced: remote.piecesPlaced,
            bombChains: 0,
          };
          p2.incomingGarbage =
            remote.incomingTotal > 0
              ? [
                  {
                    id: 1,
                    lines: remote.incomingTotal,
                    gapCol: remote.nextGapCol >= 0 ? remote.nextGapCol : 4,
                    timerMs: remote.incomingReady > 0 ? 0 : 400,
                  },
                ]
              : [];

          // Process incoming garbage attack delta from online opponent
          if (
            phaseRef.current === 'PLAYING' &&
            remote.roundNumber === session.roundNumber &&
            remote.garbageSent > meta.lastSeenRemoteGarbage
          ) {
            const delta = remote.garbageSent - meta.lastSeenRemoteGarbage;
            meta.lastSeenRemoteGarbage = remote.garbageSent;
            enqueueGarbage(p1Ref.current, delta);
            soundEngine.playGarbageWarning();
            projectilesRef.current.push({
              id: projectileIdRef.current++,
              from: 'p2',
              to: 'p1',
              lines: delta,
              progress: 0,
              durationMs: 460,
              arcHeight: 75 + Math.min(80, delta * 14),
              color: themeRef.current.accentP2,
              startYNorm: 0.55,
            });
            pushFeed(
              'p2',
              remote.lastAttackLabel || `${p2.label}: Attack (+${delta})`
            );
          }

          // Process authoritative KO suffered by opponent -> award +1 KO to local player
          if (
            phaseRef.current === 'PLAYING' &&
            remote.roundNumber === session.roundNumber &&
            remote.kosTaken > meta.lastSeenRemoteKosTaken
          ) {
            const koDelta = remote.kosTaken - meta.lastSeenRemoteKosTaken;
            meta.lastSeenRemoteKosTaken = remote.kosTaken;
            p1Ref.current.stats.kos += koDelta;
            p1Ref.current.stats.score += 1000 * koDelta;
            spawnKOParticles(p2);
            soundEngine.playKO();
            soundEngine.triggerHaptic([28, 30, 42]);
            pushCallout('p2', 'KO!', 'ko', 'Board Reset');
            pushCallout('p1', '+1 KO!', 'quad', '+1,000 PTS');
            pushFeed('p1', `${p1Ref.current.label} scored a KO!`);
            flushLocalOnlineSync(true);

            if (suddenDeathRef.current) {
              void finishOnlineRoom(session.roomCode, session.role, 'Sudden Death KO Victory');
              syncHuds();
              finishMatch('Sudden Death KO Victory', 'p1');
              return;
            }
          }

          // Visual Bomb Blast VFX on opponent board
          if (
            phaseRef.current === 'PLAYING' &&
            remote.roundNumber === session.roundNumber &&
            remote.bombBlastsSeq > meta.lastSeenRemoteBombSeq
          ) {
            meta.lastSeenRemoteBombSeq = remote.bombBlastsSeq;
            const count = Math.max(1, remote.lastBombCount);
            soundEngine.playBombExplosion(count);
            pushCallout(
              'p2',
              count >= 2 ? 'CHAIN BLAST!' : 'BOMB CLEAR!',
              'bomb',
              count >= 2 ? `${count}x BOMBS CLEARED` : undefined
            );
          }

          // Handle explicit opponent disconnect
          if (
            !remote.connected &&
            (phaseRef.current === 'PLAYING' || phaseRef.current === 'COUNTDOWN')
          ) {
            const reason = `${p2.label} Disconnected`;
            void finishOnlineRoom(session.roomCode, session.role, reason);
            syncHuds();
            finishMatch(reason, 'p1');
            return;
          }

          syncHuds();
        },
        (err) => {
          setOnlineError(err.message);
        }
      );

      onlineUnsubsRef.current = [unsubRoom, unsubOpp];
    },
    [
      finishMatch,
      flushLocalOnlineSync,
      pushCallout,
      pushFeed,
      spawnKOParticles,
      startOnlineRound,
      syncHuds,
    ]
  );

  const handleCreateOnlineRoom = useCallback(async () => {
    soundEngine.unlock();
    if (!authUserRef.current) {
      openAuthGate(
        'online_room',
        'Sign in to create a Private Online 1v1 Room with your verified account.'
      );
      return;
    }
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const cleanName = sanitizeNickname(nickname, 'Host');
      handleChangeNickname(cleanName);
      p1Ref.current = createPlayerBoard('p1', cleanName);
      const { roomCode, playerId, nickname: resolvedName } = await createOnlineRoom(
        cleanName,
        profileRef.current.level,
        configRef.current.matchType,
        p1Ref.current
      );
      onlineSessionRef.current = {
        roomCode,
        role: 'host',
        playerId,
        nickname: resolvedName,
        rivalName: 'RIVAL',
        roundNumber: 1,
        matchStartAtMs: 0,
      };
      onlineSyncMetaRef.current = createOnlineSyncMeta();
      setWaitingRoomCode(roomCode);
      attachOnlineListeners(roomCode, 'host');
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Failed to create room.');
    } finally {
      setOnlineBusy(false);
    }
  }, [attachOnlineListeners, handleChangeNickname, nickname, openAuthGate]);

  const handleJoinOnlineRoom = useCallback(
    async (code: string) => {
      soundEngine.unlock();
      if (!authUserRef.current) {
        openAuthGate(
          'online_room',
          'Sign in to join a Private Online 1v1 Room with your verified account.'
        );
        return;
      }
      setOnlineBusy(true);
      setOnlineError(null);
      try {
        const cleanName = sanitizeNickname(nickname, 'Guest');
        handleChangeNickname(cleanName);
        p1Ref.current = createPlayerBoard('p1', cleanName);
        const { roomCode, playerId, nickname: resolvedName, hostName, hostLevel, matchType } =
          await joinOnlineRoom(code, cleanName, profileRef.current.level, p1Ref.current);

        rivalProfileLevelRef.current = hostLevel;
        setConfig((prev) => ({ ...prev, mode: 'online_1v1', matchType }));
        configRef.current = { ...configRef.current, mode: 'online_1v1', matchType };

        onlineSessionRef.current = {
          roomCode,
          role: 'guest',
          playerId,
          nickname: resolvedName,
          rivalName: hostName,
          roundNumber: 1,
          matchStartAtMs: 0,
        };
        onlineSyncMetaRef.current = createOnlineSyncMeta();
        attachOnlineListeners(roomCode, 'guest');
      } catch (err) {
        setOnlineError(err instanceof Error ? err.message : 'Could not join room.');
      } finally {
        setOnlineBusy(false);
      }
    },
    [attachOnlineListeners, handleChangeNickname, nickname, openAuthGate]
  );

  const handleOnlineRematch = useCallback(async () => {
    const session = onlineSessionRef.current;
    const room = onlineRoomRef.current;
    if (!session || !room || room.status !== 'finished') return;
    try {
      await requestOrStartRematch(session.roomCode, session.role, room);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Could not request rematch.');
    }
  }, []);

  // =========================================================================
  // AUTOMATIC 1V1 ONLINE MATCHMAKING (WebSocket Quick Match)
  // =========================================================================
  const startQuickMatchCountdown = useCallback(
    (ev: Extract<MatchmakingServerEvent, { type: 'match:found' }>) => {
      soundEngine.unlock();
      if (countdownTimerRef.current !== null) {
        window.clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      const myName = sanitizeNickname(nicknameRef.current, 'Player');
      const oppName = ev.opponent.nickname || 'Opponent';
      const oppLevel = ev.opponent.level >= 1 ? ev.opponent.level : 1;

      setConfig((prev) => ({ ...prev, mode: 'quick_match', matchType: ev.matchType }));
      configRef.current = {
        ...configRef.current,
        mode: 'quick_match',
        matchType: ev.matchType,
      };

      rivalProfileLevelRef.current = oppLevel;
      mmSessionRef.current = {
        matchId: ev.matchId,
        role: ev.role,
        nickname: myName,
        rivalName: oppName,
        rivalLevel: oppLevel,
        roundNumber: ev.roundNumber,
        matchStartAtMs: ev.matchStartAtMs,
        durationMs: ev.durationMs,
      };
      mmSyncMetaRef.current = createQuickMatchSyncMeta();

      p1Ref.current = createPlayerBoard('p1', myName);
      p2Ref.current = createPlayerBoard('p2', oppName);
      projectilesRef.current = [];
      p1KeysRef.current = createKeyHoldState();
      p2KeysRef.current = createKeyHoldState();
      elapsedMsRef.current = 0;
      suddenDeathRef.current = false;

      setMmStatus('matched');
      setMmEnqueuedAtMs(null);
      setMmError(null);
      setMmInfoNotice(null);
      setMmRematchState('idle');
      setMmMatchedOpponent({
        nickname: oppName,
        level: oppLevel,
        matchType: ev.matchType,
        roundNumber: ev.roundNumber,
      });

      setOpponentNotice(null);
      setSuddenDeath(false);
      setClockDisplay(ev.matchType === 'ko_2min' ? '2:00' : '0:00');
      setBattleFeed([]);
      setLatestAttackAlert(null);
      setCallouts([]);
      setSummary(null);
      syncHuds();

      flushLocalOnlineSync(true);

      setPhase('COUNTDOWN');
      phaseRef.current = 'COUNTDOWN';

      const offset = mmClientRef.current?.serverClockOffsetMs ?? 0;
      const remainingMs = Math.max(
        900,
        Math.min(3200, ev.matchStartAtMs - (Date.now() + offset))
      );
      const stepMs = Math.round(remainingMs / 3);

      setCountdownStep('3');
      soundEngine.playCountdown(false);

      countdownTimerRef.current = window.setTimeout(() => {
        setCountdownStep('2');
        soundEngine.playCountdown(false);
        countdownTimerRef.current = window.setTimeout(() => {
          setCountdownStep('1');
          soundEngine.playCountdown(false);
          countdownTimerRef.current = window.setTimeout(() => {
            if (phaseRef.current === 'COUNTDOWN') {
              setCountdownStep('CLASH!');
              soundEngine.playCountdown(true);
              phaseRef.current = 'PLAYING';
              setPhase('PLAYING');
              countdownTimerRef.current = window.setTimeout(() => {
                setCountdownStep('');
                setMmMatchedOpponent(null);
              }, 480);
            }
          }, stepMs);
        }, stepMs);
      }, stepMs);
    },
    [flushLocalOnlineSync, syncHuds]
  );

  const handleMatchmakingEvent = useCallback(
    (ev: MatchmakingServerEvent) => {
      switch (ev.type) {
        case 'queue:joined':
          setMmStatus('searching');
          setMmEnqueuedAtMs(Date.now());
          setMmError(null);
          setMmInfoNotice(null);
          break;

        case 'queue:cancelled':
          setMmStatus('idle');
          setMmEnqueuedAtMs(null);
          if (ev.removed) {
            setMmInfoNotice('Matchmaking cancelled.');
          }
          break;

        case 'queue:error':
          setMmStatus('error');
          setMmEnqueuedAtMs(null);
          setMmError(ev.message);
          break;

        case 'match:found':
          startQuickMatchCountdown(ev);
          break;

        case 'match:start': {
          const session = mmSessionRef.current;
          if (!session || session.matchId !== ev.matchId || session.roundNumber !== ev.roundNumber) {
            return;
          }
          session.matchStartAtMs = ev.matchStartAtMs;
          session.durationMs = ev.durationMs;
          if (countdownTimerRef.current !== null) {
            window.clearTimeout(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          if (phaseRef.current === 'COUNTDOWN') {
            setCountdownStep('CLASH!');
            soundEngine.playCountdown(true);
            phaseRef.current = 'PLAYING';
            setPhase('PLAYING');
            countdownTimerRef.current = window.setTimeout(() => {
              setCountdownStep('');
              setMmMatchedOpponent(null);
            }, 480);
          }
          flushLocalOnlineSync(true);
          break;
        }

        case 'match:resumed': {
          const myName = sanitizeNickname(nicknameRef.current, 'Player');
          rivalProfileLevelRef.current = ev.opponent.level >= 1 ? ev.opponent.level : 1;
          mmSessionRef.current = {
            matchId: ev.matchId,
            role: ev.role,
            nickname: myName,
            rivalName: ev.opponent.nickname || 'Opponent',
            rivalLevel: rivalProfileLevelRef.current,
            roundNumber: ev.roundNumber,
            matchStartAtMs: ev.matchStartAtMs,
            durationMs: ev.durationMs,
          };
          setConfig((prev) => ({ ...prev, mode: 'quick_match', matchType: ev.matchType }));
          configRef.current = {
            ...configRef.current,
            mode: 'quick_match',
            matchType: ev.matchType,
          };
          p1Ref.current.stats.kos = ev.myKos;
          p1Ref.current.stats.score = Math.max(p1Ref.current.stats.score, ev.myScore);
          const p2 = p2Ref.current;
          p2.label = ev.opponent.nickname || 'Opponent';
          decodeVisibleGridIntoBoard(ev.opponent.snapshot.grid, p2);
          p2.active = {
            type: ev.opponent.snapshot.activeType,
            rotation: ev.opponent.snapshot.activeRot,
            x: ev.opponent.snapshot.activeX,
            y: ev.opponent.snapshot.activeY,
          };
          p2.hold = ev.opponent.snapshot.hold ? ev.opponent.snapshot.hold : null;
          p2.holdUsed = ev.opponent.snapshot.holdUsed;
          p2.queue = decodeNext3Pieces(ev.opponent.snapshot.next3);
          p2.combo = ev.opponent.snapshot.combo;
          p2.stats = {
            score: ev.opponent.snapshot.score,
            level: ev.opponent.snapshot.level,
            kos: ev.opponent.snapshot.kos,
            linesCleared: ev.opponent.snapshot.linesCleared,
            maxCombo: ev.opponent.snapshot.maxCombo,
            garbageSent: ev.opponent.snapshot.garbageSent,
            quads: ev.opponent.snapshot.quads,
            piecesPlaced: ev.opponent.snapshot.piecesPlaced,
            bombChains: 0,
          };
          suddenDeathRef.current = ev.suddenDeath;
          setSuddenDeath(ev.suddenDeath);
          setOpponentNotice(null);
          setCountdownStep('');
          setMmMatchedOpponent(null);
          phaseRef.current = 'PLAYING';
          setPhase('PLAYING');
          syncHuds();
          flushLocalOnlineSync(true);
          break;
        }

        case 'opponent:state': {
          const session = mmSessionRef.current;
          if (!session || session.matchId !== ev.matchId || ev.roundNumber < session.roundNumber) {
            return;
          }
          const p2 = p2Ref.current;
          p2.label = ev.nickname || session.rivalName || 'Opponent';
          if (typeof ev.playerLevel === 'number' && ev.playerLevel >= 1) {
            rivalProfileLevelRef.current = ev.playerLevel;
          }
          const snap = ev.snapshot;
          decodeVisibleGridIntoBoard(snap.grid, p2);
          p2.active = {
            type: snap.activeType,
            rotation: snap.activeRot,
            x: snap.activeX,
            y: snap.activeY,
          };
          p2.hold = snap.hold ? snap.hold : null;
          p2.holdUsed = snap.holdUsed;
          p2.queue = decodeNext3Pieces(snap.next3);
          p2.combo = snap.combo;
          p2.stats = {
            score: snap.score,
            level: snap.level,
            kos: snap.kos,
            linesCleared: snap.linesCleared,
            maxCombo: snap.maxCombo,
            garbageSent: snap.garbageSent,
            quads: snap.quads,
            piecesPlaced: snap.piecesPlaced,
            bombChains: 0,
          };
          p2.incomingGarbage =
            snap.incomingTotal > 0
              ? [
                  {
                    id: 1,
                    lines: snap.incomingTotal,
                    gapCol: snap.nextGapCol >= 0 ? snap.nextGapCol : 4,
                    timerMs: snap.incomingReady > 0 ? 0 : 400,
                  },
                ]
              : [];

          if (phaseRef.current === 'PLAYING' && ev.garbageAttack > 0) {
            enqueueGarbage(p1Ref.current, ev.garbageAttack);
            soundEngine.playGarbageWarning();
            projectilesRef.current.push({
              id: projectileIdRef.current++,
              from: 'p2',
              to: 'p1',
              lines: ev.garbageAttack,
              progress: 0,
              durationMs: 460,
              arcHeight: 75 + Math.min(80, ev.garbageAttack * 14),
              color: themeRef.current.accentP2,
              startYNorm: 0.55,
            });
            pushFeed(
              'p2',
              ev.attackLabel || `${p2.label}: Attack (+${ev.garbageAttack})`
            );
          }

          if (phaseRef.current === 'PLAYING' && ev.bombBurstCount > 0) {
            soundEngine.playBombExplosion(ev.bombBurstCount);
            pushCallout(
              'p2',
              ev.bombBurstCount >= 2 ? 'CHAIN BLAST!' : 'BOMB CLEAR!',
              'bomb',
              ev.bombBurstCount >= 2 ? `${ev.bombBurstCount}x BOMBS CLEARED` : undefined
            );
          }

          syncHuds();
          break;
        }

        case 'ko:event': {
          const session = mmSessionRef.current;
          if (!session || session.matchId !== ev.matchId || ev.roundNumber !== session.roundNumber) {
            return;
          }
          const myKos = session.role === 'p1' ? ev.p1Kos : ev.p2Kos;
          const oppKos = session.role === 'p1' ? ev.p2Kos : ev.p1Kos;
          const myScore = session.role === 'p1' ? ev.p1Score : ev.p2Score;
          const oppScore = session.role === 'p1' ? ev.p2Score : ev.p1Score;

          p1Ref.current.stats.kos = myKos;
          p1Ref.current.stats.score = Math.max(p1Ref.current.stats.score, myScore);
          p2Ref.current.stats.kos = oppKos;
          p2Ref.current.stats.score = Math.max(p2Ref.current.stats.score, oppScore);

          if (ev.koVictimSlot !== session.role) {
            // Opponent got KO'd -> we scored a KO!
            spawnKOParticles(p2Ref.current);
            soundEngine.playKO();
            soundEngine.triggerHaptic([28, 30, 42]);
            pushCallout('p2', 'KO!', 'ko', 'Board Reset');
            pushCallout('p1', '+1 KO!', 'quad', '+1,000 PTS');
            pushFeed('p1', `${p1Ref.current.label} scored a KO!`);
          } else {
            // Local player got KO'd -> opponent scored a KO
            pushCallout('p2', '+1 KO!', 'quad', '+1,000 PTS');
            pushFeed('p2', `${p2Ref.current.label} scored a KO!`);
          }
          syncHuds();
          break;
        }

        case 'match:sudden_death': {
          const session = mmSessionRef.current;
          if (!session || session.matchId !== ev.matchId || ev.roundNumber !== session.roundNumber) {
            return;
          }
          if (!suddenDeathRef.current) {
            suddenDeathRef.current = true;
            setSuddenDeath(true);
            setClockDisplay('SD');
            soundEngine.playGarbageWarning();
            pushCallout('p1', 'SUDDEN DEATH!', 'ko', 'Next KO Wins');
            pushCallout('p2', 'SUDDEN DEATH!', 'ko', 'Next KO Wins');
            pushFeed('p1', 'Sudden Death — Next KO wins!');
          }
          break;
        }

        case 'opponent:reconnecting':
          setOpponentNotice(
            `${ev.opponentName} disconnected — waiting ${Math.max(1, Math.round(ev.graceMs / 1000))}s to reconnect...`
          );
          break;

        case 'opponent:reconnected':
          setOpponentNotice(null);
          pushFeed('p2', `${ev.opponentName} reconnected!`);
          break;

        case 'match:abandoned':
          if (countdownTimerRef.current !== null) {
            window.clearTimeout(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          mmSessionRef.current = null;
          mmSyncMetaRef.current = createQuickMatchSyncMeta();
          setCountdownStep('');
          setMmMatchedOpponent(null);
          setOpponentNotice(null);
          setMmStatus('idle');
          setMmEnqueuedAtMs(null);
          setMmInfoNotice(`${ev.reason} No loss was recorded.`);
          phaseRef.current = 'MATCHMAKING';
          setPhase('MATCHMAKING');
          void refreshQuickMatchRecord();
          break;

        case 'match:finished': {
          const session = mmSessionRef.current;
          if (!session || session.matchId !== ev.matchId) return;
          if (countdownTimerRef.current !== null) {
            window.clearTimeout(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          setCountdownStep('');
          setMmMatchedOpponent(null);
          setOpponentNotice(null);
          setMmRematchState(ev.opponentConnected ? 'idle' : 'opponent_left');

          const serverP1Stats: PlayerStats = {
            score: ev.myStats.score,
            level: ev.myStats.level,
            kos: ev.myStats.kos,
            linesCleared: ev.myStats.linesCleared,
            maxCombo: ev.myStats.maxCombo,
            garbageSent: ev.myStats.garbageSent,
            quads: ev.myStats.quads,
            piecesPlaced: ev.myStats.piecesPlaced,
            bombChains: p1Ref.current.stats.bombChains,
          };
          const serverP2Stats: PlayerStats = {
            score: ev.opponentStats.score,
            level: ev.opponentStats.level,
            kos: ev.opponentStats.kos,
            linesCleared: ev.opponentStats.linesCleared,
            maxCombo: ev.opponentStats.maxCombo,
            garbageSent: ev.opponentStats.garbageSent,
            quads: ev.opponentStats.quads,
            piecesPlaced: ev.opponentStats.piecesPlaced,
            bombChains: 0,
          };
          p1Ref.current.stats = serverP1Stats;
          p2Ref.current.stats = serverP2Stats;
          syncHuds();

          const winnerOverride: PlayerId | 'draw' =
            ev.outcome === 'win' ? 'p1' : ev.outcome === 'loss' ? 'p2' : 'draw';

          finishMatch(ev.finishReason || 'Match Complete', undefined, {
            winnerOverride,
            p1Stats: serverP1Stats,
            p2Stats: serverP2Stats,
            durationMs: ev.durationMs,
          });
          void refreshQuickMatchRecord();
          break;
        }

        case 'rematch:status':
          if (ev.myReady) {
            setMmRematchState('waiting_for_rival');
          } else if (ev.opponentReady) {
            setMmRematchState('rival_ready');
          } else {
            setMmRematchState('idle');
          }
          break;

        case 'rematch:opponent_left':
        case 'rematch:expired':
          setMmRematchState('opponent_left');
          break;

        case 'auth:error':
          setMmStatus('error');
          setMmEnqueuedAtMs(null);
          setMmError(ev.message || 'Sign in required for 1v1 Online Matchmaking.');
          openAuthGate(
            'quick_match',
            ev.message || 'Please sign in to access 1v1 Online Matchmaking.'
          );
          break;

        case 'error':
          if (phaseRef.current === 'MATCHMAKING') {
            setMmError(ev.message);
            setMmStatus('error');
            setMmEnqueuedAtMs(null);
          }
          break;
      }
    },
    [
      finishMatch,
      flushLocalOnlineSync,
      openAuthGate,
      pushCallout,
      pushFeed,
      refreshQuickMatchRecord,
      spawnKOParticles,
      startQuickMatchCountdown,
      syncHuds,
    ]
  );

  mmEventHandlerRef.current = handleMatchmakingEvent;

  const ensureQuickMatchClient = useCallback((): MatchmakingSocketClient => {
    if (mmClientRef.current) return mmClientRef.current;
    const client = new MatchmakingSocketClient({
      onEvent: (ev) => mmEventHandlerRef.current(ev),
      onConnectionChange: (connStatus, detail) => {
        if (connStatus === 'disconnected') {
          if (phaseRef.current === 'MATCHMAKING') {
            setMmStatus('idle');
            setMmEnqueuedAtMs(null);
            if (detail) setMmError(detail);
          } else if (
            configRef.current.mode === 'quick_match' &&
            (phaseRef.current === 'PLAYING' || phaseRef.current === 'COUNTDOWN')
          ) {
            setOpponentNotice(detail || 'Connection lost — attempting to reconnect...');
          }
        } else if (connStatus === 'connecting' && detail) {
          if (configRef.current.mode === 'quick_match' && phaseRef.current === 'PLAYING') {
            setOpponentNotice(detail);
          }
        } else if (connStatus === 'connected') {
          if (configRef.current.mode === 'quick_match' && phaseRef.current === 'PLAYING') {
            setOpponentNotice(null);
          }
        }
      },
    });
    mmClientRef.current = client;
    return client;
  }, []);

  const handleStartQuickSearch = useCallback(
    async (overrideMatchType?: MatchConfig['matchType']) => {
      soundEngine.unlock();
      if (!isBrowserOnline) {
        setMmError(
          'You are offline. Automatic 1v1 Online Matchmaking requires an internet connection.'
        );
        setMmStatus('error');
        return;
      }

      const currentUser = authUserRef.current;
      if (!currentUser) {
        setMmStatus('idle');
        setMmEnqueuedAtMs(null);
        openAuthGate(
          'quick_match',
          'Sign in to enter Automatic 1v1 Online Matchmaking and record verified wins, losses, and rankings.'
        );
        return;
      }

      const cleanName = sanitizeNickname(nicknameRef.current, 'Player');
      handleChangeNickname(cleanName);
      const targetMatchType = overrideMatchType ?? configRef.current.matchType;

      setMmError(null);
      setMmInfoNotice(null);
      setMmMatchedOpponent(null);
      setMmStatus('connecting');

      try {
        const client = ensureQuickMatchClient();
        await client.connect({
          user: currentUser,
          nickname: cleanName,
          playerLevel: profileRef.current.level,
        });
        const sent = client.joinQueue({
          matchType: targetMatchType,
          nickname: cleanName,
          playerLevel: profileRef.current.level,
        });
        if (!sent) {
          throw new Error('Could not send matchmaking queue request.');
        }
      } catch (err) {
        setMmStatus('error');
        setMmEnqueuedAtMs(null);
        setMmError(
          err instanceof Error
            ? err.message
            : 'Unable to connect to the live 1v1 matchmaking server.'
        );
      }
    },
    [ensureQuickMatchClient, handleChangeNickname, isBrowserOnline, openAuthGate]
  );

  const handleOpenQuickMatch = useCallback(
    (autoSearch = true) => {
      soundEngine.unlock();
      if (!isBrowserOnline) {
        setOfflineOnlineNotice(
          'You are offline. Automatic 1v1 Online Matchmaking requires an internet connection — switch to 1 Player vs. AI or 2 Player Local to play offline right now.'
        );
        return;
      }
      if (!authUserRef.current) {
        openAuthGate(
          'quick_match',
          'Sign in to enter Automatic 1v1 Online Matchmaking and save your wins, losses, and rank.'
        );
        return;
      }
      setOfflineOnlineNotice(null);
      setMmError(null);
      setMmInfoNotice(null);
      setMmMatchedOpponent(null);
      setConfig((prev) => ({ ...prev, mode: 'quick_match' }));
      configRef.current = { ...configRef.current, mode: 'quick_match' };
      phaseRef.current = 'MATCHMAKING';
      setPhase('MATCHMAKING');
      void refreshQuickMatchRecord();
      if (autoSearch) {
        void handleStartQuickSearch(configRef.current.matchType);
      }
    },
    [handleStartQuickSearch, isBrowserOnline, openAuthGate, refreshQuickMatchRecord]
  );

  const handleOpenOnlineLobby = useCallback(() => {
    soundEngine.unlock();
    if (!isBrowserOnline) {
      setOfflineOnlineNotice(
        'You are offline. Online 1v1 Room Battle requires an internet connection — switch to 1 Player vs. AI or 2 Player Local to play offline right now.'
      );
      return;
    }
    if (!authUserRef.current) {
      openAuthGate(
        'online_room',
        'Sign in to create or join Private Online 1v1 Rooms with verified player accounts.'
      );
      return;
    }
    setOfflineOnlineNotice(null);
    setOnlineError(null);
    setConfig((prev) => ({ ...prev, mode: 'online_1v1' }));
    configRef.current = { ...configRef.current, mode: 'online_1v1' };
    phaseRef.current = 'ONLINE_LOBBY';
    setPhase('ONLINE_LOBBY');
  }, [isBrowserOnline, openAuthGate]);

  const handleAuthSuccess = useCallback(
    (user: User) => {
      const pending = authModalState.pendingAction;
      setAuthModalState({ open: false, reason: null, pendingAction: null });
      authUserRef.current = user;
      setAuthUser(user);

      if (pendingMarketplaceAuthResolveRef.current) {
        const resolve = pendingMarketplaceAuthResolveRef.current;
        pendingMarketplaceAuthResolveRef.current = null;
        resolve(true);
      }

      void hydrateAuthenticatedAccount(user).then(() => {
        if (pending === 'quick_match') {
          handleOpenQuickMatch(true);
        } else if (pending === 'online_room') {
          handleOpenOnlineLobby();
        } else if (pending === 'account') {
          setAccountModalOpen(true);
        }
      });
    },
    [
      authModalState.pendingAction,
      handleOpenOnlineLobby,
      handleOpenQuickMatch,
      hydrateAuthenticatedAccount,
    ]
  );

  const handleCloseAuthModal = useCallback(() => {
    setAuthModalState({ open: false, reason: null, pendingAction: null });
    if (pendingMarketplaceAuthResolveRef.current) {
      const resolve = pendingMarketplaceAuthResolveRef.current;
      pendingMarketplaceAuthResolveRef.current = null;
      resolve(false);
    }
  }, []);

  const handleSavePlayerIdentity = useCallback(
    async (updates: {
      username: string;
      avatarId: AvatarId;
    }): Promise<{ ok: boolean; message?: string }> => {
      const currentUser = authUserRef.current;
      if (!currentUser) {
        return { ok: false, message: 'Please sign in to update your profile.' };
      }
      const res = await updateServerPlayerIdentity(currentUser, updates);
      if (!res.ok) {
        return { ok: false, message: res.message };
      }
      const synced = await syncProfileWithFirestore(currentUser, res.profile, mmRecordRef.current);
      applyCloudProfileToLocal(synced);
      return { ok: true };
    },
    [applyCloudProfileToLocal]
  );

  const handleProvidersChanged = useCallback(async () => {
    const currentUser = auth.currentUser ?? authUserRef.current;
    if (!currentUser) return;
    await currentUser.reload();
    await currentUser.getIdToken(true);
    setAuthUser(auth.currentUser);
    authUserRef.current = auth.currentUser;
    if (auth.currentUser) {
      await hydrateAuthenticatedAccount(auth.currentUser);
    }
  }, [hydrateAuthenticatedAccount]);

  const handleSignOut = useCallback(async () => {
    setAccountModalOpen(false);
    cleanupQuickMatchSession(true);
    cleanupOnlineSession(true);
    await signOutPlayer();
    phaseRef.current = 'TITLE';
    setPhase('TITLE');
  }, [cleanupOnlineSession, cleanupQuickMatchSession]);

  const handleCancelQuickSearch = useCallback(() => {
    mmClientRef.current?.cancelQueue();
    setMmStatus('idle');
    setMmEnqueuedAtMs(null);
    setMmError(null);
  }, []);

  const handleQuickMatchRematch = useCallback(() => {
    const session = mmSessionRef.current;
    const client = mmClientRef.current;
    if (!session || !client || !client.isConnected()) {
      setMmRematchState('opponent_left');
      return;
    }
    const sent = client.requestRematch(session.matchId);
    if (sent) {
      setMmRematchState('waiting_for_rival');
    } else {
      setMmRematchState('opponent_left');
    }
  }, []);

  const handleFindNewOpponent = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    // Keep socket open if possible, just disconnect cleanly and reconnect fresh
    cleanupQuickMatchSession(false);
    setSummary(null);
    phaseRef.current = 'MATCHMAKING';
    setPhase('MATCHMAKING');
    void refreshQuickMatchRecord();
    void handleStartQuickSearch(configRef.current.matchType);
  }, [cleanupQuickMatchSession, handleStartQuickSearch, refreshQuickMatchRecord]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleTogglePause = useCallback(() => {
    if (configRef.current.mode === 'online_1v1' || configRef.current.mode === 'quick_match') {
      return;
    }
    if (phaseRef.current === 'PLAYING') {
      phaseRef.current = 'PAUSED';
      setPhase('PAUSED');
      p1KeysRef.current = createKeyHoldState();
      p2KeysRef.current = createKeyHoldState();
    } else if (phaseRef.current === 'PAUSED') {
      phaseRef.current = 'PLAYING';
      setPhase('PLAYING');
    }
  }, []);

  const handleBackToMenu = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    cleanupOnlineSession(true);
    cleanupQuickMatchSession(true);
    phaseRef.current = 'TITLE';
    setPhase('TITLE');
    setSummary(null);
    setOnlineError(null);
    setMmError(null);
    setMmInfoNotice(null);
    p1KeysRef.current = createKeyHoldState();
    p2KeysRef.current = createKeyHoldState();
  }, [cleanupOnlineSession, cleanupQuickMatchSession]);

  const handleCancelWaitingRoom = useCallback(() => {
    cleanupOnlineSession(true);
    setOnlineError(null);
  }, [cleanupOnlineSession]);

  // Keyboard bindings (1P vs AI, Online 1v1, & 2P Local Split Keyboard)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        phaseRef.current === 'TITLE' ||
        phaseRef.current === 'ONLINE_LOBBY' ||
        phaseRef.current === 'MATCHMAKING' ||
        phaseRef.current === 'SUMMARY'
      ) {
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (
          configRef.current.mode !== 'online_1v1' &&
          configRef.current.mode !== 'quick_match' &&
          (phaseRef.current === 'PLAYING' || phaseRef.current === 'PAUSED')
        ) {
          e.preventDefault();
          handleTogglePause();
        }
        return;
      }

      if (phaseRef.current !== 'PLAYING') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }
        return;
      }

      const mode = configRef.current.mode;
      const p1k = p1KeysRef.current;
      const p2k = p2KeysRef.current;

      if (mode === 'vs_ai' || mode === 'online_1v1' || mode === 'quick_match') {
        // Player 1 exact bindings: Arrows, Up/X CW, Z CCW, Space Hard Drop, C/Shift Hold
        switch (e.code) {
          case 'ArrowLeft':
            e.preventDefault();
            if (!e.repeat && !p1k.left) {
              p1k.left = true;
              p1k.dir = -1;
              p1k.dasMs = 0;
              p1k.arrMs = 0;
              performPlayerAction('p1', 'left');
            }
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (!e.repeat && !p1k.right) {
              p1k.right = true;
              p1k.dir = 1;
              p1k.dasMs = 0;
              p1k.arrMs = 0;
              performPlayerAction('p1', 'right');
            }
            break;
          case 'ArrowDown':
            e.preventDefault();
            if (!e.repeat && !p1k.down) {
              p1k.down = true;
              p1k.softDropMs = 0;
              performPlayerAction('p1', 'down');
            }
            break;
          case 'ArrowUp':
          case 'KeyX':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'rotateCW');
            break;
          case 'KeyZ':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'rotateCCW');
            break;
          case 'Space':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'hardDrop');
            break;
          case 'KeyC':
          case 'ShiftLeft':
          case 'ShiftRight':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'hold');
            break;
        }
      } else {
        // 2-Player Local Split Keyboard
        // P1: A/D move, S soft drop, W rotate CW, Q rotate CCW, Space hard drop, C / ShiftLeft hold
        // P2: Arrows move/soft/CW, Slash/Numpad0 rotate CCW, Enter hard drop, ShiftRight/Period hold
        switch (e.code) {
          case 'KeyA':
            e.preventDefault();
            if (!e.repeat && !p1k.left) {
              p1k.left = true;
              p1k.dir = -1;
              p1k.dasMs = 0;
              p1k.arrMs = 0;
              performPlayerAction('p1', 'left');
            }
            break;
          case 'KeyD':
            e.preventDefault();
            if (!e.repeat && !p1k.right) {
              p1k.right = true;
              p1k.dir = 1;
              p1k.dasMs = 0;
              p1k.arrMs = 0;
              performPlayerAction('p1', 'right');
            }
            break;
          case 'KeyS':
            e.preventDefault();
            if (!e.repeat && !p1k.down) {
              p1k.down = true;
              p1k.softDropMs = 0;
              performPlayerAction('p1', 'down');
            }
            break;
          case 'KeyW':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'rotateCW');
            break;
          case 'KeyQ':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'rotateCCW');
            break;
          case 'Space':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'hardDrop');
            break;
          case 'KeyC':
          case 'ShiftLeft':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p1', 'hold');
            break;

          // Player 2
          case 'ArrowLeft':
            e.preventDefault();
            if (!e.repeat && !p2k.left) {
              p2k.left = true;
              p2k.dir = -1;
              p2k.dasMs = 0;
              p2k.arrMs = 0;
              performPlayerAction('p2', 'left');
            }
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (!e.repeat && !p2k.right) {
              p2k.right = true;
              p2k.dir = 1;
              p2k.dasMs = 0;
              p2k.arrMs = 0;
              performPlayerAction('p2', 'right');
            }
            break;
          case 'ArrowDown':
            e.preventDefault();
            if (!e.repeat && !p2k.down) {
              p2k.down = true;
              p2k.softDropMs = 0;
              performPlayerAction('p2', 'down');
            }
            break;
          case 'ArrowUp':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p2', 'rotateCW');
            break;
          case 'Slash':
          case 'Numpad0':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p2', 'rotateCCW');
            break;
          case 'Enter':
          case 'NumpadEnter':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p2', 'hardDrop');
            break;
          case 'ShiftRight':
          case 'Period':
            e.preventDefault();
            if (!e.repeat) performPlayerAction('p2', 'hold');
            break;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const mode = configRef.current.mode;
      const p1k = p1KeysRef.current;
      const p2k = p2KeysRef.current;

      const releaseLeft = (k: KeyHoldState) => {
        k.left = false;
        k.dir = k.right ? 1 : 0;
        k.dasMs = 0;
        k.arrMs = 0;
      };
      const releaseRight = (k: KeyHoldState) => {
        k.right = false;
        k.dir = k.left ? -1 : 0;
        k.dasMs = 0;
        k.arrMs = 0;
      };

      if (mode === 'vs_ai' || mode === 'online_1v1' || mode === 'quick_match') {
        if (e.code === 'ArrowLeft') releaseLeft(p1k);
        if (e.code === 'ArrowRight') releaseRight(p1k);
        if (e.code === 'ArrowDown') p1k.down = false;
      } else {
        if (e.code === 'KeyA') releaseLeft(p1k);
        if (e.code === 'KeyD') releaseRight(p1k);
        if (e.code === 'KeyS') p1k.down = false;
        if (e.code === 'ArrowLeft') releaseLeft(p2k);
        if (e.code === 'ArrowRight') releaseRight(p2k);
        if (e.code === 'ArrowDown') p2k.down = false;
      }
    };

    const onBlur = () => {
      p1KeysRef.current = createKeyHoldState();
      p2KeysRef.current = createKeyHoldState();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleTogglePause, performPlayerAction]);

  // Main 60fps simulation loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastClockSec = -1;
    let hudSyncAcc = 0;

    const tickKeyRepeat = (playerId: PlayerId, keys: KeyHoldState, dtMs: number) => {
      if (keys.dir !== 0) {
        keys.dasMs += dtMs;
        if (keys.dasMs >= DAS_MS) {
          keys.arrMs += dtMs;
          while (keys.arrMs >= ARR_MS) {
            keys.arrMs -= ARR_MS;
            performPlayerAction(playerId, keys.dir === -1 ? 'left' : 'right');
          }
        }
      }
      if (keys.down) {
        keys.softDropMs += dtMs;
        while (keys.softDropMs >= SOFT_DROP_INTERVAL_MS) {
          keys.softDropMs -= SOFT_DROP_INTERVAL_MS;
          performPlayerAction(playerId, 'down');
        }
      }
    };

    const tickBoardPhysics = (
      board: PlayerBoardState,
      opponent: PlayerBoardState,
      gravityMs: number,
      dtMs: number
    ) => {
      tickGarbageTelegraph(board, dtMs);

      const grounded = isPieceGrounded(board.grid, board.active);
      board.isGrounded = grounded;

      if (!grounded) {
        board.gravityAccMs += dtMs;
        while (board.gravityAccMs >= gravityMs) {
          board.gravityAccMs -= gravityMs;
          if (!tryMovePiece(board, 0, 1)) {
            board.isGrounded = true;
            break;
          }
        }
      } else {
        board.lockTimerMs += dtMs;
        if (board.lockTimerMs >= LOCK_DELAY_MS) {
          const result = lockActivePiece(board);
          processLockOutcome(board, opponent, result);
        }
      }
    };

    const tickBoardVFX = (
      board: PlayerBoardState,
      container: HTMLDivElement | null,
      dtMs: number
    ) => {
      const dtSec = dtMs / 1000;

      // Smooth shake decay applied directly to DOM transform (compositor-only, zero React churn)
      if (board.shakeTimerMs > 0) {
        board.shakeTimerMs = Math.max(0, board.shakeTimerMs - dtMs);
        const factor = board.shakeTimerMs / 180;
        const sx = (Math.random() * 2 - 1) * board.shakeX * Math.min(1, factor);
        const sy =
          board.shakeX > 0
            ? (Math.random() * 2 - 1) * board.shakeY * Math.min(1, factor)
            : board.shakeY * Math.min(1, factor);
        if (container) {
          container.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
        }
        if (board.shakeTimerMs === 0) {
          board.shakeX = 0;
          board.shakeY = 0;
          if (container) container.style.transform = 'translate3d(0px, 0px, 0px)';
        }
      }

      if (board.koFlashAlpha > 0) {
        board.koFlashAlpha = Math.max(0, board.koFlashAlpha - dtSec * 1.9);
      }

      for (let i = board.hardDropTrails.length - 1; i >= 0; i--) {
        board.hardDropTrails[i].alpha -= dtSec * 4.2;
        if (board.hardDropTrails[i].alpha <= 0) board.hardDropTrails.splice(i, 1);
      }

      for (let i = board.clearFlashes.length - 1; i >= 0; i--) {
        board.clearFlashes[i].alpha -= dtSec * 4.5;
        if (board.clearFlashes[i].alpha <= 0) board.clearFlashes.splice(i, 1);
      }

      for (let i = board.particles.length - 1; i >= 0; i--) {
        const p = board.particles[i];
        p.life += dtSec;
        p.x += p.vx * dtSec;
        p.y += p.vy * dtSec;
        p.vy += 18 * dtSec; // gravity
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (p.life >= p.maxLife) board.particles.splice(i, 1);
      }
    };

    const tickAI = (dtMs: number) => {
      if (configRef.current.mode !== 'vs_ai') return;
      const aiBoard = p2Ref.current;
      const p1Board = p1Ref.current;
      const profile = AI_PROFILES[configRef.current.difficulty];

      if (aiThinkWaitRef.current > 0) {
        aiThinkWaitRef.current -= dtMs;
        return;
      }

      if (!aiPlanRef.current) {
        aiPlanRef.current = computeAIPlan(aiBoard, configRef.current.difficulty);
        aiActionAccRef.current = 0;
      }

      const plan = aiPlanRef.current;
      aiActionAccRef.current += dtMs;
      if (aiActionAccRef.current < profile.actionIntervalMs) return;
      aiActionAccRef.current -= profile.actionIntervalMs;

      // Step 1: Hold if planned
      if (plan.useHold && !plan.executedHold) {
        plan.executedHold = true;
        if (tryHoldPiece(aiBoard)) {
          syncHuds();
          return;
        }
      }

      // Step 2: Rotate toward target orientation
      if (aiBoard.active.rotation !== plan.targetRotation) {
        const diff = (plan.targetRotation - aiBoard.active.rotation + 4) % 4;
        const dir: 1 | -1 = diff === 3 ? -1 : 1;
        const rotated = tryRotatePiece(aiBoard, dir);
        if (!rotated) {
          // Unable to rotate due to obstruction -> lock immediately to avoid stall
          const { result } = performHardDrop(aiBoard);
          processLockOutcome(aiBoard, p1Board, result);
        }
        return;
      }

      // Step 3: Shift horizontally toward target X
      if (aiBoard.active.x !== plan.targetX) {
        const dx = aiBoard.active.x < plan.targetX ? 1 : -1;
        const moved = tryMovePiece(aiBoard, dx, 0);
        if (!moved) {
          const { result } = performHardDrop(aiBoard);
          processLockOutcome(aiBoard, p1Board, result);
        }
        return;
      }

      // Step 4: Aligned -> Hard Drop!
      const { result } = performHardDrop(aiBoard);
      processLockOutcome(aiBoard, p1Board, result);
    };

    const step = (now: number) => {
      const dtMs = Math.min(50, Math.max(0, now - lastTime));
      lastTime = now;

      if (phaseRef.current === 'PLAYING') {
        const cfg = configRef.current;
        const isRoomOnline = cfg.mode === 'online_1v1';
        const isQuickMatch = cfg.mode === 'quick_match';
        const isOnline = isRoomOnline || isQuickMatch;
        const session = onlineSessionRef.current;
        const mmSession = mmSessionRef.current;

        if (isQuickMatch && mmSession && mmSession.matchStartAtMs > 0) {
          const offset = mmClientRef.current?.serverClockOffsetMs ?? 0;
          elapsedMsRef.current = Math.max(0, Date.now() + offset - mmSession.matchStartAtMs);
        } else if (isRoomOnline && session && session.matchStartAtMs > 0) {
          elapsedMsRef.current = Math.max(0, Date.now() - session.matchStartAtMs);
        } else {
          elapsedMsRef.current += dtMs;
        }

        // Clock & Sudden Death check
        if (cfg.matchType === 'ko_2min') {
          const remaining = MATCH_DURATION_MS - elapsedMsRef.current;
          if (remaining <= 0) {
            if (!suddenDeathRef.current) {
              if (isQuickMatch) {
                // Server authoritatively emits match:finished or match:sudden_death
                setClockDisplay('0:00');
              } else if (p1Ref.current.stats.kos !== p2Ref.current.stats.kos) {
                setClockDisplay('0:00');
                if (isRoomOnline && session) {
                  // Host resolves authoritatively; guest acts as 1.5s fallback
                  if (session.role === 'host' || remaining < -1500) {
                    const p1Won = p1Ref.current.stats.kos > p2Ref.current.stats.kos;
                    const winnerRole = p1Won
                      ? session.role
                      : session.role === 'host'
                        ? 'guest'
                        : 'host';
                    void finishOnlineRoom(
                      session.roomCode,
                      winnerRole,
                      'Time Expired · Most KOs'
                    );
                    finishMatch('Time Expired · Most KOs', p1Won ? 'p1' : 'p2');
                  }
                } else {
                  finishMatch('Time Expired · Most KOs');
                }
              } else {
                // Tied at 0:00 -> Sudden Death!
                suddenDeathRef.current = true;
                setSuddenDeath(true);
                setClockDisplay('SD');
                soundEngine.playGarbageWarning();
                pushCallout('p1', 'SUDDEN DEATH!', 'ko', 'Next KO Wins');
                pushCallout('p2', 'SUDDEN DEATH!', 'ko', 'Next KO Wins');
                pushFeed('p1', 'Sudden Death — Next KO wins!');
                if (isRoomOnline && session && session.role === 'host') {
                  void triggerRoomSuddenDeath(session.roomCode);
                }
              }
            }
          } else {
            const sec = Math.ceil(remaining / 1000);
            if (sec !== lastClockSec) {
              lastClockSec = sec;
              setClockDisplay(formatClock(remaining));
            }
          }
        } else {
          const sec = Math.floor(elapsedMsRef.current / 1000);
          if (sec !== lastClockSec) {
            lastClockSec = sec;
            setClockDisplay(formatElapsed(elapsedMsRef.current));
          }
        }

        if (phaseRef.current === 'PLAYING') {
          // Input DAS/ARR
          tickKeyRepeat('p1', p1KeysRef.current, dtMs);
          if (cfg.mode === 'local_2p') {
            tickKeyRepeat('p2', p2KeysRef.current, dtMs);
          } else if (cfg.mode === 'vs_ai') {
            tickAI(dtMs);
          }

          // Gravity & Lock delay per player's level
          const p1Gravity = getGravityMs(
            p1Ref.current.stats.level,
            elapsedMsRef.current,
            suddenDeathRef.current
          );
          const prevY = p1Ref.current.active.y;
          tickBoardPhysics(p1Ref.current, p2Ref.current, p1Gravity, dtMs);
          if (isOnline && p1Ref.current.active.y !== prevY) {
            onlineDirtyRef.current = true;
          }

          if (!isOnline && phaseRef.current === 'PLAYING') {
            const p2Gravity = getGravityMs(
              p2Ref.current.stats.level,
              elapsedMsRef.current,
              suddenDeathRef.current
            );
            tickBoardPhysics(p2Ref.current, p1Ref.current, p2Gravity, dtMs);
          }

          // Quick Match real-time WebSocket state flush
          if (isQuickMatch && mmSession) {
            if (onlineDirtyRef.current) {
              flushLocalOnlineSync(false);
            }
          }

          // Private Room Firestore throttled state flush + heartbeat + disconnect monitor
          if (isRoomOnline && session) {
            if (onlineDirtyRef.current) {
              flushLocalOnlineSync(false);
            }
            if (now - lastHeartbeatAtRef.current >= 3000) {
              lastHeartbeatAtRef.current = now;
              void pushPlayerHeartbeat(session.roomCode, session.role);
            }
            const silentMs = Date.now() - onlineSyncMetaRef.current.lastRemoteHeartbeatAt;
            if (silentMs > 13000) {
              const reason = `${p2Ref.current.label} Disconnected`;
              void finishOnlineRoom(session.roomCode, session.role, reason);
              finishMatch(reason, 'p1');
            } else if (silentMs > 6500) {
              setOpponentNotice(`${p2Ref.current.label} reconnecting...`);
            }
          }

          // Update flying projectiles
          const projs = projectilesRef.current;
          for (let i = projs.length - 1; i >= 0; i--) {
            projs[i].progress += dtMs / projs[i].durationMs;
            if (projs[i].progress >= 1) {
              projs.splice(i, 1);
            }
          }

          // Periodically sync HUD so telegraph -> ready garbage meter updates smoothly
          hudSyncAcc += dtMs;
          if (hudSyncAcc >= 140) {
            hudSyncAcc = 0;
            if (
              getTotalIncomingGarbage(p1Ref.current) > 0 ||
              getTotalIncomingGarbage(p2Ref.current) > 0
            ) {
              syncHuds();
            }
          }
        }
      }

      // Always decay VFX smoothly even right after match end
      tickBoardVFX(p1Ref.current, p1BoardElRef.current, dtMs);
      tickBoardVFX(p2Ref.current, p2BoardElRef.current, dtMs);

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [
    finishMatch,
    flushLocalOnlineSync,
    performPlayerAction,
    processLockOutcome,
    pushCallout,
    pushFeed,
    syncHuds,
  ]);

  const ownedPremiumSkinsCount = PREMIUM_SKIN_CATALOG.filter((s) =>
    skinInventory.ownedSkinIds.includes(s.id)
  ).length;

  const accountAndAuthModals = (
    <>
      {authModalState.open && (
        <AuthModal
          theme={theme}
          reason={authModalState.reason}
          hasGuestProgress={hasGuestProgressToMigrate(profile)}
          onSuccess={handleAuthSuccess}
          onClose={handleCloseAuthModal}
        />
      )}
      {accountModalOpen && authUser && (
        <PlayerAccountModal
          theme={theme}
          user={authUser}
          cloudProfile={cloudProfile}
          onlineRecord={mmRecord}
          onlineHistory={mmHistory}
          onSaveIdentity={handleSavePlayerIdentity}
          onProvidersChanged={handleProvidersChanged}
          onSignOut={handleSignOut}
          onClose={() => setAccountModalOpen(false)}
        />
      )}
    </>
  );

  if (phase === 'TITLE') {
    return (
      <>
        <StartScreen
          config={config}
          profile={profile}
          isSignedIn={Boolean(authUser)}
          equippedSkinId={skinInventory.equippedSkinId}
          ownedSkinsCount={ownedPremiumSkinsCount}
          reducedEffects={skinInventory.reducedEffects}
          onOpenAuth={() => {
            soundEngine.unlock();
            openAuthGate(
              null,
              'Sign in to sync your profile across devices, unlock your Permanent Player ID, and play 1v1 Online.'
            );
          }}
          onOpenAccount={() => {
            soundEngine.unlock();
            if (authUserRef.current) {
              setAccountModalOpen(true);
            } else {
              openAuthGate(
                'account',
                'Sign in to view your Permanent Player ID, customize your Arena Crest, and sync progress across devices.'
              );
            }
          }}
          onOpenShop={() => {
            soundEngine.unlock();
            setShopOpen(true);
          }}
          onPlayOnlineQuickMatch={() => handleOpenQuickMatch(true)}
          onChangeConfig={(next) => {
            setConfig(next);
            if (next.mode !== 'online_1v1' && next.mode !== 'quick_match') {
              setOfflineOnlineNotice(null);
            }
          }}
          onStart={() => {
            if (config.mode === 'quick_match') {
              handleOpenQuickMatch(true);
            } else if (config.mode === 'online_1v1') {
              handleOpenOnlineLobby();
            } else {
              setOfflineOnlineNotice(null);
              startMatch(config);
            }
          }}
          muted={muted}
          onToggleMute={handleToggleMute}
          offlineOnlineNotice={offlineOnlineNotice}
        />
        {shopOpen && (
          <SkinShopModal
            theme={theme}
            inventory={skinInventory}
            gatewayConfigured={gatewayConfigured}
            isSignedIn={Boolean(authUser)}
            userEmail={authUser?.email ?? authUser?.phoneNumber ?? null}
            paymentBanner={paymentBanner}
            onDismissBanner={() => setPaymentBanner(null)}
            onSignIn={handleMarketplaceSignIn}
            onRequestPurchase={handleRequestPurchase}
            onEquipSkin={handleEquipSkin}
            onToggleReducedEffects={handleToggleReducedEffects}
            onClose={() => setShopOpen(false)}
          />
        )}
        {accountAndAuthModals}
      </>
    );
  }

  if (phase === 'MATCHMAKING') {
    return (
      <>
        <MatchmakingScreen
          theme={theme}
          status={mmStatus}
          matchType={config.matchType}
          onChangeMatchType={(matchType) => {
            setConfig((prev) => ({ ...prev, matchType }));
            configRef.current = { ...configRef.current, matchType };
          }}
          nickname={nickname}
          playerLevel={profile.level}
          onChangeNickname={handleChangeNickname}
          enqueuedAtMs={mmEnqueuedAtMs}
          matchedOpponent={mmMatchedOpponent}
          error={mmError}
          infoNotice={mmInfoNotice}
          isBrowserOnline={isBrowserOnline}
          record={mmRecord}
          history={mmHistory}
          muted={muted}
          onToggleMute={handleToggleMute}
          onStartSearch={() => void handleStartQuickSearch()}
          onCancelSearch={handleCancelQuickSearch}
          onOpenPrivateRoom={() => {
            cleanupQuickMatchSession(false);
            handleOpenOnlineLobby();
          }}
          onBack={handleBackToMenu}
        />
        {accountAndAuthModals}
      </>
    );
  }

  if (phase === 'ONLINE_LOBBY') {
    return (
      <>
        <OnlineLobbyScreen
          theme={theme}
          matchType={config.matchType}
          onChangeMatchType={(matchType) => setConfig((prev) => ({ ...prev, matchType }))}
          nickname={nickname}
          playerLevel={profile.level}
          onChangeNickname={handleChangeNickname}
          waitingRoomCode={waitingRoomCode}
          busy={onlineBusy}
          isOnline={isBrowserOnline}
          error={onlineError}
          muted={muted}
          onToggleMute={handleToggleMute}
          onCreateRoom={() => void handleCreateOnlineRoom()}
          onJoinRoom={(code) => void handleJoinOnlineRoom(code)}
          onCancelWaiting={handleCancelWaitingRoom}
          onBack={handleBackToMenu}
        />
        {accountAndAuthModals}
      </>
    );
  }

  const p1Callouts = callouts.filter((c) => c.playerId === 'p1');
  const p2Callouts = callouts.filter((c) => c.playerId === 'p2');
  const controlsDisabled = phase !== 'PLAYING';
  const isMobileLayout = layoutMode !== 'desktop';
  const isQuickMatch = config.mode === 'quick_match';
  const isOnlineMode = config.mode === 'online_1v1' || isQuickMatch;
  const activeRoomCode = onlineSessionRef.current?.roomCode ?? null;

  const onlineRematchState: OnlineRematchState = (() => {
    if (isQuickMatch) {
      return mmRematchState;
    }
    if (!isOnlineMode || !onlineRoom || !onlineSessionRef.current) return 'idle';
    if (onlineRoom.status === 'abandoned' || !onlineSyncMetaRef.current.remoteConnected) {
      return 'opponent_left';
    }
    const myVoted =
      onlineSessionRef.current.role === 'host'
        ? onlineRoom.hostRematch
        : onlineRoom.guestRematch;
    const rivalVoted =
      onlineSessionRef.current.role === 'host'
        ? onlineRoom.guestRematch
        : onlineRoom.hostRematch;
    if (myVoted) return 'waiting_for_rival';
    if (rivalVoted) return 'rival_ready';
    return 'idle';
  })();

  const handleFinishEndless = () => {
    if (isQuickMatch && mmSessionRef.current) {
      mmClientRef.current?.sendEndlessFinish(mmSessionRef.current.matchId);
      return;
    }
    if (config.mode === 'online_1v1' && onlineSessionRef.current) {
      const session = onlineSessionRef.current;
      const p1Kos = p1Ref.current.stats.kos;
      const p2Kos = p2Ref.current.stats.kos;
      const winnerRole =
        p1Kos === p2Kos
          ? 'draw'
          : p1Kos > p2Kos
            ? session.role
            : session.role === 'host'
              ? 'guest'
              : 'host';
      void finishOnlineRoom(session.roomCode, winnerRole, 'Endless Survival Completed');
    }
    finishMatch('Endless Survival Completed');
  };

  const sharedOverlays = (
    <>
      {/* Opponent Connection Warning Banner */}
      {isOnlineMode && opponentNotice && phase === 'PLAYING' && (
        <div className="pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-40">
          <div
            className="px-3.5 py-1.5 rounded-lg border flex items-center gap-2 text-xs font-semibold shadow-lg"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.warning,
              color: theme.warning,
            }}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>{opponentNotice}</span>
          </div>
        </div>
      )}

      {/* Opponent Found + Synchronized Countdown Overlay */}
      {countdownStep && (
        <div className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 px-4">
          {isQuickMatch && mmMatchedOpponent && (
            <div
              className="rounded-xl border px-4 py-2.5 text-center shadow-xl"
              style={{
                backgroundColor: theme.surfaceBg,
                borderColor: theme.accentPrimary,
                boxShadow: theme.blockGlow ? `0 0 24px ${theme.accentPrimary}33` : undefined,
              }}
            >
              <div
                className="text-[10px] font-bold tracking-widest uppercase"
                style={{ color: theme.accentPrimary }}
              >
                {mmMatchedOpponent.roundNumber > 1
                  ? `Rematch · Round ${mmMatchedOpponent.roundNumber}`
                  : 'Opponent Found'}
              </div>
              <div className="font-display text-sm sm:text-base font-bold mt-0.5">
                <span style={{ color: theme.accentP1 }}>{p1Ref.current.label}</span>
                <span className="mx-2" style={{ color: theme.textMuted }}>
                  vs
                </span>
                <span style={{ color: theme.accentP2 }}>{mmMatchedOpponent.nickname}</span>
                <span className="ml-2 text-xs font-mono-num" style={{ color: theme.textMuted }}>
                  Lv.{mmMatchedOpponent.level}
                </span>
              </div>
            </div>
          )}
          <div
            key={countdownStep}
            className="animate-countdown font-display text-6xl sm:text-8xl font-bold tracking-wider select-none"
            style={{
              color: countdownStep === 'CLASH!' ? theme.accentPrimary : theme.textPrimary,
              textShadow: theme.isDark
                ? `0 6px 32px rgba(0,0,0,0.9), 0 0 28px ${theme.accentPrimary}66`
                : '0 4px 20px rgba(255,255,255,0.95)',
            }}
          >
            {countdownStep}
          </div>
        </div>
      )}

      {/* Pause Overlay (local modes only) */}
      {phase === 'PAUSED' && !isOnlineMode && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4"
          style={{
            backgroundColor: theme.isDark ? 'rgba(4, 7, 15, 0.78)' : 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-6 text-center space-y-5"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.borderStrong,
            }}
          >
            <h2 className="font-display text-2xl font-bold">Match Paused</h2>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleTogglePause}
                className="h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: theme.accentPrimary,
                  color: theme.accentPrimaryText,
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Match</span>
              </button>
              <button
                type="button"
                onClick={() => startMatch(config)}
                className="h-12 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                  color: theme.textPrimary,
                }}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Match</span>
              </button>
              <button
                type="button"
                onClick={handleBackToMenu}
                className="h-12 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: theme.border,
                  color: theme.textSecondary,
                }}
              >
                <Home className="w-4 h-4" />
                <span>Back to Main Menu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End-of-Match Summary Modal */}
      {phase === 'SUMMARY' && summary && (
        <MatchSummaryModal
          winnerText={summary.winnerText}
          reasonText={summary.reasonText}
          durationText={summary.durationText}
          p1Label={p1Ref.current.label}
          p2Label={p2Ref.current.label}
          p1Stats={summary.p1Stats}
          p2Stats={summary.p2Stats}
          theme={theme}
          xpResult={summary.xpResult}
          isOnline={isOnlineMode}
          isQuickMatch={isQuickMatch}
          rematchState={onlineRematchState}
          onRematch={() => {
            if (isQuickMatch) {
              handleQuickMatchRematch();
            } else if (isOnlineMode) {
              void handleOnlineRematch();
            } else {
              startMatch(config);
            }
          }}
          onFindNewOpponent={isQuickMatch ? handleFindNewOpponent : undefined}
          onMainMenu={handleBackToMenu}
        />
      )}
    </>
  );

  // =========================================================================
  // 1. PORTRAIT PHONE MODE: P1 (~60% left) + RIVAL mini-board (~35% right)
  //    Top Timer/KO/Hold/Next bar + Bottom ~30% multi-touch thumb controls
  // =========================================================================
  if (layoutMode === 'portrait-mobile') {
    return (
      <div
        className="h-[100dvh] w-full flex flex-col overflow-hidden arena-touch-lock safe-area-top safe-area-bottom transition-colors duration-200"
        style={{ backgroundColor: theme.pageBg, color: theme.textPrimary }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Compact Mobile Top HUD: Timer, KO Counter, Audio, Pause, Menu */}
        <header
          className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 border-b shrink-0"
          style={{ borderColor: theme.border, backgroundColor: theme.surfaceBg }}
        >
          {/* KO Scoreboard */}
          <div className="flex items-center gap-1.5 font-mono-num text-xs font-bold shrink-0">
            <span style={{ color: theme.accentP1 }}>YOU {p1Hud.kos}</span>
            <span style={{ color: theme.textMuted }}>-</span>
            <span style={{ color: theme.accentP2 }}>{p2Hud.kos} RIVAL</span>
          </div>

          {/* Match Timer */}
          <div
            className="font-mono-num text-base font-bold tracking-tight px-2 py-0.5 rounded-md border"
            style={{
              backgroundColor: theme.surfaceElevated,
              borderColor: suddenDeath ? theme.danger : theme.border,
              color: suddenDeath ? theme.danger : theme.textPrimary,
            }}
          >
            {suddenDeath ? `SD ${clockDisplay}` : clockDisplay}
          </div>

          {/* Compact Utility Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleMute}
              className="h-9 w-9 rounded-lg border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: muted ? theme.danger : theme.border,
                color: muted ? theme.danger : theme.textPrimary,
              }}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {!isOnlineMode && (
              <button
                type="button"
                onClick={handleTogglePause}
                disabled={phase === 'COUNTDOWN' || phase === 'SUMMARY'}
                className="h-9 w-9 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-40"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                  color: theme.textPrimary,
                }}
                aria-label={phase === 'PAUSED' ? 'Resume' : 'Pause'}
              >
                {phase === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            )}
            {config.matchType === 'endless' && (
              <button
                type="button"
                onClick={handleFinishEndless}
                disabled={phase !== 'PLAYING'}
                className="h-9 w-9 rounded-lg border flex items-center justify-center cursor-pointer disabled:opacity-40"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                  color: theme.textPrimary,
                }}
                aria-label="Finish Match"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleBackToMenu}
              className="h-9 w-9 rounded-lg border flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.border,
                color: theme.textSecondary,
              }}
              aria-label={isOnlineMode ? 'Leave Room' : 'Main Menu'}
            >
              <Home className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* P1 Hold & Next 3 Strip + Live Attack Alert */}
        <div
          className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 border-b shrink-0"
          style={{ borderColor: theme.border, backgroundColor: theme.pageBg }}
        >
          {/* P1 Reserve */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border shrink-0"
            style={{ backgroundColor: theme.surfaceBg, borderColor: theme.border }}
          >
            <span className="text-[10px] font-bold tracking-wide" style={{ color: theme.textMuted }}>
              RES
            </span>
            <PiecePreviewCanvas
              piece={p1Hud.hold}
              theme={theme}
              skinId={skinInventory.equippedSkinId}
              reducedEffects={skinInventory.reducedEffects}
              cellSize={9}
              dimmed={p1Hud.holdUsed}
              width={40}
              height={24}
            />
          </div>

          {/* P1 Queue 3 */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg border shrink-0"
            style={{ backgroundColor: theme.surfaceBg, borderColor: theme.border }}
          >
            <span className="text-[10px] font-bold tracking-wide" style={{ color: theme.textMuted }}>
              QUEUE
            </span>
            {[0, 1, 2].map((idx) => (
              <PiecePreviewCanvas
                key={idx}
                piece={p1Hud.next3[idx] ?? null}
                theme={theme}
                skinId={skinInventory.equippedSkinId}
                reducedEffects={skinInventory.reducedEffects}
                cellSize={idx === 0 ? 9 : 7}
                width={idx === 0 ? 38 : 30}
                height={24}
              />
            ))}
          </div>

          {/* Live Attack / Combo Status */}
          <div className="flex-1 min-w-0 text-right">
            {latestAttackAlert ? (
              <div
                key={latestAttackAlert.id}
                className="font-display text-[11px] font-bold truncate"
                style={{
                  color: latestAttackAlert.actor === 'p1' ? theme.accentP1 : theme.accentP2,
                }}
              >
                {latestAttackAlert.text}
              </div>
            ) : (
              <div className="text-[10px] font-mono-num truncate" style={{ color: theme.textMuted }}>
                {p1Hud.combo >= 2 ? `${p1Hud.combo}x COMBO` : `Lv.${p1Hud.level}`}
              </div>
            )}
          </div>
        </div>

        {/* Middle Side-by-Side Battle Stage: YOU (~60%) | RIVAL (~35%) */}
        <main
          ref={arenaRef}
          className="relative flex-1 min-h-0 w-full px-2 py-1.5 flex items-center justify-center gap-2.5 overflow-hidden"
        >
          <ArenaVFXCanvas
            projectilesRef={projectilesRef}
            arenaRef={arenaRef}
            p1BoardElRef={p1BoardElRef}
            p2BoardElRef={p2BoardElRef}
            theme={theme}
          />

          <div className="flex items-start justify-center gap-2.5 max-w-full">
            {/* Left: Player 1 (Larger ~60%) */}
            <section aria-label="Player 1 Arena" className="shrink-0">
              <PlayerArenaPanel
                side="left"
                layout="compact"
                boardRef={p1Ref}
                boardContainerRef={p1BoardElRef}
                hud={p1Hud}
                callouts={p1Callouts}
                theme={theme}
                cellSize={p1CellSize}
                accentColor={theme.accentP1}
                skinId={skinInventory.equippedSkinId}
                reducedEffects={skinInventory.reducedEffects}
              />
            </section>

            {/* Right: Rival Opponent (Compact Mini-Board ~35%) */}
            <section aria-label="Rival Arena" className="flex flex-col items-center gap-2 shrink-0">
              <PlayerArenaPanel
                side="right"
                layout="compact"
                boardRef={p2Ref}
                boardContainerRef={p2BoardElRef}
                hud={p2Hud}
                callouts={p2Callouts}
                theme={theme}
                cellSize={p2CellSize}
                accentColor={theme.accentP2}
                skinId={skinInventory.equippedSkinId}
                reducedEffects={skinInventory.reducedEffects}
              />

              {/* Compact Rival Next & Difficulty Card directly under compact Rival board */}
              <div
                className="w-full rounded-lg border px-2 py-1.5 flex flex-col items-center gap-1"
                style={{ backgroundColor: theme.surfaceBg, borderColor: theme.border }}
              >
                <span className="text-[9px] font-bold tracking-wider" style={{ color: theme.textMuted }}>
                  {isQuickMatch
                    ? '1V1 LIVE'
                    : isOnlineMode
                      ? `ROOM ${activeRoomCode ?? ''}`
                      : config.mode === 'vs_ai'
                        ? `${AI_PROFILES[config.difficulty].label.toUpperCase()} AI`
                        : 'P2'}
                </span>
                <PiecePreviewCanvas
                  piece={p2Hud.next3[0] ?? null}
                  theme={theme}
                  skinId={skinInventory.equippedSkinId}
                  reducedEffects={skinInventory.reducedEffects}
                  cellSize={7}
                  width={34}
                  height={20}
                />
              </div>
            </section>
          </div>
        </main>

        {/* Bottom Ergonomic Multi-Touch Thumb Deck (~28–30% height) */}
        <footer
          className="w-full shrink-0 pt-2 pb-2 border-t"
          style={{ borderColor: theme.border, backgroundColor: theme.surfaceBg }}
        >
          <TouchControls
            variant="portrait"
            onAction={(action) => performPlayerAction('p1', action)}
            theme={theme}
            disabled={controlsDisabled}
            label="Player 1 mobile controls"
          />
        </footer>

        {sharedOverlays}
      </div>
    );
  }

  // =========================================================================
  // 2. LANDSCAPE PHONE / COMPACT TABLET MODE:
  //    Even side-by-side boards in center, bottom-left & bottom-right thumb zones
  // =========================================================================
  if (layoutMode === 'landscape-mobile') {
    return (
      <div
        className="h-[100dvh] w-full flex flex-col overflow-hidden arena-touch-lock safe-area-top safe-area-bottom safe-area-x transition-colors duration-200"
        style={{ backgroundColor: theme.pageBg, color: theme.textPrimary }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Slim Landscape Header */}
        <header
          className="w-full px-3 py-1 flex items-center justify-between gap-2 border-b shrink-0"
          style={{ borderColor: theme.border, backgroundColor: theme.surfaceBg }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display text-sm font-bold tracking-tight whitespace-nowrap">
              Block Clash: Arena
            </span>
            <span className="text-[11px] truncate" style={{ color: theme.textMuted }}>
              {isQuickMatch
                ? '1v1 Online Quick Match'
                : isOnlineMode
                  ? `Online Room ${activeRoomCode ?? ''}`
                  : config.mode === 'vs_ai'
                    ? `${AI_PROFILES[config.difficulty].label} AI`
                    : '2P Local'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleMute}
              className="h-8 px-2.5 rounded-lg border flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: muted ? theme.danger : theme.border,
                color: muted ? theme.danger : theme.textPrimary,
              }}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            {!isOnlineMode && (
              <button
                type="button"
                onClick={handleTogglePause}
                disabled={phase === 'COUNTDOWN' || phase === 'SUMMARY'}
                className="h-8 px-2.5 rounded-lg border flex items-center gap-1 text-[11px] font-semibold cursor-pointer disabled:opacity-40"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                  color: theme.textPrimary,
                }}
              >
                {phase === 'PAUSED' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{phase === 'PAUSED' ? 'Resume' : 'Pause'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleBackToMenu}
              className="h-8 px-2.5 rounded-lg border flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.border,
                color: theme.textSecondary,
              }}
              aria-label="Main Menu"
            >
              <Home className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Landscape Battle Stage: Left Thumb | YOU | Central Status | RIVAL | Right Thumb */}
        <main
          ref={arenaRef}
          className="relative flex-1 min-h-0 w-full px-2 py-1.5 flex items-end justify-between gap-2 overflow-hidden"
        >
          <ArenaVFXCanvas
            projectilesRef={projectilesRef}
            arenaRef={arenaRef}
            p1BoardElRef={p1BoardElRef}
            p2BoardElRef={p2BoardElRef}
            theme={theme}
          />

          {/* Bottom-Left Thumb Controls */}
          <div className="shrink-0 pb-1 z-10">
            <TouchControls
              variant="landscape-left"
              onAction={(action) => performPlayerAction('p1', action)}
              theme={theme}
              disabled={controlsDisabled}
            />
          </div>

          {/* Center Even Side-by-Side Split Arena */}
          <div className="flex-1 h-full flex items-center justify-center gap-2 min-w-0">
            <section aria-label="Player 1 Arena" className="shrink-0">
              <PlayerArenaPanel
                side="left"
                layout="compact"
                boardRef={p1Ref}
                boardContainerRef={p1BoardElRef}
                hud={p1Hud}
                callouts={p1Callouts}
                theme={theme}
                cellSize={p1CellSize}
                accentColor={theme.accentP1}
                skinId={skinInventory.equippedSkinId}
                reducedEffects={skinInventory.reducedEffects}
              />
            </section>

            {/* Compact Central Battle Status + P1 Hold/Next */}
            <aside
              aria-label="Battle Status"
              className="w-[96px] sm:w-[114px] shrink-0 rounded-xl border p-2 flex flex-col items-center gap-2"
              style={{
                backgroundColor: theme.surfaceBg,
                borderColor: suddenDeath ? theme.danger : theme.borderStrong,
              }}
            >
              <div className="text-center">
                <div
                  className="text-[9px] font-bold tracking-wider"
                  style={{ color: suddenDeath ? theme.danger : theme.accentPrimary }}
                >
                  {suddenDeath ? 'SUDDEN DEATH' : 'TIMER'}
                </div>
                <div
                  className="font-mono-num text-lg font-bold leading-tight"
                  style={{ color: suddenDeath ? theme.danger : theme.textPrimary }}
                >
                  {clockDisplay}
                </div>
              </div>

              <div
                className="w-full rounded-lg border py-1 px-1.5 flex items-center justify-between font-mono-num text-xs font-bold"
                style={{ backgroundColor: theme.surfaceElevated, borderColor: theme.border }}
              >
                <span style={{ color: theme.accentP1 }}>{p1Hud.kos}</span>
                <span className="text-[9px]" style={{ color: theme.textMuted }}>
                  KOs
                </span>
                <span style={{ color: theme.accentP2 }}>{p2Hud.kos}</span>
              </div>

              {/* P1 Reserve & Queue in Center HUD */}
              <div className="w-full flex flex-col items-center gap-1 pt-1 border-t" style={{ borderColor: theme.border }}>
                <span className="text-[9px] font-semibold" style={{ color: theme.textMuted }}>
                  RES / QUEUE
                </span>
                <div className="flex items-center justify-center gap-1">
                  <PiecePreviewCanvas
                    piece={p1Hud.hold}
                    theme={theme}
                    skinId={skinInventory.equippedSkinId}
                    reducedEffects={skinInventory.reducedEffects}
                    cellSize={8}
                    dimmed={p1Hud.holdUsed}
                    width={36}
                    height={22}
                  />
                  <PiecePreviewCanvas
                    piece={p1Hud.next3[0] ?? null}
                    theme={theme}
                    skinId={skinInventory.equippedSkinId}
                    reducedEffects={skinInventory.reducedEffects}
                    cellSize={8}
                    width={36}
                    height={22}
                  />
                </div>
              </div>

              {latestAttackAlert && (
                <div
                  key={latestAttackAlert.id}
                  className="w-full text-center font-display text-[10px] font-bold leading-tight truncate"
                  style={{
                    color: latestAttackAlert.actor === 'p1' ? theme.accentP1 : theme.accentP2,
                  }}
                >
                  {latestAttackAlert.text}
                </div>
              )}

              {config.matchType === 'endless' && (
                <button
                  type="button"
                  onClick={handleFinishEndless}
                  disabled={phase !== 'PLAYING'}
                  className="w-full h-7 rounded-md border text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.border,
                    color: theme.textPrimary,
                  }}
                >
                  <Flag className="w-3 h-3" />
                  <span>Finish</span>
                </button>
              )}
            </aside>

            <section aria-label="Rival Arena" className="shrink-0">
              <PlayerArenaPanel
                side="right"
                layout="compact"
                boardRef={p2Ref}
                boardContainerRef={p2BoardElRef}
                hud={p2Hud}
                callouts={p2Callouts}
                theme={theme}
                cellSize={p2CellSize}
                accentColor={theme.accentP2}
                skinId={skinInventory.equippedSkinId}
                reducedEffects={skinInventory.reducedEffects}
              />
            </section>
          </div>

          {/* Bottom-Right Thumb Controls */}
          <div className="shrink-0 pb-1 z-10">
            <TouchControls
              variant="landscape-right"
              onAction={(action) => performPlayerAction('p1', action)}
              theme={theme}
              disabled={controlsDisabled}
            />
          </div>
        </main>

        {sharedOverlays}
      </div>
    );
  }

  // =========================================================================
  // 3. DESKTOP / LARGE TABLET SPLIT-SCREEN ARENA
  // =========================================================================
  return (
    <div
      className={`min-h-[100dvh] w-full flex flex-col transition-colors duration-200 overflow-x-hidden safe-area-top safe-area-bottom ${
        isMobileLayout ? 'arena-touch-lock' : ''
      }`}
      style={{
        backgroundColor: theme.pageBg,
        color: theme.textPrimary,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Arena Header */}
      <header
        className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 border-b shrink-0"
        style={{ borderColor: theme.border }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/icons/icon-192.png"
            alt="Block Clash Arena Crest"
            referrerPolicy="no-referrer"
            className="w-6 h-6 rounded-md object-cover shrink-0 border"
            style={{ borderColor: theme.borderStrong }}
          />
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
            Block Clash: Arena
          </span>
          <span
            className="hidden md:inline text-xs font-medium truncate"
            style={{ color: theme.textMuted }}
          >
            {isQuickMatch
              ? '1v1 Online Quick Match'
              : isOnlineMode
                ? `Online 1v1 · Room ${activeRoomCode ?? ''}`
                : config.mode === 'vs_ai'
                  ? `1 Player vs. ${AI_PROFILES[config.difficulty].label} AI`
                  : '2 Player Local'}{' '}
            · {config.matchType === 'ko_2min' ? '2-Min KO Battle' : 'Endless Survival'}
          </span>
        </div>

        {/* Live Theme Switcher */}
        <div
          className="hidden sm:flex items-center p-1 rounded-lg border gap-0.5 shrink-0"
          style={{
            backgroundColor: theme.surfaceBg,
            borderColor: theme.border,
          }}
          role="group"
          aria-label="Visual theme"
        >
          {(['neon', 'retro', 'modern'] as ThemeId[]).map((tid) => {
            const active = config.theme === tid;
            const shortLabel = tid === 'neon' ? 'Neon' : tid === 'retro' ? 'CRT' : 'Modern';
            return (
              <button
                key={tid}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, theme: tid }))}
                className="px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: active ? theme.accentPrimary : 'transparent',
                  color: active ? theme.accentPrimaryText : theme.textMuted,
                }}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>

        {/* Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {!isOnlineMode && (
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={phase === 'COUNTDOWN' || phase === 'SUMMARY'}
              className="h-9 px-3 rounded-lg border flex items-center gap-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: theme.surfaceBg,
                borderColor: theme.border,
                color: theme.textPrimary,
              }}
            >
              {phase === 'PAUSED' ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{phase === 'PAUSED' ? 'Resume' : 'Pause'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleBackToMenu}
            className="h-9 px-3 rounded-lg border flex items-center gap-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.border,
              color: theme.textSecondary,
            }}
            title={
              isQuickMatch
                ? 'Leave Online Match'
                : isOnlineMode
                  ? 'Leave Online Room'
                  : 'Return to Main Menu'
            }
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isQuickMatch ? 'Leave Match' : isOnlineMode ? 'Leave Room' : 'Menu'}
            </span>
          </button>
        </div>
      </header>

      {/* Strict Side-by-Side Split-Screen Battle Arena */}
      <main
        ref={arenaRef}
        className="relative flex-1 w-full max-w-[1440px] mx-auto px-2 sm:px-5 py-3 flex items-center justify-center arena-touch-lock"
      >
        {/* Flying Attack Projectiles Overlay */}
        <ArenaVFXCanvas
          projectilesRef={projectilesRef}
          arenaRef={arenaRef}
          p1BoardElRef={p1BoardElRef}
          p2BoardElRef={p2BoardElRef}
          theme={theme}
        />

        {/* Split-Screen 3-Zone Arena: Left Half (YOU) | Central BATTLE STATUS | Right Half (RIVAL) */}
        <div className="w-full flex flex-row items-start justify-center gap-2 sm:gap-4 lg:gap-6">
          {/* LEFT HALF: Player 1 ("YOU") */}
          <section
            aria-label="Player 1 Arena"
            className="flex-1 flex justify-end min-w-0"
          >
            <PlayerArenaPanel
              side="left"
              boardRef={p1Ref}
              boardContainerRef={p1BoardElRef}
              hud={p1Hud}
              callouts={p1Callouts}
              theme={theme}
              cellSize={p1CellSize}
              accentColor={theme.accentP1}
              showTouchControls={true}
              controlsDisabled={controlsDisabled}
              onTouchAction={(action) => performPlayerAction('p1', action)}
              skinId={skinInventory.equippedSkinId}
              reducedEffects={skinInventory.reducedEffects}
            />
          </section>

          {/* CENTRAL HUD: Vertical "BATTLE STATUS" Column */}
          <aside
            aria-label="Battle Status"
            className="w-[152px] sm:w-[178px] lg:w-[206px] shrink-0 rounded-xl border p-3 sm:p-4 flex flex-col gap-3.5 mt-7"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: suddenDeath ? theme.danger : theme.borderStrong,
              boxShadow: suddenDeath && theme.blockGlow ? `0 0 24px ${theme.danger}33` : 'none',
            }}
          >
            {/* Column Title */}
            <div
              className="text-center pb-2 border-b"
              style={{ borderColor: theme.border }}
            >
              <div
                className="font-display text-xs font-bold tracking-wider"
                style={{ color: theme.accentPrimary }}
              >
                BATTLE STATUS
              </div>
            </div>

            {/* Match Timer / Mode State */}
            <div className="text-center space-y-1">
              <div
                className="text-[11px] font-semibold"
                style={{ color: suddenDeath ? theme.danger : theme.textMuted }}
              >
                {suddenDeath
                  ? 'Sudden Death'
                  : config.matchType === 'ko_2min'
                    ? 'Match Timer'
                    : 'Survival Time'}
              </div>
              <div
                className="font-mono-num text-2xl sm:text-3xl font-bold tracking-tight leading-none"
                style={{ color: suddenDeath ? theme.danger : theme.textPrimary }}
              >
                {clockDisplay}
              </div>
              {suddenDeath && (
                <div className="text-[11px] font-semibold" style={{ color: theme.danger }}>
                  Next KO wins
                </div>
              )}
            </div>

            {/* KO Scoreboard (YOU vs. RIVAL) */}
            <div
              className="rounded-lg border py-2.5 px-2.5 flex items-center justify-between"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.border,
              }}
            >
              <div className="text-center flex-1">
                <div className="text-[10px] font-bold" style={{ color: theme.accentP1 }}>
                  YOU
                </div>
                <div
                  className="font-mono-num text-2xl font-bold leading-tight"
                  style={{ color: theme.accentP1 }}
                >
                  {p1Hud.kos}
                </div>
              </div>
              <div
                className="text-[11px] font-display font-bold px-1.5"
                style={{ color: theme.textMuted }}
              >
                KOs
              </div>
              <div className="text-center flex-1">
                <div className="text-[10px] font-bold" style={{ color: theme.accentP2 }}>
                  RIVAL
                </div>
                <div
                  className="font-mono-num text-2xl font-bold leading-tight"
                  style={{ color: theme.accentP2 }}
                >
                  {p2Hud.kos}
                </div>
              </div>
            </div>

            {/* Animated Attack Notification Banner */}
            <div
              className="rounded-lg border px-2.5 py-2 min-h-[48px] flex flex-col justify-center text-center transition-all duration-150"
              style={{
                backgroundColor: latestAttackAlert ? theme.surfaceElevated : 'transparent',
                borderColor: latestAttackAlert
                  ? latestAttackAlert.actor === 'p1'
                    ? theme.accentP1
                    : theme.accentP2
                  : theme.border,
              }}
            >
              {latestAttackAlert ? (
                <div
                  key={latestAttackAlert.id}
                  className="font-display text-xs font-bold leading-snug"
                  style={{
                    color:
                      latestAttackAlert.actor === 'p1' ? theme.accentP1 : theme.accentP2,
                  }}
                >
                  {latestAttackAlert.text}
                </div>
              ) : (
                <div className="text-[11px]" style={{ color: theme.textMuted }}>
                  Clear 2+ lines to attack
                </div>
              )}
            </div>

            {/* Attack Feed History */}
            <div
              className="flex flex-col gap-1 pt-2 border-t min-h-[72px]"
              style={{ borderColor: theme.border }}
            >
              <div className="text-[10px] font-semibold" style={{ color: theme.textMuted }}>
                Attack Feed
              </div>
              {battleFeed.length === 0 ? (
                <div className="text-[11px]" style={{ color: theme.textMuted }}>
                  Double +1 · Triple +2 · Quad +4
                </div>
              ) : (
                battleFeed.map((item) => (
                  <div
                    key={item.id}
                    className="text-[11px] font-medium leading-snug truncate"
                    style={{
                      color: item.actor === 'p1' ? theme.accentP1 : theme.accentP2,
                    }}
                  >
                    {item.text}
                  </div>
                ))
              )}
            </div>

            {/* Global Mute Toggle inside Central HUD */}
            <button
              type="button"
              onClick={handleToggleMute}
              className="h-10 px-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: muted ? theme.danger : theme.border,
                color: muted ? theme.danger : theme.textPrimary,
              }}
              aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{muted ? 'Audio Muted' : 'Audio On'}</span>
            </button>

            {/* Endless Survival Finish Button */}
            {config.matchType === 'endless' && (
              <button
                type="button"
                onClick={handleFinishEndless}
                disabled={phase !== 'PLAYING'}
                className="h-9 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-40"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.borderStrong,
                  color: theme.textPrimary,
                }}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Finish Match</span>
              </button>
            )}
          </aside>

          {/* RIGHT HALF: AI Opponent / Player 2 / Online Rival */}
          <section
            aria-label="Rival Arena"
            className="flex-1 flex justify-start min-w-0"
          >
            <PlayerArenaPanel
              side="right"
              boardRef={p2Ref}
              boardContainerRef={p2BoardElRef}
              hud={p2Hud}
              callouts={p2Callouts}
              theme={theme}
              cellSize={p2CellSize}
              accentColor={theme.accentP2}
              showTouchControls={config.mode === 'local_2p'}
              controlsDisabled={controlsDisabled}
              onTouchAction={
                config.mode === 'local_2p'
                  ? (action) => performPlayerAction('p2', action)
                  : undefined
              }
              controlHint={
                isQuickMatch
                  ? 'Live 1v1 Server Sync'
                  : isOnlineMode
                    ? `Live Cloud Sync · Room ${activeRoomCode ?? ''}`
                    : config.mode === 'vs_ai'
                      ? `${AI_PROFILES[config.difficulty].label} AI · ${AI_PROFILES[config.difficulty].tagline}`
                      : undefined
              }
              skinId={skinInventory.equippedSkinId}
              reducedEffects={skinInventory.reducedEffects}
            />
          </section>
        </div>
      </main>

      {sharedOverlays}
    </div>
  );
}
