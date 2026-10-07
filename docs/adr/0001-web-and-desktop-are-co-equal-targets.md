# Web and Tauri desktop are co-equal first-class targets

Pikchard copies mermalaid's shape: a static web app and a Tauri v2 desktop app (macOS universal, Windows NSIS, Linux AppImage/deb) built from one codebase and released together via GitHub Releases. We rejected "web-first, shell later" because the desktop experience — native dialogs, file associations, menus, file watching — is part of what we are copying; we rejected Electron for bundle size and because the Rust toolchain is already in place.

## Consequences

- Every host service (files, dialogs, clipboard) goes through one `Platform` interface with a Browser and a Tauri implementation chosen at startup; UI code never branches on "is this Tauri".
- Code signing is a known gap on Windows, deferred until it is worth paying for; users get **More info › Run anyway**. **macOS is signed with Developer ID and notarized** from the first release on (#1036), because the Apple Developer membership already existed. Before that, macOS users needed **System Settings › Privacy & Security › Open Anyway** — right-click → Open was removed in macOS 15 (#1057).
- **File watching is cut from v1** (#1057). The rationale above lists it among the desktop behaviours worth copying, and it still is — but #1054's Baseline already catches the changed-underneath case at Save, which is the data-loss half, and the rest needs a UX decision of its own. `Platform.watch` is therefore absent from the interface rather than unimplemented.
- **Co-equal does not mean released atomically** (#1096). One `v*` tag deploys the web build to Pages and creates a *draft* desktop release, which a human publishes only after the manual desktop smoke checklist passes. So the web app can be live while a desktop artifact is withheld. Neither Platform is a second-class *target*; that says nothing about the two shipping in lockstep, and the alternative would be either rolling back a live Pages deploy or holding the web app hostage to a virtual machine.
