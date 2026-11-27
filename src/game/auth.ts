import {
  browserLocalPersistence,
  ConfirmationResult,
  GoogleAuthProvider,
  linkWithPhoneNumber,
  linkWithPopup,
  RecaptchaVerifier,
  setPersistence,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  unlink,
  User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  MatchHistoryRecord,
  PlayerMatchRecordSummary,
  resolveApiBaseUrl,
} from './matchmakingClient';
import { PlayerProfile } from './progression';
import { TileSkinId } from './skins';

/**
 * Modular authentication provider feature flags.
 * Google Sign-In is active now; Phone Number (SMS OTP) stays cleanly disabled
 * ("Coming Soon") until enabled in Firebase Console and toggled via:
 *   VITE_ENABLE_PHONE_AUTH="true"
 */
export const AUTH_PROVIDER_FLAGS = {
  googleEnabled: true,
  phoneOtpEnabled: import.meta.env.VITE_ENABLE_PHONE_AUTH === 'true',
} as const;

export function isPhoneAuthEnabled(): boolean {
  return AUTH_PROVIDER_FLAGS.phoneOtpEnabled;
}

export const ALLOWED_AVATAR_IDS = [
  'crest_cyan',
  'crest_amber',
  'crest_crimson',
  'crest_emerald',
  'crest_violet',
  'crest_cobalt',
  'crest_gold',
  'crest_prism',
] as const;

export type AvatarId = (typeof ALLOWED_AVATAR_IDS)[number];

export interface AvatarPreset {
  id: AvatarId;
  label: string;
  primary: string;
  secondary: string;
  bg: string;
  glyph: 'hex' | 'bolt' | 'flame' | 'shield' | 'crown' | 'prism' | 'star' | 'target';
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'crest_cyan',
    label: 'Volt Crest',
    primary: '#00F0FF',
    secondary: '#0284C7',
    bg: 'rgba(0, 240, 255, 0.14)',
    glyph: 'hex',
  },
  {
    id: 'crest_amber',
    label: 'Solar Core',
    primary: '#FBBF24',
    secondary: '#D97706',
    bg: 'rgba(251, 191, 36, 0.14)',
    glyph: 'bolt',
  },
  {
    id: 'crest_crimson',
    label: 'Blaze Vanguard',
    primary: '#FB7185',
    secondary: '#E11D48',
    bg: 'rgba(244, 63, 94, 0.14)',
    glyph: 'flame',
  },
  {
    id: 'crest_emerald',
    label: 'Aegis Pulse',
    primary: '#34D399',
    secondary: '#059669',
    bg: 'rgba(16, 185, 129, 0.14)',
    glyph: 'shield',
  },
  {
    id: 'crest_violet',
    label: 'Nebula Striker',
    primary: '#C084FC',
    secondary: '#7C3AED',
    bg: 'rgba(168, 85, 247, 0.14)',
    glyph: 'star',
  },
  {
    id: 'crest_cobalt',
    label: 'Apex Vector',
    primary: '#60A5FA',
    secondary: '#2563EB',
    bg: 'rgba(59, 130, 246, 0.14)',
    glyph: 'target',
  },
  {
    id: 'crest_gold',
    label: 'Sovereign Crown',
    primary: '#FDE047',
    secondary: '#CA8A04',
    bg: 'rgba(250, 204, 21, 0.16)',
    glyph: 'crown',
  },
  {
    id: 'crest_prism',
    label: 'Prism Overlord',
    primary: '#F472B6',
    secondary: '#00F0FF',
    bg: 'rgba(244, 114, 182, 0.16)',
    glyph: 'prism',
  },
];

export function getAvatarPreset(avatarId?: string | null): AvatarPreset {
  return AVATAR_PRESETS.find((a) => a.id === avatarId) ?? AVATAR_PRESETS[0];
}

export interface CountryDialOption {
  code: string;
  dial: string;
  label: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: 'PH', dial: '+63', label: 'Philippines (+63)' },
  { code: 'US', dial: '+1', label: 'United States / Canada (+1)' },
  { code: 'SG', dial: '+65', label: 'Singapore (+65)' },
  { code: 'JP', dial: '+81', label: 'Japan (+81)' },
  { code: 'KR', dial: '+82', label: 'South Korea (+82)' },
  { code: 'MY', dial: '+60', label: 'Malaysia (+60)' },
  { code: 'ID', dial: '+62', label: 'Indonesia (+62)' },
  { code: 'TH', dial: '+66', label: 'Thailand (+66)' },
  { code: 'VN', dial: '+84', label: 'Vietnam (+84)' },
  { code: 'AU', dial: '+61', label: 'Australia (+61)' },
  { code: 'GB', dial: '+44', label: 'United Kingdom (+44)' },
  { code: 'IN', dial: '+91', label: 'India (+91)' },
  { code: 'DE', dial: '+49', label: 'Germany (+49)' },
  { code: 'FR', dial: '+33', label: 'France (+33)' },
  { code: 'BR', dial: '+55', label: 'Brazil (+55)' },
];

