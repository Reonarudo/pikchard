# CodeMirror 6 with a hand-written Lezer grammar, not Monaco

mermalaid uses Monaco (fetched from a CDN at runtime, even on desktop); Pikchard uses CodeMirror 6. For a small DSL the Lezer grammar is one artifact that yields both syntax highlighting and a syntax tree with Spans — the input for Symbols, Lints, completion, hover and the later Script↔Diagram map — whereas Monaco's Monarch tokenizer yields tokens only and a second parser would still be needed. CodeMirror is also roughly ten times smaller, bundles fully offline and works on mobile.

## Consequences

- No Lezer grammar for Pikchr existed; it is written from scratch against upstream `grammar.md` and `pikchr.y`, and is the single most leveraged artifact in the project.
- IntelliSense-style widgets and the VS Code look are not free; completion and hover are built on CodeMirror's own extensions.
