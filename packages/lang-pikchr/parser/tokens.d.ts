import type { ExternalTokenizer } from "@lezer/lr";

/** The one-word lookahead that decides which of the four `.` tokens this is. */
export declare const dotTokens: ExternalTokenizer;

/** The balanced-parenthesis scan of a Macro argument list. */
export declare const macroArgs: ExternalTokenizer;
