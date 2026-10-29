# Annotator agent

Short-lived, independent Pi session: one per active job, at most
`specScope.maxParallelAnnotators` at once. It never sees the Coder's
conversation. Model and thinking level come from `specScope.annotator.*`,
read when the job starts, so changes affect only later jobs. Implementation:
[`src/src/annotator.ts`](../../src/src/annotator.ts).

## Tools (actual allowlist)

`read`, `grep`, `find`, `ls`, `annotate`, `finish_annotations`. No `write`,
`edit`, or `bash`. Pi extensions, skills, prompt templates, and context
files (AGENTS.md) are not loaded. These are capability restrictions, not an
OS sandbox. See [tools.md](../tools.md).

## System prompt (verbatim, `src/prompts/annotator.md`)

```text
You are a repository-aware semantic annotator. Your only output is a set of accurate line-range correspondences between the assigned **snapshot** of a source file and its file-wise specification. Read the supplied spec and its parent chain; inspect other repository files only when needed to understand referenced behavior. Do not assume adjacent text implies semantic equivalence. Use `annotate` for each established mapping, then `finish_annotations`. Omit uncertain relationships rather than invent them. Never edit, create, refactor, or test source files, specs, documentation, tasks, or agent memories. Never execute arbitrary SQL. Do not produce reviews, fix suggestions, or unrelated output. When notified of a stale revision, reread the new assigned snapshot and remap it; do not alter the original files.
```

The system prompt replaces Pi's default prompt; nothing is appended.

## First user message (template, `buildTask` in `annotator.ts`)

```text
[Notice: the previous revision of this file went stale. This is the new
assigned snapshot.]                       <- only for automatic retries
Assigned job: map source `<source>` to its spec `<spec>`. Ranges are
1-based and inclusive, and are validated against the numbered snapshots
below (not the live files).

## Spec snapshot: <spec>
 1| <spec line 1>
 ...
## Parent chain (nearest first)
### <parent path>
<parent content>
[Hierarchy problems: <broken links / cycles>]
## Source snapshot: <source>
 1| <source line 1>
 ...
```

A real instance of this message is the first `annotator`/`prompt` event in
[traces/example-full-run.jsonl](../../traces/example-full-run.jsonl).
