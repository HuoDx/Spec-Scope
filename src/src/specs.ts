/**
 * @fileoverview Source <-> spec pairing and `Parent:` ancestry resolution.
 *
 * Pairing rules, in priority order:
 *   1. A `Source:` link in a `*.spec.md` file is the unambiguous pairing.
 *   2. Otherwise, by sibling convention: `dir/x.ts` pairs with
 *      `dir/x.spec.md` or `dir/x.ts.spec.md`, only if exactly one matches.
 * Ambiguity is reported as a {@link PairError}; nothing is ever guessed.
 * Explicit `Source:` pairing is looked up in the source's own directory,
 * matching the Coder rule that file-wise specs live beside their source.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as posix from "node:path/posix";
import { findLink } from "./markdown";

export const SPEC_SUFFIX = ".spec.md";

/** A pairing or hierarchy problem that should be shown, not guessed past. */
export class PairError extends Error {}

/** Reads a UTF-8 file without a BOM, matching VS Code's document text. */
export function readText(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8").replace(/^﻿/, "");
}

function isFile(root: string, rel: string): boolean {
  return fs.statSync(path.join(root, rel), { throwIfNoEntry: false })
    ?.isFile() ?? false;
}

function siblings(root: string, dir: string): string[] {
  return fs.readdirSync(path.join(root, dir))
    .map((name) => posix.join(dir, name))
    .filter((rel) => isFile(root, rel));
}

function sourceLink(root: string, specRel: string): string | undefined {
  return findLink(specRel, readText(root, specRel), "source")?.path;
}

/** Finds the file-wise spec for a source file or throws a PairError. */
export function specForSource(root: string, sourceRel: string): string {
  const dir = posix.dirname(sourceRel);
  const base = posix.basename(sourceRel);
  const specs = siblings(root, dir).filter((p) => p.endsWith(SPEC_SUFFIX));
  const linked = specs.filter((s) => sourceLink(root, s) === sourceRel);
  const stem = base.replace(/\.[^.]+$/, "");
  const conventional = [`${stem}${SPEC_SUFFIX}`, `${base}${SPEC_SUFFIX}`]
    .map((n) => posix.join(dir, n))
    .filter((s, i, all) => all.indexOf(s) === i && specs.includes(s))
    .filter((s) => (sourceLink(root, s) ?? sourceRel) === sourceRel);
  const found = linked.length > 0 ? linked : conventional;
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    throw new PairError(`Ambiguous specs for ${sourceRel}: ` +
      `${found.join(", ")}. Add a "Source:" link to exactly one.`);
  }
  throw new PairError(`No spec found for ${sourceRel}. Create ` +
    `${posix.join(dir, stem + SPEC_SUFFIX)} beside it.`);
}

/**
 * Finds the source file paired with a spec. Returns `undefined` for a
 * module/root spec with no direct source; throws on broken or ambiguous
 * pairings.
 */
export function sourceForSpec(root: string, specRel: string):
  string | undefined {
  const link = findLink(specRel, readText(root, specRel), "source");
  if (link) {
    if (link.path && isFile(root, link.path)) return link.path;
    throw new PairError(`Source link "${link.raw}" in ${specRel} does not ` +
      `resolve to a workspace file.`);
  }
  if (!specRel.endsWith(SPEC_SUFFIX)) return undefined;
  const stem = posix.basename(specRel).slice(0, -SPEC_SUFFIX.length);
  const found = siblings(root, posix.dirname(specRel)).filter((p) => {
    const name = posix.basename(p);
    if (name.endsWith(".md")) return false;
    if (name === stem) return true;
    const ext = name.slice(stem.length + 1);
    return name.startsWith(stem + ".") && ext.length > 0 && !ext.includes(".");
  });
  if (found.length > 1) {
    throw new PairError(`Ambiguous source for ${specRel}: ` +
      `${found.join(", ")}. Add a "Source:" link.`);
  }
  return found[0];
}

/** A spec's `Parent:` chain, nearest first, with any hierarchy problems. */
export interface Ancestry {
  chain: { path: string; content: string }[];
  problems: string[];
}

/** Follows `Parent:` links upward, stopping at broken links and cycles. */
export function ancestry(root: string, specRel: string): Ancestry {
  const result: Ancestry = { chain: [], problems: [] };
  const seen = new Set([specRel]);
  let current = specRel;
  let text = readText(root, current);
  for (;;) {
    const parent = findLink(current, text, "parent");
    if (!parent) return result;
    if (!parent.path || !isFile(root, parent.path)) {
      result.problems.push(`${current}: broken Parent link "${parent.raw}"`);
      return result;
    }
    if (seen.has(parent.path)) {
      result.problems.push(`${current}: Parent cycle via ${parent.path}`);
      return result;
    }
    seen.add(parent.path);
    current = parent.path;
    text = readText(root, current);
    result.chain.push({ path: current, content: text });
  }
}
