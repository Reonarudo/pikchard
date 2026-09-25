/**
 * Adversarial input, written here rather than taken from the corpus.
 *
 * The conformance corpus is every Script upstream ships, and upstream ships no
 * half-typed ones — but half-typed is the state a live editor is in most of
 * the time. These are ours: each is either a place two grammar shapes were
 * expected to disagree (#1051), or a place a Script has to stay readable while
 * it is being typed.
 */

export interface Fixture {
  readonly name: string;
  /** Why this one is worth a test, in one sentence. */
  readonly note: string;
  readonly text: string;
}

export const HAPPY_FIXTURES: readonly Fixture[] = [
  {
    name: "plain statements",
    note: "The baseline: if this one ever fails, read no further down the file.",
    text: 'down\nbox "start"\narrow\ncircle "middle" fill 0xeeeeee\narrow\nbox "finish"',
  },
  {
    name: "compass word as a variable",
    note:
      "`n` is an Anchor, and also legal as a Variable name where no Anchor is grammatical — " +
      "upstream needs %fallback ID EDGEPT for this, and we need the GLR marker.",
    text: "n = 3\nbox wid n\nline then n",
  },
  {
    name: "the four kinds of dot",
    note:
      "`.ne` is an Anchor, `.x` a coordinate, `.wid` a property and `.Inner` a sublist " +
      "Label — four tokens for the same character, decided by the word after it.",
    text: "Outer: [ Inner: box ]\ncircle at Outer.Inner.ne\nx1 = Outer.Inner.x\nprint Outer.wid",
  },
  {
    name: "macro definition and call",
    note: "The body is a nested statement list, not an opaque blob, so it highlights.",
    text: 'define pill { box rad 0.3 $1 }\npill("one")\npill("two") at last box + (0, -0.6)',
  },
  {
    name: "brace inside a macro body string",
    note: "A `}` inside a String or a Comment must not close the body.",
    text: 'define tricky { box "a } b" # }\n }\ntricky',
  },
  {
    name: "macro call spanning a continuation line",
    note: "The argument-list scan has to carry across a `\\`-newline.",
    text: 'define pair { box "$1" ; box "$2" }\npair("one", \\\n  "two")',
  },
  {
    name: "position arithmetic",
    note: "The place/position tower, which is what the `place`/`place2` split exists for.",
    text:
      "Origin: dot\nbox at Origin + (0.5, 0)\n" +
      "circle at 1/2 of the way between Origin and last box",
  },
  {
    name: "position operators",
    note: "`right of`, `above` and `heading` are position operators and attribute keywords both.",
    text:
      "C: circle\nbox at 1cm right of C\n" +
      'text "t" at 0.4 above C\ndot at 1cm heading 30 from C\nline from C go 1cm heading 45',
  },
  {
    name: "keywords that are also variables",
    note: "`fill`, `color` and `thickness` need parentheses to be read in an expression.",
    text: "fill = 0.5\nthickness *= 2\nbox wid (fill) + 1\nprint fill, color, thickness",
  },
  {
    name: "numbers, units and ordinals",
    note: "Glued units, no exponent, integer-only ordinals, and the one-digit hex quirk.",
    text: "box wid 2cm ht .5in rad 3px\ncircle fill 0xff00ff\nmove to 3rd box\nline to first circle",
  },
  {
    name: "arrows in three spellings",
    note: "ASCII, UTF-8 and HTML-entity spellings of the same three tokens.",
    text: 'arrow ->\narrow <-> "both" above\narrow &rarr;\narrow ↔',
  },
  {
    name: "text attributes stack",
    note: "Several Strings on one Object, each with its own position and style words.",
    text: 'box "top" above "bottom" below "b" big bold italic ljust',
  },
  {
    name: "comments and continuation",
    note: "`#` and `//` stop before the newline, so they cannot swallow the separator.",
    text: "box /* inline */ wid 1 \\\n  ht 2 # trailing\n// whole line\ncircle",
  },
  {
    name: "empty statements and separators",
    note: "Runs of newlines and semicolons are legal; the empty statement is a real production.",
    text: ";;\nbox;;circle\n\n\n;\narrow",
  },
  {
    name: "every one of the fourteen classes",
    note: "`diamond` is the one a port drops, so every class is named here once.",
    text:
      "arc; arrow; box; circle; cylinder; diamond; dot\n" +
      'ellipse; file; line; move; oval; spline; text "t"',
  },
];

/** Input that is *meant* to be wrong, and has to stay readable anyway. */
export const BROKEN_FIXTURES: readonly Fixture[] = [
  {
    name: "half-typed attribute",
    note: "The commonest state of a live editor: the name is typed, the value is not.",
    text: "box wid ",
  },
  {
    name: "broken line between good ones",
    note: "The question that matters: is the damage contained to its own line?",
    text: 'box "before"\ncircle wid wid wid at at\nbox "after"\narrow -> from last box',
  },
  {
    name: "unclosed bracket",
    note: "Mid-typing: the Sublist is open and the rest of the Script is inside it.",
    text: "A: [ box\n  circle\narrow from A.n",
  },
  {
    name: "unterminated string",
    note: "Upstream calls this an unrecognized token and stops reading the Script.",
    text: 'box "never closed\ncircle "fine"',
  },
  {
    name: "typing a keyword",
    note: "`colo` is not a keyword yet. It must not smear the colour of what follows.",
    text: "box colo",
  },
  {
    name: "unclosed macro body",
    note: "The body is a nested statement list, so an unclosed `{` swallows what follows it.",
    text: 'define half { box "a"\ncircle',
  },
];
