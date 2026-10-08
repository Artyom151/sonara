import { BotGuardClient } from 'bgutils-js/botguard';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { buildURL, getHeaders, parseLooseJSON, USER_AGENT } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import type { Fetcher } from './types';

/**
 * YouTube PO tokens (no keys, no account).
 *
 * YouTube's streaming servers cut a stream off after ~1.2 MB unless its URL carries a `pot`
 * token. The token is minted by BotGuard, the anti-abuse VM youtube.com runs. BotGuard attests
 * the origin of the page it runs on, so it must run on https://www.youtube.com:
 *  - apps: a provider hosts it in a hidden page with that origin (platform/pot.ts registers it:
 *    desktop = hidden window, Android = invisible WebView; both run src/core/pot-page.ts);
 *  - Node server: jsdom emulates the page (url https://www.youtube.com).
 * Based on bgutils-js (MIT, LuanRT).
 */
export type PoTokenProvider = (videoId: string) => Promise<string>;

let provider: PoTokenProvider | null = null;
/** The apps register how to mint on their platform (see platform/pot.ts). */
export const setPoTokenProvider = (p: PoTokenProvider) => void (provider = p);

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
let minter: { m: WebPoMinter; until: number } | null = null;
let pending: Promise<WebPoMinter> | null = null;

/** Node (server): jsdom is loaded only there, never bundled for the apps. */
async function createNodeMinter(fetcher: Fetcher): Promise<WebPoMinter> {
  const page = await (await fetcher('https://www.youtube.com', { headers: { accept: '*/*', 'accept-language': 'en-US,en;q=0.7', 'user-agent': USER_AGENT } })).text();
  const cfg = page.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
  const att = page.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/)?.[1];
  const challenge = att && (parseLooseJSON(att) as any).R?.bgChallenge;
  if (!cfg || !challenge) throw new Error('BotGuard challenge not found on the YouTube page');

  const name = 'jsdom';
  const { JSDOM } = (await import(/* @vite-ignore */ name)) as typeof import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>', {
    url: 'https://www.youtube.com',
    referrer: 'https://www.youtube.com/',
    userAgent: USER_AGENT,
  } as ConstructorParameters<typeof JSDOM>[1]);
  (dom.window as any).yt = { config_: JSON.parse(cfg) };
  Object.assign(globalThis, { yt: (dom.window as any).yt, window: dom.window, document: dom.window.document, location: dom.window.location, origin: dom.window.origin });
  if (!('navigator' in globalThis)) Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator });

  const src = await (await fetcher(`https:${challenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue}`)).text();
  new Function(src)();
  const bg = await BotGuardClient.create({ program: challenge.program, globalName: challenge.globalName, globalObject: globalThis });
  const webPoSignalOutput: WebPoSignalOutput = [];
  const snapshot = await bg.snapshot({ webPoSignalOutput });
  const res = await fetcher(buildURL('GenerateIT', true), { method: 'POST', headers: getHeaders(), body: JSON.stringify([REQUEST_KEY, snapshot]) });
  const it = (await res.json()) as any[];
  if (typeof it?.[0] !== 'string') throw new Error('No integrity token');
  const m = await WebPoMinter.create({ integrityToken: it[0], estimatedTtlSecs: it[1], mintRefreshThreshold: it[2], websafeFallbackToken: it[3] }, webPoSignalOutput);
  minter = { m, until: Date.now() + Math.max(600, (Number(it[1]) || 43200) - 300) * 1000 };
  return m;
}

/** `pot` for a video id. Throws where no provider exists (plain browser tab). */
export async function poToken(fetcher: Fetcher, videoId: string): Promise<string> {
  if (provider) return provider(videoId);
  if (typeof document !== 'undefined') throw new Error('PO token provider not available');
  if (!minter || Date.now() > minter.until) {
    // The first attempt occasionally fails on a network hiccup; retry once.
    pending ??= createNodeMinter(fetcher)
      .catch(() => createNodeMinter(fetcher))
      .finally(() => (pending = null));
    await pending;
  }
  return minter!.m.mintAsWebsafeString(videoId);
}
