# Intended policies (Phase 1)

Each policy names the mechanism that implements it and how to check it.
These are **application mechanics**: hash checks and restricted Pi tool
sets are not proof of OS-level enforcement. A Pi session's built-in tools
run with the user's own file-system permissions, and the Coder keeps
`bash`. There is no Phase 2 security framework in this MVP.

1. **Annotators cannot change repository files.**
   Mechanism: each Annotator session's Pi tool allowlist is exactly
   `read, grep, find, ls, annotate, finish_annotations`, with extensions,
   skills, prompt templates, and context files disabled
   (`src/src/annotator.ts`). Check: the `tool_call` events of any exported
   trace for `actor: "annotator"` contain only those names.

2. **Models never choose job identity, hashes, paths, or SQL.**
   Mechanism: `annotate`/`finish_annotations` are closures bound to one job
   (`src/src/tools.ts`, `src/src/job.ts`); their parameters are four line
   numbers and an optional note. Inserts are prepared statements. Check:
   tool schemas in [tools.md](tools.md); `annotate_write` events carry
   service-attached job IDs.

3. **Only the newest, hash-verified revision becomes current.**
   Mechanism: `publish` sets `current_job` only if the job is still
   `desired_job` and the files on disk hash to its snapshot, in one
   `BEGIN IMMEDIATE` transaction (`src/src/store.ts`). Check:
   `src/test/jobs.test.ts` ("rapid r1, r2, r3") and
   `src/test/sqlite.test.ts`
   ("older job can never replace a newer current mapping set").

4. **Stale mappings are never silently shifted or "fixed".**
   Mechanism: a hash mismatch publishes `stale` and triggers at most two
   consecutive fresh-context re-annotations of the newest snapshot; the
   viewer draws stale rows provisionally. Nothing edits source or spec to
   fit a mapping. Check: `src/test/jobs.test.ts` (stale + bounded retries).

5. **The paired view never modifies source code.**
   Mechanism: the viewer reaches the native editor only through
   `revealRange` and decorations (`src/src/codePane.ts`,
   `src/src/sync.ts`). Check: `src/test/viewer.test.ts` (pane proxy
   throws on any other access) and `npm run itest` (source document not
   dirty, text identical).

6. **Traces contain no secrets and no invented reasoning.**
   Mechanism: payloads are redacted before insertion (secret-named
   environment values and common credential shapes), provider thinking
   blocks are omitted (only counted), tool outputs are truncated at 4000
   characters (`src/src/trace.ts`, `src/src/piTrace.ts`). Check: exported
   traces in [traces/](../traces/README.md).

7. **The Coder does not write Spec Scope state.**
   Mechanism: prompt rule 4 plus an inline Pi extension that blocks
   `write`/`edit` into `.spec-scope/` (`src/src/coderSession.ts`). This is a
   guard rail only: `bash` could still reach the directory.
