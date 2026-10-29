/**
 * @fileoverview SQLite registry: connection setup, schema, and helpers.
 *
 * Spec Scope keeps one workspace-local database at
 * `.spec-scope/spec-scope.sqlite`. Source files and Markdown specs remain the
 * authoritative ordinary files; the database records only pair identities,
 * job states, revision hashes, mapping rows, and observable trace events.
 *
 * Concurrency model: the extension host owns one connection. Annotator tool
 * handlers run on the single JS thread and call the synchronous
 * `node:sqlite` API, so each statement or `tx()` body commits atomically
 * before another handler can run. WAL plus a busy timeout additionally lets
 * other processes (tests, a second window) read and queue for the write lock
 * instead of failing. Never hold a transaction across an `await`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";

export type Db = DatabaseSync;

/** Directory (relative to the workspace root) holding runtime state. */
export const STATE_DIR = ".spec-scope";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS file_pairs (
  source_path TEXT PRIMARY KEY,
  spec_path TEXT NOT NULL,
  desired_job TEXT,
  current_job TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  spec_hash TEXT NOT NULL,
  ancestry_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mappings (
  id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  spec_start INTEGER NOT NULL, spec_end INTEGER NOT NULL,
  code_start INTEGER NOT NULL, code_end INTEGER NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS mappings_by_job ON mappings(job_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  run_id TEXT NOT NULL,
  job_id TEXT,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  at TEXT NOT NULL
);`;

/**
 * Opens (creating if needed) a database file with the required pragmas and
 * schema applied. Safe to call from several processes on the same file.
 */
export function openDb(file: string): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

/**
 * Opens the workspace database and makes `.spec-scope/` self-ignoring, so
 * runtime state never reaches Git without touching the user's .gitignore.
 */
export function openWorkspaceDb(root: string): Db {
  const dir = path.join(root, STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
  return openDb(path.join(dir, "spec-scope.sqlite"));
}

const cache = new WeakMap<Db, Map<string, StatementSync>>();

/** Returns a cached prepared statement for `sql` on `db`. */
export function stmt(db: Db, sql: string): StatementSync {
  let byDb = cache.get(db);
  if (!byDb) cache.set(db, (byDb = new Map()));
  let s = byDb.get(sql);
  if (!s) byDb.set(sql, (s = db.prepare(sql)));
  return s;
}

/**
 * Runs `fn` in a short write transaction. `BEGIN IMMEDIATE` takes the write
 * lock up front so read-then-write checks cannot race another connection.
 * `fn` must be synchronous: the transaction must not span an LLM call.
 */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** ISO-8601 timestamp used for every `*_at` column. */
export function now(): string {
  return new Date().toISOString();
}
