#!/usr/bin/env bash
#
# Fetch the vendored upstream pikchr tarball.
#
#   ./fetch.sh                  verify the committed tarball against pikchr.lock.json
#   ./fetch.sh --download       download it if missing, then verify
#   ./fetch.sh --record <ckin>  pin a new check-in: download it, record its hash
#
# Fossil serves a byte-stable tarball per check-in, so the recorded sha256 is a
# real pin: a re-download of the same check-in hashes the same.
set -euo pipefail

# shellcheck source=../scripts/common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/common.sh"

here="$pkg/vendor"

sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }

checkin_url() {
  printf 'https://pikchr.org/home/tarball/%s/pikchr-%s.tar.gz' "$1" "${1:0:8}"
}

download() {
  local url="$1" dest="$2"
  echo "vendor: downloading $url"
  curl -fsSL --max-time 300 -o "$dest" "$url"
}

# --record: pin a new check-in and rewrite the lock file.
if [ "${1:-}" = "--record" ]; then
  checkin="${2:-}"
  if [ -z "$checkin" ]; then
    echo "vendor: --record needs a check-in hash" >&2
    exit 2
  fi
  short="${checkin:0:8}"
  tarball="pikchr-$short.tar.gz"
  url="$(checkin_url "$checkin")"
  download "$url" "$here/$tarball"

  # The check-in's own manifest carries the date that becomes pikchr_version().
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  tar xzf "$here/$tarball" -C "$work"
  root="$work/pikchr-$short"
  isoDate="$(sed -n 's/^D //p' "$root/manifest")"
  version="$(cat "$root/VERSION") $(echo "$isoDate" | tr -d '\-:T' | cut -c1-14)"

  # The Emscripten pin belongs to wasm/, not to the check-in, so it carries over.
  node -e '
    const fs = require("fs");
    const [lock, checkin, short, isoDate, version, tarball, sha256, url] = process.argv.slice(1);
    const prev = JSON.parse(fs.readFileSync(lock, "utf8"));
    const next = {
      $comment: prev.$comment,
      checkin, short, isoDate, version, tarball, sha256, url,
      emscripten: prev.emscripten,
    };
    fs.writeFileSync(lock, JSON.stringify(next, null, 2) + "\n");
  ' "$lock" "$checkin" "$short" "$isoDate" "$version" "$tarball" "$(sha256 "$here/$tarball")" "$url"

  echo "vendor: pinned $short ($version)"
  echo "vendor: re-apply the patch and rebuild — patches/ is written against the old check-in"
  exit 0
fi

tarball="$(lock_field tarball)"
want="$(lock_field sha256)"
path="$here/$tarball"

if [ ! -f "$path" ]; then
  if [ "${1:-}" != "--download" ]; then
    echo "vendor: $tarball is missing; run ./vendor/fetch.sh --download" >&2
    exit 1
  fi
  download "$(lock_field url)" "$path"
fi

got="$(sha256 "$path")"
if [ "$got" != "$want" ]; then
  echo "vendor: $tarball sha256 mismatch" >&2
  echo "  expected $want" >&2
  echo "  actual   $got" >&2
  exit 1
fi

echo "vendor: $tarball verified ($(lock_field version))"
