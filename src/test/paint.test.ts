/**
 * @fileoverview Paint planning for nested mappings. The fixture is the
 * real mapping set that made the old viewer unreadable: eleven sentence-
 * level mappings of a 4-line paragraph onto nested code ranges.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { paintPlan, Stroke } from "../src/paint";
import { groupMappings, Mapping, SyncController } from "../src/sync";

const ROWS: [number, number, number, number][] = [
  [5, 5, 29, 48], [5, 5, 6, 27], [6, 6, 50, 57], [6, 6, 59, 63],
  [6, 7, 11, 11], [6, 7, 20, 22], [7, 7, 24, 26], [7, 8, 51, 55],
  [8, 8, 56, 56], [8, 8, 10, 14], [8, 8, 55, 55],
];
const MAPS: Mapping[] = groupMappings(ROWS.map(([ss, se, cs, ce], i) =>
  ({ id: i + 1, spec_start: ss, spec_end: se, code_start: cs,
    code_end: ce })));

/** The mapping id painted on `line` as `kind`, if any. */
function at(strokes: Stroke[], kind: Stroke["kind"], line: number) {
  return strokes.filter((s) => s.kind === kind &&
    s.start <= line && line <= s.end).map((s) => s.id);
}

test("every line has at most one fill and one bar", () => {
  for (const side of ["spec", "code"] as const) {
    const plan = paintPlan(MAPS, side);
    for (let line = 1; line <= 63; line++) {
      assert.ok(at(plan, "fill", line).length <= 1, `${side} ${line}`);
      assert.ok(at(plan, "bar", line).length <= 1, `${side} ${line}`);
    }
  }
});

test("nested code: innermost fills, the enclosing function is a bar", () => {
  const code = paintPlan(MAPS, "code");
  assert.deepEqual(at(code, "fill", 7), [2], "spawnPiece body");
  assert.deepEqual(at(code, "bar", 7), [], "nothing encloses it here");
  assert.deepEqual(at(code, "fill", 11), [5], "createPiece line");
  assert.deepEqual(at(code, "bar", 11), [2]);
  assert.deepEqual(at(code, "fill", 21), [6], "timer resets");
  assert.deepEqual(at(code, "fill", 55), [11], "single line beats 51-57");
  assert.deepEqual(at(code, "bar", 55), [3], "outermost of three");
  assert.deepEqual(at(code, "fill", 28), [], "unmapped stays plain");
});

test("spec lines are painted individually, not per paragraph", () => {
  const spec = paintPlan(MAPS, "spec");
  const fills = [5, 6, 7, 8].map((l) => at(spec, "fill", l)[0]);
  assert.deepEqual(fills, [1, 3, 7, 9]);
  assert.deepEqual(at(spec, "bar", 6), [6], "6-7 spans past line 6");
  assert.equal(new Set(fills.map((id) => MAPS[id - 1].group)).size, 4,
    "four lines, four colors");
});

test("runs merge across consecutive lines and split on gaps", () => {
  const bars = paintPlan(MAPS, "code").filter((s) =>
    s.kind === "bar" && s.id === 2);
  assert.deepEqual(bars.map((s) => [s.start, s.end]),
    [[10, 14], [20, 22], [24, 26]]);
});

test("clicking a nested line focuses the innermost mapping", () => {
  const sync = new SyncController({ spec: { reveal: () => {} },
    code: { reveal: () => {} } });
  sync.setMappings(MAPS);
  assert.equal(sync.focus("code", 11)?.id, 5);
  assert.equal(sync.focus("code", 8)?.id, 2);
});
