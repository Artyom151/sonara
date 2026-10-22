import test from 'node:test';
import assert from 'node:assert/strict';
import type { Track } from '../src/core/types';
import { features, makeCtx, mix, strongTasteMatch, type Candidate, type Profile } from '../src/player/taste';

const track = (key: string, artist: string, genre: string): Track => ({ key, id:key, source:'soundcloud', title:key, artist, genre, duration:180 });
const liked = track('liked', 'Favourite', 'ambient');
const profile: Profile = {};
mix(profile, features(liked), 1);
const ctx = makeCtx([liked], profile);
const candidate = (t: Track): Candidate => ({ track:t, related:1, votes:1, via:['liked'] });

test('rejects unrelated tracks despite a related-list hit', () => {
  assert.equal(strongTasteMatch(candidate(track('random', 'Stranger', 'hard techno')), ctx), false);
});
test('accepts matching genre or favourite artist', () => {
  assert.equal(strongTasteMatch(candidate(track('similar', 'Another', 'ambient')), ctx), true);
  assert.equal(strongTasteMatch(candidate(track('artist', 'Favourite', 'electronic')), ctx), true);
});
