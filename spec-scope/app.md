# Spec Scope

Spec Scope is a VS Code companion with two asynchronous Pi agent roles. The
**Coder** writes source files and their sibling `*.spec.md` specs and calls
`submit_file` when a pair is provisionally ready, then keeps coding. Up to K
independent **Annotators** read each submitted snapshot and record semantic
spec-to-code line mappings directly into a workspace SQLite registry.

Opening a `*.spec.md` shows the rendered spec on the left and the
**unchanged native source editor** on the right, with paired translucent
colors and semantic scroll sync in both directions. A Spec Graph tab
navigates `Parent:` hierarchies and cross-references, and every run can be
exported as an observable JSONL trace.

- Implementation: [src/](../src/README.md) (VS Code extension,
  TypeScript, Pi SDK `@earendil-works/pi-coding-agent` 1.4.0, `node:sqlite`).
- Policies: [policy.md](policy.md) · Tools: [tools.md](tools.md) ·
  Agents: [Coder](agents/coder.md), [Annotator](agents/annotator.md) ·
  Traces: [traces/](../traces/README.md)
- Design notes: [extension wiring](../src/src/extension.spec.md),
  [job service](../src/src/jobs.spec.md),
  [paired view](../src/src/pairedView.spec.md).

Source files and Markdown specs stay authoritative ordinary files. SQLite
(`.spec-scope/spec-scope.sqlite`, self-gitignored) stores only pair
identities, job states, revision hashes, mapping rows, and trace events.
