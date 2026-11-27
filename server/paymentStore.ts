import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type ServerOrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export interface ServerSkinProduct {
  id: string;
  name: string;
  rarity: string;
  pricePhp: number;
}

export interface PaymentOrderRecord {
  id: string;
  request_reference_number: string;
  user_id: string;
  skin_id: string;
  amount_php: number;
  currency: string;
  provider: string;
  checkout_id: string | null;
  redirect_url: string | null;
  status: ServerOrderStatus;
  maya_payment_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Authoritative server-side catalog & PHP pricing.
 * Clients may only submit a skinId; prices and currencies are never trusted from the browser.
 */
export const SERVER_SKIN_CATALOG: Record<string, ServerSkinProduct> = {
  neon_cyber: { id: 'neon_cyber', name: 'Neon Cyber', rarity: 'Rare', pricePhp: 49 },
  golden_luxury: { id: 'golden_luxury', name: 'Golden Luxury', rarity: 'Rare', pricePhp: 79 },
  ice_crystal: { id: 'ice_crystal', name: 'Ice Crystal', rarity: 'Epic', pricePhp: 99 },
  fire_lava: { id: 'fire_lava', name: 'Fire Lava', rarity: 'Epic', pricePhp: 99 },
  galaxy: { id: 'galaxy', name: 'Galaxy', rarity: 'Epic', pricePhp: 149 },
  toxic_green: { id: 'toxic_green', name: 'Toxic Green', rarity: 'Epic', pricePhp: 149 },
  diamond: { id: 'diamond', name: 'Diamond', rarity: 'Legendary', pricePhp: 199 },
  shadow_legend: { id: 'shadow_legend', name: 'Shadow Legend', rarity: 'Legendary', pricePhp: 249 },
  royal_cosmic: { id: 'royal_cosmic', name: 'Royal Cosmic', rarity: 'Mythic', pricePhp: 299 },
  ultimate_legendary: {
    id: 'ultimate_legendary',
    name: 'Ultimate Legendary',
    rarity: 'Ultimate',
    pricePhp: 399,
  },
};

export function getServerSkinProduct(skinId: unknown): ServerSkinProduct | null {
  if (typeof skinId !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(SERVER_SKIN_CATALOG, skinId)
    ? SERVER_SKIN_CATALOG[skinId]
    : null;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'payments.db');

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      request_reference_number TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      skin_id TEXT NOT NULL,
      amount_php INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'PHP',
      provider TEXT NOT NULL DEFAULT 'maya_sandbox',
      checkout_id TEXT,
      redirect_url TEXT,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED')),
      maya_payment_id TEXT,
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payment_orders_user_skin
      ON payment_orders (user_id, skin_id, status);

    CREATE INDEX IF NOT EXISTS idx_payment_orders_checkout_id
      ON payment_orders (checkout_id);

    CREATE TABLE IF NOT EXISTS verified_skin_entitlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      skin_id TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES payment_orders(id),
      maya_payment_id TEXT NOT NULL UNIQUE,
      amount_php INTEGER NOT NULL,
      verified_at TEXT NOT NULL,
      UNIQUE(user_id, skin_id)
    );

    CREATE INDEX IF NOT EXISTS idx_entitlements_user
      ON verified_skin_entitlements (user_id);

    CREATE TABLE IF NOT EXISTS user_skin_loadouts (
      user_id TEXT PRIMARY KEY,
      equipped_skin_id TEXT NOT NULL DEFAULT 'classic',
      updated_at TEXT NOT NULL
    );
  `);

  dbInstance = db;
  return db;
}

/**
 * Returns only verified server-side owned skins (always includes free 'classic').
 * Joins verified_skin_entitlements against PAID payment_orders so no unverified record can unlock a skin.
 */
export function getVerifiedOwnedSkinIds(userId: string): string[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT e.skin_id
    FROM verified_skin_entitlements e
    INNER JOIN payment_orders o ON o.id = e.order_id
    WHERE e.user_id = ? AND o.status = 'PAID'
    ORDER BY e.verified_at ASC
  `);
  const rows = stmt.all(userId) as Array<{ skin_id: string }>;
  const owned = new Set<string>(['classic']);
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(SERVER_SKIN_CATALOG, row.skin_id)) {
      owned.add(row.skin_id);
    }
  }
  return Array.from(owned);
}

export function hasVerifiedSkin(userId: string, skinId: string): boolean {
  if (skinId === 'classic') return true;
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 1 AS found
    FROM verified_skin_entitlements e
    INNER JOIN payment_orders o ON o.id = e.order_id
    WHERE e.user_id = ? AND e.skin_id = ? AND o.status = 'PAID'
    LIMIT 1
  `);
  const row = stmt.get(userId, skinId) as { found: number } | undefined;
  return Boolean(row?.found);
}

/**
 * Returns the user's server-stored equipped skin, re-verifying PAID ownership on every read.
 * Falls back to free 'classic' if no verified entitlement exists.
 */
export function getVerifiedEquippedSkinId(userId: string): string {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT equipped_skin_id
    FROM user_skin_loadouts
    WHERE user_id = ?
    LIMIT 1
  `);
  const row = stmt.get(userId) as { equipped_skin_id: string } | undefined;
  const candidate = row?.equipped_skin_id ?? 'classic';
  if (candidate === 'classic') return 'classic';
  if (
    Object.prototype.hasOwnProperty.call(SERVER_SKIN_CATALOG, candidate) &&
    hasVerifiedSkin(userId, candidate)
  ) {
    return candidate;
  }
  return 'classic';
}

