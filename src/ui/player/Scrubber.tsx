import { useRef, useState } from 'react';
import { seek } from '../../player/engine';
import { usePlayer } from '../../store/player';
import { fmtTime } from '../i18n';

/** The progress line; drag or click to seek. `compact` hides the times under it. */
export function Scrubber({ compact }: { compact?: boolean }) {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const buffered = usePlayer((s) => s.buffered);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const pos = drag ?? position;
  const pct = duration ? Math.min(100, (pos / duration) * 100) : 0;
  const at = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * duration;
  };
  return (
    <div>
      <div
        ref={ref}
        className={`scrub ${drag != null ? 'active' : ''}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(at(e.clientX));
        }}
        onPointerMove={(e) => drag != null && setDrag(at(e.clientX))}
        onPointerUp={() => {
          if (drag != null) seek(drag);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="scrub-track">
          <div className="scrub-buffer" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          <div className="scrub-fill" style={{ width: `${pct}%` }} />
        </div>
        {drag != null && (
          <span className="scrub-bubble" style={{ left: `${pct}%` }}>
            {fmtTime(drag)}
          </span>
        )}
      </div>
      {!compact && (
        <div className="times">
          <span>{fmtTime(pos)}</span>
          <span>{fmtTime(duration)}</span>
        </div>
      )}
    </div>
  );
}

/** Position / duration in monospaced digits; its own component so time updates re-render only this. */
export function TimeCode() {
  const position = usePlayer((s) => Math.floor(s.position));
  const duration = usePlayer((s) => Math.floor(s.duration));
  return (
    <span className="timecode">
      {fmtTime(position)} <i>/</i> {fmtTime(duration)}
    </span>
  );
}
