//! Reading Documents the OS handed us.
//!
//! Every path that does not come from a dialog — argv, `RunEvent::Opened`, the
//! single-instance callback, drag-and-drop and Recent — arrives here. Runtime
//! filesystem scope is in-memory and gone on the next launch, so a Recent
//! entry's path needs re-allowing before *every* read; making that
//! [`open_path`]'s job rather than every caller's is what keeps the seam honest
//! (#1057).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_fs::FsExt;

/// A Document read from disk, as the frontend's `OpenedDocument` expects it.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub text: String,
    pub name: String,
    pub path: String,
}

/// Paths the OS gave us before any window existed.
///
/// Drained on first read: the frontend must know whether a file is inbound
/// before it can choose between opening it and showing the Restore list, and a
/// reload must never re-open the launch file over the user's work (#1057).
#[derive(Default)]
pub struct PendingOpens {
    paths: Mutex<Vec<PathBuf>>,
    /// Set the moment the frontend drains, which is also the moment it is
    /// known to be listening. Until then an emitted event has no subscriber and
    /// would be lost, so paths are queued instead.
    listening: AtomicBool,
}

impl PendingOpens {
    pub fn push(&self, paths: impl IntoIterator<Item = PathBuf>) {
        let mut pending = self.paths.lock().expect("PendingOpens poisoned");
        pending.extend(paths);
    }

    /// Take everything queued, leaving the queue empty, and mark the frontend
    /// as listening from here on.
    pub fn take(&self) -> Vec<PathBuf> {
        self.listening.store(true, Ordering::SeqCst);
        let mut pending = self.paths.lock().expect("PendingOpens poisoned");
        std::mem::take(&mut *pending)
    }

    pub fn is_listening(&self) -> bool {
        self.listening.load(Ordering::SeqCst)
    }
}

/// The Document's Name: its file name, or the whole path if it has none.
fn name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Emitted when the OS asks us to open a Document while a window already
/// exists. Launch-time paths go to [`PendingOpens`] instead, because there is
/// nothing listening yet.
pub const OPEN_REQUESTED_EVENT: &str = "pikchard://open-requested";

/// Hand the OS's paths to the frontend if it is listening, and queue them if it
/// is not — a dropped event would lose the file the user double-clicked.
///
/// Paths, not contents: whether Pikchard opens a file of that name is the
/// frontend's rule and lives in one place there (#1018), and reading a file only
/// to be told it was never wanted is work — and, for a large binary, a lot of
/// it. Reading is [`open_path`]'s job, once the frontend has chosen.
pub fn deliver<R: Runtime>(app: &AppHandle<R>, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    raise_main_window(app);
    // The window existing is not the same as the frontend having subscribed:
    // a window is created long before its JS runs, and an event emitted into
    // that gap is dropped silently. `take_open_paths` is the readiness signal,
    // because draining and subscribing happen together in the frontend.
    let pending = app.state::<PendingOpens>();
    if !pending.is_listening() {
        pending.push(paths);
        return;
    }
    let _ = app.emit(OPEN_REQUESTED_EVENT, &as_strings(paths));
}