export interface CloudPlayerProfile {
  uid: string;
  publicPlayerId: string;
  username: string;
  avatarId: AvatarId;
  photoUrl: string | null;
  level: number;
  currentXP: number;
  totalXP: number;
  totalKOs: number;
  totalWins: number;
  totalMatches: number;
  providers: string[];
  migratedLocalAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerAccountBundle {
  profile: CloudPlayerProfile;
  onlineRecord: PlayerMatchRecordSummary;
  onlineHistory: MatchHistoryRecord[];
  ownedSkinIds: TileSkinId[];
  equippedSkinId: TileSkinId;
}

export interface LeaderboardEntry {
  publicPlayerId: string;
  username: string;
  avatarId: AvatarId;
  level: number;
  totalWins: number;
  totalKOs: number;
  totalMatches: number;
}

export interface LinkedProviderSummary {
  hasGoogle: boolean;
  hasPhone: boolean;
  email: string | null;
  phoneNumber: string | null;
  providerCount: number;
}

let persistenceInitialized = false;

export async function ensureAuthPersistence(): Promise<void> {
  if (persistenceInitialized) return;
  persistenceInitialized = true;
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Fallback gracefully in restricted browser contexts
  }
}

export function getLinkedProviders(user: User | null): LinkedProviderSummary {
  if (!user) {
    return {
      hasGoogle: false,
      hasPhone: false,
      email: null,
      phoneNumber: null,
      providerCount: 0,
    };
  }
  const providerIds = new Set(user.providerData.map((p) => p.providerId));
  return {
    hasGoogle: providerIds.has('google.com'),
    hasPhone: providerIds.has('phone'),
    email:
      user.email ??
      user.providerData.find((p) => p.providerId === 'google.com')?.email ??
      null,
    phoneNumber:
      user.phoneNumber ??
      user.providerData.find((p) => p.providerId === 'phone')?.phoneNumber ??
      null,
    providerCount: user.providerData.length,
  };
}

export function translateFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in window was closed before completing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not yet authorized in Firebase Console (Authentication → Settings → Authorized domains).';
    case 'auth/operation-not-allowed':
      return 'Phone SMS sign-in is not yet enabled in Firebase Console. Please continue with Google Sign-In, or configure Firebase test phone numbers.';
    case 'auth/billing-not-enabled':
      return 'Live SMS OTP requires a Firebase Blaze plan. Please continue with Google Sign-In, or use a configured Firebase test phone number.';
    case 'auth/invalid-phone-number':
      return 'Please enter a valid phone number including digits without spaces or letters.';
    case 'auth/missing-phone-number':
      return 'Please enter your phone number first.';
    case 'auth/invalid-verification-code':
      return 'Invalid 6-digit verification code. Double-check the code and try again.';
    case 'auth/code-expired':
      return 'This verification code expired. Please request a new code.';
    case 'auth/too-many-requests':
      return 'Too many verification attempts. Please wait a minute before trying again.';
    case 'auth/captcha-check-failed':
      return 'Security verification failed. Please refresh the prompt and try again.';
    case 'auth/credential-already-in-use':
      return 'That sign-in method is already linked to another Block Clash account. Sign in with that account instead to avoid duplicate profiles.';
    case 'auth/provider-already-linked':
      return 'This sign-in method is already linked to your account.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with a different sign-in method. Sign in with your original method first, then link this method in Account Settings.';
    case 'auth/requires-recent-login':
      return 'For your security, please sign out and sign back in before modifying linked sign-in methods.';
    case 'auth/network-request-failed':
      return 'Network error while reaching authentication servers. Check your internet connection.';
    default:
      if (err instanceof Error && err.message) {
        return err.message;
      }
      return 'Authentication could not be completed. Please try again.';
  }
}

