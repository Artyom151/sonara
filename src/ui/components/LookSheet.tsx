import { useRef } from 'react';
import { photoDataUrl, videoDuration } from '../../account/image';
import { useAccount } from '../../account/store';
import { useLibrary } from '../../store/library';
import { FRAME_COUNT, LOOK_GRADIENTS, useLook } from '../../store/look';
import { clearBannerVideo, saveBannerVideo } from '../../store/bannerVideo';
import { useT } from '../i18n';
import { IconCamera, IconCheck, IconClose } from '../icons';
import { Avatar } from './Avatar';
import { BannerEditor, useBannerVideo } from './BannerMedia';
import { Sheet } from './controls';
import { toast } from './Toast';

const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 20;

/** Appearance of the profile: banner (gradient, photo or video), page background and avatar frame. */
export function LookSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { banner, bannerKind, bannerImage, bannerPos, background, frame, set } = useLook();
  const profile = useAccount((s) => s.profile);
  const recent = useLibrary((s) => s.recent);
  const hasArtwork = Boolean(recent[0]?.artworkLarge ?? recent[0]?.artwork);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const video = useBannerVideo(bannerKind === 'video');
  const gradient = LOOK_GRADIENTS[banner % LOOK_GRADIENTS.length];

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try {
      set({ bannerImage: await photoDataUrl(f), bannerKind: 'photo', bannerPos: { x: 50, y: 50, zoom: 1 } });
    } catch {
      toast(t('bannerPhotoError'));
    }
  };

  const pickVideo = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('video/') || f.size > MAX_VIDEO_BYTES) return toast(t('bannerVideoTooBig'));
    if ((await videoDuration(f)) > MAX_VIDEO_SECONDS) return toast(t('bannerVideoTooLong'));
    try {
      await saveBannerVideo(f);
      set({ bannerKind: 'video', bannerPos: { x: 50, y: 50, zoom: 1 } });
    } catch {
      toast(t('bannerVideoError'));
    }
  };

  const removeMedia = () => {
    void clearBannerVideo();
    set({ bannerKind: 'gradient', bannerImage: null, bannerPos: { x: 50, y: 50, zoom: 1 } });
  };

  return (
    <Sheet open onClose={onClose} title={t('appearance')}>
      <div className="look">
        <div className="look-label">{t('banner')}</div>
        <div className="look-row">
          <button className={`look-swatch look-photo ${bannerKind === 'photo' ? 'on' : ''}`} aria-label={t('bannerPhoto')} title={t('bannerPhoto')} onClick={() => photoInput.current?.click()}>
            {bannerKind === 'photo' && bannerImage ? <img src={bannerImage} alt="" /> : <IconCamera size={18} />}
          </button>
          <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <button className={`look-swatch look-video ${bannerKind === 'video' ? 'on' : ''}`} aria-label={t('bannerVideo')} title={t('bannerVideo')} onClick={() => videoInput.current?.click()}>
            <span>▶</span>
          </button>
          <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => void pickVideo(e.target.files?.[0])} />
          {LOOK_GRADIENTS.map((g, i) => {
            const on = bannerKind === 'gradient' && banner === i;
            return (
              <button
                key={i}
                className={`look-swatch ${on ? 'on' : ''}`}
                style={{ background: `linear-gradient(120deg, ${g.from}, ${g.to})` }}
                aria-label={`${t('banner')} ${i + 1}`}
                aria-pressed={on}
                onClick={() => set({ banner: i, bannerKind: 'gradient' })}
              >
                {on && <IconCheck size={16} />}
              </button>
            );
          })}
        </div>

        {bannerKind !== 'gradient' && (
          <>
            <BannerEditor
              kind={bannerKind}
              photo={bannerImage}
              video={video}
              pos={bannerPos}
              gradient={gradient}
              onChange={(p) => set({ bannerPos: p })}
            />
            <button className="look-remove" onClick={removeMedia}>
              <IconClose size={14} />
              <span>{t('bannerRemove')}</span>
            </button>
          </>
        )}

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
