/* Shared chart builders used by several pages (keeps pages free of duplicated Plotly config). */
(function () {
  const { Fmt, Theme: T, UI, M } = window;
  const { D } = M;
  const Charts = {};

  /** Granularity switch (day / week / month) */
  Charts.granSwitch = (ctx) => `<span class="seg" id="gran" role="group" aria-label="Chart granularity">${["day", "week", "month"].map((x) => `<button type="button" data-g="${x}" class="${ctx.gran === x ? "on" : ""}" aria-pressed="${ctx.gran === x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join("")}</span>`;
  Charts.bindGran = () => document.querySelectorAll("#gran button").forEach((b) => (b.onclick = () => { App.f.gran = b.dataset.g; App.render(); }));

  /** Horizontal net-sales bars for one dimension. Click = cross-filter on `key` (cat | ch | region). */
  Charts.groupBar = function (id, map, labels, key, opts) {
    opts = opts || {};
    const total = Array.from(map.values()).reduce((a, s) => a + s.net, 0);
    const arr = Array.from(map.entries()).map(([k, s]) => ({ k, s, label: labels[k] })).sort((a, b) => a.s.net - b.s.net);
    UI.plot(id, [{
      type: "bar", orientation: "h", y: arr.map((a) => a.label), x: arr.map((a) => a.s.net),
      marker: { color: arr.map((a) => (App.f[key] === a.k ? T.mocha : T.mochaLight)), opacity: arr.map((a) => (App.f[key] === null || App.f[key] === a.k ? 1 : 0.4)) },
      customdata: arr.map((a) => [a.s.gm, a.k, total ? a.s.net / total : 0, a.s.orders]),
      text: arr.map((a) => Fmt.brl(a.s.net)), textposition: "outside", cliponaxis: false, textfont: { color: T.muted, size: 11 },
      hovertemplate: "<b>%{y}</b><br>Net sales: R$ %{x:,.0f}<br>Share: %{customdata[2]:.1%}<br>Gross margin: %{customdata[0]:.1%}<br>Orders: %{customdata[3]:,}<extra></extra>",
    }], { margin: { l: opts.left || 120, r: 56, t: 4, b: 28 }, xaxis: { tickformat: "~s", gridcolor: T.grid, nticks: 4, tickangle: 0 } }, (e) => App.toggle(key, e.points[0].customdata[1]));
  };

  /** Line chart of one metric over the series, with optional prior-period overlay. */
  Charts.metricLine = function (id, ctx, pick, o) {
    o = o || {};
    const ser = ctx.series(), psr = ctx.prevSeries();
    const x = ser.map((p) => p.label);
    const tr = [{ x, y: ser.map((p) => pick(p.s)), type: "scatter", mode: "lines", name: o.name || "Current", line: { color: o.color || T.mocha, width: 2.2 }, connectgaps: false, hovertemplate: `%{x}<br>${o.name || "Value"}: ${o.hover || "%{y:,.0f}"}<extra></extra>` }];
    if (psr && o.prior !== false) tr.push({ x: x.slice(0, psr.length), y: psr.map((p) => pick(p.s)).slice(0, x.length), type: "scatter", mode: "lines", name: "Prior period", line: { color: T.mochaLight, width: 1.4, dash: "dot" }, hovertemplate: `Prior period: ${o.hover || "%{y:,.0f}"}<extra></extra>` });
    UI.plot(id, tr, Object.assign({ hovermode: "x unified", yaxis: { tickformat: o.tickformat, rangemode: o.zero === false ? "normal" : "tozero", gridcolor: T.grid } }, o.layout || {}));
  };
  window.Charts = Charts;
})();
