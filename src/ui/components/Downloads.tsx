import { useState } from 'react';
import { api } from '../../core';
import type { Track } from '../../core/types';
import { cancelDownloads, clearDownloads, download, useOffline } from '../../player/offline';
import { useLibrary } from '../../store/library';
import { useUi } from '../../store/ui';
import { useT } from '../i18n';
import { IconCheck, IconDownload } from '../icons';
import { NavBar } from '../screens/Detail';
import { Alert, Art, Field } from './controls';
import { toast } from './Toast';
import { TrackList } from './TrackRow';

/** Downloaded / queued counts for a set of tracks. */
function useDownloadState(tracks: Track[]) {
  return useOffline((s) => {
    let done = 0;
    let queued = 0;
    const q = new Set(s.queue.map((j) => j.track.key));
    for (const t of tracks) {
      if (s.items[t.key]) done++;
      else if (q.has(t.key)) queued++;
    }
    return `${done}/${queued}`;
  });
}

/** Hero button of a playlist / Liked Songs: download every track, shows progress and the result. */
export function DownloadAllButton({ tracks }: { tracks: Track[] }) {
  const t = useT();
  const [done, queued] = useDownloadState(tracks).split('/').map(Number);
  const all = tracks.length > 0 && done === tracks.length;
  const busy = queued > 0;
  return (
    <button
      className="btn tonal"
      disabled={!tracks.length}
      aria-label={t('downloadAll')}
      onClick={() => {
        if (busy) return cancelDownloads();
        const n = download(tracks);
        toast(n ? `${t('downloadQueued')}: ${n}` : t('allDownloaded'));
      }}
    >
      {all ? <IconCheck size={18} /> : <IconDownload size={18} filled={busy} />}
      <span>{busy ? `${done}/${tracks.length}` : all ? t('downloaded') : t('download')}</span>
    </button>
  );
}

/** Library screen with every downloaded track (plays offline). */
export function DownloadsScreen() {
  const t = useT();
  const open = useUi((s) => s.open);
  const items = useOffline((s) => s.items);
  const queue = useOffline((s) => s.queue);
  const tracks = Object.values(items)
    .sort((a, b) => b.at - a.at)
    .map((e) => e.track);
  const size = Object.values(items).reduce((n, e) => n + e.size, 0);
  return (
    <div className="screen">
      <NavBar title={t('downloads')} />
      <div className="dl-hero">
        <div className="dl-covers">
          {tracks.length ? tracks.slice(0, 4).map((x) => <Art key={x.key} src={x.artworkLarge ?? x.artwork} seed={x.key} />) : <IconDownload size={44} />}
        </div>
        <div className="dl-meta">
          <h1>{t('downloads')}</h1>
          <p>
            {tracks.length} {t('tracks')} · {(size / 1024 / 1024).toFixed(0)} MB
          </p>
          {queue.length > 0 && (
            <div className="dl-progress" aria-label={`${Math.round(queue[0].progress * 100)}%`}>
              <i style={{ width: `${Math.round(queue[0].progress * 100)}%` }} />
            </div>
          )}
          {queue.length > 0 && (
            <small>
              {t('downloading')} {queue.length}: {queue[0].track.title}
            </small>
          )}
          <div className="dl-actions">
            {queue.length > 0 && (
              <button className="btn tonal small" onClick={cancelDownloads}>
                {t('cancelDownloads')}
              </button>
            )}
            {tracks.length > 0 && (
              <button
                className="btn tonal small dl-clear"
                onClick={() =>
            open({
              type: 'confirm',
              title: t('clearDownloads'),
              message: `${tracks.length} ${t('tracks')} · ${(size / 1024 / 1024).toFixed(0)} MB`,
              action: t('delete'),
              destructive: true,
              onConfirm: () => void clearDownloads(),
            })
          }
        >
          {t('clearDownloads')}
        </button>
            )}
          </div>
        </div>
      </div>
      {tracks.length ? <TrackList tracks={tracks} context={{ title: t('downloads'), id: 'downloads' }} meta="duration" /> : <div className="empty">{t('downloadsEmpty')}</div>}
    </div>
  );
}

/** Import a playlist or album from a link into a new local playlist. */
export function ImportSheet() {
  const t = useT();
  const close = useUi((s) => s.close);
  const push = useUi((s) => s.push);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const p = await api.importLink(url.trim());
      if (!p.tracks?.length) throw new Error('empty');
      const local = useLibrary.getState().createPlaylist(p.title || t('importPlaylist'), p.subtitle ?? '', p.tracks);
      close();
      toast(`${t('imported')}: ${p.tracks.length}`);
      push({ name: 'local', id: local.id });
    } catch (e) {
      console.warn('[import]', e);
      toast(t('importFailed'));
      setBusy(false);
    }
  };
  return (
    <Alert
      open
      title={t('importPlaylist')}
      message={t('importHint')}
      onClose={close}
      actions={[
        { label: t('cancel'), onPress: close },
        { label: busy ? '…' : t('importAction'), primary: true, onPress: submit, disabled: !url.trim() || busy },
      ]}
    >
      <Field autoFocus placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} inputMode="url" />
    </Alert>
  );
}
