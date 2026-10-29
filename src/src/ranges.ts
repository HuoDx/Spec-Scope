/**
 * @fileoverview Validation of `annotate` arguments against a job snapshot.
 *
 * Errors are phrased for the model: each says what was wrong and what the
 * valid bounds are, so an Annotator can correct itself and call again.
 */
import { MappingInput } from "./store";

/** Longest accepted mapping note, in characters. */
export const MAX_NOTE = 500;

function checkPair(name: string, start: unknown, end: unknown,
  lines: number): string | undefined {
  for (const [label, v] of [[`${name}_start`, start], [`${name}_end`, end]]) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
      return `${label} must be a positive integer (1-based), got ` +
        `${JSON.stringify(v)}.`;
    }
  }
  if ((start as number) > (end as number)) {
    return `${name}_start (${start}) must be <= ${name}_end (${end}).`;
  }
  if ((end as number) > lines) {
    return `${name}_end (${end}) exceeds the ${name} snapshot, which has ` +
      `${lines} lines.`;
  }
  return undefined;
}

/**
 * Returns an error message, or `undefined` when `m` is a positive,
 * inclusive, 1-based range pair inside the snapshot's line counts.
 */
export function validateRange(m: MappingInput, specLines: number,
  codeLines: number): string | undefined {
  const err = checkPair("spec", m.spec_start, m.spec_end, specLines) ??
    checkPair("code", m.code_start, m.code_end, codeLines);
  if (err) return err;
  if (m.note !== undefined && typeof m.note !== "string") {
    return "note must be a string when provided.";
  }
  if (m.note && m.note.length > MAX_NOTE) {
    return `note must be at most ${MAX_NOTE} characters.`;
  }
  return undefined;
}
