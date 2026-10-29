/**
 * @fileoverview Job, file-pair, and mapping queries.
 *
 * Publication invariant: `file_pairs.desired_job` names the newest submitted
 * revision of a source file and `file_pairs.current_job` the last finalized
 * job whose hashes matched the files on disk. Only the desired job may become
 * current, and the check-and-set happens inside one write transaction, so an
 * older or partial job can never overwrite a newer published mapping set.
 */
import { Db, now, stmt, tx } from "./db";
import type { Revision } from "./snapshot";

/** Lifecycle of a job; `running` rows are shown as provisional drafts. */
export type JobState =
  | "queued" | "running" | "current" | "stale"
  | "superseded" | "failed" | "interrupted";

/** Outcome of `finish_annotations`. */
export type FinishState = "current" | "stale" | "superseded";

export interface JobRow {
  id: string;
  source_path: string;
  source_hash: string;
  spec_hash: string;
  ancestry_hash: string;
  state: JobState;
  created_at: string;
}

export interface PairRow {
  source_path: string;
  spec_path: string;
  desired_job: string | null;
  current_job: string | null;
}

/** One semantic correspondence; all ranges are inclusive and 1-based. */
export interface MappingInput {
  spec_start: number;
  spec_end: number;
  code_start: number;
  code_end: number;
  note?: string;
}

export interface MappingRow extends MappingInput {
  id: number;
  job_id: string;
}

/** Inserts a queued job and makes it the desired revision of its file. */
export function createJob(db: Db, id: string, sourcePath: string,
  specPath: string, rev: Revision): void {
  tx(db, () => {
    stmt(db, `INSERT INTO jobs VALUES (?, ?, ?, ?, ?, 'queued', ?)`).run(
      id, sourcePath, rev.sourceHash, rev.specHash, rev.ancestryHash, now());
    stmt(db, `INSERT INTO file_pairs VALUES (?, ?, ?, NULL)
      ON CONFLICT(source_path) DO UPDATE SET
      spec_path = excluded.spec_path, desired_job = excluded.desired_job`,
    ).run(sourcePath, specPath, id);
  });
}

export function getJob(db: Db, id: string): JobRow | undefined {
  return stmt(db, `SELECT * FROM jobs WHERE id = ?`).get(id) as
    JobRow | undefined;
}

export function getPair(db: Db, sourcePath: string): PairRow | undefined {
  return stmt(db, `SELECT * FROM file_pairs WHERE source_path = ?`)
    .get(sourcePath) as PairRow | undefined;
}

export function setState(db: Db, id: string, state: JobState): void {
  stmt(db, `UPDATE jobs SET state = ? WHERE id = ?`).run(state, id);
}

/**
 * Inserts one mapping row, but only while its job is still running; a
 * finished, superseded, or interrupted job cannot gain rows. Returns the new
 * row ID. Ranges must already be validated against the job snapshot.
 */
export function insertMapping(db: Db, jobId: string,
  m: MappingInput): number {
  const r = stmt(db, `INSERT INTO mappings
    (job_id, spec_start, spec_end, code_start, code_end, note)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS
    (SELECT 1 FROM jobs WHERE id = ? AND state = 'running')`).run(
    jobId, m.spec_start, m.spec_end, m.code_start, m.code_end,
    m.note ?? null, jobId);
  if (r.changes === 0) throw new Error(`Job ${jobId} is no longer running.`);
  return Number(r.lastInsertRowid);
}

/**
 * Finalizes a running job. `fresh` reports whether the files on disk still
 * match the job's snapshot. Returns the job's final state.
 */
export function publish(db: Db, jobId: string, fresh: boolean): FinishState {
  return tx(db, () => {
    const job = getJob(db, jobId);
    if (!job) throw new Error(`Unknown job ${jobId}.`);
    const pair = getPair(db, job.source_path);
    let state: FinishState = "current";
    if (pair?.desired_job !== jobId) state = "superseded";
    else if (!fresh) state = "stale";
    if (state === "current") {
      const old = pair?.current_job;
      if (old && old !== jobId) setState(db, old, "superseded");
      stmt(db, `UPDATE file_pairs SET current_job = ? WHERE source_path = ?`)
        .run(jobId, job.source_path);
    }
    setState(db, jobId, state);
    return state;
  });
}
