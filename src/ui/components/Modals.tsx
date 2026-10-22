import { ImportSheet } from './Downloads';
import { LookSheet } from './LookSheet';
import { TogetherSheet } from './TogetherSheet';
import { download, removeDownload, useOffline } from '../../player/offline';
import { useSleep } from '../../player/sleep';
import { sourceName } from '../sources';
import { useEffect, useRef, useState } from 'react';
import { usePlayer, type Repeat } from '../../store/player';
import { useLibrary } from '../../store/library';
import { useUi, type Modal } from '../../store/ui';
import { useT, type StrKey } from '../i18n';
import {
  IconBan,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconExternal,
  IconHeart,
  IconMusicList,
  IconPerson,
  IconPlus,
  IconQueue,
  IconRepeat,
  IconShare,
  IconTrash,
  IconTimer,
  IconDownload,
  IconWaveform,
} from '../icons';
import { startWave } from '../../player/wave';
import { openWhy } from './WhySheet';
import { Alert, Art, Field, Menu, Sheet, type MenuItem } from './controls';
import { PlaylistCover } from './MixCover';
import { LyricsView, useLyrics } from '../player/Lyrics';
import { AuthSheet } from '../account/AuthSheet';
import { EditProfileSheet } from '../account/EditProfileSheet';
import { CommentsPanel } from '../account/Comments';
import { SourceMark } from './TrackRow';
import { openExternal, shareTrack } from './actions';
import { openArtistPage, splitArtists } from '../artists';
import { toast } from './Toast';

const REPEAT_LABEL: Record<Repeat, StrKey> = { off: 'repeatOff', all: 'repeatAll', one: 'repeatOne' };

