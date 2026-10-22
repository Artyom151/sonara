import { Sheet } from './controls';
import { FRAME_COUNT, LOOK_GRADIENTS, useLook } from '../../store/look';
import { useAccount } from '../../account/store';
import { useLibrary } from '../../store/library';
import { useT } from '../i18n';
import { IconCheck } from '../icons';
import { Avatar } from './Avatar';

/** Appearance of the profile: banner, page background and avatar frame. */
export function LookSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { banner, background, frame, set } = useLook();
  const profile = useAccount((s) => s.profile);
  const recent = useLibrary((s) => s.recent);
  const hasArtwork = Boolean(recent[0]?.artworkLarge ?? recent[0]?.artwork);

  return (
    <Sheet open onClose={onClose} title={t('appearance')}>
      <div className="look">
        <div className="look-label">{t('banner')}</div>
        <div className="look-row">
          {LOOK_GRADIENTS.map((g, i) => (
            <button
              key={i}
              className={`look-swatch ${banner === i ? 'on' : ''}`}
              style={{ background: `linear-gradient(120deg, ${g.from}, ${g.to})` }}
              aria-label={`${t('banner')} ${i + 1}`}
              aria-pressed={banner === i}
              onClick={() => set({ banner: i })}
            >
              {banner === i && <IconCheck size={16} />}
            </button>
          ))}
        </div>

        <div className="look-label">{t('background')}</div>
        <div className="look-row">
          <button
            className={`look-swatch look-art ${background === 'artwork' ? 'on' : ''}`}
            disabled={!hasArtwork}
            aria-pressed={background === 'artwork'}
            onClick={() => set({ background: 'artwork' })}
          >
            {background === 'artwork' && <IconCheck size={16} />}
          </button>
          {LOOK_GRADIENTS.map((g, i) => (
            <button
              key={i}
              className={`look-swatch ${background === i ? 'on' : ''}`}
              style={{ background: `linear-gradient(180deg, ${g.from}, ${g.to})` }}
              aria-label={`${t('background')} ${i + 1}`}
              aria-pressed={background === i}
              onClick={() => set({ background: i })}
            >
              {background === i && <IconCheck size={16} />}
            </button>
          ))}
        </div>
        <div className="look-hint">{hasArtwork ? t('backgroundHint') : t('backgroundNeedsTrack')}</div>

        <div className="look-label">{t('frame')}</div>
        <div className="look-row look-frames">
          {Array.from({ length: FRAME_COUNT }, (_, i) => (
            <button key={i} className={`look-frame-pick frame-${i} ${frame === i ? 'on' : ''}`} aria-pressed={frame === i} onClick={() => set({ frame: i })}>
              <div className="profile-frame">
                <Avatar avatar={profile?.avatar} name={profile?.displayName} size={52} />
              </div>
              <span>{i === 0 ? t('frameNone') : `${i}`}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
