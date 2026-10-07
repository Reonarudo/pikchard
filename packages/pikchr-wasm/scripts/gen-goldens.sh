#!/usr/bin/env bash
#
# Regenerate the goldens in test/corpus/.
#
# The Scripts themselves live in @pikchard/pikchr-corpus (ADR 0011); this
# renders the subset of them upstream keeps in tests/ and examples/ through an
# *unpatched* build and writes what came out — a .svg per Script, and an
# errors.txt naming the deliberate error cases that render nothing. The golden
# test renders the same Script through our patched build, strips the data-pik
# annotation, and requires the result to equal the .svg byte for byte — which
# is what "the patch only annotates, it never changes rendering" means.
#
# Refreshing the Scripts after a pin bump is a separate step, and needs no
# Emscripten: `npm run extract -w @pikchard/pikchr-corpus`.
#
# The baseline is an unpatched WASM build, not a native one: see common.sh.
# It is driven through the package's own Renderer (createRenderer) so the
# goldens and the test go through one code path.
#
# Needs Emscripten on PATH. Run after bumping the pin or changing the patch.
set -euo pipefail

# shellcheck source=common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_emcc gen-goldens
"$pkg/vendor/fetch.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "gen-goldens: building unpatched pikchr"
src="$(unpack_pikchr "$work")"
emcc_pikchr "$src/pikchr.c" "$work/unpatched.mjs"

echo "gen-goldens: building the wrapper and the corpus"
(cd "$pkg" && npx tsc --build)

corpus="$pkg/test/corpus"
rm -rf "$corpus"
mkdir -p "$corpus"

node - "$work/unpatched.mjs" "$pkg/dist/index.js" "$pkg/dist/test-support.js" "$corpus" <<'EOF'
const [, , modulePath, rendererPath, supportPath, out] = process.argv;
const { writeFileSync, appendFileSync } = await import("node:fs");
const { join } = await import("node:path");
const initPikchrModule = (await import(modulePath)).default;
const { createRenderer } = await import(rendererPath);
// The same list goldens.test.ts renders, so what is written here and what is
// checked there cannot drift apart.
const { renderSubset } = await import(supportPath);
const pikchr = createRenderer(await initPikchrModule());

const scripts = renderSubset();

writeFileSync(join(out, "errors.txt"), "");
let nSvg = 0;
let nErr = 0;
for (const { name, text } of scripts) {
  const result = pikchr.render(text, { cssClass: "pikchr" });
  if (result.ok) {
    writeFileSync(join(out, `${name}.svg`), result.svg);
    nSvg++;
  } else {
    // A handful of upstream tests are deliberate error cases: they render no
    // Diagram, so they get no golden and are listed for the error-parity check.
    appendFileSync(join(out, "errors.txt"), `${name}\n`);
    nErr++;
  }
}
console.log(`gen-goldens: wrote ${nSvg} goldens and ${nErr} error cases to test/corpus/`);
EOF
