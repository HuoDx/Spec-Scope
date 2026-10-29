/**
 * @fileoverview Editor, document, and job events that drive one paired
 * view. Edits to either document (saved or not) and job changes reload
 * the mapping set; native scrolling and mouse clicks feed scroll sync.
 * Uses only the view's public methods.
 */
import * as vscode from "vscode";
import type { PairedView } from "./pairedView";

/** Subscribes `v` to editor, document, and job events. */
export function listen(v: PairedView, changes: vscode.Event<void>):
  vscode.Disposable[] {
  let timer: NodeJS.Timeout | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => v.refresh(), 200);
  };
  return [
    { dispose: () => clearTimeout(timer) },
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (v.sideOf(e.document)) later();
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      const side = v.sideOf(e.textEditor.document);
      const top = e.visibleRanges[0]?.start.line;
      if (side && top !== undefined) v.scrolled(side, top + 1);
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      const side = v.sideOf(e.textEditor.document);
      if (side && e.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
        v.clicked(side, e.selections[0].active.line + 1);
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => v.paint()),
    changes(later),
  ];
}
