"""Score + foley + voice → out/mix.wav, all timed from events.json (the picture's own timeline).
Jazz waltz in 3/4, 112 BPM. Ink-only night: a lone nylon guitar in D minor. The coloured visualiser: vibraphone joins.
The screenshot drains it: guitar alone, then one bar of true silence. The build: walking bass and brushes.
Colour arrives: the full waltz in F major with a clarinet lead. The reveal: guitar and clarinet, a final F chord as the book closes."""
import sys, os, json, numpy as np, soundfile as sf, soxr
LIB = os.environ.get('LIB') or os.path.expanduser('~/lemo-opuscar'); sys.path.insert(0, LIB)
from core.audio.sfx import SR, bp, lp, hp, noise, add, compress, limit, click as sclick
from core.audio import sampler as S
HERE = os.path.dirname(os.path.abspath(__file__))
EVJ = json.load(open(os.path.join(HERE, 'events.json'))); E = EVJ['ev']; DUR = EVJ['dur']
rng = np.random.default_rng(5); S.seed(5)
NS = int((DUR + 2) * SR); BEAT = 60 / 112; BAR = 3 * BEAT
def tt(d): return np.arange(int(round(d * SR))) / SR
def db(x): return 10 ** (x / 20)
def first(tp): return next(e['t'] for e in E if e['type'] == tp)
def all_(tp): return [e for e in E if e['type'] == tp]
def nz(d, lo, hi, vol=1., tau=None):
    x = bp(rng.standard_normal(int(d * SR)), lo, hi) * vol
    if tau: x *= np.exp(-tt(d)[:len(x)] / tau)
    return x.astype(np.float32)
VO = {e['id']: e['t'] for e in all_('vo')}
T_BLOOM, T_SHOT = first('bloom'), first('shutter'); T_DRAIN = first('drain')
TURNS = sorted(e['t'] for e in all_('turn')); T_TURN1 = TURNS[0]; T_ARRIVE = first('arrive'); T_CLOSE = first('close'); T_TURN4 = TURNS[-1]
SIL = (T_TURN1 - BAR - .05, T_TURN1 - .05)          # one bar of true silence after "gone"; the page turn breaks it

EVN = []
def N(t, inst, p, d, v, pan=0., g=1.): EVN.append((t, inst, p, d, v, pan, g))
def grid(t0, t1):   # downbeats of bars between t0 and t1, on the global 3/4 grid
    b0 = int(np.ceil(t0 / BAR)); b1 = int(np.floor(t1 / BAR))
    return [b * BAR for b in range(b0, b1)]
def silent(t): return SIL[0] - .05 <= t < SIL[1]

# ── D minor waltz (night): Dm · Bb · Gm · A7
DMIN = [('D2', ['A3', 'D4', 'F4']), ('Bb1', ['F3', 'Bb3', 'D4']), ('G1', ['G3', 'Bb3', 'D4']), ('A1', ['G3', 'C#4', 'E4'])]
FMAJ = [('F2', ['A3', 'C4', 'F4']), ('D2', ['A3', 'D4', 'F4']), ('G2', ['Bb3', 'D4', 'F4']), ('C2', ['Bb3', 'E4', 'G4'])]
def waltz(t0, t1, prog, guitar=.5, vibes=0., bass=0., drums=0., pan_g=-.25):
    for i, t in enumerate(grid(t0, t1)):
        if silent(t) or silent(t + 2 * BEAT): continue
        root, ch = prog[i % 4]
        if guitar: N(t, 'guitar_nylon', S.name(S.midi(root) + 12), 1.4, guitar, pan_g); [N(t + BEAT * k + .012 * j, 'guitar_nylon', p, .9, guitar * .7, pan_g) for k in (1, 2) for j, p in enumerate(ch)]
        if vibes: [N(t + BEAT + .015 * j, 'vibraphone', S.name(S.midi(p) + 12), 1.2, vibes, .3) for j, p in enumerate(ch)]
        if bass:   # walking in three: root, fifth, approach
            r = S.midi(root); nxt = S.midi(prog[(i + 1) % 4][0])
            for k, m in enumerate([r, r + 7, nxt + (1 if nxt < r else -1)]): N(t + k * BEAT, 'jazz_bass', S.name(m), .5, bass * (1 if k == 0 else .75), 0)
        if drums:
            N(t, 'drum_kit', 'kick_drum_left', .3, drums * .55, 0)
            for k in (1, 2): N(t + k * BEAT, 'drum_kit', 'hi_hat_closed', .1, drums * .35, .3); N(t + k * BEAT + BEAT * .66, 'drum_kit', 'hi_hat_closed', .1, drums * .2, .3)
            N(t + 2 * BEAT, 'drum_kit', 'snare_rest_1', .2, drums * .25, .1)

