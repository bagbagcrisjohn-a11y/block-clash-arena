import React, { useEffect, useState } from 'react';
import { Home, Loader2, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { ThemePalette } from '../game/constants';
import {
  getRankTier,
  MAX_PLAYER_LEVEL,
  MatchXPResult,
  xpNeededForNextLevel,
} from '../game/progression';
import { PlayerStats } from '../game/types';
import { RankBadge, RankEmblemIcon } from './RankBadge';

export type OnlineRematchState = 'idle' | 'waiting_for_rival' | 'rival_ready' | 'opponent_left';

interface ConfettiSpark {
  id: number;
  dx: number;
  dy: number;
  rot: number;
  color: string;
  size: number;
  leftPct: number;
}

interface MatchSummaryModalProps {
  winnerText: string;
  reasonText: string;
  durationText: string;
  p1Label: string;
  p2Label: string;
  p1Stats: PlayerStats;
  p2Stats: PlayerStats;
  theme: ThemePalette;
  xpResult?: MatchXPResult | null;
  isOnline?: boolean;
  isQuickMatch?: boolean;
  rematchState?: OnlineRematchState;
  onRematch: () => void;
  onFindNewOpponent?: () => void;
  onMainMenu: () => void;
}

const SPARK_COLORS = ['#00F0FF', '#FACC15', '#FF3366', '#22C55E', '#D946EF', '#FEF08A'];

function createSparkBurst(batchId: number): ConfettiSpark[] {
  return Array.from({ length: 24 }, (_, idx) => {
    const angle = (Math.PI * 2 * idx) / 24 + (Math.random() - 0.5) * 0.25;
    const dist = 42 + Math.random() * 84;
    return {
      id: batchId * 100 + idx,
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist - 28),
      rot: Math.round((Math.random() - 0.5) * 420),
      color: SPARK_COLORS[idx % SPARK_COLORS.length],
      size: 4 + Math.round(Math.random() * 4),
      leftPct: 18 + Math.round(Math.random() * 64),
    };
  });
}

