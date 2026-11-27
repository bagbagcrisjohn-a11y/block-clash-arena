import React, { useEffect, useRef, useState } from 'react';
import type { ConfirmationResult, RecaptchaVerifier, User } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  Copy,
  History,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  ShieldCheck,
  Smartphone,
  Trophy,
  Unlink,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  AVATAR_PRESETS,
  AvatarId,
  CloudPlayerProfile,
  confirmLinkPhoneOtpCode,
  COUNTRY_DIAL_OPTIONS,
  createPhoneRecaptcha,
  fetchPublicLeaderboard,
  formatE164Phone,
  getLinkedProviders,
  isPhoneAuthEnabled,
  LeaderboardEntry,
  linkGoogleToCurrentAccount,
  startLinkPhoneToCurrentAccount,
  translateFirebaseAuthError,
  unlinkProviderFromAccount,
} from '../game/auth';
import { ThemePalette } from '../game/constants';
import { MatchHistoryRecord, PlayerMatchRecordSummary } from '../game/matchmakingClient';
import { getRankTier, MAX_PLAYER_LEVEL, xpNeededForNextLevel } from '../game/progression';
import { PlayerAvatar } from './PlayerAvatar';
import { RankBadge } from './RankBadge';

interface PlayerAccountModalProps {
  theme: ThemePalette;
  user: User;
  cloudProfile: CloudPlayerProfile | null;
  onlineRecord: PlayerMatchRecordSummary;
  onlineHistory: MatchHistoryRecord[];
  onSaveIdentity: (updates: {
    username: string;
    avatarId: AvatarId;
  }) => Promise<{ ok: boolean; message?: string }>;
  onProvidersChanged: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}

type AccountTab = 'profile' | 'security' | 'leaderboard';

