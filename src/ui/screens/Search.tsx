import { useEffect, useRef, useState } from 'react';
import { api } from '../../core';
import type { SearchResult, Source, Track } from '../../core/types';
import { usePlayer } from '../../store/player';
import { useLibrary } from '../../store/library';
import { useUi } from '../../store/ui';
import { Art, Segmented } from '../components/controls';
import { TrackList } from '../components/TrackRow';
import { useT } from '../i18n';
import { IconClose, IconPlay, IconSearch } from '../icons';
import { SOURCE_ORDER, SOURCES, SourceIcon } from '../sources';
import { useHome } from './Home';

const YT_PLAYLIST = /[?&]list=([\w-]+)/;
const SC_URL = /soundcloud\.com\/[^/]+\/sets\/|soundcloud\.com\/discover\/sets\//;

/** The best match as a big card: cover, title, artist and a play button. */
function TopResult({ track }: { track: Track }) {
  const t = useT();
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('topResult')}</h2>
      </div>
      <button className="top-result" onClick={() => usePlayer.getState().playQueue([track], 0, { title: track.title })}>
        <span className="top-result-cover">
          <Art src={track.artworkLarge ?? track.artwork} seed={track.key} />
        </span>
        <span className="top-result-text">
          <b>{track.title}</b>
          <small>{track.artist}</small>
        </span>
        <span className="top-result-play">
          <IconPlay size={18} />
        </span>
      </button>
    </section>
  );
}

export function Search() {
  const t = useT();
  const [q, setQ] = useState('');
  const [source, setSource] = useState<'all' | Source>('all');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recent = useLibrary((s) => s.recentSearches);
  const push = useUi((s) => s.push);
  const home = useHome();
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (!query) return setResult(null);
    const ytList = query.match(YT_PLAYLIST);
    if (ytList) {
      push({ name: 'playlist', source: 'youtube', id: ytList[1], title: 'YouTube' });
      setQ('');
      return;
    }
    if (SC_URL.test(query)) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      api
        .search(query, source)
        .then((r) => id === seq.current && setResult(r))
        .catch((e: Error) => {
          if (id !== seq.current) return;
          setResult({ tracks: [], playlists: [] });
          // Yandex Music / VK without a token in .env.
          if (/TOKEN/.test(e.message)) setError(t('sourceNeedsToken'));
        })
        .finally(() => id === seq.current && setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [q, source]);

  const commit = () => q.trim() && useLibrary.getState().pushSearch(q.trim());

  return (
    <div className="screen search-screen">
      <div className="search-head">
        <h1 className="screen-title">{t('search')}</h1>
        <div className="search-bar">
          <IconSearch size={18} />
          <input
            value={q}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (commit(), (e.target as HTMLInputElement).blur())}
            enterKeyHint="search"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label={t('clear')}>
              <IconClose size={16} style={{ opacity: 0.6 }} />
            </button>
          )}
        </div>
        <Segmented
          value={source}
          onChange={setSource}
          className="source-seg"
          options={[
            { value: 'all', label: t('all') },
            ...SOURCE_ORDER.map((s) => {
              const { name, Icon } = SOURCES[s];
              // Phones show the logo only (CSS hides .seg-text); the name stays as the accessible label.
              return { value: s, title: name, label: (<><Icon size={16} /><span className="seg-text">{name}</span></>) };
            }),
          ]}
        />
      </div>

      <div className="search-body">
      {!q.trim() && (
        <>
          {recent.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>{t('recentSearches')}</h2>
                <button className="see-all" onClick={() => useLibrary.getState().clearSearches()}>
                  {t('clear')}
                </button>
              </div>
              <div className="search-chips">
                {recent.map((r) => (
                  <button key={r} className="chip" onClick={() => setQ(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="section">
            <div className="section-head">
              <h2>{t('browseGenres')}</h2>
            </div>
            <div className="genre-grid">
              {home.data?.trending.map((g, i) => (
                <button
                  key={g.urn}
                  className="genre-card"
                  style={{ background: `linear-gradient(135deg, hsl(${(i * 47) % 360} 60% 42%), hsl(${(i * 47 + 40) % 360} 60% 28%))` }}
                  onClick={() => push({ name: 'genre', urn: g.urn, title: g.title, artwork: g.artwork })}
                >
                  {g.title}
                  {g.artwork && <img src={g.artwork} alt="" loading="lazy" />}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {q.trim() && loading && !result && (
        <div className="empty">
          <span className="spinner" />
        </div>
      )}
      {q.trim() && result && (
        <div className={`search-results ${loading ? 'busy' : ''}`} onClick={commit}>
          {result.tracks[0] && <TopResult track={result.tracks[0]} />}
          {result.playlists.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>{t('playlists')}</h2>
              </div>
              <div className="search-playlists">
                {result.playlists.map((p) => (
                  <button
                    key={p.key}
                    className="search-playlist"
                    onClick={() => p.source !== 'local' && push({ name: 'playlist', source: p.source, id: p.id, title: p.title, artwork: p.artwork, preview: p })}
                  >
                    <span className="search-playlist-cover">
                      <Art src={p.artwork} seed={p.key} />
                    </span>
                    <b>{p.title}</b>
                    <small>
                      <SourceIcon source={p.source} />
                      {p.subtitle}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="section">
            <div className="section-head">
              <h2>{t('songs')}</h2>
            </div>
            {result.tracks.length ? <TrackList tracks={result.tracks} context={{ title: q.trim() }} meta="duration" /> : <div className="empty">{error ?? t('noResults')}</div>}
          </section>
        </div>
      )}
      </div>
    </div>
  );
}