export function formatE164Phone(dialCode: string, localInput: string): string {
  const digits = localInput.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (localInput.trim().startsWith('+')) {
    return `+${digits}`;
  }
  const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  // Strip common Philippine/international leading trunk '0' when user enters e.g. 0917...
  const trimmedDigits = digits.startsWith('0') && digits.length >= 10 ? digits.slice(1) : digits;
  return `${cleanDial}${trimmedDigits}`;
}

export async function signInWithGoogle(): Promise<User> {
  await ensureAuthPersistence();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export function createPhoneRecaptcha(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
  });
}

export async function startPhoneOtpSignIn(
  e164Phone: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  if (!isPhoneAuthEnabled()) {
    throw new Error('Phone Number sign-in is coming soon. Please continue with Google Sign-In.');
  }
  await ensureAuthPersistence();
  if (!/^\+[1-9]\d{6,14}$/.test(e164Phone)) {
    throw new Error('Please enter a valid international phone number (e.g., +63 917 123 4567).');
  }
  return signInWithPhoneNumber(auth, e164Phone, verifier);
}

export async function confirmPhoneOtpCode(
  confirmation: ConfirmationResult,
  otpCode: string
): Promise<User> {
  const cleanCode = otpCode.replace(/[^\d]/g, '').slice(0, 6);
  if (cleanCode.length !== 6) {
    throw new Error('Please enter the 6-digit SMS verification code.');
  }
  const result = await confirmation.confirm(cleanCode);
  return result.user;
}

export async function linkGoogleToCurrentAccount(): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in first before linking Google.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await linkWithPopup(currentUser, provider);
  return result.user;
}

export async function startLinkPhoneToCurrentAccount(
  e164Phone: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  if (!isPhoneAuthEnabled()) {
    throw new Error('Phone Number account linking is coming soon.');
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in first before linking a phone number.');
  }
  if (!/^\+[1-9]\d{6,14}$/.test(e164Phone)) {
    throw new Error('Please enter a valid international phone number (e.g., +63 917 123 4567).');
  }
  return linkWithPhoneNumber(currentUser, e164Phone, verifier);
}

export async function confirmLinkPhoneOtpCode(
  confirmation: ConfirmationResult,
  otpCode: string
): Promise<User> {
  const cleanCode = otpCode.replace(/[^\d]/g, '').slice(0, 6);
  if (cleanCode.length !== 6) {
    throw new Error('Please enter the 6-digit SMS verification code.');
  }
  const result = await confirmation.confirm(cleanCode);
  return result.user;
}

export async function unlinkProviderFromAccount(providerId: 'google.com' | 'phone'): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to manage linked accounts.');
  }
  if (currentUser.providerData.length <= 1) {
    throw new Error(
      'You cannot unlink your only sign-in method. Link another method first to prevent losing access.'
    );
  }
  return unlink(currentUser, providerId);
}

export async function signOutPlayer(): Promise<void> {
  await signOut(auth);
}

// ============================================================================
// EXPRESS SERVER + CLOUD FIRESTORE PROFILE SYNC
// ============================================================================

export async function fetchServerPlayerBundle(user: User): Promise<PlayerAccountBundle | null> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${resolveApiBaseUrl()}/api/player/profile`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PlayerAccountBundle;
  } catch {
    return null;
  }
}

export async function updateServerPlayerIdentity(
  user: User,
  updates: { username?: string; avatarId?: AvatarId }
): Promise<{ ok: true; profile: CloudPlayerProfile } | { ok: false; message: string }> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${resolveApiBaseUrl()}/api/player/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(updates),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      profile?: CloudPlayerProfile;
      message?: string;
    };
    if (!res.ok || !data.ok || !data.profile) {
      return { ok: false, message: data.message || 'Could not update player profile.' };
    }
    return { ok: true, profile: data.profile };
  } catch {
    return { ok: false, message: 'Network error while updating profile.' };
  }
}

export async function syncProgressToServer(
  user: User,
  profile: PlayerProfile,
  isMigration = false
): Promise<CloudPlayerProfile | null> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${resolveApiBaseUrl()}/api/player/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        totalXP: profile.totalXP,
        totalKOs: profile.totalKOs,
        totalWins: profile.totalWins,
        totalMatches: profile.totalMatches,
        username: profile.nickname,
        isMigration,
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; profile?: CloudPlayerProfile };
    return data.profile ?? null;
  } catch {
    return null;
  }
}

export async function fetchPublicLeaderboard(limit = 15): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(
      `${resolveApiBaseUrl()}/api/leaderboard?limit=${encodeURIComponent(String(limit))}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: LeaderboardEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

