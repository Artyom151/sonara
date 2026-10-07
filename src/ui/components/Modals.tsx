import { useState } from 'react';
import { usePlayer } from '../../store/player';
import { useLibrary } from '../../store/library';
import { useUi, type Modal } from '../../store/ui';
import { useT } from '../i18n';
import {
  IconBan,
  IconClose,
  IconExternal,
  IconHeart,
  IconMusicList,
  IconPlus,
  IconQueue,
  IconShare,
  IconTrash,
} from '../icons';
import { Alert, Art, Field, Menu, Sheet, type MenuItem } from './controls';
import { MixCover } from './MixCover';
import { LyricsView, useLyrics } from './Player';
import { AuthSheet } from '../account/AuthSheet';
import { EditProfileSheet } from '../account/EditProfileSheet';
import { CommentsPanel } from '../account/Comments';
import { SourceMark } from './TrackRow';
import { openExternal, shareTrack } from './actions';
import { toast } from './Toast';

function TrackMenu({ m }: { m: Extract<Modal, { type: 'track' }> }) {
  const t = useT();
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  const liked = useLibrary((s) => s.likes.some((x) => x.key === m.track.key));
  const disliked = useLibrary((s) => s.dislikes.includes(m.track.key));
  const track = m.track;

  const items: MenuItem[] = [
    { label: t('playNext'), icon: <IconQueue size={18} />, onSelect: () => (usePlayer.getState().playNext(track), toast(t('added'))) },
    { label: t('addToQueue'), icon: <IconMusicList size={18} />, onSelect: () => (usePlayer.getState().addToQueue([track]), toast(t('added'))) },
    { label: t('addToPlaylist'), icon: <IconPlus size={18} />, onSelect: () => setTimeout(() => open({ type: 'addToPlaylist', tracks: [track] })) },
    { label: liked ? t('unlike') : t('like'), icon: <IconHeart size={18} filled={liked} />, onSelect: () => useLibrary.getState().toggleLike(track), separatorBefore: true },
    { label: t('dislike'), icon: <IconBan size={18} />, checked: disliked, onSelect: () => useLibrary.getState().toggleDislike(track) },
    { label: t('share'), icon: <IconShare size={18} />, onSelect: () => shareTrack(track, t('copied')), separatorBefore: true },
    ...(track.url ? [{ label: `${t('openIn')} ${track.source === 'youtube' ? 'YouTube' : 'SoundCloud'}`, icon: <IconExternal size={18} />, onSelect: () => openExternal(track.url!) }] : []),
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
          <button key={i} className={`action ${it.destructive ? 'destructive' : ''}`} onClick={() => (close(), it.onSelect())}>
            {it.icon}
            <span>{it.label}</span>
          </button>
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
              <MixCover index={p.cover} />
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
  const upcoming = queue.slice(index);
  return (
    <Sheet open onClose={close} title={t('queue')} full>
      {upcoming.map((tr, i) => (
        <div key={`${tr.key}-${i}`} className={`track-row ${i === 0 ? 'playing' : ''}`} onClick={() => usePlayer.getState().jump(index + i)}>
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
            <button
              className="row-btn"
              onClick={(e) => {
                e.stopPropagation();
                usePlayer.getState().removeAt(index + i);
              }}
            >
              <IconClose size={16} />
            </button>
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
          case 'comments':
            return <CommentsSheet key={i} />;
        }
      })}
    </>
  );
}
