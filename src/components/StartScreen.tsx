import React, { useState } from 'react';
import { Globe, Play, ShieldCheck, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { AI_PROFILES, THEMES, ThemePalette } from '../game/constants';
import { PlayerProfile } from '../game/progression';
import { AIDifficulty, GameMode, MatchConfig, MatchType, PieceType, ThemeId } from '../game/types';
import { PiecePreviewCanvas } from './PiecePreviewCanvas';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { PWAInstallButton } from './PWAInstallButton';
import { PlayerLevelCard } from './RankBadge';

interface StartScreenProps {
  config: MatchConfig;
  profile: PlayerProfile;
  onChangeConfig: (next: MatchConfig) => void;
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
  offlineOnlineNotice?: string | null;
}

const DIFFICULTIES: AIDifficulty[] = ['easy', 'medium', 'hard', 'master'];
const THEME_IDS: ThemeId[] = ['neon', 'retro', 'modern'];
const SHOWCASE_PIECES: PieceType[] = ['T', 'I', 'L', 'Z', 'O', 'S', 'J'];

export const StartScreen: React.FC<StartScreenProps> = ({
  config,
  profile,
  onChangeConfig,
  onStart,
  muted,
  onToggleMute,
  offlineOnlineNotice = null,
}) => {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const theme: ThemePalette = THEMES[config.theme];

  const setMode = (mode: GameMode) => onChangeConfig({ ...config, mode });
  const setDifficulty = (difficulty: AIDifficulty) => onChangeConfig({ ...config, difficulty });
  const setMatchType = (matchType: MatchType) => onChangeConfig({ ...config, matchType });
  const setTheme = (themeId: ThemeId) => onChangeConfig({ ...config, theme: themeId });

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col justify-between transition-colors duration-200 safe-area-top safe-area-bottom"
      style={{
        backgroundColor: theme.pageBg,
        color: theme.textPrimary,
      }}
    >
      {/* Top Bar */}
      <header
        className="w-full max-w-[1160px] mx-auto px-6 py-5 flex items-center justify-between gap-6 border-b"
        style={{ borderColor: theme.border }}
      >
        <div className="font-display text-xl font-bold tracking-tight whitespace-nowrap shrink-0">
          Block Clash: Arena
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton theme={theme} />
          <button
            type="button"
            onClick={onToggleMute}
            className="h-10 px-3.5 rounded-lg border flex items-center gap-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.border,
              color: theme.textSecondary,
            }}
            aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{muted ? 'Sound Off' : 'Sound On'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1160px] mx-auto px-6 py-6 md:py-10 flex-1 flex flex-col justify-center gap-6">
        {/* Persistent Player Level 1-300 Card */}
        <PlayerLevelCard profile={profile} theme={theme} />

        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left Column: Title, Showcase & Controls */}
          <div className="lg:col-span-5 flex flex-col gap-8">
            <div className="space-y-4">
              <p
                className="text-sm font-medium tracking-wide"
                style={{ color: theme.accentP1 }}
              >
                Side-by-Side Competitive Block Battle
              </p>
              <h1
                className="font-display font-bold tracking-tight leading-[1.02]"
                style={{
                  fontSize: 'clamp(2.5rem, 4.6vw, 3.85rem)',
                  textWrap: 'balance',
                  textShadow: theme.blockGlow ? `0 0 28px ${theme.accentP1}44` : 'none',
                }}
              >
                Block Clash: Arena
              </h1>
              <p
                className="text-base leading-relaxed max-w-md"
                style={{ color: theme.textSecondary }}
              >
                Face off in a live split-screen arena. Chain multi-line clears to launch garbage
                lines across the divider, cancel incoming attacks, and outscore your rival in KOs.
              </p>
            </div>

            {/* Live Theme Piece Preview Strip */}
            <div
              className="rounded-xl border p-4"
              style={{
                backgroundColor: theme.surfaceBg,
                borderColor: theme.border,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold" style={{ color: theme.textMuted }}>
                  Active Palette · {theme.name}
                </span>
                <span className="text-xs font-mono-num" style={{ color: theme.textMuted }}>
                  10×20 · 7-Bag SRS
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1 items-center">
                {SHOWCASE_PIECES.map((piece) => (
                  <PiecePreviewCanvas
                    key={piece}
                    piece={piece}
                    theme={theme}
                    cellSize={10}
                    width={46}
                    height={32}
                  />
                ))}
              </div>
            </div>

            {/* Attack Table & Controls Summary */}
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold mb-2.5" style={{ color: theme.textPrimary }}>
                  Attack &amp; Counter Rules
                </h2>
                <div
                  className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs"
                  style={{ color: theme.textSecondary }}
                >
                  <div className="flex justify-between">
                    <span>Single (1 Line)</span>
                    <span className="font-mono-num font-semibold">0 + Combo</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Double (2 Lines)</span>
                    <span className="font-mono-num font-semibold">+1 Garbage</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Triple (3 Lines)</span>
                    <span className="font-mono-num font-semibold">+2 Garbage</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Quad Smash (4)</span>
                    <span className="font-mono-num font-semibold">+4 Garbage</span>
                  </div>
                </div>
                <p className="text-xs mt-2.5 leading-relaxed" style={{ color: theme.textMuted }}>
                  Incoming garbage rows contain glowing <strong style={{ color: '#FB923C' }}>Bomb Blocks</strong>.
                  Drop a piece onto an exposed bomb or clear an adjacent line to trigger a chain blast!
                </p>
              </div>

              <div className="pt-4 border-t" style={{ borderColor: theme.border }}>
                <h2 className="text-sm font-semibold mb-2" style={{ color: theme.textPrimary }}>
                  {config.mode === 'local_2p'
                    ? 'Split Keyboard Controls'
                    : 'Player 1 (YOU) Controls'}
                </h2>
                {config.mode !== 'local_2p' ? (
                  <div
                    className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs"
                    style={{ color: theme.textSecondary }}
                  >
                    <div>Move / Soft Drop: Arrows</div>
                    <div>Rotate CW: Up or X</div>
                    <div>Rotate CCW: Z</div>
                    <div>Hard Drop: Space</div>
                    <div>Hold Piece: C or Shift</div>
                    <div>{config.mode === 'online_1v1' ? 'Touch: Mobile Ready' : 'Pause: P or Esc'}</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-xs" style={{ color: theme.textSecondary }}>
                    <div className="space-y-1">
                      <div className="font-semibold" style={{ color: theme.accentP1 }}>
                        YOU (Left)
                      </div>
                      <div>Move / Soft: A, D, S</div>
                      <div>Rotate: W (CW), Q (CCW)</div>
                      <div>Hard Drop: Space</div>
                      <div>Hold: C or Left Shift</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold" style={{ color: theme.accentP2 }}>
                        RIVAL (Right)
                      </div>
                      <div>Move / Soft: Arrow Keys</div>
                      <div>Rotate: Up (CW), / (CCW)</div>
                      <div>Hard Drop: Enter</div>
                      <div>Hold: Right Shift or .</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Match Setup Console */}
          <div
            className="lg:col-span-7 rounded-2xl border p-6 md:p-8 flex flex-col gap-7"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.border,
            }}
          >
            {/* 1. Game Mode */}
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
                  Game Mode
                </h2>
                <span className="text-xs" style={{ color: theme.textMuted }}>
                  Choose your opponent
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('vs_ai')}
                  className="text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: config.mode === 'vs_ai' ? theme.surfaceElevated : 'transparent',
                    borderColor: config.mode === 'vs_ai' ? theme.accentPrimary : theme.border,
                    boxShadow:
                      config.mode === 'vs_ai' && theme.blockGlow
                        ? `0 0 0 1px ${theme.accentPrimary}`
                        : 'none',
                  }}
                >
                  <div className="font-display font-bold text-sm tracking-wide">
                    1 PLAYER VS. AI
                  </div>
                  <div className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    Battle an AI rival from Easy to Master
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('local_2p')}
                  className="text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: config.mode === 'local_2p' ? theme.surfaceElevated : 'transparent',
                    borderColor: config.mode === 'local_2p' ? theme.accentPrimary : theme.border,
                    boxShadow:
                      config.mode === 'local_2p' && theme.blockGlow
                        ? `0 0 0 1px ${theme.accentPrimary}`
                        : 'none',
                  }}
                >
                  <div className="font-display font-bold text-sm tracking-wide">
                    2 PLAYER LOCAL
                  </div>
                  <div className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    Split keyboard on one screen (WASD vs. Arrows)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('online_1v1')}
                  className="text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor:
                      config.mode === 'online_1v1' ? theme.surfaceElevated : 'transparent',
                    borderColor: config.mode === 'online_1v1' ? theme.accentPrimary : theme.border,
                    boxShadow:
                      config.mode === 'online_1v1' && theme.blockGlow
                        ? `0 0 0 1px ${theme.accentPrimary}`
                        : 'none',
                  }}
                >
                  <div className="font-display font-bold text-sm tracking-wide flex items-center gap-1.5">
                    <Globe className="w-4 h-4 shrink-0" style={{ color: theme.accentPrimary }} />
                    <span>ONLINE 1V1</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    Room Code battle across separate phones or PCs
                  </div>
                </button>
              </div>
            </section>

            {/* AI Difficulty (shown when vs_ai) */}
            {config.mode === 'vs_ai' && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
                    AI Rival Difficulty
                  </h2>
                  <span className="text-xs" style={{ color: theme.textMuted }}>
                    {AI_PROFILES[config.difficulty].tagline}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIFFICULTIES.map((diff) => {
                    const active = config.difficulty === diff;
                    return (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setDifficulty(diff)}
                        className="h-11 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          backgroundColor: active ? theme.accentPrimary : theme.surfaceElevated,
                          borderColor: active ? theme.accentPrimary : theme.border,
                          color: active ? theme.accentPrimaryText : theme.textPrimary,
                        }}
                      >
                        {AI_PROFILES[diff].label}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 2. Match Type */}
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
                  Match Type
                </h2>
                <span className="text-xs" style={{ color: theme.textMuted }}>
                  Victory condition
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMatchType('ko_2min')}
                  className="text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: config.matchType === 'ko_2min' ? theme.surfaceElevated : 'transparent',
                    borderColor: config.matchType === 'ko_2min' ? theme.accentPrimary : theme.border,
                    boxShadow:
                      config.matchType === 'ko_2min' && theme.blockGlow
                        ? `0 0 0 1px ${theme.accentPrimary}`
                        : 'none',
                  }}
                >
                  <div className="font-semibold text-sm whitespace-nowrap">2-Minute KO Battle</div>
                  <div className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    Most KOs wins; tied scores trigger Sudden Death
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMatchType('endless')}
                  className="text-left p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: config.matchType === 'endless' ? theme.surfaceElevated : 'transparent',
                    borderColor: config.matchType === 'endless' ? theme.accentPrimary : theme.border,
                    boxShadow:
                      config.matchType === 'endless' && theme.blockGlow
                        ? `0 0 0 1px ${theme.accentPrimary}`
                        : 'none',
                  }}
                >
                  <div className="font-semibold text-sm whitespace-nowrap">Endless Survival</div>
                  <div className="text-xs mt-1" style={{ color: theme.textMuted }}>
                    No clock — escalating speed until you call time
                  </div>
                </button>
              </div>
            </section>

            {/* 3. Theme Selector */}
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
                  Visual Theme
                </h2>
                <span className="text-xs" style={{ color: theme.textMuted }}>
                  Switchable anytime
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {THEME_IDS.map((tid) => {
                  const t = THEMES[tid];
                  const active = config.theme === tid;
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => setTheme(tid)}
                      className="text-left p-3.5 rounded-xl border transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: active ? theme.surfaceElevated : 'transparent',
                        borderColor: active ? theme.accentPrimary : theme.border,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold whitespace-nowrap">{t.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs border"
                            style={{ backgroundColor: t.boardBg, borderColor: t.border }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-xs"
                            style={{ backgroundColor: t.pieces.I.fill }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-xs"
                            style={{ backgroundColor: t.pieces.Z.fill }}
                          />
                        </div>
                      </div>
                      <div className="text-[11px] leading-snug" style={{ color: theme.textMuted }}>
                        {t.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Primary Action */}
            <div className="pt-2 space-y-3">
              {offlineOnlineNotice && config.mode === 'online_1v1' && (
                <div
                  className="rounded-xl border px-3.5 py-2.5 flex items-start gap-2.5 text-xs leading-relaxed"
                  style={{
                    backgroundColor: `${theme.warning}16`,
                    borderColor: theme.warning,
                    color: theme.textPrimary,
                  }}
                  role="alert"
                >
                  <WifiOff className="w-4 h-4 shrink-0 mt-0.5" style={{ color: theme.warning }} />
                  <span>{offlineOnlineNotice}</span>
                </div>
              )}

              <button
                type="button"
                onClick={onStart}
                className="w-full h-13 px-6 rounded-xl font-display text-base font-bold tracking-wide flex items-center justify-center gap-2.5 transition-transform active:scale-[0.99] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  backgroundColor: theme.accentPrimary,
                  color: theme.accentPrimaryText,
                  boxShadow: theme.blockGlow ? `0 8px 28px ${theme.accentPrimary}40` : 'none',
                }}
              >
                {config.mode === 'online_1v1' ? (
                  <>
                    <Globe className="w-5 h-5" />
                    <span>Open Online 1v1 (Room Code)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Start Match</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Quiet Footer with Google Play Privacy Policy Link */}
      <footer
        className="w-full max-w-[1160px] mx-auto px-6 py-4 text-xs flex flex-wrap items-center justify-between gap-3 border-t"
        style={{ borderColor: theme.border, color: theme.textMuted }}
      >
        <div className="flex items-center gap-4">
          <span>Block Clash: Arena</span>
          <button
            type="button"
            onClick={() => setShowPrivacyPolicy(true)}
            className="inline-flex items-center gap-1.5 font-medium underline underline-offset-4 cursor-pointer hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: theme.textSecondary }}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Privacy Policy</span>
          </button>
        </div>
        <span>Press Space to Hard Drop · Clear Lines to Counter Incoming Attacks</span>
      </footer>

      {showPrivacyPolicy && (
        <PrivacyPolicyModal theme={theme} onClose={() => setShowPrivacyPolicy(false)} />
      )}
    </div>
  );
};
