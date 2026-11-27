import React, { useEffect, useRef } from 'react';
import { BUFFER_ROWS, COLS, LOCK_DELAY_MS, ThemePalette, VISIBLE_ROWS } from '../game/constants';
import { getGhostY, getPieceCells } from '../game/engine';
import { getSkinById, TileSkinId } from '../game/skins';
import { PlayerBoardState } from '../game/types';
import { drawBlockCell } from './blockRenderer';

interface BoardCanvasProps {
  boardRef: React.RefObject<PlayerBoardState>;
  theme: ThemePalette;
  cellSize: number;
  accentColor: string;
  isMythicLegend?: boolean;
  skinId?: TileSkinId;
  reducedEffects?: boolean;
}

export const BoardCanvas: React.FC<BoardCanvasProps> = ({
  boardRef,
  theme,
  cellSize,
  accentColor,
  isMythicLegend = false,
  skinId = 'classic',
  reducedEffects = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<ThemePalette>(theme);
  const cellSizeRef = useRef<number>(cellSize);
  const accentRef = useRef<string>(accentColor);
  const mythicRef = useRef<boolean>(isMythicLegend);
  const skinIdRef = useRef<TileSkinId>(skinId);
  const reducedEffectsRef = useRef<boolean>(reducedEffects);

  themeRef.current = theme;
  cellSizeRef.current = cellSize;
  accentRef.current = accentColor;
  mythicRef.current = isMythicLegend;
  skinIdRef.current = skinId;
  reducedEffectsRef.current = reducedEffects;

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

      // Subtle Arena Bay architectural backdrop + tactical cross-node grid
      ctx.fillStyle = t.boardBg;
      ctx.fillRect(0, 0, width, height);

      // Alternating faint channel rails for instant column tracking
      ctx.fillStyle = t.isDark ? 'rgba(255, 255, 255, 0.016)' : 'rgba(15, 23, 42, 0.018)';
      for (let c = 1; c < COLS; c += 2) {
        ctx.fillRect(c * cs, 0, cs, height);
      }

      // Tactical cross-node vertex ticks ('+') instead of plain square wireframes
      ctx.strokeStyle = t.boardGridLine;
      ctx.lineWidth = 1;
      const tick = Math.max(2, Math.min(3.5, cs * 0.14));
      ctx.beginPath();
      for (let c = 1; c < COLS; c++) {
        const px = c * cs + 0.5;
        for (let r = 1; r < VISIBLE_ROWS; r++) {
          const py = r * cs + 0.5;
          ctx.moveTo(px - tick, py);
          ctx.lineTo(px + tick, py);
          ctx.moveTo(px, py - tick);
          ctx.lineTo(px, py + tick);
        }
      }
      ctx.stroke();

      // Breach threshold line (2nd row from top) with side warning ticks
      ctx.save();
      ctx.strokeStyle = t.boardTopLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, cs * 2 + 0.5);
      ctx.lineTo(width, cs * 2 + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = t.boardTopLine;
      ctx.fillRect(0, cs * 2 - 2, 4, 5);
      ctx.fillRect(width - 4, cs * 2 - 2, 4, 5);
      ctx.restore();

      if (board) {
        const isMythic = mythicRef.current;
        const activeSkinId = skinIdRef.current;
        const reduced = reducedEffectsRef.current;
        const activeSkinDef = activeSkinId !== 'classic' ? getSkinById(activeSkinId) : null;
        const nowMs = performance.now();

        // Hard drop light beams behind pieces (Level 300 Mythic or Ultimate Legendary gets prismatic trail!)
        for (const trail of board.hardDropTrails) {
          if (trail.alpha <= 0.01) continue;
          const color = activeSkinDef ? activeSkinDef.pieces[trail.colorKey].glow : t.pieces[trail.colorKey].light;
          const usePrismaticTrail = (isMythic || activeSkinId === 'ultimate_legendary') && !reduced;
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
            if (usePrismaticTrail) {
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
              ctx.globalAlpha = trail.alpha * 0.34;
            }
            ctx.fillStyle = grad;
            ctx.fillRect(gx + 2, gy, cs - 4, gh);
          }
          ctx.restore();
        }

        // Placed blocks (with live 60fps pulse for Bomb Blocks & active Premium Tile Skin shaders)
        const bombPulse = (Math.sin(nowMs / 140) + 1) * 0.5;
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
                cell === 'B'
                  ? { pulsePhase: bombPulse, reducedEffects: reduced }
                  : {
                      skinId: activeSkinId,
                      timeMs: nowMs,
                      cellSeed: r * 11 + c * 7 + 1,
                      reducedEffects: reduced,
                    }
              );
            }
          }
        }

        // Precision Laser Docking Guide + Caliper Reticle
        const ghostY = getGhostY(board.grid, board.active);
        const ghostPiece = { ...board.active, y: ghostY };
        const ghostCells = getPieceCells(ghostPiece);
        if (ghostY > board.active.y && !reduced) {
          const activeRaw = getPieceCells(board.active);
          let minCol = COLS;
          let maxCol = -1;
          let activeMaxRow = 0;
          let ghostMinRow = VISIBLE_ROWS;
          for (const [ax, ay] of activeRaw) {
            if (ax < minCol) minCol = ax;
            if (ax > maxCol) maxCol = ax;
            const vr = ay - BUFFER_ROWS;
            if (vr > activeMaxRow) activeMaxRow = vr;
          }
          for (const [, gy] of ghostCells) {
            const vr = gy - BUFFER_ROWS;
            if (vr < ghostMinRow) ghostMinRow = vr;
          }
          if (maxCol >= minCol && ghostMinRow > activeMaxRow) {
            const railColor = activeSkinDef
              ? activeSkinDef.pieces[board.active.type].border
              : t.pieces[board.active.type].light;
            const yTop = Math.max(0, (activeMaxRow + 1) * cs);
            const yBot = ghostMinRow * cs;
            ctx.save();
            const beamGrad = ctx.createLinearGradient(0, yTop, 0, yBot);
            beamGrad.addColorStop(0, 'rgba(255,255,255,0)');
            beamGrad.addColorStop(1, railColor);
            ctx.strokeStyle = beamGrad;
            ctx.globalAlpha = 0.24;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(minCol * cs + 1.5, yTop);
            ctx.lineTo(minCol * cs + 1.5, yBot);
            ctx.moveTo((maxCol + 1) * cs - 1.5, yTop);
            ctx.lineTo((maxCol + 1) * cs - 1.5, yBot);
            ctx.stroke();
            ctx.restore();
          }
        }
        for (const [gx, gy] of ghostCells) {
          const visRow = gy - BUFFER_ROWS;
          if (visRow >= 0 && visRow < VISIBLE_ROWS) {
            drawBlockCell(ctx, gx * cs, visRow * cs, cs, board.active.type, t, {
              ghost: true,
              skinId: activeSkinId,
              reducedEffects: reduced,
            });
          }
        }

        // Active falling piece (with subtle prismatic rainbow glow aura for Level 300 Mythic Legend)
        const lockProgress = board.isGrounded ? Math.min(1, board.lockTimerMs / LOCK_DELAY_MS) : 0;
        const activeCells = getPieceCells(board.active);
        if ((isMythic || activeSkinId === 'ultimate_legendary') && !reduced) {
          const hue = (nowMs / 14) % 360;
          ctx.save();
          ctx.shadowColor = `hsl(${hue}, 100%, 62%)`;
          ctx.shadowBlur = Math.max(8, cs * 0.55);
          ctx.fillStyle = `hsla(${(hue + 45) % 360}, 100%, 68%, 0.24)`;
          for (const [ax, ay] of activeCells) {
            const visRow = ay - BUFFER_ROWS;
            if (visRow >= 0 && visRow < VISIBLE_ROWS) {
              ctx.fillRect(ax * cs - 1, visRow * cs - 1, cs + 2, cs + 2);
            }
          }
          ctx.restore();
        }
        activeCells.forEach(([ax, ay], idx) => {
          const visRow = ay - BUFFER_ROWS;
          if (visRow >= 0 && visRow < VISIBLE_ROWS) {
            drawBlockCell(ctx, ax * cs, visRow * cs, cs, board.active.type, t, {
              lockProgress,
              skinId: activeSkinId,
              timeMs: nowMs,
              cellSeed: ax * 5 + ay * 3 + idx * 9,
              reducedEffects: reduced,
            });
          }
        });

        // Plasma Slice Clear Beams & Solar Energy Core Shockwaves
        for (const flash of board.clearFlashes) {
          if (flash.alpha <= 0.01) continue;
          ctx.save();
          if (flash.kind === 'bomb') {
            for (const rowIdx of flash.rows) {
              const visRow = rowIdx - BUFFER_ROWS;
              if (visRow >= 0 && visRow < VISIBLE_ROWS) {
                const ry = visRow * cs;
                const grad = ctx.createLinearGradient(0, ry, width, ry);
                grad.addColorStop(0, '#EA580C');
                grad.addColorStop(0.5, '#FDE047');
                grad.addColorStop(1, '#EA580C');
                ctx.fillStyle = grad;
                ctx.globalAlpha = flash.alpha * 0.88;
                ctx.fillRect(0, ry, width, cs);

                // White-hot plasma detonation core line
                ctx.fillStyle = '#FFFBEB';
                ctx.globalAlpha = flash.alpha * 0.95;
                ctx.fillRect(0, ry + cs * 0.36, width, Math.max(2, cs * 0.28));
              }
            }
          } else {
            const sliceAccent = activeSkinDef ? activeSkinDef.accentColor : accentRef.current;
            for (const rowIdx of flash.rows) {
              const visRow = rowIdx - BUFFER_ROWS;
              if (visRow >= 0 && visRow < VISIBLE_ROWS) {
                const ry = visRow * cs;
                const beamGrad = ctx.createLinearGradient(0, ry, 0, ry + cs);
                beamGrad.addColorStop(0, 'rgba(255,255,255,0)');
                beamGrad.addColorStop(0.25, sliceAccent);
                beamGrad.addColorStop(0.5, '#FFFFFF');
                beamGrad.addColorStop(0.75, sliceAccent);
                beamGrad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = beamGrad;
                ctx.globalAlpha = flash.alpha * 0.92;
                ctx.fillRect(0, ry, width, cs);

                // Crisp central laser slice filament
                ctx.fillStyle = '#FFFFFF';
                ctx.globalAlpha = flash.alpha;
                ctx.fillRect(0, ry + cs * 0.44, width, Math.max(2, cs * 0.14));
              }
            }
          }
          ctx.restore();
        }

        // Shatter & Energy Core detonation particles
        for (const p of board.particles) {
          if (p.alpha <= 0.01) continue;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x * cs - p.size / 2, p.y * cs - p.size / 2, p.size, p.size);
          ctx.restore();
        }

        // Incoming Breach row & Volatile Energy Core column beacon along bottom edge
        if (board.incomingGarbage.length > 0) {
          const nextBatch = board.incomingGarbage[0];
          const coreCol = nextBatch.gapCol;
          const barH = Math.max(4, Math.floor(cs * 0.22));
          ctx.save();
          for (let c = 0; c < COLS; c++) {
            if (c === coreCol) {
              // Pulsing hexagonal diamond Energy Core beacon
              const cx = c * cs + cs / 2;
              const cy = height - barH - 3;
              const hr = Math.max(3.4, cs * 0.19);
              ctx.fillStyle = '#F59E0B';
              ctx.globalAlpha = 0.72 + bombPulse * 0.28;
              ctx.beginPath();
              ctx.moveTo(cx, cy - hr);
              ctx.lineTo(cx + hr, cy);
              ctx.lineTo(cx, cy + hr);
              ctx.lineTo(cx - hr, cy);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#FFFBEB';
              ctx.beginPath();
              ctx.moveTo(cx, cy - hr * 0.48);
              ctx.lineTo(cx + hr * 0.48, cy);
              ctx.lineTo(cx, cy + hr * 0.48);
              ctx.lineTo(cx - hr * 0.48, cy);
              ctx.closePath();
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
