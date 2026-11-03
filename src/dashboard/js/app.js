/* VOLTIX dashboard shell: global state, global filters, date presets, routing, shared page context.
 * Pages (js/pages/*.js) register themselves on window.Pages and only render; KPIs come from window.M. */
(function () {
  "use strict";
  const { M, UI, Fmt } = window;
  const { D, START, END } = M;
  const $ = (s, el) => (el || document).querySelector(s);
  window.Pages = window.Pages || {};

  /* ---------- state ---------- */
  const dayOf = (y, m, d) => M.dateToDay(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  const clamp = (a, b) => [Math.max(START, Math.min(END, a)), Math.max(START, Math.min(END, b))];
  const endDate = M.dayToDate(END);
  const Y = endDate.getUTCFullYear(), MO = endDate.getUTCMonth();
  // "Today" is the most recent date in the dataset, so every preset contains data.
  const PRESETS = [
    { id: "today", label: "Today", range: () => [END, END] },
    { id: "last7", label: "Last 7 Days", range: () => clamp(END - 6, END) },
    { id: "last30", label: "Last 30 Days", range: () => clamp(END - 29, END) },
    { id: "thisMonth", label: "This Month", range: () => clamp(dayOf(Y, MO, 1), END) },
    { id: "lastMonth", label: "Last Month", range: () => { const pm = MO === 0 ? 11 : MO - 1, py = MO === 0 ? Y - 1 : Y; return clamp(dayOf(py, pm, 1), dayOf(Y, MO, 1) - 1); } },
    { id: "ytd", label: "Year to Date", range: () => clamp(dayOf(Y, 0, 1), END) },
    { id: "all", label: "All Data", range: () => [START, END] },
  ];
  const DEFAULT_PRESET = "ytd";
  const f = { start: 0, end: 0, cat: null, ch: null, region: null, gran: null };
  const applyDefaultRange = () => { const [s, e] = PRESETS.find((p) => p.id === DEFAULT_PRESET).range(); f.start = s; f.end = e; f.gran = null; };
  const reset = () => { applyDefaultRange(); f.cat = f.ch = f.region = null; };
  reset();
  let page = "overview";

  const ic = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const NAV = [
    { id: "overview", name: "Executive Overview", icon: ic('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>') },
    { id: "sales", name: "Sales Intelligence", icon: ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>') },
    { id: "product", name: "Product Analytics", icon: ic('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>') },
    { id: "customer", name: "Customer Intelligence", icon: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>') },
    { id: "marketing", name: "Marketing Performance", icon: ic('<path d="M3 11v3a1 1 0 001 1h3l8 4V6L7 10H4a1 1 0 00-1 1z"/><path d="M19 9a4 4 0 010 6"/>') },
    { id: "inventory", name: "Inventory & Operations", icon: ic('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M12 11v10M3 7l9 4 9-4"/>') },
    { id: "insights", name: "Business Insights", icon: ic('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>') },
  ];

  /* ---------- shared context (every derived dataset is computed lazily, once per render) ---------- */
  function buildContext() {
    const rows = M.select(f);
    const cur = M.summarize(rows);
    const pr = M.prevRange(f);
    const prevRows = pr.available ? M.select(f, { start: pr.start, end: pr.end }) : [];
    const prev = pr.available ? M.summarize(prevRows) : null;
    const len = f.end - f.start + 1;
    const gran = f.gran || (len <= 45 ? "day" : len <= 400 ? "week" : "month");
    const memo = {};
    const get = (key, fn) => (key in memo ? memo[key] : (memo[key] = fn()));
    const ctx = {
      f, rows, cur, pr, prevRows, prev, gran, len, empty: rows.length === 0, get,
      series: (g) => get("series:" + (g || gran), () => M.series(rows, g || gran, f.start, f.end)),
      prevSeries: (g) => get("pseries:" + (g || gran), () => (pr.available ? M.series(prevRows, g || gran, pr.start, pr.end) : null)),
      byCat: () => get("byCat", () => M.groupBy(rows, "cat")),
      byCh: () => get("byCh", () => M.groupBy(rows, "ch")),
      byRegion: () => get("byRegion", () => M.groupBy(rows, "region")),
      prods: () => get("prods", () => M.products(rows)),
      mkt: () => get("mkt", () => M.marketing(f, rows)),
      prevMkt: () => get("prevMkt", () => (pr.available ? M.marketing({ ...f, start: pr.start, end: pr.end }, prevRows) : null)),
      target: () => get("target", () => Targets.compute(f)),
      orders: () => get("orders", () => M.orderLevel(rows)),
      customerValue: () => get("cv", () => M.customerValue(rows)),
      rfm: () => get("rfm", () => M.rfm(f)),
      contrib: () => get("contrib", () => (pr.available ? Analytics.contribution(ctx.byCat(), M.groupBy(prevRows, "cat"), (k) => D.dims.categories[k]) : null)),
      anomalies: () => get("anom", () => Analytics.anomalies(ctx.series(len > 62 ? "week" : "day"), (s) => s.net, 8)),
      insights: () => get("insights", () => (rows.length === 0 ? [] : Insights.generate(f, {
        cur, prev, rows, prods: ctx.prods(), byCat: ctx.byCat(), byCh: ctx.byCh(), mkt: ctx.mkt(), cv: ctx.customerValue(),
        orders: ctx.orders(), target: ctx.target(), contrib: ctx.contrib(), anomalies: ctx.anomalies(),
      }))),
    };
    return ctx;
  }
  const periodText = (ctx) => {
    const a = (d) => Fmt.date(M.dayToDate(d));
    const rng = (s, e) => (s === e ? a(s) : `${a(s)} – ${a(e)}`);
    return ctx.pr.available
      ? `Showing ${rng(ctx.f.start, ctx.f.end)}. Compared with the prior period (${rng(ctx.pr.start, ctx.pr.end)}).`
      : `Showing ${rng(ctx.f.start, ctx.f.end)}. No earlier period is available in the data for comparison.`;
  };

  /* ---------- global filter bar (built once; state is synced after every render) ---------- */
  let picker = null;
  function buildFilters() {
    const host = $("#filters");
    const sel = (id, label, all, arr) => `<label class="fld" for="${id}">${label}<select id="${id}"><option value="">${all}</option>${arr.map((n, i) => `<option value="${i}">${Fmt.esc(n)}</option>`).join("")}</select></label>`;
    host.innerHTML = `<div class="fld">Date range<div class="dp" id="dp"></div></div>
      ${sel("f-cat", "Category", "All categories", D.dims.categories)}${sel("f-ch", "Channel", "All channels", D.dims.channels)}${sel("f-region", "Region", "All regions", D.dims.regions)}
      <button class="btn" id="f-reset" title="Reset the date range and all filters">Reset filters</button>
      <button class="btn" id="f-info" title="Sources, definitions and assumptions">Data &amp; methodology</button>`;
    picker = UI.DatePicker($("#dp"), {
      min: START, max: END, presets: PRESETS,
      getRange: () => ({ start: f.start, end: f.end }),
      onApply: (s, e) => { f.start = s; f.end = e; f.gran = null; render(); },
      onReset: () => { applyDefaultRange(); render(); },
    });
    [["f-cat", "cat"], ["f-ch", "ch"], ["f-region", "region"]].forEach(([id, k]) => ($("#" + id).onchange = (e) => { f[k] = e.target.value === "" ? null : +e.target.value; render(); }));
    $("#f-reset").onclick = () => { reset(); render(); };
    $("#f-info").onclick = showMethodology;
  }
  function syncFilters() {
    const off = (Pages[page] && Pages[page].disabledFilters) || [];
    [["f-cat", "cat"], ["f-ch", "ch"], ["f-region", "region"]].forEach(([id, k]) => {
      const el = $("#" + id); if (!el) return;
      el.value = f[k] === null ? "" : String(f[k]);
      el.disabled = off.includes(k);
      el.title = el.disabled ? "Not applicable on this page" : "";
    });
    picker.refresh();
  }

  /* ---------- methodology panel (the single place data provenance is described) ---------- */
  function showMethodology() {
    const T = Targets.PLAN;
    UI.modal("Data & methodology", `<div class="defs">
      <p><b style="color:var(--ink)">Source.</b> Orders, order items, customers, locations, delivery dates and review scores come from the public Olist Brazilian e-commerce dataset (2017–2018), restricted to electronics-related categories and presented under the fictional brand VOLTIX. Amounts are in Brazilian reais (R$).</p>
      <p><b style="color:var(--ink)">Modelled fields.</b> The source does not record unit cost, discounts, sales channel, returns and refunds, marketing spend and attribution, or stock levels. These fields are generated by deterministic business rules (fixed random seed) and are analytical assumptions, not recorded transactions. Gross profit, margin, discount, return, channel, marketing and inventory figures depend on them.</p>
      <p><b style="color:var(--ink)">Planning targets.</b> No targets exist in the data. Illustrative targets use each month's prior ${T.lookback}-month average × (1 + ${Fmt.pct(T.growth, 0)}) and margin + ${(T.marginUpliftPP * 100).toFixed(1)} pp. They are not historical business facts and do not model seasonality.</p>
      <p><b style="color:var(--ink)">Definitions.</b> Eligible orders = delivered, shipped, invoiced, processing, approved. Net sales = gross sales − discounts − refunds (freight and tax excluded). Orders are counted by distinct order id. Prior period = the immediately preceding period of equal length. "Today" in the date presets = the latest date in the data (${Fmt.date(endDate)}).</p>
      <p><b style="color:var(--ink)">Not available.</b> Impressions, clicks, conversion funnel and stock history are not in the dataset and are not estimated. Marketing attribution is rule-based and does not measure incrementality.</p>
      <p>Full documentation: <code>docs/METRICS.md</code>, <code>docs/DATA_DICTIONARY.md</code>, <code>docs/LIMITATIONS.md</code>.</p></div>`);
  }

  /* ---------- router / render ---------- */
  function render() {
    const el = $("#page");
    const P = Pages[page];
    try {
      const sy = window.scrollY;
      const ctx = buildContext();
      el.innerHTML = UI.head(P.title, P.sub) + `<p class="compare">${periodText(ctx)}</p>` +
        (ctx.empty ? `<div class="card">${UI.empty("No orders match this selection", "Widen the date range or clear a filter.")}</div>` : P.render(ctx));
      if (!ctx.empty && P.after) P.after(ctx);
      window.scrollTo(0, sy);
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="err" role="alert"><b>This page could not be rendered.</b><br>${Fmt.esc(e.message)}<br><br><button class="btn" id="err-reload">Reload</button></div>`;
      const b = $("#err-reload"); if (b) b.onclick = () => location.reload();
    }
    syncFilters();
    const name = NAV.find((p) => p.id === page).name;
    document.querySelectorAll(".nav").forEach((n) => { const on = n.dataset.page === page; n.classList.toggle("active", on); n.setAttribute("aria-current", on ? "page" : "false"); });
    
    document.title = `${name} · VOLTIX Analytics`;
  }
  const go = (id) => { if (!Pages[id]) return; page = id; if (location.hash.slice(1) !== id) location.hash = id; window.scrollTo(0, 0); render(); };
  /** Cross-filter: toggle a dashboard-level filter from a chart or table click. */
  const toggle = (key, val) => { f[key] = f[key] === val ? null : val; render(); };

  function init() {
    $("#nav").innerHTML = NAV.map((p) => `<button class="nav" data-page="${p.id}">${p.icon}<span class="t">${p.name}</span></button>`).join("");
    document.querySelectorAll(".nav").forEach((n) => (n.onclick = () => go(n.dataset.page)));
    $("#collapse").onclick = () => $("#app").classList.toggle("collapsed");
    $("#foot").innerHTML = `Source: Olist public e-commerce dataset (electronics categories), presented as the fictional VOLTIX brand. Cost, discount, channel, return, marketing and inventory fields are modelled. <button class="link" id="foot-m">Data &amp; methodology</button>`;
    $("#foot-m").onclick = showMethodology;
    buildFilters();
    const h = location.hash.slice(1); if (Pages[h]) page = h;
    window.addEventListener("hashchange", () => { const k = location.hash.slice(1); if (Pages[k] && k !== page) { page = k; render(); } });
    $("#loading").remove();
    render();
  }
  window.App = { f, render, go, toggle, buildContext, PRESETS, reset };
  window.__voltix = window.App; // test hook
  init();
})();
