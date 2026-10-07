#!/usr/bin/env bash
# The web app's icons, rendered from the same source art as the desktop's
# (`src-tauri/app-icon.svg`), so the two sets never drift (#1025).
#
# Chromium's installability wants exactly 192×192 and 512×512, plus one
# `purpose: "maskable"`. The maskable one is full-bleed: the OS crops it to its
# own shape, so the art sits inside the central safe zone on the icon's own
# background rather than on a rounded tile of its own.
#
# Needs `rsvg-convert` (librsvg) and ImageMagick. Re-run after changing the art,
# and commit what it writes.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
source="$here/src-tauri/app-icon.svg"
out="$here/public/icons"
background="#1f2933"

mkdir -p "$out"
rsvg-convert -w 192 -h 192 "$source" -o "$out/icon-192.png"
rsvg-convert -w 512 -h 512 "$source" -o "$out/icon-512.png"

# 80% of the canvas, centred on the background: the art's corners stay well
# inside the 40%-radius circle every mask shape is guaranteed to show.
rsvg-convert -w 410 -h 410 "$source" -o "$out/.art-410.png"
magick -size 512x512 "xc:$background" "$out/.art-410.png" -gravity center -composite \
  -strip -depth 8 "$out/icon-maskable-512.png"
rm "$out/.art-410.png"
