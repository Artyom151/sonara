"""Original sound-design layer for the Sonara promo (synthesised) -> promo/audio/sfx.wav.

Cue times match the animation in scene.html.
    python3 promo/sfx.py
"""
import wave
from pathlib import Path

import numpy as np

SR = 44100
DUR = 30.5
n = int(SR * DUR)
out = np.zeros((n, 2))
rng = np.random.default_rng(11)


def lp(x, cutoff):
    cutoff = np.broadcast_to(cutoff, x.shape)
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def hp(x, cutoff):
    return x - lp(x, cutoff)


def place(sig, at, gain=1.0, pan=0.0):
    """Mono signal at time `at`, equal-power pan (-1 left .. 1 right)."""
    i = int(at * SR)
    j = min(n, i + len(sig))
    if i >= n or j <= i:
        return
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    out[i:j, 0] += sig[: j - i] * gain * l
    out[i:j, 1] += sig[: j - i] * gain * r


def whoosh(length=0.55, rise=True, lo=300, hi=6000):
    L = int(length * SR)
    x = rng.standard_normal(L)
    s = np.linspace(0, 1, L)
    curve = s ** 1.6 if rise else (1 - s) ** 1.6
    sweep = lo + (hi - lo) * curve
    y = lp(hp(x, 150), sweep)
    env = np.sin(np.pi * np.clip(s if rise else s, 0, 1)) ** 2
    env *= (s ** 2.2) / (s ** 2.2 + 0.02) if rise else 1
    return y * env / (np.max(np.abs(y)) + 1e-9)


def impact(length=1.3):
    L = int(length * SR)
    t = np.arange(L) / SR
    body = np.sin(2 * np.pi * np.cumsum(32 + 70 * np.exp(-t / 0.06)) / SR) * np.exp(-t / 0.45)
    crack = lp(rng.standard_normal(L), 3000) * np.exp(-t / 0.05)
    return body * 0.9 + crack * 0.35


def pop(freq=900, length=0.12):
    L = int(length * SR)
    t = np.arange(L) / SR
    f = freq * (1 + 0.6 * np.exp(-t / 0.01))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035)


def chime(freq=1760, length=0.9):
    L = int(length * SR)
    t = np.arange(L) / SR
    s = sum(np.sin(2 * np.pi * freq * k * t) / k ** 1.4 for k in (1, 2.01, 3.03))
    return s * np.exp(-t / 0.22) * 0.5


def sparkle(length=1.2, density=38, base=2400):
    L = int(length * SR)
    s = np.zeros(L)
    for _ in range(int(density * length)):
        at = int(rng.random() * L * 0.85)
        f = base * (1 + rng.random() * 1.6)
        g = chime(f, 0.25)[: L - at] * (1 - at / L) * (0.4 + 0.6 * rng.random())
        s[at : at + len(g)] += g
    return s / (np.max(np.abs(s)) + 1e-9)


def blip(freq, length=0.16):
    L = int(length * SR)
    t = np.arange(L) / SR
    return (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t)) * np.exp(-t / 0.05) * np.minimum(1, t / 0.004)


def shimmer(length=2.2, base=1200):
    L = int(length * SR)
    t = np.arange(L) / SR
    s = sum(np.sin(2 * np.pi * base * r * t + rng.random() * 6) for r in (1, 1.5, 2, 2.5, 3))
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)
    env = np.sin(np.pi * t / length) ** 2
    return s / 5 * trem * env


# ── Cues ──
place(shimmer(2.2, 1400), 0.15, 0.10)                 # handwriting glimmer
place(whoosh(0.5, True, 400, 7000), 2.95, 0.30)       # zoom into the logo
place(impact(), 3.40, 0.55)                           # drop / app reveal
place(whoosh(0.7, False, 7000, 300), 3.42, 0.32)      # card flies in
for cut in (8.0, 12.6, 17.4, 21.4, 26.0):             # scene transitions
    place(whoosh(0.5, True, 300, 6500), cut - 0.45, 0.32, pan=-0.3)
    place(whoosh(0.6, False, 6000, 250), cut, 0.22, pan=0.3)
place(whoosh(0.9, True, 250, 3000), 8.45, 0.16)       # camera push-in (wave)
place(whoosh(0.9, True, 250, 3000), 13.25, 0.16)      # camera push-in (comments)
place(pop(980), 13.9, 0.40, pan=0.35)                 # comment 1
place(chime(1568, 0.6), 13.92, 0.10, pan=0.35)
place(pop(1180), 14.6, 0.40, pan=0.35)                # comment 2
place(chime(1976, 0.6), 14.62, 0.10, pan=0.35)
place(pop(720, 0.16), 15.5, 0.50)                     # heart
place(sparkle(1.1), 15.52, 0.16)
place(whoosh(0.5, True, 600, 8000), 19.25, 0.32, pan=-0.6)  # swipe to Likes
for k, f in enumerate((880, 1109, 1319)):             # Android / Windows / Linux chips
    place(blip(f), 22.6 + k * 0.45, 0.32, pan=(k - 1) * 0.5)
place(impact(1.6), 26.0, 0.35)                        # end card
place(shimmer(2.6, 1760), 26.05, 0.12)
place(sparkle(1.4, 30, 3000), 26.1, 0.10)

peak = np.max(np.abs(out)) + 1e-9
out = np.tanh(out / peak * 1.2) * 0.85
path = Path(__file__).parent / 'audio' / 'sfx.wav'
with wave.open(str(path), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
print(f'wrote {path}')
