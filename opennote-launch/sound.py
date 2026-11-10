"""Score + foley + voice → mix.wav, all timed from events.json (same source as the picture).
Two resolutions: a hi-fi band (vibraphone, upright jazz bass, drum kit, glockenspiel; real samples) is the world;
a band-limited pulse wave is Blot. Morning: light band. Live pages: full band. Freezes: a held bowed-vibes pad.
Lecture: bass + kit. Night: the band is low-passed. Everywhere: the filter opens, vibes left / chip right. End: ring-out."""
import sys, os, json, numpy as np, soundfile as sf, soxr
LIB = os.environ.get('LIB') or os.path.expanduser('~/lemo-opuscar')
sys.path.insert(0, LIB)
from core.audio.sfx import SR, bp, lp, hp, noise, add, compress, limit, click as sclick
from core.audio import sampler as S
HERE = os.path.dirname(os.path.abspath(__file__))
EVJ = json.load(open(os.path.join(HERE, 'events.json'))); E = EVJ['ev']; DUR = EVJ['dur']
rng = np.random.default_rng(11); S.seed(11)
NS = int((DUR + 1.5) * SR); B = .6
def tt(d): return np.arange(int(round(d * SR))) / SR
def db(x): return 10 ** (x / 20)
def first(tp): return next(e['t'] for e in E if e['type'] == tp)
def all_(tp): return [e for e in E if e['type'] == tp]
hz = S.hz

def pulse(f, d, duty=.25, vol=1., att=.003, rel=.05, slide=None):
    t = tt(d); fr = np.full(len(t), float(f)) if slide is None else f * (slide ** (t / d))
    ph = np.cumsum(fr) / SR; x = np.zeros(len(t))
    for k in range(1, 24):
        m = fr * k < 16000; x += m * (np.sin(np.pi * k * duty) / k) * np.cos(2 * np.pi * k * (ph - duty / 2))
    e = np.minimum(1, t / att) * np.minimum(1, (d - t) / rel).clip(0)
    return (x * e * vol * .5).astype(np.float32)
def crush(x, bits=5): q = 2 ** bits; return (np.round(x * q) / q).astype(np.float32)
def nz(d, lo, hi, vol=1., tau=None):
    x = bp(rng.standard_normal(int(d * SR)), lo, hi) * vol
    if tau: x *= np.exp(-tt(d)[:len(x)] / tau)
    return x.astype(np.float32)

# ── key times from the picture
WIPES = [e['t'] for e in all_('wipe')]            # 16.2, 33.4, 55.4
T_BORN = first('morph'); T_DARK = first('darkon'); T_SPLIT = first('split'); T_MERGE = first('merge'); T_ZZ = first('zz')
VO = {e['id']: e['t'] for e in all_('vo')}
F1 = (VO['v07'] - .4, WIPES[1])                   # freeze 1: the sandbox
F2 = (VO['v12'] + 1.6, VO['v12'] + 5.4)           # freeze 2: encryption
T_END = VO['v14']                                  # final chord on "OpenNote"
def in_(t, a): return a[0] <= t < a[1]

PROG = [('F2', ['F3', 'A3', 'C4', 'E4']), ('D2', ['D3', 'F3', 'A3', 'C4']), ('Bb1', ['F3', 'A3', 'Bb3', 'D4']), ('C2', ['E3', 'G3', 'Bb3', 'D4'])]
T0 = 5.2
def chord_at(t): return PROG[int(np.floor((t - T0) / (4 * B))) % 4]
EVN = []
def N(t, inst, p, d, v, pan=0., g=1.): EVN.append((t, inst, p, d, v, pan, g))

# morning intro: vibes Fmaj7 arpeggio, very soft
ARP = ['F4', 'A4', 'C5', 'E5', 'C5', 'A4']
for i, t in enumerate(np.arange(.8, T0, B / 2)): N(t, 'vibraphone', ARP[i % 6], .6, .22 + .1 * t / T0, -.2)

