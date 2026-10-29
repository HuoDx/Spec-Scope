// Headless end-to-end run of the real pipeline, without VS Code: a Coder Pi
// session writes small module/spec pairs and calls submit_file; up to K=2
// Annotator Pi sessions map them with annotate() straight into SQLite; the
// run's observable trace is exported as JSONL. Uses real models and Pi's
// own credentials. Usage (after `npm run compile`):
//
//   SMOKE_CODER=moonshotai/kimi-k3 SMOKE_ANNOTATOR=minimax/MiniMax-M2.7 \
//     node scripts/smoke.js <empty-workspace-dir> <trace-out.jsonl>
//
// Either variable may be omitted to use Pi's default model for that role.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const out = path.join(__dirname, "..", "out", "src");
const { createAnnotatorRunner } = require(path.join(out, "annotator"));
const { CoderAgent } = require(path.join(out, "coder"));
const { openWorkspaceDb } = require(path.join(out, "db"));
const { JobService } = require(path.join(out, "jobs"));
const { mappingsOf, recentJobs } = require(path.join(out, "queries"));
const { exportRun, newRunId, Trace } = require(path.join(out, "trace"));

const TASK = `In this empty workspace, create:
1. app.md: a 3-line root spec for a tiny "collections" library.
2. src/stack.ts: a bounded LIFO stack class (push, pop, peek, size; throws
   on overflow/underflow), and src/stack.spec.md describing its
   responsibility, contract, and invariants, with a Parent link to app.md.
3. src/ring.ts + src/ring.spec.md: a fixed-capacity ring buffer, likewise.
Keep every file under 40 lines. Call submit_file for each source as soon as
its pair is complete enough. Do not write tests or memory files.`;

function role(spec) {
  const [provider, ...rest] = (spec ?? "").split("/");
  return spec ? { provider, model: rest.join("/"), thinkingLevel: "" } :
    { provider: "", model: "", thinkingLevel: "" };
}

function log(e) {
  if (e.kind === "tool_start") console.log(`  [coder] ${e.name} ${e.args}`
    .slice(0, 150));
  else if (e.kind === "error") console.log(`  [coder] error: ${e.message}`);
  else if (e.kind === "status" && e.note) console.log(`  [coder] ${e.note}`);
}

async function main() {
  const [dir, traceOut] = process.argv.slice(2);
  if (!dir || !traceOut) throw new Error("usage: smoke.js <dir> <out.jsonl>");
  const root = path.resolve(dir);
  fs.mkdirSync(root, { recursive: true });
  const promptsDir = path.join(__dirname, "..", "prompts");
  const db = openWorkspaceDb(root);
  const trace = new Trace(db, newRunId());
  trace.record("service", "run_start", { headless: true });
  const jobs = new JobService({ root, db, trace, maxParallel: () => 2,
    runAnnotator: createAnnotatorRunner({ root, promptsDir, trace,
      role: () => role(process.env.SMOKE_ANNOTATOR) }),
    changed: () => {} });
  const coder = new CoderAgent({ root, promptsDir, trace,
    role: () => role(process.env.SMOKE_CODER),
    submit: (p) => {
      const r = jobs.submit(p, "coder");
      console.log(`  [submit_file] ${p} -> ${JSON.stringify(r)}`);
      return r;
    }, emit: log });
  console.log(`Coder working in ${root} ...`);
  await coder.prompt(TASK);
  coder.dispose();
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const { active, pending } = jobs.queue.snapshot();
    if (active.length + pending.length === 0) break;
    if (Date.now() > deadline) throw new Error("annotators timed out");
    console.log(`  [queue] active ${active.length}, queued ${pending.length}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  trace.record("service", "run_end", {});
  for (const j of recentJobs(db).reverse()) {
    console.log(`${j.id} ${j.source_path} ${j.state} ${j.count} mappings` +
      (j.error ? ` (${j.error})` : ""));
    for (const m of mappingsOf(db, j.id)) {
      console.log(`    spec ${m.spec_start}-${m.spec_end} <-> code ` +
        `${m.code_start}-${m.code_end} ${m.note ?? ""}`);
    }
  }
  fs.mkdirSync(path.dirname(path.resolve(traceOut)), { recursive: true });
  fs.writeFileSync(traceOut, exportRun(db, trace.runId));
  console.log(`Trace: ${traceOut}`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
