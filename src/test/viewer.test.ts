/**
 * @fileoverview Paired-viewer logic: semantic (non-proportional) sync,
 * feedback-loop suppression, one-to-many priority, and non-mutation.
 * Paint planning has its own suite in paint.test.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { groupMappings, Mapping, nearest, Pane, SyncController }
  from "../src/sync";

const ROWS = groupMappings([
  { id: 1, spec_start: 1, spec_end: 3, code_start: 40, code_end: 50 },
  { id: 2, spec_start: 1, spec_end: 3, code_start: 5, code_end: 9 },
  { id: 3, spec_start: 10, spec_end: 12, code_start: 1, code_end: 4 },
]);

/** A pane that records reveals and throws on any other access. */
function recorder(): Pane & { calls: number[][] } {
  const calls: number[][] = [];
  const pane = { calls, reveal: (s: number, e: number) => calls.push([s, e]) };
  return new Proxy(pane, { get(t, k) {
    if (k in t) return t[k as keyof typeof t];
    throw new Error(`viewer touched pane.${String(k)}`);
  } });
}

function controller() {
  let t = 1000;
  const panes = { spec: recorder(), code: recorder() };
  const sync = new SyncController(panes, () => t, 400);
  sync.setMappings(ROWS);
  return { sync, panes, tick: (ms: number) => (t += ms) };
}

test("same spec range shares a color group; out-of-order is fine", () => {
  assert.deepEqual(ROWS.map((m: Mapping) => m.group), [0, 0, 1]);
});

test("scrolling spec reveals the nearest mapped code range", () => {
  const { sync, panes } = controller();
  sync.scrolled("spec", 11);
  assert.deepEqual(panes.code.calls, [[1, 4]]);
  sync.scrolled("spec", 12);
  assert.equal(panes.code.calls.length, 1, "already aligned: no re-reveal");
});

test("the revealed pane's echo scroll does not bounce back", () => {
  const { sync, panes, tick } = controller();
  sync.scrolled("spec", 1);
  sync.scrolled("code", 40);
  assert.equal(panes.spec.calls.length, 0, "echo suppressed");
  tick(500);
  sync.scrolled("code", 2);
  assert.deepEqual(panes.spec.calls, [[10, 12]]);
});

test("one-to-many: the focused mapping wins on later scrolls", () => {
  const { sync, panes, tick } = controller();
  assert.equal(sync.focus("code", 45)?.id, 1);
  tick(500);
  sync.setMappings(ROWS);
  sync.scrolled("spec", 2);
  assert.deepEqual(panes.code.calls.at(-1), [40, 50]);
  assert.equal(nearest(ROWS, "spec", 2)?.id, 1, "tie -> earlier start");
});
