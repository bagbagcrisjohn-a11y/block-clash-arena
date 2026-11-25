import React, { useEffect, useRef } from 'react';
import { ThemePalette } from '../game/constants';
import { AttackProjectile } from '../game/types';

interface ArenaVFXCanvasProps {
  projectilesRef: React.RefObject<AttackProjectile[]>;
  arenaRef: React.RefObject<HTMLDivElement | null>;
  p1BoardElRef: React.RefObject<HTMLDivElement | null>;
  p2BoardElRef: React.RefObject<HTMLDivElement | null>;
  theme: ThemePalette;
}

export const ArenaVFXCanvas: React.FC<ArenaVFXCanvasProps> = ({
  projectilesRef,
  arenaRef,
  p1BoardElRef,
  p2BoardElRef,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef<ThemePalette>(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const render = () => {
      const arena = arenaRef.current;
      const p1El = p1BoardElRef.current;
      const p2El = p2BoardElRef.current;
      const list = projectilesRef.current;

      if (arena && p1El && p2El && list) {
        const arenaRect = arena.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(arenaRect.width));
        const h = Math.max(1, Math.round(arenaRect.height));

        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        if (list.length > 0) {
          const r1 = p1El.getBoundingClientRect();
          const r2 = p2El.getBoundingClientRect();

          const p1CenterX = r1.left - arenaRect.left + r1.width * 0.5;
          const p2CenterX = r2.left - arenaRect.left + r2.width * 0.5;
          const p1RightEdge = r1.right - arenaRect.left;
          const p2LeftEdge = r2.left - arenaRect.left;

          const p1Top = r1.top - arenaRect.top;
          const p2Top = r2.top - arenaRect.top;
          const tPalette = themeRef.current;

          for (const proj of list) {
            const p = Math.min(1, Math.max(0, proj.progress));
            const sx = proj.from === 'p1' ? p1CenterX : p2CenterX;
            const sy = (proj.from === 'p1' ? p1Top : p2Top) + r1.height * proj.startYNorm;
            const ex = proj.to === 'p2' ? p2LeftEdge : p1RightEdge;
            const ey = (proj.to === 'p2' ? p2Top : p1Top) + r1.height * 0.82;

            const ctrlX = (sx + ex) * 0.5;
            const ctrlY = Math.min(sy, ey) - proj.arcHeight;

            // Quadratic Bezier curve helper
            const bezier = (t: number) => {
              const inv = 1 - t;
              return {
                x: inv * inv * sx + 2 * inv * t * ctrlX + t * t * ex,
                y: inv * inv * sy + 2 * inv * t * ctrlY + t * t * ey,
              };
            };

            // Glowing trail behind orb
            const trailSteps = 10;
            for (let i = 0; i < trailSteps; i++) {
              const tp = Math.max(0, p - i * 0.032);
              const pt = bezier(tp);
              const radius = Math.max(2, (6 + proj.lines * 1.1) * (1 - i / trailSteps));
              ctx.save();
              ctx.globalAlpha = (1 - i / trailSteps) * 0.65;
              ctx.fillStyle = proj.color;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }

            // Main projectile orb
            const head = bezier(p);
            const coreRadius = 5.5 + Math.min(5, proj.lines * 1.2);
            ctx.save();
            if (tPalette.blockGlow) {
              ctx.shadowColor = proj.color;
              ctx.shadowBlur = 16;
            }
            ctx.fillStyle = tPalette.retroPattern ? '#1A2314' : '#FFFFFF';
            ctx.beginPath();
            ctx.arc(head.x, head.y, coreRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.lineWidth = 2.5;
            ctx.strokeStyle = proj.color;
            ctx.stroke();

            // Attack power number inside big projectiles
            if (proj.lines >= 2) {
              ctx.shadowBlur = 0;
              ctx.font = '700 10px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = tPalette.retroPattern ? '#D3DDB7' : '#0F172A';
              ctx.fillText(`+${proj.lines}`, head.x, head.y + 0.5);
            }
            ctx.restore();

            // Impact ring near completion
            if (p > 0.88) {
              const ringP = (p - 0.88) / 0.12;
              ctx.save();
              ctx.strokeStyle = proj.color;
              ctx.lineWidth = 2.5 * (1 - ringP);
              ctx.globalAlpha = 1 - ringP;
              ctx.beginPath();
              ctx.arc(ex, ey, 8 + ringP * 26, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [projectilesRef, arenaRef, p1BoardElRef, p2BoardElRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-30"
      aria-hidden="true"
    />
  );
};
