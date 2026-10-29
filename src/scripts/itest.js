// Runs test/integration/suite.ts inside a real VS Code with an isolated
// profile and a throwaway workspace. Usage (after `npm run compile`):
//   VSCODE_BIN="/Applications/Visual Studio Code.app/Contents/MacOS/Code" \
//     node scripts/itest.js
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bin = process.env.VSCODE_BIN ||
  "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
const ext = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spec-scope-itest-"));
const ws = path.join(tmp, "ws");
const files = {
  "src/a.ts": "export function add(a: number, b: number) {\n" +
    "  return a + b;\n}\n",
  "src/a.spec.md": "# Add\n\nParent: [App](../app.md)\n\n" +
    "## Contract\nReturns the sum of two numbers.\n",
  "app.md": "# App\n",
  ".vscode/settings.json": JSON.stringify({
    "specScope.annotator.provider": "no-such-provider",
    "specScope.annotator.model": "none",
  }),
};
for (const [rel, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true });
  fs.writeFileSync(path.join(ws, rel), text);
}
const suite = path.join(ext, "out", "test", "integration", "suite.js");
// This shell may run inside VS Code, which sets ELECTRON_RUN_AS_NODE.
const env = { ...process.env, ELECTRON_RUN_AS_NODE: "" };
const r = spawnSync(bin, [
  ws, "--disable-extensions", "--disable-workspace-trust",
  "--skip-welcome", "--skip-release-notes", "--new-window",
  `--user-data-dir=${path.join(tmp, "user")}`,
  `--extensions-dir=${path.join(tmp, "exts")}`,
  `--extensionDevelopmentPath=${ext}`,
  `--extensionTestsPath=${suite}`,
], { stdio: "inherit", env });
process.exit(r.status ?? 1);
