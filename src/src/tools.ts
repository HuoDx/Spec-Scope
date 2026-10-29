/**
 * @fileoverview The three application-specific Pi tools.
 *
 *   submit_file({path})          Coder: nonblocking enqueue.
 *   annotate({...ranges, note})  Annotator: one SQLite INSERT per call.
 *   finish_annotations()         Annotator: freshness check + publication.
 *
 * Handlers do the real work inside the tool call; nothing is batched into a
 * JSON report. Job IDs, paths, and hashes are bound in closures, so models
 * never supply them. Errors come back as recoverable tool errors.
 */
import type * as TypeBox from "typebox" with { "resolution-mode": "import" };
import type { JobContext } from "./job";
import type { SubmitResult } from "./jobs";
import { MAX_NOTE } from "./ranges";
import { loadPi, Pi, ToolDefinition } from "./pi";

function ok(value: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }],
    details: value };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }],
    details: { error: message }, isError: true };
}

async function deps(): Promise<[Pi, typeof TypeBox.Type]> {
  const [pi, tb] = await Promise.all([loadPi(), import("typebox")]);
  return [pi, tb.Type];
}

/** The Coder's `submit_file` tool, backed by `submit`. */
export async function submitFileTool(
  submit: (path: string) => SubmitResult): Promise<ToolDefinition> {
  const [pi, Type] = await deps();
  return pi.defineTool({
    name: "submit_file",
    label: "Submit for annotation",
    description: "Mark a source file (and its sibling *.spec.md) as " +
      "provisionally ready for background semantic annotation. Returns " +
      "immediately with a job ID. This is not approval, completion, or a " +
      "lock: keep coding, and submit again after later edits.",
    promptSnippet: "submit_file: queue a source/spec pair for background " +
      "annotation (nonblocking)",
    parameters: Type.Object({
      path: Type.String({ description: "Workspace-relative source path." }),
    }),
    execute: async (_id, params) => {
      try {
        return ok(submit(params.path));
      } catch (err) {
        return fail(err);
      }
    },
  });
}

/** `annotate` and `finish_annotations`, bound to one job. */
export async function annotatorTools(ctx: JobContext):
  Promise<ToolDefinition[]> {
  const [pi, Type] = await deps();
  const line = (what: string) =>
    Type.Integer({ minimum: 1, description: `${what} (1-based, inclusive)` });
  const annotate = pi.defineTool({
    name: "annotate",
    label: "Annotate",
    description: "Record ONE established semantic correspondence between " +
      "a line range of the assigned spec snapshot and a line range of the " +
      "assigned source snapshot. Stored immediately. Call once per " +
      "mapping; repeat a spec range to map it to several code ranges.",
    parameters: Type.Object({
      spec_start: line("First spec line"),
      spec_end: line("Last spec line"),
      code_start: line("First source line"),
      code_end: line("Last source line"),
      note: Type.Optional(Type.String({ maxLength: MAX_NOTE,
        description: "Optional short reason for the correspondence." })),
    }),
    execute: async (_id, params) => {
      try {
        return ok({ mappingId: ctx.annotate(params) });
      } catch (err) {
        return fail(err);
      }
    },
  });
  const finish = pi.defineTool({
    name: "finish_annotations",
    label: "Finish annotations",
    description: "Finalize this job's mappings. Reports whether they became " +
      "current, are stale (files changed), or were superseded by a newer " +
      "submission. Call exactly once, after your last annotate call.",
    parameters: Type.Object({}),
    execute: async () => {
      try {
        return { ...ok(ctx.finish()), terminate: true };
      } catch (err) {
        return fail(err);
      }
    },
  });
  return [annotate, finish];
}
