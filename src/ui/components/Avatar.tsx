import type { Profile } from '../../account/types';
import {
  IconBolt,
  IconCar,
  IconFlame,
  IconHeadphones,
  IconHeart,
  IconMoon,
  IconMusic,
  IconNote,
  IconRain,
  IconSparkles,
  IconWaveform,
  IconWind,
} from '../icons';

/** Built-in avatars: a gradient tile with an SF-style glyph. Stored as 'preset:<n>'. */
export const AVATAR_PRESETS: { from: string; to: string; Icon: (p: { size?: number; filled?: boolean }) => React.ReactNode }[] = [
  { from: '#8b5cf6', to: '#ec4899', Icon: IconNote },
  { from: '#0ea5e9', to: '#6366f1', Icon: IconHeadphones },
  { from: '#f97316', to: '#ef4444', Icon: IconFlame },
  { from: '#22c55e', to: '#0d9488', Icon: IconWaveform },
  { from: '#f59e0b', to: '#f43f5e', Icon: IconSparkles },
  { from: '#6366f1', to: '#0f172a', Icon: IconMoon },
  { from: '#facc15', to: '#f97316', Icon: IconBolt },
  { from: '#f43f5e', to: '#a21caf', Icon: IconHeart },
  { from: '#38bdf8', to: '#14b8a6', Icon: IconWind },
  { from: '#ef4444', to: '#7f1d1d', Icon: IconCar },
  { from: '#64748b', to: '#1e293b', Icon: IconRain },
  { from: '#a3e635', to: '#16a34a', Icon: IconMusic },
];

export function presetIndex(avatar?: string) {
  const m = avatar?.match(/^preset:(\d+)$/);
  return m ? Number(m[1]) % AVATAR_PRESETS.length : -1;
}

export function Avatar({ avatar, name, size = 40, className }: { avatar?: string; name?: string; size?: number; className?: string }) {
  const i = presetIndex(avatar);
  const style: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flex: 'none', overflow: 'hidden' };
  if (avatar && i < 0) return <img className={`avatar-img ${className ?? ''}`} src={avatar} alt={name ?? ''} style={{ ...style, objectFit: 'cover' }} draggable={false} />;
  const p = AVATAR_PRESETS[Math.max(0, i)];
  return (
    <span
      className={`avatar-preset ${className ?? ''}`}
      aria-label={name}
      style={{ ...style, display: 'grid', placeItems: 'center', color: '#fff', background: `linear-gradient(140deg, ${p.from}, ${p.to})` }}
    >
      <p.Icon size={Math.round(size * 0.46)} filled />
    </span>
  );
}

export const ProfileAvatar = ({ profile, size }: { profile: Pick<Profile, 'avatar' | 'displayName'>; size?: number }) => (
  <Avatar avatar={profile.avatar} name={profile.displayName} size={size} />
);
