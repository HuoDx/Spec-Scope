/**
 * @fileoverview One open `*.spec.md` paired view. See pairedView.spec.md for
 * the full collaboration contract and event flow.
 *
 * Left: the rendered spec (webview, `media/spec.js`). Right: the original
 * source in VS Code's native editor, opened beside. The two meet only
 * through `SyncController` (reveal) and `CodePane` (decorations).
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { CodePane, colorOf } from "./codePane";
import { Db } from "./db";
import { mappingsOf } from "./queries";
import { listen } from "./pairedEvents";
import { liveRevision, pairState, PairState } from "./pairState";
import { renderSpec } from "./render";
import { sourceForSpec } from "./specs";
import { handleSpecMessage, SpecMessage, specPage } from "./specPage";
import { groupMappings, Mapping, SyncController } from "./sync";

export interface ViewerDeps {
  ext: vscode.Uri;
  root: string;
  db: Db;
  /** Fires whenever job or mapping state changes. */
  changes: vscode.Event<void>;
}

export class PairedView {
  readonly specPath: string;
  sourcePath?: string;
  code?: CodePane;
  readonly sync: SyncController;
  private maps: Mapping[] = [];
  private state: PairState = { status: "none", detail: "" };
  private focused?: Mapping;
  private error?: string;

  constructor(readonly doc: vscode.TextDocument,
    readonly panel: vscode.WebviewPanel, readonly deps: ViewerDeps) {
    this.specPath = path.relative(deps.root, doc.uri.fsPath)
      .split(path.sep).join("/");
    this.sync = new SyncController({
      spec: { reveal: (s) => this.post({ type: "reveal", line: s }) },
      code: { reveal: (s, e) => this.code?.reveal(s, e) },
    });
    specPage(panel.webview, deps.ext);
    const subs = listen(this);
    subs.push(panel.webview.onDidReceiveMessage((m: SpecMessage) =>
      handleSpecMessage(this, m)));
    panel.onDidDispose(() => {
      subs.forEach((s) => s.dispose());
      this.code?.decorate([], false);
    });
  }

  post(message: object): void {
    void this.panel.webview.postMessage(message);
  }

  /** Re-renders the spec, re-resolves its source, then the mappings. */
  async renderHtml(): Promise<void> {
    try {
      this.sourcePath = sourceForSpec(this.deps.root, this.specPath);
      this.error = undefined;
    } catch (err) {
      this.sourcePath = undefined;
      this.error = (err as Error).message;
    }
    const uri = this.sourcePath &&
      vscode.Uri.file(path.join(this.deps.root, this.sourcePath));
    if (uri && this.code?.uri.toString() !== uri.toString()) {
      this.code = new CodePane(uri);
      await this.showSource();
    } else if (!uri) {
      this.code = undefined;
    }
    this.post({ type: "html", html: await renderSpec(this.doc.getText()),
      hasSource: !!this.code });
    this.renderMappings();
  }

  /** Reloads mapping rows and staleness; repaints both sides. */
  renderMappings(): void {
    if (!this.sourcePath || !this.code) {
      this.maps = [];
      this.post({ type: "mappings", status: "none", maps: [],
        detail: this.error ?? "Module spec: no direct source pair." });
      return;
    }
    const open = vscode.workspace.textDocuments.find((d) =>
      d.uri.toString() === this.code?.uri.toString());
    this.state = pairState(this.deps.db, this.sourcePath, liveRevision(
      this.deps.root, this.specPath, this.doc.getText(), this.sourcePath,
      open?.getText()));
    const rows = this.state.jobId ?
      mappingsOf(this.deps.db, this.state.jobId) : [];
    this.maps = groupMappings(rows);
    this.sync.setMappings(this.maps);
    if (!this.maps.some((m) => m.id === this.focused?.id)) {
      this.focused = undefined;
    }
    this.paint();
    this.post({ type: "mappings", status: this.state.status,
      detail: this.state.detail, maps: this.maps.map((m) => ({ id: m.id,
        s: m.specStart, e: m.specEnd, color: colorOf(m.group) })) });
  }

  /** Repaints code decorations (e.g. when the editor becomes visible). */
  paint(): void {
    this.code?.decorate(this.maps, this.state.status !== "current",
      this.focused);
  }

  setFocus(m: Mapping | undefined): void {
    this.focused = m;
    this.paint();
    this.post({ type: "emphasize", id: m?.id });
  }

  async showSource(): Promise<void> {
    if (!this.code) return;
    await vscode.window.showTextDocument(this.code.uri, { preview: false,
      viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    this.paint();
  }
}