export const MatchSummaryModal: React.FC<MatchSummaryModalProps> = ({
  winnerText,
  reasonText,
  durationText,
  p1Label,
  p2Label,
  p1Stats,
  p2Stats,
  theme,
  xpResult = null,
  isOnline = false,
  isQuickMatch = false,
  rematchState = 'idle',
  onRematch,
  onFindNewOpponent,
  onMainMenu,
}) => {
  const [displayLevel, setDisplayLevel] = useState<number>(xpResult?.beforeLevel ?? 1);
  const [displayXP, setDisplayXP] = useState<number>(xpResult?.beforeXP ?? 0);
  const [displayEarned, setDisplayEarned] = useState<number>(0);
  const [levelUpBanner, setLevelUpBanner] = useState<{
    key: number;
    level: number;
    rankUpName: string | null;
  } | null>(null);
  const [sparks, setSparks] = useState<ConfettiSpark[]>([]);

  useEffect(() => {
    if (!xpResult) return;

    const startLevel = xpResult.beforeLevel;
    const startXP = xpResult.beforeXP;
    const totalToAdd = xpResult.totalEarnedXP;

    setDisplayLevel(startLevel);
    setDisplayXP(startXP);
    setDisplayEarned(0);
    setLevelUpBanner(null);
    setSparks([]);

    if (totalToAdd <= 0 || startLevel >= MAX_PLAYER_LEVEL) {
      setDisplayLevel(xpResult.afterLevel);
      setDisplayXP(xpResult.afterXP);
      setDisplayEarned(totalToAdd);
      return;
    }

    // Build sequential fill segments so each level-up pauses briefly & triggers celebration
    interface XpSegment {
      level: number;
      fromXP: number;
      toXP: number;
      needed: number;
      levelsUpAtEnd: boolean;
      nextLevel: number;
      rankChangedTo: string | null;
      durationMs: number;
    }

    const segments: XpSegment[] = [];
    let simLevel = startLevel;
    let simXP = startXP;
    let remaining = totalToAdd;

    while (remaining > 0 && simLevel < MAX_PLAYER_LEVEL) {
      const needed = xpNeededForNextLevel(simLevel);
      const room = Math.max(1, needed - simXP);
      const take = Math.min(remaining, room);
      const nextXP = simXP + take;
      const levelsUp = nextXP >= needed;
      const nextLvl = levelsUp ? Math.min(MAX_PLAYER_LEVEL, simLevel + 1) : simLevel;
      const prevRank = getRankTier(simLevel);
      const nextRank = getRankTier(nextLvl);

      segments.push({
        level: simLevel,
        fromXP: simXP,
        toXP: levelsUp ? needed : nextXP,
        needed,
        levelsUpAtEnd: levelsUp,
        nextLevel: nextLvl,
        rankChangedTo: levelsUp && nextRank.id !== prevRank.id ? nextRank.name : null,
        durationMs: Math.max(320, Math.min(820, Math.round((take / Math.max(1, needed)) * 780))),
      });

      remaining -= take;
      simLevel = nextLvl;
      simXP = levelsUp ? 0 : nextXP;
    }

    let cancelled = false;
    let rafId = 0;
    let timeoutId = 0;
    let segIdx = 0;
    let levelUpCount = 0;
    let earnedBeforeSeg = 0;
    let lastTickAt = 0;

    const runSegment = () => {
      if (cancelled) return;
      if (segIdx >= segments.length) {
        setDisplayLevel(xpResult.afterLevel);
        setDisplayXP(xpResult.afterXP);
        setDisplayEarned(totalToAdd);
        return;
      }

      const seg = segments[segIdx];
      const segStart = performance.now();
      const segGain = seg.toXP - seg.fromXP;

      const tick = (now: number) => {
        if (cancelled) return;
        const rawT = Math.min(1, (now - segStart) / seg.durationMs);
        // Smooth ease-out cubic
        const eased = 1 - Math.pow(1 - rawT, 3);
        const curXP = Math.round(seg.fromXP + segGain * eased);
        setDisplayLevel(seg.level);
        setDisplayXP(curXP);
        setDisplayEarned(Math.min(totalToAdd, earnedBeforeSeg + Math.round(segGain * eased)));

        if (rawT < 1 && now - lastTickAt > 85) {
          lastTickAt = now;
          soundEngine.playXpTick();
        }

        if (rawT < 1) {
          rafId = requestAnimationFrame(tick);
          return;
        }

        earnedBeforeSeg += segGain;

        if (seg.levelsUpAtEnd) {
          levelUpCount += 1;
          soundEngine.playLevelUp(levelUpCount);
          soundEngine.triggerHaptic([18, 26, 30]);
          setDisplayLevel(seg.nextLevel);
          setDisplayXP(0);
          setLevelUpBanner({
            key: levelUpCount,
            level: seg.nextLevel,
            rankUpName: seg.rankChangedTo,
          });
          setSparks(createSparkBurst(levelUpCount));

          segIdx += 1;
          timeoutId = window.setTimeout(runSegment, 520);
        } else {
          segIdx += 1;
          runSegment();
        }
      };

      rafId = requestAnimationFrame(tick);
    };

    timeoutId = window.setTimeout(runSegment, 320);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [xpResult]);

  const rows: Array<{ label: string; p1: string | number; p2: string | number; highlight?: boolean }> = [
    { label: 'Total KOs', p1: p1Stats.kos, p2: p2Stats.kos, highlight: true },
    { label: 'Final Score', p1: p1Stats.score.toLocaleString(), p2: p2Stats.score.toLocaleString() },
    { label: 'Total Lines Cleared', p1: p1Stats.linesCleared, p2: p2Stats.linesCleared },
    { label: 'Level Reached', p1: p1Stats.level, p2: p2Stats.level },
    {
      label: 'Max Combo',
      p1: p1Stats.maxCombo >= 2 ? `${p1Stats.maxCombo}x` : '—',
      p2: p2Stats.maxCombo >= 2 ? `${p2Stats.maxCombo}x` : '—',
    },
    { label: 'Breach Sent', p1: p1Stats.garbageSent, p2: p2Stats.garbageSent },
  ];

  const activeTier = getRankTier(displayLevel);
  const isMaxLevel = displayLevel >= MAX_PLAYER_LEVEL;
  const neededForDisplay = xpNeededForNextLevel(displayLevel);
  const barPct = isMaxLevel
    ? 100
    : neededForDisplay > 0
      ? Math.min(100, (displayXP / neededForDisplay) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{
        backgroundColor: theme.isDark ? 'rgba(4, 7, 15, 0.82)' : 'rgba(15, 23, 42, 0.56)',
        backdropFilter: 'blur(6px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-summary-title"
    >
      <div
        className="w-full max-w-lg max-h-[94dvh] overflow-y-auto rounded-2xl border p-5 sm:p-7 flex flex-col gap-4 sm:gap-5"
        style={{
          backgroundColor: theme.surfaceBg,
          borderColor: theme.borderStrong,
          color: theme.textPrimary,
          boxShadow: theme.blockGlow ? `0 24px 64px rgba(0, 0, 0, 0.65)` : '0 20px 50px rgba(0,0,0,0.2)',
        }}
      >
        {/* Winner Header */}
        <div className="text-center space-y-1.5">
          <div
            className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-0.5"
            style={{ backgroundColor: theme.surfaceElevated, color: theme.accentPrimary }}
          >
            <Trophy className="w-5 h-5" />
          </div>
          <h2
            id="match-summary-title"
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            {winnerText}
          </h2>
          <p className="text-xs font-medium" style={{ color: theme.textMuted }}>
            {reasonText} · Duration {durationText}
          </p>
        </div>

        {/* Post-Match XP Progression & Animated Level-Up Celebration */}
        {xpResult && (
          <div
            className={`relative rounded-xl border p-3.5 sm:p-4 flex flex-col gap-3 overflow-hidden ${
              activeTier.isPrismatic ? 'rank-mythic-border' : ''
            }`}
            style={{
              backgroundColor: theme.surfaceElevated,
              borderColor: levelUpBanner ? activeTier.borderColor : theme.border,
              boxShadow:
                levelUpBanner && theme.blockGlow ? `0 0 26px ${activeTier.glowColor}` : 'none',
            }}
          >
            {/* Confetti / Spark Burst Layer */}
            {sparks.length > 0 && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
                {sparks.map((s) => (
                  <span
                    key={s.id}
                    className="confetti-spark absolute top-1/2 rounded-xs"
                    style={
                      {
                        left: `${s.leftPct}%`,
                        width: `${s.size}px`,
                        height: `${s.size}px`,
                        backgroundColor: s.color,
                        boxShadow: `0 0 8px ${s.color}`,
                        '--spark-dx': `${s.dx}px`,
                        '--spark-dy': `${s.dy}px`,
                        '--spark-rot': `${s.rot}deg`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            )}

            {/* Header Row: Rank Badge + Total Earned XP */}
            <div className="flex items-center justify-between gap-2 relative z-10">
              <div className="flex items-center gap-2 min-w-0">
                <RankBadge level={displayLevel} size="md" showRankName />
              </div>
              <div
                className="font-mono-num text-xs sm:text-sm font-bold shrink-0"
                style={{ color: activeTier.primaryColor }}
              >
                +{displayEarned.toLocaleString()} XP
              </div>
            </div>

            {/* Level-Up / Rank-Up Celebration Banner */}
            {levelUpBanner && (
              <div
                key={levelUpBanner.key}
                className="animate-level-up relative z-10 rounded-lg border px-3 py-1.5 flex items-center justify-center gap-2 text-center"
                style={{
                  backgroundColor: activeTier.bgColor,
                  borderColor: activeTier.borderColor,
                  color: activeTier.primaryColor,
                }}
              >
                <RankEmblemIcon tier={activeTier} className="w-4 h-4 shrink-0" />
                <span className="font-display text-xs sm:text-sm font-bold tracking-wider uppercase">
                  {levelUpBanner.rankUpName
                    ? `RANK UP! ${levelUpBanner.rankUpName} · LVL ${levelUpBanner.level}`
                    : `LEVEL UP! LVL ${levelUpBanner.level}`}
                </span>
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
              </div>
            )}

            {/* Animated XP Progress Bar */}
            <div className="flex flex-col gap-1 relative z-10">
              <div className="flex items-center justify-between text-[11px] font-mono-num">
                <span style={{ color: theme.textMuted }}>
                  {isMaxLevel ? 'MYTHIC LEGEND · MAX LEVEL' : `LEVEL ${displayLevel} PROGRESS`}
                </span>
                <span className="font-semibold" style={{ color: theme.textPrimary }}>
                  {isMaxLevel
                    ? 'MAX'
                    : `${displayXP.toLocaleString()} / ${neededForDisplay.toLocaleString()} XP`}
                </span>
              </div>
              <div
                className="w-full h-3 rounded-sm overflow-hidden border"
                style={{
                  backgroundColor: theme.boardBg,
                  borderColor: theme.border,
                }}
              >
                <div
                  className={`h-full ${activeTier.isPrismatic ? 'rank-mythic-bar' : ''}`}
                  style={{
                    width: `${barPct}%`,
                    background: activeTier.isPrismatic
                      ? undefined
                      : `linear-gradient(90deg, ${activeTier.secondaryColor}, ${activeTier.primaryColor})`,
                    boxShadow: `0 0 12px ${activeTier.glowColor}`,
                  }}
                />
              </div>
            </div>

            {/* Compact XP Breakdown Chips */}
            <div
              className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t text-[11px] relative z-10"
              style={{ borderColor: theme.border }}
            >
              {xpResult.breakdown.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate" style={{ color: theme.textMuted }} title={item.detail}>
                    {item.label}
                  </span>
                  <span
                    className="font-mono-num font-bold shrink-0"
                    style={{ color: theme.textPrimary }}
                  >
                    +{item.xp}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparison Table */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.surfaceElevated,
          }}
        >
          <div
            className="grid grid-cols-3 px-4 py-2 text-xs font-semibold border-b"
            style={{ borderColor: theme.border }}
          >
            <span style={{ color: theme.accentP1 }} className="truncate">
              {p1Label}
            </span>
            <span className="text-center" style={{ color: theme.textMuted }}>
              Metric
            </span>
            <span style={{ color: theme.accentP2 }} className="text-right truncate">
              {p2Label}
            </span>
          </div>

          <div className="divide-y" style={{ borderColor: theme.border }}>
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-3 px-4 py-2 items-center text-xs sm:text-sm"
                style={{ borderColor: theme.border }}
              >
                <span
                  className={`font-mono-num ${row.highlight ? 'text-base sm:text-lg font-bold' : 'font-semibold'}`}
                  style={{ color: row.highlight ? theme.accentP1 : theme.textPrimary }}
                >
                  {row.p1}
                </span>
                <span className="text-center text-[11px] sm:text-xs" style={{ color: theme.textMuted }}>
                  {row.label}
                </span>
                <span
                  className={`font-mono-num text-right ${row.highlight ? 'text-base sm:text-lg font-bold' : 'font-semibold'}`}
                  style={{ color: row.highlight ? theme.accentP2 : theme.textPrimary }}
                >
                  {row.p2}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Online Rematch Status Notice */}
        {isOnline && rematchState === 'rival_ready' && (
          <div
            className="rounded-xl border px-3.5 py-2 text-center text-xs font-semibold"
            style={{
              backgroundColor: `${theme.accentPrimary}18`,
              borderColor: theme.accentPrimary,
              color: theme.accentPrimary,
            }}
          >
            {p2Label} wants a rematch! Tap Play Again to launch the next round.
          </div>
        )}
        {isOnline && rematchState === 'opponent_left' && (
          <div
            className="rounded-xl border px-3.5 py-2 text-center text-xs font-medium"
            style={{
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
              color: theme.textMuted,
            }}
          >
            {isQuickMatch
              ? `${p2Label} left the match. Tap Find New Opponent to re-enter the queue.`
              : `${p2Label} left the room. Return to menu to start a new room.`}
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isQuickMatch && rematchState === 'opponent_left' && onFindNewOpponent ? (
            <button
              type="button"
              onClick={onFindNewOpponent}
              className="h-12 px-5 rounded-xl font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: theme.accentPrimary,
                color: theme.accentPrimaryText,
              }}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Find New Opponent</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRematch}
              disabled={
                isOnline && (rematchState === 'waiting_for_rival' || rematchState === 'opponent_left')
              }
              className="h-12 px-5 rounded-xl font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: theme.accentPrimary,
                color: theme.accentPrimaryText,
              }}
            >
              {isOnline && rematchState === 'waiting_for_rival' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Waiting for Rival...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>
                    {isOnline
                      ? rematchState === 'rival_ready'
                        ? 'Play Again (Ready!)'
                        : 'Play Again'
                      : 'Rematch'}
                  </span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onMainMenu}
            className="h-12 px-5 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: theme.surfaceElevated,
              borderColor: theme.border,
              color: theme.textPrimary,
            }}
          >
            <Home className="w-4 h-4" />
            <span>{isQuickMatch ? 'Main Menu' : isOnline ? 'Leave Room' : 'Main Menu'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
