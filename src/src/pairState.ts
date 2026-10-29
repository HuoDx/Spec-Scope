/**
 * @fileoverview Which mapping set a paired view shows, and how trustworthy
 * it is right now.
 *
 *   current - the published job's hashes match the live text (including
 *             unsaved editor content) and the spec's ancestry on disk.
 *   stale   - a published job exists but the text changed since; its rows
 *             are shown provisionally and line numbers are NOT shifted.
 *   draft   - nothing published yet, but a job is running; its rows so far
 *             are shown provisionally.
 *   none    - nothing to show.
 */
import { Db } from "./db";
import { ancestryHash, Revision, sameRevision, sha256 } from "./snapshot";
import { ancestry, readText } from "./specs";
import { getJob, getPair } from "./store";

export type ViewStatus = "current" | "stale" | "draft" | "none";

export interface PairState {
  status: ViewStatus;
  /** Job whose rows are shown, if any. */
  jobId?: string;
  /** One-line human explanation for the toolbar. */
  detail: string;
}

/** Computes the view state of `sourcePath` against the live revision. */
export function pairState(db: Db, sourcePath: string, live: Revision):
  PairState {
  const pair = getPair(db, sourcePath);
  const desired = pair?.desired_job ? getJob(db, pair.desired_job) :
    undefined;
  const busy = desired && (desired.state === "running" ||
    desired.state === "queued") && desired.id !== pair?.current_job;
  const note = busy ? ` · re-annotation ${desired.state}` : "";
  const current = pair?.current_job ? getJob(db, pair.current_job) :
    undefined;
  if (current) {
    if (sameRevision(current, live)) {
      return { status: "current", jobId: current.id,
        detail: `Current (${current.id})${note}` };
    }
    return { status: "stale", jobId: current.id, detail: "Stale: the " +
      "source, spec, or parent chain changed since annotation (unsaved " +
      `edits count). Shown provisionally${note}.` };
  }
  if (desired?.state === "running") {
    return { status: "draft", jobId: desired.id,
      detail: "Draft: annotation in progress; rows are provisional." };
  }
  const why = desired ? `Last job ${desired.state}.` :
    "Not annotated yet.";
  return { status: "none", detail: `${why} Use Re-annotate, or let the ` +
    "Coder call submit_file." };
}

/**
 * The revision the user is looking at: unsaved editor text counts for the
 * spec and (when given) the source; otherwise the source is read from disk.
 * The parent chain is read from disk.
 */
export function liveRevision(root: string, specPath: string,
  specText: string, sourcePath: string, sourceText?: string): Revision {
  let source = sourceText;
  try {
    source ??= readText(root, sourcePath);
  } catch {
    source = ""; // A deleted source never matches the published hash.
  }
  const { chain, problems } = ancestry(root, specPath);
  return { sourceHash: sha256(source), specHash: sha256(specText),
    ancestryHash: ancestryHash(chain, problems) };
}
