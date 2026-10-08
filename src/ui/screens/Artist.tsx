import { useState } from 'react';
import { api } from '../../core';
import type { ArtistPage, Source } from '../../core/types';
import { usePlayer } from '../../store/player';
import { useUi, type Route } from '../../store/ui';
import { Art } from '../components/controls';
import { TrackList } from '../components/TrackRow';
import { NavBar } from './Detail';
import { useT } from '../i18n';
import { IconPlay, IconShuffle } from '../icons';
import { useAsync } from '../useAsync';

const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Artist page: popular tracks, albums / singles, similar artists. */
export function ArtistScreen({ r }: { r: Extract<Route, { name: 'artist' }> }) {
  const t = useT();
  const push = useUi((s) => s.push);
  const [all, setAll] = useState(false);
  const { data, loading, error } = useAsync<ArtistPage>(`artist:${r.source}:${r.id ?? ''}:${r.artistName}`, () =>
    api.artist({ source: r.source, id: r.id, name: r.artistName }),
  );
  const name = data?.name ?? r.artistName;
  const top = data?.top ?? [];
  const play = (shuffle: boolean) => {
    if (!top.length) return;
    const st = usePlayer.getState();
    if (st.shuffle !== shuffle) st.toggleShuffle();
    st.playQueue(top, shuffle ? Math.floor(Math.random() * top.length) : 0, { title: name, id: `artist:${data?.key ?? name}` });
  };

  return (
    <div className="screen">
      <NavBar title={name} />
      <div className="artist-hero">
        <div className="artist-photo">
          <Art src={data?.picture} seed={name} />
        </div>
        <h1>{name}</h1>
        {data?.fans ? (
          <p>
            {compact(data.fans)} {t('fans')}
          </p>
        ) : null}
        <div className="hero-actions">
          <button className="btn primary" onClick={() => play(false)} disabled={!top.length}>
            <IconPlay size={18} />
            <span>{t('play')}</span>
          </button>
          <button className="btn glass glass-press" onClick={() => play(true)} disabled={!top.length}>
            <IconShuffle size={18} />
            <span>{t('shuffle')}</span>
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}
      {error && !data && <div className="empty">{t('noResults')}</div>}

      {top.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t('popularTracks')}</h2>
            {top.length > 5 && (
              <button className="see-all" onClick={() => setAll(!all)}>
                {all ? t('showLess') : t('seeAll')}
              </button>
            )}
          </div>
          <TrackList tracks={all ? top : top.slice(0, 5)} context={{ title: name, id: `artist:${data?.key}` }} numbered meta="plays" />
        </section>
      )}

      {!!data?.albums.length && (
        <section className="section">
          <div className="section-head">
            <h2>{t('albums')}</h2>
          </div>
          <div className="hscroll">
            {data.albums.map((p) => (
              <button
                key={p.key}
                className="album-card"
                onClick={() => push({ name: 'playlist', source: p.source as Source, id: p.id, title: p.title, artwork: p.artwork, preview: p })}
              >
                <div className="album-art">
                  <Art src={p.artwork} seed={p.key} />
                </div>
                <div className="track-title">{p.title}</div>
                <div className="track-sub">{p.subtitle}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {!!data?.related.length && (
        <section className="section">
          <div className="section-head">
            <h2>{t('similarArtists')}</h2>
          </div>
          <div className="hscroll">
            {data.related.map((a) => (
              <button key={`${a.source}:${a.id ?? a.name}`} className="artist-card" onClick={() => push({ name: 'artist', source: a.source, id: a.id, artistName: a.name })}>
                <div className="artist-avatar">
                  <Art src={a.picture} seed={a.name} />
                </div>
                <div className="track-title">{a.name}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
