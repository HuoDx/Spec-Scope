// Coder tab: a narrow, Pi-TUI-inspired transcript. Renders host events
// (see src/coderEvents.ts) as plain text lines; tool calls collapse into
// <details> rows. All text is inserted via textContent, never as HTML.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const log = document.getElementById("log");
  const input = document.getElementById("input");
  const stop = document.getElementById("stop");
  const model = document.getElementById("model");
  const tools = new Map();
  let reply = null;

  function line(cls, text) {
    const el = document.createElement("div");
    el.className = "line " + cls;
    el.textContent = text;
    log.appendChild(el);
    el.scrollIntoView({ block: "end" });
    return el;
  }

  function toolStart(e) {
    const d = document.createElement("details");
    d.className = "tool";
    const s = document.createElement("summary");
    s.textContent = "▸ " + e.name + " " + e.args.slice(0, 120);
    d.appendChild(s);
    log.appendChild(d);
    tools.set(e.id, d);
    reply = null;
  }

  function toolEnd(e) {
    const d = tools.get(e.id);
    if (!d) return;
    const pre = document.createElement("pre");
    pre.textContent = e.text || "(no output)";
    d.appendChild(pre);
    if (e.isError) d.classList.add("error");
    d.firstChild.textContent = d.firstChild.textContent.replace("▸", "✓");
  }

  const handlers = {
    user: (e) => { reply = null; line("user", "> " + e.text); },
    delta: (e) => {
      if (!reply) reply = line("assistant", "");
      reply.textContent += e.text;
      reply.scrollIntoView({ block: "end" });
    },
    assistant_end: () => { reply = null; },
    tool_start: toolStart,
    tool_end: toolEnd,
    error: (e) => line("error", "error: " + e.message),
    status: (e) => {
      if (e.model) model.textContent = "model: " + e.model;
      stop.disabled = !e.streaming;
      if (e.note) line("note", e.note);
    },
  };

  window.addEventListener("message", (m) => {
    const h = handlers[m.data.kind];
    if (h) h(m.data);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    vscode.postMessage({ type: "prompt", text });
  });
  for (const id of ["stop", "new", "configure"]) {
    document.getElementById(id).addEventListener("click", () =>
      vscode.postMessage({ type: id }));
  }
  vscode.postMessage({ type: "ready" });
})();
