import { api } from '../../core';
import type { HomeData, Playlist, TrendingGenre } from '../../core/types';
import { usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { Art } from '../components/controls';
import { MixCover, hashIndex } from '../components/MixCover';
import { TrackList } from '../components/TrackRow';
import { compact, useT } from '../i18n';
import { IconHeart, IconPlay } from '../icons';
import { useAsync } from '../useAsync';
import { usePersonalPicks } from '../../player/recommend';
import { useDesktop } from '../useMedia';
import { WaveCard, WaveHero } from '../desktop/WaveHero';

export function TrendTile({ g }: { g: TrendingGenre }) {
  const push = useUi((s) => s.push);
  return (
    <button className="trend-tile" onClick={() => push({ name: 'genre', urn: g.urn, title: g.title, artwork: g.artwork })}>
      <div className="trend-art">
        <Art src={g.artwork} seed={g.title} />
        <span className="trend-badge glass">
          <IconHeart size={8} filled style={{ color: '#ff6b81' }} />
          <span>{compact(g.likes)}</span>
        </span>
      </div>
      <div className="trend-label">{g.title}</div>
    </button>
  );
}

export function MixCard({ p }: { p: Playlist }) {
  const t = useT();
  const push = useUi((s) => s.push);
  const playMix = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const full = p.tracks?.length ? p : await api.playlist(p.source as 'soundcloud', p.id);
    if (full.tracks?.length) usePlayer.getState().playQueue(full.tracks, 0, { title: p.title, id: p.key });
  };
  return (
    <button className="mix-card" onClick={() => push({ name: 'playlist', source: p.source as 'soundcloud', id: p.id, title: p.title, artwork: p.artwork, preview: p })}>
      <MixCover className="mix-bg" index={hashIndex(p.key)} />
      <div className="mix-text">
        <h3>{p.title}</h3>
        <p>
          {p.trackCount} {t('tracks')}
        </p>
      </div>
      <span className="mix-play" role="button" onClick={playMix}>
        <IconPlay size={18} />
      </span>
    </button>
  );
}

function SectionHead({ title, onAll }: { title: string; onAll?: () => void }) {
  const t = useT();
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {onAll && (
        <button className="see-all" onClick={onAll}>
          {t('seeAll')}
        </button>
      )}
    </div>
  );
}

export function useHome() {
  const sources = useSettings((s) => s.sources);
  const key = useSettings((s) => s.youtubeApiKey);
  return useAsync<HomeData>(`home:${sources.soundcloud}:${sources.youtube}:${!!key}`, () => api.home());
}

function Skeleton({ rows }: { rows?: boolean }) {
  if (rows)
    return (
      <div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '8px var(--gutter)' }}>
            <div className="sk" style={{ width: 36, height: 36, borderRadius: 6 }} />
            <div style={{ flex: 1 }}>
              <div className="sk" style={{ width: '55%', height: 11, borderRadius: 4 }} />
              <div className="sk" style={{ width: '30%', height: 9, borderRadius: 4, marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <div className="skeleton">
      <div className="hscroll">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="sk" style={{ width: 60, height: 60, borderRadius: 12 }} />
        ))}
      </div>
      <div className="hscroll" style={{ marginTop: 40 }}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="sk" style={{ width: 222, height: 92, borderRadius: 12 }} />
        ))}
      </div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 20px', marginTop: i ? 0 : 30 }}>
          <div className="sk" style={{ width: 36, height: 36, borderRadius: 6 }} />
          <div style={{ flex: 1 }}>
            <div className="sk" style={{ width: '60%', height: 11, borderRadius: 4 }} />
            <div className="sk" style={{ width: '35%', height: 9, borderRadius: 4, marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Home() {
  const t = useT();
  const push = useUi((s) => s.push);
  const { data, loading, error, reload } = useHome();
  const desktop = useDesktop();
  const personal = usePersonalPicks();
  // Personal picks from Likes when there are any; otherwise the trending chart picks.
  const picks = personal.tracks.length ? personal.tracks : (data?.picks ?? []);

  return (
    <div className="screen">
      {desktop ? <WaveHero data={data} /> : <WaveCard />}
      {loading && !data && (
        <>
          <div className="section-head" style={{ marginTop: 8 }}>
            <h2>{t('trendingNow')}</h2>
          </div>
          <Skeleton />
        </>
      )}
      {error && !data && (
        <div className="empty">
          <p>{t('loadingError')}</p>
          <button className="btn small glass glass-press" onClick={reload}>
            <span>{t('retry')}</span>
          </button>
        </div>
      )}
      {data && (
        <>
          {data.trending.length > 0 && (
            <section className="section" style={{ marginTop: 8 }}>
              <SectionHead title={t('trendingNow')} onAll={() => push({ name: 'all', kind: 'trending' })} />
              <div className="hscroll">
                {data.trending.map((g) => (
                  <TrendTile key={g.urn} g={g} />
                ))}
              </div>
            </section>
          )}
          {data.mixes.length > 0 && (
            <section className="section">
              <SectionHead title={t('mixesForYou')} onAll={() => push({ name: 'all', kind: 'mixes' })} />
              <div className="hscroll">
                {data.mixes.map((p) => (
                  <MixCard key={p.key} p={p} />
                ))}
              </div>
            </section>
          )}
          {(picks.length > 0 || personal.loading) && (
            <section className="section">
              <SectionHead title={t('picksForYou')} onAll={() => push({ name: 'all', kind: 'picks' })} />
              {personal.personal && <p className="section-sub">{t('basedOnLikes')}</p>}
              {personal.loading && !personal.tracks.length ? (
                <Skeleton rows />
              ) : (
                <div className="picks-grid">
                  <TrackList tracks={picks.slice(0, 8)} context={{ title: t('picksForYou'), id: 'picks' }} />
                </div>
              )}
            </section>
          )}
          {data.youtube.length > 0 && (
            <section className="section">
              <SectionHead title={t('trendingYoutube')} onAll={() => push({ name: 'all', kind: 'youtube' })} />
              <div className="picks-grid">
                <TrackList tracks={data.youtube.slice(0, 8)} context={{ title: t('trendingYoutube'), id: 'youtube' }} meta="plays" />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
