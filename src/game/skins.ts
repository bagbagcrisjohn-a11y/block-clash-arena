import { PieceType } from './types';

export type TileSkinId =
  | 'classic'
  | 'neon_cyber'
  | 'golden_luxury'
  | 'ice_crystal'
  | 'fire_lava'
  | 'galaxy'
  | 'toxic_green'
  | 'diamond'
  | 'shadow_legend'
  | 'royal_cosmic'
  | 'ultimate_legendary';

export type SkinRarity = 'Default' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic' | 'Ultimate';

export interface SkinPieceColors {
  base: string;
  mid: string;
  light: string;
  dark: string;
  border: string;
  glow: string;
}

export interface TileSkinDefinition {
  id: TileSkinId;
  name: string;
  rarity: SkinRarity;
  pricePhp: number; // 0 for Classic default
  tagline: string;
  description: string;
  materialLabel: string;
  accentColor: string;
  secondaryColor: string;
  rarityColor: string;
  cardBackdrop: string;
  trailColor: string;
  hasParticles: boolean;
  isAnimated: boolean;
  pieces: Record<PieceType, SkinPieceColors>;
}

export interface PlayerSkinInventory {
  ownedSkinIds: TileSkinId[];
  equippedSkinId: TileSkinId;
  reducedEffects: boolean;
}

export interface PlayerSkinPreferences {
  reducedEffects: boolean;
}

const LEGACY_SKIN_STORAGE_KEY_V1 = 'block_clash_skins_v1';
const LEGACY_SKIN_STORAGE_KEY_V2 = 'block_clash_skin_prefs_v2';
const SKIN_PREFS_STORAGE_KEY = 'block_clash_skin_prefs_v3';

export const RARITY_COLORS: Record<SkinRarity, string> = {
  Default: '#94A3B8',
  Rare: '#38BDF8',
  Epic: '#C084FC',
  Legendary: '#FBBF24',
  Mythic: '#F472B6',
  Ultimate: '#2DD4BF',
};

/**
 * Configurable Premium Tile Skin Catalog.
 * Add new entries here to introduce future collections seamlessly across the
 * Marketplace, Live 7-Shape Preview, and Canvas Gameplay Engine.
 */
