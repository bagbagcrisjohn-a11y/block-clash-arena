import React from 'react';
import { ThemePalette, VISIBLE_ROWS } from '../game/constants';
import { MAX_PLAYER_LEVEL } from '../game/progression';
import { TileSkinId } from '../game/skins';
import { FloatingCallout, PieceType, PlayerBoardState } from '../game/types';
import { BoardCanvas } from './BoardCanvas';
import { GarbageMeter } from './GarbageMeter';
import { PiecePreviewCanvas } from './PiecePreviewCanvas';
import { RankBadge } from './RankBadge';
import { TouchAction, TouchControls } from './TouchControls';

export interface PlayerHudSnapshot {
  label: string;
  subtitle?: string;
  playerLevel?: number;
  score: number;
  level: number;
  kos: number;
  lines: number;
  combo: number;
  hold: PieceType | null;
  holdUsed: boolean;
  next3: PieceType[];
  incomingTotal: number;
  incomingReady: number;
  nextGapCol: number | null;
  shakeX: number;
  shakeY: number;
}

interface PlayerArenaPanelProps {
  side: 'left' | 'right';
  boardRef: React.RefObject<PlayerBoardState>;
  boardContainerRef: React.RefObject<HTMLDivElement | null>;
  hud: PlayerHudSnapshot;
  callouts: FloatingCallout[];
  theme: ThemePalette;
  cellSize: number;
  accentColor: string;
  layout?: 'full' | 'compact';
  showTouchControls?: boolean;
  controlsDisabled?: boolean;
  onTouchAction?: (action: TouchAction) => void;
  controlHint?: string;
  skinId?: TileSkinId;
  reducedEffects?: boolean;
}

