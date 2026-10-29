// Spec Graph: compact D3 force layout of the pruned view from the host
// (src/prune.ts). Node IDs are workspace-relative Markdown paths. Click a
// node to open it; "Refocus" re-centers the graph on the last clicked node.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const picker = document.getElementById("picker");
  const problems = document.getElementById("problems");
  const svg = d3.select("#graph");
  const zoomLayer = svg.append("g");
  let selected = null;
  let sim = null;

  svg.call(d3.zoom().scaleExtent([0.2, 4])
    .on("zoom", (e) => zoomLayer.attr("transform", e.transform)));

  function label(id) {
    const name = id.split("/").pop();
    return name.replace(/\.spec\.md$|\.md$/, "");
  }

  function setPicker(specs, focus) {
    picker.replaceChildren(...specs.map((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      o.selected = s === focus;
      return o;
    }));
  }

  function render(view) {
    problems.textContent = view.problems.join(" · ");
    problems.hidden = view.problems.length === 0;
    const { width, height } = svg.node().getBoundingClientRect();
    const nodes = view.nodes.map((n) => ({ ...n }));
    const links = view.edges.map((e) => ({ ...e }));
    if (sim) sim.stop();
    zoomLayer.selectAll("*").remove();
    const edge = zoomLayer.append("g").selectAll("line").data(links)
      .join("line").attr("class", (d) => "edge " + d.kind);
    const node = zoomLayer.append("g").selectAll("g").data(nodes, (d) => d.id)
      .join("g")
      .attr("class", (d) => `node ${d.role} ${d.kind}` +
        (d.id === selected ? " selected" : ""))
      .on("click", (_e, d) => {
        selected = d.id;
        node.classed("selected", (n) => n.id === selected);
        vscode.postMessage({ type: "open", path: d.id });
      });
    node.append("circle").attr("r", (d) => (d.role === "focus" ? 7 : 5));
    node.append("text").attr("x", 9).attr("dy", "0.35em")
      .text((d) => label(d.id) + (d.hidden ? ` +${d.hidden}` : ""));
    node.append("title").text((d) => d.id +
      (d.hidden ? `\n${d.hidden} more not shown — Refocus to expand` : ""));
    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(60))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .on("tick", () => {
        edge.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      });
  }

  window.addEventListener("message", (m) => {
    if (m.data.type !== "graph") return;
    setPicker(m.data.specs, m.data.view.focus);
    render(m.data.view);
  });
  picker.addEventListener("change", () =>
    vscode.postMessage({ type: "focus", path: picker.value }));
  document.getElementById("refocus").addEventListener("click", () => {
    if (selected) vscode.postMessage({ type: "focus", path: selected });
  });
  vscode.postMessage({ type: "ready" });
})();
