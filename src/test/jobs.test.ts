/**
 * @fileoverview Job lifecycle through the real service, store, and
 * snapshot code: nonblocking submit, coalescing, publication, staleness.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { countMappings, recentJobs } from "../src/queries";
import { getJob, getPair } from "../src/store";
import { gate, harness, pair, until, write } from "./helpers";

test("submit returns before the Annotator runs; finish publishes",
  async () => {
    const h = harness(pair("a"));
    const r = h.jobs.submit("src/a.ts", "coder");
    assert.equal(r.state, "running");
    assert.equal(h.started.length, 0, "submit must not await the agent");
    await until(() => getJob(h.db, r.jobId)?.state === "current");
    assert.equal(getPair(h.db, "src/a.ts")?.current_job, r.jobId);
    assert.equal(countMappings(h.db, r.jobId), 1);
  });

test("unchanged resubmission is a no-op", async () => {
  const h = harness(pair("a"));
  const first = h.jobs.submit("src/a.ts", "coder");
  await until(() => getJob(h.db, first.jobId)?.state === "current");
  const again = h.jobs.submit("src/a.spec.md", "coder");
  assert.deepEqual(again, { jobId: first.jobId, state: "unchanged" });
});

test("rapid r1, r2, r3: only r3 can become current", async () => {
  const hold = gate();
  const h = harness(pair("a"), 2, async (ctx) => {
    if (h.started.length === 1) await hold.promise;
    ctx.annotate({ spec_start: 1, spec_end: 1, code_start: 1,
      code_end: 1 });
    ctx.finish();
  });
  const r1 = h.jobs.submit("src/a.ts", "coder");
  write(h.root, "src/a.ts", "export const x = 2;\n");
  const r2 = h.jobs.submit("src/a.ts", "coder");
  write(h.root, "src/a.ts", "export const x = 3;\n");
  const r3 = h.jobs.submit("src/a.ts", "coder");
  assert.equal(getJob(h.db, r2.jobId)?.state, "superseded");
  await until(() => h.started.length === 1);
  hold.open();
  await until(() => getJob(h.db, r3.jobId)?.state === "current");
  assert.equal(getJob(h.db, r1.jobId)?.state, "superseded");
  assert.equal(h.started.length, 2, "r2 never ran");
  assert.equal(getPair(h.db, "src/a.ts")?.current_job, r3.jobId);
});

test("files edited during a run publish as stale, then auto-retry",
  async () => {
    const h = harness(pair("a"), 2, async (ctx) => {
      if (h.started.length === 1) write(h.root, "src/a.ts", "changed\n");
      ctx.annotate({ spec_start: 1, spec_end: 1, code_start: 1,
        code_end: 1 });
      ctx.finish();
    });
    const r1 = h.jobs.submit("src/a.ts", "coder");
    await until(() => h.started.length === 2);
    assert.equal(getJob(h.db, r1.jobId)?.state, "stale");
    assert.equal(h.started[1].job.origin, "auto");
    assert.equal(h.started[1].job.snapshot.source, "changed\n");
    const r2 = h.started[1].job.id;
    await until(() => getJob(h.db, r2)?.state === "current");
  });

test("automatic stale retries are bounded", async () => {
  let edits = 0;
  const h = harness(pair("a"), 2, async (ctx) => {
    write(h.root, "src/a.ts", `edit ${++edits}\n`);
    ctx.finish();
  });
  h.jobs.submit("src/a.ts", "coder");
  await until(() => recentJobs(h.db).length === 3 &&
    recentJobs(h.db).every((j) => j.state === "stale"));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(h.started.length, 3, "1 submission + 2 automatic retries");
});

test("a runner failure marks the job failed with a recorded reason",
  async () => {
    const h = harness(pair("a"), 2, async () => {
      throw new Error("model unavailable");
    });
    const r = h.jobs.submit("src/a.ts", "coder");
    await until(() => getJob(h.db, r.jobId)?.state === "failed");
    assert.equal(recentJobs(h.db)[0].error, "model unavailable");
  });

test("annotate validates ranges against the immutable snapshot",
  async () => {
    const errors: string[] = [];
    const h = harness(pair("a"), 2, async (ctx) => {
      for (const bad of [{ spec_start: 0, spec_end: 1 },
        { spec_start: 2, spec_end: 1 }, { spec_start: 1, spec_end: 99 }]) {
        try {
          ctx.annotate({ ...bad, code_start: 1, code_end: 1 });
        } catch (err) {
          errors.push((err as Error).message);
        }
      }
      ctx.finish();
    });
    const r = h.jobs.submit("src/a.ts", "coder");
    await until(() => getJob(h.db, r.jobId)?.state === "current");
    assert.equal(errors.length, 3);
    assert.match(errors[2], /spec snapshot, which has 3 lines/);
    assert.equal(countMappings(h.db, r.jobId), 0);
  });
