/**
 * @fileoverview Decides what to paint on one side of a pair, so nested or
 * overlapping mappings never stack translucent colors.
 *
 * Rule, per line: the *innermost* mapping covering the line (shortest span)
 * fills its background; when a longer mapping also covers the line, the
 * *outermost* one is drawn as a thin gutter bar. A whole function mapped
 * to one sentence and its statements mapped to others therefore reads as
 * a bar beside distinct fills, not as muddy layers. Pure (no vscode).
 */
import { Mapping, Side, span } from "./sync";

/** A run of consecutive lines painted for one mapping. */
export interface Stroke {
  id: number;
  group: number;
  kind: "fill" | "bar";
  /** 1-based, inclusive. */
  start: number;
  end: number;
}

const size = (m: Mapping, side: Side) => span(m, side)[1] - span(m, side)[0];

/** Innermost first; ties prefer the later start, then the lower id. */
function inner(a: Mapping, b: Mapping, side: Side): number {
  return size(a, side) - size(b, side) ||
    span(b, side)[0] - span(a, side)[0] || a.id - b.id;
}

/** Strokes for `side`, ordered by line. */
export function paintPlan(maps: Mapping[], side: Side): Stroke[] {
  const last = Math.max(0, ...maps.map((m) => span(m, side)[1]));
  const strokes: Stroke[] = [];
  const open = new Map<string, Stroke>();
  for (let line = 1; line <= last; line++) {
    const hits = maps.filter((m) => {
      const [s, e] = span(m, side);
      return s <= line && line <= e;
    }).sort((a, b) => inner(a, b, side));
    const marks: [Mapping, Stroke["kind"]][] = [];
    if (hits.length > 0) marks.push([hits[0], "fill"]);
    if (hits.length > 1) marks.push([hits[hits.length - 1], "bar"]);
    const seen = new Set<string>();
    for (const [m, kind] of marks) {
      const key = `${kind}:${m.id}`;
      seen.add(key);
      const run = open.get(key);
      if (run) {
        run.end = line;
        continue;
      }
      const stroke = { id: m.id, group: m.group, kind, start: line,
        end: line };
      strokes.push(stroke);
      open.set(key, stroke);
    }
    // A run that skipped this line is closed; a later hit starts anew.
    for (const key of open.keys()) if (!seen.has(key)) open.delete(key);
  }
  return strokes;
}
