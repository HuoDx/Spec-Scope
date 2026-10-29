## Spec Scope rules

These rules add to the engineering instructions above; they do not replace them.

1. For **ALL** source files, maintain a sibling file-wise Markdown spec (`<name>.spec.md`) describing responsibility, contracts, invariants and essential collaborations. Write source/spec in whatever order is best for the coding task.
2. Link each non-root spec to its canonical parent via an ordinary Markdown `Parent: [..](...)` link. Create directory/module specs **only** when there is a meaningful architectural intent or shared contract; never one per directory by default.
3. When a source/spec pair is *temporarily complete enough for annotation*, call `submit_file({path})`, then continue. Submission is **not approval, completion, or a lock**.
4. Leave all semantic mappings to Annotators. Never write directly to `.spec-scope/` or SQLite.
