import { beforeEach, describe, expect, it } from "vitest";
import { NO_SCRIPTS, type ScriptProjection } from "./document/projection.js";
import { FakeRenderer } from "./render/fake.js";
import { NOT_RENDERED } from "./render/render.js";
import { NEW_DOCUMENT_SCRIPT, newDraftKey, UNTITLED, useStore } from "./store.js";

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

/** A projection of one Script, as the editor would publish it. */
const one = (text: string, index = 0): ScriptProjection => ({
  count: 1,
  activeIndex: index,
  span: { from: 0, to: text.length },
  text,
  startLine: 1,
});

/** The store with a Renderer attached, and the double it was given. */
function withRenderer(): FakeRenderer {
  const renderer = new FakeRenderer();
  useStore.getState().attachRenderer(renderer);
  return renderer;
}

describe("store", () => {
  it("starts on an Untitled Document holding the seed Script", () => {
    expect(useStore.getState().document.name).toBe(UNTITLED);
    expect(useStore.getState().document.fidelity.text).toBe(NEW_DOCUMENT_SCRIPT);
  });

  it("starts with no Scripts published yet", () => {
    expect(useStore.getState().scripts).toEqual(NO_SCRIPTS);
  });

  it("starts in the light theme, following the system", () => {
    expect(useStore.getState().theme).toBe("light");
    expect(useStore.getState().themeChoice).toBe("system");
  });

  it("holds the projection the editor publishes", () => {
    const projection = {
      count: 2,
      activeIndex: 1,
      span: { from: 10, to: 20 },
      text: "circle\n",
      startLine: 3,
    };

    useStore.getState().publishScripts(projection);

    expect(useStore.getState().scripts).toBe(projection);
  });

  it("toggles the theme back and forth, which is a choice and not a mood", () => {
    // The sun/moon button flips light and dark, and by flipping it the user has
    // stopped following the system — there is nothing else it could mean (#1022).
    useStore.getState().toggleTheme();
    expect(useStore.getState().theme).toBe("dark");
    expect(useStore.getState().themeChoice).toBe("dark");

    useStore.getState().toggleTheme();
    expect(useStore.getState().theme).toBe("light");
    expect(useStore.getState().themeChoice).toBe("light");
  });

  it("takes the system's answer while following it, and ignores it once told not to", () => {
    useStore.getState().systemThemeChanged("dark");
    expect(useStore.getState().theme).toBe("dark");

    useStore.getState().chooseTheme("light");
    useStore.getState().systemThemeChanged("dark");

    expect(useStore.getState().theme).toBe("light");
  });

  it("goes back to the system's answer when asked to follow it again", () => {
    useStore.getState().chooseTheme("dark");

    useStore.getState().chooseTheme("system", "light");

    expect(useStore.getState().themeChoice).toBe("system");
    expect(useStore.getState().theme).toBe("light");
  });

  it("has rendered nothing before the renderer has loaded", () => {
    useStore.getState().publishScripts(one("box\n"));

    expect(useStore.getState().render).toBe(NOT_RENDERED);
  });
});

