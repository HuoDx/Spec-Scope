/**
 * @fileoverview The native source editor, seen by the paired view.
 *
 * Capabilities are deliberately limited to `revealRange` and editor
 * decorations: the source text, line order, whitespace, and formatting are
 * never touched, and no transformed copy of the code is rendered. Colors
 * mark correspondence (same palette index as the spec side), not quality.
 */
import * as vscode from "vscode";
import type { Mapping, Pane } from "./sync";

/** Paired translucent hues (RGB), shared with the spec webview. */
export const PALETTE = ["66,153,225", "72,187,120", "237,137,54",
  "159,122,234", "236,72,153", "56,178,172", "214,158,46", "245,101,101"];

export function colorOf(group: number): string {
  return PALETTE[group % PALETTE.length];
}

const types = new Map<string, vscode.TextEditorDecorationType>();

/** Decoration type per color and style, created once and reused. */
function typeFor(color: string, provisional: boolean):
  vscode.TextEditorDecorationType {
  const key = `${color}|${provisional}`;
  let t = types.get(key);
  if (!t) {
    t = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: `rgba(${color},${provisional ? 0.07 : 0.16})`,
      border: provisional ? `1px dashed rgba(${color},0.5)` : undefined,
      overviewRulerColor: `rgba(${color},0.6)`,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    types.set(key, t);
  }
  return t;
}

const focusType = vscode.window.createTextEditorDecorationType({
  isWholeLine: true, outlineWidth: "1px", outlineStyle: "solid",
  outlineColor: new vscode.ThemeColor("focusBorder"),
});

/** Disposes all shared decoration types (extension shutdown). */
export function disposeDecorations(): void {
  for (const t of types.values()) t.dispose();
  types.clear();
  focusType.dispose();
}

export class CodePane implements Pane {
  constructor(readonly uri: vscode.Uri) {}

  /** The visible native editor for the source, if any. */
  editor(): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find((e) =>
      e.document.uri.toString() === this.uri.toString());
  }

  reveal(start: number, end: number): void {
    const ed = this.editor();
    if (!ed) return;
    const range = ed.document.validateRange(new vscode.Range(start - 1, 0,
      Math.max(start, end) - 1, 0));
    ed.revealRange(range, vscode.TextEditorRevealType.AtTop);
  }

  /** Paints mapping colors; `focus` outlines one mapping's code range. */
  decorate(maps: Mapping[], provisional: boolean, focus?: Mapping): void {
    const ed = this.editor();
    if (!ed) return;
    const byType = new Map<vscode.TextEditorDecorationType,
      vscode.Range[]>();
    for (const t of types.values()) byType.set(t, []);
    for (const m of maps) {
      const t = typeFor(colorOf(m.group), provisional);
      const list = byType.get(t) ?? [];
      list.push(this.range(ed, m));
      byType.set(t, list);
    }
    for (const [t, ranges] of byType) ed.setDecorations(t, ranges);
    ed.setDecorations(focusType, focus ? [this.range(ed, focus)] : []);
  }

  private range(ed: vscode.TextEditor, m: Mapping): vscode.Range {
    return ed.document.validateRange(new vscode.Range(m.codeStart - 1, 0,
      m.codeEnd - 1, Number.MAX_SAFE_INTEGER));
  }
}
