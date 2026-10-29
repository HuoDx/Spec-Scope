/**
 * @fileoverview Job service: submission, coalescing, and bounded retries.
 *
 * `submit_file` lands here. It snapshots the pair, records the new desired
 * revision, and hands the job to the queue without awaiting any LLM work.
 * Running and publishing a single job is `job.ts`'s responsibility. See
 * jobs.spec.md for the full collaboration contract.
 */
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { executeJob, Job, JobDeps, Origin, WorkerInfo } from "./job";
import { CoalescingQueue } from "./queue";
import { sameRevision, takeSnapshot } from "./snapshot";
import { SPEC_SUFFIX, sourceForSpec } from "./specs";
import * as store from "./store";
import { Actor } from "./trace";

export interface SubmitResult {
  jobId: string;
  state: "queued" | "running" | "unchanged";
}

/** Consecutive automatic stale-revision retries allowed per file. */
export const MAX_AUTO_RETRIES = 2;

const UNCHANGED_STATES = new Set(["queued", "running", "current"]);
const ACTOR: Record<Origin, Actor> =
  { coder: "coder", user: "user", auto: "service" };

export class JobService {
  readonly queue: CoalescingQueue<Job>;
  /** Running jobs' worker identities, keyed by job ID. */
  readonly workers = new Map<string, WorkerInfo>();
  private readonly autoRetries = new Map<string, number>();

  constructor(private readonly deps: JobDeps) {
    this.queue = new CoalescingQueue(deps.maxParallel,
      (job) => executeJob(job, this.deps, this.workers,
        (sourcePath) => this.retryStale(sourcePath)),
      () => deps.changed?.());
  }

  /**
   * Snapshots a pair and enqueues it without waiting for any LLM work.
   * Accepts the source path or its spec path, absolute or relative.
   * Throws (PairError or Error) with a message suitable for the Coder.
   */
  submit(file: string, origin: Origin): SubmitResult {
    const { db, trace } = this.deps;
    const sourcePath = this.toSource(file);
    const snapshot = takeSnapshot(this.deps.root, sourcePath);
    const desiredId = store.getPair(db, sourcePath)?.desired_job;
    const desired = desiredId ? store.getJob(db, desiredId) : undefined;
    if (desired && UNCHANGED_STATES.has(desired.state) &&
      sameRevision(desired, snapshot.rev)) {
      trace.record(ACTOR[origin], "submit_unchanged",
        { sourcePath, existingJob: desired.id }, desired.id);
      return { jobId: desired.id, state: "unchanged" };
    }
    if (origin !== "auto") this.autoRetries.delete(sourcePath);
    const job: Job = { id: `job-${randomUUID().slice(0, 8)}`, origin,
      snapshot };
    store.createJob(db, job.id, sourcePath, snapshot.specPath, snapshot.rev);
    trace.record(ACTOR[origin], "handoff", {
      origin, sourcePath, specPath: snapshot.specPath,
      ancestors: snapshot.ancestors.map((a) => a.path),
      problems: snapshot.problems, ...snapshot.rev }, job.id);
    const { state, replaced } = this.queue.submit(sourcePath, job);
    if (replaced) {
      store.setState(db, replaced.id, "superseded");
      trace.record("service", "queue", { transition: "superseded",
        by: job.id }, replaced.id);
    }
    trace.record("service", "queue", { transition: state }, job.id);
    return { jobId: job.id, state };
  }

  private toSource(file: string): string {
    const rel = path.relative(this.deps.root,
      path.resolve(this.deps.root, file)).split(path.sep).join("/");
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`${file} is outside the workspace.`);
    }
    if (!rel.endsWith(SPEC_SUFFIX)) return rel;
    const source = sourceForSpec(this.deps.root, rel);
    if (!source) throw new Error(`${rel} is a module spec with no source.`);
    return source;
  }

  /** Bounded, fresh-context re-annotation after a stale publication. */
  private retryStale(sourcePath: string): void {
    const n = this.autoRetries.get(sourcePath) ?? 0;
    if (n >= MAX_AUTO_RETRIES) {
      this.deps.trace.record("service", "retry_limit",
        { sourcePath, attempts: n });
      return;
    }
    this.autoRetries.set(sourcePath, n + 1);
    this.deps.trace.record("service", "retry", { sourcePath, attempt: n + 1 });
    try {
      this.submit(sourcePath, "auto");
    } catch (err) {
      this.deps.trace.record("service", "error",
        { message: (err as Error).message, sourcePath });
    }
  }
}
