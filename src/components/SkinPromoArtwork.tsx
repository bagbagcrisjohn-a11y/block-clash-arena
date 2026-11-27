import React from 'react';
import { TileSkinDefinition, TileSkinId } from '../game/skins';
import { PieceType } from '../game/types';

interface SkinPromoArtworkProps {
  skin: TileSkinDefinition;
  size?: 'card' | 'hero' | 'compact';
  reducedEffects?: boolean;
  className?: string;
}

interface CrestSlabSpec {
  piece: PieceType;
  /** Offset from center in normalized tile units for the symmetrical arena vault crest */
  dx: number;
  dy: number;
  scale?: number;
}

// Symmetrical Block Clash Collector Vault Crest:
// 7 faceted chamfered alloy slabs fanning around a central Hexagonal Energy Core
const VAULT_CREST_SLABS: CrestSlabSpec[] = [
  // Outer left wing
  { piece: 'I', dx: -2.55, dy: -0.58, scale: 0.94 },
  { piece: 'J', dx: -2.55, dy: 0.58, scale: 0.94 },
  // Inner left flank
  { piece: 'S', dx: -1.38, dy: -0.92, scale: 1.0 },
  { piece: 'O', dx: -1.38, dy: 0.92, scale: 1.0 },
  // Inner right flank
  { piece: 'T', dx: 1.38, dy: -0.92, scale: 1.0 },
  { piece: 'Z', dx: 1.38, dy: 0.92, scale: 1.0 },
  // Outer right wing
  { piece: 'L', dx: 2.55, dy: 0.0, scale: 1.02 },
];

const STAR_COORDS = [
  { left: '12%', top: '18%', size: 3, delay: '0s' },
  { left: '26%', top: '76%', size: 2, delay: '0.6s' },
  { left: '44%', top: '14%', size: 3, delay: '1.2s' },
  { left: '68%', top: '82%', size: 2.5, delay: '0.3s' },
  { left: '84%', top: '20%', size: 3.5, delay: '0.9s' },
  { left: '91%', top: '66%', size: 2, delay: '1.6s' },
  { left: '16%', top: '48%', size: 2, delay: '1.1s' },
  { left: '74%', top: '42%', size: 2.5, delay: '0.4s' },
];

const CHAMFER_CLIP =
  'polygon(18% 0%, 82% 0%, 100% 18%, 100% 82%, 82% 100%, 18% 100%, 0% 82%, 0% 18%)';

const HEX_CLIP =
  'polygon(50% 0%, 94% 25%, 94% 75%, 50% 100%, 6% 75%, 6% 25%)';

function getTileSurfaceStyle(
  skin: TileSkinDefinition,
  piece: PieceType,
  reducedEffects: boolean
): React.CSSProperties {
  const c = skin.pieces[piece];
  const baseShadow = reducedEffects
    ? `inset 0 1px 0 ${c.light}88, inset 0 -2px 0 ${c.dark}cc`
    : `inset 0 1.5px 1px ${c.light}aa, inset 0 -2px 3px ${c.dark}dd`;

  switch (skin.id) {
    case 'neon_cyber':
      return {
        background: `linear-gradient(145deg, ${c.base} 0%, ${c.dark} 58%, ${c.mid}55 100%)`,
        boxShadow: reducedEffects
          ? `inset 0 0 0 1.5px ${c.border}`
          : `inset 0 0 0 1.5px ${c.border}, inset 0 0 10px ${c.glow}88`,
      };
    case 'golden_luxury':
      return {
        background: `linear-gradient(135deg, ${c.light} 0%, ${c.mid} 32%, ${c.dark} 68%, ${c.mid} 88%, ${c.light} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, ${baseShadow}`,
      };
    case 'ice_crystal':
      return {
        background: `linear-gradient(135deg, ${c.light}dd 0%, ${c.mid}bb 42%, ${c.base}dd 78%, ${c.dark}ee 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, inset 0 2px 3px #ffffffcc`,
      };
    case 'fire_lava':
      return {
        background: `radial-gradient(circle at 38% 36%, ${c.light} 0%, ${c.mid} 38%, ${c.base} 74%, ${c.dark} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, inset 0 0 8px ${c.light}88`,
      };
    case 'galaxy':
      return {
        background: `radial-gradient(circle at 30% 25%, ${c.mid}dd 0%, ${c.base} 52%, ${c.dark} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, ${baseShadow}`,
      };
    case 'toxic_green':
      return {
        background: `radial-gradient(circle at 50% 45%, ${c.light}cc 0%, ${c.mid} 40%, ${c.base} 78%, ${c.dark} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, inset 0 0 8px ${c.light}77`,
      };
    case 'diamond':
      return {
        background: `conic-gradient(from 45deg at 50% 50%, ${c.light} 0deg, ${c.mid} 75deg, ${c.base} 150deg, ${c.light} 225deg, ${c.dark} 300deg, ${c.light} 360deg)`,
        boxShadow: `inset 0 0 0 1.5px #FFFFFF, inset 0 0 6px #ffffffdd`,
      };
    case 'shadow_legend':
      return {
        background: `linear-gradient(145deg, #1b1129 0%, ${c.base} 50%, ${c.dark} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, inset 0 0 10px ${c.mid}bb`,
      };
    case 'royal_cosmic':
      return {
        background: `linear-gradient(135deg, ${c.mid} 0%, ${c.base} 56%, ${c.dark} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, inset 0 1.5px 2px ${c.light}88`,
      };
    case 'ultimate_legendary':
      return {
        background: `linear-gradient(135deg, #FF3D7F 0%, #FBBF24 26%, #10D9A0 50%, #00F0FF 74%, #A855F7 100%)`,
        boxShadow: `inset 0 0 0 1.5px #FFFFFF, inset 0 1.5px 2px #ffffffdd`,
      };
    default:
      return {
        background: `linear-gradient(145deg, ${c.light} 0%, ${c.mid} 42%, ${c.dark} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${c.border}, ${baseShadow}`,
      };
  }
}

