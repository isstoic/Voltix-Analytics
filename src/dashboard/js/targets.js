/* Planning targets: illustrative, rule-based, kept entirely separate from actual data.
 *
 * The dataset has no recorded business targets, so VOLTIX uses a transparent run-rate plan:
 *   For a month k, the baseline is the average of the 3 preceding calendar months (same filters).
 *     Orders target   = baseline orders × (1 + PLAN.growth)
 *     Net sales target = baseline net sales × (1 + PLAN.growth)
 *     AOV target      = Net target ÷ Orders target (= baseline AOV, i.e. basket size held flat)
 *     Gross margin    = baseline margin + PLAN.marginUpliftPP
 *     Gross profit target = Net target × margin target
 * Targets exist from Apr 2017 (first month with a 3-month history). For a selected period, each month's
 * target is pro-rated by the share of that month's days inside the period, and actuals are measured over
 * exactly those days. These are planning assumptions, not historically recorded targets.
 */
(function () {
  const { M } = window;
  const { I, N, D } = M;
  const PLAN = { growth: 0.03, lookback: 3, marginUpliftPP: 0.005, band: 0.02 };

  // month index (0 = Jan 2017) for every row, cached
  const MI = new Int16Array(N);
  for (let i = 0; i < N; i++) { const d = M.dayToDate(I.day[i]); MI[i] = (d.getUTCFullYear() - 2017) * 12 + d.getUTCMonth(); }
  const endD = M.dayToDate(M.END);
  const LAST_MONTH = (endD.getUTCFullYear() - 2017) * 12 + endD.getUTCMonth();
  const LAST_COMPLETE = endD.getUTCDate() === new Date(Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() + 1, 0)).getUTCDate() ? LAST_MONTH : LAST_MONTH - 1;
  const monthStartDay = (k) => Math.round((Date.UTC(2017 + Math.floor(k / 12), k % 12, 1) - Date.UTC(2017, 0, 1)) / 86400000);
  const daysIn = (k) => monthStartDay(k + 1) - monthStartDay(k);
  const monthLabel = (k) => Fmt.monthName(k % 12) + " " + (2017 + Math.floor(k / 12));

  function monthlyAgg(f) {
    const net = new Float64Array(LAST_MONTH + 1), gp = new Float64Array(LAST_MONTH + 1), orders = Array.from({ length: LAST_MONTH + 1 }, () => new Set());
    for (let i = 0; i < N; i++) {
      if (!I.elig[i]) continue;
      if (f.cat !== null && I.cat[i] !== f.cat) continue;
      if (f.ch !== null && I.ch[i] !== f.ch) continue;
      if (f.region !== null && I.region[i] !== f.region) continue;
      const k = MI[i], n = I.price[i] - I.disc[i] - I.refund[i];
      net[k] += n; gp[k] += n - (I.ret[i] ? 0 : I.cost[i]); orders[k].add(I.oi[i]);
    }
    return { net, gp, orders: orders.map((s) => s.size) };
  }
  function monthTarget(agg, k) {
    if (k < PLAN.lookback || k - 1 > LAST_COMPLETE) return null;
    let n = 0, g = 0, o = 0;
    for (let j = k - PLAN.lookback; j < k; j++) { n += agg.net[j]; g += agg.gp[j]; o += agg.orders[j]; }
    const L = PLAN.lookback, baseNet = n / L, baseOrders = o / L;
    if (baseNet <= 0 || baseOrders <= 0) return null;
    const netT = baseNet * (1 + PLAN.growth), ordT = baseOrders * (1 + PLAN.growth);
    const gm = (n > 0 ? g / n : 0) + PLAN.marginUpliftPP;
    return { net: netT, orders: ordT, gp: netT * gm, gm };
  }

  /** Compare actual vs plan for the selected period and filters. */
  function compute(f) {
    const agg = monthlyAgg(f);
    const k0 = MI[0] === undefined ? 0 : 0;
    const sD = M.dayToDate(f.start), eD = M.dayToDate(f.end);
    const ks = (sD.getUTCFullYear() - 2017) * 12 + sD.getUTCMonth(), ke = (eD.getUTCFullYear() - 2017) * 12 + eD.getUTCMonth();
    const months = []; let covered = 0;
    const T = { net: 0, orders: 0, gp: 0 };
    const coveredRange = {}; // month -> [fromDay, toDay]
    for (let k = Math.max(ks, 0); k <= ke; k++) {
      const mt = monthTarget(agg, k);
      if (!mt) continue;
      const from = Math.max(f.start, monthStartDay(k)), to = Math.min(f.end, monthStartDay(k + 1) - 1);
      if (to < from) continue;
      const frac = (to - from + 1) / daysIn(k);
      covered += to - from + 1;
      coveredRange[k] = [from, to];
      months.push({ k, label: monthLabel(k), from, to, frac, tNet: mt.net * frac, tOrders: mt.orders * frac, tGp: mt.gp * frac, aNet: 0, aGp: 0, aOrdersSet: new Set(), partial: frac < 0.999 });
      T.net += mt.net * frac; T.orders += mt.orders * frac; T.gp += mt.gp * frac;
    }
    const total = f.end - f.start + 1;
    if (!months.length) return { available: false, coverageDays: 0, totalDays: total, reason: `Planning targets start in ${monthLabel(PLAN.lookback)} (they need ${PLAN.lookback} months of history).` };
    const byK = new Map(months.map((m) => [m.k, m]));
    const A = { net: 0, gp: 0, orders: new Set() };
    for (let i = 0; i < N; i++) {
      if (!I.elig[i]) continue;
      const d = I.day[i]; if (d < f.start || d > f.end) continue;
      const m = byK.get(MI[i]); if (!m || d < m.from || d > m.to) continue;
      if (f.cat !== null && I.cat[i] !== f.cat) continue;
      if (f.ch !== null && I.ch[i] !== f.ch) continue;
      if (f.region !== null && I.region[i] !== f.region) continue;
      const n = I.price[i] - I.disc[i] - I.refund[i], g = n - (I.ret[i] ? 0 : I.cost[i]);
      m.aNet += n; m.aGp += g; m.aOrdersSet.add(I.oi[i]);
      A.net += n; A.gp += g; A.orders.add(I.oi[i]);
    }
    const aOrders = A.orders.size;
    const metrics = {
      net: { label: "Net revenue", a: A.net, t: T.net, fmt: "brl" },
      gp: { label: "Gross profit", a: A.gp, t: T.gp, fmt: "brl" },
      orders: { label: "Orders", a: aOrders, t: T.orders, fmt: "num" },
      aov: { label: "Avg order value", a: aOrders ? A.net / aOrders : null, t: T.orders ? T.net / T.orders : null, fmt: "brl2" },
      gm: { label: "Gross margin %", a: A.net > 0 ? A.gp / A.net : null, t: T.net > 0 ? T.gp / T.net : null, fmt: "pct" },
    };
    Object.values(metrics).forEach((m) => { m.ach = m.t && m.a !== null ? m.a / m.t : null; m.status = status(m.ach); });
    // exact gap decomposition: net gap = volume effect + basket-value effect
    const volume = metrics.aov.t !== null ? (aOrders - T.orders) * metrics.aov.t : null;
    const value = metrics.aov.a !== null ? aOrders * (metrics.aov.a - metrics.aov.t) : null;
    return {
      available: true, coverageDays: covered, totalDays: total, metrics,
      gap: { net: A.net - T.net, volume, value },
      months: months.map((m) => ({ k: m.k, label: m.label, partial: m.partial, aNet: m.aNet, tNet: m.tNet, aGp: m.aGp, tGp: m.tGp, aOrders: m.aOrdersSet.size, tOrders: m.tOrders })),
    };
  }
  function status(ach) {
    if (ach === null || !isFinite(ach)) return "na";
    if (ach >= 1 + PLAN.band) return "above";
    if (ach >= 1 - PLAN.band) return "on";
    return "below";
  }
  /** Net-revenue gap by category (contribution to the total gap). */
  function byCategory(f) {
    const out = [];
    D.dims.categories.forEach((name, ci) => {
      const r = compute({ ...f, cat: ci });
      if (r.available && (r.metrics.net.a > 0 || r.metrics.net.t > 0)) out.push({ name, idx: ci, actual: r.metrics.net.a, target: r.metrics.net.t, gap: r.metrics.net.a - r.metrics.net.t, ach: r.metrics.net.ach });
    });
    return out;
  }
  window.Targets = { PLAN, compute, byCategory, status };
})();
