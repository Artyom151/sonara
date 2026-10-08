import type { Track } from '../../core/types';
import { useLibrary } from '../../store/library';
import { usePlayer, type QueueContext } from '../../store/player';
import { useUi } from '../../store/ui';
import { compact, fmtTime } from '../i18n';
import { IconMore, IconSoundCloud, IconDeezer, IconYouTube } from '../icons';
import { Art } from './controls';

export function EqBars({ paused }: { paused?: boolean }) {
  return (
    <span className={`eq-bars ${paused ? 'paused' : ''}`}>
      <i />
      <i />
      <i />
    </span>
  );
}

export function SourceMark({ source }: { source: Track['source'] }) {
  return source === 'youtube' ? <IconYouTube size={12} /> : source === 'deezer' ? <IconDeezer size={12} /> : <IconSoundCloud size={12} />;
}

export function TrackRow({
  track,
  list,
  index,
  context,
  numbered,
  playlistId,
  meta,
}: {
  track: Track;
  list: Track[];
  index: number;
  context: QueueContext;
  numbered?: boolean;
  playlistId?: string;
  meta?: 'duration' | 'plays';
}) {
  const current = usePlayer((s) => s.queue[s.index]?.key);
  const playing = usePlayer((s) => s.playing);
  const disliked = useLibrary((s) => s.dislikes.includes(track.key));
  const open = useUi((s) => s.open);
  const isCurrent = current === track.key;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`track-row ${isCurrent ? 'playing' : ''} ${disliked ? 'disliked' : ''}`}
      onClick={() => {
        if (isCurrent) return usePlayer.getState().setExpanded(true);
        usePlayer.getState().playQueue(list, index, context);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        open({ type: 'track', track, playlistId });
      }}
    >
      {numbered && <span className="track-index">{index + 1}</span>}
      <div className="track-art">
        <Art src={track.artwork} seed={track.key} />
        {isCurrent && (
          <div className="eq">
            <EqBars paused={!playing} />
          </div>
        )}
      </div>
      <div className="track-meta">
        <div className="track-title">{track.title}</div>
        <div className="track-sub">
          <SourceMark source={track.source} />
          <span>{track.artist}</span>
          {meta === 'duration' && track.duration > 0 && <span>· {fmtTime(track.duration)}</span>}
          {meta === 'plays' && track.plays && <span>· ▶ {compact(track.plays)}</span>}
        </div>
      </div>
      <button
        className="row-btn"
        aria-label="More"
        onClick={(e) => {
          e.stopPropagation();
          open({ type: 'track', track, playlistId, anchor: e.currentTarget.getBoundingClientRect() });
        }}
      >
        <IconMore size={20} />
      </button>
    </div>
  );
}

export function TrackList({ tracks, context, numbered, playlistId, meta }: { tracks: Track[]; context: QueueContext; numbered?: boolean; playlistId?: string; meta?: 'duration' | 'plays' }) {
  return (
    <div>
      {tracks.map((t, i) => (
        <TrackRow key={`${t.key}-${i}`} track={t} list={tracks} index={i} context={context} numbered={numbered} playlistId={playlistId} meta={meta} />
      ))}
    </div>
  );
}
