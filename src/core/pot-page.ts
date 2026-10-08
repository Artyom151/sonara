import { BotGuardClient } from 'bgutils-js/botguard';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { buildURL, getHeaders, parseLooseJSON } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';

/**
 * PO token minter that runs INSIDE a page whose origin is https://www.youtube.com.
 *
 * BotGuard attests the origin it runs on: on the app's own origin (localhost / tauri://) Google
 * answers with an empty integrity token, on youtube.com it answers with a valid one. Each
 * platform therefore hosts this script in a hidden browser page with that origin:
 *   desktop  src-tauri/src/pot.rs     hidden window on https://www.youtube.com/robots.txt
 *   Android  PoTokenPlugin.java       invisible WebView, loadDataWithBaseURL("https://www.youtube.com/")
 * and calls `window.__mintPot(videoId)`. Bundled to pot.js by scripts/build-pot.mjs.
 */
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

let minter: { m: WebPoMinter; until: number } | null = null;
let pending: Promise<WebPoMinter> | null = null;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('BotGuard interpreter failed to load'));
    (document.head ?? document.documentElement).appendChild(s);
  });

async function create(): Promise<WebPoMinter> {
  const page = await (await fetch('https://www.youtube.com/', { headers: { accept: '*/*', 'accept-language': 'en-US,en;q=0.7' } })).text();
  const cfg = page.match(/ytcfg\.set\(({.+?})\);/s)?.[1];
  const att = page.match(/window\.ytAtN\(\s*({[\s\S]*?})\s*\)/)?.[1];
  if (!cfg || !att) throw new Error('BotGuard challenge not found');
  const challenge = (parseLooseJSON(att) as any).R?.bgChallenge;
  if (!challenge) throw new Error('BotGuard challenge unavailable');
  (window as any).yt = { ...(window as any).yt, config_: JSON.parse(cfg) };
  await loadScript(`https:${challenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue}`);

  const bg = await BotGuardClient.create({ program: challenge.program, globalName: challenge.globalName, globalObject: window });
  const webPoSignalOutput: WebPoSignalOutput = [];
  const snapshot = await bg.snapshot({ webPoSignalOutput });
  const res = await fetch(buildURL('GenerateIT', true), { method: 'POST', headers: getHeaders(), body: JSON.stringify([REQUEST_KEY, snapshot]) });
  const it = (await res.json()) as any[];
  if (typeof it?.[0] !== 'string') throw new Error('No integrity token');
  const m = await WebPoMinter.create({ integrityToken: it[0], estimatedTtlSecs: it[1], mintRefreshThreshold: it[2], websafeFallbackToken: it[3] }, webPoSignalOutput);
  minter = { m, until: Date.now() + Math.max(600, (Number(it[1]) || 43200) - 300) * 1000 };
  return m;
}

(window as any).__mintPot = async (videoId: string): Promise<string> => {
  if (!minter || Date.now() > minter.until) {
    // The first attempt occasionally fails on a network hiccup; retry once.
    pending ??= create()
      .catch(() => create())
      .finally(() => (pending = null));
    await pending;
  }
  return minter!.m.mintAsWebsafeString(videoId);
};
