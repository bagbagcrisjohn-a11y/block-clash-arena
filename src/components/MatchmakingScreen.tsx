import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Globe,
  History,
  KeyRound,
  Loader2,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import { ThemePalette } from '../game/constants';
import {
  MatchHistoryRecord,
  PlayerMatchRecordSummary,
} from '../game/matchmakingClient';
import { MatchType } from '../game/types';
import { RankBadge } from './RankBadge';

export type MatchmakingUiStatus =
  | 'idle'
  | 'connecting'
  | 'searching'
  | 'matched'
  | 'error';

export interface MatchedOpponentBanner {
  nickname: string;
  level: number;
  matchType: MatchType;
  roundNumber: number;
}

interface MatchmakingScreenProps {
  theme: ThemePalette;
  status: MatchmakingUiStatus;
  matchType: MatchType;
  onChangeMatchType: (matchType: MatchType) => void;
  nickname: string;
  playerLevel: number;
  onChangeNickname: (name: string) => void;
  enqueuedAtMs: number | null;
  matchedOpponent: MatchedOpponentBanner | null;
  error: string | null;
  infoNotice: string | null;
  isBrowserOnline: boolean;
  record: PlayerMatchRecordSummary;
  history: MatchHistoryRecord[];
  muted: boolean;
  onToggleMute: () => void;
  onStartSearch: () => void;
  onCancelSearch: () => void;
  onOpenPrivateRoom: () => void;
  onBack: () => void;
}

function formatSearchElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatMatchDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MatchmakingScreen: React.FC<MatchmakingScreenProps> = ({
  theme,
  status,
  matchType,
  onChangeMatchType,
  nickname,
  playerLevel,
  onChangeNickname,
  enqueuedAtMs,
  matchedOpponent,
  error,
  infoNotice,
  isBrowserOnline,
  record,
  history,
  muted,
  onToggleMute,
  onStartSearch,
  onCancelSearch,
  onOpenPrivateRoom,
  onBack,
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (status !== 'searching' || !enqueuedAtMs) {
      setElapsedMs(0);
      return;
    }
    setElapsedMs(Math.max(0, Date.now() - enqueuedAtMs));
    const id = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - enqueuedAtMs));
    }, 250);
    return () => window.clearInterval(id);
  }, [status, enqueuedAtMs]);

  const isBusy = status === 'connecting' || status === 'searching' || status === 'matched';

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
        className="w-full max-w-[1040px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 border-b"
        style={{ borderColor: theme.border }}
      >
        <button
          type="button"
          onClick={status === 'searching' ? onCancelSearch : onBack}
          className="h-10 px-3.5 rounded-lg border flex items-center gap-2 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: theme.surfaceBg,
            borderColor: theme.border,
            color: theme.textSecondary,
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{status === 'searching' ? 'Cancel & Back' : 'Back to Menu'}</span>
        </button>

        <div className="font-display text-base sm:text-lg font-bold tracking-tight whitespace-nowrap">
          1v1 Online Matchmaking
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className="h-10 px-3 rounded-lg border flex items-center gap-1.5 text-xs sm:text-sm font-medium cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: theme.surfaceBg,
            borderColor: theme.border,
            color: theme.textSecondary,
          }}
          aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1040px] mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 flex flex-col gap-6">
        {!isBrowserOnline && (
          <div
            className="rounded-xl border px-4 py-3 flex items-start gap-3 text-xs sm:text-sm"
            style={{
              backgroundColor: `${theme.warning}16`,
              borderColor: theme.warning,
              color: theme.textPrimary,
            }}
            role="alert"
          >
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5" style={{ color: theme.warning }} />
            <span>
              You are offline. Automatic 1v1 Online Matchmaking requires an active internet
              connection. Switch to 1 Player vs. AI or 2 Player Local to play offline.
            </span>
          </div>
        )}

        {error && (
          <div
            className="rounded-xl border px-4 py-3 flex items-start gap-3 text-xs sm:text-sm"
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

        {infoNotice && !error && (
          <div
            className="rounded-xl border px-4 py-3 text-xs sm:text-sm"
            style={{
              backgroundColor: `${theme.accentPrimary}14`,
              borderColor: theme.accentPrimary,
              color: theme.textPrimary,
            }}
          >
            {infoNotice}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Matchmaking Console */}
          <div
            className="lg:col-span-7 rounded-2xl border p-5 sm:p-7 flex flex-col gap-6"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.border,
            }}
          >
            {/* Matched Opponent Banner */}
            {status === 'matched' && matchedOpponent ? (
              <div className="py-4 flex flex-col items-center text-center gap-5">
                <div
                  className="w-16 h-16 rounded-2xl border flex items-center justify-center"
                  style={{
                    backgroundColor: `${theme.accentPrimary}18`,
                    borderColor: theme.accentPrimary,
                    color: theme.accentPrimary,
                    boxShadow: theme.blockGlow ? `0 0 28px ${theme.accentPrimary}44` : 'none',
                  }}
                >
                  <Swords className="w-8 h-8" />
                </div>

                <div className="space-y-1.5">
                  <div
                    className="text-xs font-bold tracking-widest uppercase"
                    style={{ color: theme.accentPrimary }}
                  >
                    Opponent Found
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                    Entering Arena...
                  </h1>
                  <p className="text-xs sm:text-sm" style={{ color: theme.textSecondary }}>
                    Synchronizing 3-second countdown with both players.
                  </p>
                </div>

                <div
                  className="w-full grid grid-cols-1 sm:grid-cols-3 items-center gap-3 rounded-xl border p-4"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.borderStrong,
                  }}
                >
                  <div className="flex flex-col items-center gap-1.5 min-w-0">
                    <span
                      className="font-display font-bold text-base truncate max-w-full"
                      style={{ color: theme.accentP1 }}
                    >
                      {nickname || 'Player'}
                    </span>
                    <RankBadge level={playerLevel} size="sm" />
                  </div>

                  <div
                    className="font-display text-sm font-bold tracking-widest"
                    style={{ color: theme.textMuted }}
                  >
                    VS
                  </div>

                  <div className="flex flex-col items-center gap-1.5 min-w-0">
                    <span
                      className="font-display font-bold text-base truncate max-w-full"
                      style={{ color: theme.accentP2 }}
                    >
                      {matchedOpponent.nickname}
                    </span>
                    <RankBadge level={matchedOpponent.level} size="sm" />
                  </div>
                </div>
              </div>
            ) : status === 'searching' || status === 'connecting' ? (
              /* Active Searching Queue View */
              <div className="py-4 flex flex-col items-center text-center gap-5">
                <div className="relative flex items-center justify-center w-20 h-20">
                  <div
                    className="w-20 h-20 rounded-full border-2 animate-ping absolute opacity-25"
                    style={{ borderColor: theme.accentPrimary }}
                  />
                  <div
                    className="w-16 h-16 rounded-2xl border flex items-center justify-center relative z-10"
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.accentPrimary,
                      color: theme.accentPrimary,
                    }}
                  >
                    <Loader2 className="w-7 h-7 animate-spin" />
                  </div>
                </div>

                <div className="space-y-1.5 max-w-md">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                    {status === 'connecting'
                      ? 'Connecting to Server...'
                      : 'Searching for Opponent'}
                  </h1>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
                    Waiting for another real player in{' '}
                    <strong style={{ color: theme.textPrimary }}>
                      {matchType === 'ko_2min' ? '2-Minute KO Battle' : 'Endless Survival'}
                    </strong>
                    . No bots are ever substituted — you will pair automatically as soon as another
                    player enters the queue.
                  </p>
                </div>

                <div
                  className="flex items-center gap-4 text-xs sm:text-sm font-mono-num px-4 py-2.5 rounded-xl border"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.border,
                    color: theme.textPrimary,
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4" style={{ color: theme.accentPrimary }} />
                    <span>Elapsed: {formatSearchElapsed(elapsedMs)}</span>
                  </span>
                  <span style={{ color: theme.textMuted }}>·</span>
                  <span>{nickname || 'Player'}</span>
                  <RankBadge level={playerLevel} size="xs" />
                </div>

                <button
                  type="button"
                  onClick={onCancelSearch}
                  className="h-12 px-6 rounded-xl border font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.danger,
                    color: theme.danger,
                  }}
                >
                  <X className="w-4 h-4" />
                  <span>Cancel Matchmaking</span>
                </button>
              </div>
            ) : (
              /* Ready to Queue View */
              <>
                <div className="space-y-1.5">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
                    Automatic 1v1 Quick Match
                  </h1>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
                    Jump straight into a real-time 1v1 battle against another online player. No room
                    codes required — our server pairs eligible opponents automatically and validates
                    every match result.
                  </p>
                </div>

                {/* Nickname + Rank Badge */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="mm-nickname"
                      className="text-xs font-semibold"
                      style={{ color: theme.textPrimary }}
                    >
                      Battle Nickname
                    </label>
                    <RankBadge level={playerLevel} size="sm" showRankName />
                  </div>
                  <input
                    id="mm-nickname"
                    type="text"
                    maxLength={16}
                    value={nickname}
                    disabled={isBusy}
                    onChange={(e) => onChangeNickname(e.target.value)}
                    placeholder="Enter nickname"
                    className="w-full h-11 px-3.5 rounded-xl border text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.borderStrong,
                      color: theme.textPrimary,
                    }}
                  />
                </div>

                {/* Match Format */}
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold" style={{ color: theme.textPrimary }}>
                      Queue Format
                    </span>
                    <span className="text-xs" style={{ color: theme.textMuted }}>
                      Paired with same format
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onChangeMatchType('ko_2min')}
                      className="text-left p-3.5 rounded-xl border transition-all cursor-pointer"
                      style={{
                        backgroundColor:
                          matchType === 'ko_2min' ? theme.surfaceElevated : 'transparent',
                        borderColor:
                          matchType === 'ko_2min' ? theme.accentPrimary : theme.border,
                      }}
                    >
                      <div className="font-semibold text-sm">2-Minute KO Battle</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.textMuted }}>
                        Most KOs wins; ties go to Sudden Death
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onChangeMatchType('endless')}
                      className="text-left p-3.5 rounded-xl border transition-all cursor-pointer"
                      style={{
                        backgroundColor:
                          matchType === 'endless' ? theme.surfaceElevated : 'transparent',
                        borderColor:
                          matchType === 'endless' ? theme.accentPrimary : theme.border,
                      }}
                    >
                      <div className="font-semibold text-sm">Endless Survival</div>
                      <div className="text-xs mt-0.5" style={{ color: theme.textMuted }}>
                        Escalating speed until finish
                      </div>
                    </button>
                  </div>
                </div>

                {/* Primary Quick Match CTA */}
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    disabled={!isBrowserOnline || isBusy}
                    onClick={onStartSearch}
                    className="w-full h-13 px-6 rounded-xl font-display text-base font-bold tracking-wide flex items-center justify-center gap-2.5 transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      backgroundColor: theme.accentPrimary,
                      color: theme.accentPrimaryText,
                      boxShadow: theme.blockGlow ? `0 8px 28px ${theme.accentPrimary}40` : 'none',
                    }}
                  >
                    <Globe className="w-5 h-5" />
                    <span>Find 1v1 Opponent</span>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenPrivateRoom}
                    className="w-full h-11 px-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: theme.border,
                      color: theme.textSecondary,
                    }}
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Want to invite a specific friend? Open Private Room Code 1v1</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right Column: Server-Verified Online Record & Match History */}
          <div
            className="lg:col-span-5 rounded-2xl border p-5 sm:p-6 flex flex-col gap-5"
            style={{
              backgroundColor: theme.surfaceBg,
              borderColor: theme.border,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4" style={{ color: theme.accentPrimary }} />
                <h2 className="font-display text-base font-bold tracking-tight">
                  Online 1v1 Record
                </h2>
              </div>
              <span className="text-xs font-mono-num" style={{ color: theme.textMuted }}>
                Server Verified
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div
                className="rounded-xl border p-3 text-center"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                }}
              >
                <div
                  className="font-mono-num text-xl font-bold"
                  style={{ color: theme.accentP1 }}
                >
                  {record.wins}
                </div>
                <div className="text-[11px] font-medium" style={{ color: theme.textMuted }}>
                  Wins
                </div>
              </div>
              <div
                className="rounded-xl border p-3 text-center"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                }}
              >
                <div
                  className="font-mono-num text-xl font-bold"
                  style={{ color: theme.danger }}
                >
                  {record.losses}
                </div>
                <div className="text-[11px] font-medium" style={{ color: theme.textMuted }}>
                  Losses
                </div>
              </div>
              <div
                className="rounded-xl border p-3 text-center"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                }}
              >
                <div
                  className="font-mono-num text-xl font-bold"
                  style={{ color: theme.textPrimary }}
                >
                  {record.draws}
                </div>
                <div className="text-[11px] font-medium" style={{ color: theme.textMuted }}>
                  Draws
                </div>
              </div>
            </div>

            <div
              className="pt-4 border-t space-y-3"
              style={{ borderColor: theme.border }}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" style={{ color: theme.textMuted }} />
                  <span>Recent Match History</span>
                </span>
                <span className="font-mono-num" style={{ color: theme.textMuted }}>
                  {record.totalKos} Total KOs
                </span>
              </div>

              {history.length === 0 ? (
                <div
                  className="rounded-xl border p-4 text-center text-xs leading-relaxed"
                  style={{
                    backgroundColor: theme.surfaceElevated,
                    borderColor: theme.border,
                    color: theme.textMuted,
                  }}
                >
                  No completed matchmaking games recorded yet. Finish a Quick Match to log your
                  verified results here.
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {history.map((item) => {
                    const resultColor =
                      item.result === 'win'
                        ? theme.accentP1
                        : item.result === 'loss'
                          ? theme.danger
                          : theme.textSecondary;
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 text-xs"
                        style={{
                          backgroundColor: theme.surfaceElevated,
                          borderColor: theme.border,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono-num font-bold uppercase"
                              style={{ color: resultColor }}
                            >
                              {item.result}
                            </span>
                            <span className="truncate font-semibold">
                              vs. {item.opponentName}
                            </span>
                          </div>
                          <div
                            className="text-[11px] truncate mt-0.5"
                            style={{ color: theme.textMuted }}
                          >
                            {item.finishReason} · {formatMatchDuration(item.durationMs)}
                          </div>
                        </div>
                        <div className="text-right font-mono-num shrink-0">
                          <div className="font-bold">
                            {item.myKos} – {item.opponentKos} KO
                          </div>
                          <div className="text-[11px]" style={{ color: theme.textMuted }}>
                            {item.myScore.toLocaleString()} pts
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer
        className="w-full max-w-[1040px] mx-auto px-4 sm:px-6 py-3.5 text-xs flex flex-wrap items-center justify-between gap-2 border-t"
        style={{ borderColor: theme.border, color: theme.textMuted }}
      >
        <span>Server-Authoritative Real-Time 1v1 Matchmaking</span>
        <span>Tip: Open a second browser tab or device to battle immediately</span>
      </footer>
    </div>
  );
};
