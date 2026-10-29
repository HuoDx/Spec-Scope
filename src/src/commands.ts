/**
 * @fileoverview `Spec Scope: …` command implementations.
 *
 * Commands are thin: they gather a target (file, tree node, run) from the
 * UI and delegate to the job service, trace export, or settings picker.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { sourceOfNode } from "./annotationsView";
import { pickModel } from "./config";
import { Db, STATE_DIR } from "./db";
import { openSpec } from "./graphView";
import { JobService } from "./jobs";
import { specForSource } from "./specs";
import { exportRun, listRuns, Trace } from "./trace";
import { PairedViewProvider } from "./viewer";

export interface CommandDeps {
  root: string;
  db: Db;
  jobs: JobService;
  trace: Trace;
}

/** Registers every command; returns their disposables. */
export function registerCommands(d: CommandDeps): vscode.Disposable[] {
  const reg = vscode.commands.registerCommand;
  const submit = (file: string | undefined) => {
    if (!file) return;
    try {
      const r = d.jobs.submit(file, "user");
      void vscode.window.setStatusBarMessage(
        `Spec Scope: ${r.state} (${r.jobId})`, 4000);
    } catch (err) {
      void vscode.window.showErrorMessage((err as Error).message);
    }
  };
  return [
    reg("specScope.exportTrace", () => exportTrace(d)),
    reg("specScope.configureCoder", () => pickModel("coder")),
    reg("specScope.configureAnnotator", () => pickModel("annotator")),
    reg("specScope.retryJob", (node) => submit(sourceOfNode(node))),
    reg("specScope.annotateFile", (target?: string | vscode.Uri) =>
      submit(target instanceof vscode.Uri ? target.fsPath : target ??
        vscode.window.activeTextEditor?.document.uri.fsPath)),
    reg("specScope.openPaired", (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) {
        void vscode.commands.executeCommand("vscode.openWith", target,
          PairedViewProvider.viewType);
      }
    }),
    reg("specScope.openPairedForSource", (source: string) => {
      try {
        void openSpec(vscode.Uri.file(d.root), specForSource(d.root, source));
      } catch (err) {
        void vscode.window.showErrorMessage((err as Error).message);
      }
    }),
    reg("specScope.openAsText", (uri?: vscode.Uri) => {
      if (uri) void vscode.commands.executeCommand("vscode.openWith", uri,
        "default");
    }),
  ];
}

async function exportTrace(d: CommandDeps): Promise<void> {
  const runs = listRuns(d.db);
  if (runs.length === 0) {
    void vscode.window.showInformationMessage("No trace events recorded.");
    return;
  }
  const pick = runs.length === 1 ? runs[0] : (await vscode.window
    .showQuickPick(runs.map((r) => ({ label: r.run_id, run: r,
      description: `${r.events} events · from ${r.first}` +
        (r.run_id === d.trace.runId ? " · current" : "") })),
    { title: "Export which run?" }))?.run;
  if (!pick) return;
  const { active, pending } = d.jobs.queue.snapshot();
  const live = pick.run_id === d.trace.runId ? "Exported while this run " +
    `was active (${active.length} running, ${pending.length} queued).` :
    undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(d.root, STATE_DIR, "traces");
  fs.mkdirSync(dir, { recursive: true });
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(dir, `trace-${stamp}.jsonl`)),
    filters: { "JSON Lines": ["jsonl"] },
  });
  if (!target) return;
  fs.writeFileSync(target.fsPath, exportRun(d.db, pick.run_id, live));
  const open = await vscode.window.showInformationMessage(
    `Trace exported: ${path.basename(target.fsPath)}`, "Open");
  if (open) await vscode.commands.executeCommand("vscode.open", target);
}
