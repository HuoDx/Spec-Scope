# Callable tools

Spec Scope adds exactly three application tools to Pi (`src/src/tools.ts`).
Everything else is a private TypeScript helper.

## `submit_file` (Coder)

```ts
submit_file({ path: string })
// -> { jobId: string, state: "queued" | "running" | "unchanged" }
```

Marks a source file (and its sibling `*.spec.md`, inferred by the service)
as provisionally ready for annotation. Nonblocking: the handler snapshots
source, spec, and `Parent:` chain, hashes them, records the desired
revision, enqueues, and returns. `path` may be the source or its spec,
relative or absolute, inside the workspace. Errors (no spec, ambiguous
spec, module spec, outside workspace) return as recoverable tool errors.

## `annotate` (Annotator)

```ts
annotate({ spec_start: number, spec_end: number,
           code_start: number, code_end: number, note?: string })
// -> { mappingId: number }
```

Records one semantic correspondence with an `INSERT` **during the tool
call**. Ranges are positive, inclusive, 1-based, and validated against the
job's immutable snapshots; `note` is at most 500 characters. Repeat a spec
range to express one-to-many. The service attaches job ID, paths, hashes,
and timestamps; the model supplies none of them. Fails recoverably with the
valid bounds when a range is invalid, or when the job is no longer running.

## `finish_annotations` (Annotator)

```ts
finish_annotations()
// -> { state: "current" | "stale" | "superseded", count: number }
```

Re-hashes source, spec, and ancestry on disk and publishes the job. It
becomes `current` only if it is still the newest submission and the hashes
match. Idempotent; it ends the Annotator run. If an Annotator ends without
calling it, the service publishes on its behalf and records `auto_finish`.

## Pi built-ins per role

| Role | Built-in tools |
| --- | --- |
| Coder | Pi defaults (`read`, `bash`, `edit`, `write`, or the user's `defaultTools`) plus installed Pi extensions |
| Annotator | `read`, `grep`, `find`, `ls` only |
