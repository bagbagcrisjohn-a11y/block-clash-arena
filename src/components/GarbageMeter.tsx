import React from 'react';
import { ThemePalette, VISIBLE_ROWS } from '../game/constants';

interface GarbageMeterProps {
  incomingLines: number;
  readyLines: number;
  nextGapCol: number | null;
  heightPx: number;
  theme: ThemePalette;
}

export const GarbageMeter: React.FC<GarbageMeterProps> = ({
  incomingLines,
  readyLines,
  nextGapCol,
  heightPx,
  theme,
}) => {
  const clampedTotal = Math.min(incomingLines, VISIBLE_ROWS);
  const clampedReady = Math.min(readyLines, clampedTotal);
  const telegraphLines = Math.max(0, clampedTotal - clampedReady);

  const totalPct = (clampedTotal / VISIBLE_ROWS) * 100;
  const readyPct = (clampedReady / VISIBLE_ROWS) * 100;
  const telegraphPct = (telegraphLines / VISIBLE_ROWS) * 100;
  const isCritical = incomingLines >= 4;

  return (
    <div className="flex flex-col items-center gap-1 select-none w-5 shrink-0">
      <div
        className="relative w-3.5 rounded-sm overflow-hidden flex flex-col justify-end"
        style={{
          height: heightPx,
          backgroundColor: theme.boardBg,
          border: `1px solid ${incomingLines > 0 ? theme.danger : theme.border}`,
        }}
        role="meter"
        aria-label="Incoming breach rows"
        aria-valuemin={0}
        aria-valuemax={VISIBLE_ROWS}
        aria-valuenow={incomingLines}
      >
        {/* Subtle tick marks every 4 rows */}
        {[20, 40, 60, 80].map((pct) => (
          <div
            key={pct}
            className="absolute inset-x-0 h-px pointer-events-none z-10"
            style={{
              bottom: `${pct}%`,
              backgroundColor: theme.border,
            }}
          />
        ))}

        {/* Telegraphing (incoming) amber/orange segment */}
        {telegraphPct > 0 && (
          <div
            className="w-full transition-all duration-150"
            style={{
              height: `${telegraphPct}%`,
              backgroundColor: theme.warning,
              opacity: 0.9,
            }}
          />
        )}

        {/* Ready-to-rise crimson danger segment */}
        {readyPct > 0 && (
          <div
            className="w-full transition-all duration-150"
            style={{
              height: `${readyPct}%`,
              backgroundColor: theme.danger,
              boxShadow: theme.blockGlow && isCritical ? `0 0 10px ${theme.danger}` : 'none',
            }}
          />
        )}

        {/* Subtle sheen when active */}
        {totalPct > 0 && (
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: `${totalPct}%`,
              borderTop: '1px solid rgba(255,255,255,0.45)',
            }}
          />
        )}
      </div>

      {/* Explicit numeric indicator + gap column so danger is never conveyed by color alone */}
      <span
        className="font-mono-num text-[11px] font-bold leading-none h-3.5 flex items-center justify-center"
        style={{
          color: incomingLines > 0 ? theme.danger : theme.textMuted,
        }}
        title={
          incomingLines > 0 && nextGapCol !== null
            ? `${incomingLines} incoming breach rows (Energy Core at column ${nextGapCol + 1})`
            : 'No incoming breach rows'
        }
      >
        {incomingLines > 0 ? `+${incomingLines}` : '0'}
      </span>
      <span
        className="font-mono-num text-[9px] font-semibold leading-none h-3 flex items-center justify-center"
        style={{
          color: incomingLines > 0 ? theme.warning : 'transparent',
        }}
        aria-hidden={incomingLines === 0}
      >
        {nextGapCol !== null ? `C${nextGapCol + 1}` : '—'}
      </span>
    </div>
  );
};
