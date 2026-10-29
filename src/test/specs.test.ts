/**
 * @fileoverview Markdown link parsing, source/spec pairing, and ancestry.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinks, resolveTarget } from "../src/markdown";
import { takeSnapshot } from "../src/snapshot";
import { ancestry, PairError, sourceForSpec, specForSource }
  from "../src/specs";
import { workspace } from "./helpers";

test("parseLinks classifies Parent/Source and skips fences and images",
  () => {
    const md = [
      "# Parser",
      "Parent: [Engine](../engine.md)",
      "Source: [parser.ts](./parser.ts)",
      "See [lexer](lexer.spec.md#tokens) and ![img](x.png).",
      "```",
      "[not a link](ignored.md)",
      "```",
      "[web](https://example.com)",
    ].join("\n");
    const links = parseLinks(md);
    assert.deepEqual(links.map((l) => [l.kind, l.target, l.line]), [
      ["parent", "../engine.md", 2],
      ["source", "./parser.ts", 3],
      ["link", "lexer.spec.md#tokens", 4],
      ["link", "https://example.com", 8],
    ]);
  });

test("resolveTarget ignores external links and paths outside the root",
  () => {
    assert.equal(resolveTarget("a/b.md", "../c.md#x"), "c.md");
    assert.equal(resolveTarget("a/b.md", "/docs/r.md"), "docs/r.md");
    assert.equal(resolveTarget("a/b.md", "../../up.md"), undefined);
    assert.equal(resolveTarget("a/b.md", "https://x.y/z.md"), undefined);
    assert.equal(resolveTarget("a/b.md", "#anchor"), undefined);
    assert.equal(resolveTarget("a/b.md", "my%20file.md"), "a/my file.md");
  });

test("pairing: Source link wins, convention otherwise, never guesses",
  () => {
    const root = workspace({
      "src/parser.ts": "", "src/parser.spec.md": "# P\n",
      "src/lex.ts": "", "src/lex.test.ts": "",
      "src/tokens.spec.md": "Source: [lex](./lex.ts)\n",
      "src/dup.ts": "", "src/dup.spec.md": "", "src/dup.ts.spec.md": "",
      "src/engine.spec.md": "# module\n",
    });
    assert.equal(specForSource(root, "src/parser.ts"), "src/parser.spec.md");
    assert.equal(specForSource(root, "src/lex.ts"), "src/tokens.spec.md");
    assert.equal(sourceForSpec(root, "src/tokens.spec.md"), "src/lex.ts");
    assert.equal(sourceForSpec(root, "src/parser.spec.md"), "src/parser.ts");
    assert.equal(sourceForSpec(root, "src/engine.spec.md"), undefined);
    assert.throws(() => specForSource(root, "src/dup.ts"), PairError);
    assert.throws(() => specForSource(root, "src/lex.test.ts"),
      /No spec found/);
  });

test("ancestry follows Parent links, reporting cycles and broken links",
  () => {
    const root = workspace({
      "app.md": "# App\n",
      "core/engine.md": "Parent: [App](../app.md)\n",
      "core/a.spec.md": "Parent: [Engine](engine.md)\n", "core/a.ts": "",
      "x.md": "Parent: [y](y.md)\n", "y.md": "Parent: [x](x.md)\n",
      "z.spec.md": "Parent: [gone](missing.md)\n", "z.ts": "",
    });
    assert.deepEqual(ancestry(root, "core/a.spec.md").chain.map((c) =>
      c.path), ["core/engine.md", "app.md"]);
    assert.match(ancestry(root, "x.md").problems[0], /cycle/);
    assert.match(ancestry(root, "z.spec.md").problems[0], /broken/);
    const before = takeSnapshot(root, "core/a.ts").rev.ancestryHash;
    const after = takeSnapshot(root, "z.ts").rev.ancestryHash;
    assert.notEqual(before, after);
  });
