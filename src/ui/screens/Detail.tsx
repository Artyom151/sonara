import { DownloadAllButton, DownloadsScreen } from '../components/Downloads';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../core';
import type { Playlist, Track } from '../../core/types';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useUi, type Route } from '../../store/ui';
import { imageColors, playerBackdrop } from '../../theme/color';
import { Art, Menu } from '../components/controls';
import { MixCover, PlaylistCover, coverPalette } from '../components/MixCover';
import { blobToDataUrl, squareImage } from '../../account/image';
import { toast } from '../components/Toast';
import { ArtistScreen } from './Artist';
import { TrackList } from '../components/TrackRow';
import { useT } from '../i18n';
import { IconCamera, IconCheck, IconChevronLeft, IconHeart, IconMore, IconPencil, IconPlay, IconPlus, IconShuffle, IconTrash, IconWaveform } from '../icons';
import { startWave } from '../../player/wave';
import { useAsync } from '../useAsync';
import { usePersonalPicks } from '../../player/recommend';
import { MixCard, TrendTile, useHome } from './Home';

function useHeroColor(src?: string) {
  const [c, setC] = useState<string>('transparent');
  useEffect(() => {
    imageColors(src).then((x) => setC(playerBackdrop(x).top));
  }, [src]);
  return c;
}

export function NavBar({ title, right }: { title: string; right?: React.ReactNode }) {
  const pop = useUi((s) => s.pop);
  return (
    <div className="nav-bar">
      <button className="glass glass-icon glass-press" onClick={pop} aria-label="Back">
        <IconChevronLeft size={20} />
      </button>
      <div className="title">{title}</div>
      {right ?? <div style={{ width: 44 }} />}
    </div>
  );
}

function Collection({
  title,
  subtitle,
  artwork,
  cover,
  tracks,
  loading,
  contextId,
  playlistId,
  right,
  extra,
}: {
  title: string;
  subtitle?: string;
  artwork?: string;
  cover?: React.ReactNode;
  tracks: Track[];
  loading?: boolean;
  contextId: string;
  playlistId?: string;
  right?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const t = useT();
  const color = useHeroColor(artwork);
  const play = (shuffle: boolean) => {
    if (!tracks.length) return;
    const st = usePlayer.getState();
    if (st.shuffle !== shuffle) st.toggleShuffle();
    st.playQueue(tracks, shuffle ? Math.floor(Math.random() * tracks.length) : 0, { title, id: contextId });
  };
  return (
    <div className="screen">
      <NavBar title={title} right={right} />
      <div className="hero">
        <div className="hero-bg" style={{ background: `radial-gradient(70% 60% at 50% 30%, ${color}, transparent 75%)` }} />
        <div className="hero-art">{cover ?? <Art src={artwork} seed={contextId} />}</div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        <div className="hero-actions">
          <button className="btn primary" onClick={() => play(false)} disabled={!tracks.length}>
            <IconPlay size={18} />
            <span>{t('play')}</span>
          </button>
          <button className="btn glass glass-press" onClick={() => play(true)} disabled={!tracks.length}>
            <IconShuffle size={18} />
            <span>{t('shuffle')}</span>
          </button>
          <button className="btn glass glass-press" onClick={() => startWave({ kind: 'tracks', tracks, title })} disabled={!tracks.length}>
            <IconWaveform size={18} />
            <span>{t('radioFromCollection')}</span>
          </button>
        </div>
        {tracks.length > 0 && (
          <div className="hero-actions" style={{ marginTop: 8 }}>
            <DownloadAllButton tracks={tracks} />
          </div>
        )}
        {extra}
      </div>
      {loading && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}
      <TrackList tracks={tracks} context={{ title, id: contextId }} numbered playlistId={playlistId} meta="duration" />
    </div>
  );
}

function GenreScreen({ r }: { r: Extract<Route, { name: 'genre' }> }) {
  const t = useT();
  const { data, loading } = useAsync<Playlist>(`genre:${r.urn}`, () => api.genre(r.urn));
  return (
    <Collection
      title={r.title}
      subtitle={`${t('trendingNow')} · ${data?.trackCount ?? '…'} ${t('tracks')}`}
      artwork={data?.artwork ?? r.artwork}
      tracks={data?.tracks ?? []}
      loading={loading}
      contextId={`genre:${r.urn}`}
    />
  );
}

function RemotePlaylist({ r }: { r: Extract<Route, { name: 'playlist' }> }) {
  const t = useT();
  const { data, loading } = useAsync<Playlist>(`pl:${r.source}:${r.id}`, () => api.playlist(r.source, r.id));
  const p = data ?? r.preview;
  const saved = useLibrary((s) => s.savedPlaylists.some((x) => x.key === (p?.key ?? '')));
  const open = useUi((s) => s.open);
  return (
    <Collection
      title={p?.title ?? r.title}
      subtitle={[p?.subtitle, p ? `${p.trackCount} ${t('tracks')}` : ''].filter(Boolean).join(' · ')}
      artwork={p?.artwork ?? r.artwork}
      tracks={data?.tracks ?? []}
      loading={loading}
      contextId={`pl:${r.id}`}
      right={
        <button
          className="glass glass-icon glass-press"
          aria-label={t('savePlaylist')}
          onClick={() => p && useLibrary.getState().toggleSavedPlaylist(p)}
          style={{ color: saved ? 'var(--accent)' : undefined }}
        >
          {saved ? <IconCheck size={20} /> : <IconPlus size={20} />}
        </button>
      }
      extra={
        data?.tracks?.length ? (
          <button className="see-all" style={{ marginTop: 10 }} onClick={() => open({ type: 'addToPlaylist', tracks: data.tracks! })}>
            {t('addToPlaylist')}
          </button>
        ) : null
      }
    />
  );
}

function LocalPlaylist({ r }: { r: Extract<Route, { name: 'local' }> }) {
  const t = useT();
  const p = useLibrary((s) => s.playlists.find((x) => x.id === r.id));
  const open = useUi((s) => s.open);
  const pop = useUi((s) => s.pop);
  const push = useUi((s) => s.push);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  if (!p) return null;
  const [a, b] = coverPalette(p.cover);
  return (
    <>
      <Collection
        title={p.title}
        subtitle={[p.description, `${p.tracks.length} ${t('tracks')}`].filter(Boolean).join(' · ')}
        cover={<PlaylistCover p={p} />}
        tracks={p.tracks}
        contextId={`local:${p.id}`}
        playlistId={p.id}
        right={
          <button className="glass glass-icon glass-press" aria-label="More" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
            <IconMore size={18} />
          </button>
        }
        extra={
          !p.tracks.length && (
            <div className="empty">
              <p>{t('emptyPlaylist')}</p>
              <button className="btn small glass glass-press" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => push({ name: 'liked' })}>
                <span>{t('addSongs')}</span>
              </button>
            </div>
          )
        }
      />
      <Menu
        anchor={anchor}
        onClose={() => setAnchor(null)}
        items={[
          { label: t('edit'), icon: <IconPencil size={18} />, onSelect: () => open({ type: 'createPlaylist', editId: p.id }) },
          { label: t('choosePhoto'), icon: <IconCamera size={18} />, onSelect: () => pickCover(p.id, t('errUpload')) },
          ...(p.image
            ? [{ label: t('removePhoto'), icon: <IconTrash size={18} />, onSelect: () => useLibrary.getState().updatePlaylist(p.id, { image: undefined }) }]
            : [{ label: t('otherCover'), icon: <IconShuffle size={18} />, onSelect: () => useLibrary.getState().updatePlaylist(p.id, { cover: (p.cover + 1) % 8 }) }]),
          {
            label: t('delete'),
            icon: <IconTrash size={18} />,
            destructive: true,
            separatorBefore: true,
            onSelect: () =>
              open({
                type: 'confirm',
                title: `${t('delete')} «${p.title}»?`,
                action: t('delete'),
                destructive: true,
                onConfirm: () => {
                  pop();
                  useLibrary.getState().deletePlaylist(p.id);
                },
              }),
          },
        ]}
      />
    </>
  );
}

