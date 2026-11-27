import { AIDifficulty, PieceType, ThemeId } from './types';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 4;
export const TOTAL_ROWS = VISIBLE_ROWS + BUFFER_ROWS;

export const MATCH_DURATION_MS = 120_000; // 2 minutes
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const GARBAGE_TELEGRAPH_MS = 550;

// DAS / ARR timings for crisp arcade responsiveness
export const DAS_MS = 135;
export const ARR_MS = 32;
export const SOFT_DROP_INTERVAL_MS = 40;

export const ALL_PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Block Clash piece rotation matrices in 4 states (0: spawn, 1: R, 2: 2, 3: L)
// Coordinates are [colOffset, rowOffset] relative to active piece (x, y)
export const PIECE_SHAPES: Record<PieceType, Array<Array<[number, number]>>> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

// Piece pivot kick offsets [dx, dy] (note: +dy is DOWN in screen grid coordinates)
export const JLSTZ_KICKS: Record<string, Array<[number, number]>> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

export const I_KICKS: Record<string, Array<[number, number]>> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

// Base garbage sent per line clear count (index = lines cleared)
export const BASE_ATTACK_TABLE: Record<number, number> = {
  0: 0,
  1: 0,
  2: 1,
  3: 2,
  4: 4,
};

// Gravity interval (ms per row) based on player level & elapsed escalation
export function getGravityMs(level: number, elapsedMs: number, suddenDeath: boolean): number {
  if (suddenDeath) return 105;
  const timeBoost = Math.floor(elapsedMs / 35_000);
  const effectiveLevel = Math.max(1, level + timeBoost);
  const intervals = [760, 620, 500, 400, 320, 250, 195, 155, 125, 100, 82, 68];
  return intervals[Math.min(effectiveLevel - 1, intervals.length - 1)];
}

export interface AIProfile {
  label: string;
  tagline: string;
  actionIntervalMs: number; // Time between each step (rotate/shift)
  thinkDelayMs: number; // Delay after piece spawns before acting
  noise: number; // Random heuristic noise to simulate mistakes
  useHold: boolean;
  wellBonus: number;
  attackWeight: number;
}

export const AI_PROFILES: Record<AIDifficulty, AIProfile> = {
  easy: {
    label: 'Easy',
    tagline: 'Relaxed pace with occasional slips',
    actionIntervalMs: 215,
    thinkDelayMs: 360,
    noise: 9.0,
    useHold: false,
    wellBonus: 0,
    attackWeight: 0.75,
  },
  medium: {
    label: 'Medium',
    tagline: 'Clean stacks, holds & steady doubles',
    actionIntervalMs: 125,
    thinkDelayMs: 195,
    noise: 2.8,
    useHold: true,
    wellBonus: 0.45,
    attackWeight: 1.0,
  },
  hard: {
    label: 'Hard',
    tagline: 'Fast combo chains & smart counters',
    actionIntervalMs: 74,
    thinkDelayMs: 105,
    noise: 0.65,
    useHold: true,
    wellBonus: 1.0,
    attackWeight: 1.25,
  },
  master: {
    label: 'Master',
    tagline: 'Relentless Quad Smashes & pressure',
    actionIntervalMs: 42,
    thinkDelayMs: 55,
    noise: 0,
    useHold: true,
    wellBonus: 1.5,
    attackWeight: 1.5,
  },
};