export const PlayerAccountModal: React.FC<PlayerAccountModalProps> = ({
  theme,
  user,
  cloudProfile,
  onlineRecord,
  onlineHistory,
  onSaveIdentity,
  onProvidersChanged,
  onSignOut,
  onClose,
}) => {
  const [tab, setTab] = useState<AccountTab>('profile');
  const [usernameInput, setUsernameInput] = useState(cloudProfile?.username || 'Pilot');
  const [avatarInput, setAvatarInput] = useState<AvatarId>(
    cloudProfile?.avatarId || 'crest_cyan'
  );
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null
  );

  // Account linking state
  const [linkBusy, setLinkBusy] = useState(false);
  const [showPhoneLinkForm, setShowPhoneLinkForm] = useState(false);
  const [dialCode, setDialCode] = useState('+63');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [linkConfirm, setLinkConfirm] = useState<ConfirmationResult | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerId = 'bca-link-recaptcha-host';

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const phoneAuthEnabled = isPhoneAuthEnabled();
  const providers = getLinkedProviders(user);
  const level = cloudProfile?.level ?? 1;
  const currentXP = cloudProfile?.currentXP ?? 0;
  const tier = getRankTier(level);
  const neededXP = xpNeededForNextLevel(level);
  const xpPct =
    level >= MAX_PLAYER_LEVEL
      ? 100
      : neededXP > 0
        ? Math.min(100, Math.round((currentXP / neededXP) * 100))
        : 0;

  useEffect(() => {
    if (cloudProfile) {
      setUsernameInput(cloudProfile.username);
      setAvatarInput(cloudProfile.avatarId);
    }
  }, [cloudProfile]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (tab !== 'leaderboard') return;
    setLeaderboardLoading(true);
    void fetchPublicLeaderboard(20).then((rows) => {
      setLeaderboard(rows);
      setLeaderboardLoading(false);
    });
  }, [tab]);

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try {
          recaptchaRef.current.clear();
        } catch {
          // Ignore
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

  const handleCopyPlayerId = async () => {
    if (!cloudProfile?.publicPlayerId) return;
    try {
      await navigator.clipboard.writeText(cloudProfile.publicPlayerId);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    const res = await onSaveIdentity({
      username: usernameInput.trim(),
      avatarId: avatarInput,
    });
    setSaving(false);
    if (res.ok) {
      setStatusMsg({ tone: 'success', text: 'Profile saved and synced to cloud.' });
    } else {
      setStatusMsg({ tone: 'error', text: res.message || 'Could not save profile changes.' });
    }
  };

  const handleLinkGoogle = async () => {
    setLinkBusy(true);
    setStatusMsg(null);
    try {
      await linkGoogleToCurrentAccount();
      await onProvidersChanged();
      setStatusMsg({
        tone: 'success',
        text: 'Google account linked! Both methods now share your exact Player ID and progress.',
      });
    } catch (err) {
      setStatusMsg({ tone: 'error', text: translateFirebaseAuthError(err) });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleSendLinkPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkBusy || resendCooldown > 0) return;
    setStatusMsg(null);
    const e164 = formatE164Phone(dialCode, phoneInput);
    if (!e164) {
      setStatusMsg({ tone: 'error', text: 'Enter a valid phone number.' });
      return;
    }
    setLinkBusy(true);
    try {
      resetRecaptcha();
      const verifier = createPhoneRecaptcha(recaptchaContainerId);
      recaptchaRef.current = verifier;
      const confirmResult = await startLinkPhoneToCurrentAccount(e164, verifier);
      setLinkConfirm(confirmResult);
      setOtpCode('');
      setResendCooldown(60);
      setStatusMsg({ tone: 'success', text: `Verification code sent to ${e164}.` });
    } catch (err) {
      resetRecaptcha();
      setStatusMsg({ tone: 'error', text: translateFirebaseAuthError(err) });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleConfirmLinkPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (linkBusy || !linkConfirm) return;
    setLinkBusy(true);
    setStatusMsg(null);
    try {
      await confirmLinkPhoneOtpCode(linkConfirm, otpCode);
      await onProvidersChanged();
      setLinkConfirm(null);
      setShowPhoneLinkForm(false);
      setPhoneInput('');
      setOtpCode('');
      setStatusMsg({
        tone: 'success',
        text: 'Phone number linked to your Permanent Player ID! Duplicate accounts prevented.',
      });
    } catch (err) {
      setStatusMsg({ tone: 'error', text: translateFirebaseAuthError(err) });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleUnlink = async (providerId: 'google.com' | 'phone') => {
    setLinkBusy(true);
    setStatusMsg(null);
    try {
      await unlinkProviderFromAccount(providerId);
      await onProvidersChanged();
      setStatusMsg({ tone: 'success', text: 'Sign-in method unlinked safely.' });
    } catch (err) {
      setStatusMsg({ tone: 'error', text: translateFirebaseAuthError(err) });
    } finally {
      setLinkBusy(false);
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
      aria-labelledby="player-account-title"
    >
      <div
        className="w-full max-w-2xl max-h-[90dvh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: theme.surfaceBg,
          borderColor: theme.borderStrong,
          color: theme.textPrimary,
        }}
      >
        {/* Top Header */}
        <div
          className="px-5 sm:px-6 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: theme.border }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <PlayerAvatar avatarId={avatarInput} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="player-account-title"
                  className="font-display text-lg font-bold tracking-tight truncate"
                >
                  {cloudProfile?.username || 'Player Account'}
                </h2>
                <RankBadge level={level} size="xs" />
              </div>
              <div className="flex items-center gap-2 text-xs font-mono-num" style={{ color: theme.textMuted }}>
                <span>ID: {cloudProfile?.publicPlayerId || 'Provisioning...'}</span>
                {cloudProfile?.publicPlayerId && (
                  <button
                    type="button"
                    onClick={() => void handleCopyPlayerId()}
                    className="inline-flex items-center gap-1 underline underline-offset-2 cursor-pointer"
                    style={{ color: theme.accentPrimary }}
                  >
                    {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedId ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
            </div>
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
            aria-label="Close account modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          className="px-5 sm:px-6 pt-3 pb-0 border-b flex items-center gap-2 overflow-x-auto shrink-0"
          style={{ borderColor: theme.border }}
        >
          {(
            [
              { id: 'profile', label: 'Profile & Stats', icon: UserIcon },
              { id: 'security', label: 'Account Linking & Recovery', icon: Link2 },
              { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setStatusMsg(null);
                }}
                className="px-3.5 py-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap"
                style={{
                  borderColor: active ? theme.accentPrimary : 'transparent',
                  color: active ? theme.accentPrimary : theme.textSecondary,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {statusMsg && (
            <div
              className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5 text-xs leading-relaxed"
              style={{
                backgroundColor:
                  statusMsg.tone === 'success' ? `${theme.accentPrimary}16` : `${theme.danger}18`,
                borderColor: statusMsg.tone === 'success' ? theme.accentPrimary : theme.danger,
                color: theme.textPrimary,
              }}
              role="status"
            >
              {statusMsg.tone === 'success' ? (
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: theme.accentPrimary }} />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: theme.danger }} />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* TAB 1: PROFILE & STATS */}
          {tab === 'profile' && (
            <>
              {/* Rank & Online 1v1 Stats Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: 'Online Wins', value: onlineRecord.wins, color: theme.accentP1 },
                  { label: 'Online Losses', value: onlineRecord.losses, color: theme.danger },
                  { label: 'Career KOs', value: cloudProfile?.totalKOs ?? 0, color: theme.accentPrimary },
                  { label: 'Total Matches', value: cloudProfile?.totalMatches ?? 0, color: theme.textPrimary },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border p-3 text-center"
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.border,
                    }}
                  >
                    <div className="font-mono-num text-xl font-bold" style={{ color: stat.color }}>
                      {stat.value}
                    </div>
                    <div className="text-[11px]" style={{ color: theme.textMuted }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* XP Progress Bar */}
              <div
                className="rounded-xl border p-4 space-y-2"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                }}
              >
                <div className="flex items-center justify-between text-xs font-mono-num">
                  <span className="font-semibold" style={{ color: tier.primaryColor }}>
                    LVL {level} · {tier.name}
                  </span>
                  <span style={{ color: theme.textMuted }}>
                    {level >= MAX_PLAYER_LEVEL
                      ? 'MAX LEVEL'
                      : `${currentXP.toLocaleString()} / ${neededXP.toLocaleString()} XP`}
                  </span>
                </div>
                <div
                  className="w-full h-2.5 rounded-sm overflow-hidden border"
                  style={{ backgroundColor: theme.boardBg, borderColor: theme.border }}
                >
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${xpPct}%`,
                      background: `linear-gradient(90deg, ${tier.secondaryColor}, ${tier.primaryColor})`,
                    }}
                  />
                </div>
              </div>

              {/* Customize Username & Avatar */}
              <form
                onSubmit={(e) => void handleSaveProfile(e)}
                className="rounded-xl border p-4 space-y-4"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                }}
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-username-input"
                    className="text-xs font-semibold block"
                    style={{ color: theme.textPrimary }}
                  >
                    Arena Callsign (2–16 characters)
                  </label>
                  <input
                    id="profile-username-input"
                    type="text"
                    minLength={2}
                    maxLength={16}
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value.slice(0, 16))}
                    className="w-full h-11 px-3.5 rounded-xl border text-sm font-semibold outline-none"
                    style={{
                      backgroundColor: theme.boardBg,
                      borderColor: theme.borderStrong,
                      color: theme.textPrimary,
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold" style={{ color: theme.textPrimary }}>
                    Arena Crest Avatar
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {AVATAR_PRESETS.map((preset) => {
                      const selected = avatarInput === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setAvatarInput(preset.id)}
                          className="p-1.5 rounded-xl border flex flex-col items-center justify-center transition-transform cursor-pointer"
                          style={{
                            backgroundColor: selected ? `${preset.primary}20` : theme.boardBg,
                            borderColor: selected ? preset.primary : theme.border,
                            transform: selected ? 'scale(1.04)' : undefined,
                          }}
                          aria-label={preset.label}
                        >
                          <PlayerAvatar avatarId={preset.id} size="sm" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving || usernameInput.trim().length < 2}
                  className="h-11 px-5 rounded-xl font-display text-xs font-bold tracking-wide inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: theme.accentPrimary,
                    color: theme.accentPrimaryText,
                  }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{saving ? 'Saving to Cloud...' : 'Save Profile'}</span>
                </button>
              </form>

              {/* Recent Verified 1v1 Match History */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" style={{ color: theme.accentPrimary }} />
                    <span>Recent Online 1v1 Matches</span>
                  </span>
                  <span className="font-mono-num" style={{ color: theme.textMuted }}>
                    {onlineRecord.matchesPlayed} Recorded
                  </span>
                </div>
                {onlineHistory.length === 0 ? (
                  <div
                    className="rounded-xl border p-4 text-center text-xs"
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.border,
                      color: theme.textMuted,
                    }}
                  >
                    No online 1v1 matches completed yet. Enter Automatic 1v1 Matchmaking to log your
                    verified results!
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {onlineHistory.slice(0, 8).map((item) => {
                      const resultColor =
                        item.result === 'win'
                          ? theme.accentP1
                          : item.result === 'loss'
                            ? theme.danger
                            : theme.textSecondary;
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          style={{
                            backgroundColor: theme.surfaceElevated,
                            borderColor: theme.border,
                          }}
                        >
                          <div className="min-w-0">
                            <span className="font-mono-num font-bold uppercase mr-2" style={{ color: resultColor }}>
                              {item.result}
                            </span>
                            <span className="font-semibold">vs. {item.opponentName}</span>
                            <div className="text-[11px]" style={{ color: theme.textMuted }}>
                              {item.finishReason}
                            </div>
                          </div>
                          <div className="font-mono-num font-bold shrink-0">
                            {item.myKos} – {item.opponentKos} KO
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: ACCOUNT LINKING & RECOVERY */}
          {tab === 'security' && (
            <div className="space-y-4">
              <div
                className="rounded-xl border p-4 space-y-1.5 text-xs leading-relaxed"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                  color: theme.textSecondary,
                }}
              >
                <div className="font-semibold" style={{ color: theme.textPrimary }}>
                  Duplicate Account Prevention &amp; Backup Recovery
                </div>
                <p>
                  {phoneAuthEnabled ? (
                    <>
                      Link both your Google account and Phone Number to your Permanent Player ID (
                      <span
                        className="font-mono-num font-semibold"
                        style={{ color: theme.accentPrimary }}
                      >
                        {cloudProfile?.publicPlayerId}
                      </span>
                      ). Signing in with either method always loads this exact profile, rank, match
                      history, and verified Tile Skins.
                    </>
                  ) : (
                    <>
                      Your Permanent Player ID (
                      <span
                        className="font-mono-num font-semibold"
                        style={{ color: theme.accentPrimary }}
                      >
                        {cloudProfile?.publicPlayerId}
                      </span>
                      ) is protected by Google Sign-In. When Phone Number (SMS OTP) launches, you
                      will be able to link it right here as a backup sign-in method without creating
                      a duplicate account.
                    </>
                  )}
                </p>
              </div>

              {/* Google Provider Card */}
              <div
                className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: providers.hasGoogle ? `${theme.accentPrimary}66` : theme.border,
                }}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <span>Google Account</span>
                    <span
                      className="text-[11px] font-mono-num font-bold"
                      style={{ color: providers.hasGoogle ? theme.accentP1 : theme.textMuted }}
                    >
                      {providers.hasGoogle ? 'LINKED' : 'NOT LINKED'}
                    </span>
                  </div>
                  <div className="text-xs truncate" style={{ color: theme.textMuted }}>
                    {providers.email || 'Attach Gmail / Google Sign-In as a verified login method'}
                  </div>
                </div>
                {providers.hasGoogle ? (
                  <button
                    type="button"
                    disabled={linkBusy || providers.providerCount <= 1}
                    onClick={() => void handleUnlink('google.com')}
                    className="h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
                    style={{
                      backgroundColor: theme.boardBg,
                      borderColor: theme.border,
                      color: theme.textSecondary,
                    }}
                    title={
                      providers.providerCount <= 1
                        ? 'Link Phone Number first before unlinking Google'
                        : 'Unlink Google Sign-In'
                    }
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Unlink</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={linkBusy}
                    onClick={() => void handleLinkGoogle()}
                    className="h-9 px-3.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    style={{
                      backgroundColor: theme.accentPrimary,
                      color: theme.accentPrimaryText,
                    }}
                  >
                    {linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    <span>Link Google</span>
                  </button>
                )}
              </div>

              {/* Phone Provider Card */}
              <div
                className={`rounded-xl border p-4 space-y-3 ${!providers.hasPhone && !phoneAuthEnabled ? 'opacity-70' : ''}`}
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: providers.hasPhone ? `${theme.accentPrimary}66` : theme.border,
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <Smartphone
                        className="w-4 h-4"
                        style={{ color: phoneAuthEnabled ? theme.accentPrimary : theme.textMuted }}
                      />
                      <span>Phone Number (SMS OTP)</span>
                      <span
                        className="text-[11px] font-mono-num font-bold"
                        style={{ color: providers.hasPhone ? theme.accentP1 : theme.textMuted }}
                      >
                        {providers.hasPhone
                          ? 'LINKED'
                          : phoneAuthEnabled
                            ? 'NOT LINKED'
                            : 'COMING SOON'}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: theme.textMuted }}>
                      {providers.phoneNumber ||
                        (phoneAuthEnabled
                          ? 'Link a verified mobile number as a backup login without creating a duplicate account'
                          : 'Coming soon — you will be able to link a phone number to this exact account once SMS verification launches')}
                    </div>
                  </div>
                  {providers.hasPhone ? (
                    <button
                      type="button"
                      disabled={linkBusy || providers.providerCount <= 1}
                      onClick={() => void handleUnlink('phone')}
                      className="h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
                      style={{
                        backgroundColor: theme.boardBg,
                        borderColor: theme.border,
                        color: theme.textSecondary,
                      }}
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>Unlink</span>
                    </button>
                  ) : phoneAuthEnabled ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowPhoneLinkForm((prev) => !prev);
                        setLinkConfirm(null);
                      }}
                      className="h-9 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                      style={{
                        backgroundColor: theme.boardBg,
                        borderColor: theme.accentPrimary,
                        color: theme.accentPrimary,
                      }}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{showPhoneLinkForm ? 'Cancel' : 'Link Phone'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="h-9 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-not-allowed opacity-60 shrink-0"
                      style={{
                        backgroundColor: theme.boardBg,
                        borderColor: theme.border,
                        color: theme.textMuted,
                      }}
                    >
                      <span>Coming Soon</span>
                    </button>
                  )}
                </div>

                {!providers.hasPhone && phoneAuthEnabled && showPhoneLinkForm && (
                  <div className="pt-3 border-t space-y-3" style={{ borderColor: theme.border }}>
                    {!linkConfirm ? (
                      <form onSubmit={(e) => void handleSendLinkPhoneOtp(e)} className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <select
                            value={dialCode}
                            onChange={(e) => setDialCode(e.target.value)}
                            disabled={linkBusy}
                            className="h-10 px-2.5 rounded-lg border text-xs outline-none"
                            style={{
                              backgroundColor: theme.boardBg,
                              borderColor: theme.borderStrong,
                              color: theme.textPrimary,
                            }}
                          >
                            {COUNTRY_DIAL_OPTIONS.map((opt) => (
                              <option key={opt.code} value={opt.dial}>
                                {opt.code} ({opt.dial})
                              </option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            value={phoneInput}
                            disabled={linkBusy}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder="917 123 4567"
                            className="sm:col-span-2 h-10 px-3 rounded-lg border text-xs font-mono-num outline-none"
                            style={{
                              backgroundColor: theme.boardBg,
                              borderColor: theme.borderStrong,
                              color: theme.textPrimary,
                            }}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={linkBusy || phoneInput.trim().length < 7}
                          className="h-10 px-4 rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                          style={{
                            backgroundColor: theme.accentPrimary,
                            color: theme.accentPrimaryText,
                          }}
                        >
                          {linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
                          <span>Send OTP to Link Phone</span>
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={(e) => void handleConfirmLinkPhone(e)} className="space-y-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={otpCode}
                            disabled={linkBusy}
                            onChange={(e) =>
                              setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))
                            }
                            placeholder="6-digit OTP"
                            className="flex-1 h-10 px-3 rounded-lg border font-mono-num text-sm font-bold tracking-widest outline-none"
                            style={{
                              backgroundColor: theme.boardBg,
                              borderColor: theme.accentPrimary,
                              color: theme.textPrimary,
                            }}
                          />
                          <button
                            type="submit"
                            disabled={linkBusy || otpCode.length !== 6}
                            className="h-10 px-4 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            style={{
                              backgroundColor: theme.accentPrimary,
                              color: theme.accentPrimaryText,
                            }}
                          >
                            {linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                            <span>Confirm Link</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {phoneAuthEnabled && <div id={recaptchaContainerId} />}
            </div>
          )}

          {/* TAB 3: PUBLIC LEADERBOARD */}
          {tab === 'leaderboard' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">Top Registered Arena Pilots</span>
                <span style={{ color: theme.textMuted }}>Ranked by Wins · Level · XP</span>
              </div>
              {leaderboardLoading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-xs" style={{ color: theme.textMuted }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading standings...</span>
                </div>
              ) : leaderboard.length === 0 ? (
                <div
                  className="rounded-xl border p-6 text-center text-xs"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.border,
                    color: theme.textMuted,
                  }}
                >
                  No ranked players yet. Complete matches to climb the Arena leaderboard!
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry, idx) => {
                    const isMe = entry.publicPlayerId === cloudProfile?.publicPlayerId;
                    return (
                      <div
                        key={entry.publicPlayerId}
                        className="rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                        style={{
                          backgroundColor: isMe ? `${theme.accentPrimary}14` : theme.surfaceElevated,
                          borderColor: isMe ? theme.accentPrimary : theme.border,
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-6 text-center font-mono-num font-bold shrink-0"
                            style={{ color: idx < 3 ? theme.accentPrimary : theme.textMuted }}
                          >
                            #{idx + 1}
                          </span>
                          <PlayerAvatar avatarId={entry.avatarId} size="xs" />
                          <div className="min-w-0">
                            <div className="font-semibold truncate flex items-center gap-1.5">
                              <span>{entry.username}</span>
                              {isMe && (
                                <span
                                  className="text-[10px] font-mono-num font-bold"
                                  style={{ color: theme.accentPrimary }}
                                >
                                  (YOU)
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono-num" style={{ color: theme.textMuted }}>
                              {entry.publicPlayerId}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <RankBadge level={entry.level} size="xs" />
                          <div className="text-right font-mono-num">
                            <div className="font-bold">{entry.totalWins}W</div>
                            <div className="text-[10px]" style={{ color: theme.textMuted }}>
                              {entry.totalKOs} KOs
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Sign Out */}
        <div
          className="px-5 sm:px-6 py-3.5 border-t flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: theme.border }}
        >
          <span className="text-[11px]" style={{ color: theme.textMuted }}>
            Session persists automatically across reloads
          </span>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="h-9 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            style={{
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.danger,
              color: theme.danger,
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
