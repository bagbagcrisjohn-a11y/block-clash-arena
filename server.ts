import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { attachMatchmakingServer } from './server/matchmakingEngine.ts';
import { getPlayerRecordAndHistory } from './server/matchStore.ts';
import {
  getOrCreatePlayerProfile,
  getPublicLeaderboard,
  syncPlayerProgression,
  updatePlayerIdentity,
} from './server/playerStore.ts';
import {
  createMayaSandboxCheckout,
  getMayaGatewayStatus,
  isAllowedMayaWebhookIp,
  verifyMayaSandboxPayment,
} from './server/mayaClient.ts';
import {
  attachMayaCheckout,
  createPendingOrder,
  findReusablePendingOrder,
  getOrderByCheckoutId,
  getOrderById,
  getOrderByReference,
  getServerSkinProduct,
  getVerifiedEquippedSkinId,
  getVerifiedOwnedSkinIds,
  hasVerifiedSkin,
  markOrderPaidAndGrantEntitlement,
  markOrderTerminalStatus,
  setVerifiedEquippedSkinId,
} from './server/paymentStore.ts';

interface AuthenticatedUser {
  uid: string;
  email?: string;
  phoneNumber?: string;
  name?: string;
  picture?: string;
  providers: string[];
}

interface AuthedRequest extends Request {
  user?: AuthenticatedUser;
}

// Initialize Firebase Admin ONLY for stateless ID token verification (no IAM required).
function getFirebaseAdminAuth() {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const firebaseConfig = JSON.parse(raw) as { projectId?: string };
  if (!firebaseConfig.projectId || firebaseConfig.projectId === 'remixed-project-id') {
    throw new Error('Firebase projectId is not configured');
  }
  const app = getApps().length
    ? getApp()
    : initializeApp({ projectId: firebaseConfig.projectId });
  return getAuth(app);
}

async function verifyBearerToken(req: Request): Promise<AuthenticatedUser | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const idToken = header.slice('Bearer '.length).trim();
  if (!idToken) return null;

  const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  const firebaseMeta = (decoded as { firebase?: { identities?: Record<string, unknown>; sign_in_provider?: string } }).firebase;
  const providerSet = new Set<string>();
  if (firebaseMeta?.identities && typeof firebaseMeta.identities === 'object') {
    for (const key of Object.keys(firebaseMeta.identities)) {
      if (key === 'google.com' || key === 'phone' || key === 'password') {
        providerSet.add(key);
      }
    }
  }
  if (typeof firebaseMeta?.sign_in_provider === 'string') {
    const p = firebaseMeta.sign_in_provider;
    if (p === 'google.com' || p === 'phone' || p === 'password') {
      providerSet.add(p);
    }
  }

  return {
    uid: decoded.uid,
    email: typeof decoded.email === 'string' ? decoded.email : undefined,
    phoneNumber: typeof decoded.phone_number === 'string' ? decoded.phone_number : undefined,
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
    picture: typeof decoded.picture === 'string' ? decoded.picture : undefined,
    providers: Array.from(providerSet),
  };
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const user = await verifyBearerToken(req);
    if (!user) {
      res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Please sign in to access your Block Clash: Arena account.',
      });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Your session expired. Please sign in again.',
    });
  }
}

