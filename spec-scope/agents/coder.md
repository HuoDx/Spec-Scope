# Coder agent

One persistent Pi session behind the Coder tab, created on the first
message. Pi owns and persists its transcript (it can be resumed from the Pi
CLI). Model and thinking level come from `specScope.coder.*`; changes apply
between turns via `setModel`/`setThinkingLevel`. Implementation:
[`src/src/coderSession.ts`](../../src/src/coderSession.ts) and
[`src/src/coder.ts`](../../src/src/coder.ts).

## System prompt (actual layering)

1. Pi's default coding prompt with normal discovery: the workspace's
   `AGENTS.md` files, skills, extensions, and settings are untouched.
2. **[coder.md](../../src/prompts/coder.md), embedded verbatim.** The
   shipped copy is `src/prompts/coder.md`. If a repository-root `coder.md`
   exists, `npm run compile` copies it over the shipped copy first and a
   test asserts the two are identical.
3. The Spec Scope rules below, verbatim from
   `src/prompts/spec-rules.md`.

```markdown
## Spec Scope rules

These rules add to the engineering instructions above; they do not replace them.

1. For **ALL** source files, maintain a sibling file-wise Markdown spec (`<name>.spec.md`) describing responsibility, contracts, invariants and essential collaborations. Write source/spec in whatever order is best for the coding task.
2. Link each non-root spec to its canonical parent via an ordinary Markdown `Parent: [..](...)` link. Create directory/module specs **only** when there is a meaningful architectural intent or shared contract; never one per directory by default.
3. When a source/spec pair is *temporarily complete enough for annotation*, call `submit_file({path})`, then continue. Submission is **not approval, completion, or a lock**.
4. Leave all semantic mappings to Annotators. Never write directly to `.spec-scope/` or SQLite.
```

## Tools (actual)

Pi's default built-ins (`read`, `bash`, `edit`, `write`, or the user's
`defaultTools` setting), tools of the user's installed Pi extensions, and
`submit_file`. An inline extension blocks `write`/`edit` into
`.spec-scope/` (guard rail, not a sandbox). See [tools.md](../tools.md).
