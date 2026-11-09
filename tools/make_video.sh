#!/bin/zsh
# Assemble a recording from tools/record.js (frames + music and effects stems in video/raw) into an MP4.
#   tools/make_video.sh [out.mp4]
set -euo pipefail
cd -- "${0:A:h}/.."
RAW=video/raw
OUT=${1:-video/microduck-ball.mp4}
DUR=$(python3 -c "import json; print(json.load(open('$RAW/meta.json'))['duration'])")
END=$(python3 -c "print(max(0, $DUR - 0.6))")
AEND=$(python3 -c "print(max(0, $DUR - 1.0))")
# The music stem skips the game's master gain (0.55), so it goes in at that level; then the mix is
# normalised to -14 LUFS, the usual loudness for social video.
ffmpeg -hide_banner -loglevel error -y \
  -framerate 30 -i $RAW/frames/f%05d.jpg \
  -f s16le -ar 48000 -ac 2 -i $RAW/music.pcm \
  -f s16le -ar 48000 -ac 2 -i $RAW/sfx.pcm \
  -filter_complex "[1:a]volume=0.55[m];[2:a]volume=1.0[s];[m][s]amix=inputs=2:normalize=0:duration=first,afade=t=in:d=0.2,afade=t=out:st=$AEND:d=1,loudnorm=I=-14:TP=-1.5:LRA=11[a];[0:v]fade=t=out:st=$END:d=0.6,format=yuv420p[v]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 18 -profile:v high -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t $DUR "$OUT"
echo "$OUT ($DUR s)"
