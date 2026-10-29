/**
 * @fileoverview One annotation job: its types, execution, and publication.
 *
 * `executeJob` is the queue's run callback. It flips the job to `running`,
 * hands the Annotator runner a {@link JobContext} whose `annotate` writes
 * rows to SQLite during the tool call, and finally publishes: the job
 * becomes current only if it is still the desired revision *and* the files
 * on disk still hash to its snapshot. Failures are recorded, never thrown.
 */
import { Db } from "./db";
import { countMappings } from "./queries";
import { validateRange } from "./ranges";
import { isFresh, Snapshot, splitLines } from "./snapshot";
import * as store from "./store";
import { Trace } from "./trace";

/** Who asked for a job: the Coder tool, a user command, or auto-retry. */
export type Origin = "coder" | "user" | "auto";

export interface Job {
  id: string;
  origin: Origin;
  snapshot: Snapshot;
}

/** Identity of the Pi session working on a job, for the UI and trace. */
export interface WorkerInfo {
  worker: string;
  model: string;
}

/** Everything an Annotator runner may do; all bound to one job. */
export interface JobContext {
  job: Job;
  /** Validates and inserts one mapping row; throws a model-facing error. */
  annotate(m: store.MappingInput): number;
  /** Publishes the job (idempotent) and reports its resulting state. */
  finish(): { state: store.JobState; count: number };
  setWorker(info: WorkerInfo): void;
}

export interface JobDeps {
  root: string;
  db: Db;
  trace: Trace;
  maxParallel: () => number;
  runAnnotator: (ctx: JobContext) => Promise<void>;
  changed?: () => void;
}

/**
 * Runs one job to a terminal state. `workers` is the service's live
 * registry; `onStale` requests a bounded, fresh-context re-annotation.
 */
export async function executeJob(job: Job, deps: JobDeps,
  workers: Map<string, WorkerInfo>,
  onStale: (sourcePath: string) => void): Promise<void> {
  const { db, trace } = deps;
  if (store.getJob(db, job.id)?.state !== "queued") return;
  store.setState(db, job.id, "running");
  trace.record("service", "queue", { transition: "running" }, job.id);
  deps.changed?.();
  const ctx = context(job, deps, workers, onStale);
  try {
    await deps.runAnnotator(ctx);
    if (store.getJob(db, job.id)?.state === "running") {
      trace.record("service", "auto_finish",
        { reason: "session ended without finish_annotations" }, job.id);
      ctx.finish();
    }
  } catch (err) {
    if (store.getJob(db, job.id)?.state === "running") {
      store.setState(db, job.id, "failed");
    }
    trace.record("service", "error",
      { message: (err as Error).message }, job.id);
  } finally {
    workers.delete(job.id);
    deps.changed?.();
  }
}

function context(job: Job, deps: JobDeps,
  workers: Map<string, WorkerInfo>,
  onStale: (sourcePath: string) => void): JobContext {
  const { db, trace } = deps;
  const specLines = splitLines(job.snapshot.spec).length;
  const codeLines = splitLines(job.snapshot.source).length;
  return {
    job,
    annotate(m) {
      const error = validateRange(m, specLines, codeLines);
      if (error) throw new Error(error);
      const mappingId = store.insertMapping(db, job.id, m);
      trace.record("annotator", "annotate_write", { mappingId, ...m },
        job.id);
      deps.changed?.();
      return mappingId;
    },
    finish() {
      const row = store.getJob(db, job.id);
      if (row?.state !== "running") {
        return { state: row?.state ?? "failed",
          count: countMappings(db, job.id) };
      }
      const fresh = isFresh(deps.root, job.snapshot);
      const state = store.publish(db, job.id, fresh);
      const count = countMappings(db, job.id);
      trace.record("service", "publish", { state, count, hashCheck: fresh ?
        "match" : "mismatch" }, job.id);
      deps.changed?.();
      if (state === "stale") onStale(job.snapshot.sourcePath);
      return { state, count };
    },
    setWorker(info) {
      workers.set(job.id, info);
      trace.record("annotator", "worker_start", { ...info }, job.id);
      deps.changed?.();
    },
  };
}
