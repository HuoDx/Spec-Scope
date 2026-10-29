# Genuine trace examples

Both files were produced by `npm run smoke` (`src/scripts/smoke.js`)
on 2026-10-29: the real Spec Scope job service, real Pi 1.4.0 sessions, real
models, and SQLite, run headless in a scratch workspace and exported with
the same `exportRun` used by **Annotations → Export Trace**. Nothing was
edited afterwards.

Format: line 1 is a header (`runId`, event count, `complete`); every other
line is one event `{id, at, actor, kind, jobId?, payload}` in database
order. Actors are `coder`, `annotator`, `service`, and `user`.

| File | What happened |
| --- | --- |
| [example-full-run.jsonl](example-full-run.jsonl) | Coder `moonshotai/kimi-k3` wrote `app.md`, `src/stack.ts`, `src/ring.ts` and their specs and called `submit_file` twice without waiting. Two `minimax/MiniMax-M3` Annotators ran concurrently (K=2), issued 39 `annotate` writes, and both jobs published `current` after a hash match (15 and 24 mappings, including one-to-many). |
| [example-retired-annotator-model.jsonl](example-retired-annotator-model.jsonl) | Same task with Annotator `minimax/MiniMax-M2.7`. The provider answered `404 not_found_error: model no longer available`; both jobs were recorded `failed` with that message while the Coder continued unaffected. |

Provider-reported usage in the full run (sum of `totalTokens`, which
includes cache reads): Coder 26,562 over 4 responses; Annotators 63,492 over
13 responses.

Events include prompts (the Annotator prompt contains the numbered
snapshot), visible assistant text, tool calls and results (truncated at
4000 characters), queue transitions, `annotate_write` rows, hash checks,
and publication outcomes. Provider thinking blocks are omitted and only
counted (`thinkingBlocksOmitted`). Secrets are redacted before storage.
