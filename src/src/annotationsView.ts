/**
 * @fileoverview Annotations sidebar tab: a native TreeView over the live
 * queue (in memory) and job history (SQLite). Shows only real state:
 * `active K/max`, running workers and models, live mapping counts, queued
 * files, and finished jobs with their outcome. No progress estimates.
 */
import * as vscode from "vscode";
import { maxParallel, readRole } from "./config";
import { Db } from "./db";
import { JobService } from "./jobs";
import { countMappings, JobSummary, recentJobs } from "./queries";

type Node = { kind: "group"; label: string; jobs: JobSummary[] } |
  { kind: "job"; job: JobSummary } | { kind: "info"; label: string;
    description?: string };

const RETRYABLE = new Set(["failed", "stale", "interrupted", "superseded"]);
const ICONS: Record<string, string> = {
  running: "sync~spin", queued: "clock", current: "pass",
  stale: "warning", superseded: "history", failed: "error",
  interrupted: "debug-disconnect",
};

export class AnnotationsView implements vscode.TreeDataProvider<Node> {
  static readonly id = "specScope.annotations";
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private timer?: NodeJS.Timeout;

  constructor(private readonly db: Db, private readonly jobs: JobService) {}

  /** Coalesces bursts of job events (e.g. many annotate writes). */
  refresh(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.emitter.fire(), 150);
  }

  getChildren(node?: Node): Node[] {
    if (node?.kind === "group") {
      return node.jobs.map((job) => ({ kind: "job", job }));
    }
    if (node) return [];
    const { active, pending } = this.jobs.queue.snapshot();
    const all = recentJobs(this.db);
    const role = readRole("annotator");
    const model = role.provider ? `${role.provider}/${role.model}` :
      "Pi default";
    return [
      { kind: "info", label: `active ${active.length}/${maxParallel()}`,
        description: `queued ${pending.length} · next model: ${model}` },
      { kind: "group", label: "Running",
        jobs: all.filter((j) => j.state === "running") },
      { kind: "group", label: "Queued",
        jobs: all.filter((j) => j.state === "queued") },
      { kind: "group", label: "Finished", jobs: all.filter((j) =>
        j.state !== "running" && j.state !== "queued") },
    ];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "info") {
      const item = new vscode.TreeItem(node.label);
      item.description = node.description;
      item.iconPath = new vscode.ThemeIcon("pulse");
      return item;
    }
    if (node.kind === "group") {
      return new vscode.TreeItem(`${node.label} (${node.jobs.length})`,
        node.label === "Finished" && node.jobs.length > 8
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded);
    }
    return this.jobItem(node.job);
  }

  private jobItem(job: JobSummary): vscode.TreeItem {
    const item = new vscode.TreeItem(job.source_path);
    const worker = this.jobs.workers.get(job.id);
    const count = job.state === "running" ?
      countMappings(this.db, job.id) : job.count;
    item.description = [job.state, worker && `${worker.worker} · ` +
      `${worker.model}`, `${count} mapping${count === 1 ? "" : "s"}`]
      .filter(Boolean).join(" · ");
    item.tooltip = `${job.id} · ${job.created_at}` +
      (job.error ? `\n${job.error}` : "");
    item.iconPath = new vscode.ThemeIcon(ICONS[job.state] ?? "circle");
    item.contextValue = RETRYABLE.has(job.state) ? "job.retryable" : "job";
    item.command = { command: "specScope.openPairedForSource",
      title: "Open paired view", arguments: [job.source_path] };
    return item;
  }
}

/** Source path of a tree node passed to a context-menu command. */
export function sourceOfNode(node: unknown): string | undefined {
  const n = node as Node | undefined;
  return n?.kind === "job" ? n.job.source_path : undefined;
}
