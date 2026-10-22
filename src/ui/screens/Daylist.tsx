import { useDaylist } from '../../player/daylist';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useUi } from '../../store/ui';
import { TrackList } from '../components/TrackRow';
import { IconChevronLeft, IconChevronRight, IconPlay, IconShuffle, IconSparkles } from '../icons';
import { Art } from '../components/controls';
import './daylist.css';

const names = {
  ru: { lateNight: 'ночной', morning: 'утренний', lateMorning: 'предобеденный', afternoon: 'дневной', evening: 'вечерний', night: 'поздний' },
  en: { lateNight: 'late-night', morning: 'morning', lateMorning: 'late-morning', afternoon: 'afternoon', evening: 'evening', night: 'night' },
};
export function useDaylistTitle(part: keyof typeof names.ru, tags: string[]) {
  const ru = navigator.language.toLowerCase().startsWith('ru');
  const day = new Intl.DateTimeFormat(ru ? 'ru' : 'en', { weekday: 'long' }).format(new Date()).toLowerCase();
  return ru ? `${day}: ${names.ru[part]} ${tags[0] ?? 'микс'}` : `${day} ${names.en[part]} ${tags[0] ?? 'mix'}`;
}
export function DaylistCard() {
  const push = useUi((s) => s.push);
  const { slot, data } = useDaylist();
  const ru = navigator.language.toLowerCase().startsWith('ru');
  return <button className="daylist-card glass glass-press" onClick={() => push({ name: 'daylist' })}>
    <span className="daylist-card-art" aria-hidden="true">{data?.tracks.length ? data.tracks.slice(0, 4).map((track) => <Art key={track.key} src={track.artwork} seed={track.key} />) : <IconSparkles size={34} />}</span>
    <span className="daylist-card-copy"><small><IconSparkles size={12} /> {ru ? 'СЕГОДНЯ ДЛЯ ВАС' : 'TODAY FOR YOU'}</small><strong>{useDaylistTitle(slot.part, data?.tags ?? [])}</strong><em>{data?.tracks.length ?? 0} {ru ? 'новых треков' : 'new tracks'} · {ru ? 'до' : 'until'} {new Date(slot.next).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</em></span>
    <span className="daylist-card-arrow" aria-hidden="true"><IconChevronRight size={18} /></span>
  </button>;
}
export function DaylistScreen() {
  const pop = useUi((s) => s.pop);
  const { slot, data, loading, refresh } = useDaylist();
  const ru = navigator.language.toLowerCase().startsWith('ru');
  const title = useDaylistTitle(slot.part, data?.tags ?? []);
  const tracks = data?.tracks ?? [];
  const play = (shuffle: boolean) => {
    if (!tracks.length) return;
    const order = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    usePlayer.getState().playQueue(order, 0, { title, id: `daylist:${slot.start}` });
  };
  const save = () => {
    if (!tracks.length) return;
    useLibrary.getState().createPlaylist(title, ru ? 'Сохранённая подборка по времени' : 'Saved daylist', tracks);
  };
  return <div className="screen daylist-screen">
    <div className="nav-bar"><button className="glass glass-icon glass-press" onClick={pop} aria-label="Back"><IconChevronLeft size={20} /></button><div className="title">{ru ? 'Подборка по времени' : 'Daylist'}</div><div style={{ width: 44 }} /></div>
    <header className="daylist-hero glass">
      <div className="daylist-art"><IconSparkles size={78} /></div>
      <div className="daylist-copy"><small>{ru ? 'МУЗЫКА ПОД ВАШ ДЕНЬ' : 'MUSIC FOR YOUR DAY'}</small><h1>{title}</h1><p>{data?.personalized ? (ru ? 'По вашему вкусу в это время суток' : 'Inspired by your listening at this time') : (ru ? 'Новые треки по вашему вкусу' : 'Fresh music for your day')}</p><p>{ru ? 'Следующее обновление' : 'Next update'} · {new Date(slot.next).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p></div>
    </header>
    <div className="daylist-actions"><button className="btn primary" disabled={!tracks.length} onClick={() => play(false)}><IconPlay size={18} />{ru ? 'Слушать' : 'Play'}</button><button className="btn tonal" disabled={!tracks.length} onClick={() => play(true)}><IconShuffle size={18} />{ru ? 'Перемешать' : 'Shuffle'}</button><button className="btn tonal" disabled={!tracks.length} onClick={save}>{ru ? 'Сохранить копию' : 'Save a copy'}</button><button className="btn tonal" disabled={loading} onClick={() => void refresh()}>{loading ? '…' : (ru ? 'Обновить' : 'Refresh')}</button></div>
    {loading && !data && <div className="empty">{ru ? 'Подбираем музыку…' : 'Finding music…'}</div>}
    {!loading && !tracks.length && <div className="empty">{ru ? 'Пока нет точных совпадений. Поставьте лайки любимым трекам или послушайте музыку подольше.' : 'No close matches yet. Like a few tracks or listen longer to tune your daylist.'}</div>}
    {tracks.length > 0 && <section className="section"><div className="section-head"><h2>{ru ? 'Рекомендации' : 'Recommended for you'}</h2><span>{tracks.length}</span></div><TrackList tracks={tracks} context={{ title, id: `daylist:${slot.start}` }} numbered /></section>}
  </div>;
}
