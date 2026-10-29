// Rendered-spec side of the paired view. Colors line-anchored blocks
// (data-s/data-e, see src/render.ts) by mapping, reports the top visible
// anchor on scroll, and scrolls to anchors on request. It never edits text.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const content = document.getElementById("content");
  const status = document.getElementById("status");
  const detail = document.getElementById("detail");
  const reannotate = document.getElementById("reannotate");
  const showSource = document.getElementById("showSource");
  let maps = [];
  let provisional = false;
  let mutedUntil = 0;
  let hovered = null;

  // Leaf anchors: blocks without anchored descendants (e.g. list items,
  // not the list), so nested elements are never double-tinted.
  function leaves() {
    return [...content.querySelectorAll("[data-s]")]
      .filter((el) => !el.querySelector("[data-s]"));
  }
  const span = (el) => [Number(el.dataset.s), Number(el.dataset.e)];

  function paint() {
    for (const el of leaves()) {
      const [s, e] = span(el);
      const m = maps.find((x) => x.s <= e && s <= x.e);
      el.classList.toggle("mapped", !!m);
      el.classList.toggle("provisional", !!m && provisional);
      el.style.backgroundColor = m ?
        `rgba(${m.color},${provisional ? 0.07 : 0.16})` : "";
      el.style.borderColor = m ? `rgba(${m.color},0.6)` : "";
      el.dataset.map = m ? m.id : "";
    }
  }

  function topAnchor() {
    const top = window.scrollY + 48;
    return leaves().find((el) =>
      el.getBoundingClientRect().bottom + window.scrollY > top);
  }

  const handlers = {
    html: (m) => {
      content.innerHTML = m.html;
      showSource.disabled = reannotate.disabled = !m.hasSource;
      paint();
    },
    mappings: (m) => {
      maps = m.maps;
      provisional = m.status !== "current";
      status.textContent = m.status;
      status.className = "badge " + m.status;
      detail.textContent = m.detail;
      paint();
    },
    reveal: (m) => {
      const el = leaves().find((x) => span(x)[1] >= m.line);
      if (!el) return;
      mutedUntil = Date.now() + 400;
      el.scrollIntoView({ block: "start" });
    },
    emphasize: (m) => {
      for (const el of leaves()) {
        el.classList.toggle("focus", !!m.id && el.dataset.map === `${m.id}`);
      }
    },
  };
  window.addEventListener("message", (e) => handlers[e.data.type]?.(e.data));

  let pending = false;
  window.addEventListener("scroll", () => {
    if (pending || Date.now() < mutedUntil) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const el = topAnchor();
      if (el) vscode.postMessage({ type: "scroll", line: span(el)[0] });
    });
  });

  function focusAt(target) {
    const el = target.closest("[data-s]");
    if (!el || !el.classList.contains("mapped") || el === hovered) return;
    hovered = el;
    vscode.postMessage({ type: "focus", line: span(el)[0] });
  }
  content.addEventListener("mouseover", (e) => focusAt(e.target));
  content.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (a) {
      e.preventDefault();
      vscode.postMessage({ type: "link", href: a.getAttribute("href") });
      return;
    }
    hovered = null;
    focusAt(e.target);
  });
  for (const id of ["reannotate", "showSource", "openText"]) {
    document.getElementById(id).addEventListener("click", () =>
      vscode.postMessage({ type: id }));
  }
  vscode.postMessage({ type: "ready" });
})();
