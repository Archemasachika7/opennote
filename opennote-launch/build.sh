#!/bin/sh
# OpenNote launch film, "Notes that run." (Living Screencast). Rebuilds everything:  sh build.sh [--vo]
set -e
LIB=${LIB:-/c/Users/begin/lemo-opuscar}
export LIB
HERE=$(cd "$(dirname "$0")" && pwd)
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the lemo-opuscar library folder"; exit 1; }
PY="$LIB/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$LIB/.venv/bin/python"
export PYTHONIOENCODING=utf-8
sh "$HERE/tools/fonts.sh"
cd "$LIB"
if [ "$1" = "--vo" ]; then
  "$PY" core/tts/tts.py "$HERE/lines.json" "$HERE/voices"                                   # Kokoro af_heart
  WHISPER_MODEL=small.en "$PY" core/tts/asr_check.py "$HERE/lines.json" "$HERE/voices"       # speech check + word timings
fi
node core/render/events.mjs "$HERE"
"$PY" "$HERE/sound.py"
node core/render/video.mjs "$HERE" --fps 30 --workers 4 --out "$HERE/out/video30.mp4"
sh core/render/mux.sh "$HERE/out/video30.mp4" "$HERE/out/mix.wav" "$HERE/opennote-launch.mp4" 30 0
node "$HERE/tools/subs.mjs" && "$PY" core/render/srt.py "$HERE/out/subs.json" "$HERE/opennote-launch.srt"
node core/render/still.mjs "$HERE" 27.6 --q nosubs=1 --prefix po_ --out "$HERE/out/stills" && cp "$HERE/out/stills/po_27.6.jpg" "$HERE/poster.jpg"
echo "built $HERE/opennote-launch.mp4"
