import type { ComponentType, SVGProps } from 'react';
import type { Source } from '../core/types';
import { IconDeezer, IconSoundCloud, IconYandexMusic, IconYouTube } from './icons';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Every music source: display name, logo, brand background (Settings cell) and logo colour. */
export const SOURCES: Record<Source, { name: string; Icon: Icon; color: string; fg?: string }> = {
  soundcloud: { name: 'SoundCloud', Icon: IconSoundCloud, color: '#ff5500' },
  youtube: { name: 'YouTube', Icon: IconYouTube, color: '#ff0033' },
  deezer: { name: 'Deezer', Icon: IconDeezer, color: '#a238ff' },
  // Brand look: the yellow mark on black.
  yandex: { name: 'Яндекс Музыка', Icon: IconYandexMusic, color: '#000', fg: '#ffbc0d' },
};

export const SOURCE_ORDER: Source[] = ['soundcloud', 'youtube', 'deezer', 'yandex'];

export const sourceName = (s: Source | 'local') => (s === 'local' ? '' : SOURCES[s].name);

export function SourceIcon({ source, size = 12 }: { source: Source | 'local'; size?: number }) {
  if (source === 'local') return null;
  const { Icon } = SOURCES[source];
  return <Icon size={size} />;
}
