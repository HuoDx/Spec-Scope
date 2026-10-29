/**
 * @fileoverview Guards against prompt drift: the agent documentation and
 * the embedded coder.md must match the prompts the extension really uses.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

const EXT = path.join(__dirname, "..", "..");
const REPO = path.join(EXT, "..");
const DOCS = path.join(REPO, "spec-scope");
const read = (...p: string[]) => fs.readFileSync(path.join(...p), "utf8");

test("embedded prompts/coder.md is identical to the repository coder.md",
  (t) => {
    if (!fs.existsSync(path.join(REPO, "coder.md"))) {
      t.skip("not inside the Spec Scope repository");
      return;
    }
    assert.equal(read(EXT, "prompts", "coder.md"), read(REPO, "coder.md"));
  });

test("agent docs quote the shipped prompts verbatim", (t) => {
  if (!fs.existsSync(path.join(DOCS, "agents"))) {
    t.skip("course docs not present");
    return;
  }
  assert.ok(read(DOCS, "agents", "annotator.md")
    .includes(read(EXT, "prompts", "annotator.md")));
  assert.ok(read(DOCS, "agents", "coder.md")
    .includes(read(EXT, "prompts", "spec-rules.md")));
});
