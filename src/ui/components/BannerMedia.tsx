import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { loadBannerVideo } from '../../store/bannerVideo';
import { LOOK_GRADIENTS, useLook, type BannerKind, type BannerPos } from '../../store/look';

/** The video file as an object URL, loaded from IndexedDB once per mount. */
export function useBannerVideo(enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return setUrl(null);
    let made: string | null = null;
    let alive = true;
    void loadBannerVideo().then((blob) => {
      if (!alive || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [enabled]);
  return url;
}

/** The media of the banner: object-fit cover keeps the frame full at any zoom; position and zoom come from the editor. */
function mediaStyle(pos: BannerPos): CSSProperties {
  return { objectFit: 'cover', objectPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${pos.zoom})` };
}

interface BannerProps {
  kind: BannerKind;
  photo: string | null;
  video: string | null;
  pos: BannerPos;
  gradient: { from: string; to: string };
  className?: string;
  children?: React.ReactNode;
}

/** The banner shown on the profile (and in the editor preview). */
export function Banner({ kind, photo, video, pos, gradient, className = 'profile-banner', children }: BannerProps) {
  const bg: CSSProperties = { background: `linear-gradient(120deg, ${gradient.from}, ${gradient.to})` };
  return (
    <div className={`${className} banner-${kind}`} style={kind === 'gradient' || (kind === 'photo' && !photo) || (kind === 'video' && !video) ? bg : undefined}>
      {kind === 'photo' && photo && <img className="banner-media" src={photo} alt="" draggable={false} style={mediaStyle(pos)} />}
      {kind === 'video' && video && <video className="banner-media" src={video} autoPlay muted loop playsInline style={mediaStyle(pos)} />}
      {children}
    </div>
  );
}

/** Banner as it is set in the look store (loads the video itself). */
export function ProfileBanner({ children }: { children?: React.ReactNode }) {
  const { banner, bannerKind, bannerImage, bannerPos } = useLook();
  const video = useBannerVideo(bannerKind === 'video');
  return (
    <Banner
      kind={bannerKind}
      photo={bannerImage}
      video={video}
      pos={bannerPos}
      gradient={LOOK_GRADIENTS[banner % LOOK_GRADIENTS.length]}
    >
      {children}
    </Banner>
  );
}

/** Drag to move the picture behind the frame; the slider zooms it. */
export function BannerEditor({ kind, photo, video, pos, gradient, onChange }: {
  kind: BannerKind;
  photo: string | null;
  video: string | null;
  pos: BannerPos;
  gradient: { from: string; to: string };
  onChange: (p: BannerPos) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: BannerPos } | null>(null);
  const [active, setActive] = useState(false);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: pos };
    setActive(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const r = box.current?.getBoundingClientRect();
    if (!d || !r) return;
    // Dragging the picture right shows its left side: the focus point moves the other way.
    const x = clamp(d.start.x - ((e.clientX - d.x) / r.width) * 100 / d.start.zoom);
    const y = clamp(d.start.y - ((e.clientY - d.y) / r.height) * 100 / d.start.zoom);
    onChange({ ...pos, x, y });
  };
  const onUp = () => {
    drag.current = null;
    setActive(false);
  };
  return (
    <div className={`banner-editor ${active ? 'active' : ''}`} ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <Banner kind={kind} photo={photo} video={video} pos={pos} gradient={gradient} className="banner-preview" />
      <div className="banner-editor-hint">Перетащите, чтобы выбрать кадр</div>
      <div className="banner-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <span>−</span>
        <input type="range" min={1} max={3} step={0.01} value={pos.zoom} onChange={(e) => onChange({ ...pos, zoom: Number(e.target.value) })} aria-label="Zoom" />
        <span>+</span>
      </div>
    </div>
  );
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));
