/**
 * @fileoverview Immutable revision snapshots of a source/spec pair.
 *
 * `submit_file` captures the exact text an Annotator will map, plus hashes
 * that later decide whether its result still describes the files on disk.
 * The texts live only in memory for the job's lifetime; SQLite keeps hashes.
 */
import { createHash } from "node:crypto";
import { ancestry, readText, specForSource } from "./specs";

/** Content hashes identifying one source/spec/ancestry revision. */
export interface Revision {
  sourceHash: string;
  specHash: string;
  ancestryHash: string;
}

/** True when a job row was taken from exactly the revision `rev`. */
export function sameRevision(job: { source_hash: string; spec_hash: string;
  ancestry_hash: string }, rev: Revision): boolean {
  return job.source_hash === rev.sourceHash &&
    job.spec_hash === rev.specHash &&
    job.ancestry_hash === rev.ancestryHash;
}

export interface Snapshot {
  sourcePath: string;
  specPath: string;
  source: string;
  spec: string;
  /** `Parent:` chain of the spec, nearest first. */
  ancestors: { path: string; content: string }[];
  /** Broken parent links or cycles found while resolving ancestry. */
  problems: string[];
  rev: Revision;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Hash over the ancestor chain. Problems are included so that fixing a
 * broken `Parent:` link also yields a new revision.
 */
export function ancestryHash(chain: { path: string; content: string }[],
  problems: string[]): string {
  const parts = chain.map((a) => `${a.path}\0${a.content}`);
  return sha256([...parts, ...problems].join("\0\0"));
}

/** Splits text into the lines that annotation ranges index (1-based). */
export function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Current revision of a pair, computed from disk. Throws PairError. */
export function takeSnapshot(root: string, sourcePath: string): Snapshot {
  const specPath = specForSource(root, sourcePath);
  const source = readText(root, sourcePath);
  const spec = readText(root, specPath);
  const { chain, problems } = ancestry(root, specPath);
  return {
    sourcePath, specPath, source, spec, ancestors: chain, problems,
    rev: {
      sourceHash: sha256(source),
      specHash: sha256(spec),
      ancestryHash: ancestryHash(chain, problems),
    },
  };
}

/** True when the pair on disk still hashes to `snap`'s revision. */
export function isFresh(root: string, snap: Snapshot): boolean {
  try {
    const cur = takeSnapshot(root, snap.sourcePath);
    return cur.specPath === snap.specPath &&
      cur.rev.sourceHash === snap.rev.sourceHash &&
      cur.rev.specHash === snap.rev.specHash &&
      cur.rev.ancestryHash === snap.rev.ancestryHash;
  } catch {
    return false;
  }
}
