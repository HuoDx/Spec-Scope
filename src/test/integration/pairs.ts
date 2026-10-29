/**
 * @fileoverview In-editor check of the pair layout: the spec opens in
 * column One with its source in column Two, a second pair replaces the
 * first instead of splitting the window again, and closing the spec
 * closes the source tab opened for it. Sources are never modified.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

/** `group -> [file names]` for every open text tab; empty groups omitted. */
function layout(): string[][] {
  return vscode.window.tabGroups.all.map((g) => g.tabs
    .filter((t) => t.input instanceof vscode.TabInputText)
    .map((t) => path.basename((t.input as vscode.TabInputText).uri.fsPath)))
    .filter((names) => names.length > 0);
}

async function settle(want: string[][], ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (JSON.stringify(layout()) !== JSON.stringify(want)) {
    if (Date.now() > end) {
      assert.fail(`layout ${JSON.stringify(layout())}, ` +
        `want ${JSON.stringify(want)}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function checkPairLayout(root: string): Promise<void> {
  const file = (rel: string) => vscode.Uri.file(path.join(root, rel));
  const before = fs.readFileSync(file("src/a.ts").fsPath, "utf8");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");

  await vscode.commands.executeCommand("specScope.openPaired",
    file("src/a.spec.md"));
  await settle([["a.spec.md"], ["a.ts"]]);
  const source = vscode.window.visibleTextEditors.find((e) =>
    e.document.uri.fsPath === file("src/a.ts").fsPath)!;
  assert.equal(source.viewColumn, vscode.ViewColumn.Two, "source beside");
  assert.equal(source.document.isDirty, false, "source not modified");
  assert.equal(source.document.getText(), before, "source text unchanged");

  // Like an Explorer click while the source column has focus: the new
  // spec first lands in column Two, then the layout moves it to One.
  await vscode.commands.executeCommand(
    "workbench.action.focusSecondEditorGroup");
  await vscode.commands.executeCommand("vscode.open", file("src/b.spec.md"));
  await settle([["b.spec.md"], ["b.ts"]]);

  await vscode.window.tabGroups.close(vscode.window.tabGroups.all[0].tabs);
  await settle([]);
}
