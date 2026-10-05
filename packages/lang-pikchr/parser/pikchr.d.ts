/**
 * Types for the committed generated parser (`pikchr.js`, built by
 * `scripts/build-grammar.mjs`). Hand-written, because `lezer-generator` emits
 * no declarations — and short, because the generated module has exactly one
 * export.
 */

import type { LRParser } from "@lezer/lr";

export declare const parser: LRParser;