describe("the Render in the store", () => {
  it("renders what is already on screen the moment the renderer arrives", () => {
    useStore.getState().publishScripts(one("circle\n"));

    const renderer = withRenderer();

    expect(renderer.renders).toEqual([{ script: "circle\n", darkMode: false }]);
    expect(useStore.getState().render.lastGood?.script).toBe("circle\n");
  });

  it("renders in the same update as the text it is a Render of", () => {
    withRenderer();
    const seen: (string | undefined)[] = [];
    const stop = useStore.subscribe((state) =>
      seen.push(state.scripts.text === state.render.lastGood?.script ? "agree" : "disagree"),
    );

    useStore.getState().publishScripts(one("box\n"));
    useStore.getState().publishScripts(one("box\narrow\n"));
    stop();

    expect(seen).toEqual(["agree", "agree"]);
  });

  it("renders once per change of the Active Script's text", () => {
    const renderer = withRenderer();

    useStore.getState().publishScripts(one("box\n"));
    useStore.getState().publishScripts(one("box\n"));
    useStore.getState().publishScripts({ ...one("box\n"), span: { from: 12, to: 16 } });

    expect(renderer.renders.map((render) => render.script)).toEqual(["box\n"]);
  });

  it("keeps the last good Diagram while the text does not render", () => {
    withRenderer();
    useStore.getState().publishScripts(one("box\n"));

    useStore.getState().publishScripts(one("box\nboom\n"));

    expect(useStore.getState().render.lastGood?.script).toBe("box\n");
    expect(useStore.getState().render.error?.span).toEqual({ from: 4, to: 8 });
  });

  it("drops the kept Diagram when a different Script becomes Active", () => {
    withRenderer();
    useStore.getState().publishScripts(one("box\n"));

    useStore.getState().publishScripts({ ...one("boom\n", 1), count: 2 });

    expect(useStore.getState().render.lastGood).toBeNull();
    expect(useStore.getState().render.error).not.toBeNull();
  });

  it("drops it too when a Fence is deleted and the index lands on another Script", () => {
    withRenderer();
    useStore.getState().publishScripts({ ...one("box\n", 0), count: 2 });

    // The first Fence is deleted: the second Script becomes index 0, so the
    // index alone says nothing happened — the count is what gives it away.
    useStore.getState().publishScripts({ ...one("boom\n", 0), count: 1 });

    expect(useStore.getState().render.lastGood).toBeNull();
  });

  it("has nothing to render, and keeps nothing, when the Document has no Scripts", () => {
    withRenderer();
    useStore.getState().publishScripts(one("box\n"));

    useStore.getState().publishScripts(NO_SCRIPTS);

    expect(useStore.getState().render).toBe(NOT_RENDERED);
  });

  it("re-renders the kept Diagram when the theme changes", () => {
    const renderer = withRenderer();
    useStore.getState().publishScripts(one("box\n"));

    useStore.getState().toggleTheme();

    expect(renderer.renders.at(-1)).toEqual({ script: "box\n", darkMode: true });
    expect(useStore.getState().render.lastGood?.diagram.svg).toContain('data-dark="true"');
  });

  it("does not re-render the same text twice in the new theme", () => {
    const renderer = withRenderer();
    useStore.getState().publishScripts(one("box\n"));
    useStore.getState().toggleTheme();

    useStore.getState().publishScripts(one("box\n"));

    expect(renderer.renders).toHaveLength(2);
  });

  describe("after a Save", () => {
    const identity = { key: "/notes.md", name: "notes.md" };

    it("starts with no Identity — an Untitled Document has nowhere to go back to", () => {
      expect(useStore.getState().identity).toBeNull();
    });

    it("takes the Identity and the Name the Save conferred", () => {
      useStore.getState().documentSaved(identity, "box\n");

      expect(useStore.getState().identity).toEqual(identity);
      expect(useStore.getState().document.name).toBe("notes.md");
    });

    it("leaves the Document's bytes alone, so the editor does not read it as an open", () => {
      const before = useStore.getState().document.fidelity;

      useStore.getState().documentSaved(identity, "box\n");

      // The Editor tells Save As from Open by this object's identity: replacing
      // it here would reload the Document under the user, cursor and all.
      expect(useStore.getState().document.fidelity).toBe(before);
    });

    it("makes the text just written the Baseline, and the Document not Unsaved", () => {
      useStore.getState().noteText("circle\n");

      useStore.getState().documentSaved(identity, "circle\n");

      expect(useStore.getState().baseline).toBe("circle\n");
      expect(useStore.getState().unsaved).toBe(false);
    });

    it("moves the Draft onto the Identity a Save As conferred", () => {
      // Whatever generated id the Untitled Document was keeping its Draft
      // under, the Document now has a home and the Draft belongs to it.
      expect(useStore.getState().draftKey).not.toBe(identity.key);

      useStore.getState().documentSaved(identity, "box\n");

      expect(useStore.getState().draftKey).toBe(identity.key);
    });
  });

  describe("an Untitled Document", () => {
    it("is at its Baseline: the seed Script, and nothing Unsaved about it", () => {
      expect(useStore.getState().baseline).toBe(NEW_DOCUMENT_SCRIPT);
      expect(useStore.getState().unsaved).toBe(false);
    });

    it("keeps its Draft under an id of its own, so two tabs never collide", () => {
      expect(useStore.getState().draftKey).not.toBe(newDraftKey());
      expect(newDraftKey()).not.toBe(newDraftKey());
    });
  });

  describe("a Document that has just been opened", () => {
    const opened = {
      name: "notes.md",
      text: "﻿box\r\n",
      identity: { key: "/notes.md", name: "notes.md" },
    };

    it("becomes the Document, at a Baseline of the bytes it came off the disk as", () => {
      useStore.getState().documentOpened(opened);

      expect(useStore.getState().document.name).toBe("notes.md");
      expect(useStore.getState().identity).toEqual(opened.identity);
      // The Baseline is the text: the BOM is a fact about the file, restored on
      // write, and not something the editor ever holds.
      expect(useStore.getState().baseline).toBe("box\r\n");
      expect(useStore.getState().document.fidelity.text).toBe("box\r\n");
      expect(useStore.getState().unsaved).toBe(false);
    });

    it("keeps its Draft under its Identity", () => {
      useStore.getState().documentOpened(opened);

      expect(useStore.getState().draftKey).toBe("/notes.md");
    });

    it("gets an id of its own when the Platform could not give it an Identity", () => {
      // Firefox and Safari: a Name and no way home. Not Untitled, but with
      // nothing stable to key a Draft by either.
      useStore.getState().documentOpened({ ...opened, identity: null });

      expect(useStore.getState().identity).toBeNull();
      expect(useStore.getState().draftKey).toMatch(/^untitled:/);
    });

    it("clears the Unsaved state of whatever was open before", () => {
      useStore.getState().noteText("edited\n");

      useStore.getState().documentOpened(opened);

      expect(useStore.getState().unsaved).toBe(false);
    });
  });

  describe("a restored Draft", () => {
    const draft = {
      key: "/notes.md",
      name: "notes.md",
      identity: { key: "/notes.md", name: "notes.md" },
      text: "circle\n",
      baseline: "box\n",
      at: 1000,
    };

    it("comes back as the Document it was, Unsaved", () => {
      useStore.getState().documentRestored(draft);

      expect(useStore.getState().document.name).toBe("notes.md");
      expect(useStore.getState().document.fidelity.text).toBe("circle\n");
      expect(useStore.getState().identity).toEqual(draft.identity);
      expect(useStore.getState().unsaved).toBe(true);
    });

    it("keeps the Baseline it was Unsaved against, not the text it restored", () => {
      // So the next Save still compares the file with what was opened — the
      // Draft is not evidence about the file (#1054).
      useStore.getState().documentRestored(draft);

      expect(useStore.getState().baseline).toBe("box\n");
    });

    it("comes back under the key it was kept under", () => {
      useStore.getState().documentRestored({ ...draft, key: "untitled:abc", identity: null });

      expect(useStore.getState().draftKey).toBe("untitled:abc");
      expect(useStore.getState().identity).toBeNull();
    });
  });

  describe("Recent and Toasts", () => {
    it("holds Recent as the Platform last listed it", () => {
      const recent = [{ key: "/a.md", name: "a.md" }];

      useStore.getState().setRecent(recent);

      expect(useStore.getState().recent).toEqual(recent);
    });

    it("shows no Toast until something has happened", () => {
      expect(useStore.getState().toasts).toEqual([]);
    });

    it("counts Toasts, so the same words twice over are two notices", () => {
      useStore.getState().showToast("Saved to your downloads");
      useStore.getState().showToast("Saved to your downloads");

      const [first, second] = useStore.getState().toasts;
      expect(first?.message).toBe("Saved to your downloads");
      expect(second?.id).not.toBe(first?.id);
    });

    it("stacks Toasts rather than letting a new one replace an unread one", () => {
      // #1047: they stack. A multi-file open and a failed save within the same
      // few seconds are two things the user needs to read, not one.
      useStore.getState().showToast("Opened 1 of 3 files — Pikchard opens one at a time");
      useStore.getState().showToast("Can't save notes.md");

      expect(useStore.getState().toasts.map((toast) => toast.message)).toEqual([
        "Opened 1 of 3 files — Pikchard opens one at a time",
        "Can't save notes.md",
      ]);
    });

    it("dismisses one Toast and leaves the others", () => {
      useStore.getState().showToast("Saved to your downloads");
      useStore.getState().showToast("Diagram copied");
      const [first] = useStore.getState().toasts;

      useStore.getState().dismissToast(first?.id ?? -1);

      expect(useStore.getState().toasts.map((toast) => toast.message)).toEqual(["Diagram copied"]);
    });
  });
});
