import { useMemo } from 'react';
import { dayKey, useStats } from '../../store/stats';
import { useT } from '../i18n';

const HOUR = 3600;
type T = ReturnType<typeof useT>;

/** Seconds as "45 min" or "3.2 h". */
function amount(seconds: number, t: T) {
  if (seconds < HOUR) return `${Math.round(seconds / 60)} ${t('statUnitMin')}`;
  return `${(seconds / HOUR).toFixed(1)} ${t('statUnitHour')}`;
}

/** Local listening summary on the profile: this week, all time, last seven days and top artists. */
export function ListeningStats() {
  const t = useT();
  const days = useStats((s) => s.days);
  const artists = useStats((s) => s.artists);
  const plays = useStats((s) => s.plays);

  const week = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * 86400000);
      return { key: dayKey(d), label: d.toLocaleDateString(undefined, { weekday: 'short' }), seconds: days[dayKey(d)] ?? 0 };
    });
  }, [days]);

  const total = Object.values(days).reduce((n, s) => n + s, 0);
  const thisWeek = week.reduce((n, d) => n + d.seconds, 0);
  const max = Math.max(1, ...week.map((d) => d.seconds));
  const top = Object.values(artists)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);

  if (plays === 0 && total === 0) return <p className="stats-empty">{t('statsEmpty')}</p>;

  const today = dayKey();
  const topSeconds = top[0]?.seconds || 1;

  return (
    <div className="stats-page">
      <div className="stats-hero">
        <small>{t('statsWeek')}</small>
        <b>{amount(thisWeek, t)}</b>
        <div className="stats-hero-row">
          <span>
            <strong>{amount(total, t)}</strong> {t('statsAllTime')}
          </span>
          <span>
            <strong>{plays}</strong> {t('statsPlays')}
          </span>
        </div>
      </div>

      <div className="stats-chart">
        {week.map((d) => (
          <div key={d.key} className={`stats-day ${d.key === today ? 'today' : ''}`}>
            <div className="stats-bar-track">
              <div className="stats-bar" style={{ height: `${Math.max(6, (d.seconds / max) * 100)}%` }} title={amount(d.seconds, t)} />
            </div>
            <small>{d.label}</small>
          </div>
        ))}
      </div>

      {top.length > 0 && (
        <section className="stats-artists">
          <h3>{t('statsTop')}</h3>
          <ol>
            {top.map((a, i) => (
              <li key={a.name}>
                <span className="stats-rank">{i + 1}</span>
                <div className="stats-artist-body">
                  <div className="stats-artist-line">
                    <span>{a.name}</span>
                    <small>{amount(a.seconds, t)}</small>
                  </div>
                  <div className="stats-artist-bar">
                    <i style={{ width: `${(a.seconds / topSeconds) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