waltz(1.0, T_BLOOM - .2, DMIN, guitar=.42)
waltz(T_BLOOM - .2, T_SHOT, DMIN, guitar=.45, vibes=.32)
waltz(T_SHOT, T_TURN1, DMIN, guitar=.36)
waltz(T_TURN1, T_ARRIVE - .1, DMIN, guitar=.4, bass=.55, drums=.6)
waltz(T_ARRIVE - .1, T_TURN4, FMAJ, guitar=.4, vibes=.3, bass=.7, drums=.9)
waltz(T_TURN4, T_CLOSE - .1, FMAJ, guitar=.42, bass=.4)
# the bloom: a vibraphone arpeggio on the coloured wave
for j, p in enumerate(['D5', 'F5', 'A5', 'C6', 'E6']): N(T_BLOOM + j * .09, 'vibraphone', p, 1.6, .45, .35)
# arrival: crash + a rising clarinet line, then the clarinet melody over the F-major waltz
N(T_ARRIVE, 'drum_kit', 'crash_left', 3.0, .55, -.2)
MEL = [('C5', 2), ('A4', 1), ('F5', 3), ('E5', 2), ('D5', 1), ('C5', 3), ('Bb4', 2), ('D5', 1), ('G5', 2), ('F5', 1), ('E5', 3), ('F5', 2), ('A5', 1), ('C6', 3)]
def melody(t0, t1, vel=.5):
    t = t0
    while t < t1:
        for p, b in MEL:
            if t >= t1: break
            EVN.append(dict(t=t, inst='clarinet', pitch=p, dur=b * BEAT * .95, vel=vel, pan=.15, attack=.03)); t += b * BEAT
melody(grid(T_ARRIVE + 1, T_ARRIVE + 4)[0], T_TURN4 - .3)
melody(grid(T_TURN4 + 1, T_TURN4 + 4)[0], T_CLOSE - 1.0, .38)
# page turns land on a soft cymbal swell; the build gets a fill into each night
for tn in TURNS[1:-2]: N(tn - BEAT, 'drum_kit', 'tom_3', .3, .35, .2); N(tn, 'drum_kit', 'ride_left', 1.5, .3, -.2)
# final chord as the cover closes
N(T_CLOSE + .3, 'jazz_bass', 'F1', 4.0, .7, 0)
for j, p in enumerate(['F3', 'A3', 'C4', 'E4', 'G4']): N(T_CLOSE + .3 + j * .05, 'guitar_nylon', p, 4.0, .45, -.2)
for j, p in enumerate(['A4', 'C5', 'E5', 'F5']): N(T_CLOSE + .3 + j * .06, 'vibraphone', p, 4.0, .35, .3)
EVN.append(dict(t=T_CLOSE + .3, inst='clarinet', pitch='F5', dur=3.5, vel=.4, pan=.15, attack=.2))
music = np.zeros((NS, 2), np.float32); m = S.render(EVN, dur=DUR + 2); music[:len(m)] += m[:NS]
music = S.room(music, size=.4, mix=.16)

# ═════ foley + ambience
fx = np.zeros((NS, 2), np.float32)
def pen(d, v=.5):   # fineliner on cold-press paper: band-passed fibre noise with grain clicks
    n = int(d * SR); x = bp(rng.standard_normal(n), 1600, 7500) * (.55 + .45 * np.abs(np.sin(2 * np.pi * rng.uniform(5, 9) * tt(d)[:n])))
    k = rng.random(n) < .0016; x[k] += rng.uniform(-1.5, 1.5, k.sum())
    e = np.minimum(1, tt(d)[:n] / .02) * np.minimum(1, (d - tt(d)[:n]) / .04).clip(0)
    return (x * e * .05 * v).astype(np.float32)
