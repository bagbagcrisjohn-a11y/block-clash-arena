import { ThemePalette } from '../game/constants';
import { getSkinById, SkinPieceColors, TileSkinId } from '../game/skins';
import { CellValue, PieceType } from '../game/types';

export interface DrawBlockOptions {
  alpha?: number;
  ghost?: boolean;
  lockProgress?: number; // 0..1 glow/pulse when about to lock
  pulsePhase?: number; // 0..1 animation pulse for Bomb Blocks
  skinId?: TileSkinId;
  timeMs?: number;
  cellSeed?: number;
  reducedEffects?: boolean;
}

const PIECE_HUE_OFFSET: Record<PieceType, number> = {
  I: 335, // Plasma Magenta
  O: 158, // Electric Mint
  T: 38,  // Solar Amber
  S: 218, // Cobalt Sapphire
  Z: 188, // Arctic Cyan
  J: 274, // Orchid Violet
  L: 86,  // Volt Lime
};

function drawStar4(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.28, cy - r * 0.28);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx + r * 0.28, cy + r * 0.28);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.28, cy + r * 0.28);
  ctx.lineTo(cx - r, cy);
  ctx.lineTo(cx - r * 0.28, cy - r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPremiumSkinCell(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rs: number,
  type: PieceType,
  skinId: Exclude<TileSkinId, 'classic'>,
  colors: SkinPieceColors,
  alpha: number,
  timeMs: number,
  seed: number,
  reducedEffects: boolean
): void {
  const enableGlow = !reducedEffects && rs >= 13;
  const tSec = reducedEffects ? 0 : timeMs / 1000;
  const bevel = Math.max(2, Math.floor(rs * 0.14));

  // Optional subtle outer glow per collection
  if (enableGlow) {
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = skinId === 'neon_cyber' || skinId === 'toxic_green' || skinId === 'ultimate_legendary' ? 9 : 6;
  }

  switch (skinId) {
    // 1. NEON CYBER — Dark cyber core + dual cyan/purple glowing tubes + diagonal circuit highlight
    case 'neon_cyber': {
      const grad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
      grad.addColorStop(0, colors.base);
      grad.addColorStop(0.55, colors.dark);
      grad.addColorStop(1, colors.base);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Glowing neon outer dual border
      const pulse = 0.78 + Math.sin(tSec * 3.4 + seed * 0.7) * 0.22;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = Math.max(1.5, rs * 0.09);
      ctx.globalAlpha = alpha * pulse;
      ctx.strokeRect(rx + 1, ry + 1, rs - 2, rs - 2);

      // Inner neon core ring
      const inset = Math.max(3, Math.floor(rs * 0.22));
      const innerGrad = ctx.createLinearGradient(rx + inset, ry + inset, rx + rs - inset, ry + rs - inset);
      innerGrad.addColorStop(0, colors.light);
      innerGrad.addColorStop(0.45, colors.mid);
      innerGrad.addColorStop(1, '#A855F7');
      ctx.fillStyle = innerGrad;
      ctx.globalAlpha = alpha * 0.52;
      ctx.fillRect(rx + inset, ry + inset, rs - inset * 2, rs - inset * 2);

      // Diagonal cyber energy conduit + top glass shine
      ctx.strokeStyle = colors.light;
      ctx.lineWidth = Math.max(1, rs * 0.06);
      ctx.globalAlpha = alpha * 0.8;
      ctx.beginPath();
      ctx.moveTo(rx + 2, ry + rs * 0.35);
      ctx.lineTo(rx + rs * 0.35, ry + 2);
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillRect(rx + 2, ry + 2, rs - 4, Math.max(1.5, rs * 0.12));
      break;
    }

    // 2. GOLDEN LUXURY — Anisotropic brushed metallic gold + reflective sweep + gilded bevels
    case 'golden_luxury': {
      const grad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
      grad.addColorStop(0, colors.light);
      grad.addColorStop(0.24, colors.mid);
      grad.addColorStop(0.52, colors.base);
      grad.addColorStop(0.76, colors.light);
      grad.addColorStop(1, colors.dark);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Top-left bright gold bevel
      ctx.fillStyle = '#FFFBEB';
      ctx.globalAlpha = alpha * 0.62;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + rs, ry);
      ctx.lineTo(rx + rs - bevel, ry + bevel);
      ctx.lineTo(rx + bevel, ry + bevel);
      ctx.lineTo(rx + bevel, ry + rs - bevel);
      ctx.lineTo(rx, ry + rs);
      ctx.closePath();
      ctx.fill();

      // Bottom-right burnished bronze-gold shadow bevel
      ctx.fillStyle = colors.dark;
      ctx.globalAlpha = alpha * 0.68;
      ctx.beginPath();
      ctx.moveTo(rx + rs, ry);
      ctx.lineTo(rx + rs, ry + rs);
      ctx.lineTo(rx, ry + rs);
      ctx.lineTo(rx + bevel, ry + rs - bevel);
      ctx.lineTo(rx + rs - bevel, ry + rs - bevel);
      ctx.lineTo(rx + rs - bevel, ry + bevel);
      ctx.closePath();
      ctx.fill();

      // Animated diagonal metallic sheen sweep
      const sweepPos = ((tSec * 0.55 + seed * 0.13) % 2.4) - 0.7;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx + 1, ry + 1, rs - 2, rs - 2);
      ctx.clip();
      ctx.globalAlpha = alpha * 0.42;
      ctx.fillStyle = '#FFFFFF';
      const sx = rx + sweepPos * rs;
      ctx.beginPath();
      ctx.moveTo(sx, ry);
      ctx.lineTo(sx + rs * 0.28, ry);
      ctx.lineTo(sx - rs * 0.14, ry + rs);
      ctx.lineTo(sx - rs * 0.42, ry + rs);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Engraved inner gold border
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.75;
      ctx.strokeRect(rx + bevel + 0.5, ry + bevel + 0.5, rs - bevel * 2 - 1, rs - bevel * 2 - 1);
      break;
    }

    // 3. ICE CRYSTAL — Transparent frost-glass base + geometric crystal facets + frosty glints
    case 'ice_crystal': {
      const grad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
      grad.addColorStop(0, colors.light);
      grad.addColorStop(0.35, colors.mid);
      grad.addColorStop(0.75, colors.base);
      grad.addColorStop(1, colors.dark);
      ctx.globalAlpha = alpha * 0.84;
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Upper-left crystalline facet triangle
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = alpha * 0.42;
      ctx.beginPath();
      ctx.moveTo(rx + 1, ry + 1);
      ctx.lineTo(rx + rs - 1, ry + 1);
      ctx.lineTo(rx + rs * 0.52, ry + rs * 0.46);
      ctx.lineTo(rx + 1, ry + rs * 0.72);
      ctx.closePath();
      ctx.fill();

      // Secondary lower-right refractive facet
      ctx.fillStyle = colors.light;
      ctx.globalAlpha = alpha * 0.22;
      ctx.beginPath();
      ctx.moveTo(rx + rs - 1, ry + rs * 0.3);
      ctx.lineTo(rx + rs - 1, ry + rs - 1);
      ctx.lineTo(rx + rs * 0.35, ry + rs - 1);
      ctx.closePath();
      ctx.fill();

      // Sharp glacial inner crystal lines
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.58;
      ctx.beginPath();
      ctx.moveTo(rx + 1, ry + rs * 0.72);
      ctx.lineTo(rx + rs * 0.52, ry + rs * 0.46);
      ctx.lineTo(rx + rs - 1, ry + 1);
      ctx.stroke();

      // Crisp frosted crystalline edge
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = Math.max(1.2, rs * 0.08);
      ctx.globalAlpha = alpha * 0.92;
      ctx.strokeRect(rx + 0.75, ry + 0.75, rs - 1.5, rs - 1.5);

      // Subtle frost glint
      const glint = 0.45 + 0.55 * Math.sin(tSec * 2.8 + seed * 1.9);
      if (rs >= 12) {
        drawStar4(ctx, rx + rs * 0.28, ry + rs * 0.26, Math.max(2.2, rs * 0.14), '#FFFFFF', alpha * glint);
      }
      break;
    }

    // 4. FIRE LAVA — Charred obsidian crust + pulsing molten orange-red core + animated magma veins
    case 'fire_lava': {
      const pulse = 0.5 + 0.5 * Math.sin(tSec * 3.6 + seed * 1.1);
      const cx = rx + rs * 0.5;
      const cy = ry + rs * 0.5;
      const radGrad = ctx.createRadialGradient(cx, cy, rs * 0.05, cx, cy, rs * 0.74);
      radGrad.addColorStop(0, colors.light);
      radGrad.addColorStop(0.36 + pulse * 0.1, colors.mid);
      radGrad.addColorStop(0.75, colors.base);
      radGrad.addColorStop(1, colors.dark);
      ctx.fillStyle = radGrad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Charred volcanic rock plates around perimeter
      ctx.strokeStyle = colors.dark;
      ctx.lineWidth = Math.max(1.8, rs * 0.12);
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeRect(rx + 1, ry + 1, rs - 2, rs - 2);

      // Animated glowing magma crack veins
      ctx.strokeStyle = pulse > 0.45 ? '#FEF08A' : colors.border;
      ctx.lineWidth = Math.max(1.1, rs * 0.07);
      ctx.globalAlpha = alpha * (0.65 + pulse * 0.35);
      ctx.beginPath();
      ctx.moveTo(rx + rs * 0.18, ry + rs * 0.24);
      ctx.lineTo(rx + rs * 0.48, ry + rs * 0.46);
      ctx.lineTo(rx + rs * 0.82, ry + rs * 0.3);
      ctx.moveTo(rx + rs * 0.48, ry + rs * 0.46);
      ctx.lineTo(rx + rs * 0.34, ry + rs * 0.8);
      ctx.stroke();

      // Rising incandescent ember dot
      if (!reducedEffects && rs >= 12) {
        const emberY = ry + rs * (0.8 - ((tSec * 0.65 + seed * 0.31) % 0.62));
        const emberX = rx + rs * (0.3 + ((seed * 37) % 42) / 100);
        ctx.fillStyle = '#FEF08A';
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillRect(emberX, emberY, Math.max(1.5, rs * 0.09), Math.max(1.5, rs * 0.09));
      }
      break;
    }

    // 5. GALAXY — Deep cosmic purple/blue nebula clouds + twinkling star particles + aurora rim
    case 'galaxy': {
      const grad = ctx.createRadialGradient(
        rx + rs * 0.3,
        ry + rs * 0.28,
        rs * 0.08,
        rx + rs * 0.55,
        ry + rs * 0.55,
        rs * 0.88
      );
      grad.addColorStop(0, colors.mid);
      grad.addColorStop(0.5, colors.base);
      grad.addColorStop(1, colors.dark);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Diagonal nebula aurora mist
      const neb = ctx.createLinearGradient(rx, ry + rs, rx + rs, ry);
      neb.addColorStop(0, 'rgba(56, 189, 248, 0)');
      neb.addColorStop(0.5, 'rgba(216, 180, 254, 0.34)');
      neb.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = neb;
      ctx.fillRect(rx + 1, ry + 1, rs - 2, rs - 2);

      // Deterministic twinkling starfield particles
      const stars = [
        [0.24, 0.26, 0.0],
        [0.72, 0.32, 2.1],
        [0.46, 0.68, 4.2],
        [0.76, 0.76, 1.3],
      ];
      for (const [sx, sy, phase] of stars) {
        const twinkle = 0.35 + 0.65 * Math.sin(tSec * 3.2 + seed * 1.3 + phase);
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = alpha * twinkle;
        const sr = Math.max(1.1, rs * (phase === 0 ? 0.08 : 0.055));
        ctx.fillRect(rx + rs * sx - sr / 2, ry + rs * sy - sr / 2, sr, sr);
      }

      // Cosmic rim border
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = Math.max(1.1, rs * 0.065);
      ctx.globalAlpha = alpha * 0.78;
      ctx.strokeRect(rx + 0.75, ry + 0.75, rs - 1.5, rs - 1.5);
      break;
    }

    // 6. TOXIC GREEN — Radioactive bio-luminescent core + glowing acid edges + bubbling isotopes
    case 'toxic_green': {
      const pulse = 0.65 + 0.35 * Math.sin(tSec * 4.1 + seed * 0.9);
      const rad = ctx.createRadialGradient(
        rx + rs * 0.5,
        ry + rs * 0.5,
        rs * 0.06,
        rx + rs * 0.5,
        ry + rs * 0.5,
        rs * 0.72
      );
      rad.addColorStop(0, colors.light);
      rad.addColorStop(0.45, colors.mid);
      rad.addColorStop(0.85, colors.base);
      rad.addColorStop(1, colors.dark);
      ctx.fillStyle = rad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Industrial hazard containment corners
      const corner = Math.max(2, Math.floor(rs * 0.22));
      ctx.fillStyle = colors.dark;
      ctx.globalAlpha = alpha * 0.78;
      ctx.fillRect(rx, ry, corner, 2);
      ctx.fillRect(rx, ry, 2, corner);
      ctx.fillRect(rx + rs - corner, ry + rs - 2, corner, 2);
      ctx.fillRect(rx + rs - 2, ry + rs - corner, 2, corner);

      // Animated rising radioactive micro-bubbles
      if (rs >= 12) {
        const b1Y = ry + rs * (0.76 - ((tSec * 0.45 + seed * 0.21) % 0.46));
        const b2Y = ry + rs * (0.82 - ((tSec * 0.35 + seed * 0.53) % 0.52));
        ctx.fillStyle = colors.light;
        ctx.globalAlpha = alpha * 0.78;
        ctx.beginPath();
        ctx.arc(rx + rs * 0.34, b1Y, Math.max(1.2, rs * 0.08), 0, Math.PI * 2);
        ctx.arc(rx + rs * 0.68, b2Y, Math.max(1, rs * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }

      // Glowing radioactive border
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = Math.max(1.4, rs * 0.085);
      ctx.globalAlpha = alpha * pulse;
      ctx.strokeRect(rx + 1, ry + 1, rs - 2, rs - 2);
      break;
    }

    // 7. DIAMOND — Cut transparent gemstone with faceted crown/pavilion & sparkling 4-point reflections
    case 'diamond': {
      const grad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.26, colors.mid);
      grad.addColorStop(0.62, colors.base);
      grad.addColorStop(1, colors.dark);
      ctx.globalAlpha = alpha * 0.88;
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Cut gemstone inner table octagon / square + diagonal facet rays
      const inset = Math.max(3, Math.floor(rs * 0.23));
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = alpha * 0.46;
      ctx.fillRect(rx + inset, ry + inset, rs - inset * 2, rs - inset * 2);

      // Top & left bright crystal facets
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.78;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + inset, ry + inset);
      ctx.moveTo(rx + rs, ry);
      ctx.lineTo(rx + rs - inset, ry + inset);
      ctx.moveTo(rx, ry + rs);
      ctx.lineTo(rx + inset, ry + rs - inset);
      ctx.moveTo(rx + rs, ry + rs);
      ctx.lineTo(rx + rs - inset, ry + rs - inset);
      ctx.stroke();

      // Prismatic border
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = Math.max(1.2, rs * 0.075);
      ctx.globalAlpha = alpha * 0.95;
      ctx.strokeRect(rx + 0.75, ry + 0.75, rs - 1.5, rs - 1.5);

      // Animated diamond sparkle flare
      const sparkAlpha = Math.max(0.15, Math.pow((Math.sin(tSec * 3.8 + seed * 2.1) + 1) * 0.5, 2));
      if (rs >= 12) {
        drawStar4(ctx, rx + rs * 0.74, ry + rs * 0.25, Math.max(2.6, rs * 0.2), '#FFFFFF', alpha * sparkAlpha);
      }
      break;
    }

    // 8. SHADOW LEGEND — Obsidian carved black stone + dark purple surging void energy fissures
    case 'shadow_legend': {
      const pulse = 0.55 + 0.45 * Math.sin(tSec * 3.0 + seed * 1.4);
      const grad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
      grad.addColorStop(0, '#1B1426');
      grad.addColorStop(0.5, colors.base);
      grad.addColorStop(1, colors.dark);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Dark violet void aura inside obsidian
      const aura = ctx.createRadialGradient(
        rx + rs * 0.5,
        ry + rs * 0.5,
        1,
        rx + rs * 0.5,
        ry + rs * 0.5,
        rs * 0.65
      );
      aura.addColorStop(0, colors.mid);
      aura.addColorStop(1, 'rgba(9, 7, 16, 0)');
      ctx.globalAlpha = alpha * (0.42 + pulse * 0.38);
      ctx.fillStyle = aura;
      ctx.fillRect(rx + 1, ry + 1, rs - 2, rs - 2);

      // Jagged violet energy fissure
      ctx.strokeStyle = colors.light;
      ctx.lineWidth = Math.max(1.1, rs * 0.065);
      ctx.globalAlpha = alpha * (0.55 + pulse * 0.45);
      ctx.beginPath();
      ctx.moveTo(rx + rs * 0.16, ry + rs * 0.74);
      ctx.lineTo(rx + rs * 0.44, ry + rs * 0.52);
      ctx.lineTo(rx + rs * 0.58, ry + rs * 0.6);
      ctx.lineTo(rx + rs * 0.84, ry + rs * 0.24);
      ctx.stroke();

      // Smoked obsidian bevel rim with amethyst glow edge
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = Math.max(1.3, rs * 0.08);
      ctx.globalAlpha = alpha * (0.65 + pulse * 0.35);
      ctx.strokeRect(rx + 1, ry + 1, rs - 2, rs - 2);
      break;
    }

    // 9. ROYAL COSMIC — Imperial violet starry stone + burnished gold filigree frame & corner crowns
    case 'royal_cosmic': {
      const shimmer = 0.6 + 0.4 * Math.sin(tSec * 2.9 + seed * 1.5);
      const grad = ctx.createRadialGradient(
        rx + rs * 0.35,
        ry + rs * 0.3,
        rs * 0.08,
        rx + rs * 0.5,
        ry + rs * 0.5,
        rs * 0.82
      );
      grad.addColorStop(0, colors.mid);
      grad.addColorStop(0.62, colors.base);
      grad.addColorStop(1, colors.dark);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Burnished gold ornate border
      const goldGrad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
      goldGrad.addColorStop(0, '#FEF08A');
      goldGrad.addColorStop(0.5, '#F59E0B');
      goldGrad.addColorStop(1, '#FDE047');
      ctx.strokeStyle = goldGrad;
      ctx.lineWidth = Math.max(1.6, rs * 0.1);
      ctx.globalAlpha = alpha * 0.95;
      ctx.strokeRect(rx + 1, ry + 1, rs - 2, rs - 2);

      // Royal gold corner filigree dots
      const dot = Math.max(1.8, rs * 0.1);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(rx + 2, ry + 2, dot, dot);
      ctx.fillRect(rx + rs - 2 - dot, ry + 2, dot, dot);
      ctx.fillRect(rx + 2, ry + rs - 2 - dot, dot, dot);
      ctx.fillRect(rx + rs - 2 - dot, ry + rs - 2 - dot, dot, dot);

      // Central arcane gold-white diamond spark
      if (rs >= 11) {
        drawStar4(ctx, rx + rs * 0.5, ry + rs * 0.5, Math.max(2.4, rs * 0.2), '#FEF08A', alpha * shimmer);
      }
      break;
    }

    // 10. ULTIMATE LEGENDARY — Multicolor animated prismatic liquid-chrome with live starlight particles
    case 'ultimate_legendary': {
      const baseHue = (PIECE_HUE_OFFSET[type] + tSec * 78 + seed * 14) % 360;
      const hue2 = (baseHue + 65) % 360;
      const hue3 = (baseHue + 135) % 360;

      const grad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
      grad.addColorStop(0, `hsl(${baseHue}, 95%, 64%)`);
      grad.addColorStop(0.5, `hsl(${hue2}, 92%, 54%)`);
      grad.addColorStop(1, `hsl(${hue3}, 90%, 44%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(rx, ry, rs, rs);
      ctx.shadowBlur = 0;

      // Liquid-chrome top-left glass reflection
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = alpha * 0.45;
      ctx.beginPath();
      ctx.moveTo(rx + 1, ry + 1);
      ctx.lineTo(rx + rs - 1, ry + 1);
      ctx.lineTo(rx + rs * 0.65, ry + rs * 0.38);
      ctx.lineTo(rx + 1, ry + rs * 0.45);
      ctx.closePath();
      ctx.fill();

      // Inner dark prism depth frame
      const inset = Math.max(2.5, Math.floor(rs * 0.18));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeRect(rx + inset, ry + inset, rs - inset * 2, rs - inset * 2);

      // Iridescent bright chrome outer edge
      ctx.strokeStyle = `hsl(${(baseHue + 180) % 360}, 100%, 82%)`;
      ctx.lineWidth = Math.max(1.4, rs * 0.085);
      ctx.globalAlpha = alpha * 0.95;
      ctx.strokeRect(rx + 0.8, ry + 0.8, rs - 1.6, rs - 1.6);

      // Live orbiting starlight particle flare
      if (rs >= 11) {
        const px = rx + rs * (0.5 + Math.cos(tSec * 3.1 + seed) * 0.26);
        const py = ry + rs * (0.5 + Math.sin(tSec * 2.6 + seed * 1.4) * 0.24);
        drawStar4(ctx, px, py, Math.max(2.5, rs * 0.19), '#FFFFFF', alpha * 0.92);
      }
      break;
    }
  }
}

export function drawBlockCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: Exclude<CellValue, null>,
  theme: ThemePalette,
  options?: DrawBlockOptions
): void {
  const skinId = options?.skinId ?? 'classic';
  const isPremiumPiece = skinId !== 'classic' && type !== 'G' && type !== 'B';
  const skinDef = isPremiumPiece ? getSkinById(skinId) : null;
  const palette = theme.pieces[type];

  const pad = Math.max(1, Math.floor(size * 0.05));
  const rx = x + pad;
  const ry = y + pad;
  const rs = size - pad * 2;
  const alpha = options?.alpha ?? 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Tactical Laser Docking Reticle (replaces standard hollow square ghost outline)
  if (options?.ghost) {
    const ghostFill = skinDef ? skinDef.pieces[type as PieceType].mid : palette.fill;
    const ghostStroke = skinDef
      ? skinDef.pieces[type as PieceType].border
      : theme.retroPattern
        ? palette.stroke
        : palette.light;

    const cut = Math.max(2, Math.floor(rs * 0.16));
    const bracket = Math.max(3, Math.floor(rs * 0.28));

    // Ultra-subtle chamfered holographic projection pad
    ctx.fillStyle = ghostFill;
    ctx.globalAlpha = theme.ghostAlpha * 0.34;
    ctx.beginPath();
    ctx.moveTo(rx + cut, ry);
    ctx.lineTo(rx + rs - cut, ry);
    ctx.lineTo(rx + rs, ry + cut);
    ctx.lineTo(rx + rs, ry + rs - cut);
    ctx.lineTo(rx + rs - cut, ry + rs);
    ctx.lineTo(rx + cut, ry + rs);
    ctx.lineTo(rx, ry + rs - cut);
    ctx.lineTo(rx, ry + cut);
    ctx.closePath();
    ctx.fill();

    // Precision 4-corner caliper brackets
    ctx.globalAlpha = Math.min(1, theme.ghostAlpha + 0.52);
    ctx.strokeStyle = ghostStroke;
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.lineCap = 'square';
    ctx.beginPath();
    // Top-left
    ctx.moveTo(rx + 1, ry + bracket);
    ctx.lineTo(rx + 1, ry + 1);
    ctx.lineTo(rx + bracket, ry + 1);
    // Top-right
    ctx.moveTo(rx + rs - bracket, ry + 1);
    ctx.lineTo(rx + rs - 1, ry + 1);
    ctx.lineTo(rx + rs - 1, ry + bracket);
    // Bottom-right
    ctx.moveTo(rx + rs - 1, ry + rs - bracket);
    ctx.lineTo(rx + rs - 1, ry + rs - 1);
    ctx.lineTo(rx + rs - bracket, ry + rs - 1);
    // Bottom-left
    ctx.moveTo(rx + bracket, ry + rs - 1);
    ctx.lineTo(rx + 1, ry + rs - 1);
    ctx.lineTo(rx + 1, ry + rs - bracket);
    ctx.stroke();

    // Central laser lock pip
    const pip = Math.max(1.5, rs * 0.1);
    ctx.fillStyle = ghostStroke;
    ctx.globalAlpha = Math.min(1, theme.ghostAlpha + 0.45);
    ctx.fillRect(rx + rs * 0.5 - pip / 2, ry + rs * 0.5 - pip / 2, pip, pip);

    ctx.restore();
    return;
  }

  // Volatile Energy Core ('B') — Armored chamfered containment cell + pulsing Hexagonal Plasma Reactor
  if (type === 'B') {
    const pulse = options?.pulsePhase ?? 0.5;
    const cx = rx + rs * 0.5;
    const cy = ry + rs * 0.5;
    const cut = Math.max(2, Math.floor(rs * 0.17));

    if (theme.blockGlow && !options?.reducedEffects) {
      ctx.shadowColor = '#F59E0B';
      ctx.shadowBlur = 7 + pulse * 9;
    }

    // Dark obsidian-crimson chamfered containment chassis
    ctx.beginPath();
    ctx.moveTo(rx + cut, ry);
    ctx.lineTo(rx + rs - cut, ry);
    ctx.lineTo(rx + rs, ry + cut);
    ctx.lineTo(rx + rs, ry + rs - cut);
    ctx.lineTo(rx + rs - cut, ry + rs);
    ctx.lineTo(rx + cut, ry + rs);
    ctx.lineTo(rx, ry + rs - cut);
    ctx.lineTo(rx, ry + cut);
    ctx.closePath();

    const chassisGrad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
    chassisGrad.addColorStop(0, '#3B110D');
    chassisGrad.addColorStop(0.5, '#1D090B');
    chassisGrad.addColorStop(1, '#451208');
    ctx.fillStyle = chassisGrad;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Pulsing amber-gold armored containment border
    ctx.strokeStyle = `rgba(251, 191, 36, ${0.55 + pulse * 0.45})`;
    ctx.lineWidth = Math.max(1.3, rs * 0.075);
    ctx.stroke();

    // 4 directional reactor energy vent struts
    ctx.strokeStyle = `rgba(249, 115, 22, ${0.45 + pulse * 0.45})`;
    ctx.lineWidth = Math.max(1, rs * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx, ry + 1.5);
    ctx.lineTo(cx, ry + rs * 0.22);
    ctx.moveTo(cx, ry + rs - 1.5);
    ctx.lineTo(cx, ry + rs * 0.78);
    ctx.moveTo(rx + 1.5, cy);
    ctx.lineTo(rx + rs * 0.22, cy);
    ctx.moveTo(rx + rs - 1.5, cy);
    ctx.lineTo(rx + rs * 0.78, cy);
    ctx.stroke();

    // Signature Hexagonal Plasma Containment Ring
    const hexR = Math.max(3.6, rs * (0.29 + pulse * 0.04));
    const drawHex = (radius: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const hx = cx + Math.cos(angle) * radius;
        const hy = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
    };

    drawHex(hexR);
    const coreGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, hexR * 1.15);
    coreGrad.addColorStop(0, '#FFFBEB');
    coreGrad.addColorStop(0.45, '#FDE047');
    coreGrad.addColorStop(0.82, '#F97316');
    coreGrad.addColorStop(1, '#DC2626');
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = alpha * (0.78 + pulse * 0.22);
    ctx.fill();

    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = Math.max(1, rs * 0.06);
    ctx.globalAlpha = alpha * 0.95;
    ctx.stroke();

    // White-hot inner diamond singularity
    const innerR = Math.max(1.5, hexR * 0.42);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(cx, cy - innerR);
    ctx.lineTo(cx + innerR, cy);
    ctx.lineTo(cx, cy + innerR);
    ctx.lineTo(cx - innerR, cy);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    return;
  }

  // Premium Tile Skin Collection Renderer for all 7 Clash Piece Shapes (I, O, T, S, Z, J, L)
  if (skinDef && skinId !== 'classic') {
    const pieceType = type as PieceType;
    drawPremiumSkinCell(
      ctx,
      rx,
      ry,
      rs,
      pieceType,
      skinId,
      skinDef.pieces[pieceType],
      alpha,
      options?.timeMs ?? 0,
      options?.cellSeed ?? 1,
      Boolean(options?.reducedEffects)
    );

    // Preserve subtle lock-delay warning pulse on top of any premium skin
    if (options?.lockProgress && options.lockProgress > 0.15) {
      ctx.globalAlpha = options.lockProgress * 0.32;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(rx, ry, rs, rs);
    }

    ctx.restore();
    return;
  }

  // Amber CRT Vector-Circuit Tiles (Original phosphor arcade geometry — replaces Game Boy dot-matrix)
  if (theme.retroPattern) {
    const cut = Math.max(2, Math.floor(rs * 0.16));
    const drawChamferPath = (x0: number, y0: number, s0: number, c0: number) => {
      ctx.beginPath();
      ctx.moveTo(x0 + c0, y0);
      ctx.lineTo(x0 + s0 - c0, y0);
      ctx.lineTo(x0 + s0, y0 + c0);
      ctx.lineTo(x0 + s0, y0 + s0 - c0);
      ctx.lineTo(x0 + s0 - c0, y0 + s0);
      ctx.lineTo(x0 + c0, y0 + s0);
      ctx.lineTo(x0, y0 + s0 - c0);
      ctx.lineTo(x0, y0 + c0);
      ctx.closePath();
    };

    if (theme.blockGlow && type !== 'G' && !options?.reducedEffects) {
      ctx.shadowColor = palette.stroke;
      ctx.shadowBlur = 6;
    }

    // Dark phosphor cavity fill + bright amber vector outline
    drawChamferPath(rx, ry, rs, cut);
    ctx.fillStyle = palette.dark;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = Math.max(1.4, size * 0.08);
    ctx.stroke();

    // Inner glowing phosphor core tint
    const inset = Math.max(3, Math.floor(rs * 0.22));
    ctx.fillStyle = palette.fill;
    ctx.globalAlpha = alpha * (type === 'G' ? 0.55 : 0.36);
    ctx.fillRect(rx + inset, ry + inset, rs - inset * 2, rs - inset * 2);

    // Distinct vector-circuit glyph per piece type (non-hue-only visual readability)
    ctx.globalAlpha = alpha * 0.92;
    ctx.strokeStyle = palette.light;
    ctx.fillStyle = palette.light;
    ctx.lineWidth = Math.max(1, rs * 0.065);
    const cx = rx + rs * 0.5;
    const cy = ry + rs * 0.5;
    const rInner = rs * 0.22;

    if (type === 'I') {
      // Horizontal dual energy rails
      ctx.beginPath();
      ctx.moveTo(rx + inset, cy - rs * 0.12);
      ctx.lineTo(rx + rs - inset, cy - rs * 0.12);
      ctx.moveTo(rx + inset, cy + rs * 0.12);
      ctx.lineTo(rx + rs - inset, cy + rs * 0.12);
      ctx.stroke();
    } else if (type === 'O') {
      // Hollow vector diamond
      ctx.beginPath();
      ctx.moveTo(cx, cy - rInner);
      ctx.lineTo(cx + rInner, cy);
      ctx.lineTo(cx, cy + rInner);
      ctx.lineTo(cx - rInner, cy);
      ctx.closePath();
      ctx.stroke();
    } else if (type === 'T') {
      // Center crosshair node
      ctx.beginPath();
      ctx.moveTo(cx - rInner, cy);
      ctx.lineTo(cx + rInner, cy);
      ctx.moveTo(cx, cy - rInner);
      ctx.lineTo(cx, cy + rInner);
      ctx.stroke();
    } else if (type === 'S' || type === 'Z') {
      // Diagonal vector slash
      ctx.beginPath();
      if (type === 'S') {
        ctx.moveTo(rx + inset, ry + rs - inset);
        ctx.lineTo(rx + rs - inset, ry + inset);
      } else {
        ctx.moveTo(rx + inset, ry + inset);
        ctx.lineTo(rx + rs - inset, ry + rs - inset);
      }
      ctx.stroke();
    } else if (type === 'J' || type === 'L') {
      // Corner bracket chevrons
      ctx.beginPath();
      ctx.moveTo(rx + inset, cy);
      ctx.lineTo(cx, ry + inset);
      ctx.lineTo(rx + rs - inset, cy);
      ctx.stroke();
    } else if (type === 'G') {
      // Armored hazard double-stripe
      ctx.strokeStyle = palette.stroke;
      ctx.beginPath();
      ctx.moveTo(rx + inset, ry + inset);
      ctx.lineTo(rx + rs - inset, ry + rs - inset);
      ctx.moveTo(rx + rs - inset, ry + inset);
      ctx.lineTo(rx + inset, ry + rs - inset);
      ctx.stroke();
    }

    // Subtle CRT horizontal scanline shimmer
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = alpha * 0.18;
    for (let sy = ry + 2; sy < ry + rs - 1; sy += 4) {
      ctx.fillRect(rx + 1, sy, rs - 2, 1);
    }

    ctx.restore();
    return;
  }

  // Block Clash Signature Chamfered Alloy Tiles (replaces classic 4-edge beveled squares)
  const cut = Math.max(2, Math.floor(rs * 0.17));
  const traceChamfer = (x0: number, y0: number, s0: number, c0: number) => {
    ctx.beginPath();
    ctx.moveTo(x0 + c0, y0);
    ctx.lineTo(x0 + s0 - c0, y0);
    ctx.lineTo(x0 + s0, y0 + c0);
    ctx.lineTo(x0 + s0, y0 + s0 - c0);
    ctx.lineTo(x0 + s0 - c0, y0 + s0);
    ctx.lineTo(x0 + c0, y0 + s0);
    ctx.lineTo(x0, y0 + s0 - c0);
    ctx.lineTo(x0, y0 + c0);
    ctx.closePath();
  };

  if (theme.blockGlow && type !== 'G' && !options?.reducedEffects) {
    ctx.shadowColor = palette.stroke;
    ctx.shadowBlur = 7;
  }

  // Metallic directional gradient fill inside octagonal chamfered hull
  traceChamfer(rx, ry, rs, cut);
  const hullGrad = ctx.createLinearGradient(rx, ry, rx + rs, ry + rs);
  hullGrad.addColorStop(0, palette.light);
  hullGrad.addColorStop(0.28, palette.fill);
  hullGrad.addColorStop(0.82, palette.dark);
  hullGrad.addColorStop(1, palette.dark);
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Machined outer rim highlight
  ctx.strokeStyle = type === 'G' ? palette.stroke : palette.light;
  ctx.lineWidth = Math.max(1, rs * 0.065);
  ctx.globalAlpha = alpha * (type === 'G' ? 0.65 : 0.72);
  ctx.stroke();

  if (type === 'G') {
    // Armored Breach Alloy Plate: recessed gunmetal core + diagonal hazard chevron + corner bolts
    const inset = Math.max(2.5, Math.floor(rs * 0.18));
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = palette.dark;
    ctx.fillRect(rx + inset, ry + inset, rs - inset * 2, rs - inset * 2);

    ctx.strokeStyle = palette.light;
    ctx.lineWidth = Math.max(1, rs * 0.06);
    ctx.globalAlpha = alpha * 0.42;
    ctx.beginPath();
    ctx.moveTo(rx + inset + 1, ry + rs - inset - 1);
    ctx.lineTo(rx + rs - inset - 1, ry + inset + 1);
    ctx.stroke();

    // Micro corner rivets
    const rv = Math.max(1.2, rs * 0.07);
    ctx.fillStyle = palette.light;
    ctx.globalAlpha = alpha * 0.65;
    ctx.fillRect(rx + inset + 1, ry + inset + 1, rv, rv);
    ctx.fillRect(rx + rs - inset - rv - 1, ry + rs - inset - rv - 1, rv, rv);
  } else {
    // Recessed inner energy plate + precision center core strip
    const inset = Math.max(2.5, Math.floor(rs * 0.19));
    const innerS = Math.max(2, rs - inset * 2);
    const innerCut = Math.max(1, Math.floor(cut * 0.65));

    traceChamfer(rx + inset, ry + inset, innerS, innerCut);
    const plateGrad = ctx.createLinearGradient(rx + inset, ry + inset, rx + rs - inset, ry + rs - inset);
    plateGrad.addColorStop(0, palette.fill);
    plateGrad.addColorStop(1, palette.dark);
    ctx.globalAlpha = alpha * 0.92;
    ctx.fillStyle = plateGrad;
    ctx.fill();

    // Top-edge machined glass highlight bar
    ctx.globalAlpha = alpha * (theme.blockGlow ? 0.55 : 0.36);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(rx + inset + innerCut, ry + inset, Math.max(2, innerS - innerCut * 2), Math.max(1.5, rs * 0.1));

    // Signature center alloy core pip
    if (rs >= 12) {
      const pipW = Math.max(3, Math.floor(innerS * 0.44));
      const pipH = Math.max(2, Math.floor(innerS * 0.24));
      ctx.globalAlpha = alpha * (theme.blockGlow ? 0.45 : 0.28);
      ctx.fillStyle = palette.light;
      ctx.fillRect(rx + (rs - pipW) * 0.5, ry + (rs - pipH) * 0.5 + 0.5, pipW, pipH);
    }
  }

  // Subtle lock-delay warning pulse (brightens piece slightly before locking)
  if (options?.lockProgress && options.lockProgress > 0.15) {
    ctx.globalAlpha = options.lockProgress * 0.34;
    ctx.fillStyle = '#FFFFFF';
    traceChamfer(rx, ry, rs, cut);
    ctx.fill();
  }

  ctx.restore();
}
