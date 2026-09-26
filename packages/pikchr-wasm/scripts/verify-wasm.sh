#!/usr/bin/env bash
#
# Rebuild the WASM artifacts and fail if they differ from what is committed.
#
# This is the check that keeps `wasm/` honest: contributors get a prebuilt
# renderer and never need Emscripten, which is only safe as long as CI proves
# the committed bytes are what the pinned source and the patch actually
# produce. Run by the workflow in .github/workflows/ci.yml.
set -euo pipefail

# shellcheck source=common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

before="$(mktemp -d)"
trap 'rm -rf "$before"' EXIT
cp "$pkg/wasm/pikchr.mjs" "$pkg/wasm/pikchr.wasm" "$before/"

"$pkg/scripts/build-wasm.sh" >/dev/null

if ! cmp -s "$before/pikchr.wasm" "$pkg/wasm/pikchr.wasm" ||
   ! cmp -s "$before/pikchr.mjs" "$pkg/wasm/pikchr.mjs"; then
  echo "verify-wasm: the committed WASM build is stale." >&2
  echo "  Run 'npm run build:wasm -w packages/pikchr-wasm' and commit the result." >&2
  cp "$before/pikchr.mjs" "$before/pikchr.wasm" "$pkg/wasm/"
  exit 1
fi

echo "verify-wasm: committed artifacts match a fresh build"
