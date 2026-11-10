"""Re-voice one line with exact phonemes for a name Kokoro can't guess: python tts_phon.py <voices_dir> <id> "<text>" <word> <ipa>"""
import sys, os, json, numpy as np, soundfile as sf
LIB = os.environ['LIB']; 
from kokoro_onnx import Kokoro
out, lid, text, word, ipa = sys.argv[1:6]
m = os.path.join(LIB, 'core', 'tts')
k = Kokoro(os.path.join(m, 'kokoro-v1.0.onnx'), os.path.join(m, 'voices-v1.0.bin'))
ph = k.tokenizer.phonemize(text, 'en-us')
wp = k.tokenizer.phonemize(word, 'en-us').strip()
print('sentence:', ph); print('name as guessed:', wp)
ph = ph.replace(wp, ipa)
print('fixed:', ph)
a, sr = k.create(ph, voice='am_michael', speed=.92, is_phonemes=True)
nz = np.where(np.abs(a) > .01)[0]; a = a[max(0, nz[0] - 1200): nz[-1] + 2400]
sf.write(os.path.join(out, lid + '.wav'), a, sr)
d = json.load(open(os.path.join(out, 'dur.json'))); d[lid] = round(len(a) / sr, 3); json.dump(d, open(os.path.join(out, 'dur.json'), 'w'), indent=1)
print(lid, d[lid])
