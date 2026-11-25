import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { ThemePalette } from '../game/constants';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  theme: ThemePalette;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ theme }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Automatically suppress inside installed PWA / Google Play TWA standalone mode
  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="h-10 px-3.5 rounded-lg border flex items-center gap-2 text-xs sm:text-sm font-semibold transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: theme.accentPrimary,
          borderColor: theme.accentPrimary,
          color: theme.accentPrimaryText,
        }}
      >
        <Download className="w-4 h-4" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="h-10 px-3.5 rounded-lg border flex items-center gap-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: theme.surfaceElevated,
            borderColor: theme.accentPrimary,
            color: theme.accentPrimary,
          }}
        >
          <Download className="w-4 h-4" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
              backgroundColor: theme.isDark ? 'rgba(4, 7, 15, 0.82)' : 'rgba(15, 23, 42, 0.56)',
              backdropFilter: 'blur(6px)',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div
              className="w-full max-w-sm rounded-2xl border p-6 flex flex-col gap-4"
              style={{
                backgroundColor: theme.surfaceBg,
                borderColor: theme.borderStrong,
                color: theme.textPrimary,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id="ios-install-title" className="font-display text-lg font-bold">
                  Install on iPhone / iPad
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer"
                  style={{ borderColor: theme.border, color: theme.textSecondary }}
                  aria-label="Close install instructions"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm space-y-2.5 list-decimal list-inside" style={{ color: theme.textSecondary }}>
                <li>
                  Tap the <Share className="inline w-4 h-4 mx-0.5 align-text-bottom" /> <strong>Share</strong> button in the Safari toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to launch Block Clash: Arena in full-screen standalone mode, even offline.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="h-11 rounded-xl font-semibold text-sm cursor-pointer"
                style={{
                  backgroundColor: theme.accentPrimary,
                  color: theme.accentPrimaryText,
                }}
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
