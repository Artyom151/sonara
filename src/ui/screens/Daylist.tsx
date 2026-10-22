import { useDaylist } from '../../player/daylist';
import type { Part } from '../../player/daylistPlan';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { TrackList } from '../components/TrackRow';
import { useLang, useT, type StrKey } from '../i18n';
import { IconChevronLeft, IconPlay, IconShuffle, IconSparkles } from '../icons';

const PART_KEYS: Record<Part, StrKey> = {
  lateNight: 'daylistLateNight',
  morning: 'daylistMorning',
  lateMorning: 'daylistLateMorning',
  afternoon: 'daylistAfternoon',
  evening: 'daylistEvening',
  night: 'daylistNight',
};

/** "thursday evening house": the weekday, the part of the day and the leading tag. */
export function useDaylistTitle(part: Part, tags: string[]) {
  const t = useT();
  const lang = useLang();
  const day = new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(new Date()).toLowerCase();
  return t('daylistTitle')
    .replace('{day}', day)
    .replace('{part}', t(PART_KEYS[part]))
    .replace('{tag}', tags[0] ?? t('daylistMix'));
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export function DaylistScreen() {
  const t = useT();
  const pop = useUi((s) => s.pop);
  const { slot, data, loading, refresh } = useDaylist();
  const title = useDaylistTitle(slot.part, data?.tags ?? []);
  const tracks = data?.tracks ?? [];
  const context = { title, id: `daylist:${slot.start}` };

  const play = (shuffle: boolean) => {
    if (!tracks.length) return;
    usePlayer.getState().playQueue(shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks, 0, context);
  };
  const save = () => tracks.length && useLibrary.getState().createPlaylist(title, t('daylistSaved'), tracks);

  return (
    <div className="screen daylist-screen">
      <div className="nav-bar">
        <button className="glass glass-icon glass-press" onClick={pop} aria-label={t('back')}>
          <IconChevronLeft size={20} />
        </button>
        <div className="title">{t('daylist')}</div>
        <div style={{ width: 44 }} />
      </div>

      <header className="daylist-hero glass">
        <div className="daylist-art">
          <IconSparkles size={78} />
        </div>
        <div className="daylist-copy">
          <small>{t('daylistOverline')}</small>
          <h1>{title}</h1>
          <p>{data?.personalized ? t('daylistPersonal') : t('daylistFresh')}</p>
          <p>
            {t('daylistNext')} · {timeOf(slot.next)}
          </p>
        </div>
      </header>

      <div className="daylist-actions">
        <button className="btn primary" disabled={!tracks.length} onClick={() => play(false)}>
          <IconPlay size={18} />
          {t('play')}
        </button>
        <button className="btn tonal" disabled={!tracks.length} onClick={() => play(true)}>
          <IconShuffle size={18} />
          {t('shuffle')}
        </button>
        <button className="btn tonal" disabled={!tracks.length} onClick={save}>
          {t('daylistSave')}
        </button>
        <button className="btn tonal" disabled={loading} onClick={() => void refresh()}>
          {loading ? t('daylistFinding') : t('daylistRefresh')}
        </button>
      </div>

      {loading && !data && <div className="empty">{t('daylistFinding')}</div>}
      {!loading && !tracks.length && <div className="empty">{t('daylistEmpty')}</div>}
      {tracks.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t('daylistRecommended')}</h2>
            <span>{tracks.length}</span>
          </div>
          <TrackList tracks={tracks} context={context} numbered />
        </section>
      )}
    </div>
  );
}
