import React, { useEffect, useRef, useState } from 'react';
import type { ConfirmationResult, RecaptchaVerifier, User } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import {
  confirmPhoneOtpCode,
  COUNTRY_DIAL_OPTIONS,
  createPhoneRecaptcha,
  formatE164Phone,
  isPhoneAuthEnabled,
  signInWithGoogle,
  startPhoneOtpSignIn,
  translateFirebaseAuthError,
} from '../game/auth';
import { ThemePalette } from '../game/constants';

interface AuthModalProps {
  theme: ThemePalette;
  reason?: string | null;
  hasGuestProgress?: boolean;
  onSuccess: (user: User) => void;
  onClose: () => void;
}

type AuthTab = 'google' | 'phone';

export const AuthModal: React.FC<AuthModalProps> = ({
  theme,
  reason,
  hasGuestProgress = false,
  onSuccess,
  onClose,
}) => {
  const phoneAuthEnabled = isPhoneAuthEnabled();
  const [tab, setTab] = useState<AuthTab>('google');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Phone OTP state
  const [dialCode, setDialCode] = useState('+63');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [sentPhoneLabel, setSentPhoneLabel] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerId = 'bca-signin-recaptcha-host';

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // Ignore cleanup errors
        }
        recaptchaRef.current = null;
      }
    };
  }, []);

  const resetRecaptcha = () => {
    if (recaptchaRef.current) {
      try {
        recaptchaRef.current.clear();
      } catch {
        // Ignore
      }
      recaptchaRef.current = null;
    }
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const user = await signInWithGoogle();
      onSuccess(user);
    } catch (err) {
      setError(translateFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || resendCooldown > 0) return;
    setError(null);
    setInfo(null);

    const e164 = formatE164Phone(dialCode, phoneInput);
    if (!e164) {
      setError('Please enter your phone number.');
      return;
    }

    setBusy(true);
    try {
      resetRecaptcha();
      const verifier = createPhoneRecaptcha(recaptchaContainerId);
      recaptchaRef.current = verifier;
      const confirmResult = await startPhoneOtpSignIn(e164, verifier);
      setConfirmation(confirmResult);
      setSentPhoneLabel(e164);
      setOtpCode('');
      setResendCooldown(60);
      setInfo(`Verification code sent to ${e164}. Enter the 6-digit code below.`);
    } catch (err) {
      resetRecaptcha();
      setError(translateFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !confirmation) return;
    setError(null);
    setBusy(true);
    try {
      const user = await confirmPhoneOtpCode(confirmation, otpCode);
      onSuccess(user);
    } catch (err) {
      setError(translateFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{
        backgroundColor: theme.isDark ? 'rgba(3, 6, 14, 0.84)' : 'rgba(15, 23, 42, 0.56)',
        backdropFilter: 'blur(6px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 space-y-5 relative shadow-2xl"
        style={{
          backgroundColor: theme.surfaceBg,
          borderColor: theme.borderStrong,
          color: theme.textPrimary,
          boxShadow: theme.blockGlow ? `0 0 36px ${theme.accentPrimary}26` : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: theme.accentPrimary }} />
              <h2 id="auth-modal-title" className="font-display text-xl font-bold tracking-tight">
                Player Sign In
              </h2>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
              {reason ||
                'Sign in to claim your Permanent Player ID, sync progress across devices, and battle online.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border flex items-center justify-center cursor-pointer shrink-0"
            style={{
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
              color: theme.textSecondary,
            }}
            aria-label="Close sign in dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Safe Guest Progress Migration Notice */}
        {hasGuestProgress && (
          <div
            className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5 text-xs leading-relaxed"
            style={{
              backgroundColor: `${theme.accentPrimary}14`,
              borderColor: `${theme.accentPrimary}55`,
              color: theme.textPrimary,
            }}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: theme.accentPrimary }} />
            <span>
              Your local guest XP, level, and match stats on this device will safely migrate to your
              cloud account on first sign-in.
            </span>
          </div>
        )}

        {/* Method Tabs (shown only when Phone OTP is enabled; otherwise Google is active with Coming Soon Phone option) */}
        {phoneAuthEnabled && (
          <div
            className="grid grid-cols-2 p-1 rounded-xl border gap-1"
            style={{
              backgroundColor: theme.boardBg,
              borderColor: theme.border,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTab('google');
                setError(null);
              }}
              className="h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              style={{
                backgroundColor: tab === 'google' ? theme.accentPrimary : 'transparent',
                color: tab === 'google' ? theme.accentPrimaryText : theme.textSecondary,
              }}
            >
              <span>Google Sign-In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('phone');
                setError(null);
              }}
              className="h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              style={{
                backgroundColor: tab === 'phone' ? theme.accentPrimary : 'transparent',
                color: tab === 'phone' ? theme.accentPrimaryText : theme.textSecondary,
              }}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone SMS OTP</span>
            </button>
          </div>
        )}

        {/* Feedback Banners */}
        {error && (
          <div
            className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5 text-xs leading-relaxed"
            style={{
              backgroundColor: `${theme.danger}18`,
              borderColor: theme.danger,
              color: theme.textPrimary,
            }}
            role="alert"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: theme.danger }} />
            <span>{error}</span>
          </div>
        )}

        {info && !error && (
          <div
            className="rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed"
            style={{
              backgroundColor: `${theme.accentPrimary}14`,
              borderColor: theme.accentPrimary,
              color: theme.textPrimary,
            }}
          >
            {info}
          </div>
        )}

        {/* Tab 1: Google Sign-In (Primary Active Login) */}
        {!phoneAuthEnabled || tab === 'google' ? (
          <div className="space-y-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleGoogleLogin()}
              className="w-full h-12 px-4 rounded-xl font-display text-sm font-bold tracking-wide flex items-center justify-center gap-2.5 transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: theme.accentPrimary,
                color: theme.accentPrimaryText,
                boxShadow: theme.blockGlow ? `0 6px 24px ${theme.accentPrimary}38` : 'none',
              }}
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.49-1.73 4.38-5.27 4.38-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.1 14.69 3.1 12.17 3.1 7.12 3.1 3.03 7.19 3.03 12.24s4.09 9.14 9.14 9.14c5.27 0 8.77-3.71 8.77-8.93 0-.6-.06-1.05-.14-1.35z"
                  />
                </svg>
              )}
              <span>{busy ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>

            {/* Disabled Phone Number Option (Coming Soon) when Phone Auth is not yet active */}
            {!phoneAuthEnabled && (
              <div
                className="w-full rounded-xl border px-4 py-3 flex items-center justify-between gap-3 opacity-60 select-none"
                style={{
                  backgroundColor: theme.boardBg,
                  borderColor: theme.border,
                  color: theme.textSecondary,
                }}
                aria-disabled="true"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Smartphone className="w-4 h-4 shrink-0" style={{ color: theme.textMuted }} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: theme.textPrimary }}>
                      Phone Number (SMS OTP)
                    </div>
                    <div className="text-[11px]" style={{ color: theme.textMuted }}>
                      Sign in with Google now — link a phone number later without losing progress
                    </div>
                  </div>
                </div>
                <span
                  className="text-[10px] font-mono-num font-bold uppercase tracking-wider px-2 py-1 rounded-md border shrink-0"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.border,
                    color: theme.textMuted,
                  }}
                >
                  Coming Soon
                </span>
              </div>
            )}

            <div
              className="rounded-xl border p-3.5 space-y-1.5 text-xs leading-relaxed"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.border,
                color: theme.textSecondary,
              }}
            >
              <div className="font-semibold" style={{ color: theme.textPrimary }}>
                Instant Cross-Device Cloud Sync
              </div>
              <p>
                {phoneAuthEnabled
                  ? 'Sync your Permanent Player ID, rank progression, 1v1 match history, and verified Tile Skins across devices. You can also link a Phone Number inside Account Settings without creating a duplicate account.'
                  : 'Sync your Permanent Player ID, rank progression, 1v1 match history, and verified Tile Skins across devices. When Phone Number login launches, you will be able to link it to this same account.'}
              </p>
            </div>
          </div>
        ) : (
          /* Tab 2: Phone Number SMS OTP (Prepared for Test Numbers & Future Live SMS) */
          <div className="space-y-4">
            {!confirmation ? (
              <form onSubmit={(e) => void handleSendOtp(e)} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-dial-code"
                    className="text-xs font-semibold block"
                    style={{ color: theme.textPrimary }}
                  >
                    Country / Region
                  </label>
                  <select
                    id="auth-dial-code"
                    value={dialCode}
                    onChange={(e) => setDialCode(e.target.value)}
                    disabled={busy}
                    className="w-full h-11 px-3 rounded-xl border text-xs font-medium outline-none"
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.borderStrong,
                      color: theme.textPrimary,
                    }}
                  >
                    {COUNTRY_DIAL_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.dial}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-phone-number"
                    className="text-xs font-semibold block"
                    style={{ color: theme.textPrimary }}
                  >
                    Mobile Number
                  </label>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-11 px-3 rounded-xl border flex items-center font-mono-num text-xs font-bold shrink-0"
                      style={{
                        backgroundColor: theme.boardBg,
                        borderColor: theme.border,
                        color: theme.accentPrimary,
                      }}
                    >
                      {dialCode}
                    </span>
                    <input
                      id="auth-phone-number"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      value={phoneInput}
                      disabled={busy}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="917 123 4567"
                      className="flex-1 h-11 px-3.5 rounded-xl border text-sm font-mono-num outline-none"
                      style={{
                        backgroundColor: theme.surfaceElevated,
                        borderColor: theme.borderStrong,
                        color: theme.textPrimary,
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || phoneInput.trim().length < 7}
                  className="w-full h-12 px-4 rounded-xl font-display text-sm font-bold tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: theme.accentPrimary,
                    color: theme.accentPrimaryText,
                  }}
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                  <span>{busy ? 'Sending Verification Code...' : 'Send SMS OTP Code'}</span>
                </button>

                <p className="text-[11px] leading-relaxed" style={{ color: theme.textMuted }}>
                  Protected by reCAPTCHA. Supports Firebase Console test phone numbers right away;
                  live carrier SMS requires enabling Phone Auth on a Firebase Blaze project.
                </p>
              </form>
            ) : (
              <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label
                      htmlFor="auth-otp-code"
                      className="font-semibold"
                      style={{ color: theme.textPrimary }}
                    >
                      6-Digit Verification Code
                    </label>
                    <span className="font-mono-num" style={{ color: theme.textMuted }}>
                      {sentPhoneLabel}
                    </span>
                  </div>
                  <input
                    id="auth-otp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    disabled={busy}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="w-full h-12 px-4 rounded-xl border text-center font-mono-num text-xl font-bold tracking-[0.35em] outline-none"
                    style={{
                      backgroundColor: theme.boardBg,
                      borderColor: theme.accentPrimary,
                      color: theme.textPrimary,
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || otpCode.length !== 6}
                  className="w-full h-12 px-4 rounded-xl font-display text-sm font-bold tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: theme.accentPrimary,
                    color: theme.accentPrimaryText,
                  }}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>{busy ? 'Verifying Code...' : 'Verify & Sign In'}</span>
                </button>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmation(null);
                      setOtpCode('');
                      setError(null);
                      setInfo(null);
                    }}
                    className="underline underline-offset-4 cursor-pointer"
                    style={{ color: theme.textSecondary }}
                  >
                    Change phone number
                  </button>
                  <span className="font-mono-num" style={{ color: theme.textMuted }}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Ready to resend'}
                  </span>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Invisible reCAPTCHA mount node (only mounted when Phone Auth is enabled) */}
        {phoneAuthEnabled && <div id={recaptchaContainerId} />}

        {/* Offline / Recovery Footer */}
        <div
          className="pt-3 border-t flex flex-col gap-1 text-[11px]"
          style={{ borderColor: theme.border, color: theme.textMuted }}
        >
          <div>
            {phoneAuthEnabled
              ? 'Lost access? Sign back in with Google Account Recovery or verify your linked phone number anytime.'
              : 'Lost access? Sign back in with Google Account Recovery anytime to restore your profile.'}
          </div>
          <div>
            1 Player vs. AI and 2 Player Local remain completely free to play without signing in.
          </div>
        </div>
      </div>
    </div>
  );
};
