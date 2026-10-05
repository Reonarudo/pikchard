/**
 * The three Export Commands (#1021, #1055).
 *
 * One hook, because all three answer the same three questions — is there a
 * Diagram to send, is it the Diagram of the text on screen, and what should the
 * file be called — and only diverge in the last step. The Command registry that
 * will own their titles and Shortcuts is #1053's; this is what it will call.
 *
 * Every one of them acts on the **last-good Diagram** and never re-renders: the
 * file has to be the picture the user is looking at. When that picture is out of
 * date — the current text fails to parse — the Export still happens and a Toast
 * says which Diagram went out, because that is the one thing the screen does not
 * already show (#1055).
 */

import { useCallback } from "react";
import { COPY } from "../copy.js";
import type { Platform } from "../platform/types.js";
import { useStore } from "../store.js";
import { exportFilename } from "./filename.js";
import { rasterise } from "./png.js";
import { exportableSvg } from "./svg.js";

export interface ExportCommandsOptions {
  readonly platform: Promise<Platform>;
  /** Injected by the tests; the real one is the window (see `png.ts`). */
  readonly scope?: typeof globalThis;
}

export interface ExportCommands {
  /**
   * Whether there is a Diagram to send at all. False only before the first
   * successful Render — a failing Script keeps the last one, which is exactly
   * what these Commands act on.
   */
  readonly canExport: boolean;
  readonly exportSvg: () => Promise<void>;
  readonly exportPng: () => Promise<void>;
  readonly copyDiagram: () => Promise<void>;
}

export function useExportCommands({ platform, scope }: ExportCommandsOptions): ExportCommands {
  const lastGood = useStore((state) => state.render.lastGood);
  const canExport = lastGood !== null;

  /**
   * The Diagram to send, already rewritten for export, and whether it is out of
   * date. Read at the moment the Command runs rather than closed over, so a
   * Render that lands between the click and the dialog is not exported behind a
   * stale Toast.
   */
  const subject = useCallback(() => {
    const { render, theme, document, scripts } = useStore.getState();
    if (!render.lastGood) return null;
    return {
      svg: exportableSvg(render.lastGood.diagram, theme),
      size: render.lastGood.diagram,
      theme,
      stale: render.error !== null,
      name: (format: "svg" | "png") => exportFilename({ name: document.name, ...scripts }, format),
    };
  }, []);

  /**
   * Write one file: the destination first, the bytes second.
   *
   * That order is the Platform's contract (`exportFile`) and it is why `produce`
   * is a function — both file pickers need transient activation, which awaiting a
   * rasterisation can spend (#1055).
   */
  const write = useCallback(
    async (format: "svg" | "png", produce: () => Promise<Blob>) => {
      const sending = subject();
      if (!sending) return;
      const host = await platform;
      const { showToast } = useStore.getState();

      try {
        const outcome = await host.exportFile(sending.name(format), produce);
        if (outcome === "cancelled") return;
        // Stale first: it *replaces* the success wording, and on the download
        // path there is a success line to replace.
        if (sending.stale) showToast(COPY.exportedStale);
        else if (outcome === "downloaded") showToast(COPY.savedToDownloads);
      } catch (failure) {
        console.error("Export failed", failure);
        showToast(COPY.cannotSaveFile);
      }
    },
    [platform, subject],
  );

  const exportSvg = useCallback(async () => {
    const sending = subject();
    if (!sending) return;
    await write("svg", async () => new Blob([sending.svg], { type: "image/svg+xml" }));
  }, [subject, write]);

  const exportPng = useCallback(async () => {
    const sending = subject();
    if (!sending) return;
    await write("png", () => rasterise(sending.svg, sending.size, sending.theme, scope));
  }, [scope, subject, write]);

  /**
   * Copy: one payload with every flavour, the PNG still rasterising.
   *
   * The inverse of the Export path above, and deliberately: the clipboard item
   * must be *built* inside the gesture with a promise that resolves later, which
   * is what `ClipboardPayload.png` being a promise is for.
   */
  const copyDiagram = useCallback(async () => {
    const sending = subject();
    if (!sending) return;
    const host = await platform;
    const { showToast } = useStore.getState();

    try {
      await host.clipboardWrite({
        svg: sending.svg,
        png: rasterise(sending.svg, sending.size, sending.theme, scope),
        // The markup, not the Script: copying the Script is its own Command, and
        // it is `later` (#1033).
        text: sending.svg,
      });
      showToast(sending.stale ? COPY.copiedStale : COPY.diagramCopied);
    } catch (failure) {
      console.error("Copy failed", failure);
      showToast(COPY.cannotCopyDiagram);
    }
  }, [platform, scope, subject]);

  return { canExport, exportSvg, exportPng, copyDiagram };
}