def groove(t0, t1, drums=True, vibes=True, full=False, split=False):
    for n in range(int(round(t0 / B)), int(round(t1 / B))):
        t = n * B
        if in_(t, F1) or in_(t, F2): continue
        bi = int(round((t - T0) / B)) % 4; root, ch = chord_at(t + 1e-3)
        if drums:
            if bi in (0, 2): N(t, 'drum_kit', 'kick_drum_left', .3, .7 if full else .5, 0)
            if bi in (1, 3): N(t, 'drum_kit', 'snare_2', .3, .32 if full else .2, .05)
            if full and bi in (1, 3): N(t, 'claps', None, .3, .35, .1)
            for h in (0, .5): N(t + h * B, 'drum_kit', 'hi_hat_closed', .1, .26 if h == 0 else .16, .3)
            if full: N(t + .25 * B, 'shaker', None, .12, .18, -.35); N(t + .75 * B, 'shaker', None, .12, .18, -.35)
        N(t, 'jazz_bass', root, .3, .65, 0)
        if bi in (1, 3): N(t + B / 2, 'jazz_bass', S.name(S.midi(root) + 7), .22, .4, 0)
        if vibes:
            vp = -.7 if split else -.15
            if bi == 0: [N(t + j * .02, 'vibraphone', p, 2.2, .38, vp) for j, p in enumerate(ch)]
            elif bi == 2: [N(t + B / 2, 'vibraphone', p, .5, .26, vp) for p in ch[1:]]

groove(T0, WIPES[0], drums=True, vibes=True)
groove(WIPES[0], F1[0], full=True)
groove(WIPES[1], T_DARK, vibes=False)
groove(T_DARK, T_SPLIT, full=False)
groove(T_SPLIT, T_MERGE, full=True, split=True)
# chapter seams: tom fill into a crash
for w in WIPES:
    for k, tm in enumerate(['tom_1', 'tom_2', 'tom_3', 'tom_4']): N(w - B + k * B / 4, 'drum_kit', tm, .3, .45 + .1 * k, (k - 1.5) * .3)
    N(w, 'drum_kit', 'crash_left', 2.2, .5, -.2)
N(T_DARK, 'drum_kit', 'crash_right', 2.5, .55, .2)
# freezes: a held bowed-vibes pad
for a, b in (F1, F2):
    for p in ['F3', 'C4', 'A4']: EVN.append(dict(t=a + .1, inst='vibraphone_bowed', pitch=p, dur=b - a - .2, vel=.42, pan=0, attack=.4))
# ending: Fmaj9 on "OpenNote", then the sleep lullaby on glockenspiel
N(T_MERGE, 'drum_kit', 'crash_left', 2.0, .45, -.2)
groove(T_MERGE, T_END - .05, drums=True, vibes=True)
N(T_END, 'jazz_bass', 'F1', 4.5, .75, 0)
for j, p in enumerate(['F3', 'C4', 'E4', 'G4', 'A4', 'C5']): N(T_END + j * .04, 'vibraphone', p, 5, .5, -.15 + j * .06)
for j, p in enumerate(['C6', 'A5', 'F5', 'G5', 'E5', 'F5']): N(T_ZZ + .2 + j * B, 'glockenspiel', p, 1.2, .3, .3)
band = np.zeros((NS, 2), np.float32)
bm = S.render(EVN, dur=DUR + 1.5); band[:len(bm)] += bm[:NS]

# Blot's pixel voice: birth arpeggio, a theme on the snap and on "runs", replies in the split
chip = np.zeros((NS, 2), np.float32)
for k, p in enumerate(['F4', 'A4', 'C5', 'F5', 'A5', 'C6', 'F6']): add(chip, pulse(hz(p), .09, .125, .26), T_BORN + k * .07, 1, (k - 3) * .1)
THEME = [('C6', 0, .5), ('A5', .5, .5), ('F5', 1, .5), ('G5', 1.5, 1), ('A5', 3, .5), ('C6', 3.5, 1)]
def theme(t0, vol=.3, pan=.2):
    for p, o, d in THEME:
        ts = t0 + o * B / 2; add(chip, pulse(hz(p), d * B / 2 * .9, .25, vol), ts, 1, pan); add(band, S.note('glockenspiel', p, d * B / 2, .45), ts, .5, pan)
