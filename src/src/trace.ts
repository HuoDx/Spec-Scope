/**
 * @fileoverview Observable execution trace: recording, redaction, export.
 *
 * Events are what Pi and the service actually observed (prompts, visible
 * responses, tool calls/results, queue transitions, hash checks, publication
 * outcomes). Nothing here synthesizes reasoning. Payloads are redacted
 * *before* insertion, so secrets never reach SQLite or exported files.
 */
import { randomUUID } from "node:crypto";
import { Db, now, stmt } from "./db";

/** Who produced an event. */
export type Actor = "coder" | "annotator" | "service" | "user";

const SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH/i;
// Common credential shapes. Character classes exclude quotes, whitespace and
// backslashes so a replacement can never break a JSON string escape.
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghs|github_pat|xox[abps])_[A-Za-z0-9_]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /(Bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/gi,
  new RegExp("\\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*" +
    "\\s*[=:]\\s*)[\"']?[^\\s\"'\\\\]{6,}", "g"),
];

/**
 * Replaces credential-like substrings and the values of secret-looking
 * environment variables with `[REDACTED]`.
 */
export function redact(text: string): string {
  let out = text;
  for (const [name, value] of Object.entries(process.env)) {
    if (value && value.length >= 8 && SECRET_ENV.test(name)) {
      out = out.split(value).join("[REDACTED]");
    }
  }
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (_m, prefix?: string) =>
      `${typeof prefix === "string" ? prefix : ""}[REDACTED]`);
  }
  return out;
}

/** Returns a new, sortable run identifier. */
export function newRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  return `run-${stamp}-${randomUUID().slice(0, 6)}`;
}

/** Appends ordered, redacted events for one run (one extension session). */
export class Trace {
  constructor(private readonly db: Db, readonly runId: string) {}

  record(actor: Actor, kind: string, payload: object, jobId?: string): void {
    stmt(this.db, `INSERT INTO events (run_id, job_id, actor, kind, payload,
      at) VALUES (?, ?, ?, ?, ?, ?)`).run(this.runId, jobId ?? null, actor,
      kind, redact(JSON.stringify(payload)), now());
  }
}

/** Runs present in the database, newest first. */
export function listRuns(db: Db): { run_id: string; first: string;
  events: number }[] {
  return stmt(db, `SELECT run_id, MIN(at) AS first, COUNT(*) AS events
    FROM events GROUP BY run_id ORDER BY first DESC`).all() as
    unknown as ReturnType<typeof listRuns>;
}

/**
 * Serializes one run as JSONL: a header line, then every event ordered by
 * ID. Pass `liveNote` when exporting the still-active run; it is reported as
 * incomplete with that explanation. A past run is incomplete when it never
 * recorded `run_end` (for example, the extension host was killed).
 */
export function exportRun(db: Db, runId: string, liveNote?: string): string {
  const rows = stmt(db, `SELECT * FROM events WHERE run_id = ?
    ORDER BY id`).all(runId) as unknown as {
      id: number; job_id: string | null; actor: string; kind: string;
      payload: string; at: string; }[];
  const ended = rows.some((r) => r.kind === "run_end");
  const complete = ended && liveNote === undefined;
  const header = {
    type: "spec-scope-trace", version: 1, runId,
    exportedAt: now(), events: rows.length, complete,
    note: liveNote ?? (complete ? undefined :
      "Run incomplete: it ended without a run_end event."),
  };
  const lines = [JSON.stringify(header)];
  for (const r of rows) {
    lines.push(JSON.stringify({
      id: r.id, at: r.at, actor: r.actor, kind: r.kind,
      jobId: r.job_id ?? undefined, payload: JSON.parse(r.payload),
    }));
  }
  return lines.join("\n") + "\n";
}
