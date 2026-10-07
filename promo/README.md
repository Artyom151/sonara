# Sonara — TikTok promo (9:16, ~30 s)

Outputs (1080×1920, 30 fps, H.264 + AAC, loudness −14 LUFS for TikTok):

- `promo/out/sonara-tiktok.mp4` — voice + sound effects + original music.
- `promo/out/sonara-tiktok-no-music.mp4` — voice + sound effects only: add a track from TikTok's sound library when posting.

## Pieces

| File | What |
|---|---|
| `scene.html` | The whole animation: 7 scenes, kinetic type, camera moves over the app screenshots, captions synced to the voice. Open it in Chrome to preview in real time, or add `?t=12.5` to see one frame. |
| `voiceover.txt` | Voiceover lines (one per scene). |
| `audio/vo1..7.wav` | Generated voiceover clips. |
| `music.py` | Original synthesised background track (120 BPM, Am–F–C–G) → `audio/music.wav`. |
| `sfx.py` | Original sound-design layer (whooshes, impacts, pops, sparkles) cued to the animation → `audio/sfx.wav`. |
| `tts-fish.mjs` + `voiceover-fish.txt` | Voiceover via Fish Audio (key + voice id in `promo/.env`, git-ignored). |
| `render.mjs` | Renders frames with headless Chromium and muxes video + ducked music + voice with ffmpeg. |

Screenshots come from `../photos/`. `track-with-lyrics.png` is intentionally **not used**: it shows another artist's song lyrics in full, which an ad may not reproduce.

## Rebuild

```bash
node promo/tts-fish.mjs                   # voiceover (Fish Audio) -> audio/fish-raw → trim + 1.06× tempo, see below
python3 promo/sfx.py                      # sound effects
python3 promo/music.py                    # music
node promo/render.mjs --stills 2,9.8,15.6 # preview frames -> promo/out/still-*.jpg
node promo/render.mjs                     # full render  -> promo/out/sonara-tiktok.mp4
```

Needs Node, ffmpeg (libx264) and Chromium/Chrome (`CHROME_PATH` to override).

## Voiceover (Fish Audio — current)

`promo/.env`:
```
FISH_API_KEY=sk-fish-...
FISH_VOICE_ID=7312c38557eb4fb384e3874e8e9cea67
```
`node promo/tts-fish.mjs` writes `audio/vo1..7.wav` (resume with `FROM=4`). The clips are then trimmed and sped up slightly so each fits its scene:
```bash
cd promo/audio && for i in 1 2 3 4 5 6 7; do cp vo$i.wav fish-raw/vo$i.wav; ffmpeg -y -i fish-raw/vo$i.wav \
  -af "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.06,areverse,atempo=1.06" -ar 44100 vo$i.wav; done
```
If durations change, update `VO` in scene.html and `VO_AT` in render.mjs.

## Music

`music.py` is an original track. To use another one you **have a licence for**: `MUSIC=/path/track.mp3 node promo/render.mjs`.
Jobii — "Mango Fizz" is "all rights reserved" on SoundCloud (no download, no licence offered), so it is not bundled; get permission from the artist, or pick it from TikTok's sound library on the no-music cut.

## Voiceover (Piper TTS, offline alternative)

Voice: **ru_RU-dmitri-medium** (Piper). Its training dataset is CC0, so it can be used in ads.
Alternative: `ru_RU-denis-medium` (also CC0). Avoid `ruslan` (CC BY-NC-SA, non-commercial) and `irina` (unknown licence).

```bash
# https://github.com/rhasspy/piper/releases  (piper_linux_x86_64.tar.gz)
# https://huggingface.co/rhasspy/piper-voices/tree/main/ru/ru_RU/dmitri/medium
i=0; grep -v '^#' promo/voiceover.txt | while IFS= read -r line; do i=$((i+1));
  echo "$line" | ./piper/piper --model ru_RU-dmitri-medium.onnx --length_scale 0.92 --sentence_silence 0.15 --output_file promo/audio/vo$i.wav; done
```

If you change a line, update its start time / duration in `VO` (scene.html) and `VO_AT` (render.mjs) if it gets much longer.

On Alpine (musl) the Piper binary needs glibc's `libstdc++.so.6` / `libgcc_s.so.1` next to it (`LD_LIBRARY_PATH`); Debian bullseye's `libstdc++6` package works with `gcompat`.

## Before publishing as a paid ad

The screenshots show third-party album covers and track/artist names (SoundCloud content) and mention SoundCloud/YouTube by name. For organic posts this is usually fine; for paid TikTok ads consider screenshots with neutral artwork and check the platforms' brand guidelines.
