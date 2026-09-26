/**
 * What the native menu currently says, and what has to change (#1023, #1053).
 *
 * The desktop menu is not re-rendered: every `setEnabled` and `setText` is an IPC
 * call, and the enabled state of twenty Commands is recomputed on every keystroke.
 * So the state is snapshotted, compared with the last snapshot, and **only the
 * differences are pushed** — which is what makes #1053's guard 7 ("a keystroke
 * that flips no Command's enabled state or title makes zero menu IPC calls")
 * something the code does rather than something it hopes for.
 *
 * Pure, and tested as such: the Tauri side of the menu is the untestable part, and
 * this is the part that decides.
 */

import { COMMANDS, type CommandContext, type CommandId } from "./registry.js";

/** One Command as a menu item shows it. */
export interface ItemState {
  readonly enabled: boolean;
  readonly title: string;
}

export type MenuState = ReadonlyMap<CommandId, ItemState>;

/** What each of `ids` should look like right now. */
export function menuStateFor(ids: readonly CommandId[], ctx: CommandContext): MenuState {
  const state = new Map<CommandId, ItemState>();
  for (const id of ids) {
    const command = COMMANDS[id];
    state.set(id, { enabled: command.enabled(ctx), title: command.title(ctx) });
  }
  return state;
}

export interface ItemChange {
  readonly id: CommandId;
  /** Present only when it changed — so a title-only change pushes no `setEnabled`. */
  readonly enabled?: boolean;
  readonly title?: string;
}

/**
 * What to push. Empty when nothing moved, which is the common case: most
 * keystrokes change neither what is enabled nor what anything is called.
 */
export function diffMenuState(previous: MenuState | null, next: MenuState): readonly ItemChange[] {
  const changes: ItemChange[] = [];
  for (const [id, item] of next) {
    const before = previous?.get(id);
    const enabled = before?.enabled === item.enabled ? undefined : item.enabled;
    const title = before?.title === item.title ? undefined : item.title;
    if (enabled === undefined && title === undefined) continue;
    changes.push({
      id,
      ...(enabled === undefined ? {} : { enabled }),
      ...(title === undefined ? {} : { title }),
    });
  }
  return changes;
}
