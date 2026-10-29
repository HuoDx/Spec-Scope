/**
 * @fileoverview CoalescingQueue: bounded concurrency and per-key
 * coalescing, independent of jobs and SQLite.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CoalescingQueue } from "../src/queue";
import { gate, until } from "./helpers";

function fixture(k: number) {
  const running: string[] = [];
  const gates = new Map<string, () => void>();
  let maxConcurrent = 0;
  const q = new CoalescingQueue<string>(() => k, async (item) => {
    running.push(item);
    maxConcurrent = Math.max(maxConcurrent, running.length);
    const g = gate();
    gates.set(item, g.open);
    await g.promise;
    running.splice(running.indexOf(item), 1);
  });
  return { q, running, gates, max: () => maxConcurrent };
}

test("K=2 with three distinct keys runs two and queues one", async () => {
  const { q, running, gates } = fixture(2);
  assert.equal(q.submit("a", "a@1").state, "running");
  assert.equal(q.submit("b", "b@1").state, "running");
  assert.equal(q.submit("c", "c@1").state, "queued");
  await until(() => running.length === 2);
  assert.deepEqual(q.snapshot().pending, ["c@1"]);
  gates.get("a@1")!();
  await until(() => running.includes("c@1"));
  assert.deepEqual(q.snapshot().active.sort(), ["b@1", "c@1"]);
});

test("A@r1 -> r2 -> r3 coalesces to one active plus latest pending",
  async () => {
    const { q, running, gates, max } = fixture(4);
    q.submit("A", "A@r1");
    const r2 = q.submit("A", "A@r2");
    const r3 = q.submit("A", "A@r3");
    assert.equal(r2.state, "queued");
    assert.equal(r2.replaced, undefined);
    assert.equal(r3.replaced, "A@r2", "r3 must replace pending r2");
    await until(() => running.length === 1);
    assert.deepEqual(q.snapshot(), { active: ["A@r1"], pending: ["A@r3"] });
    gates.get("A@r1")!();
    await until(() => running.includes("A@r3"));
    assert.equal(max(), 1, "never two concurrent workers for one key");
  });

test("a pending key waits for its own active run, not just capacity",
  async () => {
    const { q, running, gates } = fixture(2);
    q.submit("A", "A@1");
    q.submit("A", "A@2");
    q.submit("B", "B@1");
    await until(() => running.length === 2);
    assert.deepEqual(q.snapshot().pending, ["A@2"]);
    gates.get("B@1")!();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(running, ["A@1"], "A@2 must not start beside A@1");
  });

test("limit below one still runs one item; rejections do not stall",
  async () => {
    let ran = 0;
    const q = new CoalescingQueue<string>(() => 0, async () => {
      ran++;
      throw new Error("boom");
    });
    q.submit("a", "a");
    q.submit("b", "b");
    await until(() => ran === 2);
  });
