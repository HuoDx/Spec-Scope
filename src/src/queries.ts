/**
 * @fileoverview Read-side queries for the UI, plus restart recovery.
 *
 * Kept apart from `store.ts`, which owns the write-side invariants, so UI
 * reads can change freely without touching publication logic.
 */
import { Db, stmt } from "./db";
import { JobRow, MappingRow } from "./store";

/** A job plus its mapping count and latest recorded error, for listings. */
export interface JobSummary extends JobRow {
  count: number;
  error: string | null;
}

export function countMappings(db: Db, jobId: string): number {
  const row = stmt(db, `SELECT COUNT(*) AS n FROM mappings WHERE job_id = ?`)
    .get(jobId) as { n: number };
  return row.n;
}

/** All mapping rows of a job ordered by spec position, then code position. */
export function mappingsOf(db: Db, jobId: string): MappingRow[] {
  return stmt(db, `SELECT * FROM mappings WHERE job_id = ?
    ORDER BY spec_start, spec_end, code_start`).all(jobId) as
    unknown as MappingRow[];
}

/** Most recent jobs first, with live mapping counts and failure reasons. */
export function recentJobs(db: Db, limit = 40): JobSummary[] {
  return stmt(db, `SELECT j.*,
    (SELECT COUNT(*) FROM mappings m WHERE m.job_id = j.id) AS count,
    (SELECT json_extract(e.payload, '$.message') FROM events e
      WHERE e.job_id = j.id AND e.kind = 'error'
      ORDER BY e.id DESC LIMIT 1) AS error
    FROM jobs j ORDER BY j.created_at DESC, j.rowid DESC LIMIT ?`)
    .all(limit) as unknown as JobSummary[];
}

/**
 * Marks jobs abandoned by a previous extension host as `interrupted`. The
 * scheduler is in-process, so queued and running jobs cannot survive a
 * restart; users (or the Coder) can retry them. Returns the affected IDs.
 */
export function markAbandoned(db: Db): string[] {
  const rows = stmt(db, `UPDATE jobs SET state = 'interrupted'
    WHERE state IN ('queued', 'running') RETURNING id`).all() as
    { id: string }[];
  return rows.map((r) => r.id);
}
