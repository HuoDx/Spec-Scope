/**
 * @fileoverview Coder sidebar tab (webview host side).
 *
 * Message protocol:
 *   webview -> host: {type:"prompt", text} | {type:"stop"} |
 *                    {type:"new"} | {type:"configure"} | {type:"ready"}
 *   host -> webview: CoderUiEvent (see coderEvents.ts)
 * Events emitted before the view first resolves are buffered and replayed
 * on `ready`; the view retains its DOM while hidden.
 */
import * as vscode from "vscode";
import type { CoderAgent } from "./coder";
import type { CoderUiEvent } from "./coderEvents";
import { shell, webviewRoots } from "./webview";

export class CoderView implements vscode.WebviewViewProvider {
  static readonly id = "specScope.coder";
  private view?: vscode.WebviewView;
  private ready = false;
  private backlog: CoderUiEvent[] = [];
  agent?: CoderAgent;

  constructor(private readonly ext: vscode.Uri) {}

  post(event: CoderUiEvent): void {
    if (this.view && this.ready) void this.view.webview.postMessage(event);
    else this.backlog.push(event);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.ready = false;
    view.webview.options = { enableScripts: true,
      localResourceRoots: webviewRoots(this.ext) };
    view.webview.html = shell(view.webview, this.ext, ["media/coder.js"], `
<header class="bar">
  <span id="model" class="muted">model: (starts on first message)</span>
  <span class="grow"></span>
  <button id="configure" title="Coder model settings">⚙</button>
  <button id="new" title="New session">New</button>
  <button id="stop" title="Stop the current run" disabled>Stop</button>
</header>
<main id="log" class="log" aria-live="polite"></main>
<footer class="composer">
  <textarea id="input" rows="3" placeholder="Ask the Coder… (Enter to send,
Shift+Enter for newline)"></textarea>
</footer>`);
    view.webview.onDidReceiveMessage((m: { type: string; text?: string }) => {
      if (m.type === "ready") {
        this.ready = true;
        this.backlog.splice(0).forEach((e) => this.post(e));
      } else if (m.type === "prompt" && m.text) {
        void this.agent?.prompt(m.text);
      } else if (m.type === "stop") {
        void this.agent?.stop();
      } else if (m.type === "new") {
        this.agent?.newSession();
      } else if (m.type === "configure") {
        void vscode.commands.executeCommand("specScope.configureCoder");
      }
    });
    view.onDidDispose(() => {
      this.view = undefined;
      this.ready = false;
    });
  }
}
