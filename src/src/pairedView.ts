/**
 * @fileoverview One spec/source pair: both documents in VS Code's native
 * editors, painted with paired colors and kept in semantic scroll sync.
 * See pairedView.spec.md for the collaboration contract.
 *
 * Which editors are on screen is `pairLayout.ts`'s job; this class only
 * decorates and scrolls whatever editors of the pair are visible. Both
 * documents are left exactly as they are.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { Db } from "./db";
import { EditorPane } from "./editorPane";
import { paintPlan, Stroke } from "./paint";
import { listen } from "./pairedEvents";
import { loadPair, PairModel } from "./pairState";
import { PairStatus } from "./pairStatus";
import { Mapping, Side, SyncController } from "./sync";

export interface PairDeps {
  root: string;
  db: Db;
  /** Fires whenever job or mapping state changes. */
  changes: vscode.Event<void>;
}

export class PairedView implements vscode.Disposable {
  readonly spec: EditorPane;
  source?: EditorPane;
  private readonly specPath: string;
  private readonly sync: SyncController;
  private readonly status = new PairStatus();
  private readonly subs: vscode.Disposable[];
  private model: PairModel = { state: { status: "none", detail: "" },
    maps: [] };
  private plans: Record<Side, Stroke[]> = { spec: [], code: [] };
  private focused?: Mapping;

  constructor(specUri: vscode.Uri, private readonly deps: PairDeps) {
    this.spec = new EditorPane(specUri);
    this.specPath = this.rel(specUri);
    this.sync = new SyncController({
      spec: { reveal: (s, e) => this.spec.reveal(s, e) },
      code: { reveal: (s, e) => this.source?.reveal(s, e) },
    });
    this.refresh();
    this.subs = listen(this, deps.changes);
  }

  /** Reloads source resolution, mapping rows, and trust; repaints. */
  refresh(): void {
    const { root, db } = this.deps;
    this.model = loadPair(db, root, this.specPath, (rel) =>
      vscode.workspace.textDocuments.find((d) =>
        this.rel(d.uri) === rel)?.getText());
    const src = this.model.sourcePath;
    const uri = src && vscode.Uri.file(path.join(root, src));
    if (uri?.toString() !== this.source?.uri.toString()) {
      this.source?.decorate([], [], false);
      this.source = uri ? new EditorPane(uri) : undefined;
    }
    const maps = this.model.maps;
    this.sync.setMappings(maps);
    if (!maps.some((m) => m.id === this.focused?.id)) {
      this.focused = undefined;
    }
    this.plans = { spec: paintPlan(maps, "spec"),
      code: paintPlan(maps, "code") };
    this.paint();
    this.status.show(this.model);
  }

  /** Repaints both sides (e.g. when an editor becomes visible). */
  paint(): void {
    const { maps, state } = this.model;
    const draft = state.status !== "current";
    const f = this.focused;
    this.spec.decorate(this.plans.spec, maps, draft,
      f && [f.specStart, f.specEnd]);
    this.source?.decorate(this.plans.code, maps, draft,
      f && [f.codeStart, f.codeEnd]);
  }

  /** Which side `doc` is on, if it belongs to this pair. */
  sideOf(doc: vscode.TextDocument): Side | undefined {
    const uri = doc.uri.toString();
    if (uri === this.spec.uri.toString()) return "spec";
    return uri === this.source?.uri.toString() ? "code" : undefined;
  }

  scrolled(side: Side, topLine: number): void {
    this.sync.scrolled(side, topLine);
  }

  /** A click on `line` focuses the innermost mapping there, if any. */
  clicked(side: Side, line: number): void {
    const m = this.sync.focus(side, line);
    if (!m) return;
    this.focused = m;
    this.paint();
  }

  dispose(): void {
    this.subs.forEach((s) => s.dispose());
    this.spec.decorate([], [], false);
    this.source?.decorate([], [], false);
    this.status.dispose();
  }

  private rel(uri: vscode.Uri): string {
    return path.relative(this.deps.root, uri.fsPath).split(path.sep)
      .join("/");
  }
}
