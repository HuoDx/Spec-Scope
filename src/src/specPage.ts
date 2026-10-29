/**
 * @fileoverview The rendered-spec webview of a paired view: page markup and
 * the webview -> host message handler.
 *
 * Protocol (host -> webview, see media/spec.js):
 *   {type:"html", html, hasSource}      rendered, line-anchored Markdown
 *   {type:"mappings", status, detail, maps:[{id,s,e,color}]}
 *   {type:"reveal", line}               scroll the spec to a spec line
 *   {type:"emphasize", id?}             outline the focused mapping
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { openSpec } from "./graphView";
import { resolveTarget } from "./markdown";
import type { PairedView } from "./pairedView";
import { shell, webviewRoots } from "./webview";

/** Messages the spec webview sends to the host. */
export type SpecMessage =
  | { type: "ready" }
  | { type: "scroll"; line: number }
  | { type: "focus"; line: number }
  | { type: "link"; href: string }
  | { type: "openText" }
  | { type: "showSource" }
  | { type: "reannotate" };

export function specPage(webview: vscode.Webview, ext: vscode.Uri): void {
  webview.options = { enableScripts: true,
    localResourceRoots: webviewRoots(ext) };
  webview.html = shell(webview, ext, ["media/spec.js"], `
<header class="bar sticky">
  <span id="status" class="badge">…</span>
  <span id="detail" class="muted grow"></span>
  <button id="reannotate" title="Annotate the current revision">
    Re-annotate</button>
  <button id="showSource" title="Show the source editor beside">
    Source</button>
  <button id="openText" title="Edit this spec as plain text">
    Open as Text</button>
</header>
<article id="content" class="spec"></article>`);
}

/** Routes one webview message to the paired view or a VS Code command. */
export function handleSpecMessage(v: PairedView, m: SpecMessage): void {
  switch (m.type) {
    case "ready":
      void v.renderHtml();
      break;
    case "scroll":
      v.sync.scrolled("spec", m.line);
      break;
    case "focus":
      v.setFocus(v.sync.focus("spec", m.line));
      break;
    case "openText":
      void vscode.commands.executeCommand("vscode.openWith", v.doc.uri,
        "default");
      break;
    case "showSource":
      void v.showSource();
      break;
    case "reannotate":
      if (v.sourcePath) {
        void vscode.commands.executeCommand("specScope.annotateFile",
          v.sourcePath);
      }
      break;
    case "link":
      void openLink(v, m.href);
      break;
  }
}

/** Opens a relative link from the spec; external links use the browser. */
async function openLink(v: PairedView, href: string): Promise<void> {
  const rel = resolveTarget(v.specPath, href);
  if (rel?.endsWith(".md")) {
    await openSpec(vscode.Uri.file(v.deps.root), rel);
  } else if (rel) {
    await vscode.commands.executeCommand("vscode.open",
      vscode.Uri.file(path.join(v.deps.root, rel)));
  } else if (/^https?:/i.test(href)) {
    await vscode.env.openExternal(vscode.Uri.parse(href));
  }
}
