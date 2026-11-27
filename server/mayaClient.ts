import type { Request } from 'express';

// Locked to Maya Sandbox API until explicit merchant approval & production cutover
const MAYA_SANDBOX_BASE_URL = 'https://pg-sandbox.paymaya.com';
const DEFAULT_SANDBOX_WEBHOOK_IPS = ['13.229.160.234', '3.1.199.75'];

export interface MayaCheckoutSessionResponse {
  checkoutId: string;
  redirectUrl: string;
}

export interface MayaVerifiedPayment {
  id: string;
  status: string;
  requestReferenceNumber: string;
  amount: number;
  currency: string;
}

function cleanSecret(raw: string | undefined): string {
  const val = (raw ?? '').trim();
  if (!val) return '';
  if (val.startsWith('MY_') || val.startsWith('YOUR_') || val === 'CHANGE_ME') {
    return '';
  }
  return val;
}

export function getMayaGatewayStatus(): {
  gatewayConfigured: boolean;
  provider: 'maya';
  environment: 'sandbox';
} {
  const publicKey = cleanSecret(process.env.MAYA_PUBLIC_KEY);
  const secretKey = cleanSecret(process.env.MAYA_SECRET_KEY);
  return {
    gatewayConfigured: Boolean(publicKey && secretKey),
    provider: 'maya',
    environment: 'sandbox',
  };
}

function getBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
}

/**
 * Creates a hosted Maya Checkout session in Sandbox mode.
 * Maya Checkout natively supports Maya Wallet, QRPh, GCash (when enabled on the merchant account), and cards.
 */
export async function createMayaSandboxCheckout(params: {
  orderId: string;
  requestReferenceNumber: string;
  skinId: string;
  skinName: string;
  amountPhp: number;
  buyerName: string;
  buyerEmail?: string;
  appBaseUrl: string;
}): Promise<MayaCheckoutSessionResponse> {
  const publicKey = cleanSecret(process.env.MAYA_PUBLIC_KEY);
  const secretKey = cleanSecret(process.env.MAYA_SECRET_KEY);
  if (!publicKey || !secretKey) {
    throw new Error('MAYA_NOT_CONFIGURED');
  }

  const safeBase = params.appBaseUrl.replace(/\/+$/, '');
  const encodedOrderId = encodeURIComponent(params.orderId);
  const [firstName, ...rest] = (params.buyerName || 'BlockClash Player').trim().split(/\s+/);
  const lastName = rest.join(' ') || 'Player';

  const payload = {
    totalAmount: {
      value: params.amountPhp.toFixed(2),
      currency: 'PHP',
    },
    buyer: {
      firstName: firstName.slice(0, 40),
      lastName: lastName.slice(0, 40),
      ...(params.buyerEmail ? { contact: { email: params.buyerEmail } } : {}),
    },
    items: [
      {
        name: `Block Clash: Arena — ${params.skinName} Tile Skin`,
        quantity: 1,
        code: params.skinId,
        description: `Cosmetic tile skin collection (${params.skinName})`,
        amount: {
          value: params.amountPhp.toFixed(2),
        },
        totalAmount: {
          value: params.amountPhp.toFixed(2),
        },
      },
    ],
    redirectUrl: {
      success: `${safeBase}/?payment=success&orderId=${encodedOrderId}`,
      failure: `${safeBase}/?payment=failed&orderId=${encodedOrderId}`,
      cancel: `${safeBase}/?payment=cancelled&orderId=${encodedOrderId}`,
    },
    requestReferenceNumber: params.requestReferenceNumber,
    metadata: {
      orderId: params.orderId,
      skinId: params.skinId,
      environment: 'sandbox',
    },
  };

  const response = await fetch(`${MAYA_SANDBOX_BASE_URL}/checkout/v1/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: getBasicAuthHeader(publicKey),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Maya Checkout request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    checkoutId?: string;
    redirectUrl?: string;
  };

  if (!data.checkoutId || !data.redirectUrl) {
    throw new Error('Maya Checkout response missing checkoutId or redirectUrl');
  }

  // Validate returned redirectUrl strictly points to Maya HTTPS domain
  const parsedRedirect = new URL(data.redirectUrl);
  if (
    parsedRedirect.protocol !== 'https:' ||
    !(
      parsedRedirect.hostname.endsWith('.paymaya.com') ||
      parsedRedirect.hostname.endsWith('.maya.ph')
    )
  ) {
    throw new Error('Unexpected redirect host returned by payment gateway');
  }

  return {
    checkoutId: data.checkoutId,
    redirectUrl: data.redirectUrl,
  };
}

/**
 * Server-to-server payment verification against Maya Payments API using the Secret Key.
 * Never trust webhook payloads or client redirects without verifying status, amount, currency, and reference directly with Maya.
 */
export async function verifyMayaSandboxPayment(
  paymentId: string
): Promise<MayaVerifiedPayment | null> {
  const secretKey = cleanSecret(process.env.MAYA_SECRET_KEY);
  if (!secretKey) {
    throw new Error('MAYA_NOT_CONFIGURED');
  }

  const cleanId = paymentId.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(cleanId)) {
    return null;
  }

  const response = await fetch(
    `${MAYA_SANDBOX_BASE_URL}/payments/v1/payments/${encodeURIComponent(cleanId)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: getBasicAuthHeader(secretKey),
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Maya payment verification failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    id?: string;
    status?: string;
    requestReferenceNumber?: string;
    amount?: string | number;
    currency?: string;
  };

  if (!data.id || !data.status) {
    return null;
  }

  return {
    id: data.id,
    status: String(data.status).toUpperCase(),
    requestReferenceNumber: String(data.requestReferenceNumber ?? ''),
    amount: Number(data.amount ?? 0),
    currency: String(data.currency ?? '').toUpperCase(),
  };
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

/**
 * Enforces Maya Sandbox webhook IP allowlisting since Maya online payment webhooks
 * rely on IP allowlisting rather than HMAC signatures.
 */
export function isAllowedMayaWebhookIp(req: Request): boolean {
  const configuredList = (process.env.MAYA_WEBHOOK_ALLOWLIST_IPS ?? '')
    .split(',')
    .map((s) => normalizeIp(s))
    .filter(Boolean);

  const allowlist = new Set(
    configuredList.length > 0 ? configuredList : DEFAULT_SANDBOX_WEBHOOK_IPS
  );

  const callerIp = normalizeIp(req.ip || req.socket.remoteAddress || '');
  return allowlist.has(callerIp);
}
