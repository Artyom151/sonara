import { animate, useMotionValue, useSpring, type MotionValue } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Nearest slot index for a lens start (in slot units), clamped to the strip. */
export const snapIndex = (lensStart: number, slot: number, count: number) => {
  if (slot <= 0) return 0;
  // Treat an exact half-slot as still belonging to the preceding slot; this avoids
  // jumping early at the midpoint while dragging the lens between buttons.
  const nearest = Math.ceil(lensStart / slot - 0.5);
  return Math.max(0, Math.min(count - 1, nearest));
};

const HOLD_MS = 220;
const MOVE_SLOP = 6;
const spring = { type: 'spring', stiffness: 420, damping: 34 } as const;

/**
 * The iOS-style draggable lens of the tab bar / desktop rail: press and hold the backdrop of the
 * active tab and it lifts off, then follows the pointer along the strip. The lens squashes with
 * the drag velocity (the "liquid glass" wobble) and springs into the nearest tab on release,
 * committing it. A plain tap stays a tap (the active tab resets its stack as before).
 *
 * The slots are measured from the real tab buttons (offsetLeft/offsetTop), not from arithmetic
 * on the nav size, so the lens lands pixel-exact on every button whatever the flex layout does.
 */
export function useLensDrag(opts: {
  navRef: React.RefObject<HTMLElement | null>;
  /** Index of the active tab; the lens springs to it whenever it changes. */
  idx: number;
  count: number;
  axis: 'x' | 'y';
  /** Inset of the lens inside a tab button's box, per side (the tab bar's 4 px margins). */
  inset: number;
  commit: (index: number) => void;
}) {
  const { navRef, idx, count, axis, inset, commit } = opts;
  const pos = useMotionValue(inset);
  /** Velocity squash along the drag axis, roughly -0.35..0.35. */
  const stretch = useSpring(0, { stiffness: 340, damping: 26 });
  const [dragging, setDragging] = useState(false);
  /** Length of the lens along the drag axis, measured with the slots. */
  const [len, setLen] = useState(0);

  const slotRef = useRef(0);
  const originRef = useRef(0);
  const draggingRef = useRef(false);
  const held = useRef<{ start: number; grab: number; last: number; timer: number; id: number } | null>(null);
  // A drag ends with a pointerup on the captured button, which also fires a click: it must not
  // land as a tab tap (it would switch back / reset the stack).
  const suppressed = useRef(0);

  const lensStart = useCallback((i: number) => originRef.current + i * slotRef.current + inset, [inset]);

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const btns = nav.querySelectorAll('button');
    if (btns.length < 2) return;
    const b0 = btns[0] as HTMLElement;
    const at = (el: Element) => (axis === 'x' ? (el as HTMLElement).offsetLeft : (el as HTMLElement).offsetTop);
    slotRef.current = at(btns[1]) - at(b0);
    originRef.current = at(b0);
    const btnLen = axis === 'x' ? b0.offsetWidth : b0.offsetHeight;
    setLen(Math.max(0, btnLen - 2 * inset));
    if (!draggingRef.current && slotRef.current) pos.set(lensStart(idx));
  }, [axis, inset, lensStart, navRef, pos, idx]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measure, navRef]);

  // The resting lens follows the active tab with the same spring as before.
  useEffect(() => {
    if (!draggingRef.current && slotRef.current) animate(pos, lensStart(idx), spring);
  }, [idx, lensStart, pos]);

  const begin = (target: Element, id: number) => {
    if (draggingRef.current) return;
    draggingRef.current = true;
    setDragging(true);
    target.setPointerCapture?.(id);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!slotRef.current) return;
    const p = axis === 'x' ? e.clientX : e.clientY;
    held.current = { start: p, grab: p - lensStart(idx), last: p, timer: 0, id: e.pointerId };
    // The lens captures the pointer at once, so the moves reach these handlers before the lift too.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    held.current.timer = window.setTimeout(() => begin(e.currentTarget, e.pointerId), HOLD_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const h = held.current;
    if (!h || e.pointerId !== h.id) return;
    const p = axis === 'x' ? e.clientX : e.clientY;
    if (!draggingRef.current) {
      if (Math.abs(p - h.start) < MOVE_SLOP) return;
      clearTimeout(h.timer);
      begin(e.currentTarget, e.pointerId);
    }
    const slot = slotRef.current;
    if (!slot) return;
    const min = lensStart(0);
    const max = lensStart(count - 1);
    pos.set(Math.max(min, Math.min(max, p - h.grab)));
    // Squash with the drag speed, one half-slot of travel being a full deform.
    const v = Math.max(-0.35, Math.min(0.35, (p - h.last) / (slot / 2)));
    stretch.set(v);
    h.last = p;
  };

  const finish = (e: React.PointerEvent) => {
    const h = held.current;
    held.current = null;
    if (!h) return;
    clearTimeout(h.timer);
    if (!draggingRef.current) return; // a plain tap: the click handler keeps its meaning
    draggingRef.current = false;
    suppressed.current = Date.now();
    setDragging(false);
    const slot = slotRef.current;
    const target = snapIndex(pos.get() - originRef.current - inset, slot, count);
    stretch.set(0);
    animate(pos, lensStart(target), spring);
    commit(target);
  };

  return {
    pos,
    stretch,
    dragging,
    len,
    /** Spread onto the button of the active tab only. */
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onClickCapture: (e: React.MouseEvent) => {
        if (Date.now() - suppressed.current < 400) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
    },
  };
}