export const PREMIUM_SKIN_CATALOG: TileSkinDefinition[] = [
  {
    id: 'neon_cyber',
    name: 'Neon Cyber',
    rarity: 'Rare',
    pricePhp: 49,
    tagline: 'Glowing cyan & violet synth-circuit blocks',
    description:
      'Futuristic dual-tube neon blocks engineered with dark cybernetic cores, luminous cyan-purple edge rails, and precision circuit highlights.',
    materialLabel: 'Cyber Plasma Glass',
    accentColor: '#00F0FF',
    secondaryColor: '#A855F7',
    rarityColor: RARITY_COLORS.Rare,
    cardBackdrop: 'radial-gradient(circle at 25% 20%, rgba(0, 240, 255, 0.28), rgba(168, 85, 247, 0.18) 48%, #070B18 100%)',
    trailColor: '#00F0FF',
    hasParticles: false,
    isAnimated: true,
    pieces: {
      I: { base: '#082F49', mid: '#00D8FF', light: '#A5F3FC', dark: '#041423', border: '#22D3EE', glow: '#00F0FF' },
      O: { base: '#2E1065', mid: '#A855F7', light: '#F0ABFC', dark: '#15062E', border: '#D946EF', glow: '#C084FC' },
      T: { base: '#1E1B4B', mid: '#818CF8', light: '#C7D2FE', dark: '#0F0D2B', border: '#38BDF8', glow: '#818CF8' },
      S: { base: '#064E3B', mid: '#14F195', light: '#A7F3D0', dark: '#032018', border: '#2DD4BF', glow: '#14F195' },
      Z: { base: '#4C0519', mid: '#F43F5E', light: '#FDA4AF', dark: '#21030B', border: '#FB7185', glow: '#FF2E93' },
      J: { base: '#172554', mid: '#3B82F6', light: '#93C5FD', dark: '#09112A', border: '#00F0FF', glow: '#38BDF8' },
      L: { base: '#3B0764', mid: '#E879F9', light: '#F5D0FE', dark: '#19032C', border: '#A855F7', glow: '#E879F9' },
    },
  },
  {
    id: 'golden_luxury',
    name: 'Golden Luxury',
    rarity: 'Rare',
    pricePhp: 79,
    tagline: 'Polished 24K metallic gold with specular sheen',
    description:
      'Forged metallic bullion blocks featuring multi-layer brushed gold gradients, beveled crown edges, and animated diagonal mirror reflections.',
    materialLabel: '24K Brushed Bullion',
    accentColor: '#FACC15',
    secondaryColor: '#F59E0B',
    rarityColor: RARITY_COLORS.Rare,
    cardBackdrop: 'radial-gradient(circle at 30% 18%, rgba(250, 204, 21, 0.3), rgba(180, 83, 9, 0.18) 52%, #0C0904 100%)',
    trailColor: '#FDE047',
    hasParticles: false,
    isAnimated: true,
    pieces: {
      I: { base: '#CA8A04', mid: '#FACC15', light: '#FEF9C3', dark: '#713F12', border: '#FDE047', glow: '#FACC15' },
      O: { base: '#B45309', mid: '#F59E0B', light: '#FEF08A', dark: '#5C2404', border: '#FCD34D', glow: '#F59E0B' },
      T: { base: '#A16207', mid: '#EAB308', light: '#FFFBEB', dark: '#422006', border: '#FDE68A', glow: '#EAB308' },
      S: { base: '#92400E', mid: '#D97706', light: '#FDE68A', dark: '#451A03', border: '#FBBF24', glow: '#FBBF24' },
      Z: { base: '#9A3412', mid: '#EA580C', light: '#FED7AA', dark: '#431407', border: '#FDBA74', glow: '#F97316' },
      J: { base: '#854D0E', mid: '#EAB308', light: '#FEF3C7', dark: '#3B1E04', border: '#FACC15', glow: '#FDE047' },
      L: { base: '#A8550A', mid: '#F59E0B', light: '#FFF7D6', dark: '#4A2105', border: '#FDE047', glow: '#F59E0B' },
    },
  },
  {
    id: 'ice_crystal',
    name: 'Ice Crystal',
    rarity: 'Epic',
    pricePhp: 99,
    tagline: 'Transparent glacier glass with sharp crystal facets',
    description:
      'Translucent sub-zero frost blocks sculpted with geometric crystalline facets, frozen specular rims, and crisp refractive light glints.',
    materialLabel: 'Glacial Facet Glass',
    accentColor: '#7DD3FC',
    secondaryColor: '#38BDF8',
    rarityColor: RARITY_COLORS.Epic,
    cardBackdrop: 'radial-gradient(circle at 28% 20%, rgba(125, 211, 252, 0.3), rgba(14, 116, 144, 0.2) 50%, #050C16 100%)',
    trailColor: '#BAE6FD',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#0284C7', mid: '#38BDF8', light: '#F0F9FF', dark: '#0C4A6E', border: '#BAE6FD', glow: '#7DD3FC' },
      O: { base: '#0891B2', mid: '#22D3EE', light: '#ECFEFF', dark: '#164E63', border: '#A5F3FC', glow: '#67E8F9' },
      T: { base: '#2563EB', mid: '#60A5FA', light: '#EFF6FF', dark: '#1E3A8A', border: '#BFDBFE', glow: '#93C5FD' },
      S: { base: '#0D9488', mid: '#2DD4BF', light: '#F0FDFA', dark: '#134E4A', border: '#99F6E4', glow: '#5EEAD4' },
      Z: { base: '#4F46E5', mid: '#818CF8', light: '#EEF2FF', dark: '#312E81', border: '#C7D2FE', glow: '#A5B4FC' },
      J: { base: '#0369A1', mid: '#0EA5E9', light: '#E0F2FE', dark: '#082F49', border: '#7DD3FC', glow: '#38BDF8' },
      L: { base: '#0284C7', mid: '#67E8F9', light: '#FFFFFF', dark: '#0E7490', border: '#CFFAFE', glow: '#A5F3FC' },
    },
  },
  {
    id: 'fire_lava',
    name: 'Fire Lava',
    rarity: 'Epic',
    pricePhp: 99,
    tagline: 'Molten volcanic blocks with animated magma veins',
    description:
      'Superheated obsidian shells cracked open by flowing orange-red magma rivers, pulsing thermal cores, and rising incandescent embers.',
    materialLabel: 'Animated Volcanic Magma',
    accentColor: '#FB923C',
    secondaryColor: '#EF4444',
    rarityColor: RARITY_COLORS.Epic,
    cardBackdrop: 'radial-gradient(circle at 30% 75%, rgba(239, 68, 68, 0.34), rgba(249, 115, 22, 0.2) 48%, #100605 100%)',
    trailColor: '#FB923C',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#7F1D1D', mid: '#F97316', light: '#FEF08A', dark: '#2A0806', border: '#FB923C', glow: '#F97316' },
      O: { base: '#9A3412', mid: '#F59E0B', light: '#FEF9C3', dark: '#350D04', border: '#FACC15', glow: '#FBBF24' },
      T: { base: '#881337', mid: '#EF4444', light: '#FDBA74', dark: '#2E050F', border: '#F87171', glow: '#EF4444' },
      S: { base: '#92400E', mid: '#FB923C', light: '#FEF08A', dark: '#331204', border: '#FDBA74', glow: '#FB923C' },
      Z: { base: '#7F1D1D', mid: '#DC2626', light: '#FCA5A5', dark: '#260606', border: '#EF4444', glow: '#F43F5E' },
      J: { base: '#7C2D12', mid: '#EA580C', light: '#FDE68A', dark: '#290B04', border: '#FB923C', glow: '#EA580C' },
      L: { base: '#991B1B', mid: '#F97316', light: '#FEF3C7', dark: '#310707', border: '#FBBF24', glow: '#F97316' },
    },
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    rarity: 'Epic',
    pricePhp: 149,
    tagline: 'Deep cosmic purple & indigo blocks with star particles',
    description:
      'Celestial deep-space blocks filled with layered nebula clouds, shimmering stardust ribbons, and animated twinkling starlight particles.',
    materialLabel: 'Cosmic Nebula Core',
    accentColor: '#A855F7',
    secondaryColor: '#3B82F6',
    rarityColor: RARITY_COLORS.Epic,
    cardBackdrop: 'radial-gradient(circle at 25% 25%, rgba(168, 85, 247, 0.34), rgba(37, 99, 235, 0.24) 50%, #050514 100%)',
    trailColor: '#C084FC',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#1E1B4B', mid: '#3B82F6', light: '#BFDBFE', dark: '#090721', border: '#60A5FA', glow: '#3B82F6' },
      O: { base: '#3B0764', mid: '#A855F7', light: '#F3E8FF', dark: '#140326', border: '#D8B4FE', glow: '#C084FC' },
      T: { base: '#4A044E', mid: '#D946EF', light: '#FAE8FF', dark: '#1B021E', border: '#F0ABFC', glow: '#E879F9' },
      S: { base: '#0F172A', mid: '#06B6D4', light: '#CFFAFE', dark: '#040814', border: '#22D3EE', glow: '#22D3EE' },
      Z: { base: '#500724', mid: '#EC4899', light: '#FCE7F3', dark: '#1F0310', border: '#F472B6', glow: '#EC4899' },
      J: { base: '#172554', mid: '#6366F1', light: '#E0E7FF', dark: '#070D26', border: '#818CF8', glow: '#6366F1' },
      L: { base: '#2E1065', mid: '#8B5CF6', light: '#EDE9FE', dark: '#100526', border: '#A78BFA', glow: '#8B5CF6' },
    },
  },
  {
    id: 'toxic_green',
    name: 'Toxic Green',
    rarity: 'Epic',
    pricePhp: 149,
    tagline: 'Radioactive bio-luminescent blocks with glowing rims',
    description:
      'High-voltage isotope tiles pulsing with luminous acid-green cores, heavy containment corner frames, and animated radioactive micro-bubbles.',
    materialLabel: 'Isotope Bio-Reactor',
    accentColor: '#4ADE80',
    secondaryColor: '#A3E635',
    rarityColor: RARITY_COLORS.Epic,
    cardBackdrop: 'radial-gradient(circle at 28% 24%, rgba(74, 222, 128, 0.3), rgba(163, 230, 53, 0.16) 50%, #050F08 100%)',
    trailColor: '#4ADE80',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#052E16', mid: '#22C55E', light: '#DCFCE7', dark: '#02150A', border: '#4ADE80', glow: '#22C55E' },
      O: { base: '#1A2E05', mid: '#84CC16', light: '#ECFCCB', dark: '#0B1402', border: '#A3E635', glow: '#84CC16' },
      T: { base: '#064E3B', mid: '#10B981', light: '#D1FAE5', dark: '#022119', border: '#34D399', glow: '#10B981' },
      S: { base: '#14532D', mid: '#4ADE80', light: '#F0FDF4', dark: '#072212', border: '#86EFAC', glow: '#4ADE80' },
      Z: { base: '#365314', mid: '#A3E635', light: '#F7FEE7', dark: '#142107', border: '#BEF264', glow: '#A3E635' },
      J: { base: '#042F2E', mid: '#14B8A6', light: '#CCFBF1', dark: '#021514', border: '#2DD4BF', glow: '#14B8A6' },
      L: { base: '#052E16', mid: '#65A30D', light: '#ECFCCB', dark: '#03170A', border: '#84CC16', glow: '#84CC16' },
    },
  },
  {
    id: 'diamond',
    name: 'Diamond',
    rarity: 'Legendary',
    pricePhp: 199,
    tagline: 'Transparent cut gemstone tiles with sparkling reflections',
    description:
      'Precision-cut crystal diamond blocks built with multi-angle pavilion reflections, spectral dispersion borders, and animated 4-point star sparkles.',
    materialLabel: 'Prismatic Cut Gemstone',
    accentColor: '#E0F2FE',
    secondaryColor: '#38BDF8',
    rarityColor: RARITY_COLORS.Legendary,
    cardBackdrop: 'radial-gradient(circle at 26% 20%, rgba(224, 242, 254, 0.3), rgba(56, 189, 248, 0.2) 48%, #070C17 100%)',
    trailColor: '#E0F2FE',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#0EA5E9', mid: '#BAE6FD', light: '#FFFFFF', dark: '#0369A1', border: '#E0F2FE', glow: '#7DD3FC' },
      O: { base: '#64748B', mid: '#E2E8F0', light: '#FFFFFF', dark: '#334155', border: '#F8FAFC', glow: '#E2E8F0' },
      T: { base: '#7C3AED', mid: '#DDD6FE', light: '#FFFFFF', dark: '#4C1D95', border: '#EDE9FE', glow: '#C4B5FD' },
      S: { base: '#0D9488', mid: '#99F6E4', light: '#FFFFFF', dark: '#115E59', border: '#CCFBF1', glow: '#5EEAD4' },
      Z: { base: '#DB2777', mid: '#FBCFE8', light: '#FFFFFF', dark: '#831843', border: '#FCE7F3', glow: '#F472B6' },
      J: { base: '#2563EB', mid: '#BFDBFE', light: '#FFFFFF', dark: '#1E3A8A', border: '#DBEAFE', glow: '#93C5FD' },
      L: { base: '#0284C7', mid: '#A5F3FC', light: '#FFFFFF', dark: '#0C4A6E', border: '#ECFEFF', glow: '#67E8F9' },
    },
  },
  {
    id: 'shadow_legend',
    name: 'Shadow Legend',
    rarity: 'Legendary',
    pricePhp: 249,
    tagline: 'Carved black obsidian infused with dark violet energy',
    description:
      'Stealth obsidian-forged blocks housing surging dark-amethyst energy fissures, smoked glass bevels, and ominous phantom rim luminescence.',
    materialLabel: 'Obsidian Void Energy',
    accentColor: '#9333EA',
    secondaryColor: '#581C87',
    rarityColor: RARITY_COLORS.Legendary,
    cardBackdrop: 'radial-gradient(circle at 28% 24%, rgba(147, 51, 234, 0.34), rgba(30, 10, 48, 0.5) 52%, #040308 100%)',
    trailColor: '#A855F7',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#090710', mid: '#6B21A8', light: '#D8B4FE', dark: '#030206', border: '#A855F7', glow: '#9333EA' },
      O: { base: '#0D0814', mid: '#7E22CE', light: '#E9D5FF', dark: '#040208', border: '#C084FC', glow: '#A855F7' },
      T: { base: '#110618', mid: '#9333EA', light: '#F3E8FF', dark: '#05020A', border: '#D946EF', glow: '#C026D3' },
      S: { base: '#080B14', mid: '#4F46E5', light: '#C7D2FE', dark: '#020409', border: '#818CF8', glow: '#6366F1' },
      Z: { base: '#140612', mid: '#A21CAF', light: '#F5D0FE', dark: '#060206', border: '#E879F9', glow: '#D946EF' },
      J: { base: '#090916', mid: '#5B21B6', light: '#DDD6FE', dark: '#03030A', border: '#8B5CF6', glow: '#7C3AED' },
      L: { base: '#0F0716', mid: '#86198F', light: '#F0ABFC', dark: '#040208', border: '#C084FC', glow: '#A855F7' },
    },
  },
  {
    id: 'royal_cosmic',
    name: 'Royal Cosmic',
    rarity: 'Mythic',
    pricePhp: 299,
    tagline: 'Imperial burnished gold & violet with arcane stardust',
    description:
      'Regal crown-trimmed violet gemstone blocks framed in gilded filigree brackets, radiating royal gold dust and magical astral shimmers.',
    materialLabel: 'Imperial Gold & Astral',
    accentColor: '#FBBF24',
    secondaryColor: '#9333EA',
    rarityColor: RARITY_COLORS.Mythic,
    cardBackdrop: 'radial-gradient(circle at 25% 20%, rgba(251, 191, 36, 0.28), rgba(147, 51, 234, 0.3) 50%, #090514 100%)',
    trailColor: '#FBBF24',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#3B0764', mid: '#7E22CE', light: '#FEF08A', dark: '#1A0430', border: '#FACC15', glow: '#FBBF24' },
      O: { base: '#4C1D95', mid: '#8B5CF6', light: '#FEF9C3', dark: '#200B42', border: '#FDE047', glow: '#F59E0B' },
      T: { base: '#581C87', mid: '#A855F7', light: '#FEF3C7', dark: '#24083B', border: '#FBBF24', glow: '#EAB308' },
      S: { base: '#312E81', mid: '#6366F1', light: '#FDE68A', dark: '#14113B', border: '#FACC15', glow: '#FBBF24' },
      Z: { base: '#701A75', mid: '#C026D3', light: '#FEF08A', dark: '#2E0930', border: '#FDE047', glow: '#F59E0B' },
      J: { base: '#1E1B4B', mid: '#4F46E5', light: '#FEF3C7', dark: '#0C0A24', border: '#FBBF24', glow: '#FACC15' },
      L: { base: '#4A044E', mid: '#9333EA', light: '#FFFBEB', dark: '#1D0220', border: '#FDE047', glow: '#FBBF24' },
    },
  },
  {
    id: 'ultimate_legendary',
    name: 'Ultimate Legendary',
    rarity: 'Ultimate',
    pricePhp: 399,
    tagline: 'Exclusive multicolor animated chrome with live particles',
    description:
      'Our flagship collector masterpiece: continuously shifting iridescent holographic tiles with liquid-chrome lighting, rainbow rim refraction, and animated starlight bursts.',
    materialLabel: 'Holographic Prismatic Core',
    accentColor: '#00F0FF',
    secondaryColor: '#F472B6',
    rarityColor: RARITY_COLORS.Ultimate,
    cardBackdrop: 'linear-gradient(135deg, rgba(255, 51, 102, 0.28), rgba(250, 204, 21, 0.22) 28%, rgba(0, 240, 255, 0.28) 62%, rgba(168, 85, 247, 0.34) 100%)',
    trailColor: '#00F0FF',
    hasParticles: true,
    isAnimated: true,
    pieces: {
      I: { base: '#BE185D', mid: '#FF3D7F', light: '#FFFFFF', dark: '#500724', border: '#F9A8D4', glow: '#EC4899' },
      O: { base: '#059669', mid: '#10D9A0', light: '#FFFFFF', dark: '#064E3B', border: '#6EE7B7', glow: '#34D399' },
      T: { base: '#D97706', mid: '#FBBF24', light: '#FFFFFF', dark: '#78350F', border: '#FDE68A', glow: '#F59E0B' },
      S: { base: '#2563EB', mid: '#60A5FA', light: '#FFFFFF', dark: '#1E3A8A', border: '#BFDBFE', glow: '#3B82F6' },
      Z: { base: '#0891B2', mid: '#00F0FF', light: '#FFFFFF', dark: '#164E63', border: '#A5F3FC', glow: '#22D3EE' },
      J: { base: '#7C3AED', mid: '#C084FC', light: '#FFFFFF', dark: '#4C1D95', border: '#E9D5FF', glow: '#A855F7' },
      L: { base: '#65A30D', mid: '#A3E635', light: '#FFFFFF', dark: '#365314', border: '#D9F99D', glow: '#84CC16' },
    },
  },
];

