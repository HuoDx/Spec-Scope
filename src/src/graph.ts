/**
 * @fileoverview Spec link index: forward links, backlinks, and the
 * `Parent:` intent backbone, plus hierarchy problems.
 *
 * Input is one {@link SpecDoc} per workspace Markdown file (built by the
 * Graph view from `parseLinks`). Parents come only from explicit `Parent:`
 * links; an ordinary reference never implies hierarchy. Pure functions.
 */
import { MdLink, resolveTarget } from "./markdown";
import { SPEC_SUFFIX } from "./specs";

export interface SpecDoc {
  /** Workspace-relative path; also the stable graph node ID. */
  path: string;
  /** Resolved `Parent:` target, when present and inside the workspace. */
  parent?: string;
  /** Raw `Parent:` target, kept to report broken links. */
  parentRaw?: string;
  /** Resolved ordinary links to other Markdown files, deduplicated. */
  links: string[];
}

export interface GraphIndex {
  docs: Map<string, SpecDoc>;
  /** Parent -> children (valid `Parent:` edges only), sorted. */
  children: Map<string, string[]>;
  /** Target -> sources of ordinary links, sorted. */
  backlinks: Map<string, string[]>;
  /** Broken parent links and hierarchy cycles, for display. */
  problems: string[];
}

/** Builds a {@link SpecDoc} from a file's parsed links. */
export function toSpecDoc(path: string, links: MdLink[]): SpecDoc {
  const parent = links.find((l) => l.kind === "parent");
  const refs = links.filter((l) => l.kind === "link")
    .map((l) => resolveTarget(path, l.target))
    .filter((t): t is string => !!t && t.endsWith(".md") && t !== path);
  return {
    path,
    parent: parent ? resolveTarget(path, parent.target) : undefined,
    parentRaw: parent?.target,
    links: [...new Set(refs)].sort(),
  };
}

/** True for file-wise specs, which open in the paired view. */
export function isFileWise(path: string): boolean {
  return path.endsWith(SPEC_SUFFIX);
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Indexes documents and reports broken parents and cycles. */
export function buildIndex(list: SpecDoc[]): GraphIndex {
  const docs = new Map(list.map((d) => [d.path, d]));
  const index: GraphIndex = { docs, children: new Map(),
    backlinks: new Map(), problems: [] };
  for (const d of [...list].sort((a, b) => a.path.localeCompare(b.path))) {
    if (d.parentRaw !== undefined && !(d.parent && docs.has(d.parent))) {
      index.problems.push(`${d.path}: broken Parent link "${d.parentRaw}"`);
    } else if (d.parent) {
      push(index.children, d.parent, d.path);
    }
    for (const t of d.links) if (docs.has(t)) push(index.backlinks, t, d.path);
  }
  for (const d of docs.keys()) {
    const cycle = ancestorsOf(index, d).cycle;
    if (cycle === d) index.problems.push(`Parent cycle through ${d}`);
  }
  return index;
}

/**
 * Valid ancestors of `path`, nearest first. Stops at a missing parent or at
 * the first repeated node, which is returned as `cycle`.
 */
export function ancestorsOf(index: GraphIndex, path: string):
  { chain: string[]; cycle?: string } {
  const chain: string[] = [];
  const seen = new Set([path]);
  let parent = index.docs.get(path)?.parent;
  while (parent && index.docs.has(parent)) {
    if (seen.has(parent)) return { chain, cycle: parent };
    seen.add(parent);
    chain.push(parent);
    parent = index.docs.get(parent)?.parent;
  }
  return { chain };
}

/** Default focus: a root spec with the most children, else the first. */
export function defaultFocus(index: GraphIndex): string | undefined {
  const roots = [...index.docs.values()]
    .filter((d) => !d.parent || !index.docs.has(d.parent))
    .map((d) => d.path)
    .sort((a, b) => (index.children.get(b)?.length ?? 0) -
      (index.children.get(a)?.length ?? 0) || a.localeCompare(b));
  return roots[0] ?? [...index.docs.keys()].sort()[0];
}