def thump(v=.6, f0=110, d=.35): t = tt(d); f = f0 * np.exp(-t * 6) + 40; return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .09) * v).astype(np.float32)
def swish(d=.4, v=.4, lo=500, hi=6000): x = rng.standard_normal(int(d * SR)); e = np.sin(np.pi * tt(d)[:len(x)] / d) ** 2; return (bp(x, lo, hi) * e * v).astype(np.float32)
def brush(d=1.4, v=.3): x = rng.standard_normal(int(d * SR)); t = tt(d)[:len(x)]; e = np.sin(np.pi * t / d) ** 1.5; return (bp(x, 900, 5000) * e * v * (.6 + .4 * np.sin(2 * np.pi * 3 * t))).astype(np.float32)
def key(v=.7): d = .08; t = tt(d); th = np.sin(2 * np.pi * 190 * t) * np.exp(-t / .016) * .45; return ((th + nz(d, 2500, 7000, .45, .006)[:len(th)]) * v).astype(np.float32)
for e in E:
    t0, tp = e['t'], e['type']
    if silent(t0): continue
    if tp == 'pen': add(fx, pen(min(2.5, e.get('d', .5)), .8), t0, 1, rng.uniform(-.3, .3))
    elif tp == 'tap': add(fx, sclick(1.6, .7), t0, .35, .1)
    elif tp == 'thud': add(fx, thump(.5), t0, 1, 0); add(fx, nz(.12, 200, 900, .2, .04), t0, 1, 0)
    elif tp == 'bloom': add(fx, brush(1.4, .35), t0, 1, .2)
    elif tp == 'shutter': add(fx, sclick(1.7, .9), t0, .6, .2); add(fx, nz(.07, 1500, 9000, .35, .02), t0 + .01, 1, .2); add(fx, sclick(1.3, .7), t0 + .09, .5, .2)
    elif tp == 'drain': add(fx, brush(2.0, .18) * np.linspace(1, .2, int(2.0 * SR)).astype(np.float32)[:int(2.0 * SR)], t0, 1, -.1)
    elif tp == 'key': add(fx, key(e.get('v', .6) * .5), t0, .6, -.15 + rng.uniform(-.08, .08))
    elif tp == 'enter': add(fx, key(1.2), t0, .7, 0)
    elif tp == 'tick': add(fx, sclick(2.2, .4), t0, .2, .3)
    elif tp == 'turn': add(fx, swish(.6, .35, 300, 5000), t0 + .1, 1, .3); add(fx, nz(.15, 1500, 6000, .15, .05), t0 + .55, 1, -.2)
    elif tp == 'arrive': add(fx, brush(3.0, .45), t0, 1, 0); add(fx, thump(.35, 70, .9), t0, 1, 0)
    elif tp == 'tape': d = .55; x = nz(d, 900, 5000, .3) * (.5 + .5 * np.abs(np.sin(2 * np.pi * 21 * tt(d)[:int(d * SR)]))); add(fx, x.astype(np.float32), t0, 1, .2)
    elif tp == 'flip': add(fx, swish(.3, .25, 1000, 6000), t0, 1, .1)
    elif tp == 'chime': add(fx, S.note('vibraphone', 'C6', 1.5, .4), t0, .6, .2); add(fx, S.note('vibraphone', 'G6', 1.5, .35), t0 + .1, .5, .3)
    elif tp == 'close': add(fx, swish(1.2, .3, 200, 3000), t0, 1, .3); add(fx, thump(.7, 90, .6), t0 + 1.5, 1, 0)
# room tone everywhere; crickets at night (until the dawn); birds after colour arrives
tn = np.arange(NS) / SR
room = lp(noise(NS / SR), 380).astype(np.float32)[:NS] * .01
for k in range(int(T_ARRIVE / .9)):
    t0 = k * .9 + rng.uniform(0, .3)
    if silent(t0): continue
    for j in range(3): add(fx, (np.sin(2 * np.pi * 4300 * tt(.025)) * np.sin(np.pi * tt(.025) / .025) * .012).astype(np.float32), t0 + j * .045, 1, -.5)
for k in range(40):
    t0 = T_ARRIVE + 1.5 + k * rng.uniform(.9, 1.6)
    if t0 > T_CLOSE: break
    d = .12; f = rng.uniform(2800, 4200) * (1 + .25 * np.sin(2 * np.pi * 18 * tt(d))); add(fx, (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt(d) / d) * .02).astype(np.float32), t0, 1, rng.uniform(-.6, .6))
sil = np.ones(NS, np.float32); a, b = int(SIL[0] * SR), int(SIL[1] * SR); sil[a:b] = 0; sil[a - 2400:a] = np.linspace(1, 0, 2400); sil[b:b + 1200] = np.linspace(0, 1, 1200)
fx[:, 0] += room; fx[:, 1] += room

# ═════ voice + ducking
vo = np.zeros((NS, 2), np.float32)
for id_, t in VO.items():
    y, sr = sf.read(os.path.join(HERE, 'voices', id_ + '.wav'), dtype='float32')
    if y.ndim > 1: y = y.mean(1)
    y = soxr.resample(y, sr, SR).astype(np.float32); y = compress(y, .3, 3.0); add(vo, y, t, 1.0, 0)
env = np.abs(vo[:, 0]); k = int(.15 * SR); env = np.convolve(env, np.ones(k) / k, 'same'); env = np.clip(env / (env.max() * .25), 0, 1)
music *= (1 - .6 * env)[:, None]
music = music / (np.abs(music).max() + 1e-9) * .5
fx = fx / (np.abs(fx).max() + 1e-9) * .4
vo = vo / (np.abs(vo).max() + 1e-9) * .9
mix = (music * db(float(os.environ.get('GM', 0))) + fx * db(float(os.environ.get('GF', 0)))) * sil[:, None] + vo
fade = np.ones(NS); end = int(DUR * SR); fo = int(2.0 * SR); fade[end - fo:end] = np.linspace(1, 0, fo); fade[end:] = 0
mix = limit(mix * fade[:, None], .95)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
sf.write(os.path.join(HERE, 'out', 'mix.wav'), mix[:int((DUR + .1) * SR)], SR)
print('mix.wav', round(DUR, 2), 's; notes', len(EVN), '; silence', [round(x, 2) for x in SIL])
print('\n'.join(S.credits(['guitar_nylon', 'vibraphone', 'jazz_bass', 'drum_kit', 'clarinet'])))
