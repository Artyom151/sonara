import { useState } from 'react';
import { usePlayer, type Repeat } from '../../store/player';
import { useT, type StrKey } from '../i18n';
import { IconRepeat } from '../icons';
import { Menu } from './controls';

const LABEL: Record<Repeat, StrKey> = { off: 'repeatOff', all: 'repeatAll', one: 'repeatOne' };

export function RepeatControl({ className, size = 19 }: { className: string; size?: number }) {
  const t = useT();
  const repeat = usePlayer((s) => s.repeat);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const select = (value: Repeat) => usePlayer.getState().patch({ repeat: value });
  return (
    <>
      <button
        className={`${className} ${repeat !== 'off' ? 'on' : ''}`}
        aria-label={`${t('repeat')}: ${t(LABEL[repeat])}`}
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      >
        <IconRepeat size={size} one={repeat === 'one'} />
      </button>
      <Menu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        items={(['off', 'all', 'one'] as Repeat[]).map((value) => ({
          label: t(LABEL[value]),
          icon: value === 'off' ? undefined : <IconRepeat size={size} one={value === 'one'} />,
          checked: repeat === value,
          onSelect: () => select(value),
        }))}
      />
    </>
  );
}
