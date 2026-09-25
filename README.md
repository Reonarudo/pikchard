# Pikchard

A live editor for [Pikchr](https://pikchr.org) diagrams — the Pikchr equivalent of [mermalaid](https://github.com/highvoltag3/mermalaid): a Script editor with instant SVG preview, Pikchr language services, document handling and export, delivered as a web app and a Tauri desktop app from one codebase.

Status: scaffolded. The vocabulary lives in [CONTEXT.md](CONTEXT.md); decisions in [docs/adr/](docs/adr/).

## Installing the desktop app

Download the build for your OS from [GitHub Releases](https://github.com/reonarudo/pikchard/releases): a universal `.dmg` for macOS, an `.exe` installer for Windows, and an `.AppImage` or `.deb` for Linux. The builds are **not signed** by any certificate authority yet, so each OS warns you once before the first launch. Here is how to get past it.

### macOS

1. Open the `.dmg` and copy Pikchard to `/Applications`.
2. Double-click it. macOS refuses to open it.
3. Open **System Settings › Privacy & Security**, scroll down to the message about Pikchard, and click **Open Anyway**.

Right-click › Open, the old way round this, no longer works: Apple removed it in macOS 15 Sequoia.

If you prefer the terminal, this does the same, after copying:

```sh
xattr -dr com.apple.quarantine /Applications/Pikchard.app
```

Use `-dr`, which removes only the quarantine flag. `-cr` strips *every* extended attribute from the app.

### Windows

Run the `.exe`. When SmartScreen warns you, click **More info**, then **Run anyway**.

The warning returns with every new version, because an unsigned build starts with no SmartScreen reputation. On a fresh Windows 11 install, Smart App Control may block the installer outright, with no option to run it anyway. An EV certificate would not fix this either: Microsoft's own documentation says EV certificates no longer bypass SmartScreen.

**The Windows build is produced by CI and is not tested by hand before release.** If a file association or anything else is broken on Windows, that is why. Please report it.

### Linux

```sh
chmod +x Pikchard*.AppImage
./Pikchard*.AppImage
```

If it does not start, extract it and run it directly. This always works:

```sh
./Pikchard*.AppImage --appimage-extract
./squashfs-root/AppRun
```

**The AppImage has no file associations**, so double-clicking a `.pikchr` file will not open it. Install the `.deb` for those.

## Layout

- [packages/pikchr-wasm/](packages/pikchr-wasm/) — patched pikchr built to WebAssembly, TypeScript wrapper, Render Error parser
- [packages/lang-pikchr/](packages/lang-pikchr/) — Lezer grammar and CodeMirror 6 language support for Pikchr (currently the keyword catalogue only)
- [packages/pikchr-corpus/](packages/pikchr-corpus/) — every Pikchr Script the pinned upstream check-in ships, committed, for the renderer and the grammar to be tested against ([ADR 0011](docs/adr/0011-the-upstream-script-corpus-is-committed-not-rebuilt-at-test-time.md))
- [app/](app/) — React + Vite application, with the Tauri shell in [app/src-tauri/](app/src-tauri/)

## Development

Node 22 (see [.nvmrc](.nvmrc)) and a Rust toolchain for the desktop build.

```sh
npm install
npm run dev        # web app on http://localhost:1420
npm run tauri dev  # desktop window, same app
```

| Script | What it does |
| --- | --- |
| `npm run build` | Builds both packages and the web bundle into `app/dist` |
| `npm test` | Vitest across all workspaces |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run lint` | Biome lint + format check (`npm run lint:fix` to apply) |
| `npm run e2e` | Playwright on Chromium, Firefox and WebKit — against the dev server, against a web build under `vite preview` for the offline and CSP checks, and against a desktop build served with the desktop CSP |
| `npm run budget -w @pikchard/app` | Measures the Render budget in Chromium (excluded from `e2e`) |
| `npm run tauri` | The Tauri CLI, e.g. `npm run tauri build` |

Playwright needs its browsers once: `npx --prefix app playwright install chromium firefox webkit`.

The Rust side has its own tests: `cargo test` in [app/src-tauri/](app/src-tauri/).

Two things no test can reach are written down instead: [docs/platform-desktop-manual-checks.md](docs/platform-desktop-manual-checks.md) for the desktop seam and [docs/platform-web-manual-checks.md](docs/platform-web-manual-checks.md) for the three browsers.

### The renderer

[packages/pikchr-wasm/](packages/pikchr-wasm/) builds its own WebAssembly from a pinned upstream pikchr check-in plus one patch, so every Object in a Diagram carries `data-pik="<offset>"` — the offset of the statement that produced it ([ADR 0005](docs/adr/0005-patched-pikchr-fork-emits-source-offsets.md)).

The built `.wasm` and its loader are committed, so **nothing above needs Emscripten**. These are only for changing the renderer itself, and need `brew install emscripten` at the version pinned in [vendor/pikchr.lock.json](packages/pikchr-wasm/vendor/pikchr.lock.json) — a different one emits different bytes, and the scripts refuse to build with it:

| Script (in `packages/pikchr-wasm`) | What it does |
| --- | --- |
| `npm run build:wasm` | Applies [patches/](packages/pikchr-wasm/patches/) to the pinned source and rebuilds `wasm/` |
| `npm run verify:wasm` | Rebuilds and fails if `wasm/` is stale — what CI runs |
| `npm run goldens` | Regenerates the `.svg` goldens in [test/corpus/](packages/pikchr-wasm/test/corpus/) from an *unpatched* build |

Refreshing the Scripts is a separate step that needs **no** Emscripten — `npm run extract -w @pikchard/pikchr-corpus`, Node alone ([ADR 0011](docs/adr/0011-the-upstream-script-corpus-is-committed-not-rebuilt-at-test-time.md)).

To move to a newer upstream check-in: `./vendor/fetch.sh --record <checkin>`, re-apply the patch, then `npm run build:wasm && npm run goldens`, and `npm run extract -w @pikchard/pikchr-corpus` to bring the corpus to the same pin — a lock bump without it leaves the corpus stale and its `pin.test.ts` red.

The goldens are what prove the patch only annotates: every Script upstream keeps in `tests/` and `examples/` is rendered, and the Diagram, minus the annotation, must equal unpatched pikchr byte for byte. They cover that subset rather than the whole corpus, which is wider for the grammar's sake.

### The web build

The web app is static files and nothing else ([ADR 0003](docs/adr/0003-no-server-component.md)), served from the GitHub Pages project path `/pikchard/`. A fork serving from somewhere else sets `PIKCHARD_BASE_PATH` (for example `PIKCHARD_BASE_PATH=/ npm run build`). The dev server always stays at `/`.

A build adds three things the dev server never has, so check them with `npm run build && npm run preview -w @pikchard/app` (http://localhost:4173/pikchard/):

- **A service worker** that precaches the whole app, the WASM renderer included, so the app loads offline after one visit. A new version waits until the user clicks **Reload** on its Toast. Nothing reloads by itself.
- **A web app manifest**, so Chromium can install the app. The icons in [app/public/icons/](app/public/icons/) are rendered from the desktop icon's source art by [app/scripts/web-icons.sh](app/scripts/web-icons.sh). Re-run it after changing [app-icon.svg](app/src-tauri/app-icon.svg).
- **A Content Security Policy** meta tag ([ADR 0009](docs/adr/0009-the-web-csp-is-defence-in-depth-not-a-control.md)), which allows `index.html`'s own inline script by hash.

The desktop build (`TAURI_ENV_PLATFORM` set) gets none of the three.

### Releasing

Bump `version` in [app/src-tauri/tauri.conf.json](app/src-tauri/tauri.conf.json), then push a tag of the same name, such as `v0.1.0`. The release workflow refuses a tag that does not match, and then does two independent things:

- It builds the `.dmg`, `.exe`, `.AppImage` and `.deb` into **one draft release**. Publish it only after the [desktop release checklist](docs/desktop-release-checklist.md) passes. If an OS fails, delete its artifact from the draft first.
- It deploys the web build to GitHub Pages straight away. It does not wait for the desktop draft.

Two repository settings are needed once. **Settings › Pages › Source** must be *GitHub Actions*. Under **Settings › Environments › github-pages**, the deployment rules must allow tags matching `v*`: by default only the default branch may deploy, and the Pages job would be refused.

CI builds every installer on each pull request that touches code, so a broken bundle shows up before a tag, not at one.

### Opening files from the OS

The desktop build **owns** `.pikchr` and `.pik`, and registers `.md`/`.markdown` as an *alternate* handler only: Pikchard appears in "Open With" and never takes Markdown from your editor. `.txt` is in the Open dialog's filter and is associated with nothing.

Two known differences:

- **The AppImage gets no file associations at all.** It is never installed, so its MIME packet never reaches `/usr/share/mime/packages` and no database is rebuilt. Double-clicking a `.pikchr` file will not open the AppImage; the deb and the rpm do associate.
- **Several files at once opens the first one.** Pikchard is a single-window editor with one Document open at a time. It says so in a toast, naming how many arrived.

## Accessibility

Pikchard v1 commits to a keyboard baseline and nothing wider: **every command is operable from the keyboard alone, and no part of the app takes focus it cannot give back.** There has been no accessibility audit and Pikchard claims no WCAG conformance.

What that leaves undone, deliberately:

- **The diagram is not readable by a screen reader.** The preview is exposed as a single unlabelled image rather than as its text, because reading a Pikchr diagram's labels aloud in geometric order produces noise, not content. The accessible version of a diagram is the script that made it — which is on screen, in a text box, a pane away.
- **Panning the preview needs a pointer.** Zoom, Actual Size and Fit all have shortcuts, and Fit always brings the whole diagram into view, so nothing is unreachable — but dragging is the only way to pan.
- **Tab does not indent** in the editor; it moves focus, so the editor never traps you. This is CodeMirror's default and we keep it.
- **Windows High Contrast (forced colors) is not supported.** Pikchard does not control the colours Pikchr draws with, so the diagram would not follow the mode even if the rest of the app did.
- **The web menus are a disclosure, not an ARIA menu.** They are buttons that Tab walks; the arrow keys do nothing in them, deliberately, because half of the menu pattern is worse than none. On desktop the native menu bar carries the same commands and behaves as the OS's menus do.
- **The editor/preview divider is not a tab stop.** Dragging it needs a pointer; hiding the editor entirely is a command with a shortcut, and the split position is remembered between sessions.
- There is no skip link, and no automated accessibility checking in CI.

Bugs against the first line above are bugs. Everything in the list is a known limitation — worth reporting if it blocks you, but it will not surprise us.

## License

MIT. Pikchr itself is 0BSD.
