# Pikchard

A live editor for [Pikchr](https://pikchr.org) diagrams — the Pikchr equivalent of [mermalaid](https://github.com/highvoltag3/mermalaid): a Script editor with instant SVG preview, Pikchr language services, document handling and export, delivered as a web app and a Tauri desktop app from one codebase.

## Installing the desktop app

Download the build for your OS from [GitHub Releases](https://github.com/reonarudo/pikchard/releases): a universal `.dmg` for macOS, an `.exe` installer for Windows, and an `.AppImage` or `.deb` for Linux. The macOS build is signed and notarized by Apple. The Windows and Linux builds are **not signed** yet, so those two warn you once before the first launch. Here is how to get past it.

### macOS

Open the `.dmg`, copy Pikchard to `/Applications`, and double-click it. macOS asks once whether to open an app downloaded from the internet; click **Open**.

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

## Opening files from the OS

The desktop build **owns** `.pikchr` and `.pik`, and registers `.md`/`.markdown` as an *alternate* handler only: Pikchard appears in "Open With" and never takes Markdown from your editor. `.txt` is in the Open dialog's filter and is associated with nothing.

Two known differences:

- **The AppImage gets no file associations at all.** It is never installed, so its MIME packet never reaches `/usr/share/mime/packages` and no database is rebuilt. Double-clicking a `.pikchr` file will not open the AppImage; the `.deb` does associate.
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

## Building from source

Node 22 (see [.nvmrc](.nvmrc)) and a Rust toolchain for the desktop build.

```sh
npm install
npm run dev        # web app on http://localhost:1420
npm run tauri dev  # desktop window, same app
npm test
```

The vocabulary the code uses is in [CONTEXT.md](CONTEXT.md), and the decisions behind it are in [docs/adr/](docs/adr/).

## License

MIT. Pikchr itself is 0BSD.
