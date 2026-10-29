/**
 * @fileoverview Host -> Coder webview message protocol.
 *
 * Pi session events are reduced to a handful of compact UI events; the
 * webview (`media/coder.js`) renders them Pi-TUI style. Pure mapping only.
 */
import type { AgentSession } from "./pi";

/** Compact UI events for the Coder webview. */
export type CoderUiEvent =
  | { kind: "status"; model: string; streaming: boolean; note?: string }
  | { kind: "user"; text: string }
  | { kind: "delta"; text: string }
  | { kind: "assistant_end" }
  | { kind: "tool_start"; id: string; name: string; args: string }
  | { kind: "tool_end"; id: string; isError: boolean; text: string }
  | { kind: "error"; message: string };

export type SessionEvent =
  Parameters<Parameters<AgentSession["subscribe"]>[0]>[0];

/** Characters of tool output shown in the collapsed UI row. */
const UI_RESULT_CHARS = 2000;

/** Maps a Pi session event to a UI event, or `undefined` to skip it. */
export function toUiEvent(e: SessionEvent): CoderUiEvent | undefined {
  switch (e.type) {
    case "message_update":
      return e.assistantMessageEvent.type === "text_delta"
        ? { kind: "delta", text: e.assistantMessageEvent.delta }
        : undefined;
    case "message_end":
      return e.message.role === "assistant"
        ? { kind: "assistant_end" } : undefined;
    case "tool_execution_start":
      return { kind: "tool_start", id: e.toolCallId, name: e.toolName,
        args: JSON.stringify(e.args ?? {}) };
    case "tool_execution_end": {
      const blocks = (e.result?.content ?? []) as { text?: string }[];
      const text = blocks.map((c) => c.text ?? "").join("");
      return { kind: "tool_end", id: e.toolCallId, isError: e.isError,
        text: text.slice(0, UI_RESULT_CHARS) };
    }
    default:
      return undefined;
  }
}
