/* Product Analytics */
(function () {
  const { Fmt, Theme: T, UI, M } = window;
  const { D, I } = M;

  function skuModal(p, ctx) {
    const lines = [];
    for (const i of ctx.rows) if (I.sku[i] === p.sku) {
      const net = I.price[i] - I.disc[i] - I.refund[i];
      lines.push({ date: M.isoDate(I.day[i]), order: "#" + I.oi[i], region: D.dims.regions[I.region[i]], channel: D.dims.channels[I.ch[i]], price: I.price[i], discount: I.disc[i], net, returned: I.ret[i] ? "Yes" : "No", review: I.score[i] > 0 ? I.score[i] : null });
    }
    const s = M.summarize(ctx.rows.filter((i) => I.sku[i] === p.sku));
    UI.modal(Fmt.esc(p.name), `<div class="mk">
        <div><span>Units</span><b>${Fmt.num(s.units)}</b></div><div><span>Net sales</span><b>${Fmt.brlFull(s.net)}</b></div>
        <div><span>Gross profit</span><b>${Fmt.brlFull(s.gp)}</b></div><div><span>Margin</span><b>${Fmt.pct(s.gm)}</b></div>
        <div><span>Return rate</span><b>${Fmt.pct(s.returnRate)}</b></div><div><span>Discount rate</span><b>${Fmt.pct(s.discRate)}</b></div></div>
      <p class="muted" style="margin:0 0 8px">Order lines in the selected period (${p.category}).</p><div id="sku-lines"></div>`, () => {
      UI.table("sku-lines", { id: "sku-lines", rows: lines, sortKey: "date", pageSize: 10, exportName: "order_lines_" + p.sku, searchKeys: ["order", "region", "channel", "date"],
        cols: [{ k: "date", label: "Date" }, { k: "order", label: "Order" }, { k: "region", label: "Region" }, { k: "channel", label: "Channel" },
          { k: "price", label: "Price", fmt: (v) => Fmt.brl(v, 2) }, { k: "discount", label: "Discount", fmt: (v) => Fmt.brl(v, 2) }, { k: "net", label: "Net", fmt: (v) => Fmt.brl(v, 2) },
          { k: "returned", label: "Returned", cls: (r) => (r.returned === "Yes" ? "cell-neg" : "") }, { k: "review", label: "Review", fmt: (v) => (v === null ? Fmt.NA : v + " ★") }] });
    });
  }

  window.Pages.product = {
    title: "Product Analytics",
    sub: "Which products drive profit, which popular products have weak margins, and where returns are unusually high. Product names are anonymised in the source data.",
    render(ctx) {
      const prods = ctx.prods(), { cur } = ctx;
      const top20 = prods.slice().sort((a, b) => b.gp - a.gp).slice(0, Math.max(1, Math.ceil(prods.length * 0.2)));
      const share = cur.gp > 0 ? top20.reduce((a, p) => a + p.gp, 0) / cur.gp : null;
      return `<div class="kpis">
        ${UI.kpi({ label: "Active SKUs", value: Fmt.num(prods.length), plain: true, hero: true })}
        ${UI.kpi({ label: "Units Sold", value: Fmt.num(cur.units), cur: cur.units, prev: ctx.prev && ctx.prev.units })}
        ${UI.kpi({ label: "Top-20% SKUs' Profit Share", value: Fmt.pct(share, 0), plain: true, title: "Share of gross profit earned by the most profitable 20% of SKUs" })}
        ${UI.kpi({ label: "Return Rate (units)", value: Fmt.pct(cur.returnRate), cur: cur.returnRate, prev: ctx.prev && ctx.prev.returnRate, goodUp: false, delta: "pp" })}
      </div>
      <div class="grid">
        ${UI.card("c8", "Revenue vs margin by SKU", "Each bubble is a SKU with at least 5 units. Size = units, colour = category. Dashed lines: median SKU net revenue and blended margin. Click a legend entry to hide a category.", UI.chartDiv("p-sc", "tall"))}
        ${UI.card("c4", "Category share of revenue vs profit", "Select a bar to filter the dashboard.", UI.chartDiv("p-port", "tall"))}
      </div>
      <div class="grid">
        ${UI.card("c12", "Product performance matrix", "Search, sort, page and export. Red marks margin or return rate clearly worse than average. Select a row to inspect its order lines.", `<div id="p-tbl"></div>`)}
      </div>
      <div class="grid">
        ${UI.card("c6", "Popular products with weak margins", "SKUs with at least 20 units and margin more than 5 pp below blended. Candidates for repricing or cost review.", `<div id="p-weak"></div>`)}
        ${UI.card("c6", "Unusually high return rates", "SKUs with at least 15 units and return rate ≥ max(2× blended, 12%). Small samples are noisy: treat these as leads to investigate.", `<div id="p-ret"></div>`)}
      </div>
      <div class="grid">
        ${UI.card("c6", "Return reasons", "Share of returned units by recorded reason.", UI.chartDiv("p-rr"))}
        ${UI.card("c6", "Reading the quadrants", "", UI.note("<b>High revenue, high margin:</b> protect and promote. <b>High revenue, low margin:</b> review unit cost, discounts and returns before scaling. <b>Low revenue, high margin:</b> candidates for more visibility. <b>Low revenue, low margin:</b> review, but do not discontinue on one metric: check return rate, review scores and the category's role first."))}
      </div>`;
    },
    after(ctx) {
      const { rows, cur } = ctx, prods = ctx.prods(), avgRR = cur.returnRate || 0;
      const pts = prods.filter((p) => p.units >= 5 && p.net > 0);
      if (!UI.emptyIf(pts.length < 3, "p-sc", "Not enough SKUs with at least 5 units in this selection.")) {
        const med = Analytics.median(pts.map((p) => p.net));
        const traces = D.dims.categories.map((c, ci) => { const q = pts.filter((p) => p.category === c); return q.length ? { x: q.map((p) => p.net), y: q.map((p) => p.gm), mode: "markers", type: "scatter", name: c, text: q.map((p) => p.name), marker: { size: q.map((p) => Math.min(34, 6 + Math.sqrt(p.units) * 3.2)), color: T.cat[ci], opacity: 0.75, line: { width: 0.6, color: "#fff" } }, customdata: q.map((p) => [p.units, p.returnRate]), hovertemplate: "<b>%{text}</b><br>Net revenue: R$ %{x:,.0f}<br>Gross margin: %{y:.1%}<br>Units: %{customdata[0]}<br>Return rate: %{customdata[1]:.1%}<extra></extra>" } : null; }).filter(Boolean);
        UI.plot("p-sc", traces, { xaxis: { title: "Net revenue (R$, log scale)", type: "log", gridcolor: T.grid, tickvals: [30, 100, 300, 1000, 3000, 10000, 30000], ticktext: ["30", "100", "300", "1K", "3K", "10K", "30K"] }, yaxis: { title: "Gross margin", tickformat: ".0%", gridcolor: T.grid },
          shapes: [{ type: "line", x0: med, x1: med, yref: "paper", y0: 0, y1: 1, line: { color: T.muted, dash: "dash", width: 1 } }, { type: "line", xref: "paper", x0: 0, x1: 1, y0: cur.gm, y1: cur.gm, line: { color: T.muted, dash: "dash", width: 1 } }],
          legend: { orientation: "h", y: 1.14 } });
      }
      const arr = Array.from(ctx.byCat().entries()).sort((a, b) => a[1].net - b[1].net);
      UI.plot("p-port", [
        { type: "bar", orientation: "h", name: "Share of net revenue", y: arr.map((a) => D.dims.categories[a[0]]), x: arr.map((a) => a[1].net / cur.net), marker: { color: T.mochaLight }, customdata: arr.map((a) => a[0]), hovertemplate: "<b>%{y}</b><br>Revenue share: %{x:.1%}<extra></extra>" },
        { type: "bar", orientation: "h", name: "Share of gross profit", y: arr.map((a) => D.dims.categories[a[0]]), x: arr.map((a) => (cur.gp > 0 ? a[1].gp / cur.gp : 0)), marker: { color: T.mocha }, customdata: arr.map((a) => a[0]), hovertemplate: "<b>%{y}</b><br>Profit share: %{x:.1%}<extra></extra>" },
      ], { barmode: "group", xaxis: { tickformat: ".0%", gridcolor: T.grid }, margin: { l: 125, r: 10, t: 6, b: 30 } }, (e) => App.toggle("cat", e.points[0].customdata));

      const open = (p) => skuModal(p, ctx);
      UI.table("p-tbl", { id: "prod", rows: prods, sortKey: "net", pageSize: 15, exportName: "product_performance", searchKeys: ["name", "category"], onRow: open,
        cols: [{ k: "name", label: "Product" }, { k: "category", label: "Category" }, { k: "units", label: "Units", fmt: Fmt.num },
          { k: "net", label: "Net revenue", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) }, { k: "gp", label: "Gross profit", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) },
          { k: "gm", label: "Margin", fmt: (v) => Fmt.pct(v), cls: (r) => (r.gm !== null && cur.gm !== null && r.units >= 5 && r.gm < cur.gm - 0.1 ? "cell-neg" : r.gm !== null && r.units >= 5 && r.gm > cur.gm + 0.1 ? "cell-pos" : "") },
          { k: "returnRate", label: "Return rate", fmt: (v) => Fmt.pct(v), cls: (r) => (r.units >= 15 && r.returnRate >= Math.max(2 * avgRR, 0.12) ? "cell-neg" : "") },
          { k: "discRate", label: "Discount rate", fmt: (v) => Fmt.pct(v) }, { k: "revShare", label: "% revenue", fmt: (v) => Fmt.pct(v, 2) }, { k: "gpShare", label: "% profit", fmt: (v) => Fmt.pct(v, 2) }] });
      const weak = prods.filter((p) => p.units >= 20 && p.gm !== null && cur.gm !== null && p.gm < cur.gm - 0.05);
      const wcols = [{ k: "name", label: "Product" }, { k: "units", label: "Units", fmt: Fmt.num }, { k: "net", label: "Net revenue", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) }, { k: "gm", label: "Margin", fmt: (v) => Fmt.pct(v), cls: () => "cell-neg" }, { k: "discRate", label: "Discount", fmt: (v) => Fmt.pct(v) }];
      if (weak.length) UI.table("p-weak", { id: "p-weak", rows: weak, sortKey: "units", pageSize: 8, search: false, exportName: "weak_margin_skus", cols: wcols, onRow: open });
      else document.getElementById("p-weak").innerHTML = UI.note("No SKU meets the rule in this selection.");
      const out = prods.filter((p) => p.units >= 15 && p.returnRate >= Math.max(2 * avgRR, 0.12));
      if (out.length) UI.table("p-ret", { id: "p-ret", rows: out, sortKey: "refunds", pageSize: 8, search: false, exportName: "high_return_skus", onRow: open,
        cols: [{ k: "name", label: "Product" }, { k: "units", label: "Units", fmt: Fmt.num }, { k: "returnRate", label: "Return rate", fmt: (v) => Fmt.pct(v), cls: () => "cell-neg" }, { k: "refunds", label: "Refunded", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) }, { k: "gm", label: "Margin", fmt: (v) => Fmt.pct(v) }] });
      else document.getElementById("p-ret").innerHTML = UI.note("No SKU meets the outlier rule in this selection.");
      const rc = new Array(D.dims.returnReasons.length).fill(0);
      for (const i of rows) if (I.ret[i]) rc[I.rr[i]]++;
      const tot = rc.reduce((a, b) => a + b, 0);
      if (!UI.emptyIf(tot === 0, "p-rr", "No returns in this selection.")) {
        const ri = D.dims.returnReasons.map((r, i) => i).filter((i) => i > 0).sort((a, b) => rc[a] - rc[b]);
        UI.plot("p-rr", [{ type: "bar", orientation: "h", y: ri.map((i) => D.dims.returnReasons[i]), x: ri.map((i) => rc[i] / tot), marker: { color: T.mocha }, customdata: ri.map((i) => rc[i]), hovertemplate: "<b>%{y}</b><br>%{x:.1%} of returns (%{customdata} units)<extra></extra>" }],
          { xaxis: { tickformat: ".0%", gridcolor: T.grid }, margin: { l: 170, r: 10, t: 4, b: 30 } });
      }
    },
  };
})();
