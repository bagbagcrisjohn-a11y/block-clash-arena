import React, { useEffect, useRef } from 'react';
import { PIECE_SHAPES, ThemePalette } from '../game/constants';
import { TileSkinId } from '../game/skins';
import { PieceType } from '../game/types';
import { drawBlockCell } from './blockRenderer';

interface PiecePreviewCanvasProps {
  piece: PieceType | null;
  theme: ThemePalette;
  skinId?: TileSkinId;
  reducedEffects?: boolean;
  rotation?: 0 | 1 | 2 | 3;
  animate?: boolean;
  cellSize?: number;
  dimmed?: boolean;
  width?: number;
  height?: number;
}

export const PiecePreviewCanvas: React.FC<PiecePreviewCanvasProps> = ({
  piece,
  theme,
  skinId = 'classic',
  reducedEffects = false,
  rotation = 0,
  animate = false,
  cellSize = 16,
  dimmed = false,
  width = 76,
  height = 48,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const drawFrame = (timeMs: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (!piece) return;

      const shape = PIECE_SHAPES[piece][rotation];
      const xs = shape.map(([cx]) => cx);
      const ys = shape.map(([, cy]) => cy);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const pieceW = (maxX - minX + 1) * cellSize;
      const pieceH = (maxY - minY + 1) * cellSize;
      const offsetX = Math.round((width - pieceW) / 2);
      const offsetY = Math.round((height - pieceH) / 2);

      shape.forEach(([cx, cy], idx) => {
        drawBlockCell(
          ctx,
          offsetX + (cx - minX) * cellSize,
          offsetY + (cy - minY) * cellSize,
          cellSize,
          piece,
          theme,
          {
            alpha: dimmed ? 0.38 : 1,
            skinId,
            timeMs,
            cellSeed: (cx + 1) * 7 + (cy + 1) * 13 + idx * 3,
            reducedEffects,
          }
        );
      });
    };

    if (!animate || reducedEffects || skinId === 'classic' || !piece) {
      drawFrame(1200);
      return;
    }

    let rafId = 0;
    const loop = (now: number) => {
      drawFrame(now);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [piece, theme, skinId, reducedEffects, rotation, animate, cellSize, dimmed, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block mx-auto"
      aria-label={piece ? `${piece} block piece` : 'Empty slot'}
    />
  );
};
