import { ThemePalette } from '../game/constants';
import { CellValue } from '../game/types';

export function drawBlockCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: Exclude<CellValue, null>,
  theme: ThemePalette,
  options?: {
    alpha?: number;
    ghost?: boolean;
    lockProgress?: number; // 0..1 glow/pulse when about to lock
    pulsePhase?: number; // 0..1 animation pulse for Bomb Blocks
  }
): void {
  const palette = theme.pieces[type];
  const pad = Math.max(1, Math.floor(size * 0.05));
  const rx = x + pad;
  const ry = y + pad;
  const rs = size - pad * 2;

  ctx.save();
  if (options?.alpha !== undefined) {
    ctx.globalAlpha = options.alpha;
  }

  // Ghost piece style: crisp dashed/solid outline + subtle translucent fill
  if (options?.ghost) {
    ctx.fillStyle = palette.fill;
    ctx.globalAlpha = theme.ghostAlpha * 0.45;
    ctx.fillRect(rx, ry, rs, rs);

    ctx.globalAlpha = Math.min(1, theme.ghostAlpha + 0.35);
    ctx.strokeStyle = theme.retroPattern ? palette.stroke : palette.light;
    ctx.lineWidth = Math.max(1.5, size * 0.075);
    ctx.strokeRect(rx + 1, ry + 1, rs - 2, rs - 2);
    ctx.restore();
    return;
  }

  // Special Bomb Block ('B') — Dark-red armored casing + pulsing bomb icon + glowing orange fuse/core
  if (type === 'B') {
    const pulse = options?.pulsePhase ?? 0.5;
    const cx = rx + rs / 2;
    const cy = ry + rs * 0.54;

    if (theme.blockGlow) {
      ctx.shadowColor = '#F97316';
      ctx.shadowBlur = 7 + pulse * 8;
    }

    // Dark-red outer casing
    ctx.fillStyle = theme.retroPattern ? '#4A1D12' : '#7F1D1D';
    ctx.fillRect(rx, ry, rs, rs);
    ctx.shadowBlur = 0;

    // Beveled dark-red metallic frame
    const bevel = Math.max(2, Math.floor(rs * 0.14));
    ctx.fillStyle = '#B91C1C';
    ctx.fillRect(rx, ry, rs, bevel);
    ctx.fillRect(rx, ry, bevel, rs);
    ctx.fillStyle = '#450A0A';
    ctx.fillRect(rx, ry + rs - bevel, rs, bevel);
    ctx.fillRect(rx + rs - bevel, ry, bevel, rs);

    // Pulsing orange inner border glow
    ctx.strokeStyle = `rgba(251, 146, 60, ${0.45 + pulse * 0.55})`;
    ctx.lineWidth = Math.max(1.2, rs * 0.07);
    ctx.strokeRect(rx + 1, ry + 1, rs - 2, rs - 2);

    // Bomb spherical body icon
    const bombR = Math.max(3.5, rs * 0.27);
    ctx.fillStyle = '#1C0909';
    ctx.beginPath();
    ctx.arc(cx, cy, bombR, 0, Math.PI * 2);
    ctx.fill();

    // Glowing orange core inside the bomb body (pulsing)
    const coreGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, bombR * 0.92);
    coreGrad.addColorStop(0, '#FEF08A');
    coreGrad.addColorStop(0.45, '#F97316');
    coreGrad.addColorStop(1, 'rgba(220, 38, 38, 0.25)');
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = (options?.alpha ?? 1) * (0.68 + pulse * 0.32);
    ctx.beginPath();
    ctx.arc(cx, cy, bombR * (0.68 + pulse * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = options?.alpha ?? 1;

    // Bomb cap & lit orange fuse spark at top
    const capW = Math.max(3, rs * 0.18);
    const capH = Math.max(2, rs * 0.1);
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(cx - capW / 2, cy - bombR - capH * 0.6, capW, capH);

    // Curved fuse stem
    ctx.strokeStyle = '#FED7AA';
    ctx.lineWidth = Math.max(1.2, rs * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx, cy - bombR - capH * 0.5);
    ctx.quadraticCurveTo(cx + rs * 0.14, ry + rs * 0.12, cx + rs * 0.22, ry + rs * 0.18);
    ctx.stroke();

    // Pulsing spark tip
    const sparkX = cx + rs * 0.22;
    const sparkY = ry + rs * 0.18;
    const sparkR = Math.max(1.6, rs * (0.08 + pulse * 0.05));
    ctx.fillStyle = pulse > 0.5 ? '#FEF08A' : '#FB923C';
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, sparkR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    return;
  }

  // Retro Handheld authentic dot-matrix patterned tiles
  if (theme.retroPattern) {
    ctx.fillStyle = palette.fill;
    ctx.fillRect(rx, ry, rs, rs);

    // Crisp outer dark border
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.strokeRect(rx + 0.5, ry + 0.5, rs - 1, rs - 1);

    const inset = Math.max(3, Math.floor(rs * 0.24));
    ctx.fillStyle = palette.light;
    if (type === 'I') {
      // Classic dot-center + crisp inner frame
      ctx.fillRect(rx + inset, ry + inset, rs - inset * 2, rs - inset * 2);
      ctx.fillStyle = palette.dark;
      ctx.fillRect(rx + inset + 2, ry + inset + 2, Math.max(2, rs - (inset + 2) * 2), Math.max(2, rs - (inset + 2) * 2));
    } else if (type === 'O') {
      // Hollow square core
      ctx.fillRect(rx + inset, ry + inset, rs - inset * 2, rs - inset * 2);
    } else if (type === 'T') {
      // Top-left bright highlight + center dot
      ctx.fillRect(rx + 2, ry + 2, rs - 5, 2);
      ctx.fillRect(rx + 2, ry + 2, 2, rs - 5);
      ctx.fillRect(rx + Math.floor(rs * 0.4), ry + Math.floor(rs * 0.4), Math.max(3, Math.floor(rs * 0.2)), Math.max(3, Math.floor(rs * 0.2)));
    } else if (type === 'S' || type === 'Z') {
      // Diagonal pixel dots
      const d = Math.max(2, Math.floor(rs * 0.2));
      ctx.fillRect(rx + inset, ry + inset, d, d);
      ctx.fillRect(rx + rs - inset - d, ry + rs - inset - d, d, d);
    } else if (type === 'J' || type === 'L') {
      // Inner horizontal stripe
      ctx.fillRect(rx + inset, ry + Math.floor(rs * 0.36), rs - inset * 2, Math.max(3, Math.floor(rs * 0.26)));
    } else if (type === 'G') {
      // Cross-hatched garbage block
      ctx.fillStyle = palette.dark;
      ctx.fillRect(rx + 3, ry + 3, rs - 6, rs - 6);
      ctx.fillStyle = palette.light;
      ctx.fillRect(rx + 5, ry + 5, rs - 10, rs - 10);
    }
    ctx.restore();
    return;
  }

  // Neon Cyber & Clean Modern tactile beveled blocks
  if (theme.blockGlow && type !== 'G') {
    ctx.shadowColor = palette.stroke;
    ctx.shadowBlur = 7;
  }

  ctx.fillStyle = palette.fill;
  ctx.fillRect(rx, ry, rs, rs);
  ctx.shadowBlur = 0;

  // Top & Left bevel highlight
  const bevel = Math.max(2, Math.floor(rs * 0.14));
  ctx.fillStyle = palette.light;
  ctx.globalAlpha = (options?.alpha ?? 1) * (theme.blockGlow ? 0.55 : 0.48);
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(rx + rs, ry);
  ctx.lineTo(rx + rs - bevel, ry + bevel);
  ctx.lineTo(rx + bevel, ry + bevel);
  ctx.lineTo(rx + bevel, ry + rs - bevel);
  ctx.lineTo(rx, ry + rs);
  ctx.closePath();
  ctx.fill();

  // Bottom & Right bevel shadow
  ctx.fillStyle = palette.dark;
  ctx.globalAlpha = (options?.alpha ?? 1) * 0.55;
  ctx.beginPath();
  ctx.moveTo(rx + rs, ry);
  ctx.lineTo(rx + rs, ry + rs);
  ctx.lineTo(rx, ry + rs);
  ctx.lineTo(rx + bevel, ry + rs - bevel);
  ctx.lineTo(rx + rs - bevel, ry + rs - bevel);
  ctx.lineTo(rx + rs - bevel, ry + bevel);
  ctx.closePath();
  ctx.fill();

  // Subtle inner glossy core for neon or clean matte inset for modern
  ctx.globalAlpha = (options?.alpha ?? 1) * (theme.blockGlow ? 0.24 : 0.14);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(rx + bevel, ry + bevel, rs - bevel * 2, Math.max(2, Math.floor((rs - bevel * 2) * 0.35)));

  // Garbage subtle industrial seam
  if (type === 'G') {
    ctx.globalAlpha = (options?.alpha ?? 1) * 0.5;
    ctx.strokeStyle = palette.dark;
    ctx.lineWidth = 1;
    ctx.strokeRect(rx + bevel + 1, ry + bevel + 1, rs - (bevel + 1) * 2, rs - (bevel + 1) * 2);
  }

  // Subtle lock-delay warning pulse (brightens piece slightly before locking)
  if (options?.lockProgress && options.lockProgress > 0.15) {
    ctx.globalAlpha = options.lockProgress * 0.32;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(rx, ry, rs, rs);
  }

  ctx.restore();
}
