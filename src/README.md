# Spec Scope (VS Code extension)

A Pi **Coder** writes code and sibling `*.spec.md` specs; up to K Pi
**Annotators** map each submitted pair into a workspace SQLite index; a
paired editor shows the rendered spec beside the untouched native source
with matching colors and semantic scroll sync. Product overview:
[../spec-scope/app.md](../spec-scope/app.md); policies, tools, and agent
docs live beside it in [../spec-scope/](../spec-scope/).

The three tabs (**Coder**, **Annotations**, **Spec Graph**) dock in VS
Code's right-hand secondary side bar, like Claude Code and Codex, so the
Explorer stays on the left. They appear as horizontal tabs and show one at
a time. If the secondary side bar is hidden, toggle it with
`⌥⌘B` (macOS) or `Ctrl+Alt+B`. You can drag any tab elsewhere, and VS
Code remembers where you put it.

## Requirements

- VS Code desktop ≥ 1.106, the first release that lets extensions
  contribute to the secondary side bar (verified on 1.143.1,
  Electron/Node 24.21). The
  SQLite driver is Node's built-in `node:sqlite`, so there is no native
  module to rebuild or package.
- Node ≥ 22.19 to build and test (Pi's requirement).
- Pi credentials for the providers you want: log in once with the Pi CLI
  (`pi`, then `/login`), add custom endpoints in Pi's `models.json`, or
  export the provider's key (for example `MOONSHOT_API_KEY`,
  `MINIMAX_API_KEY`) before launching VS Code. Spec Scope never stores keys.

## Build and run

```sh
cd src
npm install
npm run compile        # syncs prompts/coder.md from ../coder.md if that
                       # file exists, then runs tsc
```

Open the `src/` folder in VS Code and press **F5** (Run Extension),
then open the project you want to work on in the Extension Development Host.
To install instead: `npx @vscode/vsce package` and install the `.vsix`.

## Configure the two roles

Use the ⚙ button in the Coder tab, the gear in the Annotations tab, or
Settings → *Spec Scope*. Both roles are independent:

| Setting | Meaning |
| --- | --- |
| `specScope.coder.provider` / `.model` | Pi provider and model ID, e.g. `moonshotai` / `kimi-k3`. Both empty = Pi's default model. |
| `specScope.coder.thinkingLevel` | Optional: `off` … `max` (clamped by Pi to the model). |
| `specScope.annotator.provider` / `.model` / `.thinkingLevel` | Same for Annotators, e.g. `minimax` / `MiniMax-M3`. Applies to jobs started after the change. |
| `specScope.maxParallelAnnotators` | K, default 2, minimum 1. |
| `specScope.workspaceRoot` | Root to annotate; asked for once if several folders are open. |

The pickers list only models for which Pi currently has credentials. A
missing or unknown model is reported with the list of known IDs before any
session starts. (Model IDs change: `MiniMax-M2.7` was retired upstream
during development, see [../traces/](../traces/README.md).)

## Five-minute demo

1. **Coder tab:** "Create `src/stack.ts` with its spec `src/stack.spec.md`
   (Parent: `app.md`) and submit it; then do the same for `src/ring.ts`."
   The Coder writes both freely and calls `submit_file`, which returns at
   once.
2. **Annotations tab:** `active 2/2`, running workers with their models and
   live mapping counts, then `current` results. Failed, stale, and
   superseded jobs show a Retry action.
3. Open `src/stack.spec.md`: rendered spec on the left, native `stack.ts`
   on the right, same colors on corresponding regions. Scroll either side
   and the other follows the nearest mapped anchor. Hover a colored block
   to focus both sides. **Open as Text** edits the spec normally.
4. **Spec Graph tab:** pick `app.md`, click `stack` to jump to its paired
   view; select a node and **Refocus** to expand hidden (`+n`) neighbors.
5. Edit `stack.ts` (even unsaved): the view turns *stale*. Ask the Coder to
   resubmit, or click **Re-annotate**; only the latest revision becomes
   current. **Annotations → Export Trace** writes a JSONL run trace.

## Develop and verify

```sh
npm test               # unit tests (node:test): queue, SQLite, jobs,
                       # ranges, links/pairing, graph pruning, viewer sync
npm run lint:limits    # ≤128 lines/file, ≤80 chars/line, ≤64 lines/function
npm run itest          # inside real VS Code: activation, right-sidebar
                       # tabs, node:sqlite, Pi SDK import, config errors,
                       # paired view opening
SMOKE_CODER=moonshotai/kimi-k3 SMOKE_ANNOTATOR=minimax/MiniMax-M3 \
  npm run smoke -- /tmp/demo-ws /tmp/trace.jsonl   # real models, headless
```

Design notes for the hub modules: [extension](src/extension.spec.md),
[job service](src/jobs.spec.md), [paired view](src/pairedView.spec.md).

## Known limits

- Hash checks and Pi tool allowlists are application mechanics, not a
  sandbox ([../spec-scope/policy.md](../spec-scope/policy.md)).
- The scheduler is in-process: jobs running when VS Code closes become
  `interrupted` and need a retry.
- Explicit `Source:` pairing is resolved within the source's directory.
- Spec blocks are anchored per Markdown block and list item; a mapping
  inside one long paragraph colors the whole paragraph.
