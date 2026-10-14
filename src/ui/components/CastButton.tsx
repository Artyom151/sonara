import { useState } from 'react';
import { connect, disconnect, scan, useCast, type CastDevice } from '../../player/cast';
import { isAndroid } from '../../platform';
import { useT } from '../i18n';
import { IconCast } from '../icons';
import { Menu, type MenuItem } from './controls';

/**
 * Cast to a Chromecast. Android opens the system device picker; desktop lists the devices found on
 * the network in a menu. Hidden where casting is not available (web, iOS).
 */
export function CastButton({ className = 'ctl dim', size = 20 }: { className?: string; size?: number }) {
  const t = useT();
  const { supported, connected, devices, scanning } = useCast();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  if (!supported) return null;

  const open = async (rect: DOMRect) => {
    if (connected) return setAnchor(rect);
    if (isAndroid) return void connect();
    setAnchor(rect);
    void scan();
  };

  const items: MenuItem[] = [
    ...(connected ? [{ label: `${t('castingTo')} ${connected.name}`, checked: true }, { label: t('castStop'), onSelect: () => void disconnect() }] : []),
    ...(!connected
      ? scanning && !devices.length
        ? [{ label: t('castSearching') }]
        : devices.length
          ? devices.map((d: CastDevice) => ({ label: d.name, detail: d.model, onSelect: () => void connect(d) }))
          : [{ label: t('castNone') }, { label: t('castRescan'), onSelect: () => void scan() }]
      : []),
  ];

  return (
    <>
      <button className={`${className} ${connected ? 'on' : ''}`} aria-label={t('cast')} onClick={(e) => void open(e.currentTarget.getBoundingClientRect())}>
        <IconCast size={size} filled={!!connected} />
      </button>
      <Menu anchor={anchor} onClose={() => setAnchor(null)} items={items} />
    </>
  );
}
