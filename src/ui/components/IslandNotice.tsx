import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useOffline } from '../../player/offline';
import { useSleep } from '../../player/sleep';
import type { IslandNotice as Notice } from '../../store/islandNotice';
import { IconBan, IconMusicList, IconTimer, IconWaveform, IconWifi } from '../icons';

const ICON: Record<Notice['kind'], React.ReactNode> = {
  offline: <IconBan size={15} />,
  online: <IconWifi size={15} />,
  queue: <IconMusicList size={15} />,
  wave: <IconWaveform size={15} />,
  warn: <IconBan size={15} />,
};
const TONE: Record<Notice['kind'], string> = { offline: '#ff453a', online: '#30d158', queue: 'var(--accent)', wave: 'var(--accent)', warn: '#ff9f0a' };

/** A short banner in the island: icon dot, one line, a smaller line under it when there is one. */
export function IslandNoticeView({ notice }: { notice: Notice }) {
  return (
    <motion.div key={`notice-${notice.id}`} className="island-compact island-notice" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.06 } }}>
      <motion.span
        className="island-notice-dot"
        style={{ background: TONE[notice.kind] }}
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 16 }}
      >
        {ICON[notice.kind]}
      </motion.span>
      <span className="island-notice-text">
        <b>{notice.text}</b>
        {notice.detail && <small>{notice.detail}</small>}
      </span>
    </motion.div>
  );
}

/**
 * Background activities inside the collapsed island: sleep timer (minutes left) and the download
 * queue (a ring with the progress of the current file). Nothing renders when neither is active.
 */
export function IslandChips() {
  const until = useSleep((s) => s.until);
  const endOfTrack = useSleep((s) => s.endOfTrack);
  const job = useOffline((s) => s.queue[0]);
  const queued = useOffline((s) => s.queue.length);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [until]);

  const mins = until ? Math.max(1, Math.ceil((until - Date.now()) / 60_000)) : 0;
  if (!until && !endOfTrack && !job) return null;
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span className="island-chips">
      {(until || endOfTrack) && (
        <span className="island-chip" title="Sleep timer">
          <IconTimer size={13} />
          {until ? <i>{mins}</i> : null}
        </span>
      )}
      {job && (
        <span className="island-chip" title="Downloading">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="2.2" />
            <circle cx="9" cy="9" r={r} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.04, job.progress))} transform="rotate(-90 9 9)" />
          </svg>
          {queued > 1 ? <i>{queued}</i> : null}
        </span>
      )}
    </span>
  );
}
