import { describe, expect, it } from "vitest";
import { COPY } from "./copy.js";

const now = Date.UTC(2026, 8, 24, 12, 0, 0);
const ago = (ms: number) => COPY.timeAgo(now - ms, now);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("how long ago the work was last seen (#1100 Prompt C)", () => {
  it("says it in the largest unit that fits, the way a person would", () => {
    expect(ago(2 * HOUR)).toBe("2 hours ago");
    expect(ago(3 * DAY)).toBe("3 days ago");
    expect(ago(2 * 7 * DAY)).toBe("2 weeks ago");
  });

  it("says yesterday and last week rather than counting", () => {
    expect(ago(DAY)).toBe("yesterday");
    expect(ago(7 * DAY)).toBe("last week");
  });

  it("calls work from seconds ago just now", () => {
    // "in 0 seconds" is what arithmetic would say; the user has only just
    // stopped typing.
    expect(ago(0)).toBe("just now");
    expect(ago(30 * SECOND)).toBe("just now");
    expect(ago(MINUTE)).toBe("1 minute ago");
  });

  it("never reads as the future, whatever the clock has done since", () => {
    // Storage outlives a clock change, and a Draft from "in 2 hours" would be
    // nonsense rather than information.
    expect(COPY.timeAgo(now + 2 * HOUR, now)).toBe("just now");
  });
});

describe("the words themselves", () => {
  it("names the file in the Prompt that asks about the file", () => {
    expect(COPY.saveChangesTo("report.md")).toBe("Save changes to report.md?");
    expect(COPY.saveChangesUntitled).toBe("Save your changes?");
  });

  it("says what not saving keeps, and where it does not keep it", () => {
    expect(COPY.saveChangesBody).toBe(
      "Not saving keeps your changes in Pikchard, but not in the file.",
    );
  });

  it("asks about overwriting in the words #1100 settled on", () => {
    expect(COPY.overwrite("report.md")).toBe("Overwrite report.md?");
    expect(COPY.overwriteBody).toBe(
      "The file has changed since you opened it. Saving replaces those changes with yours.",
    );
  });

  it("never calls a Draft a Draft", () => {
    // Internal vocabulary: what the user has is unsaved work (#1100).
    const everything = Object.values(COPY as Record<string, unknown>)
      .map((value) => (typeof value === "function" ? String(value(1, 2)) : String(value)))
      .join(" ");

    expect(everything.toLowerCase()).not.toContain("draft");
    expect(COPY.unsavedWorkTitle).toBe("Unsaved work from last time");
  });

  it("says that a missing file was removed from Recent, and a denial nothing of the sort", () => {
    expect(COPY.movedOrDeleted("report.md")).toBe(
      "report.md has moved or been deleted — removed from Recent",
    );
    expect(COPY.cannotOpenWithoutPermission("report.md")).toBe(
      "Can't open report.md without permission",
    );
    expect(COPY.cannotOpenWithoutPermission("report.md")).not.toContain("Recent");
  });
});
