import { isDownloaded, offlineArtUrl } from '../../player/offline';
import { animate, AnimatePresence, motion, useDragControls, useMotionValue, useReducedMotion, useSpring, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight } from '../icons';
import { MENU_CONTENT_SPRING, MENU_SPRING } from '../glass/sdk';
import { refreshGlass } from '../glass/liquid';
import { needsNativeArtwork, proxiedArtwork } from '../artwork';

const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;
const softSpring = { type: 'spring', stiffness: 380, damping: 32 } as const;

/* Toggle (iOS 26)
   A wide capsule; while pressed the white knob turns into a clear glass lens
   that magnifies, then settles back to a solid knob. Draggable. */
export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const W = 63;
  const KW = 39;
  const travel = W - KW - 4;
  const [pressed, setPressed] = useState(false);
  const x = useMotionValue(checked ? travel : 0);
  const sx = useSpring(x, { stiffness: 600, damping: 36 });
  const dragged = useRef(false);

  useEffect(() => x.set(checked ? travel : 0), [checked, travel, x]);

  const fill = useTransform(sx, [0, travel], [0, 1]);

  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="toggle"
      style={{ opacity: disabled ? 0.4 : 1 }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setPressed(true);
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        if (!pressed) return;
        const r = e.currentTarget.getBoundingClientRect();
        const pos = Math.min(travel, Math.max(0, e.clientX - r.left - KW / 2 - 2));
        if (Math.abs(pos - x.get()) > 3) dragged.current = true;
        if (dragged.current) x.set(pos);
      }}
      onPointerUp={() => {
        setPressed(false);
        const next = dragged.current ? x.get() > travel / 2 : !checked;
        x.set(next ? travel : 0);
        if (next !== checked) onChange(next);
      }}
      onPointerCancel={() => {
        setPressed(false);
        x.set(checked ? travel : 0);
      }}
    >
      <span className="toggle-track">
        <motion.span className="toggle-fill" style={{ opacity: fill }} />
      </span>
      <motion.span
        className={`toggle-knob ${pressed ? 'lens' : ''}`}
        style={{ x: sx }}
        animate={{ scale: pressed ? 1.32 : 1, width: pressed ? KW + 6 : KW }}
        transition={spring}
      />
    </button>
  );
}

