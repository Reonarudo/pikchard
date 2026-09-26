//! The Tauri shell. Host services reach the app through the `Platform`
//! interface (ADR 0001); the commands backing `TauriPlatform` live in [`open`].

mod open;

use tauri::Manager;

use open::PendingOpens;

/// The app's bundle identifier, as declared in `tauri.conf.json`.
pub const IDENTIFIER: &str = "dev.pikchard.app";

/// What the window brings back from the last session (#1057): its geometry,
/// and nothing else. `VISIBLE` would let a window be restored invisible, which
/// is an app that does not start; `DECORATIONS` is never changed by Pikchard,
/// so persisting it could only restore a broken chrome.
#[cfg(desktop)]
fn window_state_flags() -> tauri_plugin_window_state::StateFlags {
    use tauri_plugin_window_state::StateFlags;
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Registered on all three OSes, not just where a second "open with" spawns a
    // genuine second process: two instances of a macOS app share one data
    // directory, and ADR 0010 keeps Recent and every Draft in there.
    #[cfg(desktop)]
    {
        // `deliver` raises the window before anything else, for this path and
        // for macOS's `RunEvent::Opened` alike (#1057).
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            open::deliver(app, open::paths_from_argv(&argv));
        }));
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                .build(),
        );
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PendingOpens::default())
        .setup(|app| {
            let argv: Vec<String> = std::env::args().collect();
            app.state::<PendingOpens>()
                .push(open::paths_from_argv(&argv));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open::open_path,
            open::take_open_paths
        ])
        .build(tauri::generate_context!())
        .expect("error while building Pikchard")
        .run(|_app, _event| {
            // macOS delivers "open with" as an event rather than on argv, both at
            // launch and while already running. The variant exists only on Apple
            // targets, so Windows and Linux never see this arm compiled.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                open::deliver(_app, paths);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> serde_json::Value {
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json")
    }

    /// The association covering these extensions, by its first `ext`.
    fn association(first_ext: &str) -> serde_json::Value {
        config()["bundle"]["fileAssociations"]
            .as_array()
            .expect("fileAssociations")
            .iter()
            .find(|entry| entry["ext"][0] == first_ext)
            .cloned()
            .unwrap_or_else(|| panic!("no association starting at {first_ext}"))
    }

    #[test]
    fn identifier_matches_the_bundle_config() {
        assert_eq!(config()["identifier"], IDENTIFIER);
    }

    #[test]
    fn the_desktop_ships_the_policy_adr_0009_wrote_down() {
        // A real control here, unlike on the web: this webview holds IPC, and
        // IPC reaches the filesystem (ADR 0009, #1057). `null` emits no policy.
        assert_eq!(
            config()["app"]["security"]["csp"],
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; \
             style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; \
             connect-src 'self' ipc: http://ipc.localhost; font-src 'none'; \
             object-src 'none'; base-uri 'self'; frame-ancestors 'none'; frame-src 'none'"
        );
    }

    #[test]
    fn the_policy_allows_no_asset_urls() {
        // Pikchard never loads a file by URL, so `asset:` would be permission
        // for a capability it does not use (ADR 0009).
        let csp = config()["app"]["security"]["csp"].to_string();
        assert!(!csp.contains("asset:"));
    }

    #[test]
    fn tauri_never_adds_a_nonce_to_style_src() {
        // Tauri adds a nonce to `style-src` for every `<style>` in the page, and
        // a nonce makes the browser ignore `'unsafe-inline'` — which is what
        // lets CodeMirror mount its theme. So one `<style>` in `index.html`
        // would blank the editor's styling in the built app only.
        assert_eq!(
            config()["app"]["security"]["dangerousDisableAssetCspModification"],
            serde_json::json!(["style-src"])
        );
    }

    #[test]
    fn window_state_restores_the_geometry_and_nothing_that_can_hide_the_window() {
        use tauri_plugin_window_state::StateFlags;

        let restored = window_state_flags();

        // `StateFlags` has no `PartialEq`, so compare the bits.
        assert_eq!(
            restored.bits(),
            (StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN)
                .bits()
        );
        // A window restored invisible is an app that does not start, and
        // nothing in Pikchard changes its decorations (#1057).
        assert!(!restored.contains(StateFlags::VISIBLE));
        assert!(!restored.contains(StateFlags::DECORATIONS));
    }

    #[test]
    fn pikchr_files_are_owned_outright_and_export_their_own_type() {
        // `.pikchr` has no registered UTI, so Pikchard declares one; being its
        // Owner is what puts Pikchard in front of the file on a double-click.
        let pikchr = association("pikchr");

        assert_eq!(pikchr["ext"], serde_json::json!(["pikchr", "pik"]));
        assert_eq!(pikchr["rank"], "Owner");
        assert_eq!(pikchr["role"], "Editor");
        assert_eq!(pikchr["exportedType"]["identifier"], "dev.pikchard.pikchr");
        assert_eq!(pikchr["mimeType"], "text/x-pikchr");
    }

    #[test]
    fn markdown_is_an_alternate_handler_and_never_the_default() {
        // Pikchard does not take `.md` from the user's editor (#1057).
        let markdown = association("md");

        assert_eq!(markdown["ext"], serde_json::json!(["md", "markdown"]));
        assert_eq!(markdown["rank"], "Alternate");
    }

    #[test]
    fn markdown_declares_its_content_type_because_tauri_cannot_infer_it() {
        // `infer_content_types()` has hardcoded extension and MIME tables that
        // contain neither `md`, `markdown` nor `text/markdown`, so without this
        // the entry silently claims nothing on macOS (#1057).
        assert_eq!(
            association("md")["contentTypes"],
            serde_json::json!(["net.daringfireball.markdown"])
        );
    }

    #[test]
    fn markdown_and_pikchr_are_separate_entries() {
        // They cannot share one: `infer_content_types()` returns *only* the
        // exported identifier when `exportedType` is set, ignoring
        // `contentTypes` entirely — so one entry would lose Markdown (#1057).
        let entries = config()["bundle"]["fileAssociations"]
            .as_array()
            .expect("fileAssociations")
            .len();

        assert_eq!(entries, 2);
        assert!(association("md")["exportedType"].is_null());
    }

    #[test]
    fn txt_is_in_no_association_at_all() {
        // It is in the Open dialog's filter and nowhere near the OS: Pikchard
        // does not want every text file on the machine (#1057).
        for entry in config()["bundle"]["fileAssociations"]
            .as_array()
            .expect("fileAssociations")
        {
            let extensions = entry["ext"].as_array().expect("ext");
            assert!(!extensions.iter().any(|ext| ext == "txt"));
        }
    }

    #[test]
    fn linux_packages_ship_the_mime_packet_that_makes_pikchr_a_type() {
        // `MimeType=` lists types and not extensions, and `.pikchr` sniffs as
        // `text/plain` without a shared-mime-info packet declaring it (#1057).
        for packaging in ["deb", "rpm"] {
            let linux = &config()["bundle"]["linux"][packaging];
            assert_eq!(
                linux["files"]["/usr/share/mime/packages/pikchard.xml"],
                "linux/pikchard-mime.xml",
                "{packaging} must ship the MIME packet"
            );
            // dpkg triggers and Fedora's file triggers rebuild the databases,
            // so these two are the whole of what a post-install script would do.
            let depends = linux["depends"].as_array().expect("depends");
            assert!(depends.iter().any(|name| name == "shared-mime-info"));
            assert!(depends.iter().any(|name| name == "desktop-file-utils"));
        }
    }

    #[test]
    fn linux_packages_use_a_desktop_template_that_passes_the_path_on() {
        // The bundler's default template has no field code at all, so a
        // double-clicked path never reaches argv (#1057).
        for packaging in ["deb", "rpm"] {
            assert_eq!(
                config()["bundle"]["linux"][packaging]["desktopTemplate"],
                "linux/pikchard.desktop",
                "{packaging} must use the template that carries %U"
            );
        }

        let template = include_str!("../linux/pikchard.desktop");
        assert!(
            template.contains("Exec={{exec}} %U"),
            "the template must hand the path over"
        );
        // Spelled out rather than `{{mime_type}}`: the template's variables are
        // `categories`, `comment`, `exec`, `icon` and `name` — and no more.
        assert!(template.contains("MimeType=text/x-pikchr;text/markdown;"));
    }

    #[test]
    fn the_mime_packet_subclasses_plain_text_and_claims_both_extensions() {
        // `text/plain` subclassing is why every *other* tool still handles a
        // `.pikchr` file sanely, and it is why `text/x-pikchr` was chosen over
        // an `application/vnd.*` name (#1057).
        let packet = include_str!("../linux/pikchard-mime.xml");

        assert!(packet.contains(r#"<mime-type type="text/x-pikchr">"#));
        assert!(packet.contains(r#"<sub-class-of type="text/plain"/>"#));
        assert!(packet.contains(r#"<glob pattern="*.pikchr"/>"#));
        assert!(packet.contains(r#"<glob pattern="*.pik"/>"#));
    }
}
