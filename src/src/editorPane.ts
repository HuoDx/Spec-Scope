/**
 * @fileoverview One native editor of a pair (the spec or its source), as
 * the paired view sees it.
 *
 * Capabilities are deliberately limited to `revealRange` and editor
 * decorations: text, line order, whitespace, and formatting are never
 * touched. Colors mark correspondence (same palette index on both sides),
 * not quality. What to paint comes from `paint.ts`.
 */
import * as vscode from "vscode";
import type { Stroke } from "./paint";
import type { Mapping, Pane } from "./sync";

/** Paired translucent hues (RGB), one per color group. */
export const PALETTE = ["66,153,225", "72,187,120", "237,137,54",
  "159,122,234", "236,72,153", "56,178,172", "214,158,46", "245,101,101"];

export function colorOf(group: number): string {
  return PALETTE[group % PALETTE.length];
}

const types = new Map<string, vscode.TextEditorDecorationType>();

/** A thin vertical gutter bar in `color`, as an inline SVG. */
function bar(color: string): vscode.Uri {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" ` +
    `height="20"><rect x="1" width="3" height="20" fill="rgb(${color})"` +
    ` fill-opacity="0.8"/></svg>`;
  return vscode.Uri.parse("data:image/svg+xml;base64," +
    Buffer.from(svg).toString("base64"));
}

/** Decoration type per color, stroke kind, and trust, created once. */
function typeFor(color: string, kind: Stroke["kind"], provisional: boolean):
  vscode.TextEditorDecorationType {
  const key = `${color}|${kind}|${provisional}`;
  let t = types.get(key);
  if (!t) {
    t = vscode.window.createTextEditorDecorationType(kind === "bar" ?
      { gutterIconPath: bar(color), gutterIconSize: "auto" } : {
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

/** Hover text for a painted line: both ranges plus the Annotator note. */
function hover(m: Mapping): vscode.MarkdownString {
  const md = new vscode.MarkdownString(`**Spec Scope** · spec ` +
    `${m.specStart}–${m.specEnd} ↔ code ${m.codeStart}–${m.codeEnd}`);
  if (m.note) md.appendText(`\n\n${m.note}`);
  return md;
}

export class EditorPane implements Pane {
  constructor(readonly uri: vscode.Uri) {}

  /** The visible native editor for this document, if any. */
  editor(): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find((e) =>
      e.document.uri.toString() === this.uri.toString());
  }

  reveal(start: number, end: number): void {
    const ed = this.editor();
    if (!ed) return;
    ed.revealRange(this.range(ed, start, Math.max(start, end)),
      vscode.TextEditorRevealType.AtTop);
  }

  /** Paints `strokes`; `focus` outlines one line range. */
  decorate(strokes: Stroke[], maps: Mapping[], provisional: boolean,
    focus?: [number, number]): void {
    const ed = this.editor();
    if (!ed) return;
    const byId = new Map(maps.map((m) => [m.id, m]));
    const byType = new Map<vscode.TextEditorDecorationType,
      vscode.DecorationOptions[]>();
    for (const t of types.values()) byType.set(t, []);
    for (const s of strokes) {
      const t = typeFor(colorOf(s.group), s.kind, provisional);
      const m = byId.get(s.id);
      const list = byType.get(t) ?? [];
      list.push({ range: this.range(ed, s.start, s.end),
        hoverMessage: s.kind === "fill" && m ? hover(m) : undefined });
      byType.set(t, list);
    }
    for (const [t, opts] of byType) ed.setDecorations(t, opts);
    ed.setDecorations(focusType,
      focus ? [this.range(ed, focus[0], focus[1])] : []);
  }

  private range(ed: vscode.TextEditor, start: number, end: number):
    vscode.Range {
    return ed.document.validateRange(new vscode.Range(start - 1, 0,
      end - 1, Number.MAX_SAFE_INTEGER));
  }
}
