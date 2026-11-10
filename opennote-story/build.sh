#!/bin/sh
# "The One Coloured Thing" — OpenNote founder story (Urban Sketch · Pen & Wash). Rebuild:  sh build.sh [--vo]
set -e
LIB=${LIB:-/c/Users/begin/lemo-opuscar}
export LIB
HERE=$(cd "$(dirname "$0")" && pwd)
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the lemo-opuscar library folder"; exit 1; }
PY="$LIB/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$LIB/.venv/bin/python"
export PYTHONIOENCODING=utf-8
cd "$LIB"
if [ "$1" = "--vo" ]; then
  "$PY" core/tts/tts.py "$HERE/lines.json" "$HERE/voices"                                   # Kokoro am_michael
  "$PY" "$HERE/tools/tts_phon.py" "$HERE/voices" v15 "That student is Archishman. He asked Claude, and together they built OpenNote." "Archishman" "ˈɑːɹtʃɪʃmən"
  WHISPER_MODEL=small.en "$PY" core/tts/asr_check.py "$HERE/lines.json" "$HERE/voices"
fi
node core/render/events.mjs "$HERE" --q 'ev=1'
"$PY" "$HERE/sound.py"
node core/render/video.mjs "$HERE" --fps 24 --workers 4 --out "$HERE/out/video.mp4"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/opennote-story.mp4" 24 1
node "$HERE/tools/subs.mjs" && "$PY" core/render/srt.py "$HERE/out/subs.json" "$HERE/opennote-story.srt"
node core/render/still.mjs "$HERE" 95 --q nosubs=1 --prefix po_ --out "$HERE/out/stills" && cp "$HERE/out/stills/po_95.jpg" "$HERE/poster.jpg"
echo "built $HERE/opennote-story.mp4"
