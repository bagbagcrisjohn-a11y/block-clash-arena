import React, { useEffect, useRef } from 'react';
import { BUFFER_ROWS, COLS, LOCK_DELAY_MS, ThemePalette, VISIBLE_ROWS } from '../game/constants';
import { getGhostY, getPieceCells } from '../game/engine';
import { PlayerBoardState } from '../game/types';
import { drawBlockCell } from './blockRenderer';

interface BoardCanvasProps {
  boardRef: React.RefObject<PlayerBoardState>;
  theme: ThemePalette;
  cellSize: number;
  accentColor: string;
  isMythicLegend?: boolean;
}

export const BoardCanvas: React.FC<BoardCanvasProps> = ({
  boardRef,
  theme,
  cellSize,
  accentColor,
  isMythicLegend = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<ThemePalette>(theme);
  const cellSizeRef = useRef<number>(cellSize);
  const accentRef = useRef<string>(accentColor);
  const mythicRef = useRef<boolean>(isMythicLegend);

  themeRef.current = theme;
  cellSizeRef.current = cellSize;
  accentRef.current = accentColor;
  mythicRef.current = isMythicLegend;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const render = () => {
      const board = boardRef.current;
      const t = themeRef.current;
      const cs = cellSizeRef.current;
      const width = COLS * cs;
      const height = VISIBLE_ROWS * cs;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.fillStyle = t.boardBg;
      ctx.fillRect(0, 0, width, height);

      // Subtle playfield grid lines
      ctx.strokeStyle = t.boardGridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 1; c < COLS; c++) {
        const px = c * cs + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      for (let r = 1; r < VISIBLE_ROWS; r++) {
        const py = r * cs + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      }
      ctx.stroke();

      // Danger top line indicator (2nd row from top)
      ctx.save();
      ctx.strokeStyle = t.boardTopLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, cs * 2 + 0.5);
      ctx.lineTo(width, cs * 2 + 0.5);
      ctx.stroke();
      ctx.restore();

      if (board) {
        const isMythic = mythicRef.current;
        const nowMs = performance.now();

        // Hard drop light beams behind pieces (Level 300 Mythic Legend gets prismatic rainbow glow trail!)
        for (const trail of board.hardDropTrails) {
          if (trail.alpha <= 0.01) continue;
          const color = t.pieces[trail.colorKey].light;
          ctx.save();
          for (const [cx, cy] of trail.cells) {
            const col = trail.x + cx;
            const startVisRow = Math.max(0, trail.fromY + cy - BUFFER_ROWS);
            const endVisRow = trail.toY + cy - BUFFER_ROWS;
            if (endVisRow <= startVisRow) continue;
            const gx = col * cs;
            const gy = startVisRow * cs;
            const gh = (endVisRow - startVisRow) * cs;
            const grad = ctx.createLinearGradient(0, gy, 0, gy + gh);
            if (isMythic) {
              grad.addColorStop(0, 'rgba(255, 51, 102, 0)');
              grad.addColorStop(0.24, '#FF3366');
              grad.addColorStop(0.45, '#FACC15');
              grad.addColorStop(0.65, '#22C55E');
              grad.addColorStop(0.84, '#00F0FF');
              grad.addColorStop(1, '#A855F7');
              ctx.globalAlpha = trail.alpha * 0.56;
              ctx.shadowColor = '#00F0FF';
              ctx.shadowBlur = 10;
            } else {
              grad.addColorStop(0, 'rgba(255,255,255,0)');
              grad.addColorStop(1, color);
              ctx.globalAlpha = trail.alpha * 0.32;
            }
            ctx.fillStyle = grad;
            ctx.fillRect(gx + 2, gy, cs - 4, gh);
          }
          ctx.restore();
        }

        // Placed blocks (with live 60fps pulse for Bomb Blocks)
        const bombPulse = (Math.sin(performance.now() / 140) + 1) * 0.5;
        for (let r = BUFFER_ROWS; r < BUFFER_ROWS + VISIBLE_ROWS; r++) {
          const visRow = r - BUFFER_ROWS;
          for (let c = 0; c < COLS; c++) {
            const cell = board.grid[r][c];
            if (cell !== null) {
              drawBlockCell(
                ctx,
                c * cs,
                visRow * cs,
                cs,
                cell,
                t,
                cell === 'B' ? { pulsePhase: bombPulse } : undefined
              );
            }
          }
        }

        // Ghost piece preview
        const ghostY = getGhostY(board.grid, board.active);
        const ghostPiece = { ...board.active, y: ghostY };
        for (const [gx, gy] of getPieceCells(ghostPiece)) {
          const visRow = gy - BUFFER_ROWS;
          if (visRow >= 0 && visRow < VISIBLE_ROWS) {
            drawBlockCell(ctx, gx * cs, visRow * cs, cs, board.active.type, t, { ghost: true });
          }
        }

        // Active falling piece (with subtle prismatic rainbow glow aura for Level 300 Mythic Legend)
        const lockProgress = board.isGrounded ? Math.min(1, board.lockTimerMs / LOCK_DELAY_MS) : 0;
        const activeCells = getPieceCells(board.active);
        if (isMythic) {
          const hue = (nowMs / 14) % 360;
          ctx.save();
          ctx.shadowColor = `hsl(${hue}, 100%, 62%)`;
          ctx.shadowBlur = Math.max(8, cs * 0.55);
          ctx.fillStyle = `hsla(${(hue + 45) % 360}, 100%, 68%, 0.28)`;
          for (const [ax, ay] of activeCells) {
            const visRow = ay - BUFFER_ROWS;
            if (visRow >= 0 && visRow < VISIBLE_ROWS) {
              ctx.fillRect(ax * cs - 1, visRow * cs - 1, cs + 2, cs + 2);
            }
          }
          ctx.restore();
        }
        for (const [ax, ay] of activeCells) {
          const visRow = ay - BUFFER_ROWS;
          if (visRow >= 0 && visRow < VISIBLE_ROWS) {
            drawBlockCell(ctx, ax * cs, visRow * cs, cs, board.active.type, t, { lockProgress });
          }
        }

        // Line clear & fiery orange Bomb Blast flash bars
        for (const flash of board.clearFlashes) {
          if (flash.alpha <= 0.01) continue;
          ctx.save();
          if (flash.kind === 'bomb') {
            ctx.fillStyle = '#FB923C';
            ctx.globalAlpha = flash.alpha * 0.92;
            for (const rowIdx of flash.rows) {
              const visRow = rowIdx - BUFFER_ROWS;
              if (visRow >= 0 && visRow < VISIBLE_ROWS) {
                ctx.fillRect(0, visRow * cs, width, cs);
                ctx.fillStyle = '#FEF08A';
                ctx.globalAlpha = flash.alpha * 0.7;
                ctx.fillRect(0, visRow * cs + cs * 0.25, width, cs * 0.5);
                ctx.fillStyle = '#FB923C';
                ctx.globalAlpha = flash.alpha * 0.92;
              }
            }
          } else {
            ctx.fillStyle = t.retroPattern ? '#1A2314' : '#FFFFFF';
            ctx.globalAlpha = flash.alpha * 0.85;
            for (const rowIdx of flash.rows) {
              const visRow = rowIdx - BUFFER_ROWS;
              if (visRow >= 0 && visRow < VISIBLE_ROWS) {
                ctx.fillRect(0, visRow * cs, width, cs);
              }
            }
          }
          ctx.restore();
        }

        // Shatter & bomb blast particles
        for (const p of board.particles) {
          if (p.alpha <= 0.01) continue;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x * cs - p.size / 2, p.y * cs - p.size / 2, p.size, p.size);
          ctx.restore();
        }

        // Incoming garbage bomb column preview along bottom edge
        if (board.incomingGarbage.length > 0) {
          const nextBatch = board.incomingGarbage[0];
          const bombCol = nextBatch.gapCol;
          const barH = Math.max(4, Math.floor(cs * 0.22));
          ctx.save();
          for (let c = 0; c < COLS; c++) {
            if (c === bombCol) {
              // Pulsing orange bomb beacon where the Bomb Block will rise
              const cx = c * cs + cs / 2;
              const cy = height - barH - 2;
              ctx.fillStyle = '#F97316';
              ctx.globalAlpha = 0.7 + bombPulse * 0.3;
              ctx.beginPath();
              ctx.arc(cx, cy - 2, Math.max(3, cs * 0.16), 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#FEF08A';
              ctx.beginPath();
              ctx.arc(cx, cy - 2, Math.max(1.5, cs * 0.07), 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillStyle = nextBatch.timerMs <= 0 ? t.danger : t.warning;
              ctx.globalAlpha = 0.82;
              ctx.fillRect(c * cs + 1, height - barH, cs - 2, barH);
            }
          }
          ctx.restore();
        }

        // KO flash overlay
        if (board.koFlashAlpha > 0.01) {
          ctx.save();
          ctx.fillStyle = t.danger;
          ctx.globalAlpha = board.koFlashAlpha * 0.42;
          ctx.fillRect(0, 0, width, height);

          ctx.strokeStyle = accentRef.current;
          ctx.lineWidth = 4;
          ctx.globalAlpha = board.koFlashAlpha * 0.85;
          ctx.strokeRect(2, 2, width - 4, height - 4);
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [boardRef]);

  return (
    <canvas
      ref={canvasRef}
      className="block rounded-sm"
      style={{
        width: COLS * cellSize,
        height: VISIBLE_ROWS * cellSize,
      }}
      aria-label="Playfield grid"
    />
  );
};
