import { AIDifficulty, GameMode, PlayerStats } from './types';

export const MAX_PLAYER_LEVEL = 300;
const PROFILE_STORAGE_KEY = 'block_clash_profile_v1';
const LEGACY_NICKNAME_KEY = 'block_clash_nickname_v1';

export type RankTierId =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'master'
  | 'grandmaster'
  | 'mythic';

export interface RankTierInfo {
  id: RankTierId;
  name: string;
  minLevel: number;
  maxLevel: number;
  primaryColor: string;
  secondaryColor: string;
  borderColor: string;
  bgColor: string;
  glowColor: string;
  animated: boolean;
  isPrismatic: boolean;
}

export const RANK_TIERS: RankTierInfo[] = [
  {
    id: 'bronze',
    name: 'Bronze Rookie',
    minLevel: 1,
    maxLevel: 29,
    primaryColor: '#E09F5A',
    secondaryColor: '#9A5B25',
    borderColor: '#CD7F32',
    bgColor: 'rgba(205, 127, 50, 0.14)',
    glowColor: 'rgba(205, 127, 50, 0.35)',
    animated: false,
    isPrismatic: false,
  },
  {
    id: 'silver',
    name: 'Silver Stacker',
    minLevel: 30,
    maxLevel: 59,
    primaryColor: '#E2E8F0',
    secondaryColor: '#94A3B8',
    borderColor: '#CBD5E1',
    bgColor: 'rgba(203, 213, 225, 0.14)',
    glowColor: 'rgba(203, 213, 225, 0.38)',
    animated: false,
    isPrismatic: false,
  },
  {
    id: 'gold',
    name: 'Gold Striker',
    minLevel: 60,
    maxLevel: 99,
    primaryColor: '#FDE047',
    secondaryColor: '#CA8A04',
    borderColor: '#FACC15',
    bgColor: 'rgba(250, 204, 21, 0.15)',
    glowColor: 'rgba(250, 204, 21, 0.48)',
    animated: false,
    isPrismatic: false,
  },
  {
    id: 'platinum',
    name: 'Platinum Tactician',
    minLevel: 100,
    maxLevel: 149,
    primaryColor: '#67E8F9',
    secondaryColor: '#06B6D4',
    borderColor: '#22D3EE',
    bgColor: 'rgba(34, 211, 238, 0.15)',
    glowColor: 'rgba(34, 211, 238, 0.55)',
    animated: false,
    isPrismatic: false,
  },
  {
    id: 'diamond',
    name: 'Diamond Blaster',
    minLevel: 150,
    maxLevel: 199,
    primaryColor: '#93C5FD',
    secondaryColor: '#2563EB',
    borderColor: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.18)',
    glowColor: 'rgba(59, 130, 246, 0.62)',
    animated: true,
    isPrismatic: false,
  },
  {
    id: 'master',
    name: 'Master Bombardier',
    minLevel: 200,
    maxLevel: 249,
    primaryColor: '#F0ABFC',
    secondaryColor: '#A855F7',
    borderColor: '#D946EF',
    bgColor: 'rgba(217, 70, 239, 0.18)',
    glowColor: 'rgba(217, 70, 239, 0.65)',
    animated: true,
    isPrismatic: false,
  },
  {
    id: 'grandmaster',
    name: 'Grandmaster Titan',
    minLevel: 250,
    maxLevel: 299,
    primaryColor: '#FCA5A5',
    secondaryColor: '#F59E0B',
    borderColor: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.18)',
    glowColor: 'rgba(245, 158, 11, 0.68)',
    animated: true,
    isPrismatic: false,
  },
  {
    id: 'mythic',
    name: 'Mythic Legend',
    minLevel: 300,
    maxLevel: 300,
    primaryColor: '#FFFFFF',
    secondaryColor: '#00F0FF',
    borderColor: '#00F0FF',
    bgColor: 'rgba(0, 240, 255, 0.16)',
    glowColor: 'rgba(217, 70, 239, 0.72)',
    animated: true,
    isPrismatic: true,
  },
];

