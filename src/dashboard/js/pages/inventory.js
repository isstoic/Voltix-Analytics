/* Inventory & Operations */
(function () {
  const { Fmt, Theme: T, UI, M } = window;
  const { D } = M;
  const STATUS_COLOR = { "Healthy": T.pos, "Stockout risk": T.neg, "Slow-moving / excess": T.warn };
  const NO_SALES = 99999; // sentinel used only so SKUs with zero velocity sort last

  window.Pages.inventory = {
    title: "Inventory & Operations",
    sub: "Stock cover, sales velocity and slow-moving items for the 150 best-selling SKUs, as of the latest date in the data (" + Fmt.date(M.dayToDate(M.END)) + "), plus delivery performance for the selected period. The stock position does not change with the date range.",
    disabledFilters: ["ch", "region"],
    render(ctx) {
      const inv = M.inventory(ctx.f);
      if (!inv.length) return `<div class="card">${UI.empty("No tracked SKUs in this category", "Clear the category filter.")}</div>`;
      const units = inv.reduce((a, r) => a + r.onHand, 0), val = inv.reduce((a, r) => a + r.value, 0);
      const fin = inv.filter((r) => isFinite(r.cover)), avg = fin.length ? fin.reduce((a, r) => a + r.cover, 0) / fin.length : null;
      const risk = inv.filter((r) => r.status === "Stockout risk").length, slow = inv.filter((r) => r.status === "Slow-moving / excess"), healthy = inv.filter((r) => r.status === "Healthy").length;
      return `<div class="kpis">
        ${UI.kpi({ label: "SKUs Tracked", value: Fmt.num(inv.length), plain: true, hero: true })}
        ${UI.kpi({ label: "Units on Hand", value: Fmt.num(units), plain: true })}
        ${UI.kpi({ label: "Inventory Value (at cost)", value: Fmt.brl(val), plain: true })}
        ${UI.kpi({ label: "Avg Days of Cover", value: avg === null ? null : Math.round(avg) + " days", plain: true, title: "Units on hand ÷ trailing 90-day daily sales" })}
        ${UI.kpi({ label: "Stockout-Risk SKUs", value: Fmt.num(risk), plain: true, hero: true, title: "Fewer than 21 days of cover" })}
        ${UI.kpi({ label: "Slow-Moving / Excess SKUs", value: Fmt.num(slow.length), plain: true, title: "At most 1 unit sold in 90 days, or more than 180 days of cover" })}
        ${UI.kpi({ label: "Cash Tied in Slow-Moving Stock", value: Fmt.brl(slow.reduce((a, r) => a + r.value, 0)), plain: true })}
        ${UI.kpi({ label: "Healthy SKUs", value: Fmt.pct(healthy / inv.length, 0), plain: true, title: "Share of tracked SKUs with 21 to 180 days of cover" })}
      </div>
      <div class="grid">
        ${UI.card("c6", "Inventory vs demand", "Each point is a SKU: monthly sales velocity vs units on hand (log scales). Click a legend entry to hide a status.", UI.chartDiv("i-sc", "tall"))}
        ${UI.card("c6", "Days of cover distribution", "Dashed lines mark the 21-day stockout-risk and 180-day excess thresholds.", UI.chartDiv("i-hist", "tall"))}
      </div>
      <div class="grid">
        ${UI.card("c6", "Largest inventory positions", "Top 15 SKUs by stock value at cost, coloured by status.", UI.chartDiv("i-top", "tall"))}
        ${UI.card("c6", "Days since last stock receipt", "Value of stock by time since the last receipt. A proxy for ageing: batch-level ageing needs stock-entry dates.", UI.chartDiv("i-age", "tall"))}
      </div>
      <div class="grid">
        ${UI.card("c12", "SKU inventory monitor", "Stockout risk = under 21 days of cover. Slow-moving / excess = at most 1 unit sold in 90 days, or over 180 days of cover.", `<div id="i-tbl"></div>`)}
      </div>
      <div class="grid">
        ${UI.card("c12", "Delivery performance by region", "Average delivery time and late-delivery rate for delivered orders in the selected period (regions with at least 10 orders).", UI.chartDiv("i-del", "short"))}
      </div>`;
    },
    after(ctx) {
      const inv = M.inventory(ctx.f); if (!inv.length) return;
      UI.plot("i-sc", ["Healthy", "Stockout risk", "Slow-moving / excess"].map((s) => { const q = inv.filter((r) => r.status === s); return { x: q.map((r) => Math.max(r.velocity, 0.1)), y: q.map((r) => Math.max(r.onHand, 0.5)), mode: "markers", type: "scatter", name: s, text: q.map((r) => r.name), marker: { color: STATUS_COLOR[s], size: 10, opacity: 0.8, line: { color: "#fff", width: 0.5 } }, customdata: q.map((r) => [r.velocity, r.onHand, r.cover]), hovertemplate: "<b>%{text}</b><br>%{customdata[0]:.1f} units/month<br>%{customdata[1]} on hand<extra></extra>" }; }),
        { xaxis: { type: "log", title: "Units sold per month (last 90 days)", gridcolor: T.grid, tickvals: [0.1, 0.3, 1, 3, 10, 30, 100], ticktext: ["0.1", "0.3", "1", "3", "10", "30", "100"] }, yaxis: { type: "log", title: "Units on hand", gridcolor: T.grid, tickvals: [1, 3, 10, 30, 100], ticktext: ["1", "3", "10", "30", "100"] } });
      const cov = inv.filter((r) => isFinite(r.cover)).map((r) => Math.min(r.cover, 400));
      UI.plot("i-hist", [{ x: cov, type: "histogram", xbins: { start: 0, end: 400, size: 20 }, marker: { color: T.mochaLight, line: { color: "#fff", width: 1 } }, hovertemplate: "%{x} days of cover<br>%{y} SKUs<extra></extra>" }],
        { xaxis: { title: "Days of cover (capped at 400)", gridcolor: T.grid }, yaxis: { title: "SKUs", gridcolor: T.grid }, shapes: [21, 180].map((v) => ({ type: "line", x0: v, x1: v, yref: "paper", y0: 0, y1: 1, line: { color: v === 21 ? T.neg : T.warn, dash: "dash" } })) });
      const top = inv.slice().sort((a, b) => b.value - a.value).slice(0, 15).reverse();
      UI.plot("i-top", [{ type: "bar", orientation: "h", y: top.map((r) => r.name), x: top.map((r) => r.value), marker: { color: top.map((r) => STATUS_COLOR[r.status]) }, customdata: top.map((r) => [r.status, r.onHand]), hovertemplate: "<b>%{y}</b><br>Value at cost: R$ %{x:,.0f}<br>%{customdata[1]} units on hand<br>Status: %{customdata[0]}<extra></extra>" }], { margin: { l: 195, r: 10, t: 4, b: 30 }, xaxis: { tickformat: "~s", gridcolor: T.grid } });
      const bk = [["0–30", 0, 30], ["31–60", 31, 60], ["61–90", 61, 90], ["91–180", 91, 180], ["181+", 181, 9999]];
      UI.plot("i-age", [{ type: "bar", x: bk.map((b) => b[0] + " days"), y: bk.map((b) => inv.filter((r) => r.daysSinceReceipt >= b[1] && r.daysSinceReceipt <= b[2]).reduce((a, r) => a + r.value, 0)), marker: { color: T.lavenderDeep }, hovertemplate: "%{x}<br>R$ %{y:,.0f} at cost<extra></extra>" }], { yaxis: { title: "Inventory value (R$)", tickformat: "~s", gridcolor: T.grid } });
      UI.table("i-tbl", { id: "inv", rows: inv.map((r) => ({ ...r, cover: isFinite(r.cover) ? r.cover : NO_SALES })), sortKey: "value", pageSize: 12, exportName: "inventory_monitor", searchKeys: ["name", "category", "status"], cols: [
        { k: "name", label: "SKU" }, { k: "category", label: "Category" }, { k: "onHand", label: "On hand", fmt: Fmt.num }, { k: "velocity", label: "Units / month", fmt: (v) => v.toFixed(1) },
        { k: "cover", label: "Days of cover", fmt: (v) => (v >= NO_SALES ? "No sales" : Fmt.num(v)), raw: (v) => (v >= NO_SALES ? "" : Math.round(v)) },
        { k: "turnover", label: "Turnover (annualised)", fmt: (v) => v.toFixed(1) + "x" }, { k: "sellThrough", label: "Sell-through (90d)", fmt: (v) => Fmt.pct(v) },
        { k: "value", label: "Value at cost", fmt: (v) => Fmt.brlFull(v), raw: (v) => Math.round(v) },
        { k: "status", label: "Status", cls: (r) => (r.status === "Stockout risk" ? "cell-neg" : r.status === "Healthy" ? "cell-pos" : "cell-warn") }] });
      const ords = M.orderLevel(ctx.rows).filter((o) => o.ddays >= 0);
      if (!UI.emptyIf(!ords.length, "i-del", "No delivered orders in this selection.")) {
        const byR = D.dims.regions.map((r, i) => { const q = ords.filter((o) => o.region === i), w = q.filter((o) => o.late >= 0); return { r, d: q.length ? q.reduce((a, o) => a + o.ddays, 0) / q.length : null, late: w.length ? w.filter((o) => o.late === 1).length / w.length : null, n: q.length }; }).filter((r) => r.n >= 10);
        if (!UI.emptyIf(!byR.length, "i-del", "No region has at least 10 delivered orders in this period."))
          UI.plot("i-del", [
            { type: "bar", x: byR.map((r) => r.r), y: byR.map((r) => r.d), name: "Avg delivery days", marker: { color: T.mochaLight }, customdata: byR.map((r) => r.n), hovertemplate: "<b>%{x}</b><br>Avg delivery: %{y:.1f} days<br>%{customdata:,} orders<extra></extra>" },
            { type: "scatter", mode: "markers+text", x: byR.map((r) => r.r), y: byR.map((r) => r.late), yaxis: "y2", name: "Late deliveries", marker: { color: T.neg, size: 11 }, text: byR.map((r) => Fmt.pct(r.late, 0)), textposition: "top center", textfont: { color: T.ink }, hovertemplate: "Late: %{y:.1%}<extra></extra>" },
          ], { yaxis: { title: "Days", gridcolor: T.grid }, yaxis2: { overlaying: "y", side: "right", tickformat: ".0%", rangemode: "tozero", title: "Late deliveries" } });
      }
    },
  };
})();
