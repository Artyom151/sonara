// Renders the Sonara TikTok promo (1080×1920, 30 fps, ~30 s) from scene.html.
//
//   python3 promo/music.py                 # background track  -> promo/audio/music.wav
//   (voiceover clips promo/audio/vo1..7.wav, see promo/README.md)
//   node promo/render.mjs                  # -> promo/out/sonara-tiktok.mp4
//   node promo/render.mjs --stills 1.5,9.5 # preview frames only -> promo/out/still-*.jpg
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'out');
const FRAMES = join(OUT, 'frames');
const FPS = 30;
const DURATION = 30.5;
// Voiceover placement (seconds) — must match VO in scene.html.
const VO_AT = [0.3, 3.5, 8.1, 12.7, 17.5, 21.5, 26.25];

const browserPath =
  process.env.CHROME_PATH ||
  ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(
    (p) => existsSync(p),
  );

const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(`${pathToFileURL(join(ROOT, 'scene.html')).href}?render=1`);
await page.evaluate(() => window.assetsReady());

if (stillsArg) {
  for (const t of stillsArg.split(',').map(Number)) {
    await page.evaluate((x) => window.renderFrame(x), t);
    await page.screenshot({ path: join(OUT, `still-${t.toFixed(1)}.jpg`), type: 'jpeg', quality: 88 });
    console.log(`still ${t}s`);
  }
  await browser.close();
  process.exit(0);
}

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const total = Math.round(DURATION * FPS);
const started = Date.now();
for (let f = 0; f < total; f++) {
  await page.evaluate((x) => window.renderFrame(x), f / FPS);
  await page.screenshot({ path: join(FRAMES, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
  if (f % 90 === 0) console.log(`frame ${f}/${total}  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
}
await browser.close();

// Audio: voiceover at its cue points + sound effects + music ducked under the voice; loudness for TikTok.
//   MUSIC=/path/to/licensed-track.mp3 node promo/render.mjs   -> use another (licensed) music track
const MUSIC = process.env.MUSIC || join(ROOT, 'audio', 'music.wav');
const vo = VO_AT.map((_, i) => join(ROOT, 'audio', `vo${i + 1}.wav`));

function encode(output, withMusic) {
  // inputs: 0 video, 1 sfx, 2.. voice, last music (optional)
  const inputs = ['-framerate', String(FPS), '-i', join(FRAMES, '%05d.jpg'), '-i', join(ROOT, 'audio', 'sfx.wav'), ...vo.flatMap((v) => ['-i', v])];
  if (withMusic) inputs.push('-i', MUSIC);
  const musicIdx = 2 + vo.length;
  const voChains = vo.map((_, i) => `[${i + 2}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(VO_AT[i] * 1000)}|${Math.round(VO_AT[i] * 1000)},volume=1.6[v${i}]`);
  const filter = [
    ...voChains,
    `${vo.map((_, i) => `[v${i}]`).join('')}amix=inputs=${vo.length}:normalize=0,highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=120[voice]`,
    `[voice]asplit=2[voiceA][voiceB]`,
    `[1:a]volume=0.7[sfx]`,
    withMusic
      ? `[${musicIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.55[music];[music][sfx]amix=inputs=2:normalize=0[bed]`
      : `[sfx]anull[bed]`,
    `[bed][voiceA]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[ducked]`,
    `[ducked][voiceB]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=9[aout]`,
  ].join(';');
  const ff = spawnSync(
    'ffmpeg',
    ['-y', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-t', String(DURATION), output],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (ff.status !== 0) process.exit(ff.status ?? 1);
  console.log(`\n✓ ${resolve(output)}`);
}

encode(join(OUT, 'sonara-tiktok.mp4'), true);
// Same cut without music: add a track from TikTok's sound library when posting.
encode(join(OUT, 'sonara-tiktok-no-music.mp4'), false);
rmSync(FRAMES, { recursive: true, force: true });