function renderTileOverlay(skinId: TileSkinId, accent: string, light: string) {
  switch (skinId) {
    case 'neon_cyber':
      return (
        <span
          className="absolute inset-[22%] border"
          style={{
            clipPath: CHAMFER_CLIP,
            borderColor: `${light}bb`,
            backgroundColor: `${accent}26`,
          }}
        />
      );
    case 'ice_crystal':
    case 'diamond':
      return (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(125deg, rgba(255,255,255,0.58) 0%, rgba(255,255,255,0.12) 44%, transparent 45%, rgba(255,255,255,0.22) 100%)',
          }}
        />
      );
    case 'fire_lava':
      return (
        <span
          className="absolute inset-[18%] rounded-full blur-[2px] opacity-85"
          style={{ background: `radial-gradient(circle, ${light} 0%, transparent 72%)` }}
        />
      );
    case 'royal_cosmic':
      return (
        <>
          <span
            className="absolute top-1 left-1 w-1.5 h-1.5 border-t border-l"
            style={{ borderColor: '#FEF08A' }}
          />
          <span
            className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b border-r"
            style={{ borderColor: '#FEF08A' }}
          />
        </>
      );
    case 'shadow_legend':
      return (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, transparent 36%, ${light}66 50%, transparent 64%)`,
          }}
        />
      );
    default:
      return (
        <span
          className="absolute inset-[22%] pointer-events-none"
          style={{
            clipPath: CHAMFER_CLIP,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.34), rgba(0,0,0,0.18))',
          }}
        />
      );
  }
}

export const SkinPromoArtwork: React.FC<SkinPromoArtworkProps> = ({
  skin,
  size = 'card',
  reducedEffects = false,
  className = '',
}) => {
  const slabPx = size === 'hero' ? 38 : size === 'compact' ? 22 : 30;
  const corePx = Math.round(slabPx * 1.48);
  const stageW = Math.round(slabPx * 6.8);
  const stageH = Math.round(slabPx * 3.2);

  const showStars =
    skin.id === 'galaxy' ||
    skin.id === 'royal_cosmic' ||
    skin.id === 'diamond' ||
    skin.id === 'ultimate_legendary';
  const showRisingOrbs =
    skin.id === 'fire_lava' ||
    skin.id === 'toxic_green' ||
    skin.id === 'shadow_legend' ||
    skin.id === 'ultimate_legendary';

  return (
    <div
      className={`relative w-full overflow-hidden select-none flex items-center justify-center ${
        size === 'hero' ? 'h-48 sm:h-56' : size === 'compact' ? 'h-24' : 'h-40'
      } ${className}`}
      style={{
        background: skin.cardBackdrop,
      }}
      aria-hidden="true"
    >
      {/* Subtle Diagonal Arena Energy Lattice */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${skin.accentColor}26 0px, ${skin.accentColor}26 1px, transparent 1px, transparent 18px), repeating-linear-gradient(-45deg, ${skin.secondaryColor}22 0px, ${skin.secondaryColor}22 1px, transparent 1px, transparent 18px)`,
        }}
      />

      {/* Ambient Atmospheric Halo */}
      <div
        className={`absolute inset-0 pointer-events-none ${
          !reducedEffects && skin.id === 'fire_lava' ? 'skin-lava-pulse' : ''
        }`}
        style={{
          background: `radial-gradient(ellipse at 50% 54%, ${skin.accentColor}3a 0%, ${skin.secondaryColor}22 44%, transparent 74%)`,
        }}
      />

      {/* Starlight & Gemstone Twinkles */}
      {showStars &&
        STAR_COORDS.map((star, idx) => (
          <span
            key={idx}
            className={`absolute rounded-full pointer-events-none ${
              reducedEffects ? 'opacity-65' : 'skin-star-twinkle'
            }`}
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              backgroundColor: skin.id === 'royal_cosmic' ? '#FEF08A' : '#FFFFFF',
              boxShadow: reducedEffects ? 'none' : `0 0 8px ${skin.accentColor}`,
              animationDelay: star.delay,
            }}
          />
        ))}

      {/* Rising Ember / Isotope / Void Energy Particles */}
      {showRisingOrbs && !reducedEffects && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[14, 32, 52, 70, 86].map((leftPct, idx) => (
            <span
              key={leftPct}
              className="skin-particle-rise absolute bottom-2 rounded-full"
              style={{
                left: `${leftPct}%`,
                width: idx % 2 === 0 ? 5 : 3.5,
                height: idx % 2 === 0 ? 5 : 3.5,
                backgroundColor: idx % 2 === 0 ? skin.accentColor : skin.secondaryColor,
                boxShadow: `0 0 10px ${skin.accentColor}`,
                animationDelay: `${idx * 0.55}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Symmetrical Block Clash Collector Vault Crest (7 Chamfered Slabs + Central Hex Core) */}
      <div
        className={`relative z-10 flex items-center justify-center ${
          !reducedEffects && skin.id === 'ultimate_legendary' ? 'skin-prismatic-cycle' : ''
        }`}
        style={{
          width: stageW,
          height: stageH,
          transform: size === 'hero' ? 'perspective(640px) rotateX(6deg)' : 'none',
        }}
      >
        {/* Connecting energy conduit rings behind crest */}
        <div
          className="absolute rounded-full pointer-events-none border"
          style={{
            width: Math.round(slabPx * 3.15),
            height: Math.round(slabPx * 3.15),
            borderColor: `${skin.accentColor}44`,
          }}
        />
        <div
          className="absolute h-[1.5px] pointer-events-none"
          style={{
            width: Math.round(slabPx * 5.8),
            background: `linear-gradient(90deg, transparent, ${skin.accentColor}88, ${skin.secondaryColor}88, transparent)`,
          }}
        />

        {/* 7 Faceted Chamfered Alloy Slabs (showcasing all 7 piece material variants) */}
        {VAULT_CREST_SLABS.map((slab, idx) => {
          const pieceColors = skin.pieces[slab.piece];
          const s = Math.round(slabPx * (slab.scale ?? 1));
          const left = stageW / 2 + slab.dx * slabPx - s / 2;
          const top = stageH / 2 + slab.dy * slabPx - s / 2;
          return (
            <div
              key={`${slab.piece}-${idx}`}
              className="absolute"
              style={{
                left,
                top,
                width: s,
                height: s,
                filter: reducedEffects ? 'none' : `drop-shadow(0 0 8px ${pieceColors.glow}66)`,
              }}
            >
              <div
                className="relative w-full h-full overflow-hidden"
                style={{
                  clipPath: CHAMFER_CLIP,
                  ...getTileSurfaceStyle(skin, slab.piece, reducedEffects),
                }}
              >
                {renderTileOverlay(skin.id, pieceColors.glow, pieceColors.light)}
              </div>
            </div>
          );
        })}

        {/* Central Signature Hexagonal Arena Core Medallion */}
        <div
          className="relative z-20 flex items-center justify-center"
          style={{
            width: corePx,
            height: corePx,
            filter: reducedEffects ? 'none' : `drop-shadow(0 0 12px ${skin.accentColor}aa)`,
          }}
        >
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              clipPath: HEX_CLIP,
              background: `linear-gradient(145deg, ${skin.accentColor}, ${skin.secondaryColor})`,
              padding: 2,
            }}
          >
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                clipPath: HEX_CLIP,
                background: 'radial-gradient(circle at 50% 45%, #1E293B 0%, #070A14 82%)',
              }}
            >
              <div
                style={{
                  width: '48%',
                  height: '48%',
                  clipPath: HEX_CLIP,
                  background: `radial-gradient(circle, #FFFBEB 0%, ${skin.accentColor} 65%, ${skin.secondaryColor} 100%)`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Diagonal Metallic / Glass Sheen Sweep */}
      {!reducedEffects && skin.isAnimated && (
        <div
          className="skin-sheen-sweep absolute inset-y-0 -left-1/3 w-1/2 pointer-events-none"
          style={{
            background:
              skin.id === 'golden_luxury'
                ? 'linear-gradient(105deg, transparent 20%, rgba(254, 249, 195, 0.32) 50%, transparent 80%)'
                : 'linear-gradient(105deg, transparent 20%, rgba(255, 255, 255, 0.18) 50%, transparent 80%)',
          }}
        />
      )}

      {/* Crisp Bottom Vignette Divider */}
      <div
        className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(7, 11, 20, 0.68) 100%)',
        }}
      />
    </div>
  );
};
