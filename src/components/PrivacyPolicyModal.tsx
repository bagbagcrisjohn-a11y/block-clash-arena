import React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { ThemePalette } from '../game/constants';

interface PrivacyPolicyModalProps {
  theme: ThemePalette;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ theme, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: theme.isDark ? 'rgba(4, 7, 15, 0.84)' : 'rgba(15, 23, 42, 0.56)',
        backdropFilter: 'blur(6px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-policy-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-2xl border p-6 sm:p-7 flex flex-col gap-5"
        style={{
          backgroundColor: theme.surfaceBg,
          borderColor: theme.borderStrong,
          color: theme.textPrimary,
          boxShadow: theme.blockGlow ? '0 24px 64px rgba(0, 0, 0, 0.65)' : '0 20px 50px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: theme.surfaceElevated, color: theme.accentPrimary }}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="privacy-policy-title" className="font-display text-xl font-bold tracking-tight">
                Privacy Policy
              </h2>
              <p className="text-xs" style={{ color: theme.textMuted }}>
                Block Clash: Arena · Google Play &amp; PWA Data Notice
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-lg border flex items-center justify-center cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
              color: theme.textSecondary,
            }}
            aria-label="Close privacy policy"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs sm:text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
          <section className="space-y-1">
            <h3 className="font-semibold" style={{ color: theme.textPrimary }}>
              1. No Personal Data Sold or Tracked
            </h3>
            <p>
              Block Clash: Arena does not collect your real name, email address, phone number,
              contacts, precise location, or advertising identifiers. We do not sell personal data,
              run third-party ad trackers, or share player information with data brokers.
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold" style={{ color: theme.textPrimary }}>
              2. Guest Nicknames &amp; Online 1v1 Room Codes
            </h3>
            <p>
              When you choose to play <strong>Online 1v1 Room Battle</strong>, your optional guest
              nickname, progression level badge, 4-letter room code, and real-time match board
              state are transmitted through Firebase Firestore strictly to synchronize live
              gameplay between the two players in that room.
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold" style={{ color: theme.textPrimary }}>
              3. Local Device Storage &amp; Offline Play
            </h3>
            <p>
              Your Player Level (1–300), XP, Rank Tier, win/KO totals, and preferred guest nickname
              are saved locally on your device using browser storage so you can play 1v1 vs. AI and
              2-Player Local modes offline. You can clear this data at any time through your device
              or browser settings.
            </p>
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold" style={{ color: theme.textPrimary }}>
              4. Permissions &amp; Audio
            </h3>
            <p>
              Sound effects are generated locally on your device using the Web Audio API. The game
              does not request access to your camera, microphone, files, or contacts.
            </p>
          </section>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-xl font-display font-bold text-sm tracking-wide cursor-pointer transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: theme.accentPrimary,
            color: theme.accentPrimaryText,
          }}
        >
          Close Privacy Policy
        </button>
      </div>
    </div>
  );
};
