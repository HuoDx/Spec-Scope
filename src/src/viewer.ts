/**
 * @fileoverview `CustomTextEditorProvider` that makes the paired view the
 * default editor for `*.spec.md`. "Open as Text" reopens the same file in
 * VS Code's ordinary text editor for spec editing.
 *
 * A custom *text* editor is used (rather than a read-only custom editor) so
 * the provider observes the spec's live, possibly unsaved, TextDocument.
 */
import * as vscode from "vscode";
import { PairedView, ViewerDeps } from "./pairedView";

export class PairedViewProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "specScope.pairedView";

  constructor(private readonly deps: ViewerDeps) {}

  resolveCustomTextEditor(doc: vscode.TextDocument,
    panel: vscode.WebviewPanel): void {
    new PairedView(doc, panel, this.deps);
  }
}