export const CLASSIC_SKIN: TileSkinDefinition = {
  id: 'classic',
  name: 'Classic Arena',
  rarity: 'Default',
  pricePhp: 0,
  tagline: 'Signature chamfered alloy arena tiles',
  description: 'Adapts cleanly to your selected Visual Theme (Neon Cyber, Amber CRT, or Clean Modern).',
  materialLabel: 'Arena Alloy Default',
  accentColor: '#00E5C3',
  secondaryColor: '#EC4899',
  rarityColor: RARITY_COLORS.Default,
  cardBackdrop: 'radial-gradient(circle at 30% 25%, rgba(0, 229, 195, 0.18), rgba(236, 72, 153, 0.12) 55%, #0B1020 100%)',
  trailColor: '#00E5C3',
  hasParticles: false,
  isAnimated: false,
  pieces: {
    I: { base: '#EC4899', mid: '#F472B6', light: '#F9A8D4', dark: '#9D174D', border: '#F472B6', glow: '#EC4899' },
    O: { base: '#10B981', mid: '#34D399', light: '#6EE7B7', dark: '#047857', border: '#34D399', glow: '#10B981' },
    T: { base: '#F59E0B', mid: '#FBBF24', light: '#FDE68A', dark: '#B45309', border: '#FBBF24', glow: '#F59E0B' },
    S: { base: '#3B82F6', mid: '#60A5FA', light: '#93C5FD', dark: '#1D4ED8', border: '#60A5FA', glow: '#3B82F6' },
    Z: { base: '#06B6D4', mid: '#22D3EE', light: '#A5F3FC', dark: '#0E7490', border: '#22D3EE', glow: '#06B6D4' },
    J: { base: '#A855F7', mid: '#C084FC', light: '#E9D5FF', dark: '#6B21A8', border: '#C084FC', glow: '#A855F7' },
    L: { base: '#84CC16', mid: '#A3E635', light: '#D9F99D', dark: '#4D7C0F', border: '#A3E635', glow: '#84CC16' },
  },
};