theme(first('snap') + .05)
theme(VO['v06'] + 1.0, .26)
for k, (p, q) in enumerate([('A4', 'C6'), ('F4', 'A5'), ('G4', 'D6'), ('C5', 'E6')]):
    t0 = T_SPLIT + .4 + k * 1.2
    if t0 > T_MERGE - .4: break
    add(chip, pulse(hz(q), .26, .25, .2), t0 + .6, 1, .75)

# night: low-pass the band from the dark switch until the split opens it again
tn = np.arange(NS) / SR
ramp = lambda a, b: np.clip((tn - a) / (b - a), 0, 1)
night = ramp(T_DARK, T_DARK + .8) * (1 - ramp(T_SPLIT - .3, T_SPLIT + .5))
dark = np.stack([lp(band[:, c], 900, 2) for c in (0, 1)], 1).astype(np.float32) * 1.25
band = band * (1 - night[:, None]) + dark * night[:, None]
music = S.room(band + chip, size=.35, mix=.14)

# ═════ foley
fx = np.zeros((NS, 2), np.float32)
def key(v=.8, heavy=False):
    d = .09; t = tt(d); th = np.sin(2 * np.pi * (170 + rng.uniform(-20, 20)) * t) * np.exp(-t / .018) * .5
    ck = nz(d, 2500, 7000, .5, .006) + nz(d, 900, 2200, .3, .012)
    return ((th + ck[:len(th)]) * v * (1.5 if heavy else 1)).astype(np.float32)
def tick(v=.5, f=2600): t = tt(.05); return (np.sin(2 * np.pi * f * t) * np.exp(-t / .008) * v + nz(.05, 3000, 8000, .15 * v, .004)[:len(t)]).astype(np.float32)
def pop(v=.6, f0=520, f1=980): t = tt(.12); f = f0 * (f1 / f0) ** np.minimum(1, t / .05); return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .035) * v).astype(np.float32)
def swish(d=.35, v=.5, lo=400, hi=4000):
    x = rng.standard_normal(int(d * SR)); e = np.sin(np.pi * tt(d)[:len(x)] / d) ** 2; return (bp(x, lo, hi) * e * v).astype(np.float32)
