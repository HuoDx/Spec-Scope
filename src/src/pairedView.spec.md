# Paired view

Parent: [Spec Scope](../../spec-scope/app.md)
Source: [pairedView.ts](./pairedView.ts)

## Responsibility

`pairedView.ts` owns one open `*.spec.md`: the rendered spec on the left
(webview) and the original source in VS Code's native editor on the right.
It loads the mapping set to show, decides its trust level, and connects
both sides for color correspondence and semantic scroll sync. It never
edits, pads, reorders, or re-renders source code.

## Collaborators

| Module | Role | Boundary |
| --- | --- | --- |
| `viewer.ts` | `CustomTextEditorProvider` (default for `*.spec.md`) | Creates one `PairedView` per panel |
| `specPage.ts` + `media/spec.js` | Spec webview markup, messages, painting | Never edits text; only reports anchors |
| `render.ts` | Markdown → HTML with `data-s`/`data-e` line anchors | Escapes raw HTML |
| `codePane.ts` | Native editor adapter: `revealRange` + decorations only | No text edits |
| `sync.ts` | Nearest-anchor sync, active mapping, loop guard | Sees panes only as `reveal(start, end)` |
| `pairState.ts` | current / stale / draft / none + live revision hashes | Reads SQLite and disk |
| `pairedEvents.ts` | Document, editor, and job events → refreshes | Owns debounce timers |
| `specs.ts` | `Source:` / sibling resolution | Throws on ambiguity |

## Event flow

- **Open:** resolve source → `showTextDocument(..., Beside)` → render HTML
  → load mappings → paint both sides.
- **Spec scroll** (webview, rAF-throttled) → `{scroll, line}` →
  `sync.scrolled("spec")` → `CodePane.reveal` (AtTop).
- **Code scroll** (`onDidChangeTextEditorVisibleRanges`) →
  `sync.scrolled("code")` → `{reveal, line}` → webview `scrollIntoView`.
- **Hover/click** on a mapped spec block, or mouse selection in code →
  `sync.focus` → the mapping becomes active (wins one-to-many ties) and
  both sides outline it.
- **Edits:** spec text → re-render; source text (unsaved included) or job
  events → recompute staleness and repaint.

## Invariants

1. Sync is semantic: the target is the nearest mapping by line distance,
   never a proportional percentage.
2. Feedback loops are cut twice: the controller mutes the revealed pane
   for 400 ms and skips re-revealing the already aligned mapping; the
   webview also ignores its own programmatic scroll for 400 ms.
3. Only mappings of the published job are `current`, and only while its
   source, spec, and ancestry hashes equal the live text. Otherwise rows
   are drawn provisionally (dashed, fainter) and never line-shifted.
4. Colors encode correspondence (one group per distinct spec range), not
   quality. Unmapped regions stay plain.
5. A module spec with no source shows Markdown only.

## Where changes belong

Visual style: `media/spec.js`, `media/style.css`, `codePane.ts` (shared
`PALETTE`). Sync behavior: `sync.ts`, verified by `test/viewer.test.ts`.
Trust rules: `pairState.ts`. End-to-end open behavior is covered by
`test/integration/suite.ts` (`npm run itest`).
