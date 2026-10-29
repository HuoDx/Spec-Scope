/**
 * @fileoverview In-editor integration check, run inside a real VS Code by
 * `scripts/itest.js`. Verifies what unit tests cannot: activation in the
 * Electron extension host, the three secondary-sidebar tab containers,
 * `node:sqlite` and the ESM Pi SDK loading there,
 * clear model-configuration errors, and that the paired view opens the
 * untouched native source editor beside the rendered spec.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

async function until(cond: () => boolean, ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function run(): Promise<void> {
  const ext = vscode.extensions.getExtension("spec-scope.spec-scope");
  assert.ok(ext, "extension present");
  await ext.activate();
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const dbFile = path.join(root, ".spec-scope", "spec-scope.sqlite");
  assert.ok(fs.existsSync(dbFile), "SQLite opened in the extension host");
  const cmds = await vscode.commands.getCommands(true);
  for (const c of ["specScope.exportTrace", "specScope.annotateFile"]) {
    assert.ok(cmds.includes(c), `${c} registered`);
  }
  // One secondary-sidebar container per tab, so each opens on its own.
  for (const id of ["Coder", "Annotations", "Graph"]) {
    const show = `workbench.view.extension.specScope${id}`;
    assert.ok(cmds.includes(show), `${show} container registered`);
    await vscode.commands.executeCommand(show);
  }

  const pi = await import("@earendil-works/pi-coding-agent");
  assert.equal(typeof pi.createAgentSession, "function", "Pi SDK loads");

  // The workspace config names a nonexistent provider, so the job must
  // fail fast with a clear configuration message (no LLM call is made).
  await vscode.commands.executeCommand("specScope.annotateFile",
    "src/a.ts");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbFile);
  let error = "";
  await until(() => {
    const row = db.prepare(`SELECT json_extract(payload, '$.message') AS m
      FROM events WHERE kind = 'error' LIMIT 1`).get() as
      { m: string } | undefined;
    error = row?.m ?? "";
    return !!error;
  });
  assert.match(error, /Unknown Pi provider "no-such-provider"/);
  db.close();

  const source = path.join(root, "src", "a.ts");
  const before = fs.readFileSync(source, "utf8");
  await vscode.commands.executeCommand("vscode.openWith",
    vscode.Uri.file(path.join(root, "src", "a.spec.md")),
    "specScope.pairedView");
  await until(() => vscode.window.visibleTextEditors.some((e) =>
    e.document.uri.fsPath === source));
  const editor = vscode.window.visibleTextEditors.find((e) =>
    e.document.uri.fsPath === source)!;
  assert.equal(editor.document.isDirty, false, "source not modified");
  assert.equal(editor.document.getText(), before, "source text unchanged");
  assert.equal(editor.viewColumn, vscode.ViewColumn.Two, "opened beside");
  console.log("SPEC SCOPE INTEGRATION: all checks passed");
}