def boom(v=1., f0=90, d=.9): t = tt(d); f = f0 * np.exp(-t * 2.2) + 32; return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .3) * v * .45).astype(np.float32)
def bell(p, v=.4, d=1.2): return S.note('glockenspiel', p, d, v)
for e in E:
    t0, tp = e['t'], e['type']
    if tp == 'key': add(fx, key(e.get('v', .7) * .55), t0, .5, -.1 + rng.uniform(-.1, .1))
    elif tp == 'click': add(fx, sclick(1.1, .8), t0, .45, .1)
    elif tp == 'pop': add(fx, pop(.32), t0, 1, 0)
    elif tp == 'tick': add(fx, tick(.25 * e.get('v', 1) / (1 if 'v' not in e else .5)), t0, 1, .2)
    elif tp == 'scratch':      # pen nib on paper
        d = .09; add(fx, (nz(d, 2200, 7000, .16 * e.get('v', .5), .05)).astype(np.float32), t0, 1, .15)
    elif tp == 'snap': add(fx, pop(.35, 900, 1500), t0, 1, 0); add(fx, tick(.3, 3600), t0 + .03, 1, 0)
    elif tp == 'cut': add(fx, swish(.2, .25, 2000, 8000), t0, 1, .2)
    elif tp in ('pane', 'whoosh'): add(fx, swish(.38 if tp == 'pane' else .5, .26 if tp == 'pane' else .34, 300, 3500), t0 - .1, 1, .2)
    elif tp == 'wipe':
        for k in range(16): add(fx, pulse(rng.uniform(500, 1600), .03, .125, .05), t0 + .05 + k * .04, 1, (k / 8 - 1))
    elif tp == 'read': add(fx, pulse(hz(['C6', 'D6', 'E6', 'G6'][e['i']]), .05, .125, .15), t0, 1, .3)
    elif tp == 'rec': add(fx, bell('E6', .3, .6), t0, .6, 0)
    elif tp == 'seek': add(fx, pop(.3, 400, 1200), t0, 1, 0)
    elif tp == 'jump': d = min(.16, e.get('d', .3) * .4); add(fx, pulse(330, d, .25, .16, slide=2.4), t0, 1, .1)
    elif tp == 'land': add(fx, pulse(110, .06, .5, .2 * e.get('v', .6)), t0, 1, 0); add(fx, crush(nz(.05, 200, 2000, .22 * e.get('v', .6), .015)), t0, 1, 0)
    elif tp == 'step': add(fx, crush(nz(.02, 1500, 6000, .06, .005), 4), t0, 1, .1)
    elif tp == 'morph':
        for k in range(22): add(fx, pulse(rng.uniform(900, 2600), .03, .125, .06), t0 + rng.uniform(0, .5), 1, rng.uniform(-.6, .6))
    elif tp == 'darkon': x = lp(noise(1.1), 500) * np.exp(-tt(1.1)[:int(1.1 * SR)] / .5) * .22; add(fx, x.astype(np.float32), t0, 1, 0); add(fx, boom(.6, 70, 1.4), t0, 1, 0)
    elif tp == 'tape':   # tape pulled off the roll
        d = .5; x = nz(d, 900, 5000, .35) * (.5 + .5 * np.abs(np.sin(2 * np.pi * 23 * tt(d)[:int(d * SR)]))); add(fx, x.astype(np.float32), t0, 1, .1)
    elif tp == 'flip': add(fx, swish(.3, .25, 800, 5000), t0, 1, 0)
    elif tp == 'ding': add(fx, bell('A6', .4, 1.0), t0, .7, .2)
    elif tp == 'unlock': add(fx, sclick(1.6, .9), t0, .5, 0); add(fx, sclick(1.2, .7), t0 + .07, .4, 0)
    elif tp == 'chime': add(fx, bell('C6', .35, 1.6), t0, .7, -.1); add(fx, bell('G6', .3, 1.6), t0 + .09, .6, .1)
    elif tp == 'split': d = .5; f = 300 * 2 ** (tt(d) / d * 1.2); add(fx, (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt(d) / d) * .1).astype(np.float32), t0, 1, 0); add(fx, swish(.5, .2, 500, 5000), t0, 1, 0)
    elif tp == 'mitosis': add(fx, pop(.32, 500, 900), t0, 1, -.4); add(fx, pop(.3, 600, 1100), t0 + .07, 1, .4)
    elif tp == 'merge':
        for k, p in enumerate(['C6', 'E6', 'G6', 'C7']): add(fx, bell(p, .35, .8), t0 + k * .06, .5, -.3)
    elif tp == 'zz': add(fx, pulse(hz('A4'), .25, .5, .12, slide=.7), t0, 1, -.2)
# quiet room tone under everything, a faint lecture murmur while recording
room = lp(noise(NS / SR), 400).astype(np.float32) * .006; fx[:len(room), 0] += room[:NS]; fx[:len(room), 1] += room[:NS]

# ═════ voice + ducking
vo = np.zeros((NS, 2), np.float32)
for id_, t in VO.items():
    y, sr = sf.read(os.path.join(HERE, 'voices', id_ + '.wav'), dtype='float32')
    if y.ndim > 1: y = y.mean(1)
    y = soxr.resample(y, sr, SR).astype(np.float32); y = compress(y, .3, 3.0); add(vo, y, t, 1.0, 0)
env = np.abs(vo[:, 0]); k = int(.12 * SR); env = np.convolve(env, np.ones(k) / k, 'same'); env = np.clip(env / (env.max() * .25), 0, 1)
music *= (1 - .62 * env)[:, None]
music = music / (np.abs(music).max() + 1e-9) * .5
fx = fx / (np.abs(fx).max() + 1e-9) * .42
vo = vo / (np.abs(vo).max() + 1e-9) * .9
mix = music * db(float(os.environ.get('GM', 0))) + fx * db(float(os.environ.get('GF', 2))) + vo
fade = np.ones(NS); fo = int(1.6 * SR); end = int(DUR * SR); fade[end - fo:end] = np.linspace(1, 0, fo); fade[end:] = 0
mix = limit(mix * fade[:, None], .95)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix[:int((DUR + .1) * SR)], SR)
print('mix.wav', round(DUR, 2), 's; notes', len(EVN))
print('\n'.join(S.credits(['vibraphone', 'vibraphone_bowed', 'jazz_bass', 'drum_kit', 'glockenspiel', 'claps', 'shaker'])))
