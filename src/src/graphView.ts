/**
 * @fileoverview Spec Graph sidebar tab (host side).
 *
 * Scans workspace Markdown (excluding dependencies and build output),
 * indexes links with `graph.ts`, prunes with `prune.ts`, and posts the view
 * to `media/graph.js`. Rescans on Markdown changes. Read-only: nothing here
 * edits Markdown.
 *
 * Protocol: webview -> host {type:"ready"} | {type:"focus", path} |
 * {type:"open", path}; host -> webview {type:"graph", specs, view}.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { buildIndex, defaultFocus, GraphIndex, isFileWise, toSpecDoc }
  from "./graph";
import { parseLinks } from "./markdown";
import { prune } from "./prune";
import { shell, webviewRoots } from "./webview";

export const MD_EXCLUDE = "{**/node_modules/**,**/.git/**,**/out/**," +
  "**/dist/**,**/build/**,**/.spec-scope/**,**/.vscode-test/**}";

export class GraphView implements vscode.WebviewViewProvider {
  static readonly id = "specScope.graph";
  private view?: vscode.WebviewView;
  private index?: GraphIndex;
  private focus?: string;
  private timer?: NodeJS.Timeout;

  constructor(private readonly ext: vscode.Uri,
    private readonly root: vscode.Uri) {}

  /** Debounced rescan after Markdown files change. */
  invalidate(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.rescan(), 300);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true,
      localResourceRoots: webviewRoots(this.ext) };
    view.webview.html = shell(view.webview, this.ext,
      ["node_modules/d3/dist/d3.min.js", "media/graph.js"], `
<header class="bar">
  <select id="picker" class="grow" title="Focus spec"></select>
  <button id="refocus" title="Refocus on the selected node">Refocus</button>
</header>
<div id="problems" class="problems"></div>
<svg id="graph" class="graph"></svg>`);
    view.webview.onDidReceiveMessage((m: { type: string; path?: string }) => {
      if (m.type === "ready") void this.rescan();
      else if (m.type === "focus" && m.path) this.show(m.path);
      else if (m.type === "open" && m.path) void openSpec(this.root, m.path);
    });
  }

  private async rescan(): Promise<void> {
    if (!this.view) return;
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.root, "**/*.md"), MD_EXCLUDE);
    const docs = await Promise.all(files.map(async (uri) => {
      const rel = path.relative(this.root.fsPath, uri.fsPath)
        .split(path.sep).join("/");
      const text = new TextDecoder().decode(
        await vscode.workspace.fs.readFile(uri));
      return toSpecDoc(rel, parseLinks(text));
    }));
    this.index = buildIndex(docs);
    const keep = this.focus && this.index.docs.has(this.focus);
    this.show(keep ? this.focus! : defaultFocus(this.index));
  }

  private show(focus: string | undefined): void {
    if (!this.view || !this.index || !focus) return;
    this.focus = focus;
    void this.view.webview.postMessage({ type: "graph",
      specs: [...this.index.docs.keys()].sort(),
      view: prune(this.index, focus) });
  }
}

/** File-wise specs open in the paired view; others as Markdown text. */
export async function openSpec(root: vscode.Uri, rel: string):
  Promise<void> {
  const uri = vscode.Uri.joinPath(root, rel);
  if (isFileWise(rel)) {
    await vscode.commands.executeCommand("specScope.openPaired", uri);
  } else {
    await vscode.commands.executeCommand("vscode.open", uri);
  }
}
