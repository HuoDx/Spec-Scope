# Job service

Parent: [Spec Scope](../../spec-scope/app.md)
Source: [jobs.ts](./jobs.ts)

## Responsibility

`jobs.ts` turns a `submit_file` call into a desired revision and a queued
job, coalescing per source path and bounding automatic stale retries. It
never awaits an LLM. Running and publishing one job is `job.ts`.

## Collaborators and boundaries

| Collaborator | Provides | Must not |
| --- | --- | --- |
| `snapshot.ts` / `specs.ts` | Pair resolution, immutable texts, hashes | Guess an ambiguous pair |
| `store.ts` | `createJob`, `publish`, `setState`, `insertMapping` | Hold a transaction across `await` |
| `queue.ts` | ≤ K concurrent, ≤ 1 active + 1 pending per path | Know about jobs or SQLite |
| `job.ts` | `executeJob`, the job-bound `JobContext` | Decide coalescing |
| Annotator runner (`annotator.ts`) | Pi session that calls `ctx.annotate` / `ctx.finish` | See hashes, job IDs, SQL |

## Invariants

1. **Desired vs current.** `file_pairs.desired_job` is the newest
   submission; `current_job` is the last job that published while still
   desired *and* hash-identical to disk. `publish` checks and sets both in
   one `BEGIN IMMEDIATE` transaction.
2. **Coalescing.** `A@r1` running, then `r2`, `r3` → `r2` is replaced
   (marked `superseded` without running), `r3` runs after `r1` ends; `r1`
   then publishes as `superseded`.
3. **Unchanged.** Resubmitting the desired revision while it is queued,
   running, or current returns `{state:"unchanged"}` and creates nothing.
4. **Draft rows.** `insertMapping` only succeeds while the job is
   `running`; finished or superseded jobs cannot gain rows.
5. **Staleness.** A hash mismatch at publication yields `stale` and a
   fresh-context re-annotation of the newest snapshot (`origin: "auto"`),
   at most `MAX_AUTO_RETRIES` times in a row per file; any Coder or user
   submission resets the budget. Line numbers are never shifted.
6. **Restart.** The scheduler is in memory; on activation `queued` and
   `running` jobs become `interrupted` and can be retried.

## States

`queued → running → current | stale | superseded | failed`, plus
`queued → superseded` (replaced while pending) and `* → interrupted`
(restart). A replaced `current` job becomes `superseded`.

## Error propagation

`submit` throws model-facing messages (outside workspace, no/ambiguous
spec, module spec); the `submit_file` tool returns them as recoverable tool
errors. Runner failures are caught in `executeJob`, recorded as `error`
events, and the job is marked `failed`; the queue always advances.

## Joint verification

Changes here must keep `test/queue.test.ts`, `test/jobs.test.ts`, and
`test/sqlite.test.ts` green; they exercise the real store and snapshot code
with a scripted Annotator.