/* Segmented control */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const [pressed, setPressed] = useState(false);
  return (
    <div className={`segmented glass ${className}`} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}>
      <motion.div
        className="seg-lens"
        animate={{ left: `calc(${(idx * 100) / options.length}% + 3px)`, scale: pressed ? 1.08 : 1 }}
        style={{ width: `calc(${100 / options.length}% - 6px)` }}
        transition={softSpring}
      />
      {options.map((o) => (
        <button key={o.value} className={`seg ${o.value === value ? 'on' : ''}`} title={o.title} aria-label={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Pull-down menu (iOS 26 glass) */
export interface MenuItem {
  label: string;
  icon?: ReactNode;
  checked?: boolean;
  destructive?: boolean;
  onSelect?: () => void;
  separatorBefore?: boolean;
  children?: MenuItem[];
  detail?: string;
}

interface MenuPos {
  left: number;
  top: number;
  origin: string;
  maxH: number;
  scaleX: number;
  scaleY: number;
}

function MenuSurface({
  anchor,
  items,
  title,
  nested = false,
  direction,
  selected,
  onClose,
  onBack,
  onOpen,
}: {
  anchor: DOMRect;
  items: MenuItem[];
  title?: string;
  nested?: boolean;
  direction: 1 | -1;
  selected?: string;
  onClose: () => void;
  onBack?: () => void;
  onOpen: (item: MenuItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = systemReducedMotion || document.documentElement.dataset.reduceMotion === '1';
  const scaleX = useMotionValue(0.1);
  const scaleY = useMotionValue(0.1);
  const directionX = useMotionValue(1);
  const directionY = useMotionValue(1);
  const morphDepth = useMotionValue(0);
  const openingRotateX = useTransform(scaleY, (scale) => directionY.get() * (1 - scale) * 0.16);
  const openingRotateY = useTransform(scaleX, (scale) => directionX.get() * (1 - scale) * -0.16);
  const rotateX = useTransform([openingRotateX, morphDepth], ([opening, morph]: number[]) => opening + morph);
  const rotateY = useTransform([openingRotateY, morphDepth], ([opening, morph]: number[]) => opening - morph * 0.7);
  const z = useTransform([scaleX, scaleY], ([x, y]: number[]) => (1 - Math.min(x, y)) * 16);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const width = ref.current.offsetWidth;
    const height = ref.current.offsetHeight;
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    const vh = vv?.height ?? window.innerHeight;
    const margin = 12;
    const gap = 8;
    const spaceBelow = vh - anchor.bottom - gap - margin;
    const spaceAbove = anchor.top - gap - margin;
    const below = height <= spaceBelow || spaceBelow >= spaceAbove;
    const maxH = Math.max(120, below ? spaceBelow : spaceAbove);
    const top = below ? anchor.bottom + gap : anchor.top - gap - Math.min(height, maxH);
    const alignRight = anchor.left + anchor.width / 2 > vw / 2;
    const clampedWidth = Math.min(width, vw - margin * 2);
    const left = Math.min(vw - clampedWidth - margin, Math.max(margin, alignRight ? anchor.right - clampedWidth : anchor.left));
    const origin = `${alignRight ? 'right' : 'left'} ${below ? 'top' : 'bottom'}`;
    const next = { left, top, origin, maxH, scaleX: Math.min(1, anchor.width / Math.max(1, width)), scaleY: Math.min(1, anchor.height / Math.max(1, height)) };
    directionX.set(alignRight ? -1 : 1);
    directionY.set(below ? 1 : -1);
    scaleX.set(next.scaleX);
    scaleY.set(next.scaleY);
    setPos(next);
    if (reducedMotion) {
      scaleX.set(1);
      scaleY.set(1);
      return;
    }
    const x = animate(scaleX, 1, MENU_SPRING);
    const y = animate(scaleY, 1, MENU_SPRING);
    return () => {
      x.stop();
      y.stop();
    };
  }, [anchor, reducedMotion, scaleX, scaleY]);

  useLayoutEffect(() => {
    if (!ref.current || !pos) return;
    const viewport = window.visualViewport;
    const margin = 12;
    const height = ref.current.offsetHeight;
    const vh = viewport?.height ?? window.innerHeight;
    const top = Math.max(margin, Math.min(pos.top, vh - height - margin));
    if (top !== pos.top) setPos((current) => current ? { ...current, top } : current);
  }, [title]);

  useLayoutEffect(() => {
    if (reducedMotion || !title) return;
    morphDepth.set(direction * 0.055);
    const depth = animate(morphDepth, 0, MENU_CONTENT_SPRING);
    return () => depth.stop();
  }, [title, direction, reducedMotion, morphDepth]);

  useEffect(() => setHovered(null), [title]);
  const hoverProps = (index: number) => ({
    onPointerMove: (e: React.PointerEvent) => e.pointerType === 'mouse' && setHovered(index),
    onPointerLeave: () => setHovered((current) => current === index ? null : current),
    onFocus: () => setHovered(index),
    onBlur: () => setHovered((current) => current === index ? null : current),
  });

  return (
    <motion.div
      ref={ref}
      className="menu glass refract"
      role="menu"
      tabIndex={-1}
      layout={!reducedMotion}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, transformOrigin: pos?.origin, transformPerspective: 900, scaleX, scaleY, rotateX, rotateY, z }}
      initial={false}
      exit={{ scaleX: reducedMotion ? 1 : pos?.scaleX ?? 0.2, scaleY: reducedMotion ? 1 : pos?.scaleY ?? 0.2, transition: { duration: reducedMotion ? 0 : 0.16 } }}
      transition={MENU_SPRING}
      onLayoutAnimationComplete={() => {
        // The spring settles the box: re-measure so the mask matches the final size exactly.
        if (ref.current) refreshGlass(ref.current);
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerLeave={() => setHovered(null)}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={title ?? 'root'}
          className="menu-scroll"
          style={{ maxHeight: pos?.maxH }}
          initial={{ opacity: 0, x: reducedMotion ? 0 : direction * 28, scale: reducedMotion ? 1 : 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: reducedMotion ? 0 : direction * -20, scale: reducedMotion ? 1 : 0.985, transition: { duration: reducedMotion ? 0 : 0.14 } }}
          transition={MENU_CONTENT_SPRING}
        >
          {nested && onBack && (
            <>
              <button className={`menu-item menu-back ${hovered === -1 ? 'active' : ''}`} role="menuitem" onClick={onBack} {...hoverProps(-1)}>
                <motion.span className="menu-row-highlight" layoutId={reducedMotion ? undefined : 'menu-active-row'} transition={MENU_SPRING} />
                <span className="menu-check"><IconChevronLeft size={15} /></span>
                <span className="menu-label">{title}</span>
              </button>
              <div className="menu-sep" />
            </>
          )}
          {items.map((item, i) => (
            <div key={`${title ?? ''}${i}`}>
              {item.separatorBefore && <div className="menu-sep" />}
              <button
                className={`menu-item ${item.destructive ? 'destructive' : ''} ${hovered === i ? 'active' : ''}`}
                role="menuitem"
                aria-haspopup={item.children ? 'menu' : undefined}
                {...hoverProps(i)}
                onClick={() => {
                  if (item.children) return onOpen(item);
                  onClose();
                  item.onSelect?.();
                }}
              >
                {selected === item.label && <motion.span className="menu-row-highlight" layoutId={reducedMotion ? undefined : 'menu-active-row'} transition={MENU_SPRING} />}
                <span className="menu-check">{item.checked && <IconCheck size={15} />}</span>
                <span className="menu-label">
                  {item.label}
                  {item.detail && <small className="menu-detail">{item.detail}</small>}
                </span>
                {item.children ? <span className="menu-icon"><IconChevronRight size={15} /></span> : item.icon && <span className="menu-icon">{item.icon}</span>}
              </button>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

export function Menu({ anchor, items, onClose }: { anchor: DOMRect | null; items: MenuItem[]; onClose: () => void }) {
  const [sub, setSub] = useState<MenuItem | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const back = () => {
    setDirection(-1);
    setSub(null);
  };
  useEffect(() => {
    if (!anchor) setSub(null);
  }, [anchor]);
  useEffect(() => {
    if (!anchor) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (sub) back();
      else onClose();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [anchor, sub, onClose]);

  return createPortal(
    <AnimatePresence>
      {anchor && (
        <motion.div className="menu-scrim" exit={{ x: 0, transition: { duration: 0.16 } }} onClick={onClose}>
          <MenuSurface
            key="root"
            anchor={anchor}
            items={sub?.children ?? items}
            title={sub?.label}
            nested={!!sub}
            direction={direction}
            selected={sub?.label}
            onClose={onClose}
            onBack={sub ? back : undefined}
            onOpen={(item) => {
              setDirection(1);
              setSub(item);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** A cell-style dropdown: shows the current value and opens a glass pull-down menu. */
export function Select<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button className={`select-btn ${anchor ? 'open' : ''}`} aria-expanded={!!anchor} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        <span>{current?.label}</span>
        <IconChevronDown size={13} style={{ opacity: 0.7 }} />
      </button>
      <Menu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        items={options.map((o) => ({ label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) }))}
      />
    </>
  );
}

/* Slider (iOS 26: knob turns into a lens while dragging) */
export function Slider({
  value,
  min = 0,
  max = 1,
  step = 0,
  onChange,
  left,
  right,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;
  const set = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    let v = min + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (max - min);
    if (step) v = Math.round(v / step) * step;
    onChange(v);
  };
  return (
    <div className="slider">
      {left}
      <div
        ref={track}
        className={`slider-track ${active ? 'active' : ''}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(true);
          set(e.clientX);
        }}
        onPointerMove={(e) => active && set(e.clientX)}
        onPointerUp={() => setActive(false)}
        onPointerCancel={() => setActive(false)}
      >
        <div className="slider-rail">
          <div className="slider-fill" style={{ width: `${pct}%` }} />
        </div>
        <motion.div className={`slider-knob ${active ? 'lens' : ''}`} style={{ left: `${pct}%` }} animate={{ scale: active ? 1.5 : 1 }} transition={spring} />
      </div>
      {right}
    </div>
  );
}

/* Sheet */
export function Sheet({ open, onClose, children, title, full }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; full?: boolean }) {
  const sheetDrag = useDragControls();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        // Scrims fade their colour, never opacity: an animated opacity makes the glass inside a
        // backdrop root, which then shows no blur until the animation ends.
        <motion.div className="sheet-scrim" initial={{ backgroundColor: 'rgba(0,0,0,0)' }} animate={{ backgroundColor: 'rgba(0,0,0,0.55)' }} exit={{ backgroundColor: 'rgba(0,0,0,0)' }} onClick={onClose}>
          <motion.div
            className={`sheet glass dark ${full ? 'full' : ''}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={sheetDrag}
            onPointerDown={(e) => !(e.target as HTMLElement).closest('.sheet-body') && sheetDrag.start(e)}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.9 }}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-inner">
              {/* Drag handle: the grabber and the title. touch-action: none keeps the browser from
                  claiming the touch for scrolling, which cancelled the drag on phones. */}
              <div className="sheet-handle">
                <div className="grabber" />
                {title && <div className="sheet-title">{title}</div>}
              </div>
              <div className="sheet-body">
                {children}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* Alert (iOS 26) */
export function Alert({
  open,
  title,
  message,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  children?: ReactNode;
  actions: { label: string; onPress: () => void; primary?: boolean; destructive?: boolean; disabled?: boolean }[];
  onClose: () => void;
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="alert-scrim" initial={{ backgroundColor: 'rgba(0,0,0,0)' }} animate={{ backgroundColor: 'rgba(0,0,0,0.55)' }} exit={{ backgroundColor: 'rgba(0,0,0,0)' }} onClick={onClose}>
          <motion.div
            className="alert glass dark refract"
            // Transform only on the glass (see the scrim); the content fades instead.
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.6, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <h3>{title}</h3>
              {message && <p>{message}</p>}
              {children}
              <div className="alert-actions">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    disabled={a.disabled}
                    className={`alert-btn ${a.primary ? 'primary' : ''} ${a.destructive ? 'destructive' : ''}`}
                    onClick={a.onPress}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* Text field */
export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

/* Marquee for long titles */
export function Marquee({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  // Width of one copy incl. its gap (0 = the text fits). Only box width changes re-measure.
  const [loop, setLoop] = useState(0);
  useLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    let lastW = -1;
    const check = () => {
      const w = b.clientWidth;
      if (w === lastW) return;
      lastW = w;
      setLoop(i.scrollWidth > w + 2 ? i.scrollWidth + 40 : 0); // + the 40px gap between copies
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(b);
    return () => ro.disconnect();
  }, [text]);
  // Endless loop: two copies scroll by exactly one copy, so the end frame equals the start frame.
  const style = loop ? ({ '--mq-loop': `-${loop}px`, '--mq-dur': `${Math.max(6, loop / 38 + 2)}s` } as React.CSSProperties) : undefined;
  return (
    <div ref={box} className={`marquee ${loop ? 'run' : ''} ${className ?? ''}`}>
      <div className="marquee-track" style={style}>
        <span ref={inner}>{text}</span>
        {loop > 0 && <span aria-hidden>{text}</span>}
      </div>
    </div>
  );
}

/* Artwork with graceful fallback */
export function Art({ src, alt = '', className, seed }: { src?: string; alt?: string; className?: string; seed?: string }) {
  const [failed, setFailed] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    setFailed(false);
    setLocal(null);
    if (!src || !needsNativeArtwork(src)) return;
    let active = true;
    proxiedArtwork(src).then((url) => active && setLocal(url)).catch(() => {});
    return () => {
      active = false;
    };
  }, [src]);
  // Offline: the cover saved with a downloaded track (seed is the track key).
  useEffect(() => {
    if ((failed || !src) && seed && isDownloaded(seed)) offlineArtUrl(seed).then(setLocal);
  }, [failed, src, seed]);
  if (local) return <img className={className} src={local} alt={alt} draggable={false} />;
  if (!src || failed) return <div className={`art-fallback ${className ?? ''}`} style={{ background: gradientFor(seed ?? alt) }} />;
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} draggable={false} />;
}

/** Deterministic gradient used for missing artwork and generated mix covers. */
export function gradientFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 50) % 360} 70% 35%))`;
}
