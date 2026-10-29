/**
 * @fileoverview The Coder agent: one long-lived Pi session behind the
 * Coder sidebar.
 *
 * Responsibilities: lazily create the session, forward prompts (steering
 * when a run is active), stream observable events to the UI and trace, and
 * apply model/thinking changes between turns. Pi owns the conversation
 * state; this class keeps no transcript of its own.
 */
import { CoderUiEvent, SessionEvent, toUiEvent } from "./coderEvents";
import { CoderSessionDeps, createCoderSession } from "./coderSession";
import { AgentSession, modelLabel, resolveRole } from "./pi";
import { traceSession } from "./piTrace";
import { Trace } from "./trace";

export interface CoderDeps extends CoderSessionDeps {
  trace: Trace;
  emit: (e: CoderUiEvent) => void;
}

export class CoderAgent {
  private session?: Promise<AgentSession>;
  private detach: (() => void)[] = [];
  private modelChangePending = false;

  constructor(private readonly deps: CoderDeps) {}

  /** Sends a prompt; steers the current run if one is streaming. */
  async prompt(text: string): Promise<void> {
    this.deps.emit({ kind: "user", text });
    try {
      const s = await this.ensure();
      if (s.isStreaming) {
        await s.prompt(text, { streamingBehavior: "steer" });
      } else {
        this.status(s, true);
        await s.prompt(text);
      }
    } catch (err) {
      this.deps.emit({ kind: "error", message: (err as Error).message });
    }
  }

  async stop(): Promise<void> {
    await (await this.session)?.abort();
  }

  /** Drops the current session; the next prompt starts a fresh one. */
  newSession(): void {
    this.dispose();
    this.deps.emit({ kind: "status", model: "", streaming: false,
      note: "New session starts with your next message." });
  }

  /** Applies changed Coder settings now, or after the current turn. */
  async settingsChanged(): Promise<void> {
    const s = await this.session?.catch(() => undefined);
    if (!s) return;
    if (s.isStreaming) {
      this.modelChangePending = true;
      this.status(s, true, "Model change applies after this turn.");
      return;
    }
    try {
      const { model, thinkingLevel } =
        await resolveRole(this.deps.role(), "coder");
      if (model) await s.setModel(model);
      if (thinkingLevel) s.setThinkingLevel(thinkingLevel);
      this.status(s, false, `Switched to ${modelLabel(s)}.`);
    } catch (err) {
      this.deps.emit({ kind: "error", message: (err as Error).message });
    }
  }

  dispose(): void {
    const s = this.session;
    this.session = undefined;
    this.detach.forEach((d) => d());
    this.detach = [];
    void s?.then((x) => x.dispose(), () => undefined);
  }

  private ensure(): Promise<AgentSession> {
    return (this.session ??= this.create());
  }

  private async create(): Promise<AgentSession> {
    try {
      const { session, notice } = await createCoderSession(this.deps);
      this.detach.push(traceSession(session, this.deps.trace, "coder"),
        session.subscribe((e) => this.onEvent(session, e)));
      this.deps.trace.record("coder", "session_start", {
        model: modelLabel(session), thinkingLevel: session.thinkingLevel,
        sessionFile: session.sessionFile });
      this.status(session, false, notice);
      return session;
    } catch (err) {
      this.session = undefined;
      throw err;
    }
  }

  private onEvent(s: AgentSession, e: SessionEvent): void {
    const ui = toUiEvent(e);
    if (ui) this.deps.emit(ui);
    if (e.type !== "agent_settled") return;
    this.status(s, false);
    if (this.modelChangePending) {
      this.modelChangePending = false;
      void this.settingsChanged();
    }
  }

  private status(s: AgentSession, streaming: boolean, note?: string): void {
    this.deps.emit({ kind: "status", model: modelLabel(s), streaming, note });
  }
}
