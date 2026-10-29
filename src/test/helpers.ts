/**
 * @fileoverview Shared test fixtures: temp workspaces and a job harness
 * whose Annotator runner is a scripted fake instead of an LLM.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { openWorkspaceDb, Db } from "../src/db";
import { JobContext } from "../src/job";
import { JobService } from "../src/jobs";
import { Trace } from "../src/trace";

/** Creates a temp workspace containing `files` (relative path -> text). */
export function workspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-scope-test-"));
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  return root;
}

export function write(root: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}

/** A resolvable promise, for holding fake Annotators mid-run. */
export function gate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((r) => (open = r));
  return { promise, open };
}

/** Waits until `cond()` holds (polling the event loop), or fails. */
export async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
}

export interface Harness {
  root: string;
  db: Db;
  jobs: JobService;
  /** Contexts handed to the fake runner, in start order. */
  started: JobContext[];
}

/**
 * Builds a JobService over a temp workspace. `script` plays the Annotator
 * for each started job (default: one mapping, then finish).
 */
export function harness(files: Record<string, string>, k = 2,
  script: (ctx: JobContext) => Promise<void> = async (ctx) => {
    ctx.annotate({ spec_start: 1, spec_end: 1, code_start: 1,
      code_end: 1 });
    ctx.finish();
  }): Harness {
  const root = workspace(files);
  const db = openWorkspaceDb(root);
  const started: JobContext[] = [];
  const jobs = new JobService({
    root, db, trace: new Trace(db, "run-test"), maxParallel: () => k,
    runAnnotator: async (ctx) => {
      started.push(ctx);
      await script(ctx);
    },
  });
  return { root, db, jobs, started };
}

/** A minimal file pair: `src/<name>.ts` with `src/<name>.spec.md`. */
export function pair(name: string, code = "export const x = 1;\n"):
  Record<string, string> {
  return {
    [`src/${name}.ts`]: code,
    [`src/${name}.spec.md`]: `# ${name}\n\nDefines x.\n`,
  };
}
