import { nativeFetch } from '../platform';
import { localStore } from '../platform/storage';
import { useSettings } from '../store/settings';
import { createHttpApi } from './http-client';
import type { ApiOptions, SonaraApi } from './types';

export * from './types';

const options = (): ApiOptions => {
  const s = useSettings.getState();
  return { youtubeApiKey: s.youtubeApiKey || undefined, region: s.region, sources: s.sources };
};

/**
 * Android / desktop run the backend in-process with a CORS-free native fetch.
 * It is loaded lazily (no top-level await), so the UI paints immediately and the
 * backend chunk downloads/parses in parallel; every call simply awaits it.
 */
function lazyCoreApi(): SonaraApi {
  let core: Promise<SonaraApi> | null = null;
  const load = () =>
    (core ??= import('./api').then(({ createCoreApi }) => {
      const c = createCoreApi(nativeFetch!, localStore, {
        yandex: () => import.meta.env.VITE_YANDEX_MUSIC_TOKEN || undefined,
        vk: () => import.meta.env.VITE_VK_TOKEN || undefined,
      });
      return {
        ...c,
        home: (o) => c.home({ ...options(), ...o }),
        search: (q, src, o) => c.search(q, src, { ...options(), ...o }),
      } satisfies SonaraApi;
    }));
  // Start fetching right away, without blocking the first render.
  queueMicrotask(load);
  const call =
    <K extends keyof SonaraApi>(k: K) =>
    (...args: Parameters<SonaraApi[K]>) =>
      load().then((a) => (a[k] as (...x: unknown[]) => unknown)(...args)) as ReturnType<SonaraApi[K]>;
  return {
    home: call('home'),
    genre: call('genre'),
    playlist: call('playlist'),
    search: call('search'),
    related: call('related'),
    stream: call('stream'),
    lyrics: call('lyrics'),
    likers: call('likers'),
    tagTracks: call('tagTracks'),
    clientId: call('clientId'),
    artist: call('artist'),
  };
}

export const api: SonaraApi = nativeFetch ? lazyCoreApi() : createHttpApi(import.meta.env.VITE_API_BASE ?? '', options);
