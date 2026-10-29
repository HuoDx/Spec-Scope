# CODER.md

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Interface first, Iterate while implementing

Design interfaces, protocols, and conventions first, document them (w/ reasons of why they are designed that way), keep
them simple, and then polish them while you implement.

Feel free to trial and error and iterate your interface design - good interface makes implementation easy, and you discover what means good while you implement.

When you feel your implementation is getting harder, review, reflect, refactor, and report your interface design/iteration.

## 6. Persistent Pressure Memo

**Treat implementation friction as structural feedback. Remember it across tasks.**

Maintain a pressure memo in the project's persistent agent memory.
Use the existing memory location and protocols; otherwise, use
`.agent-memory/pressure.md`. Keep a **linked** task ledger for task outcomes
and token usage. Create these records if they do not exist.

Record or update a pressure note as soon as you encounter:

- An unintuitive implementation path, unclear responsibility, or an interface
  that makes a straightforward requirement difficult to express.
- A small conceptual change requiring extensive edits or coordinated changes
  across many files or modules.
- Repeated navigation, rediscovery, workarounds, duplicated logic, hidden
  dependencies, or difficulty establishing that the implementation is correct.
- A violation of the code structure limits in Section 8.

Each pressure note must include:

- A stable ID, date, task reference, status, and recurrence count.
- Affected files, symbols, and higher-level modules or packages.
- What was unintuitive or disproportionately expensive to change, with
  concrete examples of the friction or change propagation.
- A suspected cause, clearly distinguished from established facts.
- A candidate structural improvement, its expected benefit, and how that
  benefit could be checked.
- Remaining uncertainty and the conditions for revisiting the note.

Keep concise observations and decision summaries, not a transcript of
internal reasoning. Merge recurring symptoms with existing notes when they
share a cause. Do not silently discard unresolved pressure. Archive resolved
history with links so the active memo remains useful.

### Task reflection and token accounting

At task completion or interruption, record the outcome and a brief reflection:

- Was token expenditure reasonable for the inherent difficulty of the task?
  Separate domain difficulty from avoidable navigation, rediscovery, and rework.
- Did implementation feel straightforward, predictable, and easy to validate?
  Ground this assessment in observable friction rather than vague sentiment.
- Did the work follow good engineering practice: cohesive responsibilities,
  explicit dependencies, clear ownership, simple interfaces, and testability?

Record token usage for every task, including tasks with no new pressure:

- Use actual usage data exposed by the runtime; record its source and scope.
- Record implementation, refactoring, and verification usage separately only
  when those phases can be reliably distinguished. Also record the task total.
- Preserve available input/output and other usage fields without double
  counting overlapping categories.
- If only aggregate usage is available, record that aggregate without
  inventing a breakdown.
- If usage is unavailable, write `unavailable` and explain the limitation.
  Never fabricate precise token counts.
- Tool calls, files inspected, and rework counts may provide supporting
  evidence, but must not be presented as token measurements.

Refactoring tokens are recorded for visibility, not charged against the
decision to pursue meaningful long-term simplification.

## 7. Reflect Before Tasks; Refactor When It Pays Structurally

**Prefer lasting simplicity over repeatedly paying for structural friction.**

Before starting each task, read the pressure memo and relevant task history.
Check whether recorded pressure still exists in the current code. Revisit
earlier token expenditure, implementation experience, and engineering quality.
Record a concise conclusion and assess whether the new task would encounter
or amplify the same problems.

Compare direct implementation with refactoring first. Consider concrete
improvements to comprehension, locality of changes, dependency structure,
interface clarity, and verification. Benefits may apply to the current task
or to recurring work evidenced by the memo; they need not pay back within
the current task.

Do not count the additional token cost of refactoring as a disadvantage or
a reason to stop. Trust the long-term value of simpler structure.
Still evaluate regression risk, compatibility, migration impact, and the
complexity introduced by the proposed design. Speculative future needs and
aesthetic preference alone are insufficient evidence.

### Authorization and scope

Evidence-backed refactoring under this section is explicitly authorized.
This qualifies Section 3's restrictions on refactoring and change scope:
a changed line may trace either to the user's task or to a pressure note
selected through this process. Document that connection.

