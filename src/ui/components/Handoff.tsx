import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { resumeHere, useCloud } from '../../account/cloud';
import { fmtTime, useT } from '../i18n';
import { IconClose, IconPlay } from '../icons';
import { Art } from './controls';

/** "Continue here": what this account last played on another device. */
export function Handoff() {
  const t = useT();
  const np = useCloud((s) => s.remoteNow);
  const playedHere = useCloud((s) => s.playedHere);
  const [dismissed, setDismissed] = useState(0);
  const show = !!np && np.at > playedHere && np.at > dismissed && Date.now() - np.at < 12 * 3600e3;
  // "Playing on" while the other device reported playback within the last minute.
  const live = !!np && np.playing && Date.now() - np.at < 60e3;

  return (
    <AnimatePresence>
      {show && np && (
        <motion.div
          key={np.at}
          className="handoff glass dark"
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <div className="handoff-art">
            <Art src={np.track.artwork} seed={np.track.key} />
          </div>
          <div className="handoff-text">
            <small>
              {live ? t('handoffOn') : t('handoffWas')} {np.deviceName} · {fmtTime(np.position)}
            </small>
            <b>{np.track.title}</b>
            <span>{np.track.artist}</span>
          </div>
          <button className="handoff-go" aria-label={t('handoffContinue')} title={t('handoffContinue')} onClick={() => resumeHere(np)}>
            <IconPlay size={18} />
          </button>
          <button className="handoff-close" aria-label="Close" onClick={() => setDismissed(np.at)}>
            <IconClose size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
