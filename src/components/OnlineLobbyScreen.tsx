import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  PlusCircle,
  Radio,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import { ThemePalette } from '../game/constants';
import { sanitizeRoomCode } from '../game/onlineSync';
import { MatchType } from '../game/types';
import { RankBadge } from './RankBadge';

interface OnlineLobbyScreenProps {
  theme: ThemePalette;
  matchType: MatchType;
  onChangeMatchType: (matchType: MatchType) => void;
  nickname: string;
  playerLevel: number;
  onChangeNickname: (name: string) => void;
  waitingRoomCode: string | null;
  busy: boolean;
  isOnline?: boolean;
  error: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onCancelWaiting: () => void;
  onBack: () => void;
}

export const OnlineLobbyScreen: React.FC<OnlineLobbyScreenProps> = ({
  theme,
  matchType,
  onChangeMatchType,
  nickname,
  playerLevel,
  onChangeNickname,
  waitingRoomCode,
  busy,
  isOnline = true,
  error,
  muted,
  onToggleMute,
  onCreateRoom,
  onJoinRoom,
  onCancelWaiting,
  onBack,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!waitingRoomCode) return;
    try {
      await navigator.clipboard.writeText(waitingRoomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for restricted clipboard environments
      try {
        const ta = document.createElement('textarea');
        ta.value = waitingRoomCode;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // Ignore
      }
    }
  };

  const handleSubmitJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || joinCode.length !== 4) return;
    onJoinRoom(joinCode);
  };

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
        className="w-full max-w-[960px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 border-b"
        style={{ borderColor: theme.border }}
      >
        <button
          type="button"
          onClick={waitingRoomCode ? onCancelWaiting : onBack}
          className="h-10 px-3 rounded-lg border flex items-center gap-2 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: theme.surfaceBg,
            borderColor: theme.border,
            color: theme.textSecondary,
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{waitingRoomCode ? 'Cancel Room' : 'Back to Menu'}</span>
        </button>

        <div className="font-display text-base sm:text-lg font-bold tracking-tight whitespace-nowrap">
          Online 1v1 Lobby
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className="h-10 px-3 rounded-lg border flex items-center gap-1.5 text-xs font-medium cursor-pointer shrink-0"
          style={{
            backgroundColor: theme.surfaceBg,
            borderColor: theme.border,
            color: theme.textSecondary,
          }}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          <span className="hidden sm:inline">{muted ? 'Off' : 'On'}</span>
        </button>
      </header>

      {/* Main Lobby Content */}
      <main className="w-full max-w-[960px] mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1 flex items-center justify-center">
        {waitingRoomCode ? (
          /* Waiting Room View (Host created a 4-letter Room Code) */
          <div
            className="w-full max-w-md rounded-2xl border p-6 sm:p-8 text-center flex flex-col items-center gap-6"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.borderStrong,
              boxShadow: theme.blockGlow ? `0 0 36px ${theme.accentPrimary}22` : 'none',
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: theme.surfaceElevated, color: theme.accentPrimary }}
            >
              <Radio className="w-6 h-6 animate-pulse" />
            </div>

            <div className="space-y-2 flex flex-col items-center">
              <h1 className="font-display text-2xl font-bold tracking-tight">Room Ready</h1>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: theme.textPrimary }}>
                  {nickname || 'Host'}
                </span>
                <RankBadge level={playerLevel} size="md" showRankName />
              </div>
              <p className="text-xs sm:text-sm" style={{ color: theme.textSecondary }}>
                Share this 4-letter code with your friend to start the live 1v1 battle.
              </p>
            </div>

            {/* Huge 4-letter Room Code Display */}
            <div
              className="w-full rounded-xl border py-5 px-4 flex flex-col items-center gap-2"
              style={{
                backgroundColor: theme.boardBg,
                borderColor: theme.accentPrimary,
              }}
            >
              <span className="text-[11px] font-semibold tracking-widest" style={{ color: theme.textMuted }}>
                ROOM CODE
              </span>
              <div
                className="font-mono-num text-5xl sm:text-6xl font-bold tracking-[0.28em] pl-[0.28em] select-all"
                style={{
                  color: theme.accentPrimary,
                  textShadow: theme.blockGlow ? `0 0 24px ${theme.accentPrimary}66` : 'none',
                }}
              >
                {waitingRoomCode}
              </div>
            </div>

            {/* One-tap Copy Room Code Button */}
            <button
              type="button"
              onClick={handleCopyCode}
              className="w-full h-12 rounded-xl font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
              style={{
                backgroundColor: copied ? theme.pieces.S.fill : theme.accentPrimary,
                color: theme.accentPrimaryText,
              }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Room Code Copied!' : 'Copy Room Code'}</span>
            </button>

            <div
              className="w-full rounded-xl border px-4 py-3 flex items-center justify-center gap-2.5 text-xs font-medium"
              style={{
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.border,
                color: theme.textSecondary,
              }}
            >
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.accentPrimary }} />
              <span>
                Waiting for Player 2 ·{' '}
                {matchType === 'ko_2min' ? '2-Min KO Battle' : 'Endless Survival'}
              </span>
            </div>

            <button
              type="button"
              onClick={onCancelWaiting}
              className="text-xs font-semibold underline underline-offset-4 cursor-pointer"
              style={{ color: theme.textMuted }}
            >
              Cancel and return to lobby
            </button>
          </div>
        ) : (
          /* Create or Join Room Console */
          <div className="w-full flex flex-col gap-6">
            {/* Guest Nickname Card */}
            <div
              className="rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              style={{
                backgroundColor: theme.surfaceBg,
                borderColor: theme.border,
              }}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <label
                    htmlFor="guest-nickname-input"
                    className="text-sm font-semibold block"
                    style={{ color: theme.textPrimary }}
                  >
                    Player Callsign
                  </label>
                  <RankBadge level={playerLevel} size="sm" showRankName />
                </div>
                <p className="text-xs" style={{ color: theme.textMuted }}>
                  Verified account — your callsign, Level &amp; Rank Badge sync live to your opponent.
                </p>
              </div>
              <input
                id="guest-nickname-input"
                type="text"
                value={nickname}
                onChange={(e) => onChangeNickname(e.target.value.slice(0, 16))}
                maxLength={16}
                placeholder="e.g. Nova"
                className="w-full sm:w-64 h-12 px-4 rounded-xl border font-semibold text-sm outline-none focus:ring-2"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.borderStrong,
                  color: theme.textPrimary,
                }}
              />
            </div>

            {/* Offline Notice (shown only when trying to use Online 1v1 without internet) */}
            {!isOnline && (
              <div
                className="rounded-xl border px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-medium"
                style={{
                  backgroundColor: `${theme.warning}16`,
                  borderColor: theme.warning,
                  color: theme.textPrimary,
                }}
                role="alert"
              >
                <WifiOff className="w-4 h-4 shrink-0 mt-0.5" style={{ color: theme.warning }} />
                <span>
                  You&apos;re currently offline. Online 1v1 Room Battle requires an internet
                  connection — return to the menu to play 1 Player vs. AI or 2 Player Local
                  offline.
                </span>
              </div>
            )}

            {/* Error Notice */}
            {error && isOnline && (
              <div
                className="rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium"
                style={{
                  backgroundColor: `${theme.danger}18`,
                  borderColor: theme.danger,
                  color: theme.isDark ? '#FCA5A5' : theme.danger,
                }}
                role="alert"
              >
                {error}
              </div>
            )}

            {/* Side-by-Side Create Room & Join Room Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Create Room */}
              <section
                className="rounded-2xl border p-6 flex flex-col justify-between gap-6"
                style={{
                  backgroundColor: theme.surfaceBg,
                  borderColor: theme.border,
                }}
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: theme.surfaceElevated, color: theme.accentP1 }}
                    >
                      <PlusCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold">Create Room</h2>
                      <p className="text-xs" style={{ color: theme.textMuted }}>
                        Generate a 4-letter code and host the battle
                      </p>
                    </div>
                  </div>

                  {/* Match Type Toggle */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeMatchType('ko_2min')}
                      className="h-11 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor:
                          matchType === 'ko_2min' ? theme.surfaceElevated : 'transparent',
                        borderColor: matchType === 'ko_2min' ? theme.accentPrimary : theme.border,
                        color: theme.textPrimary,
                      }}
                    >
                      2-Min KO Battle
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeMatchType('endless')}
                      className="h-11 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
                      style={{
                        backgroundColor:
                          matchType === 'endless' ? theme.surfaceElevated : 'transparent',
                        borderColor: matchType === 'endless' ? theme.accentPrimary : theme.border,
                        color: theme.textPrimary,
                      }}
                    >
                      Endless Survival
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy || !isOnline}
                  onClick={onCreateRoom}
                  className="w-full h-12 rounded-xl font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: theme.accentPrimary,
                    color: theme.accentPrimaryText,
                    boxShadow: theme.blockGlow ? `0 6px 22px ${theme.accentPrimary}38` : 'none',
                  }}
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlusCircle className="w-4 h-4" />
                  )}
                  <span>Create Room Code</span>
                </button>
              </section>

              {/* Join Room */}
              <form
                onSubmit={handleSubmitJoin}
                className="rounded-2xl border p-6 flex flex-col justify-between gap-6"
                style={{
                  backgroundColor: theme.surfaceBg,
                  borderColor: theme.border,
                }}
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: theme.surfaceElevated, color: theme.accentP2 }}
                    >
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-bold">Join Room</h2>
                      <p className="text-xs" style={{ color: theme.textMuted }}>
                        Enter your friend&apos;s 4-letter Room Code
                      </p>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(sanitizeRoomCode(e.target.value))}
                    maxLength={4}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="CLSH"
                    aria-label="4-letter room code"
                    className="w-full h-14 px-4 rounded-xl border text-center font-mono-num text-3xl font-bold tracking-[0.35em] pl-[0.65em] uppercase outline-none"
                    style={{
                      backgroundColor: theme.boardBg,
                      borderColor: joinCode.length === 4 ? theme.accentP2 : theme.borderStrong,
                      color: theme.textPrimary,
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || !isOnline || joinCode.length !== 4}
                  className="w-full h-12 rounded-xl font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: theme.accentP2,
                    color: '#FFFFFF',
                  }}
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Users className="w-4 h-4" />
                  )}
                  <span>Join Battle</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      <footer
        className="w-full max-w-[960px] mx-auto px-6 py-4 text-xs text-center border-t"
        style={{ borderColor: theme.border, color: theme.textMuted }}
      >
        Live Cloud Sync · Your board stays on the left, your online rival appears live on the right
      </footer>
    </div>
  );
};
