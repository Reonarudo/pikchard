/**
 * The Render seam: one run of Pikchr on a Script, yielding either a Diagram or
 * a Render Error.
 *
 * The renderer is our own WebAssembly build of a patched pikchr (ADR 0005), so
 * every per-Object element in the Diagram carries `data-pik="<offset>"` — the
 * offset of the statement that produced it. Offsets leave this module in
 * UTF-16 code units, the same space the editor counts in.
 */

import { loadModule, type PikchrModule } from "./module.js";
import { scriptOffsets } from "./offsets.js";
import { parseRenderError, type RenderError, type Span } from "./render-error.js";

export type { RenderError, Span };

export interface RenderOptions {
  /** Render for a dark Preview background. */
  darkMode?: boolean;
  /** Class applied to the root `<svg>` element. */
  cssClass?: string;
}

export type RenderResult =
  | { ok: true; svg: string; width: number; height: number }
  | { ok: false; error: RenderError };

export interface Renderer {
  /** The pinned upstream pikchr version, e.g. `"1.0 20260403102956"`. */
  readonly version: string;
  render(script: string, options?: RenderOptions): RenderResult;
}

/** Error text comes back as plain text so the Span can be parsed out of it. */
const PIKCHR_PLAINTEXT_ERRORS = 0x0001;
const PIKCHR_DARK_MODE = 0x0002;

/** pikchr reports its width and height through two `int *` out-parameters. */
const I32_BYTES = 4;

/** Copy `text` into the WASM heap as NUL-terminated UTF-8. */
function allocString(mod: PikchrModule, text: string): number {
  const size = mod.lengthBytesUTF8(text) + 1;
  const ptr = mod._malloc(size);
  if (ptr === 0) throw new Error("pikchr: out of WASM memory");
  mod.stringToUTF8(text, ptr, size);
  return ptr;
}

function render(mod: PikchrModule, script: string, options: RenderOptions): RenderResult {
  const offsets = scriptOffsets(script);
  const flags = PIKCHR_PLAINTEXT_ERRORS | (options.darkMode === true ? PIKCHR_DARK_MODE : 0);

  // Every allocation below is released in the finally block, including the
  // result buffer, which pikchr hands over for the caller to free.
  let scriptPtr = 0;
  let classPtr = 0;
  let sizePtr = 0;
  let resultPtr = 0;
  try {
    scriptPtr = allocString(mod, script);
    classPtr = options.cssClass === undefined ? 0 : allocString(mod, options.cssClass);
    sizePtr = mod._malloc(2 * I32_BYTES);
    if (sizePtr === 0) throw new Error("pikchr: out of WASM memory");

    const widthPtr = sizePtr;
    const heightPtr = sizePtr + I32_BYTES;
    resultPtr = mod._pikchr(scriptPtr, classPtr, flags, widthPtr, heightPtr);
    const width = mod.getValue(widthPtr, "i32");
    const height = mod.getValue(heightPtr, "i32");
    const text = resultPtr === 0 ? "" : mod.UTF8ToString(resultPtr);

    // pikchr signals failure by writing -1 to both sizes.
    if (width < 0 || height < 0) {
      return { ok: false, error: parseRenderError(text, offsets) };
    }
    return { ok: true, svg: offsets.toUtf16Diagram(text), width, height };
  } finally {
    if (resultPtr !== 0) mod._free(resultPtr);
    if (sizePtr !== 0) mod._free(sizePtr);
    if (classPtr !== 0) mod._free(classPtr);
    if (scriptPtr !== 0) mod._free(scriptPtr);
  }
}

/**
 * A Renderer over an already-instantiated pikchr module.
 *
 * `loadPikchr()` is the seam the app uses; this exists so the golden
 * generator can drive an *unpatched* build through the very same code path.
 */
export function createRenderer(mod: PikchrModule): Renderer {
  return {
    version: mod.UTF8ToString(mod._pikchr_version()),
    render: (script, options = {}) => render(mod, script, options),
  };
}

/** Load the Pikchr renderer. Resolves once the WASM module is ready. */
export async function loadPikchr(): Promise<Renderer> {
  return createRenderer(await loadModule());
}
