/**
 * The toolbar's icon groups (#1023, #1047, #1101).
 *
 * Four groups separated by hairlines — *New Open Save | Export SVG Copy | Zoom−
 * % Zoom+ Fit | Theme Toggle-editor* — read from `TOOLBAR`, which is a list of
 * `CommandId`s. The buttons therefore cannot disagree with the menus about what a
 * Command is called or whether it can run, and the toolbar survives on desktop
 * where the text menus are hidden.
 *
 * **Accessible names come from the registry** (#1101 guard 7): an icon has no text,
 * so `aria-label` is `COMMANDS[id].title(ctx)` — including the two that change,
 * "Hide Editor" and "Dark Theme", which is why the labels are recomputed on every
 * render rather than captured once.
 */

import {
  Copy,
  FileImage,
  FilePlus,
  FolderOpen,
  Maximize,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Save,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ReactNode } from "react";
import { TOOLBAR } from "../commands/menus.js";
import { COMMANDS, type CommandContext, type CommandId } from "../commands/registry.js";

const ICON_SIZE = 16;

export interface ToolbarProps {
  readonly ctx: CommandContext;
  /** The zoom, which is the label on `zoomReset` rather than an icon (#1047). */
  readonly zoom: string;
}

export function Toolbar({ ctx, zoom }: ToolbarProps) {
  // Both icons say which way the Command will go, and both facts are already in
  // the context — asking for them as props as well would be two sources for one.
  const { editorVisible } = ctx;
  const { theme } = ctx.state();
  const glyphs: Partial<Record<CommandId, ReactNode>> = {
    new: <FilePlus size={ICON_SIZE} />,
    open: <FolderOpen size={ICON_SIZE} />,
    save: <Save size={ICON_SIZE} />,
    exportSvg: <FileImage size={ICON_SIZE} />,
    copyDiagram: <Copy size={ICON_SIZE} />,
    zoomOut: <ZoomOut size={ICON_SIZE} />,
    // The zoom reading doubles as the button back to 100 %, which is where the
    // prototype put it and the one control the group would need a fifth for.
    zoomReset: zoom,
    zoomIn: <ZoomIn size={ICON_SIZE} />,
    fit: <Maximize size={ICON_SIZE} />,
    toggleTheme: theme === "light" ? <Moon size={ICON_SIZE} /> : <Sun size={ICON_SIZE} />,
    toggleEditor: editorVisible ? (
      <PanelLeftClose size={ICON_SIZE} />
    ) : (
      <PanelLeft size={ICON_SIZE} />
    ),
  };

  return (
    <div className="toolbar" data-testid="toolbar">
      {TOOLBAR.map((group) => (
        <div className="toolbar__group" key={group.join("-")}>
          {group.map((id) => {
            const command = COMMANDS[id];
            const enabled = command.enabled(ctx);
            const label = command.title(ctx);
            // The accessible name stays the Command's title; the tooltip says why
            // it cannot run, which is the one thing a dimmed icon cannot (#1055).
            const tooltip = enabled ? label : (command.disabledReason ?? label);
            return (
              <button
                key={id}
                type="button"
                className="toolbar__button"
                data-testid={`toolbar-${id}`}
                // What the shell finds a button by, when it has to put the focus on
                // one (#1101) — a fact about the button, not a test's handle.
                data-command={id}
                title={tooltip}
                aria-label={label}
                // Focusable while dimmed, so a keyboard user is told the Command
                // is unavailable rather than finding it missing (#1101 guard 8) —
                // which is why `run` is guarded here rather than by the browser.
                aria-disabled={!enabled}
                onClick={() => enabled && command.run(ctx)}
              >
                {glyphs[id]}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
