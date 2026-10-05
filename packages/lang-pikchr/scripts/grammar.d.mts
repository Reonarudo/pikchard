/** Absolute path of the grammar source. */
export declare const GRAMMAR_FILE: string;
/** Absolute path of the committed generated parser. */
export declare const PARSER_FILE: string;
/** Absolute path of the committed generated term ids. */
export declare const TERMS_FILE: string;

/** The grammar source, as committed. */
export declare function readGrammar(): string;

/** Compile the grammar, returning the two files `build-grammar.mjs` writes. */
export declare function generate(): { parser: string; terms: string };
