/* Customer Intelligence */
(function () {
  const { Fmt, Theme: T, UI, M, Charts } = window;
  const { D } = M;

  function segmentModal(seg) {
    const rows = seg.list.map((c) => ({ id: "Customer #" + c.cu, recency: c.recency, orders: c.orders, spend: c.spend, r: c.r, f: c.f, m: c.m }));
    UI.modal(`${Fmt.esc(seg.name)}: ${Fmt.num(seg.customers)} customers`, `<div class="mk"><div><span>Customers</span><b>${Fmt.num(seg.customers)}</b></div><div><span>Share of customers</span><b>${Fmt.pct(seg.share)}</b></div><div><span>Net sales</span><b>${Fmt.brlFull(seg.revenue)}</b></div><div><span>Avg recency</span><b>${seg.avgRecency === null ? Fmt.NA : Math.round(seg.avgRecency) + " days"}</b></div></div><div id="seg-list"></div>`, () => {
      UI.table("seg-list", { id: "seg-list", rows, sortKey: "spend", pageSize: 10, exportName: "rfm_" + seg.name.toLowerCase().replace(/\W+/g, "_"), searchKeys: ["id"], cols: [
        { k: "id", label: "Customer" }, { k: "recency", label: "Days since last order", fmt: Fmt.num }, { k: "orders", label: "Orders", fmt: Fmt.num },
        { k: "spend", label: "Net sales", fmt: (v) => Fmt.brl(v, 2) }, { k: "r", label: "R" }, { k: "f", label: "F" }, { k: "m", label: "M" }] });
    });
  }

  window.Pages.customer = {
    title: "Customer Intelligence",
    sub: "Do customers come back, who is at risk of lapsing, and how concentrated is value? Customers are identified by Olist's customer_unique_id.",
    render(ctx) {
      const { cur, prev } = ctx;
      let retention = null;
      if (prev && prev.customers) { let n = 0; for (const c of prev.custSet) if (cur.custSet.has(c)) n++; retention = n / prev.customers; }
      const cv = ctx.customerValue(), gpc = cur.customers ? cur.gp / cur.customers : null;
      return `<div class="kpis">
        ${UI.kpi({ label: "Total Customers", value: Fmt.num(cur.customers), cur: cur.customers, prev: prev && prev.customers, hero: true })}
        ${UI.kpi({ label: "New Customers", value: Fmt.num(cur.newCustomers), cur: cur.newCustomers, prev: prev && prev.newCustomers })}
        ${UI.kpi({ label: "Repeat Purchase Rate", value: Fmt.pct(cur.repeatRate), cur: cur.repeatRate, prev: prev && prev.repeatRate, delta: "pp", hero: true })}
        ${UI.kpi({ label: "Retention Rate", value: retention === null ? null : Fmt.pct(retention), cur: retention, prev: null, plain: true, naMsg: "Needs a prior period", title: "Share of prior-period customers who purchased again in this period" })}
        ${UI.kpi({ label: "Avg Revenue / Customer", value: Fmt.brl(cur.arpc, 1), cur: cur.arpc, prev: prev && prev.arpc })}
        ${UI.kpi({ label: "Purchase Frequency", value: cur.freq === null ? null : cur.freq.toFixed(3), cur: cur.freq, prev: prev && prev.freq })}
        ${UI.kpi({ label: "Gross Profit / Customer", value: Fmt.brl(gpc, 1), cur: gpc, prev: prev && prev.customers ? prev.gp / prev.customers : null, title: "Observed gross profit per customer in the period (a descriptive lifetime-value proxy)" })}
        ${UI.kpi({ label: "Top-10% Customers' Share", value: Fmt.pct(cv.top10Share, 0), plain: true, title: "Share of net sales from the top decile of customers" })}
      </div>
      <div class="grid">
        ${UI.card("c7", "New vs returning customers", "Customers per month by whether the order was their first. Partial months at the edges are omitted.", UI.chartDiv("c-nr", "tall"))}
        ${UI.card("c5", "Customer value distribution", "Net spend per customer (clipped at the 99th percentile). The dashed line marks the top-10% cut-off.", UI.chartDiv("c-hist", "tall"))}
      </div>
      <div class="grid">
        ${UI.card("c6", "RFM segments", "Share of customers vs share of revenue, as of the end of the period.", UI.chartDiv("c-rfm"))}
        ${UI.card("c6", "RFM segment detail", "Select a row to list its customers. Scoring rules are below.", `<div id="c-rfmt"></div><div class="defs" id="c-rules" style="margin-top:10px"></div>`)}
      </div>
      <div class="grid">
        ${UI.card("c12", "Cohort retention by first-purchase month", "Share of each cohort's customers who purchased again N months after their first purchase. Blank = not yet observable. Cohorts begin inside the selected period.", UI.chartDiv("c-coh", "tall"))}
      </div>`;
    },
    after(ctx) {
      const ser = ctx.series("month"), x = ser.map((p) => p.label);
      UI.plot("c-nr", [
        { x, y: ser.map((p) => p.s.newCustomers), type: "bar", name: "New customers", marker: { color: T.mocha }, hovertemplate: "New: %{y:,}<extra></extra>" },
        { x, y: ser.map((p) => p.s.returningCustomers), type: "bar", name: "Returning customers", marker: { color: T.lavenderDeep }, hovertemplate: "Returning: %{y:,}<extra></extra>" },
      ], { barmode: "stack", hovermode: "x unified", yaxis: { title: "Customers", gridcolor: T.grid } });

      const cv = ctx.customerValue(), vs = cv.values.slice().reverse(), cap = vs[Math.floor(vs.length * 0.99)] || vs[vs.length - 1];
      UI.plot("c-hist", [{ x: vs.filter((v) => v <= cap), type: "histogram", nbinsx: 40, marker: { color: T.lavenderDeep }, hovertemplate: "Spend R$ %{x}<br>%{y:,} customers<extra></extra>" }],
        { xaxis: { title: "Net spend per customer (R$)", gridcolor: T.grid }, yaxis: { title: "Customers", gridcolor: T.grid }, bargap: 0.04,
          shapes: [{ type: "line", x0: cv.top10Cut, x1: cv.top10Cut, yref: "paper", y0: 0, y1: 1, line: { color: T.mocha, dash: "dash" } }],
          annotations: [{ x: cv.top10Cut, y: 1, yref: "paper", text: "top 10% cut-off", showarrow: false, font: { color: T.mocha, size: 11 }, xanchor: "left" }] });

      const seg = ctx.rfm(), totRev = seg.reduce((a, s) => a + s.revenue, 0);
      UI.plot("c-rfm", [
        { type: "bar", name: "% of customers", x: seg.map((s) => s.name), y: seg.map((s) => s.share), marker: { color: T.mochaLight }, hovertemplate: "<b>%{x}</b><br>%{y:.1%} of customers<extra></extra>" },
        { type: "bar", name: "% of revenue", x: seg.map((s) => s.name), y: seg.map((s) => (totRev ? s.revenue / totRev : 0)), marker: { color: T.mocha }, hovertemplate: "<b>%{x}</b><br>%{y:.1%} of revenue<extra></extra>" },
      ], { barmode: "group", yaxis: { tickformat: ".0%", gridcolor: T.grid }, margin: { l: 50, r: 10, t: 10, b: 90 } });
      UI.table("c-rfmt", { id: "c-rfmt", rows: seg, sortKey: "revenue", pageSize: 6, search: false, exportName: "rfm_segments", onRow: segmentModal, hint: "Select a segment to list its customers.", cols: [
        { k: "name", label: "Segment" }, { k: "customers", label: "Customers", fmt: Fmt.num }, { k: "share", label: "Share", fmt: (v) => Fmt.pct(v) },
        { k: "revenue", label: "Net sales", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) }, { k: "avgRecency", label: "Avg recency", fmt: (v) => (v === null ? Fmt.NA : Math.round(v) + " d") }, { k: "avgOrders", label: "Avg orders", fmt: (v) => (v === null ? Fmt.NA : v.toFixed(2)) }] });
      const c = D.rfm;
      document.getElementById("c-rules").innerHTML = `<b style="color:var(--ink)">Scoring (1–5).</b> Recency (days since last order): ≤${c.recency_cuts_days[0]}→5, ≤${c.recency_cuts_days[1]}→4, ≤${c.recency_cuts_days[2]}→3, ≤${c.recency_cuts_days[3]}→2, else 1. Frequency (orders): 1→1, 2→3, 3→4, 4+→5. Monetary (net R$): &lt;${c.monetary_cuts_brl[0]}→1, &lt;${c.monetary_cuts_brl[1]}→2, &lt;${c.monetary_cuts_brl[2]}→3, &lt;${c.monetary_cuts_brl[3]}→4, else 5.<br><b style="color:var(--ink)">Segments (first match).</b> Champions R≥4 &amp; F≥4 · Loyal F≥3 &amp; R≥3 · At-Risk F≥3 &amp; R≤2, or R≤2 &amp; M≥4 · New F=1 &amp; R=5 · Potential Loyalists F=1 &amp; R∈{3,4} · otherwise Hibernating. About 98% of customers buy once, so the upper segments are inherently small. No customer is labelled "churned": the data window does not support that claim.`;

      const co = M.cohorts(ctx.f);
      if (!UI.emptyIf(!co.length, "c-coh", "No cohorts begin inside this period.")) {
        const z = co.map((r) => r.cells.map((v, j) => (j === 0 ? null : v)));
        const vals = z.flat().filter((v) => v !== null);
        UI.plot("c-coh", [{ type: "heatmap", z, x: z[0].map((_, j) => "M+" + j), y: co.map((r) => `${r.label} (n=${r.size})`), colorscale: T.seq, zmin: 0, zmax: Math.max(0.03, ...vals), xgap: 2, ygap: 2, hoverongaps: false,
          text: z.map((r) => r.map((v) => (v === null ? "" : (v * 100).toFixed(1) + "%"))), texttemplate: "%{text}", colorbar: { tickformat: ".0%", thickness: 12 }, hovertemplate: "Cohort %{y}<br>%{x}: %{z:.2%} returned<extra></extra>" }],
          { margin: { l: 130, r: 10, t: 6, b: 40 }, yaxis: { autorange: "reversed", showgrid: false }, xaxis: { showgrid: false } });
      }
    },
  };
})();
