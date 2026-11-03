/* Marketing Performance */
(function () {
  const { Fmt, Theme: T, UI, M, Charts } = window;
  const { D, I } = M;

  window.Pages.marketing = {
    title: "Marketing Performance",
    sub: "Spend efficiency by channel. Attribution is last-touch and descriptive: it shows where revenue was credited, not what it would have been without the spend.",
    disabledFilters: ["ch"],
    render(ctx) {
      const { cur } = ctx, mk = ctx.mkt(), mkp = ctx.prevMkt();
      const roi = mk.totalSpend > 0 ? (mk.per.filter((p) => p.spend > 0).reduce((a, p) => a + p.gp, 0) - mk.totalSpend) / mk.totalSpend : null;
      const roiP = mkp && mkp.totalSpend > 0 ? (mkp.per.filter((p) => p.spend > 0).reduce((a, p) => a + p.gp, 0) - mkp.totalSpend) / mkp.totalSpend : null;
      const paidShare = cur.net > 0 ? mk.attributedRevenue / cur.net : null;
      return `<div class="kpis">
        ${UI.kpi({ label: "Marketing Spend", value: Fmt.brl(mk.totalSpend), cur: mk.totalSpend, prev: mkp && mkp.totalSpend, goodUp: false, hero: true })}
        ${UI.kpi({ label: "Attributed Revenue (paid)", value: Fmt.brl(mk.attributedRevenue), cur: mk.attributedRevenue, prev: mkp && mkp.attributedRevenue })}
        ${UI.kpi({ label: "ROAS", value: Fmt.x(mk.paidRoas), cur: mk.paidRoas, prev: mkp && mkp.paidRoas, hero: true, naMsg: "No spend in this selection", title: "Attributed revenue ÷ ad spend" })}
        ${UI.kpi({ label: "Customer Acquisition Cost", value: mk.blendedCac === null ? null : Fmt.brl(mk.blendedCac, 1), cur: mk.blendedCac, prev: mkp && mkp.blendedCac, goodUp: false, naMsg: "No new customers in this selection", title: "Spend ÷ new customers" })}
        ${UI.kpi({ label: "Cost per Order", value: mk.costPerOrder === null ? null : Fmt.brl(mk.costPerOrder, 1), cur: mk.costPerOrder, prev: mkp && mkp.costPerOrder, goodUp: false, title: "Spend ÷ all orders" })}
        ${UI.kpi({ label: "New Customers Acquired", value: Fmt.num(cur.newCustomers), cur: cur.newCustomers, prev: ctx.prev && ctx.prev.newCustomers })}
        ${UI.kpi({ label: "Marketing ROI", value: roi === null ? null : Fmt.pct(roi, 0), cur: roi, prev: roiP, delta: "pp", naMsg: "No spend in this selection", title: "(Gross profit of paid-attributed orders − spend) ÷ spend" })}
        ${UI.kpi({ label: "Paid Share of Net Revenue", value: Fmt.pct(paidShare, 0), plain: true, title: "Net revenue attributed to paid channels ÷ total net revenue" })}
      </div>
      <div class="grid">
        ${UI.card("c7", "Marketing spend vs attributed revenue", "Monthly. Attributed revenue = net sales credited to paid channels (last touch). Partial edge months are omitted.", UI.chartDiv("m-sr", "tall"))}
        ${UI.card("c5", "ROAS by channel", "Attributed revenue ÷ spend. ROAS measures revenue per R$ of spend; it is not profit return (see ROI).", UI.chartDiv("m-roas", "tall"))}
      </div>
      <div class="grid">
        ${UI.card("c6", "CAC by acquisition channel", "Spend ÷ new customers whose first order was credited to the channel.", UI.chartDiv("m-cac"))}
        ${UI.card("c6", "Spend vs new customers", "Monthly. Both series move with overall sales volume; this does not show that spend caused acquisitions.", UI.chartDiv("m-nc"))}
      </div>
      <div class="grid">
        ${UI.card("c7", "Channel ranking", "Ranked by ROAS. ROI uses gross profit: (gross profit − spend) ÷ spend. Campaign-level data is not available, so ranking is by channel.", `<div id="m-tbl"></div>`)}
        ${UI.card("c5", "Revenue by marketing channel", "Share of net revenue credited to each channel, including organic / direct.", UI.chartDiv("m-mix"))}
      </div>
      <div class="grid">
        ${UI.card("c12", "How to read these metrics", "", `<div class="defs"><code>ROAS</code> = attributed revenue ÷ ad spend. <code>ROI</code> = (gross profit − spend) ÷ spend. <code>CAC</code> = spend ÷ <i>new customers</i>. <code>Cost per order</code> = spend ÷ <i>all orders</i>. <i>Attributed</i> revenue is what a tracking rule credits to a channel; <i>incremental</i> revenue is what would not have happened without the spend and needs a holdout or geo experiment. Impressions, clicks and conversion rates are not tracked in this dataset, so no funnel is shown.</div>`)}
      </div>`;
    },
    after(ctx) {
      const mk = ctx.mkt(), ser = ctx.series("month"), x = ser.map((p) => p.label);
      const attr = {};
      for (const i of ctx.rows) { if (D.dims.mktChannels[I.mk[i]] === "Organic / Direct") continue; const mo = M.isoDate(I.day[i]).slice(0, 7); attr[mo] = (attr[mo] || 0) + I.price[i] - I.disc[i] - I.refund[i]; }
      const spendM = (m) => mk.spendByMonth[m] || 0;
      const mkey = ser.map((p) => M.isoDate(p.key).slice(0, 7));
      UI.plot("m-sr", [
        { x, y: mkey.map(spendM), type: "bar", name: "Spend", marker: { color: T.lavenderMid }, hovertemplate: "Spend: R$ %{y:,.0f}<extra></extra>" },
        { x, y: mkey.map((m) => attr[m] || 0), type: "scatter", mode: "lines+markers", name: "Attributed revenue", line: { color: T.mocha, width: 2.2 }, hovertemplate: "Attributed revenue: R$ %{y:,.0f}<extra></extra>" },
      ], { hovermode: "x unified", yaxis: { title: "R$", tickformat: "~s", gridcolor: T.grid } });
      const valid = mk.per.filter((p) => p.spend > 0);
      if (!UI.emptyIf(!valid.length, "m-roas", "No spend in the selected period.")) {
        const s = valid.slice().sort((a, b) => a.roas - b.roas);
        UI.plot("m-roas", [{ type: "bar", orientation: "h", y: s.map((p) => p.name), x: s.map((p) => p.roas), marker: { color: T.mocha }, text: s.map((p) => Fmt.x(p.roas)), textposition: "outside", cliponaxis: false, customdata: s.map((p) => [p.spend, p.attributed]), hovertemplate: "<b>%{y}</b><br>ROAS: %{x:.2f}x<br>Spend: R$ %{customdata[0]:,.0f}<br>Attributed: R$ %{customdata[1]:,.0f}<extra></extra>" }],
          { margin: { l: 120, r: 40, t: 4, b: 36 }, xaxis: { title: "ROAS (attributed revenue ÷ spend)", gridcolor: T.grid, range: [0, Math.max(...s.map((p) => p.roas)) * 1.18] } });
        const c = valid.filter((p) => p.cac !== null).sort((a, b) => a.cac - b.cac);
        if (!UI.emptyIf(!c.length, "m-cac", "No new customers credited in this period."))
          UI.plot("m-cac", [{ type: "bar", x: c.map((p) => p.name), y: c.map((p) => p.cac), marker: { color: T.lavenderDeep }, text: c.map((p) => Fmt.brl(p.cac, 0)), textposition: "outside", cliponaxis: false, customdata: c.map((p) => p.newCustomers), hovertemplate: "<b>%{x}</b><br>CAC: R$ %{y:,.1f}<br>New customers: %{customdata:,}<extra></extra>" }], { yaxis: { title: "R$ per new customer", gridcolor: T.grid } });
      } else UI.emptyIf(true, "m-cac", "No spend in the selected period.");
      UI.plot("m-nc", [
        { x, y: mkey.map(spendM), type: "bar", name: "Spend (R$)", marker: { color: T.lavenderMid }, hovertemplate: "Spend: R$ %{y:,.0f}<extra></extra>" },
        { x, y: ser.map((p) => p.s.newCustomers), type: "scatter", mode: "lines+markers", name: "New customers", yaxis: "y2", line: { color: T.mocha, width: 2.2 }, hovertemplate: "New customers: %{y:,}<extra></extra>" },
      ], { hovermode: "x unified", yaxis: { title: "Spend (R$)", tickformat: "~s", gridcolor: T.grid }, yaxis2: { overlaying: "y", side: "right", rangemode: "tozero", title: "New customers" } });
      UI.table("m-tbl", { id: "m-tbl", rows: valid, sortKey: "roas", pageSize: 8, search: false, exportName: "channel_ranking", cols: [
        { k: "name", label: "Channel" }, { k: "spend", label: "Spend", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) }, { k: "attributed", label: "Attributed revenue", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) },
        { k: "roas", label: "ROAS", fmt: Fmt.x }, { k: "roi", label: "ROI", fmt: (v) => Fmt.pct(v, 0), cls: (r) => (r.roi !== null && r.roi < 0 ? "cell-neg" : "cell-pos") },
        { k: "cac", label: "CAC", fmt: (v) => (v === null ? Fmt.NA : Fmt.brl(v, 1)) }, { k: "newCustomers", label: "New customers", fmt: Fmt.num }] });
      const mix = mk.per.slice().filter((p) => p.attributed > 0).sort((a, b) => a.attributed - b.attributed), tot = mix.reduce((a, p) => a + p.attributed, 0);
      if (!UI.emptyIf(!mix.length, "m-mix", "No revenue in this selection."))
        UI.plot("m-mix", [{ type: "bar", orientation: "h", y: mix.map((p) => p.name), x: mix.map((p) => p.attributed / tot), marker: { color: mix.map((p) => (p.name === "Organic / Direct" ? T.mochaLight : T.mocha)) }, customdata: mix.map((p) => p.attributed), hovertemplate: "<b>%{y}</b><br>%{x:.1%} of net revenue<br>R$ %{customdata:,.0f}<extra></extra>" }], { xaxis: { tickformat: ".0%", gridcolor: T.grid }, margin: { l: 120, r: 10, t: 4, b: 30 } });
    },
  };
})();
