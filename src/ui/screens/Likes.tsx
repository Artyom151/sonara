import type { ReactNode } from 'react';
import type { Track } from '../../core/types';
import { useOffline } from '../../player/offline';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { Art } from '../components/controls';
import { PlaylistCover } from '../components/MixCover';
import { TrackList } from '../components/TrackRow';
import { useT } from '../i18n';
import { IconChevronRight, IconDownload, IconHeart, IconLink, IconPlay, IconPlus, IconShuffle } from '../icons';

function play(tracks: Track[], title: string, id: string, shuffle: boolean) {
  if (!tracks.length) return;
  const p = usePlayer.getState();
  if (p.shuffle !== shuffle) p.toggleShuffle();
  p.playQueue(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0, { title, id });
}

/** The liked songs as a stage card: a collage of the latest covers, the count, Play and Shuffle. */
function LikedCard() {
  const t = useT();
  const likes = useLibrary((s) => s.likes);
  const push = useUi((s) => s.push);
  const title = t('likedSongs');
  return (
    <article className="lib-hero" onClick={() => push({ name: 'liked' })}>
      <div className="lib-hero-cover">
        {likes.length ? likes.slice(0, 4).map((x) => <Art key={x.key} src={x.artworkLarge ?? x.artwork} seed={x.key} />) : <IconHeart size={56} filled />}
      </div>
      <div className="lib-hero-body">
        <small>
          <IconHeart size={12} filled /> {t('likes')}
        </small>
        <h2>{title}</h2>
        <p>
          {likes.length} {t('tracks')}
        </p>
        <div className="lib-hero-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn primary small" disabled={!likes.length} onClick={() => play(likes, title, 'likes', false)}>
            <IconPlay size={15} />
            <span>{t('play')}</span>
          </button>
          <button className="btn tonal small" disabled={!likes.length} onClick={() => play(likes, title, 'likes', true)}>
            <IconShuffle size={15} />
            <span>{t('shuffle')}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function SmallCard({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button className="lib-card glass-press" onClick={onClick}>
      <span className="lib-card-icon">{icon}</span>
      <span className="lib-card-text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <IconChevronRight size={16} />
    </button>
  );
}

/** Own and saved playlists as a grid of covers. */
function PlaylistGrid() {
  const t = useT();
  const playlists = useLibrary((s) => s.playlists);
  const saved = useLibrary((s) => s.savedPlaylists);
  const push = useUi((s) => s.push);
  const open = useUi((s) => s.open);
  return (
    <div className="lib-grid">
      <button className="lib-grid-new" onClick={() => open({ type: 'createPlaylist' })}>
        <span>
          <IconPlus size={26} />
        </span>
        <b>{t('newPlaylist')}</b>
      </button>
      {playlists.map((p) => (
        <button key={p.id} className="lib-grid-item" onClick={() => push({ name: 'local', id: p.id })}>
          <span className="lib-grid-cover">
            <PlaylistCover p={p} />
          </span>
          <b>{p.title}</b>
          <small>
            {p.tracks.length} {t('tracks')}
          </small>
        </button>
      ))}
      {saved.map((p) => (
        <button
          key={p.key}
          className="lib-grid-item"
          onClick={() => p.source !== 'local' && push({ name: 'playlist', source: p.source, id: p.id, title: p.title, artwork: p.artwork, preview: p })}
        >
          <span className="lib-grid-cover">
            <Art src={p.artwork} seed={p.key} />
          </span>
          <b>{p.title}</b>
          <small>
            {p.trackCount} {t('tracks')}
          </small>
        </button>
      ))}
    </div>
  );
}

export function Likes() {
  const t = useT();
  const likes = useLibrary((s) => s.likes);
  const downloads = useOffline((s) => Object.keys(s.items).length);
  const push = useUi((s) => s.push);
  const open = useUi((s) => s.open);
  return (
    <div className="screen library">
      <header className="lib-head">
        <h1 className="screen-title">{t('likes')}</h1>
        <div className="lib-head-actions">
          <button className="glass glass-icon glass-press" aria-label={t('importPlaylist')} title={t('importPlaylist')} onClick={() => open({ type: 'import' })}>
            <IconLink size={18} />
          </button>
          <button className="glass glass-icon glass-press" aria-label={t('newPlaylist')} title={t('newPlaylist')} onClick={() => open({ type: 'createPlaylist' })}>
            <IconPlus size={20} />
          </button>
        </div>
      </header>

      <div className="lib-top">
        <LikedCard />
        <SmallCard icon={<IconDownload size={20} filled />} title={t('downloads')} sub={`${downloads} ${t('tracks')}`} onClick={() => push({ name: 'downloads' })} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2>{t('yourPlaylists')}</h2>
        </div>
        <PlaylistGrid />
      </section>

      {likes.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t('likedSongs')}</h2>
            <button className="see-all" onClick={() => push({ name: 'liked' })}>
              {t('seeAll')}
            </button>
          </div>
          <TrackList tracks={likes.slice(0, 10)} context={{ title: t('likedSongs'), id: 'likes' }} />
        </section>
      )}
    </div>
  );
}
