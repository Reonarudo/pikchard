# Render with our own WASM build of a patched pikchr, not the npm package

Upstream pikchr emits SVG with no way to map an element back to the statement that produced it, and offers no API for object positions. Pikchard vendors the pinned upstream tarball and patches `pikchr.y` so every per-Object SVG element carries `data-pik="<byte offset of the statement>"` (each `PObj` already keeps its reference token, `errTok`, which points into the source), then builds its own WebAssembly with Emscripten. We rejected the maintained `pikchr-js` npm package (no Spans, and a second render path would be needed later) and pikru, the pure-Rust port with an AST (Spans would have to be added there too, at the cost of fidelity to upstream).

## Consequences

- One render path everywhere — web and desktop — and no native pikchr path; the Diagram carries an offset per Object and the Lezer tree turns it into a Span.
- The offset names the statement's first token — its Label if it has one, `[` for a container — and for an Object a Macro produced, the outermost call site, since the Macro body is not where the user's cursor will be.
- A `[ ]` container emits no element of its own, so its children are wrapped in a `<g data-pik="…">` carrying the container's offset. That is the one structural addition; a bare `<g>` does not change rendering, and unpatched pikchr emits no `<g>` at all, so it can be stripped unambiguously.
- Upstream syncs are "download new tarball, re-apply patch, diff the Diagram against unpatched except for `data-pik` attributes and the container groups"; the patch must stay small and mechanical.
- The built `.wasm`/`.js` are committed so contributors need no Emscripten; CI rebuilds and diffs them so the artifact stays reproducible, which also pins the Emscripten version alongside the source.
