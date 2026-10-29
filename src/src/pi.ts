/**
 * @fileoverview Pi SDK loading and per-role model resolution.
 *
 * Pi (`@earendil-works/pi-coding-agent`) is ESM-only, while VS Code loads
 * this extension as CommonJS, so the SDK is imported lazily via `import()`.
 * One shared `ModelRuntime` reuses Pi's provider catalog, `models.json`
 * custom endpoints, and credential resolution (`auth.json`, environment
 * variables). This module never stores or logs credentials.
 */
import type * as PiSdk from "@earendil-works/pi-coding-agent" with {
  "resolution-mode": "import"
};

export type Pi = typeof PiSdk;
export type AgentSession = PiSdk.AgentSession;
export type ModelRuntime = PiSdk.ModelRuntime;
export type ToolDefinition = PiSdk.ToolDefinition;
export type Model = NonNullable<ReturnType<ModelRuntime["getModel"]>>;
export type ThinkingLevel =
  NonNullable<PiSdk.CreateAgentSessionOptions["thinkingLevel"]>;

/** Thinking levels Pi accepts; Pi clamps them to model capabilities. */
export const THINKING_LEVELS: readonly ThinkingLevel[] =
  ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Settings for one agent role (`specScope.coder.*` / `.annotator.*`). */
export interface RoleConfig {
  provider: string;
  model: string;
  thinkingLevel: string;
}

/** A configuration problem to show the user verbatim. */
export class ConfigError extends Error {}

let sdk: Promise<Pi> | undefined;
let runtime: Promise<ModelRuntime> | undefined;

export function loadPi(): Promise<Pi> {
  return (sdk ??= import("@earendil-works/pi-coding-agent"));
}

/** The shared model runtime backed by Pi's own catalog and credentials. */
export function modelRuntime(): Promise<ModelRuntime> {
  return (runtime ??= loadPi().then((pi) => pi.ModelRuntime.create()));
}

/**
 * Validates a role's settings before a session starts. Both provider and
 * model empty means "use Pi's configured default model".
 */
export async function resolveRole(role: RoleConfig, name: string):
  Promise<{ model?: Model; thinkingLevel?: ThinkingLevel }> {
  const level = role.thinkingLevel || undefined;
  if (level && !THINKING_LEVELS.includes(level as ThinkingLevel)) {
    throw new ConfigError(`specScope.${name}.thinkingLevel "${level}" is ` +
      `not one of: ${THINKING_LEVELS.join(", ")}.`);
  }
  const thinkingLevel = level as ThinkingLevel | undefined;
  if (!role.provider && !role.model) return { thinkingLevel };
  if (!role.provider || !role.model) {
    throw new ConfigError(`Set both specScope.${name}.provider and ` +
      `specScope.${name}.model, or leave both empty to use Pi's default.`);
  }
  const rt = await modelRuntime();
  const model = rt.getModel(role.provider, role.model);
  if (!model) throw new ConfigError(unknownModel(rt, role));
  const available = await rt.getAvailable(role.provider);
  if (!available.some((m) => m.id === model.id)) {
    throw new ConfigError(`No credentials for provider ` +
      `"${role.provider}". Log in with the Pi CLI (/login) or set the ` +
      `provider's API key environment variable, then restart VS Code.`);
  }
  return { model, thinkingLevel };
}

function unknownModel(rt: ModelRuntime, role: RoleConfig): string {
  const ids = rt.getModels(role.provider).map((m) => m.id);
  if (ids.length === 0) {
    const providers = rt.getProviders().map((p) => p.id).join(", ");
    return `Unknown Pi provider "${role.provider}". Known: ${providers}.`;
  }
  return `Unknown model "${role.model}" for provider "${role.provider}". ` +
    `Known: ${ids.slice(0, 15).join(", ")}${ids.length > 15 ? ", ..." : ""}.`;
}

/** `provider/id` label for a session's active model. */
export function modelLabel(session: AgentSession): string {
  const m = session.model;
  return m ? `${m.provider}/${m.id}` : "(no model)";
}