const VALID_SKIN_IDS = new Set<string>([
  'classic',
  ...PREMIUM_SKIN_CATALOG.map((s) => s.id),
]);

export function getSkinById(id: TileSkinId | undefined): TileSkinDefinition {
  if (!id || id === 'classic') return CLASSIC_SKIN;
  return PREMIUM_SKIN_CATALOG.find((s) => s.id === id) ?? CLASSIC_SKIN;
}

export function formatPhp(pricePhp: number): string {
  if (pricePhp <= 0) return 'Free';
  return `₱${pricePhp.toLocaleString('en-PH')}`;
}

export function sanitizeServerOwnedSkinIds(rawIds: unknown): TileSkinId[] {
  if (!Array.isArray(rawIds)) return ['classic'];
  const valid = rawIds.filter((id): id is TileSkinId => VALID_SKIN_IDS.has(String(id)));
  return Array.from(new Set<TileSkinId>(['classic', ...valid]));
}

export function sanitizeServerEquippedSkinId(
  rawId: unknown,
  verifiedOwnedSkinIds: TileSkinId[]
): TileSkinId {
  const candidate = typeof rawId === 'string' && VALID_SKIN_IDS.has(rawId) ? (rawId as TileSkinId) : 'classic';
  return verifiedOwnedSkinIds.includes(candidate) ? candidate : 'classic';
}

