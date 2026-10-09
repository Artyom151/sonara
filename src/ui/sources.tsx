import type { ComponentType, SVGProps } from 'react';
import type { Source } from '../core/types';
import { IconDeezer, IconSoundCloud, IconVK, IconYandexMusic, IconYouTube } from './icons';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Every music source: display name, logo and brand colour (Settings cell tint). */
export const SOURCES: Record<Source, { name: string; Icon: Icon; color: string }> = {
  soundcloud: { name: 'SoundCloud', Icon: IconSoundCloud, color: '#ff5500' },
  youtube: { name: 'YouTube', Icon: IconYouTube, color: '#ff0033' },
  deezer: { name: 'Deezer', Icon: IconDeezer, color: '#a238ff' },
  yandex: { name: 'Яндекс Музыка', Icon: IconYandexMusic, color: '#ffbc0d' },
  vk: { name: 'VK Музыка', Icon: IconVK, color: '#0077ff' },
};

export const SOURCE_ORDER: Source[] = ['soundcloud', 'youtube', 'deezer', 'yandex', 'vk'];

export const sourceName = (s: Source | 'local') => (s === 'local' ? '' : SOURCES[s].name);

export function SourceIcon({ source, size = 12 }: { source: Source | 'local'; size?: number }) {
  if (source === 'local') return null;
  const { Icon } = SOURCES[source];
  return <Icon size={size} />;
}
