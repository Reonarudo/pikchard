#!/usr/bin/env bash
#
# Build the patched pikchr to WebAssembly, into wasm/.
#
# The products are committed, so contributors need no Emscripten — this only
# needs running when the pin or the patch changes. CI runs it and fails on a
# diff, which is what keeps the committed artifact honest.
#
# Needs Emscripten on PATH (`brew install emscripten`, or emsdk in CI).
set -euo pipefail

# shellcheck source=common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_emcc build-wasm
"$pkg/vendor/fetch.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "build-wasm: applying patches"
src="$(unpack_pikchr "$work" --patched)"

echo "build-wasm: compiling with emcc $(emcc --version | head -1 | sed 's/.*) //')"
mkdir -p "$pkg/wasm"
emcc_pikchr "$src/pikchr.c" "$pkg/wasm/pikchr.mjs"

# A leaked scratch path would make the committed artifact machine-dependent,
# and CI's rebuild-and-diff check would fail for everyone but its author.
if grep -q "$work" "$pkg/wasm/pikchr.mjs"; then
  echo "build-wasm: scratch path leaked into pikchr.mjs" >&2
  exit 1
fi

echo "build-wasm: wrote"
ls -l "$pkg/wasm/pikchr.mjs" "$pkg/wasm/pikchr.wasm" | sed 's/^/  /'
