/**
 * @fileoverview SQLite behavior: truly concurrent writers (worker threads,
 * separate connections), interleaved Annotator writes during execution,
 * publication guards, and restart recovery.
 */
import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { openDb, openWorkspaceDb } from "../src/db";
import { countMappings, markAbandoned } from "../src/queries";
import { createJob, getJob, insertMapping, publish, setState }
  from "../src/store";
import { gate, harness, pair, until, workspace } from "./helpers";

const REV = { sourceHash: "s", specHash: "p", ancestryHash: "a" };

test("concurrent writers on separate connections lose no rows", async () => {
  const root = workspace({});
  const db = openWorkspaceDb(root);
  const file = path.join(root, ".spec-scope", "spec-scope.sqlite");
  for (const id of ["j1", "j2", "j3"]) {
    createJob(db, id, `src/${id}.ts`, `src/${id}.spec.md`, REV);
    setState(db, id, "running");
  }
  const storePath = require.resolve("../src/store");
  const dbPath = require.resolve("../src/db");
  const code = `
    const { workerData: w } = require("node:worker_threads");
    const db = require(w.dbPath).openDb(w.file);
    const { insertMapping } = require(w.storePath);
    for (let i = 1; i <= 200; i++) insertMapping(db, w.job,
      { spec_start: 1, spec_end: 1, code_start: i, code_end: i });
    db.close();`;
  await Promise.all(["j1", "j2", "j3"].map((job) =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(code, { eval: true,
        workerData: { file, job, dbPath, storePath } });
      w.on("error", reject);
      w.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`${c}`))));
    })));
  for (const id of ["j1", "j2", "j3"]) assert.equal(countMappings(db, id), 200);
});

test("two Annotators' rows appear during execution, before finish",
  async () => {
    const hold = gate();
    const h = harness({ ...pair("a"), ...pair("b") }, 2, async (ctx) => {
      ctx.annotate({ spec_start: 1, spec_end: 1, code_start: 1,
        code_end: 1 });
      await hold.promise;
      ctx.finish();
    });
    const a = h.jobs.submit("src/a.ts", "coder");
    const b = h.jobs.submit("src/b.ts", "coder");
    await until(() => countMappings(h.db, a.jobId) === 1 &&
      countMappings(h.db, b.jobId) === 1);
    assert.equal(getJob(h.db, a.jobId)?.state, "running", "rows are drafts");
    hold.open();
    await until(() => getJob(h.db, b.jobId)?.state === "current");
  });

test("an older job can never replace a newer current mapping set", () => {
  const db = openDb(":memory:");
  createJob(db, "old", "a.ts", "a.spec.md", REV);
  createJob(db, "new", "a.ts", "a.spec.md", { ...REV, sourceHash: "s2" });
  setState(db, "old", "running");
  setState(db, "new", "running");
  assert.equal(publish(db, "new", true), "current");
  assert.equal(publish(db, "old", true), "superseded");
  assert.throws(() => insertMapping(db, "old",
    { spec_start: 1, spec_end: 1, code_start: 1, code_end: 1 }),
  /no longer running/);
});

test("hash mismatch at publication yields stale, not current", () => {
  const db = openDb(":memory:");
  createJob(db, "j", "a.ts", "a.spec.md", REV);
  setState(db, "j", "running");
  assert.equal(publish(db, "j", false), "stale");
});

test("restart marks abandoned queued/running jobs interrupted", () => {
  const db = openDb(":memory:");
  createJob(db, "q", "a.ts", "a.spec.md", REV);
  createJob(db, "r", "b.ts", "b.spec.md", REV);
  setState(db, "r", "running");
  assert.deepEqual(markAbandoned(db).sort(), ["q", "r"]);
  assert.equal(getJob(db, "q")?.state, "interrupted");
});
