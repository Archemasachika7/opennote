#!/bin/sh
# Fetches the OFL fonts the film uses into ../fonts (pinned google/fonts commit). Files already there are kept.
set -e
D=$(cd "$(dirname "$0")/.." && pwd)/fonts; mkdir -p "$D"
GF=https://raw.githubusercontent.com/google/fonts/86aced91de05cd4f96a06838124cca45be337b2b
get() { [ -s "$D/$1" ] && return 0; curl -fsSL -g --retry 2 -o "$D/dl.part" "$2"; mv "$D/dl.part" "$D/$1"; echo "fonts/$1"; }
get Inter.ttf "$GF/ofl/inter/Inter[opsz,wght].ttf"
get SpaceGrotesk.ttf "$GF/ofl/spacegrotesk/SpaceGrotesk[wght].ttf"
get Caveat.ttf "$GF/ofl/caveat/Caveat[wght].ttf"
get JetBrainsMono.ttf "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/19371302b95d218af43299bce79ddbddd0bc364d/fonts/variable/JetBrainsMono[wght].ttf"
get OFL-inter.txt "$GF/ofl/inter/OFL.txt"
get OFL-spacegrotesk.txt "$GF/ofl/spacegrotesk/OFL.txt"
get OFL-caveat.txt "$GF/ofl/caveat/OFL.txt"
