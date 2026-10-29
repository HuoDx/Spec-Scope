/**
 * @fileoverview Editor, document, and job events that drive one paired
 * view. Spec edits re-render the Markdown; source edits (saved or not)
 * re-evaluate staleness; native editor scrolling and mouse selection feed
 * the sync controller; job changes reload mapping rows.
 */
import * as vscode from "vscode";
import type { PairedView } from "./pairedView";

/** Subscribes the view to editor, document, and job events. */
export function listen(v: PairedView): vscode.Disposable[] {
  const timers = new Map<string, NodeJS.Timeout>();
  const later = (key: string, fn: () => void) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(fn, 200));
  };
  const isSource = (d: vscode.TextDocument) =>
    d.uri.toString() === v.code?.uri.toString();
  return [
    { dispose: () => timers.forEach((t) => clearTimeout(t)) },
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === v.doc) later("html", () => void v.renderHtml());
      else if (isSource(e.document)) later("maps", () => v.renderMappings());
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
      const top = e.visibleRanges[0]?.start.line;
      if (isSource(e.textEditor.document) && top !== undefined) {
        v.sync.scrolled("code", top + 1);
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (!isSource(e.textEditor.document) ||
        e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) return;
      const m = v.sync.focus("code", e.selections[0].active.line + 1);
      if (m) v.setFocus(m);
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => v.paint()),
    v.deps.changes(() => later("maps", () => v.renderMappings())),
  ];
}
