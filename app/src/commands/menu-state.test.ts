import { describe, expect, it } from "vitest";
import { diffMenuState, menuStateFor } from "./menu-state.js";
import type { CommandContext, CommandId } from "./registry.js";

const IDS: CommandId[] = ["save", "exportSvg", "toggleEditor"];

function context(over: { lastGood?: boolean; editorVisible?: boolean } = {}): CommandContext {
  return {
    state: () =>
      ({
        render: { lastGood: over.lastGood === false ? null : { diagram: {}, script: "" } },
        scripts: { count: 1, activeIndex: 0 },
        theme: "light",
      }) as unknown as ReturnType<CommandContext["state"]>,
    session: {} as unknown as CommandContext["session"],
    exports: {} as unknown as CommandContext["exports"],
    panzoom: {} as unknown as CommandContext["panzoom"],
    editor: () => null,
    jumpToScript: () => {},
    toggleEditor: () => {},
    openExternal: () => {},
    showAbout: () => {},
    editorVisible: over.editorVisible ?? true,
  };
}

describe("what the native menu should say", () => {
  it("is each Command's own answer, asked once", () => {
    const state = menuStateFor(IDS, context({ lastGood: false }));

    expect(state.get("save")).toEqual({ enabled: true, title: "Save" });
    expect(state.get("exportSvg")).toEqual({ enabled: false, title: "Export SVG…" });
    expect(state.get("toggleEditor")).toEqual({ enabled: true, title: "Hide Editor" });
  });
});

describe("what has to be pushed to it", () => {
  it("is everything, the first time", () => {
    const next = menuStateFor(IDS, context());

    expect(diffMenuState(null, next)).toHaveLength(IDS.length);
  });

  it("is nothing at all when nothing moved", () => {
    // #1053 guard 7: a keystroke that flips no Command makes zero IPC calls.
    const first = menuStateFor(IDS, context());
    const second = menuStateFor(IDS, context());

    expect(diffMenuState(first, second)).toEqual([]);
  });

  it("is the one item that changed, and only the field that changed", () => {
    const before = menuStateFor(IDS, context({ lastGood: false }));
    const after = menuStateFor(IDS, context({ lastGood: true }));

    expect(diffMenuState(before, after)).toEqual([{ id: "exportSvg", enabled: true }]);
  });

  it("pushes a title on its own when only the title moved", () => {
    const before = menuStateFor(IDS, context({ editorVisible: true }));
    const after = menuStateFor(IDS, context({ editorVisible: false }));

    expect(diffMenuState(before, after)).toEqual([{ id: "toggleEditor", title: "Show Editor" }]);
  });
});
