// Keeps Windows from opening a console window alongside the app in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pikchard_lib::run()
}
