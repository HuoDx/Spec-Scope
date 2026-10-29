/**
 * @fileoverview Keeps at most one spec/source pair on screen: the spec in
 * editor column One and its source in column Two.
 *
 * Opening another pair (from the Explorer, the Spec Graph, the Annotations
 * tab, or a command) replaces the previous one instead of splitting the
 * window again: columns are always explicit (never `Beside`), tabs this
 * layout opened for the previous pair are closed, and a duplicate tab of
 * the spec left in another column is closed. Dirty tabs are never closed,
 * and tabs the user opened are never closed unless they duplicate the spec.
 * Closing the spec also closes the source tab opened for it.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { PairDeps, PairedView } from "./pairedView";
import { SPEC_SUFFIX } from "./specs";

const { One, Two } = vscode.ViewColumn;

/** A tab this layout opened: document URI and editor column. */
interface Owned {
  uri: string;
  column: vscode.ViewColumn;
}

const textTabs = (g: vscode.TabGroup) => g.tabs.filter((t) =>
  t.input instanceof vscode.TabInputText);
const uriOf = (t: vscode.Tab) => (t.input as vscode.TabInputText).uri
  .toString();

function findTab(o: Owned): vscode.Tab | undefined {
  const group = vscode.window.tabGroups.all.find((g) =>
    g.viewColumn === o.column);
  return group && textTabs(group).find((t) => uriOf(t) === o.uri);
}

export class PairLayout implements vscode.Disposable {
  private view?: PairedView;
  private owned: Owned[] = [];
  private busy = false;
  private readonly subs: vscode.Disposable[];

  constructor(private readonly deps: PairDeps) {
    this.subs = [
      vscode.window.onDidChangeActiveTextEditor((e) => this.activated(e)),
      vscode.window.tabGroups.onDidChangeTabs(() => this.tabsChanged()),
    ];
    this.activated(vscode.window.activeTextEditor);
  }

  /** Shows `spec` with its source beside it, replacing any other pair. */
  async open(spec: vscode.Uri): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let view = this.view;
      if (view?.spec.uri.toString() !== spec.toString()) {
        view?.dispose();
        view = this.view = new PairedView(spec, this.deps);
      }
      const keep = await this.place(spec, One, false);
      const source = view.source?.uri;
      if (source) keep.push(...await this.place(source, Two, true));
      const strays = vscode.window.tabGroups.all
        .filter((g) => g.viewColumn !== One).flatMap(textTabs)
        .filter((t) => uriOf(t) === spec.toString());
      const stale = this.owned.filter((o) => !keep.some((k) =>
        k.uri === o.uri && k.column === o.column)).map(findTab);
      this.owned = keep;
      await this.close([...strays, ...stale]);
      view.paint();
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
    this.view?.dispose();
  }

  /** Opens `uri` in `column`; returns it as owned if this layout did. */
  private async place(uri: vscode.Uri, column: vscode.ViewColumn,
    preserveFocus: boolean): Promise<Owned[]> {
    const o = { uri: uri.toString(), column };
    const existed = !!findTab(o);
    await vscode.window.showTextDocument(uri, { viewColumn: column,
      preserveFocus, preview: existed ? undefined : false });
    const mine = !existed || this.owned.some((x) =>
      x.uri === o.uri && x.column === column);
    return mine ? [o] : [];
  }

  private async close(tabs: (vscode.Tab | undefined)[]): Promise<void> {
    const ok = tabs.filter((t): t is vscode.Tab => !!t && !t.isDirty);
    if (ok.length > 0) await vscode.window.tabGroups.close(ok);
  }

  /** Auto-pairs a file-wise spec when it becomes the active editor. */
  private activated(e: vscode.TextEditor | undefined): void {
    const uri = e?.document.uri;
    if (!uri || this.busy || uri.scheme !== "file" ||
      !uri.fsPath.endsWith(SPEC_SUFFIX) ||
      path.relative(this.deps.root, uri.fsPath).startsWith("..")) return;
    const shown = this.view?.spec.uri.toString() === uri.toString();
    if (!shown || e.viewColumn !== One) void this.open(uri);
  }

  /** When the user closes the spec, the pair (and its source tab) ends. */
  private tabsChanged(): void {
    const spec = this.view?.spec.uri.toString();
    if (this.busy || !spec) return;
    const open = vscode.window.tabGroups.all.flatMap(textTabs)
      .some((t) => uriOf(t) === spec);
    if (open) return;
    this.view?.dispose();
    this.view = undefined;
    const rest = this.owned.map(findTab);
    this.owned = [];
    void this.close(rest);
  }
}
