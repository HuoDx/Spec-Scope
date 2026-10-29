# Extension wiring

Parent: [Spec Scope](../../spec-scope/app.md)
Source: [extension.ts](./extension.ts)

## Responsibility

`extension.ts` is the only place that knows every module. It resolves the
workspace root, opens the SQLite registry, starts a trace run, recovers
abandoned jobs, constructs the job service and both agents, and registers
the three sidebar tabs, the paired editor, watchers, and commands. It holds
no logic of its own beyond wiring and shutdown ordering.

## Module map and dependency direction

Dependencies point downward; nothing below the VS Code layer imports
`vscode`, so the core runs headless (`scripts/smoke.js`) and under
`node --test`.

| Layer | Modules | Owns |
| --- | --- | --- |
| VS Code UI | `coderView`, `annotationsView`, `graphView`, `viewer`, `pairedView`, `pairedEvents`, `specPage`, `codePane`, `commands`, `config`, `webview` | Webviews, tree, decorations, commands, settings |
| Agents | `coder`, `coderSession`, `coderEvents`, `annotator`, `tools`, `piTrace`, `pi` | Pi sessions, tool definitions, model resolution |
| Jobs | `jobs`, `job`, `queue`, `ranges` | Submission, coalescing, execution, publication |
| Data | `store`, `queries`, `trace`, `db` | SQLite schema, invariants, events |
| Files | `snapshot`, `specs`, `markdown`, `graph`, `prune`, `render`, `sync`, `pairState` | Pure or fs-only logic |

## Data and control flow

1. Coder prompt → `CoderAgent` → Pi session (persistent, Pi-owned
   transcript). Its `submit_file` tool calls `JobService.submit`.
2. `submit` snapshots source + spec + parent chain (`snapshot.ts`),
   records the desired revision (`store.createJob`), and enqueues
   (`queue.ts`). It returns before any LLM work starts.
3. The queue runs `executeJob` (≤ K at once, ≤ 1 per file). The Annotator
   runner creates a fresh read-only Pi session whose `annotate` tool
   inserts rows during the call and whose `finish_annotations` publishes.
4. Every state change fires one `EventEmitter<void>` (`changes`); the
   Annotations tree and open paired views re-read SQLite on it. There is no
   other event bus.

## Ownership and lifecycle

- One `DatabaseSync` per extension host, closed last on shutdown.
- `Trace` run ID = one activation; `run_start`/`run_end` bracket it. A
  missing `run_end` marks the run incomplete in exports.
- Shutdown order: Coder session, Annotator sessions, decoration types,
  `run_end`, database. Annotators aborted here leave `running` rows that
  the next activation marks `interrupted`.

## Where changes belong

- New setting: `package.json` + `config.ts`; read lazily so it applies to
  the next job or turn.
- New view: its own module, registered in `registerViews`.
- Anything touching publication rules: `store.ts`/`job.ts` only, verified
  with `test/jobs.test.ts` and `test/sqlite.test.ts`.
