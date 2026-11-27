import { GoogleAuthProvider, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth } from '../firebase';
import { resolveApiBaseUrl } from './matchmakingClient';
import { TileSkinId } from './skins';

export const PAYMENTS_UNAVAILABLE_MESSAGE =
  'Real payments are not yet available. Please try again later.';

export type PaymentMethodOption = 'gcash' | 'maya' | 'qrph' | 'card';

export interface PaymentGatewayConfig {
  gatewayConfigured: boolean;
  provider: 'maya';
  environment: 'sandbox';
  message: string;
}

export interface VerifiedEntitlementsResponse {
  authenticated: boolean;
  userId: string | null;
  ownedSkinIds: TileSkinId[];
  equippedSkinId: TileSkinId;
}

export type CheckoutAttemptResult =
  | {
      ok: true;
      orderId: string;
      checkoutId: string;
      redirectUrl: string;
      environment: 'sandbox';
    }
  | {
      ok: false;
      code:
        | 'PAYMENTS_NOT_AVAILABLE'
        | 'AUTH_REQUIRED'
        | 'ALREADY_OWNED'
        | 'GATEWAY_ERROR'
        | 'OFFLINE';
      message: string;
      ownedSkinIds?: TileSkinId[];
    };

export interface EquipSkinResult {
  ok: boolean;
  equippedSkinId: TileSkinId;
  ownedSkinIds: TileSkinId[];
  message?: string;
}

export interface OrderStatusResponse {
  orderId: string;
  skinId: TileSkinId;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  ownedSkinIds: TileSkinId[];
  equippedSkinId: TileSkinId;
}

export async function signInForMarketplace(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutMarketplace(): Promise<void> {
  await signOut(auth);
}

export async function fetchPaymentGatewayConfig(): Promise<PaymentGatewayConfig> {
  try {
    const res = await fetch(`${resolveApiBaseUrl()}/api/payments/config`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        gatewayConfigured: false,
        provider: 'maya',
        environment: 'sandbox',
        message: PAYMENTS_UNAVAILABLE_MESSAGE,
      };
    }
    const data = (await res.json()) as Partial<PaymentGatewayConfig>;
    return {
      gatewayConfigured: Boolean(data.gatewayConfigured),
      provider: 'maya',
      environment: 'sandbox',
      message: data.gatewayConfigured
        ? data.message || 'Maya Checkout (Sandbox) is ready.'
        : PAYMENTS_UNAVAILABLE_MESSAGE,
    };
  } catch {
    return {
      gatewayConfigured: false,
      provider: 'maya',
      environment: 'sandbox',
      message: PAYMENTS_UNAVAILABLE_MESSAGE,
    };
  }
}

/**
 * Fetches verified server-side skin entitlements and equipped loadout tied to the signed-in user.
 * Never grants or equips premium skins locally when signed out, offline, or on error.
 */
