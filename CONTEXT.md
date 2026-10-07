# Pikchard

Pikchard is a live editor for Pikchr diagrams: a Script editor with an instant Diagram preview, Pikchr language services, Document handling and export — delivered as a web app and a desktop app from one codebase.

## Words the user sees

The terms below are how *we* talk. Only five of them are also how the *app* talks: **Script**, **Example**, **Diagram**, **Recent** and **Untitled**. Every other term here is internal — it belongs in the code, the tracker and this file, and never reaches the screen.

A user-facing term is capitalised only where it is a label ("Copy Diagram", the Examples menu) and lowercase in prose ("Copied the last diagram that rendered"). Where a term has no user-facing counterpart, copy falls back to ordinary English: a Document is a "file", a Draft is "unsaved work", a Fence is not named at all.

## Language

### Text and files

**Script**:
The Pikchr text that describes one diagram. It is always one contiguous stretch of its Document, taken verbatim — a Script inside an indented Fence keeps that indentation, which Pikchr reads as whitespace.
_Avoid_: source, code, program

**Span**:
A start/end offset range within a Script.
_Avoid_: range, location

**Document**:
A text file that contains one or more Scripts — a `.pikchr` file holds exactly one; a Markdown file holds one per Fence. It always has a Name; it separately has, or lacks, an Identity.
_Avoid_: file, tab, buffer

**Name**:
What a Document is called — in the title, and as the default when saving. Taken from the file it was opened from, or "Untitled" when it came from nowhere. A Name is not an Identity: a Document can be called `report.md` and still have no way back to the file of that name.
_Avoid_: filename, title

**Identity**:
What lets Pikchard write a Document back to where it came from, and find it again in a later session. A Document that has one can be saved in place and remembered in Recent; a Document that has none can only be saved by choosing a destination, and is never remembered.
_Avoid_: path, handle, url (each is only one Platform's form of it)

**Fence**:
A Markdown fenced code block whose info string starts with `pikchr`, holding exactly one Script. A Script's Span in its Document excludes the fence lines.
_Avoid_: block, code block

**Untitled**:
A Document that never had a Name — one started from New or from an Example, rather than opened from a file. It has no Identity either, so Save asks where to put it. A Document that has a Name but no Identity is not Untitled.
_Avoid_: new file, scratch, unnamed

**Active Script**:
The Script the cursor is in — or, when the cursor is outside every Fence, the nearest Script before it. The one being rendered and shown in the Preview. A Document with no Scripts has no Active Script.

**Baseline**:
The Document's text as it was last opened or saved — what Unsaved is judged against, and what tells Pikchard whether the file has changed underneath it since.
_Avoid_: original, saved version, snapshot

**Unsaved**:
The state of a Document whose text differs from its Baseline.
_Avoid_: dirty, modified, changed

**Draft**:
The copy of an Unsaved Document's text that Pikchard keeps between sessions, so it can be restored or discarded on a later launch. Kept per Document — by Identity where there is one, and otherwise for that one Document alone, so two Untitled Documents never share a Draft. A saved Document has no Draft.
_Avoid_: autosave (the mechanism), backup

**Recent**:
The list of Documents Pikchard remembers across sessions, newest first. Only a Document with an Identity can be in it; an entry is stale when its Document can no longer be read.
_Avoid_: recent files, history, MRU

**Example**:
A Script bundled with Pikchard and opened from the Examples menu; it replaces the current Document as an Untitled one.
_Avoid_: sample, template, demo

### Rendering

**Render**:
One run of Pikchr on a Script, yielding either a Diagram or a Render Error.
_Avoid_: compile, build, generate

**Diagram**:
The SVG produced by a successful Render, at the size Pikchr computed for it. A Diagram is made for one theme — a dark Render inverts the strokes — so one Script yields a different Diagram in light and in dark.
_Avoid_: preview, output, image, picture

**Render Error**:
The single error at which Pikchr stopped, together with its Span. Pikchr never reports more than one per Render.
_Avoid_: exception, syntax error (that is one message, not the concept)

**Preview**:
The panel that shows the Diagram with pan, zoom and fit.
_Avoid_: canvas, viewer, output pane

**Export**:
A copy of the Diagram sent out of Pikchard — written as an `.svg` or `.png` file, or placed on the clipboard. An Export is never a Save: it has no Identity, never enters Recent and never becomes the Document, so Pikchard forgets it the moment it leaves.
_Avoid_: save, download, output

### Pikchr language

**Object**:
A shape produced by one Pikchr statement — box, circle, arrow, text, …
_Avoid_: node, shape, element, item

**Label**:
The `NAME:` prefix that names an Object.
_Avoid_: id, name, identifier

**Variable**:
A named numeric value — user-defined (`$x`) or built-in (`boxwid`).

**Macro**:
A parameterised text substitution introduced with `define`.

**Anchor**:
A named point on an Object's perimeter or centre — `.n`, `.ne`, `.start`, `.end`, `.c`. (Pikchr's manual says "anchor point"; its grammar calls the token _edgename_.)
_Avoid_: edge point, edgename, port, handle, corner

**Place**:
A specific resolved point, such as `A.ne` or `2nd box.s`.
_Avoid_: position (a coordinate expression), point

**Symbol**:
Anything a Script defines by name and can refer to later: a Label, a Variable or a Macro.

### Editor feedback

**Diagnostic**:
A problem shown in the editor at a Span — either the Render Error or a Lint.
_Avoid_: marker, error (ambiguous)

**Lint**:
A problem the editor finds without rendering — an undefined Label, an unused Variable.
_Avoid_: warning, hint

### Shell

**Command**:
A named action the user can invoke, offered through any of a menu item, a Shortcut or a toolbar button, and enabled or disabled as a whole. It takes no arguments: a list built from data — the Recent list, the Examples, the Script selector — is not a set of Commands.
_Avoid_: action, operation, handler

**Shortcut**:
The key combination that invokes a Command. One per Command, and it may differ per Platform when a key is not the app's to claim.
_Avoid_: binding, accelerator, hotkey, keybinding

**Toast**:
A transient notice that appears briefly, asks nothing and disappears on its own.
_Avoid_: notification, alert, snackbar, banner

**Prompt**:
A question that blocks until the user answers it.
_Avoid_: dialog (the OS file picker), modal, confirm

### Delivery

**Platform**:
The host Pikchard runs in — Browser or Desktop — seen only through the services it provides: files, dialogs, clipboard, file watching.
_Avoid_: environment, target, runtime
