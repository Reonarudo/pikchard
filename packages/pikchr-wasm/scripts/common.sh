# Shared steps for the pikchr-wasm scripts. Sourced, not run.
#
# Both the shipped build and the golden baseline must come off the same
# toolchain: pikchr's layout turns on a few knife-edge floating-point
# comparisons that native arm64 and wasm32 do not always resolve the same way.
# Comparing a patched WASM build against a *native* baseline would report those
# as if the patch had changed rendering.

pkg="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lock="$pkg/vendor/pikchr.lock.json"

lock_field() {
  node -e 'const l=require(process.argv[1]);const v=l[process.argv[2]];if(v==null){process.exit(1)}process.stdout.write(String(v))' \
    "$lock" "$1"
}

# require_emcc <caller>
# The committed wasm/ is diffed against a fresh build, and a different
# Emscripten emits different bytes, so the version is pinned in the lock file
# alongside the source it built. Fail early with the reason rather than late
# with an inexplicable diff.
require_emcc() {
  if ! command -v emcc >/dev/null 2>&1; then
    echo "$1: emcc not found — install Emscripten (brew install emscripten)" >&2
    exit 1
  fi
  local want have
  want="$(lock_field emscripten)"
  have="$(emcc --version | head -1 | sed -E 's/^emcc .*\) ([0-9][^ ]*).*$/\1/')"
  if [ "$have" != "$want" ] && [ "$have" != "$want-git" ]; then
    echo "$1: Emscripten $have on PATH, but wasm/ is pinned to $want (vendor/pikchr.lock.json)" >&2
    echo "  Either install $want, or rebuild with the new version and update the pin together." >&2
    exit 1
  fi
}

# unpack_pikchr <destdir> [--patched]
# Extracts the vendored tarball, optionally applies patches/, and runs Lemon to
# regenerate pikchr.c. Echoes the source directory.
unpack_pikchr() {
  local into="$1" patched="${2:-}"
  local short tarball src
  short="$(lock_field short)"
  tarball="$(lock_field tarball)"
  tar xzf "$pkg/vendor/$tarball" -C "$into"
  src="$into/pikchr-$short"

  if [ "$patched" = "--patched" ]; then
    for p in "$pkg"/patches/*.patch; do
      patch -s -p1 -d "$src" < "$p"
      echo "  applied $(basename "$p")" >&2
    done
  fi

  # pikchr.c is a build product: Lemon turns the grammar into C, and mkversion
  # bakes the check-in date into pikchr_version().
  cc -O2 -w -o "$src/lemon" "$src/lemon.c"
  cc -O2 -w -o "$src/mkversion" "$src/mkversion.c"
  (
    cd "$src" &&
      ./mkversion manifest.uuid manifest VERSION > VERSION.h &&
      ./lemon pikchr.y >/dev/null &&
      cp pikchr.h.in pikchr.h
  )
  echo "$src"
}

# emcc_pikchr <pikchr.c> <out.mjs>
emcc_pikchr() {
  emcc "$1" \
    -O2 \
    --no-entry \
    -o "$2" \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sEXPORT_NAME=initPikchrModule \
    -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 \
    -sFILESYSTEM=0 \
    -sEXPORTED_FUNCTIONS=_pikchr,_pikchr_version,_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToUTF8,lengthBytesUTF8,getValue \
    "-sINCOMING_MODULE_JS_API=[]" \
    --closure 0
}
