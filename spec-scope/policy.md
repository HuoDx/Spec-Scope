P1. **Annotators cannot change repository files.**
   Mechanism: each Annotator session's Pi tool allowlist is exactly
   `read, grep, find, ls, annotate, finish_annotations`, with extensions,
   skills, prompt templates, and context files disabled
   (`src/src/annotator.ts`). Check: the `tool_call` events of any exported
   trace for `actor: "annotator"` contain only those names.

P2. **Only the newest, hash-verified revision becomes current.**
   Mechanism: `publish` sets `current_job` only if the job is still
   `desired_job` and the files on disk hash to its snapshot, in one
   `BEGIN IMMEDIATE` transaction (`src/src/store.ts`). Check:
   `src/test/jobs.test.ts` ("rapid r1, r2, r3") and
   `src/test/sqlite.test.ts`
   ("older job can never replace a newer current mapping set").

P3. **Stale mappings are never silently shifted or "fixed".**
   Mechanism: a hash mismatch publishes `stale` and triggers at most two
   consecutive fresh-context re-annotations of the newest snapshot; the
   viewer draws stale rows provisionally. Nothing edits source or spec to
   fit a mapping. Check: `src/test/jobs.test.ts` (stale + bounded retries).

P4. **The Coder does not write Spec Scope state.**
   Mechanism: prompt rule 4 plus an inline Pi extension that blocks
   `write`/`edit` into `.spec-scope/` (`src/src/coderSession.ts`). This is a
   guard rail only: `bash` could still reach the directory.
