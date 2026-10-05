import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Draft } from "../document/drafts.js";
import { RestorePrompt } from "./RestorePrompt.js";

let container: HTMLDivElement;
let root: Root;

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const find = (selector: string) => container.querySelector(selector) as HTMLElement | null;
const text = (selector: string) => find(selector)?.textContent ?? null;
const click = (testid: string) =>
  act(() => (find(`[data-testid='${testid}']`) as HTMLButtonElement).click());

const draft = (key: string, name: string, at: number): Draft => ({
  key,
  name,
  identity: { key, name },
  text: "circle\n",
  baseline: "box\n",
  at,
});

/** The prompt, and what it did. */
function show(drafts: Draft[]) {
  const restored: string[] = [];
  const discarded: string[] = [];
  let all = 0;
  act(() =>
    root.render(
      <RestorePrompt
        drafts={drafts}
        now={NOW}
        onRestore={(entry) => restored.push(entry.key)}
        onDiscard={(entry) => discarded.push(entry.key)}
        onDiscardAll={() => {
          all += 1;
        }}
      />,
    ),
  );
  return { restored, discarded, discardedAll: () => all };
}

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the unsaved work from last time (#1100 Prompt C)", () => {
  it("is not shown when there is none", () => {
    show([]);

    expect(find("[data-testid='restore-prompt']")).toBeNull();
  });

  it("degenerates to Restore or Discard for a single Document", () => {
    const shown = show([draft("/report.md", "report.md", NOW - 2 * HOUR)]);

    expect(text(".prompt__title")).toBe("Unsaved work from last time");
    expect(text(".prompt__body")).toBe("report.md · 2 hours ago");
    expect(find("[data-testid='discard-all']")).toBeNull();

    click("restore");
    expect(shown.restored).toEqual(["/report.md"]);
  });

  it("lists one row per Document, each with its own Discard", () => {
    const shown = show([
      draft("/report.md", "report.md", NOW - 2 * HOUR),
      draft("untitled:1", "Untitled", NOW - 26 * HOUR),
    ]);

    expect([...container.querySelectorAll(".prompt__pick")].map((row) => row.textContent)).toEqual([
      "report.md · 2 hours ago",
      "Untitled · yesterday",
    ]);

    click("discard-untitled:1");
    expect(shown.discarded).toEqual(["untitled:1"]);
  });

  it("Restores the work whose row was picked", () => {
    const shown = show([
      draft("/report.md", "report.md", NOW - HOUR),
      draft("/notes.md", "notes.md", NOW - 3 * HOUR),
    ]);

    click("restore-/notes.md");

    expect(shown.restored).toEqual(["/notes.md"]);
  });

  it("discards the lot in one go", () => {
    const shown = show([
      draft("/report.md", "report.md", NOW - HOUR),
      draft("/notes.md", "notes.md", NOW - 3 * HOUR),
    ]);

    click("discard-all");

    expect(shown.discardedAll()).toBe(1);
  });

  it("never says Draft, and never shows a timestamp", () => {
    show([draft("/report.md", "report.md", NOW - 2 * HOUR)]);

    const shown = container.textContent ?? "";
    expect(shown.toLowerCase()).not.toContain("draft");
    expect(shown).not.toContain("2026");
  });
});
