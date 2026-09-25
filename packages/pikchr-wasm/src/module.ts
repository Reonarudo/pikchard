import initPikchrModule, { type PikchrModule } from "../wasm/pikchr.mjs";

export type { PikchrModule };

let pending: Promise<PikchrModule> | undefined;

/**
 * The WASM module, instantiated once per process and shared.
 *
 * Not part of the package's public entry point: `loadPikchr()` in `index.ts`
 * is the seam the rest of the app uses. Tests reach for this directly when
 * they need to watch the heap.
 */
export function loadModule(): Promise<PikchrModule> {
  pending ??= initPikchrModule();
  return pending;
}