/**
 * Loads ONLY the non-sensitive Reduced Effects graphics preference.
 * Never reads or stores skin ownership or equipped premium skins in localStorage,
 * and proactively purges legacy v1/v2 keys so browser manipulation has zero effect.
 */
export function loadSkinPreferences(): PlayerSkinPreferences {
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fallback: PlayerSkinPreferences = {
    reducedEffects: prefersReduced,
  };

  try {
    window.localStorage.removeItem(LEGACY_SKIN_STORAGE_KEY_V1);
    window.localStorage.removeItem(LEGACY_SKIN_STORAGE_KEY_V2);

    const raw = window.localStorage.getItem(SKIN_PREFS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayerSkinPreferences>;

    return {
      reducedEffects:
        typeof parsed.reducedEffects === 'boolean' ? parsed.reducedEffects : prefersReduced,
    };
  } catch {
    return fallback;
  }
}

export function saveSkinPreferences(prefs: PlayerSkinPreferences): void {
  try {
    window.localStorage.setItem(
      SKIN_PREFS_STORAGE_KEY,
      JSON.stringify({
        reducedEffects: Boolean(prefs.reducedEffects),
      })
    );
  } catch {
    // Ignore storage restriction
  }
}

/**
 * Combines Reduced Effects preference with authoritative server-verified ownership and loadout.
 * Any skin not verified by the backend is strictly rejected and falls back to 'classic'.
 */
export function buildVerifiedSkinInventory(
  prefs: PlayerSkinPreferences,
  serverOwnedSkinIds: TileSkinId[],
  serverEquippedSkinId: TileSkinId
): PlayerSkinInventory {
  const owned = sanitizeServerOwnedSkinIds(serverOwnedSkinIds);
  const equipped = sanitizeServerEquippedSkinId(serverEquippedSkinId, owned);

  return {
    ownedSkinIds: owned,
    equippedSkinId: equipped,
    reducedEffects: prefs.reducedEffects,
  };
}

