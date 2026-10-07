import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from '../icons';

const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 } as const;
const softSpring = { type: 'spring', stiffness: 380, damping: 32 } as const;

/* ───────────── Toggle (iOS 26) ─────────────
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

/* ───────────── Segmented control ───────────── */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const [pressed, setPressed] = useState(false);
  return (
    <div className="segmented glass" onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}>
      <motion.div
        className="seg-lens"
        animate={{ left: `calc(${(idx * 100) / options.length}% + 3px)`, scale: pressed ? 1.08 : 1 }}
        style={{ width: `calc(${100 / options.length}% - 6px)` }}
        transition={softSpring}
      />
      {options.map((o) => (
        <button key={o.value} className={`seg ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Pull-down menu (iOS 26 glass) ───────────── */
export interface MenuItem {
  label: string;
  icon?: ReactNode;
  checked?: boolean;
  destructive?: boolean;
  onSelect: () => void;
  separatorBefore?: boolean;
}

export function Menu({ anchor, items, onClose }: { anchor: DOMRect | null; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string; maxH: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const m = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const margin = 12;
    const spaceBelow = vh - anchor.bottom - gap - margin;
    const spaceAbove = anchor.top - gap - margin;
    // Open where it fits; otherwise towards the larger side, clamped and scrollable.
    const below = m.height <= spaceBelow || spaceBelow >= spaceAbove;
    const maxH = Math.max(120, below ? spaceBelow : spaceAbove);
    const h = Math.min(m.height, maxH);
    const top = below ? anchor.bottom + gap : anchor.top - gap - h;
    const alignRight = anchor.left + anchor.width / 2 > vw / 2;
    const left = Math.min(vw - m.width - margin, Math.max(margin, alignRight ? anchor.right - m.width : anchor.left));
    setPos({ left, top, maxH, origin: `${alignRight ? 'right' : 'left'} ${below ? 'top' : 'bottom'}` });
  }, [anchor]);

  return createPortal(
    <AnimatePresence>
      {anchor && (
        <motion.div className="menu-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            ref={ref}
            className="menu glass refract"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, transformOrigin: pos?.origin }}
            initial={{ opacity: 0, scale: 0.4, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 460, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ maxHeight: pos?.maxH }}>
              {items.map((it, i) => (
                <div key={i}>
                  {it.separatorBefore && <div className="menu-sep" />}
                  <button
                    className={`menu-item ${it.destructive ? 'destructive' : ''}`}
                    onClick={() => {
                      onClose();
                      it.onSelect();
                    }}
                  >
                    <span className="menu-check">{it.checked && <IconCheck size={15} />}</span>
                    <span className="menu-label">{it.label}</span>
                    {it.icon && <span className="menu-icon">{it.icon}</span>}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
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
      <button className="select-btn" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
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

/* ───────────── Slider (iOS 26: knob turns into a lens while dragging) ───────────── */
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

/* ───────────── Sheet ───────────── */
export function Sheet({ open, onClose, children, title, full }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; full?: boolean }) {
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className={`sheet glass dark ${full ? 'full' : ''}`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.9 }}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-inner">
              <div className="grabber" />
              {title && <div className="sheet-title">{title}</div>}
              <div className="sheet-body" onPointerDownCapture={(e) => e.stopPropagation()}>
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

/* ───────────── Alert (iOS 26) ───────────── */
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
        <motion.div className="alert-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="alert glass dark refract"
            initial={{ scale: 1.15, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───────────── Text field ───────────── */
export function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

/* ───────────── Marquee for long titles ───────────── */
export function Marquee({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState(false);
  useLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const check = () => setRun(i.scrollWidth - 48 > b.clientWidth + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(b);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div ref={box} className={`marquee ${run ? 'run' : ''} ${className ?? ''}`} style={{ ['--mq-dur' as string]: `${Math.max(8, text.length * 0.35)}s` }}>
      <span ref={inner}>{text}</span>
      {run && <span aria-hidden>{text}</span>}
    </div>
  );
}

/* ───────────── Artwork with graceful fallback ───────────── */
export function Art({ src, alt = '', className, seed }: { src?: string; alt?: string; className?: string; seed?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className={`art-fallback ${className ?? ''}`} style={{ background: gradientFor(seed ?? alt) }} />;
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} draggable={false} />;
}

/** Deterministic gradient used for missing artwork and generated mix covers. */
export function gradientFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 50) % 360} 70% 35%))`;
}
