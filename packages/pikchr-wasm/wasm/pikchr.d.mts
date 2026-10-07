/**
 * Types for the committed Emscripten build (`pikchr.mjs`, built by
 * `scripts/build-wasm.sh`). Hand-written: Emscripten emits no declarations,
 * and only the handful of exports we asked for on the `emcc` command line are
 * present, so this file doubles as the list of what the build must provide.
 */

export interface PikchrModule {
  /** `char *pikchr(const char*, const char*, unsigned, int*, int*)` */
  _pikchr(
    zText: number,
    zClass: number,
    mFlags: number,
    pnWidth: number,
    pnHeight: number,
  ): number;
  /** `const char *pikchr_version(void)` */
  _pikchr_version(): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
  lengthBytesUTF8(str: string): number;
  getValue(ptr: number, type: "i32"): number;
}

declare const initPikchrModule: () => Promise<PikchrModule>;
export default initPikchrModule;
