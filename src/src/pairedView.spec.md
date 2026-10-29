# Paired view

Parent: [Spec Scope](../../spec-scope/app.md)
Source: [pairedView.ts](./pairedView.ts)

## Responsibility

`pairedView.ts` owns one spec/source pair. Both sides are VS Code's
native text editors: the `*.spec.md` Markdown source and the code it
describes. The view loads the mapping set to show and decides how far it
can be trusted. It paints matching colors on both sides and keeps them in
semantic scroll sync. It never edits, pads, reorders, or re-renders either
document.

Mappings are stored as spec *source* lines, so showing the Markdown source
makes every mapping land on exactly the lines it names. The earlier
rendered-Markdown webview lost the line breaks inside a paragraph, so a
paragraph with eleven sentence-level mappings showed one color. That
webview and its renderer were removed.

## Collaborators

| Module | Role | Boundary |
| --- | --- | --- |
| `pairLayout.ts` | Which pair is on screen; columns and tab cleanup | Creates and disposes the single `PairedView` |
| `pairState.ts` | `loadPair`: source resolution, rows, trust level | No vscode; reads SQLite and disk |
| `paint.ts` | Per line: innermost mapping fills, outermost is a gutter bar | Pure |
| `editorPane.ts` | Native editor adapter: `revealRange` + decorations | No text edits |
| `sync.ts` | Nearest-anchor sync, active mapping, loop guard | Sees panes only as `reveal(start, end)` |
| `pairedEvents.ts` | Edits, scrolls, clicks, job events → view methods | Owns the refresh debounce timer |
| `pairStatus.ts` | Status bar: current/stale/draft/none, click to re-annotate | UI only |

Dependency direction: `pairLayout` → `pairedView` → (`pairState`,
`paint`, `editorPane`, `sync`, `pairedEvents`, `pairStatus`). Helpers call
the view's public methods (`refresh`, `paint`, `sideOf`, `scrolled`,
`clicked`); none of them reads or writes its fields.

## Layout (pairLayout.ts)

- At most one pair is on screen. The spec is in editor column One and the
  source is in column Two. Columns are always explicit and never `Beside`,
  so repeated opens cannot split the window into a third column.
- **Triggers:** a file-wise `*.spec.md` becoming the active editor (for
  example from an Explorer click), `specScope.openPaired`, Spec Graph
  clicks, and Annotations items.
- **Cleanup on switch:** tabs the layout opened for the previous pair are
  closed. A duplicate tab of the new spec in another column is closed
  (it is the same document, now shown in One). Dirty tabs are never
  closed, and tabs the user opened are kept.
- Closing the spec ends the pair and closes the source tab opened for it.

## Event flow

- **Open:** `loadPair` → spec placed in One, source in Two → paint both.
- **Scroll** either editor (`onDidChangeTextEditorVisibleRanges`) →
  `sync.scrolled(side)` → the other editor's `revealRange` (AtTop).
- **Click** on a mapped line (mouse selection) → `sync.focus` picks the
  active mapping if it covers the line, else the innermost one. Both
  sides outline it and the other side scrolls to it.
- **Hover** a colored line → both line ranges plus the Annotator's note.
- **Edits** to either document (unsaved included) or job events →
  `refresh` after 200 ms: trust level, rows, and paint plans.

## Invariants

1. Sync is semantic: the target is the nearest mapping by line distance,
   never a proportional percentage.
2. Feedback loops are cut: the controller mutes the revealed side for
   400 ms and skips re-revealing the mapping that is already aligned.
3. Only mappings of the published job are `current`, and only while its
   source, spec, and ancestry hashes equal the live text. Otherwise rows
   are drawn provisionally (dashed, fainter) and never line-shifted.
4. Colors encode correspondence (one group per distinct spec range), not
   quality. Each line has at most one fill and one gutter bar, so nested
   ranges never stack. Unmapped lines stay plain.
5. A module spec with no source gets no source editor; the status bar
   says why.

## Where changes belong

- Visual style: `editorPane.ts` (palette, decoration types).
- What gets painted: `paint.ts`, verified by `test/paint.test.ts`.
- Sync behavior: `sync.ts`, verified by `test/viewer.test.ts`.
- Trust rules: `pairState.ts`.
- Column and tab behavior: `pairLayout.ts`, verified in VS Code by
  `test/integration/pairs.ts` (`npm run itest`).