function LikedScreen() {
  const t = useT();
  const likes = useLibrary((s) => s.likes);
  return (
    <Collection
      title={t('likedSongs')}
      subtitle={`${likes.length} ${t('tracks')}`}
      cover={<div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#ff375f,#bf5af2)', color: '#fff' }}><IconHeart size={72} filled /></div>}
      tracks={likes}
      contextId="likes"
      extra={!likes.length && <div className="empty">{t('emptyLikes')}</div>}
    />
  );
}

function RecentScreen() {
  const t = useT();
  const recent = useLibrary((s) => s.recent);
  return <Collection title={t('recentlyPlayed')} subtitle={`${recent.length} ${t('tracks')}`} artwork={recent[0]?.artworkLarge} tracks={recent} contextId="recent" />;
}

function AllScreen({ r }: { r: Extract<Route, { name: 'all' }> }) {
  const t = useT();
  const { data } = useHome();
  const personal = usePersonalPicks();
  const title = { trending: t('trendingNow'), mixes: t('mixesForYou'), picks: t('picksForYou'), youtube: t('trendingYoutube') }[r.kind];
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="screen" ref={ref}>
      <NavBar title={title} />
      <h1 className="screen-title">{title}</h1>
      {r.kind === 'trending' && (
        <div className="all-grid trend">
          {data?.trending.map((g) => <TrendTile key={g.urn} g={g} />)}
        </div>
      )}
      {r.kind === 'mixes' && <div className="all-grid mixes">{data?.mixes.map((p) => <MixCard key={p.key} p={p} />)}</div>}
      {r.kind === 'picks' && <TrackList tracks={personal.tracks.length ? personal.tracks : (data?.picks ?? [])} context={{ title }} meta="duration" />}
      {r.kind === 'youtube' && <TrackList tracks={data?.youtube ?? []} context={{ title }} meta="plays" />}
    </div>
  );
}

export function RouteView({ r }: { r: Route }) {
  switch (r.name) {
    case 'genre':
      return <GenreScreen r={r} />;
    case 'playlist':
      return <RemotePlaylist r={r} />;
    case 'local':
      return <LocalPlaylist r={r} />;
    case 'liked':
      return <LikedScreen />;
    case 'downloads':
      return <DownloadsScreen />;
    case 'recent':
      return <RecentScreen />;
    case 'all':
      return <AllScreen r={r} />;
    case 'artist':
      return <ArtistScreen r={r} />;
    default:
      return null;
  }
}

/** Pick a photo, square-crop it to 512 px and use it as the playlist cover. */
function pickCover(id: string, errorText: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const image = await blobToDataUrl(await squareImage(file, 512));
      useLibrary.getState().updatePlaylist(id, { image });
    } catch {
      toast(errorText);
    }
  };
  input.click();
}
