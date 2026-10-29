/**
 * @fileoverview Semantic, bidirectional scroll synchronization.
 *
 * The controller sees both panes only through {@link Pane}, which can
 * reveal a line range and nothing else: it cannot edit, pad, reorder, or
 * re-render either document. Scrolling one side picks the nearest mapped
 * anchor (never a proportional percentage) and reveals its partner range.
 *
 * Feedback-loop prevention: after revealing a pane, scroll events *from
 * that pane* are ignored for `muteMs`, and re-revealing the mapping that is
 * already aligned is skipped.
 */

/** A mapping row in viewer form; lines are 1-based and inclusive. */
export interface Mapping {
  id: number;
  specStart: number;
  specEnd: number;
  codeStart: number;
  codeEnd: number;
  /** Color group: identical spec ranges share a group. */
  group: number;
}

/** The only capability the controller has over a pane. */
export interface Pane {
  reveal(start: number, end: number): void;
}

type Side = "spec" | "code";

function range(m: Mapping, side: Side): [number, number] {
  return side === "spec" ? [m.specStart, m.specEnd] : [m.codeStart, m.codeEnd];
}

function distance(m: Mapping, side: Side, line: number): number {
  const [s, e] = range(m, side);
  return line < s ? s - line : line > e ? line - e : 0;
}

/**
 * The mapping nearest to `line` on `side`. Ties prefer `active` (so the
 * focused mapping wins in one-to-many cases), then the earliest start.
 */
export function nearest(maps: Mapping[], side: Side, line: number,
  active?: number): Mapping | undefined {
  let best: Mapping | undefined;
  for (const m of maps) {
    if (!best) {
      best = m;
      continue;
    }
    const d = distance(m, side, line) - distance(best, side, line);
    const tie = d === 0 && (m.id === active ||
      (best.id !== active && range(m, side)[0] < range(best, side)[0]));
    if (d < 0 || tie) best = m;
  }
  return best;
}

export class SyncController {
  private maps: Mapping[] = [];
  private active?: number;
  private aligned?: number;
  private readonly muted: Record<Side, number> = { spec: 0, code: 0 };

  constructor(private readonly panes: Record<Side, Pane>,
    private readonly clock: () => number = Date.now,
    private readonly muteMs = 400) {}

  setMappings(maps: Mapping[]): void {
    this.maps = maps;
    if (!maps.some((m) => m.id === this.active)) this.active = undefined;
    this.aligned = undefined;
  }

  /** The user scrolled `side` so that `topLine` is at the top. */
  scrolled(side: Side, topLine: number): void {
    if (this.clock() < this.muted[side]) return;
    const m = nearest(this.maps, side, topLine, this.active);
    if (!m || m.id === this.aligned) return;
    this.revealOther(side, m);
  }

  /**
   * Hover or click at `line` on `side`: the containing mapping becomes
   * active and the other pane reveals it. Returns it for highlighting.
   */
  focus(side: Side, line: number): Mapping | undefined {
    const hits = this.maps.filter((m) => distance(m, side, line) === 0);
    if (hits.length === 0) return undefined;
    const m = hits.find((h) => h.id === this.active) ?? hits[0];
    this.active = m.id;
    this.revealOther(side, m);
    return m;
  }

  private revealOther(from: Side, m: Mapping): void {
    const to: Side = from === "spec" ? "code" : "spec";
    this.aligned = m.id;
    this.muted[to] = this.clock() + this.muteMs;
    const [s, e] = range(m, to);
    this.panes[to].reveal(s, e);
  }
}

/** Assigns color groups: one per distinct spec range, in spec order. */
export function groupMappings(rows: { id: number; spec_start: number;
  spec_end: number; code_start: number; code_end: number }[]): Mapping[] {
  const groups = new Map<string, number>();
  return rows.map((r) => {
    const key = `${r.spec_start}:${r.spec_end}`;
    if (!groups.has(key)) groups.set(key, groups.size);
    return { id: r.id, specStart: r.spec_start, specEnd: r.spec_end,
      codeStart: r.code_start, codeEnd: r.code_end,
      group: groups.get(key)! };
  });
}
