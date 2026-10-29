/**
 * @fileoverview Extension entry point: wires settings, SQLite, the job
 * service, both Pi roles, the three sidebar tabs, the spec/source pair
 * layout, and commands. See extension.spec.md for the module map and data flow.
 *
 * Activation is cheap: the database opens synchronously, while the Pi SDK
 * loads lazily on the first Coder prompt or Annotator job.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { createAnnotatorRunner, disposeAnnotators } from "./annotator";
import { AnnotationsView } from "./annotationsView";
import { CoderAgent } from "./coder";
import { CoderView } from "./coderView";
import { registerCommands } from "./commands";
import { maxParallel, readRole, resolveRoot } from "./config";
import { Db, openWorkspaceDb } from "./db";
import { disposeDecorations } from "./editorPane";
import { GraphView } from "./graphView";
import { JobService } from "./jobs";
import { PairLayout } from "./pairLayout";
import { markAbandoned } from "./queries";
import { newRunId, Trace } from "./trace";

export async function activate(ctx: vscode.ExtensionContext):
  Promise<void> {
  const root = await resolveRoot();
  if (!root) {
    void vscode.window.showWarningMessage("Spec Scope needs an open " +
      "workspace folder (or specScope.workspaceRoot).");
    return;
  }
  const ext = ctx.extensionUri;
  const promptsDir = path.join(ext.fsPath, "prompts");
  const db = openWorkspaceDb(root);
  const trace = new Trace(db, newRunId());
  const version = (ctx.extension.packageJSON as { version: string }).version;
  trace.record("service", "run_start", { version,
    workspace: path.basename(root) });
  const interrupted = markAbandoned(db);
  if (interrupted.length) {
    trace.record("service", "interrupted", { jobs: interrupted });
  }

  const changes = new vscode.EventEmitter<void>();
  const jobs = new JobService({ root, db, trace, maxParallel,
    changed: () => changes.fire(),
    runAnnotator: createAnnotatorRunner({ root, promptsDir, trace,
      role: () => readRole("annotator") }) });
  const coderView = new CoderView(ext);
  const coder = new CoderAgent({ root, promptsDir, trace,
    role: () => readRole("coder"), submit: (p) => jobs.submit(p, "coder"),
    emit: (e) => coderView.post(e) });
  coderView.agent = coder;
  const pairs = new PairLayout({ root, db, changes: changes.event });
  ctx.subscriptions.push(changes, pairs,
    ...registerViews({ ext, root, db, jobs, coder, coderView, changes }),
    ...registerCommands({ root, db, jobs, trace, pairs }),
    { dispose: () => {
      coder.dispose();
      disposeAnnotators();
      disposeDecorations();
      trace.record("service", "run_end", {});
      db.close();
    } });
}

interface Wiring {
  ext: vscode.Uri;
  root: string;
  db: Db;
  jobs: JobService;
  coder: CoderAgent;
  coderView: CoderView;
  changes: vscode.EventEmitter<void>;
}

/** Registers the three sidebar tabs and the watchers behind them. */
function registerViews(w: Wiring): vscode.Disposable[] {
  const annotations = new AnnotationsView(w.db, w.jobs);
  const graph = new GraphView(w.ext, vscode.Uri.file(w.root));
  const md = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(w.root, "**/*.md"));
  const retain = { webviewOptions: { retainContextWhenHidden: true } };
  return [
    vscode.window.registerWebviewViewProvider(CoderView.id, w.coderView,
      retain),
    vscode.window.createTreeView(AnnotationsView.id,
      { treeDataProvider: annotations }),
    vscode.window.registerWebviewViewProvider(GraphView.id, graph),
    w.changes.event(() => annotations.refresh()),
    md, md.onDidChange(() => graph.invalidate()),
    md.onDidCreate(() => graph.invalidate()),
    md.onDidDelete(() => graph.invalidate()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("specScope.coder")) {
        void w.coder.settingsChanged();
      }
      if (e.affectsConfiguration("specScope.maxParallelAnnotators")) {
        w.jobs.queue.pump();
      }
      if (e.affectsConfiguration("specScope")) annotations.refresh();
    }),
  ];
}

export function deactivate(): void {
  // Cleanup runs through ctx.subscriptions (see the final disposable).
}