export interface PlayerProfile {
  level: number;
  currentXP: number;
  totalXP: number;
  totalKOs: number;
  totalWins: number;
  totalMatches: number;
  nickname: string;
}

export interface MatchXPLineItem {
  id: string;
  label: string;
  detail: string;
  xp: number;
}

export interface MatchXPResult {
  beforeLevel: number;
  beforeXP: number;
  afterLevel: number;
  afterXP: number;
  totalEarnedXP: number;
  levelsGained: number;
  promotedToRank: RankTierInfo | null;
  breakdown: MatchXPLineItem[];
}

export function clampPlayerLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MAX_PLAYER_LEVEL, Math.floor(level)));
}

export function xpNeededForNextLevel(level: number): number {
  const lvl = clampPlayerLevel(level);
  if (lvl >= MAX_PLAYER_LEVEL) return 0;
  return Math.floor(100 + lvl * 25 + Math.pow(lvl, 1.35));
}

export function getRankTier(level: number): RankTierInfo {
  const lvl = clampPlayerLevel(level);
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (lvl >= RANK_TIERS[i].minLevel) return RANK_TIERS[i];
  }
  return RANK_TIERS[0];
}

export function getAIRivalLevel(difficulty: AIDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 15;
    case 'medium':
      return 72;
    case 'hard':
      return 165;
    case 'master':
      return 275;
  }
}

export function createDefaultProfile(): PlayerProfile {
  let initialName = 'Player';
  try {
    const legacy = window.localStorage.getItem(LEGACY_NICKNAME_KEY);
    if (legacy && legacy.trim()) {
      initialName = legacy.trim().slice(0, 16);
    }
  } catch {
    // Ignore storage restriction
  }
  return {
    level: 1,
    currentXP: 0,
    totalXP: 0,
    totalKOs: 0,
    totalWins: 0,
    totalMatches: 0,
    nickname: initialName,
  };
}

export function loadPlayerProfile(): PlayerProfile {
  const fallback = createDefaultProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const level = clampPlayerLevel(typeof parsed.level === 'number' ? parsed.level : 1);
    const maxXp = xpNeededForNextLevel(level);
    const rawCurrentXP = typeof parsed.currentXP === 'number' ? Math.max(0, Math.floor(parsed.currentXP)) : 0;
    const currentXP = level >= MAX_PLAYER_LEVEL ? 0 : Math.min(rawCurrentXP, Math.max(0, maxXp - 1));
    const nickname =
      typeof parsed.nickname === 'string' && parsed.nickname.trim().length > 0
        ? parsed.nickname.trim().slice(0, 16)
        : fallback.nickname;
    return {
      level,
      currentXP,
      totalXP: typeof parsed.totalXP === 'number' ? Math.max(0, Math.floor(parsed.totalXP)) : 0,
      totalKOs: typeof parsed.totalKOs === 'number' ? Math.max(0, Math.floor(parsed.totalKOs)) : 0,
      totalWins: typeof parsed.totalWins === 'number' ? Math.max(0, Math.floor(parsed.totalWins)) : 0,
      totalMatches:
        typeof parsed.totalMatches === 'number' ? Math.max(0, Math.floor(parsed.totalMatches)) : 0,
      nickname,
    };
  } catch {
    return fallback;
  }
}

