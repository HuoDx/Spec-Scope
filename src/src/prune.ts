/**
 * @fileoverview Deterministic visual pruning of the spec graph.
 *
 * Pruning only selects what to draw; the index (and the Markdown) is never
 * changed. Selection order, each step sorted by path for determinism:
 *   1. The focus and its full `Parent:` ancestor chain (always shown).
 *   2. Descendants breadth-first up to `depth` levels.
 *   3. Cross-references (forward, then backlinks) of shown nodes, nearest
 *      first, until `budget` nodes are shown.
 * Edges: backbone parent->child edges between shown nodes, then ordinary
 * links deduplicated as undirected pairs, minus any pair already joined by
 * the backbone. Each node reports how many neighbors were left out.
 */
import { ancestorsOf, GraphIndex, isFileWise } from "./graph";

export type NodeRole = "focus" | "ancestor" | "descendant" | "related";

export interface ViewNode {
  id: string;
  role: NodeRole;
  kind: "file" | "module";
  /** Neighbors (children, links, backlinks) not drawn. */
  hidden: number;
}

export interface ViewEdge {
  source: string;
  target: string;
  kind: "parent" | "link";
}

export interface GraphView {
  focus: string;
  nodes: ViewNode[];
  edges: ViewEdge[];
  problems: string[];
}

export interface PruneOptions {
  depth: number;
  budget: number;
}

export const DEFAULT_PRUNE: PruneOptions = { depth: 2, budget: 60 };

function neighbors(index: GraphIndex, id: string): string[] {
  const doc = index.docs.get(id);
  return [...(index.children.get(id) ?? []),
    ...(doc?.links ?? []).filter((l) => index.docs.has(l)),
    ...(index.backlinks.get(id) ?? [])];
}

/** Selects the nodes and edges to draw around `focus`. */
export function prune(index: GraphIndex, focus: string,
  opts: PruneOptions = DEFAULT_PRUNE): GraphView {
  const shown = new Map<string, NodeRole>([[focus, "focus"]]);
  for (const a of ancestorsOf(index, focus).chain) shown.set(a, "ancestor");
  let frontier = [focus];
  for (let level = 0; level < opts.depth; level++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const c of index.children.get(id) ?? []) {
        if (shown.size >= opts.budget) break;
        if (!shown.has(c)) {
          shown.set(c, "descendant");
          next.push(c);
        }
      }
    }
    frontier = next.sort();
  }
  for (const id of [...shown.keys()]) {
    const doc = index.docs.get(id);
    const refs = [...(doc?.links ?? []), ...(index.backlinks.get(id) ?? [])];
    for (const r of refs.filter((x) => index.docs.has(x)).sort()) {
      if (shown.size >= opts.budget) break;
      if (!shown.has(r)) shown.set(r, "related");
    }
  }
  return { focus, nodes: [...shown].map(([id, role]) => ({
    id, role, kind: isFileWise(id) ? "file" : "module",
    hidden: new Set(neighbors(index, id).filter((n) => !shown.has(n))).size,
  })), edges: edgesFor(index, shown), problems: index.problems };
}

function edgesFor(index: GraphIndex, shown: Map<string, NodeRole>):
  ViewEdge[] {
  const edges: ViewEdge[] = [];
  const pairs = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  for (const id of [...shown.keys()].sort()) {
    const parent = index.docs.get(id)?.parent;
    if (parent && shown.has(parent)) {
      edges.push({ source: parent, target: id, kind: "parent" });
      pairs.add(key(parent, id));
    }
  }
  for (const id of [...shown.keys()].sort()) {
    for (const t of index.docs.get(id)?.links ?? []) {
      if (!shown.has(t) || pairs.has(key(id, t))) continue;
      pairs.add(key(id, t));
      edges.push({ source: id, target: t, kind: "link" });
    }
  }
  return edges;
}
