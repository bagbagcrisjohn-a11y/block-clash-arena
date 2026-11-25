import React, { useEffect, useRef } from 'react';
import { PIECE_SHAPES, ThemePalette } from '../game/constants';
import { PieceType } from '../game/types';
import { drawBlockCell } from './blockRenderer';

interface PiecePreviewCanvasProps {
  piece: PieceType | null;
  theme: ThemePalette;
  cellSize?: number;
  dimmed?: boolean;
  width?: number;
  height?: number;
}

export const PiecePreviewCanvas: React.FC<PiecePreviewCanvasProps> = ({
  piece,
  theme,
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!piece) return;

    const shape = PIECE_SHAPES[piece][0];
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

    for (const [cx, cy] of shape) {
      drawBlockCell(
        ctx,
        offsetX + (cx - minX) * cellSize,
        offsetY + (cy - minY) * cellSize,
        cellSize,
        piece,
        theme,
        { alpha: dimmed ? 0.38 : 1 }
      );
    }
  }, [piece, theme, cellSize, dimmed, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block mx-auto"
      aria-label={piece ? `${piece} tetromino` : 'Empty slot'}
    />
  );
};