/**
 * Enforces server-side ownership verification before allowing any skin to be equipped.
 * Free 'classic' is always permitted; premium skins strictly require a PAID entitlement record.
 */
export function setVerifiedEquippedSkinId(
  userId: string,
  skinId: string
):
  | { ok: true; equippedSkinId: string }
  | { ok: false; reason: 'INVALID_SKIN' | 'NOT_OWNED' } {
  if (skinId !== 'classic' && !Object.prototype.hasOwnProperty.call(SERVER_SKIN_CATALOG, skinId)) {
    return { ok: false, reason: 'INVALID_SKIN' };
  }
  if (skinId !== 'classic' && !hasVerifiedSkin(userId, skinId)) {
    return { ok: false, reason: 'NOT_OWNED' };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO user_skin_loadouts (user_id, equipped_skin_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      equipped_skin_id = excluded.equipped_skin_id,
      updated_at = excluded.updated_at
  `);
  stmt.run(userId, skinId, now);
  return { ok: true, equippedSkinId: skinId };
}

export function findReusablePendingOrder(
  userId: string,
  skinId: string
): PaymentOrderRecord | null {
  const db = getDb();
  const cutoffIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const stmt = db.prepare(`
    SELECT *
    FROM payment_orders
    WHERE user_id = ?
      AND skin_id = ?
      AND status = 'PENDING'
      AND redirect_url IS NOT NULL
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = stmt.get(userId, skinId, cutoffIso) as PaymentOrderRecord | undefined;
  return row ?? null;
}

export function createPendingOrder(params: {
  id: string;
  requestReferenceNumber: string;
  userId: string;
  skinId: string;
  amountPhp: number;
}): PaymentOrderRecord {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO payment_orders (
      id,
      request_reference_number,
      user_id,
      skin_id,
      amount_php,
      currency,
      provider,
      checkout_id,
      redirect_url,
      status,
      maya_payment_id,
      verified_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 'PHP', 'maya_sandbox', NULL, NULL, 'PENDING', NULL, NULL, ?, ?)
  `);
  stmt.run(
    params.id,
    params.requestReferenceNumber,
    params.userId,
    params.skinId,
    params.amountPhp,
    now,
    now
  );
  return getOrderById(params.id)!;
}

export function attachMayaCheckout(
  orderId: string,
  checkoutId: string,
  redirectUrl: string
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE payment_orders
    SET checkout_id = ?, redirect_url = ?, updated_at = ?
    WHERE id = ? AND status = 'PENDING'
  `);
  stmt.run(checkoutId, redirectUrl, now, orderId);
}

export function getOrderById(orderId: string): PaymentOrderRecord | null {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM payment_orders WHERE id = ? LIMIT 1`);
  const row = stmt.get(orderId) as PaymentOrderRecord | undefined;
  return row ?? null;
}

export function getOrderByReference(reference: string): PaymentOrderRecord | null {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT * FROM payment_orders WHERE request_reference_number = ? LIMIT 1`
  );
  const row = stmt.get(reference) as PaymentOrderRecord | undefined;
  return row ?? null;
}

export function getOrderByCheckoutId(checkoutId: string): PaymentOrderRecord | null {
  const db = getDb();
  const stmt = db.prepare(`SELECT * FROM payment_orders WHERE checkout_id = ? LIMIT 1`);
  const row = stmt.get(checkoutId) as PaymentOrderRecord | undefined;
  return row ?? null;
}

/**
 * Atomically marks a verified Maya payment as PAID and inserts the user's skin entitlement.
 * Idempotent: repeated webhook deliveries for the same payment do not throw or double-grant.
 */
export function markOrderPaidAndGrantEntitlement(
  orderId: string,
  mayaPaymentId: string
): PaymentOrderRecord | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    const order = getOrderById(orderId);
    if (!order) {
      db.exec('ROLLBACK');
      return null;
    }

    if (order.status !== 'PAID') {
      const updateOrder = db.prepare(`
        UPDATE payment_orders
        SET status = 'PAID',
            maya_payment_id = ?,
            verified_at = ?,
            updated_at = ?
        WHERE id = ?
      `);
      updateOrder.run(mayaPaymentId, now, now, orderId);
    }

    const insertEntitlement = db.prepare(`
      INSERT OR IGNORE INTO verified_skin_entitlements (
        user_id,
        skin_id,
        order_id,
        maya_payment_id,
        amount_php,
        verified_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertEntitlement.run(
      order.user_id,
      order.skin_id,
      order.id,
      mayaPaymentId,
      order.amount_php,
      now
    );

    db.exec('COMMIT');
    return getOrderById(orderId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function markOrderTerminalStatus(
  orderId: string,
  status: 'FAILED' | 'CANCELLED' | 'EXPIRED'
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE payment_orders
    SET status = ?, updated_at = ?
    WHERE id = ? AND status = 'PENDING'
  `);
  stmt.run(status, now, orderId);
}
