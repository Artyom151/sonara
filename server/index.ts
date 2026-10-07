/**
 * Sonara local API server (Hono). Used by the web build and during development.
 * Android and desktop builds run the same core in-process with a native fetch.
 *
 *   GET /api/home            trending genres, mixes, picks, YouTube trending
 *   GET /api/genre?urn=      SoundCloud "trending by genre" playlist
 *   GET /api/playlist?source=&id=
 *   GET /api/search?q=&source=all|soundcloud|youtube
 *   GET /api/related?track=  (JSON-encoded track)
 *   GET /api/stream?track=   -> { url, kind }
 *   GET /api/yt/stream/:id   proxied YouTube audio (Range supported)
 *   GET /api/tag?tag=        popular SoundCloud tracks for a genre / tag
 *   GET /api/lyrics?track=
 *   GET /api/likers?track=
 *   GET /api/client-id?refresh=1
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCoreApi } from '../src/core/api';
import type { ApiOptions, Source, Track } from '../src/core/types';

const api = createCoreApi((url, init) => fetch(url, init));
const app = new Hono();

app.use('/api/*', cors());

const opts = (c: Context): ApiOptions => ({
  youtubeApiKey: c.req.header('x-yt-key') || undefined,
  region: c.req.header('x-region') || undefined,
  sources: {
    soundcloud: c.req.header('x-src-sc') !== '0',
    youtube: c.req.header('x-src-yt') !== '0',
  },
});

const track = (c: Context): Track => JSON.parse(c.req.query('track') ?? '{}');

const handle = (fn: (c: Context) => Promise<unknown>) => async (c: Context) => {
  try {
    return c.json(await fn(c));
  } catch (e) {
    console.error(e);
    return c.json({ error: (e as Error).message }, 502);
  }
};

app.get('/api/health', (c) => c.json({ ok: true, name: 'sonara' }));
app.get('/api/home', handle((c) => api.home(opts(c))));
app.get('/api/genre', handle((c) => api.genre(c.req.query('urn')!)));
app.get('/api/playlist', handle((c) => api.playlist(c.req.query('source') as Source, c.req.query('id')!)));
app.get(
  '/api/search',
  handle((c) => api.search(c.req.query('q') ?? '', (c.req.query('source') as Source | 'all') ?? 'all', opts(c))),
);
app.get('/api/related', handle((c) => api.related(track(c))));
app.get('/api/tag', handle((c) => api.tagTracks(c.req.query('tag') ?? '')));
app.get('/api/lyrics', handle((c) => api.lyrics(track(c))));
app.get('/api/likers', handle((c) => api.likers(track(c))));
app.get('/api/client-id', handle(async (c) => ({ clientId: await api.clientId(c.req.query('refresh') === '1') })));
app.get(
  '/api/stream',
  handle(async (c) => {
    const t = track(c);
    // googlevideo URLs are bound to the requesting client, so YouTube audio is proxied.
    if (t.source === 'youtube') return { url: `/api/yt/stream/${t.id}`, kind: 'progressive' };
    return api.stream(t);
  }),
);

const ytUrls = new Map<string, { url: string; mime?: string; at: number }>();
app.get('/api/yt/stream/:id', async (c) => {
  const id = c.req.param('id');
  let entry = ytUrls.get(id);
  if (!entry || Date.now() - entry.at > 60 * 60 * 1000) {
    try {
      const s = await api.stream({ key: `youtube:${id}`, id, source: 'youtube', title: '', artist: '', duration: 0 });
      entry = { url: s.url, mime: s.mime, at: Date.now() };
      ytUrls.set(id, entry);
    } catch (e) {
      return c.text((e as Error).message, 502);
    }
  }
  const headers: Record<string, string> = {};
  const range = c.req.header('range');
  if (range) headers.Range = range;
  const upstream = await fetch(entry.url, { headers });
  if (upstream.status === 403) ytUrls.delete(id);
  const out = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
  return new Response(upstream.body, { status: upstream.status, headers: out });
});

// Serve the built web app when it exists (pnpm build && pnpm start).
const dist = resolve(import.meta.dirname, '../dist');
if (existsSync(dist)) {
  app.use('/*', serveStatic({ root: dist }));
  app.get('*', serveStatic({ path: resolve(dist, 'index.html') }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, (i) =>
  console.log(`♪ Sonara server on http://${i.address}:${i.port}`),
);
