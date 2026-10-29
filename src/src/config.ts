/**
 * @fileoverview `specScope.*` settings, workspace-root selection, and the
 * small model picker used by the Coder and Annotations tabs.
 *
 * Provider/model IDs are never hard-coded: the picker lists models from
 * Pi's own runtime that currently have credentials. Settings hold only
 * identifiers; secrets stay in Pi's credential store or the environment.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { modelRuntime, RoleConfig, THINKING_LEVELS } from "./pi";

export type Role = "coder" | "annotator";

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("specScope");
}

export function readRole(role: Role): RoleConfig {
  const c = cfg();
  return {
    provider: c.get<string>(`${role}.provider`, "").trim(),
    model: c.get<string>(`${role}.model`, "").trim(),
    thinkingLevel: c.get<string>(`${role}.thinkingLevel`, "").trim(),
  };
}

export function maxParallel(): number {
  return Math.max(1, Math.floor(cfg().get<number>("maxParallelAnnotators",
    2)));
}

/**
 * The workspace root: `specScope.workspaceRoot` if set, the only folder if
 * there is one, otherwise an explicit pick that is saved to the workspace.
 */
export async function resolveRoot(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const configured = cfg().get<string>("workspaceRoot", "").trim();
  if (configured) {
    return path.resolve(folders[0]?.uri.fsPath ?? "", configured);
  }
  if (folders.length <= 1) return folders[0]?.uri.fsPath;
  const pick = await vscode.window.showWorkspaceFolderPick({
    placeHolder: "Spec Scope: choose the workspace root to annotate",
  });
  if (pick) {
    await cfg().update("workspaceRoot", pick.uri.fsPath,
      vscode.ConfigurationTarget.Workspace);
  }
  return pick?.uri.fsPath;
}

function target(key: string): vscode.ConfigurationTarget {
  return cfg().inspect(key)?.workspaceValue !== undefined
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
}

/** Lets the user pick a credentialed Pi model and thinking level. */
export async function pickModel(role: Role): Promise<void> {
  const rt = await modelRuntime();
  const models = await rt.getAvailable();
  const current = readRole(role);
  const items = [
    { label: "$(circle-slash) Pi default", provider: "", model: "",
      description: "Use Pi's configured default model" },
    ...models.map((m) => ({ label: `${m.provider}/${m.id}`,
      description: m.name !== m.id ? m.name : undefined,
      provider: m.provider, model: m.id,
      picked: m.provider === current.provider && m.id === current.model })),
  ];
  const choice = await vscode.window.showQuickPick(items, {
    title: `Spec Scope: ${role} model`, matchOnDescription: true,
    placeHolder: models.length ? "Models with credentials in Pi" :
      "No credentialed models: log in with the Pi CLI or set an API key",
  });
  if (!choice) return;
  const level = await vscode.window.showQuickPick(
    ["(Pi default)", ...THINKING_LEVELS], {
      title: `Spec Scope: ${role} thinking level`,
    });
  if (level === undefined) return;
  for (const [key, value] of [["provider", choice.provider],
    ["model", choice.model],
    ["thinkingLevel", level === "(Pi default)" ? "" : level]]) {
    await cfg().update(`${role}.${key}`, value, target(`${role}.${key}`));
  }
}
