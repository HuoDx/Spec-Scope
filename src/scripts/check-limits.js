// Enforces the project's structural limits on code files: at most 128 lines
// per file, 80 characters per line, and 64 lines per function. Function
// length is measured from a declaration line to the line that closes its
// brace at the same indentation (a heuristic matched to this code style).
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIRS = ["src", "test", "media", "scripts"];
const EXT = /\.(ts|js|css)$/;
const DECL = new RegExp("^(\\s*)(export\\s+)?(async\\s+)?(function\\b|" +
  "(private\\s+|static\\s+|async\\s+|readonly\\s+)*[\\w$]+\\s*" +
  "\\([^;]*\\)\\s*(:[^=;]*)?\\{\\s*$|.*=>\\s*\\{\\s*$)");

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : EXT.test(e.name) ? [p] : [];
  });
}

const problems = [];
for (const file of DIRS.flatMap((d) => files(path.join(ROOT, d)))) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, "utf8").replace(/\n$/, "").split("\n");
  if (lines.length > 128) problems.push(`${rel}: ${lines.length} lines`);
  lines.forEach((l, i) => {
    if (l.length > 80) problems.push(`${rel}:${i + 1}: ${l.length} chars`);
    const m = DECL.exec(l);
    if (!m) return;
    const indent = m[1];
    const end = lines.findIndex((x, j) => j > i &&
      x.startsWith(indent + "}") && !x.startsWith(indent + " "));
    if (end > 0 && end - i + 1 > 64) {
      problems.push(`${rel}:${i + 1}: function spans ${end - i + 1} lines`);
    }
  });
}
for (const p of problems) console.log(p);
process.exit(problems.length ? 1 : 0);