export const PlayerArenaPanel: React.FC<PlayerArenaPanelProps> = ({
  side,
  boardRef,
  boardContainerRef,
  hud,
  callouts,
  theme,
  cellSize,
  accentColor,
  layout = 'full',
  showTouchControls = false,
  controlsDisabled = false,
  onTouchAction,
  controlHint,
  skinId = 'classic',
  reducedEffects = false,
}) => {
  const boardHeight = VISIBLE_ROWS * cellSize;
  const previewCell = Math.max(9, Math.floor(cellSize * 0.52));
  const previewW = Math.max(48, Math.round(cellSize * 2.75));
  const previewH = Math.max(28, Math.round(cellSize * 1.6));

  const calloutColor = (tone: FloatingCallout['tone']) => {
    switch (tone) {
      case 'ko':
        return theme.danger;
      case 'bomb':
        return theme.isDark ? '#FB923C' : '#EA580C';
      case 'quad':
        return theme.accentPrimary;
      case 'combo':
        return theme.warning;
      case 'counter':
        return theme.pieces.S.fill;
      default:
        return theme.textPrimary;
    }
  };

  const sideColumn = (
    <div className="flex flex-col gap-2.5 shrink-0" style={{ width: previewW + 16 }}>
      {/* Reserve Vault Box */}
      <div
        className="rounded-lg border p-2 flex flex-col items-center"
        style={{
          backgroundColor: theme.surfaceBg,
          borderColor: theme.border,
        }}
      >
        <span
          className="text-[11px] font-semibold tracking-wide mb-1"
          style={{ color: theme.textMuted }}
        >
          Reserve
        </span>
        <PiecePreviewCanvas
          piece={hud.hold}
          theme={theme}
          cellSize={previewCell}
          dimmed={hud.holdUsed}
          width={previewW}
          height={previewH}
          skinId={skinId}
          reducedEffects={reducedEffects}
        />
      </div>

      {/* Incoming 3 Queue */}
      <div
        className="rounded-lg border p-2 flex flex-col items-center gap-1"
        style={{
          backgroundColor: theme.surfaceBg,
          borderColor: theme.border,
        }}
      >
        <span
          className="text-[11px] font-semibold tracking-wide mb-0.5"
          style={{ color: theme.textMuted }}
        >
          Queue
        </span>
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="w-full flex items-center justify-center py-0.5"
            style={{
              borderTop: idx > 0 ? `1px solid ${theme.border}` : 'none',
              paddingTop: idx > 0 ? 5 : 0,
            }}
          >
            <PiecePreviewCanvas
              piece={hud.next3[idx] ?? null}
              theme={theme}
              cellSize={idx === 0 ? previewCell : Math.max(9, previewCell - 2)}
              width={previewW}
              height={idx === 0 ? previewH : Math.max(26, previewH - 6)}
              skinId={skinId}
              reducedEffects={reducedEffects}
            />
          </div>
        ))}
      </div>

      {/* Player Score, Level, Lines, Combo */}
      <div
        className="rounded-lg border px-2.5 py-2 flex flex-col gap-1.5"
        style={{
          backgroundColor: theme.surfaceBg,
          borderColor: theme.border,
        }}
      >
        <div>
          <div className="text-[10px] font-medium" style={{ color: theme.textMuted }}>
            Score
          </div>
          <div
            className="font-mono-num text-sm font-bold leading-tight truncate"
            style={{ color: theme.textPrimary }}
          >
            {hud.score.toLocaleString()}
          </div>
        </div>
        <div
          className="pt-1.5 border-t flex items-center justify-between text-[11px]"
          style={{ borderColor: theme.border }}
        >
          <span style={{ color: theme.textMuted }}>Level</span>
          <span className="font-mono-num font-bold" style={{ color: accentColor }}>
            {hud.level}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span style={{ color: theme.textMuted }}>Lines</span>
          <span className="font-mono-num font-bold" style={{ color: theme.textPrimary }}>
            {hud.lines}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span style={{ color: theme.textMuted }}>Combo</span>
          <span
            className="font-mono-num font-bold"
            style={{ color: hud.combo >= 2 ? theme.warning : theme.textPrimary }}
          >
            {hud.combo >= 2 ? `${hud.combo}x` : '—'}
          </span>
        </div>
      </div>
    </div>
  );

  const garbageMeter = (
    <GarbageMeter
      incomingLines={hud.incomingTotal}
      readyLines={hud.incomingReady}
      nextGapCol={hud.nextGapCol}
      heightPx={boardHeight}
      theme={theme}
    />
  );

  const frameCornerColor = hud.incomingTotal >= 4 ? theme.danger : accentColor;

  const playfield = (
    <div
      ref={boardContainerRef}
      className="relative rounded-lg p-1.5 border shrink-0"
      style={{
        backgroundColor: theme.surfaceBg,
        borderColor: hud.incomingTotal >= 4 ? theme.danger : theme.borderStrong,
        transform: `translate3d(${hud.shakeX}px, ${hud.shakeY}px, 0)`,
        willChange: 'transform',
        boxShadow:
          theme.blockGlow && hud.incomingTotal >= 4
            ? `0 0 22px ${theme.danger}44`
            : theme.blockGlow
              ? `0 0 24px ${accentColor}1c`
              : 'none',
      }}
    >
      {/* Signature Block Clash 4-Corner Machined Arena Bay Brackets */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 rounded-tl-md z-10"
        style={{ borderColor: frameCornerColor }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 rounded-tr-md z-10"
        style={{ borderColor: frameCornerColor }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 rounded-bl-md z-10"
        style={{ borderColor: frameCornerColor }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 rounded-br-md z-10"
        style={{ borderColor: frameCornerColor }}
      />

      <BoardCanvas
        boardRef={boardRef}
        theme={theme}
        cellSize={cellSize}
        accentColor={accentColor}
        isMythicLegend={(hud.playerLevel ?? 1) >= MAX_PLAYER_LEVEL}
        skinId={skinId}
        reducedEffects={reducedEffects}
      />

      {/* Floating Callouts */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
        {callouts.map((c, idx) => (
          <div
            key={c.id}
            className="animate-callout absolute left-1/2 text-center select-none whitespace-nowrap"
            style={{
              top: `${34 + (idx % 3) * 11}%`,
            }}
          >
            <div
              className="font-display font-bold tracking-wide text-xl sm:text-2xl leading-none"
              style={{
                color: calloutColor(c.tone),
                textShadow: theme.isDark
                  ? '0 2px 12px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.85)'
                  : '0 2px 8px rgba(255,255,255,0.95)',
              }}
            >
              {c.text}
            </div>
            {c.subtext && (
              <div
                className="font-mono-num text-xs font-bold mt-1"
                style={{
                  color: theme.textPrimary,
                  textShadow: theme.isDark
                    ? '0 1px 6px rgba(0,0,0,0.95)'
                    : '0 1px 4px rgba(255,255,255,0.95)',
                }}
              >
                {c.subtext}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  if (layout === 'compact') {
    return (
      <div className="flex flex-col items-center gap-1 min-w-0">
        <div className="w-full flex items-center justify-between gap-1 px-0.5">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className="font-display text-xs font-bold tracking-wide truncate"
              style={{ color: accentColor }}
            >
              {hud.label}
            </span>
            {hud.playerLevel !== undefined && (
              <RankBadge level={hud.playerLevel} size="xs" />
            )}
          </div>
          <span
            className="font-mono-num text-[10px] font-bold whitespace-nowrap shrink-0"
            style={{ color: hud.incomingTotal > 0 ? theme.danger : theme.textMuted }}
          >
            {hud.incomingTotal > 0 ? `+${hud.incomingTotal}` : `Lv${hud.level}`}
          </span>
        </div>

        <div className="flex items-start gap-1">
          {side === 'left' ? (
            <>
              {playfield}
              {garbageMeter}
            </>
          ) : (
            <>
              {garbageMeter}
              {playfield}
            </>
          )}
        </div>

        <div className="w-full flex items-center justify-between px-0.5 text-[10px] font-mono-num">
          <span style={{ color: theme.textMuted }}>
            {hud.score.toLocaleString()}
          </span>
          <span style={{ color: theme.textMuted }}>
            L:{hud.lines}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      {/* Player Name ("YOU" / "RIVAL"), Level & KO Header */}
      <div className="w-full flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-display text-lg font-bold tracking-wide whitespace-nowrap"
            style={{ color: accentColor }}
          >
            {hud.label}
          </span>
          {hud.playerLevel !== undefined && (
            <RankBadge level={hud.playerLevel} size="sm" />
          )}
          {hud.subtitle && (
            <span className="text-xs font-medium truncate" style={{ color: theme.textMuted }}>
              · {hud.subtitle}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 shrink-0">
          {hud.incomingTotal > 0 && (
            <span
              className="font-mono-num text-xs font-bold whitespace-nowrap"
              style={{ color: theme.danger }}
            >
              +{hud.incomingTotal} Breach
            </span>
          )}
          <div className="flex items-baseline gap-1">
            <span className="text-[11px] font-medium" style={{ color: theme.textMuted }}>
              Lv
            </span>
            <span className="font-mono-num text-sm font-bold" style={{ color: theme.textPrimary }}>
              {hud.level}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[11px] font-medium" style={{ color: theme.textMuted }}>
              KO
            </span>
            <span className="font-mono-num text-base font-bold leading-none" style={{ color: accentColor }}>
              {hud.kos}
            </span>
          </div>
        </div>
      </div>

      {/* Board Assembly: Hold/Next on outer edge, Garbage Meter on inner battle edge */}
      <div className="flex items-start gap-2">
        {side === 'left' ? (
          <>
            {sideColumn}
            {playfield}
            {garbageMeter}
          </>
        ) : (
          <>
            {garbageMeter}
            {playfield}
            {sideColumn}
          </>
        )}
      </div>

      {/* On-screen Touch Controls or Compact Key Hint */}
      {showTouchControls && onTouchAction ? (
        <div className="w-full max-w-[396px] pt-1">
          <TouchControls
            onAction={onTouchAction}
            theme={theme}
            disabled={controlsDisabled}
            label={`${hud.label} controls`}
            variant="desktop"
          />
        </div>
      ) : (
        controlHint && (
          <div
            className="text-[11px] font-medium text-center pt-1 truncate max-w-full"
            style={{ color: theme.textMuted }}
          >
            {controlHint}
          </div>
        )
      )}
    </div>
  );
};
