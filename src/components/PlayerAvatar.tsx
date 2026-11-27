import React from 'react';
import {
  Crown,
  Flame,
  Hexagon,
  Shield,
  Sparkles,
  Star,
  Target,
  Zap,
} from 'lucide-react';
import { getAvatarPreset } from '../game/auth';

interface PlayerAvatarProps {
  avatarId?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  avatarId,
  size = 'md',
  className = '',
}) => {
  const preset = getAvatarPreset(avatarId);

  const boxClass =
    size === 'xs'
      ? 'w-7 h-7 rounded-md'
      : size === 'sm'
        ? 'w-9 h-9 rounded-lg'
        : size === 'lg'
          ? 'w-14 h-14 rounded-xl'
          : 'w-11 h-11 rounded-xl';

  const iconClass =
    size === 'xs'
      ? 'w-3.5 h-3.5'
      : size === 'sm'
        ? 'w-4 h-4'
        : size === 'lg'
          ? 'w-7 h-7'
          : 'w-5 h-5';

  const renderGlyph = () => {
    switch (preset.glyph) {
      case 'hex':
        return <Hexagon className={iconClass} style={{ color: preset.primary }} />;
      case 'bolt':
        return <Zap className={iconClass} style={{ color: preset.primary }} />;
      case 'flame':
        return <Flame className={iconClass} style={{ color: preset.primary }} />;
      case 'shield':
        return <Shield className={iconClass} style={{ color: preset.primary }} />;
      case 'star':
        return <Star className={iconClass} style={{ color: preset.primary }} />;
      case 'target':
        return <Target className={iconClass} style={{ color: preset.primary }} />;
      case 'crown':
        return <Crown className={iconClass} style={{ color: preset.primary }} />;
      case 'prism':
        return <Sparkles className={iconClass} style={{ color: preset.primary }} />;
    }
  };

  return (
    <div
      className={`relative border flex items-center justify-center shrink-0 overflow-hidden ${boxClass} ${className}`}
      style={{
        backgroundColor: preset.bg,
        borderColor: preset.primary,
        backgroundImage: `linear-gradient(135deg, ${preset.primary}28 0%, ${preset.secondary}22 100%)`,
        boxShadow: `inset 0 1px 0 ${preset.primary}44`,
      }}
      title={preset.label}
    >
      {renderGlyph()}
    </div>
  );
};
