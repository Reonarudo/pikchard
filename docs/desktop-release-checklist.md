# Desktop release checklist

This is the gate between a **draft** GitHub release and a published one (#1096).
A `v*` tag makes `release.yml` build a draft with the `.dmg`, `.exe`,
`.AppImage` and `.deb`. Before anyone clicks **Publish**, a human works through
this list against those artifacts. Publishing means the list passed.

- **Every tag is gated,** `v0.x` included. There is no waiver tier, and every
  item below is a hard pass or fail.
- **Only a human records the results.** An agent may download the draft's
  artifacts, compute the clean-state diff below and open the release Task. It
  cannot see a Gatekeeper dialog or judge whether the right Diagram appeared.
- **This covers the desktop only.** Playwright covers the web build, and
  the web build deploys to Pages from the same tag without waiting for this list
  ([ADR 0001](adr/0001-web-and-desktop-are-co-equal-targets.md)).
- **This is not [platform-desktop-manual-checks.md](platform-desktop-manual-checks.md).**
  That file is for a developer who changed the Platform seam. Keep each file's
  items out of the other.

## What earns a line here

An item belongs here only if it is what a user meets **on first contact** with
the artifact, **and** no automated test could reach it even in principle. The
list is capped at one screen, so a new item must displace an existing one.

Some things are deliberately left off, and must not be re-added. Window state
across a restart, the native menu's enabled and greyed states, and a clipboard
round trip are all app logic. Each deserves a test, not a line here.

## The checks

Use the fixtures in [release-fixtures/](release-fixtures/): `smoke.pikchr`, and
`smoke.md`, which has two Scripts. Each one shows exactly which file is open.

1. **Install, and get past the OS guard on first launch.**
   - macOS: mount the `.dmg`, copy Pikchard to `/Applications`, then
     double-click it. macOS asks once about an app downloaded from the
     internet, and nothing more: no "cannot be opened" or "Apple could not
     verify" dialog. The release job already checks the signature and the
     stapled ticket on the runner, but only a real download carries the
     quarantine flag that makes Gatekeeper look at them.
   - Linux: `chmod +x` the AppImage and run it.
2. **The app renders on launch.** The New Document's Script comes up as a Diagram, and the
   devtools console shows no Content Security Policy violation. This is the only
   place the desktop CSP meets CodeMirror and the WASM renderer in a real
   bundle, because `tauri dev` ships no policy at all
   ([ADR 0009](adr/0009-the-web-csp-is-defence-in-depth-not-a-control.md)).
3. **`.pikchr` opens in Pikchard by default, and `.md` does not** (#1018).
   Pikchard should appear under "Open With" for `smoke.md`, not as its default.
4. **Double-clicking a `.pikchr` opens that Document.** Quit Pikchard first,
   then double-click `smoke.pikchr`: its Diagram appears, not the seed. This
   covers argv, macOS's `RunEvent::Opened` and the `take_open_paths` drain.
5. **A second file reuses the window.** With Pikchard running, open `smoke.md`
   from the file manager. The same window comes forward showing
   "Script 1 of 2", and no second Pikchard appears. Single-instance is
   load-bearing ([ADR 0010](adr/0010-desktop-keeps-its-app-state-in-the-webview.md)).
6. **Dropping a file on the window opens it.** Nothing automated covers this.
   With `dragDropEnabled`, the DOM `drop` event never fires.
7. **Linux only: the `.deb` installs, and item 3 holds for it.** The AppImage
   associates nothing, by design.

## Per-OS reach, and what a failure means

macOS is always run. Linux is run on a VM when one is available. **Windows is
never run.** The README says so under Windows.

The gate applies **per artifact, and deletion enforces it.** If any item fails
on an OS, delete that OS's artifact from the draft before publishing, so it does
not ship. Then re-run the release run's **Signed checksums and build
attestations** job, so `SHA256SUMS` stops listing the deleted file. If an item was not run, the artifact ships behind the README's
statement that it was not verified. Only a macOS failure effectively holds
back the whole release.

## Clean state or upgrade

**By default, run the upgrade path:** install over the previous release, as a
returning user would. Running from a clean state is the stricter method, and it
is required when anything below changed since the last tag. It is not an ideal
that the default compromises.

It is required when any of these changed since the last tag: the file
associations, the Linux MIME packet, the `.desktop` template, or the release
job's signing step. Check with:

```sh
PREV=v0.1.0 NEXT=v0.2.0
git diff --stat "$PREV" "$NEXT" -- app/src-tauri/linux .github/workflows/release.yml
diff <(git show "$PREV:app/src-tauri/tauri.conf.json" | jq '.bundle | {fileAssociations, linux}') \
     <(git show "$NEXT:app/src-tauri/tauri.conf.json" | jq '.bundle | {fileAssociations, linux}')
```

On macOS, a clean state means:

```sh
rm -rf /Applications/Pikchard.app
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -kill -r -domain local -domain system -domain user
```

`lsregister` is an undocumented private tool, and this recipe is community
folklore rather than anything Apple documents. It is the best available, not a
guarantee.

## Recording a release

Each release gets a Redmine Task, `Release vX.Y.Z: desktop smoke`, created by
hand at tag time and parented to #1024. It links this file **at the released
tag**, and records only the results: per OS, pass or fail, and any issues
opened. It never copies the items in.
