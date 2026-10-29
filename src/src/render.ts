/**
 * @fileoverview Renders a spec's Markdown to HTML with source-line anchors.
 *
 * Every top-level block becomes `<div class="blk" data-s data-e>` and every
 * list item `<li data-s data-e>`, where `data-s`/`data-e` are the 1-based,
 * inclusive Markdown lines it came from. The webview uses these anchors for
 * mapping colors and scroll sync; the text itself is rendered unchanged.
 * Raw HTML in the Markdown is shown escaped rather than executed.
 */
import type * as MarkedNs from "marked" with { "resolution-mode": "import" };

type Token = MarkedNs.Token & { s?: number; e?: number };

const ESCAPES: Record<string, string> =
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function newlines(text: string): number {
  return text.split("\n").length - 1;
}

/** Sets `s`/`e` on list items (recursively), relative to `start`. */
function anchorItems(list: MarkedNs.Tokens.List, start: number): void {
  let cursor = 0;
  for (const item of list.items as (MarkedNs.Tokens.ListItem & Token)[]) {
    const at = list.raw.indexOf(item.raw, cursor);
    if (at < 0) continue;
    cursor = at + item.raw.length;
    item.s = start + newlines(list.raw.slice(0, at));
    item.e = item.s + newlines(item.raw.replace(/\s+$/, ""));
    let inner = 0;
    for (const child of item.tokens) {
      const pos = item.raw.indexOf(child.raw, inner);
      if (pos < 0) continue;
      inner = pos + child.raw.length;
      if (child.type === "list") {
        anchorItems(child as MarkedNs.Tokens.List,
          item.s + newlines(item.raw.slice(0, pos)));
      }
    }
  }
}

let marked: Promise<MarkedNs.Marked> | undefined;

function renderer(): Promise<MarkedNs.Marked> {
  return (marked ??= import("marked").then(({ Marked }) => new Marked({
    gfm: true,
    renderer: {
      html: ({ text }) => escapeHtml(text),
      listitem(item) {
        const t = item as Token;
        const attrs = t.s ? ` data-s="${t.s}" data-e="${t.e}"` : "";
        return `<li${attrs}>${this.parser.parse(item.tokens)}</li>\n`;
      },
    },
  })));
}

/** Renders `md` to anchored HTML. */
export async function renderSpec(md: string): Promise<string> {
  const m = await renderer();
  const tokens = m.lexer(md.replace(/\r\n?/g, "\n"));
  let line = 1;
  let html = "";
  for (const tok of tokens) {
    const s = line;
    line += newlines(tok.raw);
    if (tok.type === "space") continue;
    const e = s + newlines(tok.raw.replace(/\s+$/, ""));
    if (tok.type === "list") anchorItems(tok as MarkedNs.Tokens.List, s);
    const one = Object.assign([tok], { links: tokens.links });
    html += `<div class="blk" data-s="${s}" data-e="${e}">` +
      `${m.parser(one)}</div>\n`;
  }
  return html;
}
