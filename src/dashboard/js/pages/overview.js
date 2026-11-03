/* Executive Overview */
(function () {
  const { Fmt, Theme: T, UI, M, Charts, Targets, Analytics } = window;
  const { D } = M;
  let tvTab = "month"; // Target vs Actual view: "month" | "category"
  let dimTab = "channel"; // channel | region

  const fmtMetric = { brl: (v) => Fmt.brl(v), brl2: (v) => Fmt.brl(v, 1), num: (v) => Fmt.num(v), pct: (v) => Fmt.pct(v) };
  const STATUS_TXT = { above: "Above target", on: "On target", below: "Below target", na: "n/a" };

  function targetBlock(ctx) {
    const t = ctx.target();
    if (!t.available) return `<div class="note">${t.reason}</div>`;
    const keys = ["net", "gp", "orders", "aov", "gm"];
    const rows = keys.map((k) => {
      const m = t.metrics[k], f = fmtMetric[m.fmt];
      const scale = Math.max(m.a || 0, m.t || 0) * 1.08 || 1;
      return `<div class="tv-row"><div class="tv-name">${m.label}</div>
        <div class="tv-bar" role="img" aria-label="${m.label}: actual ${f(m.a)}, target ${f(m.t)}"><div class="tv-t" style="width:${((m.t || 0) / scale) * 100}%"></div><div class="tv-a" style="width:${((m.a || 0) / scale) * 100}%"></div></div>
        <div class="tv-v"><b>${Fmt.pct(m.ach, 0)}</b><span class="st ${m.status}">${STATUS_TXT[m.status]}</span><br><span class="muted">${f(m.a)} of ${f(m.t)}</span></div></div>`;
    }).join("");
    const g = t.gap, n = t.metrics.net;
    const main = Math.abs(g.volume) >= Math.abs(g.value) ? "order volume" : "basket value (AOV)";
    const gapTxt = `Net revenue is <b class="${g.net >= 0 ? "pos" : "neg"}">${Fmt.brlFull(Math.abs(g.net))} ${g.net >= 0 ? "above" : "below"}</b> the planning target (${Fmt.pct(n.ach, 0)} attainment). Order volume accounts for <b>${Fmt.brlFull(g.volume)}</b> and basket value for <b>${Fmt.brlFull(g.value)}</b>, so the gap is driven mainly by ${main}.`;
    const cov = t.coverageDays < t.totalDays ? `<p class="muted" style="font-size:12px;margin:8px 0 0">Targets cover ${t.coverageDays} of the ${t.totalDays} selected days (they start in Apr 2017, once 3 months of history exist). Actuals are measured over the same days.</p>` : "";
    return `<div class="tva">${rows}</div>
      <div style="margin-top:10px"><span class="legend-i"><i style="background:var(--lav);border-right:2px solid var(--lav-d)"></i>Planning target</span><span class="legend-i"><i style="background:var(--mocha)"></i>Actual</span></div>
      <p style="margin:10px 0 0">${gapTxt}</p>${cov}`;
  }

  function drawTargetChart(ctx) {
    const t = ctx.target(); if (!t.available) return;
    const el = document.getElementById("tv-chart"); if (!el) return;
    if (tvTab === "category" && ctx.f.cat === null) {
      const arr = Targets.byCategory(ctx.f).sort((a, b) => a.gap - b.gap);
      if (UI.emptyIf(!arr.length, "tv-chart", "No category targets available.")) return;
      UI.plot("tv-chart", [{ type: "bar", orientation: "h", y: arr.map((a) => a.name), x: arr.map((a) => a.gap), marker: { color: arr.map((a) => (a.gap >= 0 ? T.pos : T.neg)) },
        customdata: arr.map((a) => [a.actual, a.target, a.ach]), hovertemplate: "<b>%{y}</b><br>Actual: R$ %{customdata[0]:,.0f}<br>Target: R$ %{customdata[1]:,.0f}<br>Attainment: %{customdata[2]:.0%}<br>Gap: R$ %{x:,.0f}<extra></extra>" }],
        { margin: { l: 130, r: 12, t: 4, b: 40 }, xaxis: { title: "Net revenue gap vs target (R$)", tickformat: "~s", gridcolor: T.grid } });
      return;
    }
    const mo = t.months;
    UI.plot("tv-chart", [
      { type: "bar", name: "Planning target", x: mo.map((m) => m.label + (m.partial ? " *" : "")), y: mo.map((m) => m.tNet), marker: { color: T.lavenderMid }, hovertemplate: "<b>%{x}</b><br>Target: R$ %{y:,.0f}<extra></extra>" },
      { type: "bar", name: "Actual", x: mo.map((m) => m.label + (m.partial ? " *" : "")), y: mo.map((m) => m.aNet), marker: { color: T.mocha }, customdata: mo.map((m) => (m.tNet ? m.aNet / m.tNet : null)), hovertemplate: "<b>%{x}</b><br>Actual: R$ %{y:,.0f}<br>Attainment: %{customdata:.0%}<extra></extra>" },
    ], { barmode: "group", yaxis: { title: "Net revenue (R$)", tickformat: "~s", gridcolor: T.grid }, hovermode: "closest" });
  }

  window.Pages.overview = {
    title: "Executive Overview",
    sub: "Company health at a glance: eligible electronics orders only (cancelled and unavailable orders excluded). Revenue excludes freight and tax.",
    render(ctx) {
      const { cur, prev } = ctx, ser = ctx.series(), sp = (fn) => ser.map((p) => fn(p.s));
      const mk = ctx.mkt(), mkp = ctx.prevMkt();
      const kpis = [
        UI.kpi({ label: "Net Revenue", value: Fmt.brl(cur.net), cur: cur.net, prev: prev && prev.net, hero: true, spark: sp((s) => s.net) }),
        UI.kpi({ label: "Gross Profit", value: Fmt.brl(cur.gp), cur: cur.gp, prev: prev && prev.gp, hero: true, spark: sp((s) => s.gp) }),
        UI.kpi({ label: "Gross Margin", value: Fmt.pct(cur.gm), cur: cur.gm, prev: prev && prev.gm, delta: "pp", hero: true, spark: sp((s) => s.gm) }),
        UI.kpi({ label: "Orders", value: Fmt.num(cur.orders), cur: cur.orders, prev: prev && prev.orders, hero: true, spark: sp((s) => s.orders) }),
        UI.kpi({ label: "Gross Revenue", value: Fmt.brl(cur.gross), cur: cur.gross, prev: prev && prev.gross, spark: sp((s) => s.gross), title: "Item prices before discounts and refunds" }),
        UI.kpi({ label: "Avg Order Value", value: Fmt.brl(cur.aov, 1), cur: cur.aov, prev: prev && prev.aov, spark: sp((s) => s.aov) }),
        UI.kpi({ label: "Return Rate (units)", value: Fmt.pct(cur.returnRate), cur: cur.returnRate, prev: prev && prev.returnRate, goodUp: false, delta: "pp", spark: sp((s) => s.returnRate) }),
        UI.kpi({ label: "Customer Acquisition Cost", value: mk.blendedCac === null ? null : Fmt.brl(mk.blendedCac, 1), cur: mk.blendedCac, prev: mkp && mkp.blendedCac, goodUp: false, naMsg: "No new customers in this selection" }),
      ].join("");
      const tvTabs = ctx.f.cat === null
        ? `<span class="seg" id="tv-tabs" role="group" aria-label="Target view"><button type="button" data-t="month" class="${tvTab === "month" ? "on" : ""}">By month</button><button type="button" data-t="category" class="${tvTab === "category" ? "on" : ""}">By category</button></span>` : "";
      const tvHead = tvTab === "category" && ctx.f.cat === null ? "Net revenue gap by category" : "Net revenue by month: plan vs actual";
      return `<div class="kpis">${kpis}</div>
        <div class="grid">
          ${UI.card("c8", "Revenue and profitability trend", "Net revenue and gross profit by " + ctx.gran + " with the prior period overlaid. Diamonds mark statistically unusual periods. Partial edge periods are omitted.", UI.chartDiv("ov-trend", "tall"), Charts.granSwitch(ctx))}
          ${UI.card("c4", "Executive insights", "Rule-based findings for this selection. Full list on Business Insights.", `<div id="ov-ins"></div>`)}
        </div>
        <div class="grid">
          ${UI.card("c12", "Target vs. actual", "Actuals come from the data. Targets are illustrative planning targets: prior 3-month run-rate + 3% monthly growth (see Data &amp; methodology).",
            `<div class="grid" style="margin-bottom:0"><div class="c5">${targetBlock(ctx)}</div><div class="c7"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:13px">${tvHead}</b>${tvTabs}</div>${ctx.target().available ? UI.chartDiv("tv-chart", "short") : ""}</div></div>`)}
        </div>
        <div class="grid">
          ${UI.card("c8", "Category performance", "Contribution analysis: what each category added to the change in net sales.", `<div id="ov-cat"></div>`)}
          ${UI.card("c4", "Net revenue by " + dimTab, "Select a bar to filter the dashboard.", UI.chartDiv("ov-dim"), `<span class="seg" id="dim-tabs" role="group" aria-label="Dimension"><button type="button" data-d="channel" class="${dimTab === "channel" ? "on" : ""}">Channel</button><button type="button" data-d="region" class="${dimTab === "region" ? "on" : ""}">Region</button></span>`)}
        </div>
        <div class="grid">
          ${UI.card("c4", "Gross margin trend", "Gross profit ÷ net sales.", UI.chartDiv("ov-gm", "short"))}
          ${UI.card("c4", "Order trend", "Orders per " + ctx.gran + " vs prior period.", UI.chartDiv("ov-ord", "short"))}
          ${UI.card("c4", "Return-rate trend", "Returned units ÷ units sold.", UI.chartDiv("ov-rr", "short"))}
        </div>`;
    },
    after(ctx) {
      Charts.bindGran();
      const ser = ctx.series(), x = ser.map((p) => p.label), psr = ctx.prevSeries();
      const tr = [
        { x, y: ser.map((p) => p.s.net), name: "Net revenue", type: "scatter", mode: "lines", line: { color: T.mocha, width: 2.4 }, hovertemplate: "Net revenue: R$ %{y:,.0f}<extra></extra>" },
        { x, y: ser.map((p) => p.s.gp), name: "Gross profit", type: "scatter", mode: "lines", line: { color: T.lavenderDeep, width: 2.2 }, hovertemplate: "Gross profit: R$ %{y:,.0f}<extra></extra>" },
      ];
      if (psr) tr.push({ x: x.slice(0, psr.length), y: psr.map((p) => p.s.net).slice(0, x.length), name: "Net revenue (prior period)", type: "scatter", mode: "lines", line: { color: T.mochaLight, width: 1.4, dash: "dot" }, hovertemplate: "Prior period: R$ %{y:,.0f}<extra></extra>" });
      const an = Analytics.anomalies(ser, (s) => s.net, 8);
      if (an.length) tr.push({ x: an.map((a) => a.label), y: an.map((a) => a.value), name: "Unusual period", type: "scatter", mode: "markers", marker: { symbol: "diamond", size: 11, color: T.neg, line: { color: "#fff", width: 1 } }, customdata: an.map((a) => [a.dev, a.expected]), hovertemplate: "<b>Unusual period</b><br>R$ %{y:,.0f} (%{customdata[0]:+.0%} vs typical R$ %{customdata[1]:,.0f})<extra></extra>" });
      UI.plot("ov-trend", tr, { hovermode: "x unified", yaxis: { title: "R$", tickformat: "~s", rangemode: "tozero", gridcolor: T.grid } });

      const ins = ctx.insights().slice(0, 4);
      document.getElementById("ov-ins").innerHTML = ins.length
        ? ins.map((i) => `<div class="ins ${i.sev}"><div class="ob" style="font-size:12.5px">${i.obs}</div><div class="muted" style="font-size:12px;margin-top:6px"><b style="color:var(--ink)">Action:</b> ${i.action}</div></div>`).join("")
        : UI.note("No rule was triggered for this selection.");

      // target vs actual
      drawTargetChart(ctx);
      document.querySelectorAll("#tv-tabs button").forEach((b) => (b.onclick = () => { tvTab = b.dataset.t; App.render(); }));

      // category table (contribution analysis); row click cross-filters
      const rows = Analytics.contribution(ctx.byCat(), ctx.prev ? M.groupBy(ctx.prevRows, "cat") : new Map(), (k) => D.dims.categories[k]);
      UI.table("ov-cat", {
        id: "ov-cat", rows, sortKey: "net", pageSize: 10, search: false, exportName: "category_performance", cols: [
          { k: "name", label: "Category" },
          { k: "net", label: "Net sales", fmt: (v) => Fmt.brl(v), raw: (v) => Math.round(v) },
          { k: "share", label: "Share", fmt: (v) => Fmt.pct(v), raw: (v) => v },
          { k: "growth", label: "Growth", fmt: (v) => Fmt.spct(v), cls: (r) => (r.growth === null ? "" : r.growth >= 0 ? "cell-pos" : "cell-neg") },
          { k: "contribution", label: "Contrib. (pp)", fmt: (v) => (v === null ? Fmt.NA : Fmt.pp(v)), cls: (r) => (r.contribution === null ? "" : r.contribution >= 0 ? "cell-pos" : "cell-neg") },
          { k: "gm", label: "Margin", fmt: (v) => Fmt.pct(v) },
          { k: "gmChange", label: "Margin Δ", fmt: (v) => (v === null ? Fmt.NA : Fmt.pp(v)), cls: (r) => (r.gmChange === null ? "" : r.gmChange >= 0 ? "cell-pos" : "cell-neg") },
        ],
        onRow: (r) => App.toggle("cat", r.key), hint: "Select a row to filter the dashboard to that category (select again to clear).",
      });
      if (dimTab === "channel") Charts.groupBar("ov-dim", ctx.byCh(), D.dims.channels, "ch", { left: 110 });
      else Charts.groupBar("ov-dim", ctx.byRegion(), D.dims.regions, "region", { left: 90 });
      document.querySelectorAll("#dim-tabs button").forEach((b) => (b.onclick = () => { dimTab = b.dataset.d; App.render(); }));
      Charts.metricLine("ov-gm", ctx, (s) => s.gm, { name: "Gross margin", hover: "%{y:.1%}", tickformat: ".0%", color: T.pos, prior: true, zero: false });
      const ord = [{ x, y: ser.map((p) => p.s.orders), type: "bar", name: "Orders", marker: { color: T.mocha }, hovertemplate: "Orders: %{y:,}<extra></extra>" }];
      if (psr) ord.push({ x: x.slice(0, psr.length), y: psr.map((p) => p.s.orders).slice(0, x.length), type: "scatter", mode: "lines", name: "Prior period", line: { color: T.lavenderDeep, width: 1.8, dash: "dot" }, hovertemplate: "Prior period: %{y:,}<extra></extra>" });
      UI.plot("ov-ord", ord, { hovermode: "x unified" });
      Charts.metricLine("ov-rr", ctx, (s) => s.returnRate, { name: "Return rate", hover: "%{y:.1%}", tickformat: ".0%", color: T.neg });
    },
  };
})();