export function savePlayerProfile(profile: PlayerProfile): void {
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    if (profile.nickname.trim()) {
      window.localStorage.setItem(LEGACY_NICKNAME_KEY, profile.nickname.trim().slice(0, 16));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function getWinMultiplier(mode: GameMode, difficulty: AIDifficulty): { mult: number; label: string } {
  if (mode === 'online_1v1') return { mult: 1.75, label: 'Online 1v1 ×1.75' };
  if (mode === 'local_2p') return { mult: 1.0, label: 'Local 2P ×1.0' };
  switch (difficulty) {
    case 'easy':
      return { mult: 1.0, label: 'Rookie AI ×1.0' };
    case 'medium':
      return { mult: 1.25, label: 'Challenger AI ×1.25' };
    case 'hard':
      return { mult: 1.5, label: 'Master AI ×1.5' };
    case 'master':
      return { mult: 2.0, label: 'Grandmaster AI ×2.0' };
  }
}

export function awardMatchXP(
  profile: PlayerProfile,
  params: {
    won: boolean;
    mode: GameMode;
    difficulty: AIDifficulty;
    stats: PlayerStats;
  }
): { nextProfile: PlayerProfile; xpResult: MatchXPResult } {
  const { won, mode, difficulty, stats } = params;
  const breakdown: MatchXPLineItem[] = [];

  // 1. Match Completion Base
  breakdown.push({
    id: 'base',
    label: 'Match Complete',
    detail: 'Base XP',
    xp: 50,
  });

  // 2. Victory Bonus scaled by opponent difficulty / online
  if (won) {
    const { mult, label } = getWinMultiplier(mode, difficulty);
    const winXP = Math.round(150 * mult);
    breakdown.push({
      id: 'win',
      label: 'Victory Bonus',
      detail: label,
      xp: winXP,
    });
  }

  // 3. Per KO Scored (+35 XP)
  if (stats.kos > 0) {
    breakdown.push({
      id: 'kos',
      label: 'KOs Scored',
      detail: `${stats.kos} × 35 XP`,
      xp: stats.kos * 35,
    });
  }

  // 4. Per Line Cleared (+5 XP)
  if (stats.linesCleared > 0) {
    breakdown.push({
      id: 'lines',
      label: 'Lines Cleared',
      detail: `${stats.linesCleared} × 5 XP`,
      xp: stats.linesCleared * 5,
    });
  }

  // 5. Bomb Chain Detonation Bonus (+15 XP per chain blast)
  const bombChains = stats.bombChains ?? 0;
  if (bombChains > 0) {
    breakdown.push({
      id: 'bombs',
      label: 'Bomb Chain Bonus',
      detail: `${bombChains} × 15 XP`,
      xp: bombChains * 15,
    });
  }

  // 6. Max Combo Bonus (+10 XP x highest combo)
  if (stats.maxCombo >= 2) {
    breakdown.push({
      id: 'combo',
      label: 'Max Combo Bonus',
      detail: `${stats.maxCombo}x × 10 XP`,
      xp: stats.maxCombo * 10,
    });
  }

  const totalEarnedXP = breakdown.reduce((acc, item) => acc + item.xp, 0);

  const beforeLevel = clampPlayerLevel(profile.level);
  const beforeXP = beforeLevel >= MAX_PLAYER_LEVEL ? 0 : profile.currentXP;
  const beforeRank = getRankTier(beforeLevel);

  let level = beforeLevel;
  let currentXP = beforeXP + totalEarnedXP;

  while (level < MAX_PLAYER_LEVEL) {
    const needed = xpNeededForNextLevel(level);
    if (currentXP >= needed) {
      currentXP -= needed;
      level += 1;
    } else {
      break;
    }
  }

  if (level >= MAX_PLAYER_LEVEL) {
    level = MAX_PLAYER_LEVEL;
    currentXP = 0;
  }

  const afterRank = getRankTier(level);
  const nextProfile: PlayerProfile = {
    ...profile,
    level,
    currentXP,
    totalXP: profile.totalXP + totalEarnedXP,
    totalKOs: profile.totalKOs + stats.kos,
    totalWins: profile.totalWins + (won ? 1 : 0),
    totalMatches: profile.totalMatches + 1,
  };

  savePlayerProfile(nextProfile);

  return {
    nextProfile,
    xpResult: {
      beforeLevel,
      beforeXP,
      afterLevel: level,
      afterXP: currentXP,
      totalEarnedXP,
      levelsGained: level - beforeLevel,
      promotedToRank: afterRank.id !== beforeRank.id ? afterRank : null,
      breakdown,
    },
  };
}
