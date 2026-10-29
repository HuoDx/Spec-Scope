/**
 * @fileoverview Status bar item of the pair on screen: whether its
 * mappings are current, stale, draft, or absent, with a click to
 * re-annotate. Replaces the old webview toolbar.
 */
import * as vscode from "vscode";
import type { PairModel } from "./pairState";

const ICON = { current: "$(pass)", stale: "$(warning)",
  draft: "$(sync~spin)", none: "$(circle-slash)" };

export class PairStatus implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left, 50);

  show({ state, sourcePath }: PairModel): void {
    this.item.text = `${ICON[state.status]} Spec Scope: ${state.status}`;
    this.item.tooltip = state.detail +
      (sourcePath ? "\n\nClick to re-annotate." : "");
    this.item.command = sourcePath ? { title: "Re-annotate",
      command: "specScope.annotateFile", arguments: [sourcePath] } :
      undefined;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