All other simplicity and scope constraints remain in force. Use the smallest
coherent scope that addresses the underlying cause, even when that scope
crosses file or package boundaries. Do not turn a justified refactor into
unrelated cleanup. Current explicit user constraints take precedence.

### Cache, refactor, verify, resume

When refactoring offers material structural benefit, perform it before
implementing the task:

1. Persist the current task in the existing task memory or
   `.agent-memory/tasks/<task-id>.md`.
   Preserve the original goal, constraints, acceptance criteria, completed
   work, relevant files, pending steps, and an explicit resume point.
   Conversation context alone is not a sufficient task cache.
2. Select the pressure notes to address. State the proposed structural
   change, expected improvement, behavior to preserve, and verification.
3. Redesign and refactor in coherent, verifiable increments.
   Maintain interface documentation as the design evolves.
4. Check both behavioral correctness and the pressure itself:
   did understanding, implementation, or verification actually become easier?
   Record remaining pressure and any newly introduced friction.
5. Reassess the next increment. Continue while it offers a concrete,
   material improvement supported by the pressure memo.
6. Stop when additional changes offer only marginal benefit, merely move
   complexity elsewhere, add unnecessary indirection, or have no clear
   structural payoff. Record why and resume the cached task.
7. Complete the original task and verify its original acceptance criteria.

Do not require a perfect codebase or an empty memo before resuming the task.
A failed refactoring attempt is evidence to revise the design, not permission
to abandon the user's goal. Keep unresolved pressure visible.

If substantial new pressure emerges during implementation, update the memo
and apply the same decision process to the remaining work.

Mark a pressure note resolved only when evidence shows the original symptom
has been relieved. Otherwise leave it open or pending verification.
Reopen the original note if the problem recurs.

## 8. Code Size and Structural Limits

**Keep units small enough to understand and change locally.**

- A code file must not exceed **128 lines**.
- A line of code must not exceed **80 characters**, including indentation.
- A function must not exceed **64 lines**.
- Count physical lines, including blank lines and comments.
  Count a function from its declaration through its end, including nested
  definitions within that span.
- Do not evade these limits by packing statements together, deleting useful
  explanations, or hiding code. Split along responsibilities and interfaces.

### Deferred file splitting

The 128-line file limit has one explicit deferral rule:
if a task produces a file exceeding that limit, immediate splitting is not
required in that same task. Before ending the task, create a pressure note
explicitly labeled **"MUST SPLIT IN A FUTURE REFACTOR"**.

Record the file path, current line count, why it exceeded the limit,
candidate responsibility boundaries, and the expected impact of splitting.
This is outstanding structural debt, not compliance with the limit.
Reevaluate it at subsequent task starts; an existing note is not a permanent
exemption.

This deferral does **not** waive the 80-character line limit or the 64-line
function limit. Log pre-existing violations when encountered; newly written
or modified code must satisfy the applicable limits.

Splitting must improve comprehensibility. If it creates excessive cross-file
interaction, document that interaction under Section 9 and record any new
structural pressure.

## 9. Document Cross-File Collaboration

**Make module boundaries and collaboration understandable without rediscovery.**

When a code file has substantial cross-file references or interactions,
create a same-name Markdown companion beside it:
for example, `worker.py` → `worker.md`.
If different code extensions share the same stem in one directory, use the
full filename plus `.md`, such as `worker.py.md`, to avoid ambiguity.

Create the companion when understanding or changing the behavior requires
substantial cross-file tracing, coordinated edits, shared-state reasoning,
or knowledge of implicit ordering or cross-package contracts.

The companion must explain:

- The file's responsibility and the coverage of its higher-level module
  or package.
- Its main collaborators, their higher-level modules or packages, and
  each boundary's responsibilities and exclusions.
- Dependency direction, entry points, and relevant data and control flow.
- Ownership of state and resources, key interfaces, invariants, ordering
  constraints, and error propagation.
- Where a typical change belongs and which boundaries require joint
  verification.

Explain interactions and design reasons; do not merely copy imports or list
symbols. Update the companion in the same task whenever those interactions
or boundaries change.

Documentation does not settle structural pressure by itself. If describing
the interaction reveals tangled ownership, circular dependencies, or
excessive coordination, record it in the pressure memo and evaluate a better
module or package boundary.