export interface ThemePalette {
  id: ThemeId;
  name: string;
  subtitle: string;
  isDark: boolean;
  // Page / UI surfaces
  pageBg: string;
  surfaceBg: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentP1: string;
  accentP2: string;
  accentPrimary: string;
  accentPrimaryText: string;
  danger: string;
  warning: string;
  // Board canvas specifics
  boardBg: string;
  boardGridLine: string;
  boardTopLine: string;
  ghostAlpha: number;
  blockGlow: boolean;
  retroPattern: boolean;
  pieces: Record<PieceType | 'G' | 'B', { fill: string; light: string; dark: string; stroke: string }>;
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  neon: {
    id: 'neon',
    name: 'Neon Cyber',
    subtitle: 'High-contrast dark arcade cabinet',
    isDark: true,
    pageBg: '#070913',
    surfaceBg: '#0E1324',
    surfaceElevated: '#151C33',
    border: 'rgba(148, 163, 184, 0.16)',
    borderStrong: 'rgba(56, 189, 248, 0.35)',
    textPrimary: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#8896B0',
    accentP1: '#22D3EE',
    accentP2: '#FB7185',
    accentPrimary: '#22D3EE',
    accentPrimaryText: '#04121C',
    danger: '#F43F5E',
    warning: '#F59E0B',
    boardBg: '#090D1A',
    boardGridLine: 'rgba(148, 163, 184, 0.08)',
    boardTopLine: 'rgba(244, 63, 94, 0.45)',
    ghostAlpha: 0.28,
    blockGlow: true,
    retroPattern: false,
    pieces: {
      // Original Block Clash Signature Palette (distinct from standard falling-block color conventions)
      I: { fill: '#EC4899', light: '#F9A8D4', dark: '#9D174D', stroke: '#F472B6' }, // Plasma Magenta
      O: { fill: '#10B981', light: '#6EE7B7', dark: '#047857', stroke: '#34D399' }, // Electric Mint
      T: { fill: '#F59E0B', light: '#FDE68A', dark: '#B45309', stroke: '#FBBF24' }, // Solar Amber
      S: { fill: '#3B82F6', light: '#93C5FD', dark: '#1D4ED8', stroke: '#60A5FA' }, // Cobalt Sapphire
      Z: { fill: '#06B6D4', light: '#A5F3FC', dark: '#0E7490', stroke: '#22D3EE' }, // Arctic Cyan
      J: { fill: '#A855F7', light: '#E9D5FF', dark: '#6B21A8', stroke: '#C084FC' }, // Orchid Violet
      L: { fill: '#84CC16', light: '#D9F99D', dark: '#4D7C0F', stroke: '#A3E635' }, // Volt Lime
      G: { fill: '#334155', light: '#64748B', dark: '#0F172A', stroke: '#475569' }, // Armored Breach Alloy
      B: { fill: '#7C2D12', light: '#FDE047', dark: '#2A0B05', stroke: '#F59E0B' }, // Volatile Energy Core
    },
  },
  retro: {
    id: 'retro',
    name: 'Amber CRT',
    subtitle: 'Warm phosphor vector cabinet',
    isDark: true,
    pageBg: '#100B06',
    surfaceBg: '#1A120A',
    surfaceElevated: '#24190E',
    border: 'rgba(245, 158, 11, 0.22)',
    borderStrong: 'rgba(251, 191, 36, 0.48)',
    textPrimary: '#FEF3C7',
    textSecondary: '#FCD34D',
    textMuted: '#B48A4E',
    accentP1: '#FBBF24',
    accentP2: '#FB7185',
    accentPrimary: '#F59E0B',
    accentPrimaryText: '#140B04',
    danger: '#F43F5E',
    warning: '#FBBF24',
    boardBg: '#0B0704',
    boardGridLine: 'rgba(245, 158, 11, 0.11)',
    boardTopLine: 'rgba(244, 63, 94, 0.55)',
    ghostAlpha: 0.34,
    blockGlow: true,
    retroPattern: true,
    pieces: {
      I: { fill: '#F59E0B', light: '#FEF3C7', dark: '#78350F', stroke: '#FBBF24' },
      O: { fill: '#D97706', light: '#FDE68A', dark: '#6B2A06', stroke: '#F59E0B' },
      T: { fill: '#EA580C', light: '#FED7AA', dark: '#7C2D12', stroke: '#FB923C' },
      S: { fill: '#EAB308', light: '#FEF9C3', dark: '#713F12', stroke: '#FACC15' },
      Z: { fill: '#FB7185', light: '#FFE4E6', dark: '#881337', stroke: '#FDA4AF' },
      J: { fill: '#C2410C', light: '#FDBA74', dark: '#5C1B05', stroke: '#F97316' },
      L: { fill: '#CA8A04', light: '#FEF08A', dark: '#5C3D04', stroke: '#EAB308' },
      G: { fill: '#443222', light: '#927252', dark: '#1C130B', stroke: '#785A3D' },
      B: { fill: '#991B1B', light: '#FEF08A', dark: '#3B0808', stroke: '#FB923C' },
    },
  },
  modern: {
    id: 'modern',
    name: 'Clean Modern',
    subtitle: 'Crisp studio light precision',
    isDark: false,
    pageBg: '#F1F5F9',
    surfaceBg: '#FFFFFF',
    surfaceElevated: '#F8FAFC',
    border: 'rgba(15, 23, 42, 0.1)',
    borderStrong: 'rgba(15, 23, 42, 0.24)',
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    textMuted: '#64748B',
    accentP1: '#0D9488',
    accentP2: '#E11D48',
    accentPrimary: '#0F172A',
    accentPrimaryText: '#FFFFFF',
    danger: '#E11D48',
    warning: '#D97706',
    boardBg: '#FFFFFF',
    boardGridLine: 'rgba(15, 23, 42, 0.06)',
    boardTopLine: 'rgba(225, 29, 72, 0.35)',
    ghostAlpha: 0.26,
    blockGlow: false,
    retroPattern: false,
    pieces: {
      // Studio light adaptation of the Block Clash Signature Palette
      I: { fill: '#DB2777', light: '#FBCFE8', dark: '#9D174D', stroke: '#EC4899' }, // Plasma Magenta
      O: { fill: '#059669', light: '#A7F3D0', dark: '#065F46', stroke: '#10B981' }, // Electric Mint
      T: { fill: '#D97706', light: '#FDE68A', dark: '#92400E', stroke: '#F59E0B' }, // Solar Amber
      S: { fill: '#2563EB', light: '#BFDBFE', dark: '#1E40AF', stroke: '#3B82F6' }, // Cobalt Sapphire
      Z: { fill: '#0891B2', light: '#A5F3FC', dark: '#155E75', stroke: '#06B6D4' }, // Arctic Cyan
      J: { fill: '#7C3AED', light: '#DDD6FE', dark: '#5B21B6', stroke: '#8B5CF6' }, // Orchid Violet
      L: { fill: '#65A30D', light: '#D9F99D', dark: '#3F6212', stroke: '#84CC16' }, // Volt Lime
      G: { fill: '#475569', light: '#94A3B8', dark: '#1E293B', stroke: '#334155' }, // Armored Breach Alloy
      B: { fill: '#9A3412', light: '#FDE047', dark: '#431407', stroke: '#EA580C' }, // Volatile Energy Core
    },
  },
};
