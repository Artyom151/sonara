import { CastButton } from '../components/CastButton';
import { togglePlay, setVolume } from '../../player/engine';
import { useLibrary } from '../../store/library';
import { usePlayer } from '../../store/player';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { Art, Marquee, Slider } from '../components/controls';
import { Scrubber } from '../components/Player';
import { goToArtist } from '../artists';
import { fmtTime, useT } from '../i18n';
import {
  IconBackward,
  IconForward,
  IconHeart,
  IconMore,
  IconPause,
  IconPlay,
  IconQueue,
  IconQuote,
  IconRepeat,
  IconShuffle,
  IconSpeaker,
  IconSpeakerLow,
} from '../icons';

/** Time label isolated from the bar so 4×/s time updates re-render only this span. */
function TimeLabel({ kind }: { kind: 'position' | 'duration' }) {
  const v = usePlayer((s) => Math.floor(kind === 'position' ? s.position : s.duration));
  return <span>{fmtTime(v)}</span>;
}

/** Desktop bottom player: track | transport + progress | lyrics, queue, volume. */
export function PlayerBar() {
  const t = useT();
  const track = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const loading = usePlayer((s) => s.loading);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const volume = usePlayer((s) => s.volume);
  const liked = useLibrary((s) => (track ? s.likes.some((x) => x.key === track.key) : false));
  const open = useUi((s) => s.open);
  const expanded = usePlayer((s) => s.expanded);
  const lyricsPanel = useSettings((s) => s.lyricsPanel);
  // Lyrics live in the full-screen player's side column; this button opens or toggles it.
  const lyricsOn = expanded && lyricsPanel;
  const toggleLyrics = () => {
    if (!expanded) {
      useSettings.getState().set({ lyricsPanel: true });
      usePlayer.getState().setExpanded(true);
    } else useSettings.getState().set({ lyricsPanel: !lyricsPanel });
  };

  return (
    <footer className={`pbar glass refract ${track ? '' : 'idle'}`}>
      <div className="pbar-inner">
        <div className="pbar-track">
          {track ? (
            <>
              <button className="pbar-art" onClick={() => usePlayer.getState().setExpanded(true)} aria-label="Open player">
                <Art src={track.artwork} seed={track.key} />
              </button>
              <div className="pbar-meta">
                <Marquee className="pbar-title" text={track.title} />
                <button className="pbar-artist link" onClick={(e) => goToArtist(track, e.currentTarget.getBoundingClientRect())}>
                  {track.artist}
                </button>
              </div>
              <button className="pbar-icon" aria-label="More" onClick={(e) => open({ type: 'track', track, anchor: e.currentTarget.getBoundingClientRect() })}>
                <IconMore size={18} />
              </button>
              <button className={`pbar-icon ${liked ? 'liked' : ''}`} aria-label={t('like')} onClick={() => useLibrary.getState().toggleLike(track)}>
                <IconHeart size={19} filled={liked} />
              </button>
            </>
          ) : (
            <div className="pbar-artist">Sonara</div>
          )}
        </div>

        <div className="pbar-center">
          <div className="pbar-transport">
            <button className={`pbar-icon ${shuffle ? 'on' : ''}`} aria-label={t('shuffle')} onClick={() => usePlayer.getState().toggleShuffle()}>
              <IconShuffle size={18} />
            </button>
            <button className="pbar-icon big" aria-label="Previous" onClick={() => usePlayer.getState().prev()} disabled={!track}>
              <IconBackward size={22} />
            </button>
            <button className="pbar-play" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay} disabled={!track}>
              {loading && playing ? <span className="spinner dark" /> : playing ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>
            <button className="pbar-icon big" aria-label="Next" onClick={() => usePlayer.getState().next()} disabled={!track}>
              <IconForward size={22} />
            </button>
            <button className={`pbar-icon ${repeat !== 'off' ? 'on' : ''}`} aria-label={t('repeat')} onClick={() => usePlayer.getState().cycleRepeat()}>
              <IconRepeat size={18} one={repeat === 'one'} />
            </button>
          </div>
          <div className="pbar-progress">
            <TimeLabel kind="position" />
            <Scrubber compact />
            <TimeLabel kind="duration" />
          </div>
        </div>

        <div className="pbar-right">
          <button className={`pbar-icon ${lyricsOn ? 'on' : ''}`} aria-label={t('lyrics')} title={t('lyrics')} onClick={toggleLyrics} disabled={!track}>
            <IconQuote size={18} />
          </button>
          <button className="pbar-icon" aria-label={t('queue')} onClick={() => open({ type: 'queue' })}>
            <IconQueue size={18} />
          </button>
          <CastButton className="pbar-icon" size={18} />
          <div className="pbar-volume">
            <Slider
              value={volume}
              onChange={setVolume}
              left={
                <button className="pbar-icon" aria-label={t('volume')} onClick={() => setVolume(volume > 0 ? 0 : 1)}>
                  {volume < 0.4 ? <IconSpeakerLow size={18} /> : <IconSpeaker size={18} />}
                </button>
              }
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
