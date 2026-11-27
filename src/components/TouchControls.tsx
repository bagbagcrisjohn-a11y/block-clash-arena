import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Repeat2,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { ARR_MS, DAS_MS, ThemePalette } from '../game/constants';

export type TouchAction = 'left' | 'right' | 'down' | 'rotateCW' | 'rotateCCW' | 'hardDrop' | 'hold';

interface ActivePointerRecord {
  action: TouchAction;
  delayId?: number;
  intervalId?: number;
}

interface TouchControlsProps {
  onAction: (action: TouchAction) => void;
  theme: ThemePalette;
  disabled?: boolean;
  label?: string;
  variant?: 'desktop' | 'portrait' | 'landscape-left' | 'landscape-right';
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onAction,
  theme,
  disabled = false,
  label,
  variant = 'desktop',
}) => {
  const activePointersRef = useRef<Map<number, ActivePointerRecord>>(new Map());
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const [pressedActions, setPressedActions] = useState<Record<string, boolean>>({});

  const syncPressedState = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const rec of activePointersRef.current.values()) {
      next[rec.action] = true;
    }
    setPressedActions(next);
  }, []);

  const releasePointer = useCallback(
    (pointerId: number) => {
      const rec = activePointersRef.current.get(pointerId);
      if (!rec) return;
      if (rec.delayId !== undefined) window.clearTimeout(rec.delayId);
      if (rec.intervalId !== undefined) window.clearInterval(rec.intervalId);
      activePointersRef.current.delete(pointerId);
      syncPressedState();
    },
    [syncPressedState]
  );

  const releaseAll = useCallback(() => {
    for (const rec of activePointersRef.current.values()) {
      if (rec.delayId !== undefined) window.clearTimeout(rec.delayId);
      if (rec.intervalId !== undefined) window.clearInterval(rec.intervalId);
    }
    activePointersRef.current.clear();
    setPressedActions({});
  }, []);

  // Clear stuck pointers on disable or unmount
  useEffect(() => {
    if (disabled) releaseAll();
    return () => releaseAll();
  }, [disabled, releaseAll]);

  const bindButton = (action: TouchAction, repeatable: boolean) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;

      // Capture pointer so slight thumb drift still cleanly fires pointerup/cancel
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if capture is unsupported
      }

      // Release any stale entry for the same pointerId without affecting OTHER fingers!
      releasePointer(e.pointerId);

      // Fire immediately with zero tap delay
      onActionRef.current(action);

      const rec: ActivePointerRecord = { action };
      if (repeatable) {
        rec.delayId = window.setTimeout(() => {
          rec.intervalId = window.setInterval(() => {
            onActionRef.current(action);
          }, action === 'down' ? 40 : ARR_MS + 14);
        }, DAS_MS + 10);
      }

      activePointersRef.current.set(e.pointerId, rec);
      syncPressedState();
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      releasePointer(e.pointerId);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      releasePointer(e.pointerId);
    },
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => {
      releasePointer(e.pointerId);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const getButtonStyle = (action: TouchAction, primary = false): React.CSSProperties => {
    const isPressed = Boolean(pressedActions[action]);
    if (primary) {
      return {
        backgroundColor: theme.accentPrimary,
        borderColor: isPressed ? '#FFFFFF' : theme.accentPrimary,
        color: theme.accentPrimaryText,
        transform: isPressed ? 'scale(0.93)' : 'scale(1)',
        boxShadow: isPressed
          ? `0 0 20px ${theme.accentPrimary}cc`
          : theme.blockGlow
            ? `0 4px 16px ${theme.accentPrimary}44`
            : 'none',
      };
    }

    return {
      backgroundColor: isPressed ? theme.accentPrimary : theme.surfaceElevated,
      borderColor: isPressed ? theme.accentPrimary : theme.borderStrong,
      color: isPressed ? theme.accentPrimaryText : theme.textPrimary,
      transform: isPressed ? 'scale(0.93)' : 'scale(1)',
      boxShadow: isPressed && theme.blockGlow ? `0 0 18px ${theme.accentPrimary}88` : 'none',
    };
  };

  // Portrait Mobile: Full-width Left Thumb Zone (D-Pad) + Right Thumb Zone (Actions)
  if (variant === 'portrait') {
    return (
      <div
        className="w-full arena-touch-lock px-2"
        aria-label={label ?? 'Mobile arcade controls'}
      >
        <div className="w-full max-w-[480px] mx-auto grid grid-cols-2 gap-3 items-end">
          {/* LEFT THUMB ZONE: Left, Right, Soft Drop */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={disabled}
                {...bindButton('left', true)}
                style={getButtonStyle('left')}
                className="min-h-[54px] min-w-[54px] rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
                aria-label="Move Left"
              >
                <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
              </button>
              <button
                type="button"
                disabled={disabled}
                {...bindButton('right', true)}
                style={getButtonStyle('right')}
                className="min-h-[54px] min-w-[54px] rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
                aria-label="Move Right"
              >
                <ArrowRight className="w-6 h-6 stroke-[2.5]" />
              </button>
            </div>
            <button
              type="button"
              disabled={disabled}
              {...bindButton('down', true)}
              style={getButtonStyle('down')}
              className="min-h-[50px] w-full rounded-xl border-2 flex items-center justify-center gap-2 text-xs font-bold tracking-wide transition-transform duration-75 disabled:opacity-40 cursor-pointer"
              aria-label="Soft Drop"
            >
              <ArrowDown className="w-5 h-5 stroke-[2.5]" />
              <span>SOFT DROP</span>
            </button>
          </div>

          {/* RIGHT THUMB ZONE: Rotate CCW, Rotate CW, Hold, Hard Drop */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={disabled}
                {...bindButton('rotateCCW', false)}
                style={getButtonStyle('rotateCCW')}
                className="min-h-[54px] min-w-[54px] rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
                aria-label="Rotate Counter-Clockwise"
              >
                <RotateCcw className="w-6 h-6 stroke-[2.5]" />
              </button>
              <button
                type="button"
                disabled={disabled}
                {...bindButton('rotateCW', false)}
                style={getButtonStyle('rotateCW')}
                className="min-h-[54px] min-w-[54px] rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
                aria-label="Rotate Clockwise"
              >
                <RotateCw className="w-6 h-6 stroke-[2.5]" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <button
                type="button"
                disabled={disabled}
                {...bindButton('hold', false)}
                style={getButtonStyle('hold')}
                className="col-span-2 min-h-[50px] min-w-[48px] rounded-xl border-2 flex items-center justify-center gap-1 text-[11px] font-bold tracking-wide transition-transform duration-75 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                aria-label="Reserve Piece"
              >
                <Repeat2 className="w-4 h-4" />
                <span>RESERVE</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                {...bindButton('hardDrop', false)}
                style={getButtonStyle('hardDrop', true)}
                className="col-span-3 min-h-[50px] min-w-[56px] rounded-xl border-2 flex items-center justify-center gap-1.5 text-xs font-display font-bold tracking-wide transition-transform duration-75 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                aria-label="Hard Drop"
              >
                <ArrowDownToLine className="w-5 h-5 stroke-[2.5]" />
                <span>DROP</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Landscape Mobile Left Thumb Zone
  if (variant === 'landscape-left') {
    return (
      <div className="arena-touch-lock flex flex-col gap-2" aria-label="Left thumb movement controls">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            {...bindButton('left', true)}
            style={getButtonStyle('left')}
            className="h-13 w-13 rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
            aria-label="Move Left"
          >
            <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('right', true)}
            style={getButtonStyle('right')}
            className="h-13 w-13 rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
            aria-label="Move Right"
          >
            <ArrowRight className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
        <button
          type="button"
          disabled={disabled}
          {...bindButton('down', true)}
          style={getButtonStyle('down')}
          className="h-12 w-full rounded-xl border-2 flex items-center justify-center gap-1.5 text-[11px] font-bold transition-transform duration-75 disabled:opacity-40 cursor-pointer"
          aria-label="Soft Drop"
        >
          <ArrowDown className="w-5 h-5 stroke-[2.5]" />
          <span>DOWN</span>
        </button>
      </div>
    );
  }

  // Landscape Mobile Right Thumb Zone
  if (variant === 'landscape-right') {
    return (
      <div className="arena-touch-lock flex flex-col gap-2" aria-label="Right thumb action controls">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            {...bindButton('rotateCCW', false)}
            style={getButtonStyle('rotateCCW')}
            className="h-13 w-13 rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
            aria-label="Rotate Counter-Clockwise"
          >
            <RotateCcw className="w-6 h-6 stroke-[2.5]" />
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('rotateCW', false)}
            style={getButtonStyle('rotateCW')}
            className="h-13 w-13 rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
            aria-label="Rotate Clockwise"
          >
            <RotateCw className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            {...bindButton('hold', false)}
            style={getButtonStyle('hold')}
            className="h-12 w-13 rounded-xl border-2 flex items-center justify-center text-[10px] font-bold transition-transform duration-75 disabled:opacity-40 cursor-pointer"
            aria-label="Reserve Piece"
          >
            RES
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('hardDrop', false)}
            style={getButtonStyle('hardDrop', true)}
            className="h-12 w-13 rounded-xl border-2 flex items-center justify-center transition-transform duration-75 disabled:opacity-40 cursor-pointer"
            aria-label="Hard Drop"
          >
            <ArrowDownToLine className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    );
  }

  // Desktop / Tablet inline bar underneath board (>=48px touch targets)
  return (
    <div className="w-full arena-touch-lock" aria-label={label ?? 'On-screen controls'}>
      <div className="flex items-center justify-between gap-1.5">
        {/* Directional Pad */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            {...bindButton('left', true)}
            style={getButtonStyle('left')}
            className="h-12 w-12 rounded-xl border flex items-center justify-center transition-transform duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 cursor-pointer"
            aria-label="Move Left"
            title="Move Left"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('down', true)}
            style={getButtonStyle('down')}
            className="h-12 w-12 rounded-xl border flex items-center justify-center transition-transform duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 cursor-pointer"
            aria-label="Soft Drop"
            title="Soft Drop"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('right', true)}
            style={getButtonStyle('right')}
            className="h-12 w-12 rounded-xl border flex items-center justify-center transition-transform duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 cursor-pointer"
            aria-label="Move Right"
            title="Move Right"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Action Cluster */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            {...bindButton('hold', false)}
            style={getButtonStyle('hold')}
            className="h-12 px-2.5 min-w-[48px] rounded-xl border flex items-center justify-center gap-1 text-xs font-semibold transition-transform duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 cursor-pointer whitespace-nowrap"
            aria-label="Reserve Piece"
            title="Reserve Piece (C / Shift)"
          >
            <Repeat2 className="w-4 h-4" />
            <span className="hidden sm:inline">RESERVE</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('rotateCCW', false)}
            style={getButtonStyle('rotateCCW')}
            className="h-12 w-12 rounded-xl border flex items-center justify-center transition-transform duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 cursor-pointer"
            aria-label="Rotate Counter-Clockwise"
            title="Rotate CCW (Z)"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('rotateCW', false)}
            style={getButtonStyle('rotateCW')}
            className="h-12 w-12 rounded-xl border flex items-center justify-center transition-transform duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 cursor-pointer"
            aria-label="Rotate Clockwise"
            title="Rotate CW (Up / X)"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            {...bindButton('hardDrop', false)}
            style={getButtonStyle('hardDrop', true)}
            className="h-12 px-3 min-w-[56px] rounded-xl border flex items-center justify-center gap-1.5 text-xs font-display font-bold transition-transform duration-75 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 cursor-pointer whitespace-nowrap"
            aria-label="Hard Drop"
            title="Hard Drop (Space)"
          >
            <ArrowDownToLine className="w-4 h-4" />
            <span>DROP</span>
          </button>
        </div>
      </div>
    </div>
  );
};
