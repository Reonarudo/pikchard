/**
 * "Script *n* of *m*", in the status bar (#1019, #1047).
 *
 * Three states, and the difference between them is the whole design: a Document
 * with several Scripts gets a control to jump between them; a Document with one
 * gets the *fact* — there is nowhere to jump to, and a menu of one item would
 * only look broken; a Document with none gets nothing, because the empty Preview
 * already explains itself and a "0 Scripts" cell explains nothing (#1047).
 *
 * A flat list rather than a submenu: a Document has a handful of Fences, and
 * "Script 7" is the only distinguishing thing there is to say about one — the
 * Fence's info string is not a title and the first line of a Script is not
 * either.
 */

import { useRef } from "react";
import { COPY } from "../copy.js";
import { useDisclosure } from "./disclosure.js";

export interface ScriptSelectorProps {
  /** How many Scripts the Document has. */
  readonly count: number;
  /** Which one is Active, zero-based, or `null` when there are none. */
  readonly activeIndex: number | null;
  /** Take the cursor into Script `index`, zero-based. */
  readonly onJump: (index: number) => void;
}

export function ScriptSelector({ count, activeIndex, onJump }: ScriptSelectorProps) {
  const cell = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { open, toggle, close } = useDisclosure(cell, trigger);

  if (count === 0 || activeIndex === null) return null;
  if (count === 1) return <span data-testid="script-count">{COPY.oneScript}</span>;

  return (
    <div className="menu menu--up" ref={cell}>
      <button
        type="button"
        ref={trigger}
        data-testid="script-selector"
        aria-expanded={open}
        aria-controls="script-selector-items"
        onClick={toggle}
      >
        {COPY.scriptOf(activeIndex + 1, count)}
      </button>

      {open && (
        /* Deliberately not `role="menu"`, for the same reason as the menu bar:
           that role promises arrow-key navigation between items, and this is a
           disclosed group of buttons that Tab walks (#1101 guard 1). */
        <div className="menu__items" id="script-selector-items" data-testid="script-selector-items">
          {Array.from({ length: count }, (_, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: a Script's identity *is* its position — #1042 — and the list has nothing else to be keyed by
              key={index}
              type="button"
              data-testid={`script-${index + 1}`}
              // The one you are on, said out loud: the list is a choice made
              // from somewhere, and a jump to where you already are is a no-op
              // the user should be able to see coming.
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => {
                close();
                onJump(index);
              }}
            >
              {COPY.script(index + 1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
