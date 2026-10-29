/**
 * @fileoverview Runs one short-lived Annotator Pi session per job.
 *
 * Each session is independent: its own model (read from settings when the
 * job starts, so changes affect only later jobs), an in-memory transcript,
 * no Coder history, no AGENTS.md/extensions/skills, and a tool allowlist of
 * read-only built-ins plus the job-bound `annotate`/`finish_annotations`.
 * The allowlist is a practical capability restriction, not an OS sandbox.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { Job, JobContext } from "./job";
import {
  AgentSession, loadPi, modelLabel, modelRuntime, resolveRole, RoleConfig,
} from "./pi";
import { traceSession } from "./piTrace";
import { splitLines } from "./snapshot";
import { annotatorTools } from "./tools";
import { Trace } from "./trace";

/** Pi built-ins an Annotator may use. No write, edit, or bash. */
export const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];

export interface AnnotatorDeps {
  root: string;
  promptsDir: string;
  role: () => RoleConfig;
  trace: Trace;
}

const live = new Set<AgentSession>();
let workerSeq = 0;

/** Returns the queue-facing runner for Annotator jobs. */
export function createAnnotatorRunner(deps: AnnotatorDeps):
  (ctx: JobContext) => Promise<void> {
  const system = fs.readFileSync(
    path.join(deps.promptsDir, "annotator.md"), "utf8");
  return async (ctx) => {
    const pi = await loadPi();
    const { model, thinkingLevel } = await resolveRole(deps.role(),
      "annotator");
    const loader = new pi.DefaultResourceLoader({
      cwd: deps.root, agentDir: pi.getAgentDir(), noExtensions: true,
      noSkills: true, noPromptTemplates: true, noThemes: true,
      noContextFiles: true, systemPromptOverride: () => system,
      appendSystemPromptOverride: () => [],
    });
    await loader.reload();
    const { session } = await pi.createAgentSession({
      cwd: deps.root, model, thinkingLevel,
      modelRuntime: await modelRuntime(), resourceLoader: loader,
      tools: [...READ_ONLY_TOOLS, "annotate", "finish_annotations"],
      customTools: await annotatorTools(ctx),
      sessionManager: pi.SessionManager.inMemory(deps.root),
    });
    const worker = `annotator-${++workerSeq}`;
    live.add(session);
    const untrace = traceSession(session, deps.trace, "annotator",
      ctx.job.id, worker);
    try {
      ctx.setWorker({ worker, model: modelLabel(session) });
      await session.prompt(buildTask(ctx.job));
      const error = session.state.errorMessage;
      if (error) throw new Error(error);
    } finally {
      untrace();
      live.delete(session);
      session.dispose();
    }
  };
}

/** Aborts every running Annotator session (extension shutdown). */
export function disposeAnnotators(): void {
  for (const session of live) session.dispose();
  live.clear();
}

function numbered(text: string): string {
  const lines = splitLines(text);
  const width = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(width)}| ${l}`)
    .join("\n");
}

/** The first user message: the immutable snapshot with line numbers. */
export function buildTask(job: Job): string {
  const s = job.snapshot;
  const parents = s.ancestors.length === 0 ? "(none)\n" : s.ancestors
    .map((a) => `### ${a.path}\n\n${a.content}\n`).join("\n");
  const problems = s.problems.length === 0 ? "" :
    `\nHierarchy problems: ${s.problems.join("; ")}\n`;
  const stale = job.origin === "auto" ? "Notice: the previous revision " +
    "of this file went stale. This is the new assigned snapshot.\n\n" : "";
  return `${stale}Assigned job: map source \`${s.sourcePath}\` to its ` +
    `spec \`${s.specPath}\`. Ranges are 1-based and inclusive, and are ` +
    `validated against the numbered snapshots below (not the live files).` +
    `\n\n## Spec snapshot: ${s.specPath}\n\n${numbered(s.spec)}\n\n` +
    `## Parent chain (nearest first)\n\n${parents}${problems}\n` +
    `## Source snapshot: ${s.sourcePath}\n\n${numbered(s.source)}\n`;
}
