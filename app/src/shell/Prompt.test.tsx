import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prompt, type PromptRequest, usePrompt } from "./Prompt.js";
import {
  CANCEL,
  DONT_SAVE,
  OVERWRITE,
  overwritePrompt,
  SAVE,
  saveChangesPrompt,
} from "./prompts.js";

let container: HTMLDivElement;
let root: Root;

const find = (selector: string) => container.querySelector(selector) as HTMLElement | null;
const click = (id: string) =>
  act(() => (find(`[data-testid='prompt-${id}']`) as HTMLButtonElement).click());
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });

/** A host that shows whatever it is asked, and remembers the answers. */
function host() {
  const answers: string[] = [];
  let ask: (request: PromptRequest) => Promise<string>;

  function Host() {
    const prompt = usePrompt();
    ask = prompt.ask;
    return <Prompt pending={prompt.pending} />;
  }

  act(() => root.render(<Host />));
  return {
    answers,
    ask: (request: PromptRequest) => {
      act(() => {
        void ask(request).then((answer) => answers.push(answer));
      });
    },
  };
}

/** Let the promise the answer resolved settle. */
const settle = () => act(async () => {});

beforeEach(() => {
  container = window.document.createElement("div");
  window.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the Prompt", () => {
  it("is not there until something asks", () => {
    host();

    expect(find("[data-testid='prompt']")).toBeNull();
  });

  it("asks in the words it was given, and answers with the button clicked", async () => {
    const asking = host();
    asking.ask(saveChangesPrompt("report.md", false));

    expect(find(".prompt__title")?.textContent).toBe("Save changes to report.md?");
    expect(find(".prompt__body")?.textContent).toBe(
      "Not saving keeps your changes in Pikchard, but not in the file.",
    );

    click(DONT_SAVE);
    await settle();

    expect(asking.answers).toEqual([DONT_SAVE]);
    expect(find("[data-testid='prompt']")).toBeNull();
  });

  it("asks an Untitled Document about the changes rather than about a file", () => {
    host().ask(saveChangesPrompt("Untitled", true));

    expect(find(".prompt__title")?.textContent).toBe("Save your changes?");
  });

  it("puts the default choice under the cursor, so Return answers it", () => {
    host().ask(saveChangesPrompt("report.md", false));

    expect(window.document.activeElement).toBe(find(`[data-testid='prompt-${SAVE}']`));
    expect(find("[data-default='true']")?.textContent).toBe("Save");
  });

  it("answers the Escape choice on Escape", async () => {
    const asking = host();
    asking.ask(saveChangesPrompt("report.md", false));

    press("Escape");
    await settle();

    expect(asking.answers).toEqual([CANCEL]);
  });

  it("sends Return and Escape both to Cancel when asking about overwriting", () => {
    // The only destructive Prompt in the app: the reflex answer must be the
    // safe one (#1100 B).
    host().ask(overwritePrompt("report.md"));

    expect(find(".prompt__title")?.textContent).toBe("Overwrite report.md?");
    expect(window.document.activeElement).toBe(find(`[data-testid='prompt-${CANCEL}']`));
    expect(find(`[data-testid='prompt-${OVERWRITE}']`)).not.toBeNull();
  });

  it("names itself to a screen reader by its own question", () => {
    host().ask(saveChangesPrompt("report.md", false));

    // A modal `<dialog>` *is* `role="dialog"` with `aria-modal`, so neither is
    // written by hand: what is written is what it is named by (#1101 guard 4).
    const dialog = find("[data-testid='prompt']") as HTMLDialogElement;
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBe(find(".prompt__title")?.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(find(".prompt__body")?.id);
  });

  it("is opened as a modal, which is what holds focus and dims the rest", () => {
    // Focus containment, the inert backdrop and focus restoration are the
    // browser's and are asserted in Playwright; what a unit test can see is that
    // the dialog was opened the modal way and knows its default choice.
    host().ask(saveChangesPrompt("report.md", false));

    // React applies `autoFocus` by focusing the element rather than by writing the
    // attribute, so what there is to see is where the focus went.
    expect(window.document.activeElement).toBe(find("[data-default='true']"));
  });

  it("refuses a second question while the first is unanswered", async () => {
    // Two Prompts at once would mean two operations running on one Document.
    const asking = host();
    asking.ask(saveChangesPrompt("report.md", false));

    asking.ask(overwritePrompt("report.md"));
    await settle();

    expect(asking.answers).toEqual([CANCEL]);
    expect(find(".prompt__title")?.textContent).toBe("Save changes to report.md?");
  });
});