export async function fetchVerifiedEntitlements(
  user: User | null
): Promise<VerifiedEntitlementsResponse> {
  if (!user) {
    return {
      authenticated: false,
      userId: null,
      ownedSkinIds: ['classic'],
      equippedSkinId: 'classic',
    };
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${resolveApiBaseUrl()}/api/entitlements`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      return {
        authenticated: false,
        userId: null,
        ownedSkinIds: ['classic'],
        equippedSkinId: 'classic',
      };
    }
    const data = (await res.json()) as {
      authenticated?: boolean;
      userId?: string | null;
      ownedSkinIds?: TileSkinId[];
      equippedSkinId?: TileSkinId;
    };
    return {
      authenticated: Boolean(data.authenticated),
      userId: data.userId ?? null,
      ownedSkinIds: Array.isArray(data.ownedSkinIds) ? data.ownedSkinIds : ['classic'],
      equippedSkinId: data.equippedSkinId ?? 'classic',
    };
  } catch {
    return {
      authenticated: false,
      userId: null,
      ownedSkinIds: ['classic'],
      equippedSkinId: 'classic',
    };
  }
}

/**
 * Requests equipping a tile skin via the authoritative server endpoint POST /api/skins/equip.
 * Free 'classic' works even offline; any premium skin is strictly verified against server PAID records.
 */
export async function requestEquipSkin(
  user: User | null,
  skinId: TileSkinId
): Promise<EquipSkinResult> {
  if (skinId === 'classic' && (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return {
      ok: true,
      equippedSkinId: 'classic',
      ownedSkinIds: ['classic'],
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (user) {
      const idToken = await user.getIdToken();
      headers.Authorization = `Bearer ${idToken}`;
    }

    const res = await fetch(`${resolveApiBaseUrl()}/api/skins/equip`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ skinId }),
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      equippedSkinId?: TileSkinId;
      ownedSkinIds?: TileSkinId[];
      message?: string;
    };

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        equippedSkinId: data.equippedSkinId ?? 'classic',
        ownedSkinIds: Array.isArray(data.ownedSkinIds) ? data.ownedSkinIds : ['classic'],
        message:
          data.message ||
          'Premium skin is locked. Complete a verified payment before equipping.',
      };
    }

    return {
      ok: true,
      equippedSkinId: data.equippedSkinId ?? 'classic',
      ownedSkinIds: Array.isArray(data.ownedSkinIds) ? data.ownedSkinIds : ['classic'],
    };
  } catch {
    if (skinId === 'classic') {
      return {
        ok: true,
        equippedSkinId: 'classic',
        ownedSkinIds: ['classic'],
      };
    }
    return {
      ok: false,
      equippedSkinId: 'classic',
      ownedSkinIds: ['classic'],
      message: 'Unable to verify skin ownership with the server.',
    };
  }
}

/**
 * Requests a server-created Maya Checkout (Sandbox) session for a selected payment method.
 * Selecting or submitting ANY payment method NEVER unlocks or equips a skin on the client.
 */
export async function startMayaCheckout(
  user: User | null,
  skinId: TileSkinId,
  paymentMethod: PaymentMethodOption
): Promise<CheckoutAttemptResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      code: 'OFFLINE',
      message: PAYMENTS_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (user) {
      const idToken = await user.getIdToken();
      headers.Authorization = `Bearer ${idToken}`;
    }

    const res = await fetch(`${resolveApiBaseUrl()}/api/payments/maya/checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ skinId, paymentMethod }),
      cache: 'no-store',
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      orderId?: string;
      checkoutId?: string;
      redirectUrl?: string;
      ownedSkinIds?: TileSkinId[];
    };

    if (res.status === 503 || data.error === 'PAYMENTS_NOT_AVAILABLE') {
      return {
        ok: false,
        code: 'PAYMENTS_NOT_AVAILABLE',
        message: data.message || PAYMENTS_UNAVAILABLE_MESSAGE,
      };
    }

    if (res.status === 401 || data.error === 'AUTH_REQUIRED') {
      return {
        ok: false,
        code: 'AUTH_REQUIRED',
        message: data.message || 'Please sign in with Google to purchase premium skins.',
      };
    }

    if (res.status === 409 || data.error === 'ALREADY_OWNED') {
      return {
        ok: false,
        code: 'ALREADY_OWNED',
        message: data.message || 'You already own this tile skin collection.',
        ownedSkinIds: data.ownedSkinIds,
      };
    }

    if (!res.ok || !data.redirectUrl || !data.orderId || !data.checkoutId) {
      return {
        ok: false,
        code: 'GATEWAY_ERROR',
        message: data.message || PAYMENTS_UNAVAILABLE_MESSAGE,
      };
    }

    return {
      ok: true,
      orderId: data.orderId,
      checkoutId: data.checkoutId,
      redirectUrl: data.redirectUrl,
      environment: 'sandbox',
    };
  } catch {
    return {
      ok: false,
      code: 'PAYMENTS_NOT_AVAILABLE',
      message: PAYMENTS_UNAVAILABLE_MESSAGE,
    };
  }
}

export async function verifyOrderStatus(
  user: User,
  orderId: string
): Promise<OrderStatusResponse | null> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(
      `${resolveApiBaseUrl()}/api/payments/orders/${encodeURIComponent(orderId)}/status`,
      {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as OrderStatusResponse;
  } catch {
    return null;
  }
}
