/* Sales Intelligence */
(function () {
  const { Fmt, Theme: T, UI, M, Charts, Analytics } = window;
  const { D, I } = M;

  window.Pages.sales = {
    title: "Sales Intelligence",
    sub: "Where revenue comes from, whether growth is driven by orders or order value, and whether discounts and returns erode it.",
    render(ctx) {
      const { cur, prev } = ctx, ser = ctx.series(), sp = (fn) => ser.map((p) => fn(p.s));
      const growth = prev && prev.net ? cur.net / prev.net - 1 : null;
      return `<div class="kpis">
        ${UI.kpi({ label: "Gross Sales", value: Fmt.brl(cur.gross), cur: cur.gross, prev: prev && prev.gross, hero: true, spark: sp((s) => s.gross) })}
        ${UI.kpi({ label: "Discounts", value: Fmt.brl(cur.discounts), cur: cur.discounts, prev: prev && prev.discounts, goodUp: false, spark: sp((s) => s.discounts) })}
        ${UI.kpi({ label: "Returns & Refunds", value: Fmt.brl(cur.refunds), cur: cur.refunds, prev: prev && prev.refunds, goodUp: false, spark: sp((s) => s.refunds) })}
        ${UI.kpi({ label: "Net Sales", value: Fmt.brl(cur.net), cur: cur.net, prev: prev && prev.net, hero: true, spark: sp((s) => s.net) })}
        ${UI.kpi({ label: "Orders", value: Fmt.num(cur.orders), cur: cur.orders, prev: prev && prev.orders, spark: sp((s) => s.orders) })}
        ${UI.kpi({ label: "Avg Order Value", value: Fmt.brl(cur.aov, 1), cur: cur.aov, prev: prev && prev.aov, spark: sp((s) => s.aov) })}
        ${UI.kpi({ label: "Net Sales Growth", value: growth === null ? null : Fmt.spct(growth), cur: growth, prev: null, plain: true, naMsg: "Needs an earlier comparison period" })}
        ${UI.kpi({ label: "Units Sold", value: Fmt.num(cur.units), cur: cur.units, prev: prev && prev.units, spark: sp((s) => s.units) })}
      </div>
      <div class="grid">
        ${UI.card("c8", "Net sales vs prior period", "Prior period is overlaid on the same axis. Hover for exact values.", UI.chartDiv("s-trend", "tall"), Charts.granSwitch(ctx))}
        ${UI.card("c4", "Gross to net sales bridge", "How discounts and refunds reduce reported revenue, and the profit left after cost.", UI.chartDiv("s-wf", "tall"))}
      </div>
      <div class="grid">
        ${UI.card("c6", "Is growth driven by orders or order value?", "Exact decomposition: ΔNet = Δorders × prior AOV + current orders × ΔAOV.", `<div id="s-decomp"></div>${UI.chartDiv("s-oa", "short")}`)}
        ${UI.card("c6", "Discount depth vs gross margin", "Each point is one " + (ctx.series("week").length >= 6 ? "week" : "day") + ". A downward line means deeper discounts coincide with lower margin.", UI.chartDiv("s-dm"))}
      </div>
      <div class="grid">
        ${UI.card("c4", "Net sales by category", "Select a bar to filter the dashboard.", UI.chartDiv("s-cat"))}
        ${UI.card("c4", "Channel economics", "Net sales (bars) and gross margin (markers). Select a bar to filter.", UI.chartDiv("s-ch"))}
        ${UI.card("c4", "Net sales growth by region", "Change vs prior period. Hover for net sales.", UI.chartDiv("s-reg"))}
      </div>
      <div class="grid">
        ${UI.card("c12", "Segment performance: category × region", "Segments with at least 20 units in both periods, ranked by growth. Select a row to filter the dashboard to that segment.", `<div id="s-seg"></div>`)}
      </div>`;
    },
    after(ctx) {
      Charts.bindGran();
      const { cur, prev, pr } = ctx;
      Charts.metricLine("s-trend", ctx, (s) => s.net, { name: "Net sales", hover: "R$ %{y:,.0f}", tickformat: "~s", layout: { yaxis: { title: "R$", tickformat: "~s", rangemode: "tozero", gridcolor: T.grid } } });

      // waterfall
      const vals = [cur.gross, -cur.discounts, -cur.refunds, cur.net, -cur.cogs, cur.gp];
      UI.plot("s-wf", [{ type: "waterfall", x: ["Gross sales", "Discounts", "Refunds", "Net sales", "Cost of goods", "Gross profit"], measure: ["absolute", "relative", "relative", "total", "relative", "total"],
        y: [cur.gross, -cur.discounts, -cur.refunds, 0, -cur.cogs, 0], connector: { line: { color: T.grid } },
        increasing: { marker: { color: T.pos } }, decreasing: { marker: { color: T.neg } }, totals: { marker: { color: T.mocha } },
        text: vals.map((v, i) => (i === 0 || i === 3 || i === 5 ? Fmt.brl(v) : "−" + Fmt.brl(-v))), textposition: "outside", textfont: { color: T.ink }, hoverinfo: "x+text" }],
        { margin: { l: 56, r: 10, t: 14, b: 76 }, yaxis: { tickformat: "~s", gridcolor: T.grid }, xaxis: { tickangle: -35 } });

      // decomposition
      const dec = document.getElementById("s-decomp");
      if (prev && prev.orders && prev.net) {
        const dN = cur.net - prev.net, volume = (cur.orders - prev.orders) * prev.aov, value = cur.orders * (cur.aov - prev.aov);
        dec.innerHTML = UI.note(`Net sales changed by <b class="${dN >= 0 ? "pos" : "neg"}">${dN >= 0 ? "+" : "−"}${Fmt.brlFull(Math.abs(dN))}</b> (${Fmt.spct(dN / prev.net)}): order volume contributed <b class="${volume >= 0 ? "pos" : "neg"}">${Fmt.brlFull(volume)}</b> and order value (AOV) <b class="${value >= 0 ? "pos" : "neg"}">${Fmt.brlFull(value)}</b>. ${Math.abs(volume) >= Math.abs(value) ? "This is mainly a <b>volume</b> story." : "This is mainly an <b>order-value</b> story."}`) + '<div style="height:8px"></div>';
      } else dec.innerHTML = UI.note("Needs a prior comparison period inside the data window.") + '<div style="height:8px"></div>';
      const ser = ctx.series(), x = ser.map((p) => p.label);
      UI.plot("s-oa", [
        { x, y: ser.map((p) => p.s.orders), type: "bar", name: "Orders", marker: { color: T.mochaLight }, hovertemplate: "Orders: %{y:,}<extra></extra>" },
        { x, y: ser.map((p) => p.s.aov), name: "AOV (R$)", yaxis: "y2", mode: "lines", line: { color: T.mocha, width: 2 }, connectgaps: false, hovertemplate: "AOV: R$ %{y:,.1f}<extra></extra>" },
      ], { hovermode: "x unified", yaxis: { title: "Orders", gridcolor: T.grid }, yaxis2: { overlaying: "y", side: "right", title: "AOV (R$)", rangemode: "tozero" } });

      // discount vs margin
      let pts = ctx.series("week").filter((p) => p.s.net > 0);
      if (pts.length < 6) pts = ctx.series("day").filter((p) => p.s.net > 0 && p.s.orders >= 3);
      if (!UI.emptyIf(pts.length < 4, "s-dm", "Needs at least four periods with sales.")) {
        const xs = pts.map((p) => p.s.discRate), ys = pts.map((p) => p.s.gm), lr = Analytics.linreg(xs, ys);
        const tr = [{ x: xs, y: ys, text: pts.map((p) => p.label), mode: "markers", type: "scatter", name: "Period", marker: { size: 10, color: T.lavenderDeep, line: { color: T.mocha, width: 1 } }, hovertemplate: "<b>%{text}</b><br>Discount rate: %{x:.1%}<br>Gross margin: %{y:.1%}<extra></extra>" }];
        if (lr) { const x0 = Math.min(...xs), x1 = Math.max(...xs); tr.push({ x: [x0, x1], y: [lr.intercept + lr.slope * x0, lr.intercept + lr.slope * x1], mode: "lines", name: "Linear fit" + (lr.r2 !== null ? ` (R² ${lr.r2.toFixed(2)})` : ""), line: { color: T.mocha, dash: "dash", width: 1.5 }, hoverinfo: "skip" }); }
        UI.plot("s-dm", tr, { xaxis: { title: "Discount rate (% of gross sales)", tickformat: ".1%", gridcolor: T.grid }, yaxis: { title: "Gross margin", tickformat: ".0%", gridcolor: T.grid } });
      }

      // category / channel / region
      Charts.groupBar("s-cat", ctx.byCat(), D.dims.categories, "cat", { left: 120 });
      const hArr = Array.from(ctx.byCh().entries());
      UI.plot("s-ch", [
        { type: "bar", x: hArr.map((a) => D.dims.channels[a[0]]), y: hArr.map((a) => a[1].net), name: "Net sales", marker: { color: hArr.map((a) => (App.f.ch === a[0] ? T.mocha : T.mochaLight)) }, customdata: hArr.map((a) => a[0]), hovertemplate: "<b>%{x}</b><br>Net sales: R$ %{y:,.0f}<extra></extra>" },
        { type: "scatter", mode: "markers+text", x: hArr.map((a) => D.dims.channels[a[0]]), y: hArr.map((a) => a[1].gm), yaxis: "y2", name: "Gross margin", marker: { color: T.lavenderDeep, size: 12 }, text: hArr.map((a) => Fmt.pct(a[1].gm)), textposition: "top center", textfont: { color: T.ink }, hovertemplate: "Gross margin: %{y:.1%}<extra></extra>" },
      ], { yaxis: { tickformat: "~s", gridcolor: T.grid }, yaxis2: { overlaying: "y", side: "right", tickformat: ".0%", range: [0, 0.6] }, margin: { l: 50, r: 46, t: 8, b: 40 } }, (e) => e.points[0].customdata !== undefined && App.toggle("ch", e.points[0].customdata));
      if (!pr.available) UI.emptyIf(true, "s-reg", "Needs a prior comparison period.");
      else {
        const prR = M.groupBy(ctx.prevRows, "region");
        const arr = Array.from(ctx.byRegion().entries()).map(([k, s]) => ({ k, g: prR.get(k) && prR.get(k).net ? s.net / prR.get(k).net - 1 : null, net: s.net, prev: prR.get(k) ? prR.get(k).net : 0 })).filter((a) => a.g !== null);
        if (!UI.emptyIf(!arr.length, "s-reg", "No region has sales in both periods."))
          UI.plot("s-reg", [{ type: "bar", x: arr.map((a) => D.dims.regions[a.k]), y: arr.map((a) => a.g), marker: { color: arr.map((a) => (a.g >= 0 ? T.pos : T.neg)) }, customdata: arr.map((a) => [a.net, a.prev, a.k]), hovertemplate: "<b>%{x}</b><br>Growth: %{y:+.1%}<br>Net sales: R$ %{customdata[0]:,.0f}<br>Prior: R$ %{customdata[1]:,.0f}<extra></extra>" }],
            { yaxis: { tickformat: ".0%", gridcolor: T.grid }, margin: { l: 56, r: 10, t: 8, b: 50 } }, (e) => App.toggle("region", e.points[0].customdata[2]));
      }

      // segments table
      const host = document.getElementById("s-seg");
      if (!pr.available) { host.innerHTML = UI.note("Needs a prior comparison period."); return; }
      const key = (i) => I.cat[i] * 10 + I.region[i];
      const agg = (rs) => { const m = new Map(); for (const i of rs) { const k = key(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); } return m; };
      const a = agg(ctx.rows), b = agg(ctx.prevRows), out = [];
      for (const [k, r] of a) { const s = M.summarize(r), p = b.get(k) ? M.summarize(b.get(k)) : null; if (s.units >= 20 && p && p.units >= 20 && p.net > 0) out.push({ name: `${D.dims.categories[Math.floor(k / 10)]} · ${D.dims.regions[k % 10]}`, cat: Math.floor(k / 10), region: k % 10, net: s.net, prevNet: p.net, growth: s.net / p.net - 1, gm: s.gm, units: s.units }); }
      if (!out.length) { host.innerHTML = UI.note("No segment has at least 20 units in both periods."); return; }
      UI.table(host, { id: "sales-seg", rows: out, sortKey: "growth", pageSize: 10, exportName: "segment_performance",
        cols: [{ k: "name", label: "Segment" }, { k: "net", label: "Net sales", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) }, { k: "prevNet", label: "Prior net sales", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) },
          { k: "growth", label: "Growth", fmt: (v) => Fmt.spct(v), cls: (r) => (r.growth >= 0 ? "cell-pos" : "cell-neg") }, { k: "gm", label: "Margin", fmt: (v) => Fmt.pct(v) }, { k: "units", label: "Units", fmt: Fmt.num }],
        onRow: (r) => { App.f.cat = r.cat; App.f.region = r.region; App.render(); }, hint: "Select a row to filter the dashboard to that category and region." });
    },
  };
})();
