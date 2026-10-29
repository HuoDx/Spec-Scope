/**
 * @fileoverview Shared HTML shell for Spec Scope webviews.
 *
 * Every webview gets a strict Content-Security-Policy: only nonce'd scripts
 * shipped in `media/` (and vendored D3) run, so Markdown or tool output that
 * contains HTML cannot execute. Styling uses VS Code theme variables only.
 */
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

/** Local resource roots a Spec Scope webview may load from. */
export function webviewRoots(ext: vscode.Uri): vscode.Uri[] {
  return [vscode.Uri.joinPath(ext, "media"),
    vscode.Uri.joinPath(ext, "node_modules", "d3", "dist")];
}

/** Builds a themed page that loads `scripts` (paths relative to ext). */
export function shell(webview: vscode.Webview, ext: vscode.Uri,
  scripts: string[], body: string): string {
  const nonce = randomBytes(16).toString("base64");
  const uri = (p: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(ext, ...p.split("/")));
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
  ].join("; ");
  const tags = scripts.map((s) =>
    `<script nonce="${nonce}" src="${uri(s)}"></script>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri("media/style.css")}">
</head><body>${body}
${tags}
</body></html>`;
}