function TrackMenu({ m }: { m: Extract<Modal, { type: 'track' }> }) {
  const t = useT();
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  const liked = useLibrary((s) => s.likes.some((x) => x.key === m.track.key));
  const disliked = useLibrary((s) => s.dislikes.includes(m.track.key));
  const track = m.track;
  const [subOpen, setSubOpen] = useState<number | null>(null);
  const isCurrent = usePlayer((s) => s.queue[s.index]?.key === track.key);
  const repeat = usePlayer((s) => s.repeat);
  const setRepeat = (r: 'off' | 'all' | 'one') => usePlayer.getState().patch({ repeat: r });
  // Playing track: repeat modes as a nested menu (phones have no repeat button in the mini player / island).
  const playback: MenuItem[] = isCurrent
    ? [
        {
          label: t('repeat'),
          icon: <IconRepeat size={18} one={repeat === 'one'} />,
          detail: t(REPEAT_LABEL[repeat]),
          children: [
            { label: t('repeatOff'), checked: repeat === 'off', onSelect: () => setRepeat('off') },
            { label: t('repeatAll'), icon: <IconRepeat size={18} />, checked: repeat === 'all', onSelect: () => setRepeat('all') },
            { label: t('repeatOne'), icon: <IconRepeat size={18} one />, checked: repeat === 'one', onSelect: () => setRepeat('one') },
          ],
        },
      ]
    : [];

  const artists = splitArtists(track.artist, track.title);
  const toArtist: MenuItem =
    artists.length > 1
      ? { label: t('goToArtist'), icon: <IconPerson size={18} />, children: artists.map((n) => ({ label: n, icon: <IconPerson size={18} />, onSelect: () => openArtistPage(track, n, false) })) }
      : { label: t('goToArtist'), icon: <IconPerson size={18} />, onSelect: () => openArtistPage(track, artists[0] ?? track.artist, true) };

  const sleep = useSleep();
  const sleepLeft = sleep.until ? Math.max(1, Math.round((sleep.until - Date.now()) / 60_000)) : 0;
  const sleepItem: MenuItem[] = isCurrent
    ? [
        {
          label: t('sleepTimer'),
          icon: <IconTimer size={18} />,
          detail: sleep.endOfTrack ? t('sleepEndOfTrack') : sleep.until ? `${sleepLeft} ${t('minutesShort')}` : t('sleepOff'),
          children: [
            { label: t('sleepOff'), checked: !sleep.until && !sleep.endOfTrack, onSelect: () => sleep.set(null) },
            ...[15, 30, 45, 60].map((n) => ({ label: `${n} ${t('minutesShort')}`, onSelect: () => (sleep.set(n), toast(`${t('sleepSet')}: ${n} ${t('minutesShort')}`)) })),
            { label: t('sleepEndOfTrack'), checked: sleep.endOfTrack, onSelect: () => (sleep.set('track'), toast(t('sleepSet'))) },
          ],
        },
      ]
    : [];
  const downloaded = useOffline((s) => !!s.items[track.key]);
  const items: MenuItem[] = [
    ...playback,
    ...sleepItem,
    { ...toArtist, separatorBefore: isCurrent },
    // A live, endless wave built around this track (player/wave.ts).
    { label: t('waveFromThisTrack'), icon: <IconWaveform size={18} />, onSelect: () => void startWave({ kind: 'track', track }), separatorBefore: true },
    { label: t('whyThis'), icon: <IconWaveform size={18} />, onSelect: () => openWhy(track) },
    { label: t('playNext'), icon: <IconQueue size={18} />, onSelect: () => (usePlayer.getState().playNext(track), toast(t('added'))) },
    { label: t('addToQueue'), icon: <IconMusicList size={18} />, onSelect: () => (usePlayer.getState().addToQueue([track]), toast(t('added'))) },
    { label: t('addToPlaylist'), icon: <IconPlus size={18} />, onSelect: () => setTimeout(() => open({ type: 'addToPlaylist', tracks: [track] })) },
    downloaded
      ? { label: t('removeDownload'), icon: <IconDownload size={18} filled />, onSelect: () => void removeDownload(track.key) }
      : { label: t('download'), icon: <IconDownload size={18} />, onSelect: () => (download([track]), toast(t('downloadQueued'))) },
    { label: liked ? t('unlike') : t('like'), icon: <IconHeart size={18} filled={liked} />, onSelect: () => useLibrary.getState().toggleLike(track), separatorBefore: true },
    { label: t('dislike'), icon: <IconBan size={18} />, checked: disliked, onSelect: () => useLibrary.getState().toggleDislike(track) },
    { label: t('share'), icon: <IconShare size={18} />, onSelect: () => shareTrack(track, t('copied')), separatorBefore: true },
    ...(track.url ? [{ label: `${t('openIn')} ${sourceName(track.source)}`, icon: <IconExternal size={18} />, onSelect: () => openExternal(track.url!) }] : []),
    ...(m.playlistId
      ? [{ label: t('removeFromPlaylist'), icon: <IconTrash size={18} />, destructive: true, onSelect: () => useLibrary.getState().removeFromPlaylist(m.playlistId!, track.key) }]
      : []),
  ];

  // With an anchor: iOS pull-down menu. Without (long-press): action sheet.
  if (m.anchor) return <Menu anchor={m.anchor} items={items} onClose={close} />;
  return (
    <Sheet open onClose={close}>
      <div className="action-head">
        <div className="track-art">
          <Art src={track.artwork} seed={track.key} />
        </div>
        <div className="track-meta">
          <div className="track-title" style={{ fontSize: 15 }}>{track.title}</div>
          <div className="track-sub">
            <SourceMark source={track.source} /> {track.artist}
          </div>
        </div>
      </div>
      <div className="action-list">
        {items.map((it, i) => (
          <div key={i}>
            <button
              className={`action ${it.destructive ? 'destructive' : ''}`}
              onClick={() => (it.children ? setSubOpen(subOpen === i ? null : i) : (close(), it.onSelect?.()))}
            >
              {it.icon}
              <span>{it.label}</span>
              {it.children && (
                <span className="action-detail">
                  {it.detail}
                  <IconChevronDown size={14} style={{ transform: subOpen === i ? 'rotate(180deg)' : undefined, transition: 'transform .25s' }} />
                </span>
              )}
            </button>
            {it.children && subOpen === i && (
              <div className="action-sub">
                {it.children.map((c, j) => (
                  <button key={j} className="action" onClick={() => (close(), c.onSelect?.())}>
                    <span className="action-check">{c.checked && <IconCheck size={16} />}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function AddToPlaylist({ m }: { m: Extract<Modal, { type: 'addToPlaylist' }> }) {
  const t = useT();
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  const playlists = useLibrary((s) => s.playlists);
  return (
    <Sheet open onClose={close} title={t('addToPlaylist')}>
      <button className="lib-tile" onClick={() => (close(), setTimeout(() => open({ type: 'createPlaylist', tracks: m.tracks })))}>
        <div className="lib-cover glass" style={{ color: 'var(--accent)' }}>
          <IconPlus size={24} />
        </div>
        <div>
          <b>{t('newPlaylist')}</b>
        </div>
      </button>
      {playlists.map((p) => {
        const has = m.tracks.every((x) => p.tracks.some((y) => y.key === x.key));
        return (
          <button
            key={p.id}
            className="lib-tile"
            disabled={has}
            style={{ opacity: has ? 0.5 : 1 }}
            onClick={() => {
              useLibrary.getState().addToPlaylist(p.id, m.tracks);
              toast(`${t('added')}: ${p.title}`);
              close();
            }}
          >
            <div className="lib-cover">
              <PlaylistCover p={p} />
            </div>
            <div>
              <b>{p.title}</b>
              <small>
                {p.tracks.length} {t('tracks')}
              </small>
            </div>
          </button>
        );
      })}
    </Sheet>
  );
}

function CreatePlaylist({ m }: { m: Extract<Modal, { type: 'createPlaylist' }> }) {
  const t = useT();
  const close = useUi((s) => s.close);
  const push = useUi((s) => s.push);
  const editing = useLibrary((s) => s.playlists.find((p) => p.id === m.editId));
  const [title, setTitle] = useState(editing?.title ?? '');
  const [desc, setDesc] = useState(editing?.description ?? '');
  const submit = () => {
    if (editing) {
      useLibrary.getState().updatePlaylist(editing.id, { title: title.trim() || editing.title, description: desc });
      close();
      return;
    }
    const p = useLibrary.getState().createPlaylist(title, desc, m.tracks);
    close();
    if (!m.tracks?.length) push({ name: 'local', id: p.id });
    else toast(`${t('added')}: ${p.title}`);
  };
  return (
    <Alert
      open
      title={editing ? t('edit') : t('createPlaylist')}
      onClose={close}
      actions={[
        { label: t('cancel'), onPress: close },
        { label: editing ? t('save') : t('create'), primary: true, onPress: submit, disabled: !title.trim() },
      ]}
    >
      <Field autoFocus placeholder={t('playlistName')} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && submit()} />
      <Field placeholder={t('description')} value={desc} onChange={(e) => setDesc(e.target.value)} />
    </Alert>
  );
}

function Queue() {
  const t = useT();
  const close = useUi((s) => s.close);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const lastRemoved = usePlayer((s) => s.lastRemoved);
  const dragIndex = useRef<number | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const upcoming = queue.slice(index);
  const stopDrag = () => {
    dragIndex.current = null;
    setDragging(false);
    setTimeout(() => { suppressClick.current = false; }, 0);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
    dragCleanup.current = null;
  };
  const onMove = (e: PointerEvent) => {
    if (dragIndex.current === null) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-queue-index]');
    const to = Number(row?.dataset.queueIndex);
    if (!row || !Number.isInteger(to) || to === dragIndex.current) return;
    usePlayer.getState().moveAt(dragIndex.current, to);
    dragIndex.current = to;
  };
  useEffect(() => () => dragCleanup.current?.(), []);
  return (
    <Sheet open onClose={close} title={t('queue')} full>
      {lastRemoved && (
        <div className="queue-undo">
          <span>{t('removedFromQueue')}: {lastRemoved.track.title}</span>
          <button onClick={() => usePlayer.getState().undoRemove()}>{t('undo')}</button>
        </div>
      )}
      {upcoming.map((tr, i) => (
        <div key={`${tr.key}-${i}`} data-queue-index={index + i} className={`track-row queue-row ${i === 0 ? 'playing' : ''} ${dragging && dragIndex.current === index + i ? 'queue-dragging' : ''}`} onClick={() => { if (!dragging && !suppressClick.current) usePlayer.getState().jump(index + i); }}>
          <div className="track-art">
            <Art src={tr.artwork} seed={tr.key} />
          </div>
          <div className="track-meta">
            <div className="track-title">{tr.title}</div>
            <div className="track-sub">
              <SourceMark source={tr.source} /> {tr.artist}
            </div>
          </div>
          {i > 0 && (
            <><button
              className="queue-grip"
              aria-label={t('moveInQueue')}
              title={t('moveInQueue')}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dragIndex.current = index + i;
                suppressClick.current = true;
                setDragging(true);
                dragCleanup.current = stopDrag;
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', stopDrag);
                window.addEventListener('pointercancel', stopDrag);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                e.stopPropagation();
                const to = index + i + (e.key === 'ArrowUp' ? -1 : 1);
                if (to <= index || to >= queue.length) return;
                usePlayer.getState().moveAt(index + i, to);
                requestAnimationFrame(() => document.querySelectorAll<HTMLButtonElement>('.queue-grip')[to - index - 1]?.focus());
              }}
            >⠿</button><button
              className="row-btn"
              aria-label={t('removeFromQueue')}
              onClick={(e) => {
                e.stopPropagation();
                usePlayer.getState().removeAt(index + i);
              }}
            >
              <IconClose size={16} />
            </button></>
          )}
        </div>
      ))}
    </Sheet>
  );
}

function LyricsSheet() {
  const close = useUi((s) => s.close);
  const track = usePlayer((s) => s.queue[s.index]);
  const lyrics = useLyrics(track);
  const t = useT();
  return (
    <Sheet open onClose={close} title={track ? `${track.title} — ${track.artist}` : t('lyrics')} full>
      <LyricsView lyrics={lyrics} className="sheet-lyrics" />
    </Sheet>
  );
}

function CommentsSheet() {
  const t = useT();
  const close = useUi((s) => s.close);
  return (
    <Sheet open onClose={close} title={t('comments')} full>
      <CommentsPanel />
    </Sheet>
  );
}

function Confirm({ m }: { m: Extract<Modal, { type: 'confirm' }> }) {
  const t = useT();
  const close = useUi((s) => s.close);
  return (
    <Alert
      open
      title={m.title}
      message={m.message}
      onClose={close}
      actions={[
        { label: t('cancel'), onPress: close },
        { label: m.action, destructive: m.destructive, onPress: () => (close(), m.onConfirm()) },
      ]}
    />
  );
}

/** Several artists on one track: pick whose page to open. */
function ArtistChooser({ m }: { m: Extract<Modal, { type: 'artists' }> }) {
  const t = useT();
  const close = useUi((s) => s.close);
  const pick = (name: string) => {
    close();
    openArtistPage(m.track, name, false);
  };
  if (m.anchor) return <Menu anchor={m.anchor} items={m.names.map((n) => ({ label: n, icon: <IconPerson size={18} />, onSelect: () => pick(n) }))} onClose={close} />;
  return (
    <Sheet open onClose={close} title={t('chooseArtist')}>
      <div className="action-list">
        {m.names.map((n) => (
          <button key={n} className="action" onClick={() => pick(n)}>
            <IconPerson size={18} />
            <span>{n}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function Modals() {
  const modals = useUi((s) => s.modals);
  return (
    <>
      {modals.map((m, i) => {
        switch (m.type) {
          case 'track':
            return <TrackMenu key={i} m={m} />;
          case 'addToPlaylist':
            return <AddToPlaylist key={i} m={m} />;
          case 'createPlaylist':
            return <CreatePlaylist key={i} m={m} />;
          case 'queue':
            return <Queue key={i} />;
          case 'lyrics':
            return <LyricsSheet key={i} />;
          case 'confirm':
            return <Confirm key={i} m={m} />;
          case 'auth':
            return <AuthSheet key={i} initialTab={m.tab} onClose={() => useUi.getState().close()} />;
          case 'editProfile':
            return <EditProfileSheet key={i} onClose={() => useUi.getState().close()} />;
          case 'look':
            return <LookSheet key={i} onClose={() => useUi.getState().close()} />;
          case 'together':
            return <TogetherSheet key={i} onClose={() => useUi.getState().close()} />;
          case 'comments':
            return <CommentsSheet key={i} />;
          case 'artists':
            return <ArtistChooser key={i} m={m} />;
          case 'import':
            return <ImportSheet key={i} />;
        }
      })}
    </>
  );
}
