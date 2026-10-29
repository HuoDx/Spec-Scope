/**
 * @fileoverview Builds the Coder's persistent Pi session.
 *
 * System prompt layering, in order:
 *   1. Pi's default coding prompt and normal resource discovery: the
 *      workspace's AGENTS.md files, skills, extensions, and settings are
 *      untouched.
 *   2. `prompts/coder.md`: the user's engineering rules, embedded verbatim
 *      (a build-time copy of the repository's `coder.md`).
 *   3. `prompts/spec-rules.md`: the four Spec Scope rules from the spec.
 *
 * The transcript persists through Pi's own SessionManager, so it can also be
 * resumed from the Pi CLI. An inline extension blocks `write`/`edit` calls
 * into `.spec-scope/`; this is a guard rail, not a sandbox (bash remains).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { STATE_DIR } from "./db";
import type { SubmitResult } from "./jobs";
import {
  AgentSession, loadPi, modelRuntime, resolveRole, RoleConfig,
} from "./pi";
import { submitFileTool } from "./tools";

export interface CoderSessionDeps {
  root: string;
  promptsDir: string;
  role: () => RoleConfig;
  submit: (path: string) => SubmitResult;
}

/** Reads the appended Coder instructions shipped with the extension. */
export function coderInstructions(promptsDir: string): string[] {
  return ["coder.md", "spec-rules.md"].map((name) =>
    fs.readFileSync(path.join(promptsDir, name), "utf8"));
}

/** True when `file` (absolute or root-relative) lies inside `.spec-scope/`. */
export function isStatePath(root: string, file: unknown): boolean {
  if (typeof file !== "string") return false;
  const rel = path.relative(path.join(root, STATE_DIR),
    path.resolve(root, file));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Creates a new persistent Coder session with the configured model. */
export async function createCoderSession(deps: CoderSessionDeps):
  Promise<{ session: AgentSession; notice?: string }> {
  const pi = await loadPi();
  const { model, thinkingLevel } = await resolveRole(deps.role(), "coder");
  const extra = coderInstructions(deps.promptsDir);
  const loader = new pi.DefaultResourceLoader({
    cwd: deps.root,
    agentDir: pi.getAgentDir(),
    appendSystemPromptOverride: (base) => [...base, ...extra],
    extensionFactories: [{
      name: "spec-scope-guard",
      factory: (api) => {
        api.on("tool_call", (event) => {
          const target = (event.input as { path?: unknown }).path;
          if ((event.toolName === "write" || event.toolName === "edit") &&
            isStatePath(deps.root, target)) {
            return { block: true, reason: `${STATE_DIR}/ is owned by ` +
              "Spec Scope; leave mappings to Annotators." };
          }
          return undefined;
        });
      },
    }],
  });
  await loader.reload();
  const { session, modelFallbackMessage } = await pi.createAgentSession({
    cwd: deps.root, model, thinkingLevel,
    modelRuntime: await modelRuntime(), resourceLoader: loader,
    customTools: [await submitFileTool(deps.submit)],
  });
  return { session, notice: modelFallbackMessage };
}
