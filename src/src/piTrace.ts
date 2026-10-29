/**
 * @fileoverview Records a Pi session's observable events into the trace.
 *
 * Captured: user prompts, visible assistant text, tool calls and results,
 * model identity, stop reasons, provider-reported token usage, retries, and
 * settlement. Provider "thinking" blocks are deliberately not recorded (only
 * counted): the trace documents observable behavior, not reasoning. Large
 * tool outputs are truncated to avoid copying unrelated repository content.
 */
import type { AgentSession } from "./pi";
import { Actor, Trace } from "./trace";

type SessionEvent = Parameters<Parameters<AgentSession["subscribe"]>[0]>[0];

/** Maximum characters of a tool result kept in the trace. */
export const MAX_RESULT_CHARS = 4000;

interface Block { type: string; text?: string }

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Block[])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text).join("");
}

function clip(text: string): { text: string; truncated?: number } {
  if (text.length <= MAX_RESULT_CHARS) return { text };
  return { text: text.slice(0, MAX_RESULT_CHARS), truncated: text.length };
}

/** Maps one session event to a trace record, or `undefined` to skip it. */
export function describe(e: SessionEvent):
  { kind: string; payload: object } | undefined {
  switch (e.type) {
    case "message_end": {
      const m = e.message as unknown as Record<string, unknown>;
      if (m.role === "user") {
        return { kind: "prompt", payload: { text: textOf(m.content) } };
      }
      if (m.role !== "assistant") return undefined;
      const blocks = (m.content ?? []) as Block[];
      return { kind: "assistant", payload: {
        model: `${m.provider}/${m.model}`, text: textOf(blocks),
        toolCalls: blocks.filter((b) => b.type === "toolCall").length,
        thinkingBlocksOmitted: blocks.filter((b) => b.type === "thinking")
          .length,
        stopReason: m.stopReason, errorMessage: m.errorMessage,
        usage: m.usage } };
    }
    case "tool_execution_start":
      return { kind: "tool_call", payload: { toolCallId: e.toolCallId,
        toolName: e.toolName, args: e.args } };
    case "tool_execution_end":
      return { kind: "tool_result", payload: { toolCallId: e.toolCallId,
        toolName: e.toolName, isError: e.isError, durationMs: e.durationMs,
        ...clip(textOf(e.result?.content)) } };
    case "auto_retry_start":
      return { kind: "retry", payload: { attempt: e.attempt,
        maxAttempts: e.maxAttempts, errorMessage: e.errorMessage } };
    case "agent_settled":
      return { kind: "settled", payload: { aborted: e.aborted } };
    default:
      return undefined;
  }
}

/**
 * Subscribes `trace` to `session`. `worker` (Annotators only) is attached to
 * every payload. Returns the unsubscribe function.
 */
export function traceSession(session: AgentSession, trace: Trace,
  actor: Actor, jobId?: string, worker?: string): () => void {
  return session.subscribe((event) => {
    const rec = describe(event);
    if (!rec) return;
    const payload = worker ? { worker, ...rec.payload } : rec.payload;
    trace.record(actor, rec.kind, payload, jobId);
  });
}
