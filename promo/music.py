"""Original background track for the Sonara promo (synthesised, royalty-free).

120 BPM, A minor (Am – F – C – G). Intro riser, drop at DROP seconds, outro hit.
    python3 promo/music.py  ->  promo/audio/music.wav
"""
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
DUR = 30.5
DROP = 3.4          # app reveal
BREAK = (21.4, 22.4)  # short breath before the platform scene
OUTRO = 26.0

n = int(SR * DUR)
t = np.arange(n) / SR
rng = np.random.default_rng(7)


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def env_adsr(length, a=0.01, d=0.1, s=0.6, r=0.2):
    L = int(length * SR)
    e = np.ones(L) * s
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    e[:A] = np.linspace(0, 1, A, endpoint=False) if A else e[:A]
    e[A:A + D] = np.linspace(1, s, D, endpoint=False)[: max(0, min(D, L - A))]
    if R and L > R:
        e[-R:] *= np.linspace(1, 0, R)
    return e


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (sweeps)."""
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def saw(freq, tt):
    return 2 * ((tt * freq) % 1) - 1


def place(buf, sig, start):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


CHORDS = [  # (root, chord tones) per bar (2 s)
    (45, [57, 60, 64]),  # Am
    (41, [53, 57, 60]),  # F
    (48, [55, 60, 64]),  # C
    (43, [55, 59, 62]),  # G
]
BAR = 4 * BEAT


def chord_at(time):
    return CHORDS[int(time // BAR) % 4]


# ── Pad: detuned saws, filter opens through the intro ──
pad = np.zeros(n)
for b in range(int(DUR // BAR) + 1):
    root, tones = CHORDS[b % 4]
    seg = np.arange(int(BAR * SR)) / SR
    s = np.zeros_like(seg)
    for m in tones:
        for det in (-0.12, 0.0, 0.11):
            s += saw(note(m + det), seg + rng.random())
    s *= env_adsr(BAR, a=0.4, d=0.4, s=0.85, r=0.5) / 9
    place(pad, s, b * BAR)
cut = np.interp(t, [0, DROP, OUTRO, DUR], [350, 2600, 2600, 700])
pad = lowpass(pad, cut) * 0.55

# ── Sidechain envelope (pumps pad + bass on every kick after the drop) ──
side = np.ones(n)
kick_times = [k * BEAT for k in range(int(DUR / BEAT)) if DROP - 0.01 <= k * BEAT < OUTRO and not (BREAK[0] <= k * BEAT < BREAK[1])]
pump = 1 - 0.65 * np.exp(-np.arange(int(BEAT * SR)) / SR / 0.11)
for kt in kick_times:
    i = int(kt * SR)
    j = min(n, i + len(pump))
    side[i:j] = np.minimum(side[i:j], pump[: j - i])

# ── Kick ──
drums = np.zeros(n)
kl = np.arange(int(0.32 * SR)) / SR
kick = np.sin(2 * np.pi * np.cumsum(45 + 110 * np.exp(-kl / 0.035)) / SR) * np.exp(-kl / 0.12)
kick += 0.3 * np.sin(2 * np.pi * 1800 * kl) * np.exp(-kl / 0.004)  # click
for kt in kick_times:
    place(drums, kick * 0.95, kt)

# ── Hats (offbeats) and claps (2 & 4) ──
hl = int(0.05 * SR)
hat_noise = rng.standard_normal(hl)
hat = (hat_noise - lowpass(hat_noise, 7000)) * np.exp(-np.arange(hl) / SR / 0.012)
cl = int(0.2 * SR)
clap_noise = rng.standard_normal(cl)
clap = lowpass(clap_noise - lowpass(clap_noise, 900), 4000) * np.exp(-np.arange(cl) / SR / 0.05)
for k in range(int(DUR / (BEAT / 2))):
    time = k * BEAT / 2
    if not (DROP <= time < OUTRO) or BREAK[0] <= time < BREAK[1]:
        continue
    if k % 2 == 1:
        place(drums, hat * 0.35, time)
    if k % 4 == 2:
        place(drums, clap * 0.55, time)

# ── Sub bass (root, eighth notes) ──
bass = np.zeros(n)
el = int(BEAT / 2 * SR)
for k in range(int(DUR / (BEAT / 2))):
    time = k * BEAT / 2
    if not (DROP <= time < OUTRO) or BREAK[0] <= time < BREAK[1]:
        continue
    root, _ = chord_at(time)
    seg = np.arange(el) / SR
    s = np.sin(2 * np.pi * note(root - 12) * seg) + 0.25 * np.sin(2 * np.pi * note(root) * seg)
    place(bass, s * env_adsr(BEAT / 2, a=0.005, d=0.05, s=0.8, r=0.05) * 0.5, time)

# ── Pluck arpeggio (16ths) after the drop ──
arp = np.zeros(n)
pl = int(0.22 * SR)
pattern = [0, 1, 2, 1, 2, 0, 1, 2]
for k in range(int(DUR / (BEAT / 4))):
    time = k * BEAT / 4
    if not (DROP + BAR <= time < OUTRO) or BREAK[0] <= time < BREAK[1]:
        continue
    _, tones = chord_at(time)
    m = tones[pattern[k % 8]] + 12
    seg = np.arange(pl) / SR
    s = (np.sign(np.sin(2 * np.pi * note(m) * seg)) * 0.4 + np.sin(2 * np.pi * note(m) * seg)) * np.exp(-seg / 0.06)
    place(arp, s * 0.12, time)
arp = lowpass(arp, 3200)

# ── FX: intro riser, impact at the drop, outro hit ──
fx = np.zeros(n)
rl = int(DROP * SR)
riser_noise = rng.standard_normal(rl)
rise = np.linspace(0, 1, rl) ** 2
fx[:rl] += lowpass(riser_noise, 300 + 6000 * rise) * rise * 0.35
il = int(1.6 * SR)
seg = np.arange(il) / SR
impact = (np.sin(2 * np.pi * np.cumsum(30 + 80 * np.exp(-seg / 0.08)) / SR) * np.exp(-seg / 0.5)
          + lowpass(rng.standard_normal(il), 2500) * np.exp(-seg / 0.25) * 0.4)
place(fx, impact * 0.7, DROP)
place(fx, impact * 0.6, OUTRO)

mix = (pad + bass) * side + drums + arp * side + fx
# Fades + soft clip
mix *= np.interp(t, [0, 0.05, DUR - 1.8, DUR], [0, 1, 1, 0])
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89

out = Path(__file__).parent / 'audio' / 'music.wav'
out.parent.mkdir(exist_ok=True)
stereo = np.stack([mix, np.roll(mix, int(0.008 * SR)) * 0.98], axis=1)  # tiny Haas widening
with wave.open(str(out), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype('<i2').tobytes())
print(f'wrote {out} ({DUR}s)')
