/**
 * @fileoverview Spec Graph index and deterministic, visual-only pruning.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIndex, defaultFocus, SpecDoc, toSpecDoc } from "../src/graph";
import { parseLinks } from "../src/markdown";
import { prune } from "../src/prune";

function doc(path: string, md: string): SpecDoc {
  return toSpecDoc(path, parseLinks(md));
}

const DOCS = [
  doc("app.md", "# App\n[parser](core/parser.spec.md)\n"),
  doc("core/engine.md", "Parent: [App](../app.md)\n"),
  doc("core/parser.spec.md",
    "Parent: [E](engine.md)\nSee [lexer](lexer.spec.md), [app](../app.md)"),
  doc("core/lexer.spec.md", "Parent: [E](engine.md)\n"),
  doc("core/deep/x.spec.md", "Parent: [P](../parser.spec.md)\n"),
  doc("core/deep/y.spec.md", "Parent: [X](x.spec.md)\n"),
  doc("notes.md", "[parser](core/parser.spec.md)\n"),
  doc("broken.spec.md", "Parent: [nope](nope.md)\n"),
];

test("index builds children and backlinks and reports broken parents",
  () => {
    const index = buildIndex(DOCS);
    assert.deepEqual(index.children.get("core/engine.md"),
      ["core/lexer.spec.md", "core/parser.spec.md"]);
    assert.deepEqual(index.backlinks.get("core/parser.spec.md"),
      ["app.md", "notes.md"]);
    assert.match(index.problems.join(), /broken.spec.md: broken Parent/);
    assert.equal(defaultFocus(index), "app.md");
  });

test("prune keeps the ancestor chain and respects depth", () => {
  const view = prune(buildIndex(DOCS), "core/parser.spec.md",
    { depth: 1, budget: 60 });
  const roles = Object.fromEntries(view.nodes.map((n) => [n.id, n.role]));
  assert.equal(roles["core/engine.md"], "ancestor");
  assert.equal(roles["app.md"], "ancestor");
  assert.equal(roles["core/deep/x.spec.md"], "descendant");
  assert.equal(roles["core/deep/y.spec.md"], undefined, "beyond depth 1");
  const x = view.nodes.find((n) => n.id === "core/deep/x.spec.md")!;
  assert.equal(x.hidden, 1, "omitted child is counted for expand/refocus");
  assert.equal(x.kind, "file");
});

test("cross-references duplicating the backbone are suppressed", () => {
  const view = prune(buildIndex(DOCS), "core/parser.spec.md");
  const between = (a: string, b: string) => view.edges.filter((e) =>
    (e.source === a && e.target === b) || (e.source === b && e.target === a));
  assert.equal(between("app.md", "core/parser.spec.md").length, 1);
  assert.equal(between("app.md", "core/parser.spec.md")[0].kind, "link");
  assert.equal(between("core/engine.md", "core/parser.spec.md")[0].kind,
    "parent");
});

test("budget bounds the drawing deterministically without data loss", () => {
  const index = buildIndex(DOCS);
  const a = prune(index, "core/parser.spec.md", { depth: 2, budget: 4 });
  const b = prune(index, "core/parser.spec.md", { depth: 2, budget: 4 });
  assert.deepEqual(a, b);
  assert.ok(a.nodes.length <= 4);
  assert.equal(index.docs.size, DOCS.length, "index untouched");
});
