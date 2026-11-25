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

// SRS standard piece shapes in 4 rotation states (0: spawn, 1: R, 2: 2, 3: L)
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

// SRS Wall Kick offsets [dx, dy] (note: +dy is DOWN in screen grid coordinates)
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
      I: { fill: '#06B6D4', light: '#67E8F9', dark: '#0E7490', stroke: '#22D3EE' },
      O: { fill: '#EAB308', light: '#FEF08A', dark: '#A16207', stroke: '#FACC15' },
      T: { fill: '#A855F7', light: '#D8B4FE', dark: '#6B21A8', stroke: '#C084FC' },
      S: { fill: '#22C55E', light: '#86EFAC', dark: '#15803D', stroke: '#4ADE80' },
      Z: { fill: '#F43F5E', light: '#FDA4AF', dark: '#BE123C', stroke: '#FB7185' },
      J: { fill: '#3B82F6', light: '#93C5FD', dark: '#1D4ED8', stroke: '#60A5FA' },
      L: { fill: '#F97316', light: '#FDBA74', dark: '#C2410C', stroke: '#FB923C' },
      G: { fill: '#475569', light: '#64748B', dark: '#1E293B', stroke: '#94A3B8' },
      B: { fill: '#991B1B', light: '#FB923C', dark: '#450A0A', stroke: '#F97316' },
    },
  },
  retro: {
    id: 'retro',
    name: 'Retro Handheld',
    subtitle: 'Classic 4-shade dot-matrix LCD',
    isDark: false,
    pageBg: '#B8C496',
    surfaceBg: '#C8D3A8',
    surfaceElevated: '#D3DDB7',
    border: 'rgba(31, 41, 24, 0.25)',
    borderStrong: 'rgba(31, 41, 24, 0.65)',
    textPrimary: '#1A2314',
    textSecondary: '#303D24',
    textMuted: '#4C5A3B',
    accentP1: '#1A2314',
    accentP2: '#3B482B',
    accentPrimary: '#1A2314',
    accentPrimaryText: '#D3DDB7',
    danger: '#7A271A',
    warning: '#69410C',
    boardBg: '#CBD6AE',
    boardGridLine: 'rgba(31, 41, 24, 0.09)',
    boardTopLine: 'rgba(31, 41, 24, 0.4)',
    ghostAlpha: 0.34,
    blockGlow: false,
    retroPattern: true,
    pieces: {
      I: { fill: '#304022', light: '#9AA876', dark: '#1A2314', stroke: '#1A2314' },
      O: { fill: '#1A2314', light: '#6B7A4D', dark: '#11180D', stroke: '#1A2314' },
      T: { fill: '#465632', light: '#B0BD8D', dark: '#1A2314', stroke: '#1A2314' },
      S: { fill: '#5D6E43', light: '#B0BD8D', dark: '#233018', stroke: '#1A2314' },
      Z: { fill: '#2B3A1E', light: '#879663', dark: '#141D0E', stroke: '#1A2314' },
      J: { fill: '#3A4A28', light: '#A0AE7E', dark: '#1A2314', stroke: '#1A2314' },
      L: { fill: '#52633B', light: '#BCC99A', dark: '#1F2A16', stroke: '#1A2314' },
      G: { fill: '#7B8A5C', light: '#99A878', dark: '#304022', stroke: '#1A2314' },
      B: { fill: '#7A271A', light: '#F59E0B', dark: '#1A2314', stroke: '#1A2314' },
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
    accentP1: '#0284C7',
    accentP2: '#E11D48',
    accentPrimary: '#0F172A',
    accentPrimaryText: '#FFFFFF',
    danger: '#E11D48',
    warning: '#D97706',
    boardBg: '#FFFFFF',
    boardGridLine: 'rgba(15, 23, 42, 0.06)',
    boardTopLine: 'rgba(225, 29, 72, 0.35)',
    ghostAlpha: 0.25,
    blockGlow: false,
    retroPattern: false,
    pieces: {
      I: { fill: '#0284C7', light: '#7DD3FC', dark: '#0369A1', stroke: '#0EA5E9' },
      O: { fill: '#D97706', light: '#FDE68A', dark: '#B45309', stroke: '#F59E0B' },
      T: { fill: '#7C3AED', light: '#DDD6FE', dark: '#5B21B6', stroke: '#8B5CF6' },
      S: { fill: '#059669', light: '#A7F3D0', dark: '#047857', stroke: '#10B981' },
      Z: { fill: '#E11D48', light: '#FECDD3', dark: '#BE123C', stroke: '#F43F5E' },
      J: { fill: '#2563EB', light: '#BFDBFE', dark: '#1D4ED8', stroke: '#3B82F6' },
      L: { fill: '#EA580C', light: '#FED7AA', dark: '#C2410C', stroke: '#F97316' },
      G: { fill: '#64748B', light: '#94A3B8', dark: '#475569', stroke: '#475569' },
      B: { fill: '#991B1B', light: '#F97316', dark: '#450A0A', stroke: '#EA580C' },
    },
  },
};