function resolveAppBaseUrl(req: Request): string {
  const configured = (process.env.APP_URL ?? '').trim();
  if (configured && configured.startsWith('https://') && !configured.includes('MY_APP_URL')) {
    return configured.replace(/\/+$/, '');
  }
  const proto = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function parseAllowedOrigins(): string[] {
  const raw = (process.env.ALLOWED_ORIGINS ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  const allowedOrigins = parseAllowedOrigins();

  // CORS support for cross-origin Vercel frontend -> Railway / Render / Fly.io backend
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const PAYMENTS_UNAVAILABLE_MESSAGE =
    'Real payments are not yet available. Please try again later.';

  // 0. Health check for Railway / Render / Fly.io load balancers
  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      service: 'block-clash-arena',
      wsPath: '/ws/matchmaking',
    });
  });

  // 0a. Authenticated Player Profile (auto-provisions Permanent Player ID on first sign-in)
  app.get('/api/player/profile', requireAuth, (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = req.user!;
      const profile = getOrCreatePlayerProfile({
        uid: user.uid,
        defaultName: user.name || (user.email ? user.email.split('@')[0] : undefined),
        photoUrl: user.picture,
        providers: user.providers,
      });
      const onlineStats = getPlayerRecordAndHistory(`uid:${user.uid}`, 12);
      res.json({
        profile,
        onlineRecord: onlineStats.record,
        onlineHistory: onlineStats.history,
        ownedSkinIds: getVerifiedOwnedSkinIds(user.uid),
        equippedSkinId: getVerifiedEquippedSkinId(user.uid),
      });
    } catch (err) {
      console.error('[Player Profile Error]', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'PROFILE_LOAD_FAILED', message: 'Could not load player profile.' });
    }
  });

  // 0a-2. Update customizable username & avatar (authenticated owner only)
  app.patch('/api/player/profile', requireAuth, (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = req.user!;
      getOrCreatePlayerProfile({
        uid: user.uid,
        defaultName: user.name || (user.email ? user.email.split('@')[0] : undefined),
        photoUrl: user.picture,
        providers: user.providers,
      });
      const result = updatePlayerIdentity(user.uid, {
        username: req.body?.username,
        avatarId: req.body?.avatarId,
      });
      if (!result.ok) {
        res.status(400).json({ error: result.error, message: result.message });
        return;
      }
      res.json({ ok: true, profile: result.profile });
    } catch (err) {
      console.error('[Player Profile Update Error]', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'PROFILE_UPDATE_FAILED', message: 'Could not save profile changes.' });
    }
  });

  // 0a-3. Sync validated progression or perform one-time guest local progress migration
  app.post('/api/player/progress', requireAuth, (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = req.user!;
      getOrCreatePlayerProfile({
        uid: user.uid,
        defaultName: user.name || (user.email ? user.email.split('@')[0] : undefined),
        photoUrl: user.picture,
        providers: user.providers,
      });
      const updated = syncPlayerProgression(user.uid, {
        totalXP: req.body?.totalXP,
        totalKOs: req.body?.totalKOs,
        totalWins: req.body?.totalWins,
        totalMatches: req.body?.totalMatches,
        username: req.body?.username,
        isMigration: Boolean(req.body?.isMigration),
      });
      if (!updated) {
        res.status(404).json({ error: 'PROFILE_NOT_FOUND', message: 'Player profile not found.' });
        return;
      }
      res.json({ ok: true, profile: updated });
    } catch (err) {
      console.error('[Player Progress Sync Error]', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'PROGRESS_SYNC_FAILED', message: 'Could not sync player progression.' });
    }
  });

  // 0a-4. Public Leaderboard (PII-free display fields only)
  app.get('/api/leaderboard', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
      const entries = getPublicLeaderboard(Number.isFinite(rawLimit) ? rawLimit : 20);
      res.json({ entries });
    } catch (err) {
      console.error('[Leaderboard Error]', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'LEADERBOARD_FETCH_FAILED' });
    }
  });

  // 0b. Verified Online 1v1 W/L/D Record & Match History (authenticated users only)
  app.get('/api/matchmaking/record', requireAuth, (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = getPlayerRecordAndHistory(`uid:${req.user!.uid}`, 12);
      res.json(data);
    } catch (err) {
      console.error('[Matchmaking Record Error]', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'RECORD_FETCH_FAILED' });
    }
  });

  // 1. Public payment gateway readiness check (never exposes keys)
  app.get('/api/payments/config', (_req, res) => {
    const status = getMayaGatewayStatus();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...status,
      message: status.gatewayConfigured
        ? 'Maya Checkout (Sandbox) is ready.'
        : PAYMENTS_UNAVAILABLE_MESSAGE,
    });
  });

  // 2. Verified server-side skin entitlements & equipped loadout (always ['classic'] if signed out)
  app.get('/api/entitlements', async (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.json({
        authenticated: false,
        userId: null,
        ownedSkinIds: ['classic'],
        equippedSkinId: 'classic',
      });
      return;
    }

    try {
      const user = await verifyBearerToken(req);
      if (!user) {
        res.status(401).json({
          error: 'INVALID_TOKEN',
          ownedSkinIds: ['classic'],
          equippedSkinId: 'classic',
        });
        return;
      }
      const ownedSkinIds = getVerifiedOwnedSkinIds(user.uid);
      const equippedSkinId = getVerifiedEquippedSkinId(user.uid);
      res.json({
        authenticated: true,
        userId: user.uid,
        ownedSkinIds,
        equippedSkinId,
      });
    } catch {
      res.status(401).json({
        error: 'INVALID_TOKEN',
        ownedSkinIds: ['classic'],
        equippedSkinId: 'classic',
      });
    }
  });

  // 2b. Authoritative server-side Equip endpoint — rejects any premium skin without verified PAID ownership
  app.post('/api/skins/equip', async (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const rawSkinId = typeof req.body?.skinId === 'string' ? req.body.skinId.trim() : '';

    if (rawSkinId === 'classic') {
      try {
        const user = await verifyBearerToken(req);
        if (user) {
          setVerifiedEquippedSkinId(user.uid, 'classic');
          res.json({
            ok: true,
            equippedSkinId: 'classic',
            ownedSkinIds: getVerifiedOwnedSkinIds(user.uid),
          });
          return;
        }
      } catch {
        // Free classic skin remains accessible even if token is absent/expired
      }
      res.json({
        ok: true,
        equippedSkinId: 'classic',
        ownedSkinIds: ['classic'],
      });
      return;
    }

    const product = getServerSkinProduct(rawSkinId);
    if (!product) {
      res.status(400).json({
        ok: false,
        error: 'INVALID_SKIN_ID',
        message: 'Requested tile skin does not exist.',
        equippedSkinId: 'classic',
        ownedSkinIds: ['classic'],
      });
      return;
    }

    let user: AuthenticatedUser | null = null;
    try {
      user = await verifyBearerToken(req);
    } catch {
      user = null;
    }

    if (!user) {
      res.status(403).json({
        ok: false,
        error: 'SKIN_NOT_OWNED',
        message: 'Premium skin is locked. Complete a verified payment before equipping.',
        equippedSkinId: 'classic',
        ownedSkinIds: ['classic'],
      });
      return;
    }

    const equipResult = setVerifiedEquippedSkinId(user.uid, product.id);
    if (!equipResult.ok) {
      res.status(403).json({
        ok: false,
        error: 'SKIN_NOT_OWNED',
        message: `${product.name} is locked. Complete a verified payment before equipping.`,
        equippedSkinId: getVerifiedEquippedSkinId(user.uid),
        ownedSkinIds: getVerifiedOwnedSkinIds(user.uid),
      });
      return;
    }

    res.json({
      ok: true,
      equippedSkinId: equipResult.equippedSkinId,
      ownedSkinIds: getVerifiedOwnedSkinIds(user.uid),
    });
  });

  // 3. Initiate Maya Checkout (Sandbox) — rejects immediately if gateway credentials are not configured
  app.post('/api/payments/maya/checkout', async (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');

    const gateway = getMayaGatewayStatus();
    if (!gateway.gatewayConfigured) {
      res.status(503).json({
        error: 'PAYMENTS_NOT_AVAILABLE',
        gatewayConfigured: false,
        message: PAYMENTS_UNAVAILABLE_MESSAGE,
      });
      return;
    }

    // Verify authenticated player identity
    let user: AuthenticatedUser | null = null;
    try {
      user = await verifyBearerToken(req);
    } catch {
      res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Your session expired. Please sign in again.',
      });
      return;
    }
    if (!user) {
      res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: 'Please sign in with Google before purchasing a premium tile skin.',
      });
      return;
    }

    // Authoritative server-side catalog & price lookup
    const product = getServerSkinProduct(req.body?.skinId);
    if (!product) {
      res.status(400).json({
        error: 'INVALID_SKIN_ID',
        message: 'Requested tile skin collection is not purchasable.',
      });
      return;
    }

    // Prevent duplicate purchase of an already-owned skin
    if (hasVerifiedSkin(user.uid, product.id)) {
      res.status(409).json({
        error: 'ALREADY_OWNED',
        message: `You already own ${product.name}.`,
        ownedSkinIds: getVerifiedOwnedSkinIds(user.uid),
      });
      return;
    }

    // Prevent concurrent duplicate checkout creation for the same user + skin
    const existingPending = findReusablePendingOrder(user.uid, product.id);
    if (existingPending && existingPending.redirect_url && existingPending.checkout_id) {
      res.json({
        orderId: existingPending.id,
        checkoutId: existingPending.checkout_id,
        redirectUrl: existingPending.redirect_url,
        environment: 'sandbox',
      });
      return;
    }

    const orderId = `ord_${crypto.randomUUID().replace(/-/g, '')}`;
    const requestReferenceNumber = `BCA-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const order = createPendingOrder({
      id: orderId,
      requestReferenceNumber,
      userId: user.uid,
      skinId: product.id,
      amountPhp: product.pricePhp,
    });

    try {
      const checkout = await createMayaSandboxCheckout({
        orderId: order.id,
        requestReferenceNumber: order.request_reference_number,
        skinId: product.id,
        skinName: product.name,
        amountPhp: product.pricePhp,
        buyerName: user.name || 'BlockClash Player',
        buyerEmail: user.email,
        appBaseUrl: resolveAppBaseUrl(req),
      });

      attachMayaCheckout(order.id, checkout.checkoutId, checkout.redirectUrl);

      res.status(201).json({
        orderId: order.id,
        checkoutId: checkout.checkoutId,
        redirectUrl: checkout.redirectUrl,
        environment: 'sandbox',
      });
    } catch (err) {
      markOrderTerminalStatus(order.id, 'FAILED');
      const detail = err instanceof Error ? err.message : 'Checkout initialization failed';
      console.error('[Maya Checkout Error]', detail);
      res.status(502).json({
        error: 'GATEWAY_ERROR',
        message: 'Unable to initialize Maya Sandbox Checkout. Please try again later.',
      });
    }
  });

  // 4. Verify order status (authenticated owner only) — re-verifies with Maya API if still PENDING
  app.get('/api/payments/orders/:orderId/status', requireAuth, async (req: AuthedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const orderId = String(req.params.orderId || '').trim();
    if (!/^ord_[a-f0-9]{32}$/.test(orderId)) {
      res.status(400).json({ error: 'INVALID_ORDER_ID', message: 'Invalid order reference.' });
      return;
    }

    const order = getOrderById(orderId);
    if (!order || order.user_id !== req.user!.uid) {
      res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Payment order not found.' });
      return;
    }

    let currentOrder = order;

    if (
      currentOrder.status === 'PENDING' &&
      currentOrder.checkout_id &&
      getMayaGatewayStatus().gatewayConfigured
    ) {
      try {
        const verified = await verifyMayaSandboxPayment(currentOrder.checkout_id);
        if (verified) {
          const amountMatches = Math.abs(verified.amount - currentOrder.amount_php) < 0.005;
          const refMatches =
            verified.requestReferenceNumber === currentOrder.request_reference_number;
          const currencyMatches = verified.currency === currentOrder.currency;

          if (
            verified.status === 'PAYMENT_SUCCESS' &&
            amountMatches &&
            refMatches &&
            currencyMatches
          ) {
            currentOrder =
              markOrderPaidAndGrantEntitlement(currentOrder.id, verified.id) ?? currentOrder;
          } else if (
            verified.status === 'PAYMENT_FAILED' ||
            verified.status === 'PAYMENT_EXPIRED' ||
            verified.status === 'PAYMENT_CANCELLED'
          ) {
            const terminal =
              verified.status === 'PAYMENT_EXPIRED'
                ? 'EXPIRED'
                : verified.status === 'PAYMENT_CANCELLED'
                  ? 'CANCELLED'
                  : 'FAILED';
            markOrderTerminalStatus(currentOrder.id, terminal);
            currentOrder = getOrderById(currentOrder.id) ?? currentOrder;
          }
        }
      } catch (err) {
        console.error('[Maya Status Re-Check Error]', err instanceof Error ? err.message : err);
      }
    }

    res.json({
      orderId: currentOrder.id,
      skinId: currentOrder.skin_id,
      status: currentOrder.status,
      ownedSkinIds: getVerifiedOwnedSkinIds(req.user!.uid),
      equippedSkinId: getVerifiedEquippedSkinId(req.user!.uid),
    });
  });

  // 5. Secure Maya Webhook endpoint — IP allowlisted + server-to-server verification against Maya API
  app.post('/api/webhooks/maya', async (req, res) => {
    const gateway = getMayaGatewayStatus();
    if (!gateway.gatewayConfigured) {
      res.status(503).json({ error: 'PAYMENTS_NOT_AVAILABLE' });
      return;
    }

    if (!isAllowedMayaWebhookIp(req)) {
      res.status(403).json({ error: 'FORBIDDEN_WEBHOOK_SOURCE' });
      return;
    }

    const body = (req.body ?? {}) as {
      id?: unknown;
      checkoutId?: unknown;
      requestReferenceNumber?: unknown;
      status?: unknown;
      paymentStatus?: unknown;
    };

    const paymentId = typeof body.id === 'string' ? body.id.trim() : '';
    const checkoutId = typeof body.checkoutId === 'string' ? body.checkoutId.trim() : '';
    const refNumber =
      typeof body.requestReferenceNumber === 'string' ? body.requestReferenceNumber.trim() : '';

    if (!paymentId && !refNumber && !checkoutId) {
      res.status(400).json({ error: 'INVALID_WEBHOOK_PAYLOAD' });
      return;
    }

    const order =
      (refNumber ? getOrderByReference(refNumber) : null) ||
      (checkoutId ? getOrderByCheckoutId(checkoutId) : null) ||
      (paymentId ? getOrderByCheckoutId(paymentId) : null);

    if (!order) {
      // Acknowledge unknown reference without granting anything
      res.status(200).json({ received: true, matched: false });
      return;
    }

    // Idempotency: already verified & granted
    if (order.status === 'PAID') {
      res.status(200).json({ received: true, status: 'PAID' });
      return;
    }

    const lookupId = paymentId || order.checkout_id || '';
    if (!lookupId) {
      res.status(400).json({ error: 'MISSING_PAYMENT_ID' });
      return;
    }

    try {
      // Authoritative server-to-server verification directly with Maya Payments API
      const verified = await verifyMayaSandboxPayment(lookupId);
      if (!verified) {
        res.status(202).json({ received: true, verified: false });
        return;
      }

      const amountMatches = Math.abs(verified.amount - order.amount_php) < 0.005;
      const refMatches = verified.requestReferenceNumber === order.request_reference_number;
      const currencyMatches = verified.currency === order.currency;

      if (verified.status === 'PAYMENT_SUCCESS') {
        if (!amountMatches || !refMatches || !currencyMatches) {
          console.error('[Maya Webhook Mismatch]', {
            orderId: order.id,
            expectedAmount: order.amount_php,
            gotAmount: verified.amount,
            expectedRef: order.request_reference_number,
            gotRef: verified.requestReferenceNumber,
          });
          res.status(400).json({ error: 'VERIFICATION_MISMATCH' });
          return;
        }
        markOrderPaidAndGrantEntitlement(order.id, verified.id);
        res.status(200).json({ received: true, status: 'PAID' });
        return;
      }

      if (
        verified.status === 'PAYMENT_FAILED' ||
        verified.status === 'PAYMENT_EXPIRED' ||
        verified.status === 'PAYMENT_CANCELLED'
      ) {
        const terminal =
          verified.status === 'PAYMENT_EXPIRED'
            ? 'EXPIRED'
            : verified.status === 'PAYMENT_CANCELLED'
              ? 'CANCELLED'
              : 'FAILED';
        markOrderTerminalStatus(order.id, terminal);
      }

      res.status(200).json({ received: true, status: verified.status });
    } catch (err) {
      console.error('[Maya Webhook Verification Error]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'VERIFICATION_FAILED' });
    }
  });

  // Mount Vite middleware in development or serve built dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(indexHtml);
      });
    } else {
      app.get('/', (_req, res) => {
        res.json({
          ok: true,
          service: 'block-clash-arena-backend',
          wsPath: '/ws/matchmaking',
        });
      });
    }
  }

  const httpServer = http.createServer(app);
  attachMatchmakingServer(httpServer, {
    verifyFirebaseIdToken: async (idToken: string) => {
      const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        name: typeof decoded.name === 'string' ? decoded.name : undefined,
        email: typeof decoded.email === 'string' ? decoded.email : undefined,
      };
    },
    allowedOrigins,
  });

  const PORT = Number(process.env.PORT || 3000);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Block Clash: Arena server listening on http://0.0.0.0:${PORT} (WS: /ws/matchmaking)`
    );
  });
}

void startServer();
