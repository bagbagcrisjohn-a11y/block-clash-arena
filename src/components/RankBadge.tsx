import React from 'react';
import { Award, Crown, Flame, Gem, Hexagon, Shield, Sparkles, Star } from 'lucide-react';
import { ThemePalette } from '../game/constants';
import {
  getRankTier,
  MAX_PLAYER_LEVEL,
  PlayerProfile,
  RankTierInfo,
  xpNeededForNextLevel,
} from '../game/progression';

interface RankEmblemIconProps {
  tier: RankTierInfo;
  className?: string;
}

export const RankEmblemIcon: React.FC<RankEmblemIconProps> = ({ tier, className = 'w-3.5 h-3.5' }) => {
  switch (tier.id) {
    case 'bronze':
      return <Shield className={className} style={{ color: tier.primaryColor }} />;
    case 'silver':
      return <Award className={className} style={{ color: tier.primaryColor }} />;
    case 'gold':
      return <Star className={className} style={{ color: tier.primaryColor }} />;
    case 'platinum':
      return <Hexagon className={className} style={{ color: tier.primaryColor }} />;
    case 'diamond':
      return <Gem className={className} style={{ color: tier.primaryColor }} />;
    case 'master':
      return <Flame className={className} style={{ color: tier.primaryColor }} />;
    case 'grandmaster':
      return <Crown className={className} style={{ color: tier.secondaryColor }} />;
    case 'mythic':
      return <Crown className={className} style={{ color: '#FEF08A' }} />;
  }
};

interface RankBadgeProps {
  level: number;
  size?: 'xs' | 'sm' | 'md';
  showRankName?: boolean;
}

export const RankBadge: React.FC<RankBadgeProps> = ({
  level,
  size = 'sm',
  showRankName = false,
}) => {
  const tier = getRankTier(level);
  const isMax = level >= MAX_PLAYER_LEVEL;

  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[9px] gap-1'
      : size === 'sm'
        ? 'px-2 py-0.5 text-[10px] gap-1'
        : 'px-2.5 py-1 text-xs gap-1.5';

  const iconClass = size === 'xs' ? 'w-2.5 h-2.5' : size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`inline-flex items-center rounded-md border font-mono-num font-bold tracking-wide whitespace-nowrap shrink-0 ${sizeClass} ${
        tier.isPrismatic ? 'rank-mythic-badge' : tier.animated ? 'rank-animated-badge' : ''
      }`}
      style={{
        backgroundColor: tier.bgColor,
        borderColor: tier.borderColor,
        color: tier.primaryColor,
        boxShadow:
          tier.minLevel >= 60 ? `0 0 10px ${tier.glowColor}` : 'none',
      }}
      title={`Level ${level} • ${tier.name}`}
    >
      <RankEmblemIcon tier={tier} className={iconClass} />
      <span>{isMax ? 'LVL 300 MAX' : `LVL ${level}`}</span>
      {showRankName && (
        <span className="font-sans font-semibold opacity-95 uppercase tracking-wider">
          · {tier.name}
        </span>
      )}
    </span>
  );
};

interface PlayerLevelCardProps {
  profile: PlayerProfile;
  theme: ThemePalette;
  isSignedIn?: boolean;
  onOpenAccount?: () => void;
}

export const PlayerLevelCard: React.FC<PlayerLevelCardProps> = ({
  profile,
  theme,
  isSignedIn = false,
  onOpenAccount,
}) => {
  const tier = getRankTier(profile.level);
  const isMax = profile.level >= MAX_PLAYER_LEVEL;
  const needed = xpNeededForNextLevel(profile.level);
  const pct = isMax ? 100 : needed > 0 ? Math.min(100, Math.round((profile.currentXP / needed) * 100)) : 0;

  return (
    <div
      className={`w-full rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
        tier.isPrismatic ? 'rank-mythic-border' : ''
      }`}
      style={{
        backgroundColor: theme.surfaceBg,
        borderColor: tier.minLevel >= 60 ? tier.borderColor : theme.borderStrong,
        boxShadow: tier.minLevel >= 60 && theme.blockGlow ? `0 0 22px ${tier.glowColor}` : 'none',
      }}
    >
      {/* Left: Emblem + Level & Rank Name */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
            tier.isPrismatic ? 'rank-mythic-badge' : tier.animated ? 'rank-animated-badge' : ''
          }`}
          style={{
            backgroundColor: tier.bgColor,
            borderColor: tier.borderColor,
            boxShadow: tier.minLevel >= 60 ? `0 0 14px ${tier.glowColor}` : 'none',
          }}
        >
          <RankEmblemIcon tier={tier} className="w-5 h-5" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-display text-sm sm:text-base font-bold tracking-wide"
              style={{ color: tier.primaryColor }}
            >
              {isMax ? 'LVL 300 MAX' : `LVL ${profile.level}`} · {tier.name.toUpperCase()}
            </span>
            {tier.isPrismatic && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#FEF08A]">
                <Sparkles className="w-3 h-3" />
                PRISMATIC TRAIL
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono-num flex items-center gap-2 flex-wrap" style={{ color: theme.textMuted }}>
            <span style={{ color: theme.textPrimary }}>{profile.nickname}</span>
            {isSignedIn && profile.publicPlayerId ? (
              <>
                <span>·</span>
                <span style={{ color: theme.accentPrimary }}>{profile.publicPlayerId}</span>
              </>
            ) : (
              <>
                <span>·</span>
                <span>Local Guest</span>
              </>
            )}
            <span>·</span>
            <span>{profile.totalWins} Wins</span>
            <span>·</span>
            <span>{profile.totalKOs} KOs</span>
            {onOpenAccount && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="underline underline-offset-2 font-sans font-semibold cursor-pointer"
                  style={{ color: theme.accentPrimary }}
                >
                  {isSignedIn ? 'Manage Profile' : 'Sign In to Sync'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Animated XP Progress Bar */}
      <div className="w-full sm:w-64 shrink-0 flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] font-mono-num">
          <span style={{ color: theme.textMuted }}>
            {isMax ? 'MAX RANK ACHIEVED' : `NEXT: LVL ${profile.level + 1}`}
          </span>
          <span className="font-bold" style={{ color: tier.primaryColor }}>
            {isMax ? 'MAX' : `${profile.currentXP.toLocaleString()} / ${needed.toLocaleString()} XP`}
          </span>
        </div>
        <div
          className="w-full h-2.5 rounded-sm overflow-hidden border"
          style={{
            backgroundColor: theme.boardBg,
            borderColor: theme.border,
          }}
        >
          <div
            className={`h-full transition-all duration-500 ease-out ${
              tier.isPrismatic ? 'rank-mythic-bar' : ''
            }`}
            style={{
              width: `${pct}%`,
              background: tier.isPrismatic
                ? undefined
                : `linear-gradient(90deg, ${tier.secondaryColor}, ${tier.primaryColor})`,
              boxShadow: tier.minLevel >= 60 ? `0 0 10px ${tier.glowColor}` : 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
};
