// Voiceover via Fish Audio TTS (https://docs.fish.audio). Reads promo/.env:
//   FISH_API_KEY=...   FISH_VOICE_ID=...   (optional) FISH_MODEL=s2.1-pro
//   node promo/tts-fish.mjs   ->  promo/audio/vo1..N.wav (one per line of voiceover.txt)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const key = process.env.FISH_API_KEY || env.FISH_API_KEY;
const voice = process.env.FISH_VOICE_ID || env.FISH_VOICE_ID;
const models = [process.env.FISH_MODEL || env.FISH_MODEL || 's2.1-pro', 's2.1-pro-free', 's1'];
if (!key || !voice) throw new Error('FISH_API_KEY / FISH_VOICE_ID missing in promo/.env');

// Fish handles Russian best with brand names spelled phonetically.
const lines = readFileSync(join(ROOT, 'voiceover-fish.txt'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));

const fetchRetry = async (url, init, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i)); // transient DNS / network errors
    }
  }
};

async function tts(text) {
  let last;
  for (const model of models) {
    const r = await fetchRetry('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model },
      body: JSON.stringify({ text, reference_id: voice, format: 'wav', sample_rate: 44100, temperature: 0.7, top_p: 0.7, normalize: true, latency: 'normal' }),
    });
    if (r.ok) return { model, audio: Buffer.from(await r.arrayBuffer()) };
    last = `${model}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`;
    if (r.status === 401) break;
  }
  throw new Error(last);
}

const from = Number(process.env.FROM ?? 1); // resume: FROM=4 regenerates vo4..
for (const [i, line] of lines.entries()) {
  if (i + 1 < from) continue;
  const { model, audio } = await tts(line);
  writeFileSync(join(ROOT, 'audio', `vo${i + 1}.wav`), audio);
  console.log(`vo${i + 1} (${model}): ${line}`);
}
