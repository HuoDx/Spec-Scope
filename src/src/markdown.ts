/**
 * @fileoverview Markdown link extraction and workspace path resolution.
 *
 * Specs link to each other with ordinary, Git-friendly Markdown links. Two
 * line-leading forms carry meaning:
 *
 *   Parent: [Expression Engine](../engine.md)   -> intent backbone edge
 *   Source: [parser.ts](./parser.ts)            -> explicit source pairing
 *
 * Every other relative link is a secondary cross-reference. External links,
 * pure anchors, and paths escaping the workspace are ignored. Pure functions
 * only; all paths are workspace-relative POSIX strings.
 */
import * as posix from "node:path/posix";

export type LinkKind = "parent" | "source" | "link";

export interface MdLink {
  kind: LinkKind;
  text: string;
  /** Raw target as written, e.g. `../engine.md#intro`. */
  target: string;
  /** 1-based line of the link. */
  line: number;
}

const LINK = /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const LEAD = /^\s*(?:[-*]\s+)?\**(Parent|Source)\**\s*:\**\s*\[/i;
const FENCE = /^\s*(```|~~~)/;

/**
 * Extracts links outside fenced code blocks. The first link on a line that
 * starts with `Parent:` or `Source:` gets that kind; images are skipped.
 */
export function parseLinks(md: string): MdLink[] {
  const links: MdLink[] = [];
  let fence: string | undefined;
  md.split(/\r\n|\r|\n/).forEach((text, i) => {
    const f = FENCE.exec(text);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1] === fence) fence = undefined;
      return;
    }
    if (fence) return;
    const lead = LEAD.exec(text)?.[1]?.toLowerCase() as LinkKind | undefined;
    let first = true;
    for (const m of text.matchAll(LINK)) {
      if (m[1] === "!") continue;
      const kind: LinkKind = first && lead ? lead : "link";
      links.push({ kind, text: m[2], target: m[3], line: i + 1 });
      first = false;
    }
  });
  return links;
}

/**
 * Resolves a link target written in `fromPath` to a normalized
 * workspace-relative path, or `undefined` for external links, pure anchors,
 * and paths outside the workspace. A leading `/` means workspace root.
 */
export function resolveTarget(fromPath: string, target: string):
  string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
    return undefined;
  }
  let t = target.replace(/[#?].*$/, "");
  if (!t) return undefined;
  try {
    t = decodeURIComponent(t);
  } catch {
    // Keep the raw target when it is not valid percent-encoding.
  }
  const joined = t.startsWith("/")
    ? posix.normalize(t.slice(1))
    : posix.join(posix.dirname(fromPath), t);
  const out = posix.normalize(joined);
  if (out === "." || out.startsWith("../") || out === "..") return undefined;
  return out;
}

/** The first link of `kind`, resolved; `raw` is kept for error messages. */
export function findLink(fromPath: string, md: string, kind: LinkKind):
  { raw: string; path: string | undefined } | undefined {
  const link = parseLinks(md).find((l) => l.kind === kind);
  if (!link) return undefined;
  return { raw: link.target, path: resolveTarget(fromPath, link.target) };
}
