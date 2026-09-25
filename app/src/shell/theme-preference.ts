/**
 * Keep the app's theme and the page in step, for the whole session (#1022).
 *
 * Two jobs: resolve the kept choice once at startup — the store cannot read the
 * host, so this is the reading it was waiting for — and follow the system for as
 * long as that is what was chosen. What is *remembered* is the store's own doing,
 * inside `chooseTheme`, because an effect that wrote the choice would run a render
 * late and clobber the value it had just read.
 *
 * Startup deliberately paints nothing new: `index.html` applied the same answer
 * inline one paint earlier, and this is only where the store catches up.
 */

import { useEffect } from "react";
import { useStore } from "../store.js";
import { applyTheme, readThemeChoice, systemTheme, watchSystemTheme } from "../theme.js";

export function useThemePreference(scope: typeof globalThis = globalThis): void {
  const choice = useStore((state) => state.themeChoice);
  const theme = useStore((state) => state.theme);

  useEffect(() => {
    useStore.getState().chooseTheme(readThemeChoice(), systemTheme(scope));
  }, [scope]);

  useEffect(() => {
    applyTheme(theme, scope);
  }, [theme, scope]);

  // Only while following: an explicit choice is not interested in sunset.
  useEffect(() => {
    if (choice !== "system") return;
    return watchSystemTheme((next) => useStore.getState().systemThemeChanged(next), scope);
  }, [choice, scope]);
}