/**
 * Mirrors PII-free player profile & progression to Cloud Firestore (/players/{uid})
 * for cross-device durability even across backend restarts.
 * If Firestore holds higher progression from another device, syncs it back up to Express.
 */
export async function syncProfileWithFirestore(
  user: User,
  serverProfile: CloudPlayerProfile,
  onlineRecord?: PlayerMatchRecordSummary | null
): Promise<CloudPlayerProfile> {
  const playerRef = doc(db, 'players', user.uid);
  const onlineWins = Math.max(0, Math.floor(onlineRecord?.wins ?? 0));
  const onlineLosses = Math.max(0, Math.floor(onlineRecord?.losses ?? 0));
  const onlineDraws = Math.max(0, Math.floor(onlineRecord?.draws ?? 0));

  try {
    const snap = await getDoc(playerRef);
    if (!snap.exists()) {
      await setDoc(playerRef, {
        uid: user.uid,
        publicPlayerId: serverProfile.publicPlayerId,
        username: serverProfile.username.slice(0, 16),
        avatarId: serverProfile.avatarId,
        level: serverProfile.level,
        currentXP: serverProfile.currentXP,
        totalXP: serverProfile.totalXP,
        totalKOs: serverProfile.totalKOs,
        totalWins: serverProfile.totalWins,
        totalMatches: serverProfile.totalMatches,
        onlineWins,
        onlineLosses,
        onlineDraws,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return serverProfile;
    }

    const remote = snap.data() as Partial<{
      publicPlayerId: string;
      username: string;
      avatarId: AvatarId;
      level: number;
      currentXP: number;
      totalXP: number;
      totalKOs: number;
      totalWins: number;
      totalMatches: number;
      onlineWins: number;
      onlineLosses: number;
      onlineDraws: number;
    }>;

    // If Cloud Firestore has higher XP/matches (e.g., from another device or server restart), reconcile upward
    const remoteXP = typeof remote.totalXP === 'number' ? remote.totalXP : 0;
    const remoteMatches = typeof remote.totalMatches === 'number' ? remote.totalMatches : 0;

    let resolvedProfile = serverProfile;
    if (remoteXP > serverProfile.totalXP || remoteMatches > serverProfile.totalMatches) {
      const merged = await syncProgressToServer(
        user,
        {
          level: typeof remote.level === 'number' ? remote.level : serverProfile.level,
          currentXP: typeof remote.currentXP === 'number' ? remote.currentXP : serverProfile.currentXP,
          totalXP: Math.max(remoteXP, serverProfile.totalXP),
          totalKOs: Math.max(
            typeof remote.totalKOs === 'number' ? remote.totalKOs : 0,
            serverProfile.totalKOs
          ),
          totalWins: Math.max(
            typeof remote.totalWins === 'number' ? remote.totalWins : 0,
            serverProfile.totalWins
          ),
          totalMatches: Math.max(remoteMatches, serverProfile.totalMatches),
          nickname: serverProfile.username,
          avatarId: serverProfile.avatarId,
          publicPlayerId: serverProfile.publicPlayerId,
        },
        false
      );
      if (merged) {
        resolvedProfile = merged;
      }
    }

    await updateDoc(playerRef, {
      username: resolvedProfile.username.slice(0, 16),
      avatarId: resolvedProfile.avatarId,
      level: resolvedProfile.level,
      currentXP: resolvedProfile.currentXP,
      totalXP: Math.max(remoteXP, resolvedProfile.totalXP),
      totalKOs: Math.max(
        typeof remote.totalKOs === 'number' ? remote.totalKOs : 0,
        resolvedProfile.totalKOs
      ),
      totalWins: Math.max(
        typeof remote.totalWins === 'number' ? remote.totalWins : 0,
        resolvedProfile.totalWins
      ),
      totalMatches: Math.max(remoteMatches, resolvedProfile.totalMatches),
      onlineWins: Math.max(
        typeof remote.onlineWins === 'number' ? remote.onlineWins : 0,
        onlineWins
      ),
      onlineLosses: Math.max(
        typeof remote.onlineLosses === 'number' ? remote.onlineLosses : 0,
        onlineLosses
      ),
      onlineDraws: Math.max(
        typeof remote.onlineDraws === 'number' ? remote.onlineDraws : 0,
        onlineDraws
      ),
      updatedAt: serverTimestamp(),
    });

    return resolvedProfile;
  } catch {
    // Non-fatal if Firestore is temporarily unreachable; Express SQLite remains authoritative
    return serverProfile;
  }
}
