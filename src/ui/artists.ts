import type { Track } from '../core/types';
import { usePlayer } from '../store/player';
import { useUi } from '../store/ui';

/**
 * "X & Y", "X, Y", "X x Y", "X feat. Y", "X vs. Y", "X / Y"… → ["X", "Y"].
 * Featured artists from the title ("Song (feat. Z)") are added at the end.
 */
export function splitArtists(artist: string, title = ''): string[] {
  const sep = /\s*(?:,|;|&|\/|\s\+\s|\s+x\s+|\s+×\s+|\s+(?:feat\.?|ft\.?|featuring|vs\.?|with)\s+)\s*/i;
  const names = artist.split(sep);
  const feat = title.match(/[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)[)\]]/i)?.[1];
  if (feat) names.push(...feat.split(sep));
  const seen = new Set<string>();
  return names
    .map((n) => n.trim())
    .filter((n) => n && !/^(various artists|unknown artist)$/i.test(n))
    .filter((n) => !seen.has(n.toLowerCase()) && (seen.add(n.toLowerCase()), true));
}

/** Open one artist's page. The native id is only reliable when the track has a single artist. */
export function openArtistPage(track: Track, name: string, single: boolean) {
  usePlayer.getState().setExpanded(false);
  useUi.getState().push({
    name: 'artist',
    source: track.source,
    id: single ? track.artistId : undefined,
    artistName: name,
  });
}

/** Go to the track's artist; with several artists ask which one first. */
export function goToArtist(track: Track, anchor?: DOMRect) {
  const names = splitArtists(track.artist, track.title);
  if (names.length <= 1) return openArtistPage(track, names[0] ?? track.artist, true);
  useUi.getState().open({ type: 'artists', track, names, anchor });
}
