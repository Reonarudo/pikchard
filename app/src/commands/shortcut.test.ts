import { describe, expect, it } from "vitest";
import {
  acceleratorFor,
  displayShortcut,
  matchesShortcut,
  type Shortcut,
  shortcutFor,
} from "./shortcut.js";

const press = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("matching a Shortcut", () => {
  const save: Shortcut = { mod: true, key: "s" };

  it("takes either modifier for `mod`, so a Mac keyboard works on Linux", () => {
    expect(matchesShortcut(press({ key: "s", metaKey: true }), save)).toBe(true);
    expect(matchesShortcut(press({ key: "s", ctrlKey: true }), save)).toBe(true);
  });

  it("is exact about the modifiers it does not want", () => {
    expect(matchesShortcut(press({ key: "s", metaKey: true, shiftKey: true }), save)).toBe(false);
    expect(matchesShortcut(press({ key: "s", metaKey: true, altKey: true }), save)).toBe(false);
    expect(matchesShortcut(press({ key: "s" }), save)).toBe(false);
  });

  it("does not care how the key was cased", () => {
    expect(matchesShortcut(press({ key: "S", metaKey: true }), save)).toBe(true);
  });

  it("accepts every key a user would call `+`", () => {
    // The main-row key sends `=` unshifted and `+` *with Shift*, and the numpad
    // sends `+` without it: one Command either way (#1053 guard 4).
    const zoomIn: Shortcut = { mod: true, key: "=" };

    expect(matchesShortcut(press({ key: "=", metaKey: true }), zoomIn)).toBe(true);
    expect(matchesShortcut(press({ key: "+", metaKey: true, shiftKey: true }), zoomIn)).toBe(true);
    expect(matchesShortcut(press({ key: "+", metaKey: true }), zoomIn)).toBe(true);
  });

  it("still tells a shifted Shortcut from an unshifted one on ordinary keys", () => {
    // The Shift leniency is for the `+` key's own two faces, not a general
    // looseness: Mod+Shift+S is Save As, never Save.
    const save: Shortcut = { mod: true, key: "s" };

    expect(matchesShortcut(press({ key: "s", metaKey: true, shiftKey: true }), save)).toBe(false);
  });

  it("matches the arrows the Script Commands use", () => {
    const next: Shortcut = { mod: true, alt: true, key: "arrowdown" };

    expect(matchesShortcut(press({ key: "ArrowDown", metaKey: true, altKey: true }), next)).toBe(
      true,
    );
    expect(matchesShortcut(press({ key: "ArrowUp", metaKey: true, altKey: true }), next)).toBe(
      false,
    );
  });
});

describe("a Shortcut that differs per Platform", () => {
  it("gives each host its own, because Mod+N is the browser's", () => {
    const newDocument = {
      browser: { mod: true, alt: true, key: "n" },
      desktop: { mod: true, key: "n" },
    };

    expect(shortcutFor(newDocument, "browser")).toEqual({ mod: true, alt: true, key: "n" });
    expect(shortcutFor(newDocument, "desktop")).toEqual({ mod: true, key: "n" });
  });

  it("gives both hosts the same one when there is only one", () => {
    const save: Shortcut = { mod: true, key: "s" };

    expect(shortcutFor(save, "browser")).toBe(save);
    expect(shortcutFor(save, "desktop")).toBe(save);
  });
});

describe("a Shortcut as a native accelerator", () => {
  it("uses CmdOrCtrl, so one string serves every OS", () => {
    expect(acceleratorFor({ mod: true, key: "s" })).toBe("CmdOrCtrl+S");
    expect(acceleratorFor({ mod: true, shift: true, key: "e" })).toBe("CmdOrCtrl+Shift+E");
    expect(acceleratorFor({ mod: true, alt: true, shift: true, key: "n" })).toBe(
      "CmdOrCtrl+Alt+Shift+N",
    );
  });

  it("spells the keys muda does not take as characters", () => {
    expect(acceleratorFor({ mod: true, key: "=" })).toBe("CmdOrCtrl+Equal");
    expect(acceleratorFor({ mod: true, key: "-" })).toBe("CmdOrCtrl+Minus");
    expect(acceleratorFor({ mod: true, alt: true, key: "arrowdown" })).toBe(
      "CmdOrCtrl+Alt+ArrowDown",
    );
  });
});

describe("a Shortcut as a person reads it", () => {
  it("is glyphs on macOS, in the order macOS orders them", () => {
    expect(displayShortcut({ mod: true, key: "s" }, true)).toBe("⌘S");
    expect(displayShortcut({ mod: true, shift: true, key: "e" }, true)).toBe("⇧⌘E");
    expect(displayShortcut({ mod: true, alt: true, key: "n" }, true)).toBe("⌥⌘N");
  });

  it("is words everywhere else", () => {
    expect(displayShortcut({ mod: true, key: "s" }, false)).toBe("Ctrl+S");
    expect(displayShortcut({ mod: true, shift: true, key: "d" }, false)).toBe("Ctrl+Shift+D");
  });

  it("shows the label on the key cap rather than the character it sends", () => {
    expect(displayShortcut({ mod: true, key: "=" }, false)).toBe("Ctrl++");
  });

  it("shows the arrows as arrows on both", () => {
    expect(displayShortcut({ mod: true, alt: true, key: "arrowdown" }, true)).toBe("⌥⌘↓");
    expect(displayShortcut({ mod: true, alt: true, key: "arrowup" }, false)).toBe("Ctrl+Alt+↑");
  });
});
