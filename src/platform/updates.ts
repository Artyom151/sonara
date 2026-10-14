import { create } from 'zustand';
import { isAndroid, isTauri } from '.';

/**
 * Update check against GitHub Releases (Artyom151/sonara) on every native platform. Picks the
 * asset for this platform; the UI offers it in a short, dismissible notice (UpdateNotice, or the
 * island when the island player is on). Checked shortly after start and every 6 hours.
 * `VITE_UPDATE_FEED` points the check at another release JSON, or is one inline (for tests).
 */
export const REPO = 'Artyom151/sonara';
const FEED: string = import.meta.env?.VITE_UPDATE_FEED || `https://api.github.com/repos/${REPO}/releases/latest`;
const DISMISSED = 'sonara.update.dismissed';
const CHECK_EVERY = 6 * 60 * 60 * 1000;

export interface UpdateInfo {
  version: string;
  pageUrl: string;
  downloadUrl: string;
}

interface UpdateState {
  status: 'idle' | 'checking' | 'latest' | 'available' | 'error';
  info: UpdateInfo | null;
  /** Version the user closed the notice for (it comes back for the next one). */
  dismissed: string | null;
  check: (manual?: boolean) => Promise<void>;
  dismiss: () => void;
}

const parse = (v: string) => v.replace(/^v/, '').split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
/** true when a > b (semver, pre-releases sort before releases). */
export function newer(a: string, b: string) {
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return ((A[i] as number) ?? 0) > ((B[i] as number) ?? 0);
  if (A.length === 3 && B.length > 3) return true;
  if (A.length > 3 && B.length === 3) return false;
  return String(A.slice(3)) > String(B.slice(3));
}

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const isIos = /iPhone|iPad/.test(ua);
export const updatesSupported = isTauri || isAndroid || isIos;

function pickAsset(assets: { name: string; browser_download_url: string }[]) {
  const find = (re: RegExp) => assets.find((a) => re.test(a.name))?.browser_download_url;
  if (isAndroid) return find(/android\.apk$/i);
  if (isIos) return find(/\.ipa$/i);
  if (/Windows/.test(ua)) return find(/setup\.exe$/i) ?? find(/\.msi$/i);
  if (/Mac OS X|Macintosh/.test(ua)) return find(/\.dmg$/i);
  // Linux: glibc (AppImage / deb / rpm) or musl (Alpine) cannot be told apart here: the release page.
  return undefined;
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode: the notice just comes back next start */
  }
};

async function fetchRelease() {
  // Plain fetch: the GitHub API (and the test feed) answer with CORS headers.
  const r = await fetch(FEED, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Turn a GitHub release JSON into the store state. `show`: bring the notice back even if closed. */
function apply(j: any, show: boolean) {
  const { setState } = useUpdates;
  const version = String(j.tag_name ?? '').replace(/^v/, '');
  if (!version || !newer(version, __APP_VERSION__)) return setState({ status: 'latest', info: null });
  const info: UpdateInfo = { version, pageUrl: j.html_url, downloadUrl: pickAsset(j.assets ?? []) ?? j.html_url };
  if (show) {
    write(DISMISSED, null);
    setState({ dismissed: null });
  }
  setState({ status: 'available', info });
}

export const useUpdates = create<UpdateState>((set, get) => ({
  status: 'idle',
  info: null,
  dismissed: read(DISMISSED),
  async check(manual = false) {
    if (get().status === 'checking') return;
    set({ status: 'checking' });
    try {
      // Native fetch: no CORS / mixed-content limits (the test feed is plain http on Android).
      apply(FEED.startsWith('{') ? JSON.parse(FEED) : await fetchRelease(), manual);
    } catch {
      set({ status: manual ? 'error' : 'idle' });
    }
  },
  dismiss() {
    const v = get().info?.version ?? null;
    write(DISMISSED, v);
    set({ dismissed: v });
  },
}));

/** The update to announce now, if any. */
export const usePendingUpdate = () => useUpdates((s) => (s.status === 'available' && s.info && s.dismissed !== s.info.version ? s.info : null));

if (updatesSupported) {
  setTimeout(() => void useUpdates.getState().check(), 5000);
  setInterval(() => void useUpdates.getState().check(), CHECK_EVERY);
}

// Dev only, opt-in (VITE_FAKE_FEEDS=1): scripts/fake-update.mjs serves a pretend release here; every start
// of the script (a new nonce) shows the notice again in the running app, no restart needed.
if (import.meta.env?.DEV && updatesSupported && import.meta.env.VITE_FAKE_FEEDS) {
  let lastNonce: unknown;
  setInterval(async () => {
    try {
      const r = await fetch('http://127.0.0.1:8787/');
      const j = await r.json();
      if (j.nonce === lastNonce) return;
      lastNonce = j.nonce;
      apply(j, true);
    } catch {
      /* no fake feed running */
    }
  }, 2500);
}
