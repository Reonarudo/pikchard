/**
 * The web menu bar (#1023, #1047, #1101).
 *
 * One component for every dropdown — File, View, Examples, Help — and for the
 * lists inside them, so Recent, the Examples and the theme choices are
 * keyboard-operable by construction rather than as three separate features
 * (#1101 guard 2).
 *
 * **Not the ARIA menu pattern.** Each dropdown is a disclosure: an
 * `aria-expanded` button over plain `<button>`s that Tab walks. `role="menu"` is
 * a contract — roving `tabindex`, Up/Down/Home/End, typeahead — and half of it is
 * worse than none, because the user is told "menu" and then the arrow keys do
 * nothing (#1101 guard 1). The theme choices are real radio inputs, which carry
 * their own grouping and their own arrow keys.
 *
 * On desktop this renders nothing at all: the native menu bar carries the same
 * `MENUS`, and two menu bars is one too many (#1047).
 */

import { useRef } from "react";
import type { Menu, MenuItem } from "../commands/menus.js";
import type { Command, CommandContext, CommandId } from "../commands/registry.js";
import { COMMANDS, shortcutOf } from "../commands/registry.js";
import { displayShortcut } from "../commands/shortcut.js";
import { COPY } from "../copy.js";
import type { Example } from "../examples/examples.js";
import type { DocumentRef, PlatformKind } from "../platform/types.js";
import { THEME_CHOICES, type ThemeChoice } from "../theme.js";
import { useDisclosure } from "./disclosure.js";

export interface MenuBarProps {
  readonly menus: readonly Menu[];
  readonly kind: PlatformKind;
  /** Read fresh on every render: enabled state and two titles depend on it. */
  readonly ctx: CommandContext;
  readonly recent: readonly DocumentRef[];
  /** Whether this Platform keeps Recent at all — absent, not empty, if not (#1054). */
  readonly showsRecent: boolean;
  readonly examples: readonly Example[];
  readonly themeChoice: ThemeChoice;
  readonly onOpenRecent: (ref: DocumentRef) => void;
  readonly onOpenExample: (example: Example) => void;
  readonly onChooseTheme: (choice: ThemeChoice) => void;
}

export function MenuBar(props: MenuBarProps) {
  if (props.kind === "desktop") return null;
  return (
    <>
      {props.menus
        .filter((menu) => !menu.desktopOnly)
        .map((menu) => (
          <MenuDropdown key={menu.title} menu={menu} {...props} />
        ))}
    </>
  );
}

function MenuDropdown({ menu, ...props }: { menu: Menu } & MenuBarProps) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { open, toggle, close } = useDisclosure(container, trigger);
  const id = menu.title.toLowerCase();

  return (
    <div className="menu" ref={container}>
      <button
        type="button"
        ref={trigger}
        data-testid={`${id}-menu`}
        aria-expanded={open}
        aria-controls={`${id}-menu-items`}
        onClick={toggle}
      >
        {menu.title}
      </button>

      {open && (
        <div className="menu__items" id={`${id}-menu-items`} data-testid={`${id}-menu-items`}>
          {menu.items.map((item, index) => {
            // A separator and a list have no identity of their own, so their
            // position is the only key there is.
            const key = item.kind === "command" ? item.id : `${item.kind}-${index}`;
            return <Item key={key} item={item} close={close} {...props} />;
          })}
        </div>
      )}
    </div>
  );
}

function Item({
  item,
  close,
  ...props
}: { item: MenuItem; close: () => void } & MenuBarProps): React.ReactElement | null {
  switch (item.kind) {
    case "separator":
      return <hr className="menu__rule" />;
    case "predefined":
      // Desktop-only by definition: the browser supplies Cut, Copy, Paste and
      // Select All itself, and the Edit menu they live in never reaches the web.
      return null;
    case "command":
      return <CommandItem id={item.id} close={close} {...props} />;
    case "list":
      return <ListItems list={item.list} close={close} {...props} />;
  }
}

function CommandItem({
  id,
  close,
  ctx,
  kind,
}: { id: CommandId; close: () => void } & MenuBarProps) {
  const command: Command = COMMANDS[id];
  const enabled = command.enabled(ctx);
  const shortcut = shortcutOf(command, kind);

  return (
    <button
      type="button"
      className="menu__item"
      data-testid={`command-${id}`}
      // Dimmed rather than removed, and `aria-disabled` rather than `disabled`, so
      // a keyboard user lands on it and is told it is unavailable (#1101 guard 8).
      aria-disabled={!enabled}
      title={enabled ? undefined : command.disabledReason}
      onClick={() => {
        if (!enabled) return;
        close();
        command.run(ctx);
      }}
    >
      <span>{command.title(ctx)}</span>
      {shortcut && <kbd className="menu__shortcut">{displayShortcut(shortcut)}</kbd>}
    </button>
  );
}

/** Recent, the Examples, the theme choices: the three lists built from data. */
function ListItems({
  list,
  close,
  recent,
  showsRecent,
  examples,
  themeChoice,
  onOpenRecent,
  onOpenExample,
  onChooseTheme,
}: { list: "recent" | "examples" | "themes"; close: () => void } & MenuBarProps) {
  if (list === "recent") {
    // Absent rather than empty where the Platform keeps none: a permanently empty
    // section just looks broken (#1054).
    if (!showsRecent) return null;
    return (
      <section className="menu__group" aria-labelledby="menu-recent">
        <span className="menu__heading" id="menu-recent">
          {COPY.recent}
        </span>
        {recent.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="menu__recent"
            data-testid={`recent-${entry.key}`}
            title={entry.path ?? entry.name}
            onClick={() => {
              close();
              onOpenRecent(entry);
            }}
          >
            {entry.name}
          </button>
        ))}
      </section>
    );
  }

  if (list === "examples") {
    return (
      <>
        {examples.map((example) => (
          <button
            key={example.name}
            type="button"
            data-testid={`example-${slug(example.name)}`}
            onClick={() => {
              close();
              onOpenExample(example);
            }}
          >
            {example.name}
          </button>
        ))}
      </>
    );
  }

  // Real radio inputs, not `menuitemradio`: that role belongs to the ARIA menu
  // pattern #1101 guard 1 rules out, and is not even valid outside a `role="menu"`.
  // A `<fieldset>` of radios says "one choice of three" *and* brings the arrow
  // keys with it, from the browser rather than from us.
  return (
    <fieldset className="menu__group menu__radios">
      <legend className="menu__heading">{COPY.theme}</legend>
      {THEME_CHOICES.map(({ choice, label }) => (
        <label key={choice} className="menu__radio">
          <input
            type="radio"
            name="theme"
            value={choice}
            checked={choice === themeChoice}
            data-testid={`theme-${choice}`}
            onChange={() => {
              close();
              onChooseTheme(choice);
            }}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
