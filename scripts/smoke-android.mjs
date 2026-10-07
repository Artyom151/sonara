// Smoke test: phone layout on ~6.1" Android screens (headless Chromium, mobile emulation).
//
//   pnpm build && pnpm smoke:android
//
// Uses system Chromium when present (CHROME_PATH, /usr/bin/chromium, Chrome on Windows/macOS),
// otherwise Playwright's bundled browser (`pnpm exec playwright-core install chromium`).
// Screenshots land in smoke-results/<device>/<screen>.png; exit code 1 on any failed check.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = Number(process.env.SMOKE_PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = 'smoke-results';

// CSS-pixel viewports of common 6.1–6.3" Android phones (+ a small one as a safety margin).
const DEVICES = [
  { name: 'galaxy-s23-6.1in', width: 360, height: 780, dpr: 3 },
  { name: 'pixel-7a-6.1in', width: 412, height: 915, dpr: 2.625 },
  { name: 'xiaomi-6.1in', width: 393, height: 873, dpr: 2.75 },
  { name: 'compact-360x740', width: 360, height: 740, dpr: 3 },
];

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const browserPath =
  process.env.CHROME_PATH ||
  ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(
    (p) => existsSync(p),
  );

if (!existsSync('dist/index.html')) {
  console.error('dist/ not found — run `pnpm build` first.');
  process.exit(1);
}

// Local Sonara server serves dist/ and /api.
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

const failures = [];
const check = (device, screen, ok, msg) => {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(18)} ${screen.padEnd(9)} ${msg}`;
  console.log(line);
  if (!ok) failures.push(line);
};

/** Layout assertions shared by every screen. */
async function assertLayout(page, device, screen) {
  const r = await page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height };
    };
    const overflow = [...document.querySelectorAll('.screen')]
      .filter((s) => getComputedStyle(s.parentElement).display !== 'none')
      .some((s) => s.scrollWidth > s.clientWidth + 1);
    const small = [...document.querySelectorAll('.tab, .mini-btn, .ctl, .glass-icon')]
      .filter((el) => el.offsetParent)
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width && (b.width < 36 || b.height < 36)).length;
    return {
      vw,
      vh,
      docOverflow: document.documentElement.scrollWidth > vw + 1,
      overflow,
      tabbar: rect('.tabbar'),
      mini: rect('.mini'),
      card: rect('.player-card'),
      foot: rect('.player-foot'),
      small,
    };
  });
  check(device, screen, !r.docOverflow && !r.overflow, 'no horizontal overflow');
  if (screen !== 'player') {
    check(device, screen, !!r.tabbar && r.tabbar.bottom <= r.vh && r.tabbar.top > r.vh * 0.75, 'tab bar fully visible at the bottom');
    if (r.mini && r.tabbar) check(device, screen, r.mini.bottom <= r.tabbar.top + 1, 'mini player sits above the tab bar');
  } else {
    check(device, screen, !!r.card && r.card.left >= 0 && r.card.right <= r.vw, 'player card within width');
    check(device, screen, !!r.foot && r.foot.bottom <= r.vh, 'player controls within height');
  }
  check(device, screen, r.small === 0, `tap targets ≥ 36px (${r.small} too small)`);
}

async function run() {
  await waitForServer();
  const browser = await chromium.launch({ executablePath: browserPath, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl'] });
  for (const d of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dpr,
      isMobile: true,
      hasTouch: true,
      userAgent: UA,
      locale: 'ru-RU',
    });
    // Skip the startup animation.
    await ctx.addInitScript(() => localStorage.setItem('sonara.settings', JSON.stringify({ state: { showSplash: false }, version: 0 })));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const dir = `${OUT}/${d.name}`;
    mkdirSync(dir, { recursive: true });
    const shot = (name) => page.screenshot({ path: `${dir}/${name}.png` });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.tabbar', { timeout: 15000 });
    // Wait for real data (cold start can take a few seconds), then let animations settle.
    await page.waitForSelector('.track-row', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await assertLayout(page, d.name, 'home');
    await shot('home');

    // Start a track so the mini player and the full player can be checked.
    const row = page.locator('.track-row').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(1500);
      await assertLayout(page, d.name, 'home+mini');
      await shot('home-mini');
      await page.locator('.mini').click();
      await page.waitForTimeout(1200);
      await assertLayout(page, d.name, 'player');
      await shot('player');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    } else check(d.name, 'home', false, 'no tracks loaded (network?)');

    for (const [i, name] of ['search', 'likes', 'profile'].entries()) {
      await page.locator('.tab').nth(i + 1).click();
      await page.waitForTimeout(900);
      await assertLayout(page, d.name, name);
      await shot(name);
    }

    // Auth sheet must fit the screen.
    const signIn = page.locator('.signin-actions .btn.primary');
    if (await signIn.count()) {
      await signIn.click();
      await page.waitForTimeout(900);
      const sheet = await page.evaluate(() => {
        const b = document.querySelector('.sheet')?.getBoundingClientRect();
        return b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right, vw: innerWidth, vh: innerHeight } : null;
      });
      check(d.name, 'auth', !!sheet && sheet.top >= 0 && sheet.bottom <= sheet.vh && sheet.right <= sheet.vw, 'auth sheet fits the screen');
      await shot('auth');
      await page.keyboard.press('Escape');
    }

    check(d.name, 'runtime', errors.length === 0, errors.length ? `JS errors: ${errors.slice(0, 2).join(' | ')}` : 'no JS errors');
    await ctx.close();
  }
  await browser.close();
}

run()
  .catch((e) => {
    console.error(e);
    failures.push(String(e));
  })
  .finally(() => {
    stop();
    console.log(`\n${failures.length ? `${failures.length} check(s) failed` : 'All checks passed'} — screenshots in ${OUT}/`);
    process.exit(failures.length ? 1 : 0);
  });
