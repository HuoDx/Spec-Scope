// Embeds the repository's coder.md (the user's engineering rules) into the
// extension as prompts/coder.md, the verbatim text appended to the Coder's
// system prompt. When a repository-root coder.md exists it is the source of
// truth and is copied here; otherwise prompts/coder.md is used as is. The
// copy exists so a packaged extension works outside this repository.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const source = path.join(__dirname, "..", "..", "coder.md");
const target = path.join(__dirname, "..", "prompts", "coder.md");
if (fs.existsSync(source)) {
  fs.copyFileSync(source, target);
} else if (!fs.existsSync(target)) {
  console.error(`sync-prompts: neither ${source} nor ${target} exists.`);
  process.exit(1);
}
