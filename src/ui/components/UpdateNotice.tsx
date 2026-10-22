import { AnimatePresence, motion } from 'motion/react';
import { usePendingUpdate, useUpdates, type UpdateInfo } from '../../platform/updates';
import { useSettings } from '../../store/settings';
import { useT } from '../i18n';
import { IconClose, IconDownload } from '../icons';
import { openExternal } from './actions';

/**
 * A short, dismissible notice that a newer release is out. With the island player on it lives in
 * the island instead (IslandUpdate below, rendered by IslandPlayer).
 */
export function UpdateNotice() {
  const info = usePendingUpdate();
  const island = useSettings((s) => s.islandPlayer);
  return <AnimatePresence>{info && !island && <UpdateCard key={info.version} info={info} />}</AnimatePresence>;
}

function UpdateCard({ info }: { info: UpdateInfo }) {
  return (
    <motion.div
      className="update-notice glass"
      initial={{ opacity: 0, y: -24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
    >
      <UpdateRow info={info} onClose={() => useUpdates.getState().dismiss()} />
    </motion.div>
  );
}

/** Icon, "Sonara 1.2.0 · New version", Download. Tapping the text opens the release notes. */
export function UpdateRow({ info, onAction, onClose }: { info: UpdateInfo; onAction?: () => void; onClose?: () => void }) {
  const t = useT();
  return (
    <div className="update-row">
      <span className="update-icon">
        <IconDownload size={20} filled />
      </span>
      <button className="update-text" onClick={() => (onAction?.(), void openExternal(info.pageUrl))}>
        <b>Sonara {info.version}</b>
        <small>{t('updateAvailable')}</small>
      </button>
      <button
        className="update-get"
        onClick={() => {
          onAction?.();
          void openExternal(info.downloadUrl);
          useUpdates.getState().dismiss();
        }}
      >
        {t('updateDownload')}
      </button>
      {onClose && (
        <button className="update-close" aria-label={t('cancel')} onClick={onClose}>
          <IconClose size={12} />
        </button>
      )}
    </div>
  );
}

/** The island's update state: compact pill, tap to open the row with the button. */
export function IslandUpdate({ info, open }: { info: UpdateInfo; open: boolean }) {
  const t = useT();
  if (!open)
    return (
      <motion.div key="update-compact" className="island-compact island-update" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <span className="island-update-dot">
          <IconDownload size={16} filled />
        </span>
        <span className="island-line">
          {t('updateAvailable')} · {info.version}
        </span>
      </motion.div>
    );
  return (
    <motion.div key="update-expanded" className="island-expanded island-update-open" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.08 } }}>
      <UpdateRow info={info} />
      <button className="island-update-later" onClick={(e) => (e.stopPropagation(), useUpdates.getState().dismiss())}>
        {t('updateLater')}
      </button>
    </motion.div>
  );
}