/// Bring the window forward before anything else happens (#1057): an "open
/// with" is just another Open, and the user is looking for the window they
/// double-clicked into — which may be minimised, or behind another app.
///
/// Here rather than at each caller, because every OS-supplied path comes through
/// [`deliver`] — the single-instance callback on Windows and Linux, and
/// `RunEvent::Opened` on macOS — and a raise that only one of them remembered is
/// what #1057's review found.
fn raise_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Paths as the frontend takes them: strings, in the order the OS gave.
fn as_strings(paths: Vec<PathBuf>) -> Vec<String> {
    paths
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

/// Read a file, with no scope handling — the testable half of [`open_path`].
fn read_file(path: &Path) -> Result<OpenedFile, String> {
    let text = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(OpenedFile {
        text,
        name: name_of(path),
        path: path.to_string_lossy().into_owned(),
    })
}

/// Allow a path and read it in one call. Both halves, always, for the reason in
/// the module docs.
#[tauri::command]
pub fn open_path<R: Runtime>(app: AppHandle<R>, path: String) -> Result<OpenedFile, String> {
    let path = PathBuf::from(path);
    app.fs_scope()
        .allow_file(&path)
        .map_err(|error| error.to_string())?;
    read_file(&path)
}

/// The launch-time paths, drained. Also the signal that the frontend is
/// listening, after which an "open with" is emitted rather than queued.
#[tauri::command]
pub fn take_open_paths(pending: State<'_, PendingOpens>) -> Vec<String> {
    as_strings(pending.take())
}

/// Paths among a process's arguments — how Windows and Linux deliver "open
/// with". `argv[0]` is the binary, and Tauri's dev server passes flags we skip.
pub fn paths_from_argv(argv: &[String]) -> Vec<PathBuf> {
    argv.iter()
        .skip(1)
        .filter(|argument| !argument.starts_with('-'))
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_documents_name_is_its_file_name() {
        assert_eq!(name_of(Path::new("/tmp/report.md")), "report.md");
        assert_eq!(name_of(Path::new("report.pikchr")), "report.pikchr");
    }

    #[test]
    fn reads_a_file_into_text_name_and_path() {
        let directory = std::env::temp_dir().join("pikchard-open-read");
        std::fs::create_dir_all(&directory).expect("temp dir");
        let path = directory.join("report.md");
        std::fs::write(&path, "box \"hi\"\n").expect("write");

        let opened = read_file(&path).expect("read");

        assert_eq!(opened.text, "box \"hi\"\n");
        assert_eq!(opened.name, "report.md");
        assert_eq!(opened.path, path.to_string_lossy());
    }

    #[test]
    fn reading_a_missing_file_is_an_error_not_a_panic() {
        let path = std::env::temp_dir().join("pikchard-does-not-exist.md");
        let _ = std::fs::remove_file(&path);

        assert!(read_file(&path).is_err());
    }

    #[test]
    fn pending_opens_drains_on_take() {
        let pending = PendingOpens::default();
        pending.push([PathBuf::from("/tmp/a.md"), PathBuf::from("/tmp/b.md")]);

        assert_eq!(pending.take().len(), 2);
        // The second take is what a reload would do, and it must find nothing.
        assert!(pending.take().is_empty());
    }

    #[test]
    fn pending_opens_is_not_listening_until_the_frontend_drains() {
        let pending = PendingOpens::default();
        assert!(!pending.is_listening());

        let _ = pending.take();

        // From here an "open with" is emitted rather than queued.
        assert!(pending.is_listening());
    }

    #[test]
    fn pending_opens_accumulates_across_pushes() {
        let pending = PendingOpens::default();
        pending.push([PathBuf::from("/tmp/a.md")]);
        pending.push([PathBuf::from("/tmp/b.md")]);

        assert_eq!(pending.take().len(), 2);
    }

    /// An app with the fs plugin registered, so `fs_scope()` is real.
    fn mock_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .manage(PendingOpens::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("mock app")
    }

    #[test]
    fn open_path_allows_and_reads_in_one_call() {
        let directory = std::env::temp_dir().join("pikchard-open-command");
        std::fs::create_dir_all(&directory).expect("temp dir");
        let path = directory.join("command.md");
        std::fs::write(&path, "box\n").expect("write");
        let app = mock_app();

        let opened = open_path(app.handle().clone(), path.to_string_lossy().into_owned())
            .expect("open_path");

        assert_eq!(opened.text, "box\n");
        assert_eq!(opened.name, "command.md");
        // The whole point of #1057: the same call that read it also allowed it.
        assert!(app.handle().fs_scope().is_allowed(&path));
    }

    #[test]
    fn open_path_reports_a_missing_file_as_an_error() {
        let app = mock_app();
        let path = std::env::temp_dir().join("pikchard-command-missing.md");
        let _ = std::fs::remove_file(&path);

        assert!(open_path(app.handle().clone(), path.to_string_lossy().into_owned()).is_err());
    }

    #[test]
    fn take_open_paths_hands_over_the_queue_and_leaves_it_empty() {
        let app = mock_app();
        let path = std::env::temp_dir().join("queued.md");
        app.state::<PendingOpens>().push([path.clone()]);

        let first = take_open_paths(app.state::<PendingOpens>());
        let second = take_open_paths(app.state::<PendingOpens>());

        assert_eq!(first, vec![path.to_string_lossy().into_owned()]);
        // A reload must not get the launch file a second time.
        assert!(second.is_empty());
    }

    #[test]
    fn take_open_paths_hands_paths_over_unread_and_unjudged() {
        // Whether Pikchard opens a file of that name is the frontend's rule, and
        // reading is `open_path`'s job once it has chosen (#1018).
        let app = mock_app();
        let missing = std::env::temp_dir().join("pikchard-take-missing.pdf");
        let _ = std::fs::remove_file(&missing);
        app.state::<PendingOpens>().push([missing.clone()]);

        assert_eq!(
            take_open_paths(app.state::<PendingOpens>()),
            vec![missing.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn argv_yields_only_existing_files_and_never_the_binary() {
        let directory = std::env::temp_dir().join("pikchard-open-argv");
        std::fs::create_dir_all(&directory).expect("temp dir");
        let path = directory.join("argv.md");
        std::fs::write(&path, "box\n").expect("write");

        let argv = vec![
            path.to_string_lossy().into_owned(), // argv[0] is the binary, skipped
            path.to_string_lossy().into_owned(),
            "--flag".to_string(),
            directory.join("missing.md").to_string_lossy().into_owned(),
        ];

        assert_eq!(paths_from_argv(&argv), vec![path]);
    }
}
