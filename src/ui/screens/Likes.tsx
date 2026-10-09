import { useLibrary } from '../../store/library';
import { useUi } from '../../store/ui';
import { Art } from '../components/controls';
import { PlaylistCover } from '../components/MixCover';
import { TrackList } from '../components/TrackRow';
import { useT } from '../i18n';
import { IconChevronRight, IconDownload, IconHeart, IconLink, IconPlus } from '../icons';
import { useOffline } from '../../player/offline';

export function PlaylistTiles() {
  const t = useT();
  const playlists = useLibrary((s) => s.playlists);
  const saved = useLibrary((s) => s.savedPlaylists);
  const push = useUi((s) => s.push);
  const open = useUi((s) => s.open);
  return (
    <>
      <button className="lib-tile" onClick={() => open({ type: 'createPlaylist' })}>
        <div className="lib-cover glass" style={{ color: 'var(--accent)' }}>
          <IconPlus size={26} />
        </div>
        <div>
          <b>{t('newPlaylist')}</b>
        </div>
      </button>
      <button className="lib-tile" onClick={() => open({ type: 'import' })}>
        <div className="lib-cover glass" style={{ color: 'var(--accent)' }}>
          <IconLink size={24} />
        </div>
        <div>
          <b>{t('importPlaylist')}</b>
        </div>
      </button>
      {playlists.map((p) => (
        <button key={p.id} className="lib-tile" onClick={() => push({ name: 'local', id: p.id })}>
          <div className="lib-cover">
            <PlaylistCover p={p} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{p.title}</b>
            <small>
              {p.tracks.length} {t('tracks')}
            </small>
          </div>
          <IconChevronRight size={16} style={{ opacity: 0.4 }} />
        </button>
      ))}
      {saved.map((p) => (
        <button
          key={p.key}
          className="lib-tile"
          onClick={() => push({ name: 'playlist', source: p.source as 'soundcloud', id: p.id, title: p.title, artwork: p.artwork, preview: p })}
        >
          <div className="lib-cover">
            <Art src={p.artwork} seed={p.key} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{p.title}</b>
            <small>
              {p.subtitle ?? ''} · {p.trackCount} {t('tracks')}
            </small>
          </div>
          <IconChevronRight size={16} style={{ opacity: 0.4 }} />
        </button>
      ))}
    </>
  );
}

export function Likes() {
  const t = useT();
  const likes = useLibrary((s) => s.likes);
  const downloads = useOffline((s) => Object.keys(s.items).length);
  const push = useUi((s) => s.push);
  return (
    <div className="screen">
      <h1 className="screen-title">{t('likes')}</h1>
      <button className="lib-tile" onClick={() => push({ name: 'liked' })}>
        <div className="lib-cover" style={{ background: 'linear-gradient(135deg, #ff375f, #bf5af2)' }}>
          <IconHeart size={26} filled />
        </div>
        <div style={{ flex: 1 }}>
          <b>{t('likedSongs')}</b>
          <small>
            {likes.length} {t('tracks')}
          </small>
        </div>
        <IconChevronRight size={16} style={{ opacity: 0.4 }} />
      </button>
      <button className="lib-tile" onClick={() => push({ name: 'downloads' })}>
        <div className="lib-cover" style={{ background: 'linear-gradient(135deg, #30d158, #0a84ff)' }}>
          <IconDownload size={26} filled />
        </div>
        <div style={{ flex: 1 }}>
          <b>{t('downloads')}</b>
          <small>
            {downloads} {t('tracks')}
          </small>
        </div>
        <IconChevronRight size={16} style={{ opacity: 0.4 }} />
      </button>
      <div className="section-head" style={{ marginTop: 22 }}>
        <h2>{t('yourPlaylists')}</h2>
      </div>
      <PlaylistTiles />
      {likes.length > 0 && (
        <section className="section" style={{ marginTop: 22 }}>
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
