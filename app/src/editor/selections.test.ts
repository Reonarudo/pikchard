import { addCursorAbove, addCursorBelow } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { multipleSelections } from "./selections.js";

const opened: EditorView[] = [];

function open(doc: string, cursor = 0): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [multipleSelections],
    }),
  });
  opened.push(view);
  return view;
}

afterEach(() => {
  for (const view of opened.splice(0)) view.destroy();
});

/**
 * Press a key in the editor. jsdom is not a Mac, so CodeMirror's `Mod` is
 * Ctrl here — which is why ⌥⌘E is sent as Ctrl+Alt+E.
 */
function press(view: EditorView, init: KeyboardEventInit): boolean {
  return runScopeHandlers(view, new KeyboardEvent("keydown", init), "editor");
}

const ranges = (view: EditorView) =>
  view.state.selection.ranges.map(({ from, to }) => view.state.sliceDoc(from, to) || from);

describe("several selections at once", () => {
  it("is allowed at all", () => {
    expect(open("").state.facet(EditorState.allowMultipleSelections)).toBe(true);
  });

  it("types into every cursor", () => {
    const view = open("box\nbox");
    view.dispatch({
      selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.cursor(4)]),
    });
    view.dispatch(view.state.replaceSelection("A: "));

    expect(view.state.doc.toString()).toBe("A: box\nA: box");
  });
});

describe("Xcode's Shortcuts", () => {
  it("selects the next occurrence on ⌥⌘E, adding one each time", () => {
    const view = open("box; circle; box; box", 1);

    expect(press(view, { key: "e", ctrlKey: true, altKey: true })).toBe(true);
    expect(ranges(view)).toEqual(["box"]);

    press(view, { key: "e", ctrlKey: true, altKey: true });
    expect(ranges(view)).toEqual(["box", "box"]);
  });

  it("adds a cursor on the line below on ⌃⇧↓, and above on ⌃⇧↑", () => {
    // Moving vertically needs layout, which jsdom does not do, so this checks
    // the binding and e2e/editing.spec.ts checks what it does.
    const bindings = open("").state.facet(keymap).flat();
    const bound = (key: string) => bindings.find((binding) => binding.key === key)?.run;

    expect(bound("Ctrl-Shift-ArrowDown")).toBe(addCursorBelow);
    expect(bound("Ctrl-Shift-ArrowUp")).toBe(addCursorAbove);
  });

  it("adds a cursor on ⌃⇧-click, as well as CodeMirror's own Mod-click", () => {
    const adds = open("").state.facet(EditorView.clickAddsSelectionRange);
    const click = (init: MouseEventInit) =>
      adds.some((test) => test(new MouseEvent("mousedown", init)));

    expect(click({ ctrlKey: true, shiftKey: true })).toBe(true);
    // Mod is Ctrl in jsdom, which is not a Mac.
    expect(click({ ctrlKey: true })).toBe(true);
    expect(click({ shiftKey: true })).toBe(false);
    expect(click({})).toBe(false);
  });
});
