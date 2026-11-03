/* VOLTIX central metric layer.
 * Every KPI on every page is computed here, from the same item-level fact table, with the
 * same definitions (see docs/METRICS.md). Pages never calculate their own KPIs.
 *
 * REAL columns   : oi, day, cat, sku, region, state, city, cu, price, freight, score, ddays, late, elig, first, cohort
 * SIMULATED cols : ch, mk, cost, disc, ret, refund, rr   (Olist has no channel/cost/discount/returns/marketing)
 */
(function () {
  const D = window.VOLTIX_DATA;
  const I = D.items;
  const N = D.meta.nItems;
  const EPOCH = Date.UTC(2017, 0, 1);
  const DAY = 86400000;

  const dayToDate = (d) => new Date(EPOCH + d * DAY);
  const dateToDay = (s) => Math.round((Date.parse(s + "T00:00:00Z") - EPOCH) / DAY);
  const isoDate = (d) => dayToDate(d).toISOString().slice(0, 10);
  const START = dateToDay(D.meta.windowStart);
  const END = dateToDay(D.meta.windowEnd);

  /* ---------- row selection ---------- */
  function select(f, opts) {
    opts = opts || {};
    const s = opts.start !== undefined ? opts.start : f.start;
    const e = opts.end !== undefined ? opts.end : f.end;
    const all = !!opts.includeIneligible;
    const out = [];
    for (let i = 0; i < N; i++) {
      const d = I.day[i];
      if (d < s || d > e) continue;
      if (!all && !I.elig[i]) continue;
      if (f.cat !== null && I.cat[i] !== f.cat) continue;
      if (f.ch !== null && I.ch[i] !== f.ch) continue;
      if (f.region !== null && I.region[i] !== f.region) continue;
      out.push(i);
    }
    return out;
  }

  function prevRange(f) {
    const len = f.end - f.start + 1;
    const ps = f.start - len, pe = f.start - 1;
    return { start: ps, end: pe, len, available: ps >= START };
  }

  /* ---------- core summary (the ONE definition of each KPI) ---------- */
  function summarize(rows) {
    let gross = 0, disc = 0, refunds = 0, cogs = 0, freight = 0, returned = 0;
    const orders = new Set(), custs = new Set(), newC = new Set(), retC = new Set();
    let firstOrders = 0;
    const seenFirstOrder = new Set();
    for (const i of rows) {
      gross += I.price[i];
      disc += I.disc[i];
      refunds += I.refund[i];
      freight += I.freight[i];
      cogs += I.ret[i] ? 0 : I.cost[i]; // returned units are assumed restocked -> no COGS
      returned += I.ret[i];
      orders.add(I.oi[i]);
      custs.add(I.cu[i]);
      if (I.first[i]) { newC.add(I.cu[i]); if (!seenFirstOrder.has(I.oi[i])) { seenFirstOrder.add(I.oi[i]); firstOrders++; } }
      else retC.add(I.cu[i]);
    }
    const units = rows.length;
    const net = gross - disc - refunds;
    const gp = net - cogs;
    const nOrders = orders.size;
    return {
      units, orders: nOrders, customers: custs.size, newCustomers: newC.size, returningCustomers: retC.size,
      firstOrders, repeatOrders: nOrders - firstOrders,
      gross, discounts: disc, refunds, net, cogs, gp, freight, returnedUnits: returned,
      gm: net > 0 ? gp / net : null,
      aov: nOrders ? net / nOrders : null,
      discRate: gross > 0 ? disc / gross : null,
      returnRate: units ? returned / units : null,
      refundRate: gross > 0 ? refunds / gross : null,
      arpc: custs.size ? net / custs.size : null,
      freq: custs.size ? nOrders / custs.size : null,
      repeatRate: custs.size ? retC.size / custs.size : null,
      custSet: custs, newSet: newC,
    };
  }

  /* ---------- time buckets ---------- */
  function bucketStart(d, gran) {
    if (gran === "day") return d;
    const dt = dayToDate(d);
    if (gran === "week") return d - ((dt.getUTCDay() + 6) % 7);
    return dateToDay(isoDate(Math.round((Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1) - EPOCH) / DAY)));
  }
  function nextBucket(b, gran) {
    if (gran === "day") return b + 1;
    if (gran === "week") return b + 7;
    const dt = dayToDate(b);
    return Math.round((Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) - EPOCH) / DAY);
  }
  function bucketLabel(b, gran) {
    const s = isoDate(b);
    return gran === "month" ? s.slice(0, 7) : s;
  }
  /* Continuous series (empty buckets are zero-filled, never skipped). shift moves rows forward in time. */
  function series(rows, gran, start, end, shift) {
    shift = shift || 0;
    const m = new Map();
    for (const i of rows) {
      const b = bucketStart(I.day[i] + shift, gran);
      if (!m.has(b)) m.set(b, []);
      m.get(b).push(i);
    }
    const out = [];
    for (let b = bucketStart(start, gran); b <= end; b = nextBucket(b, gran)) {
      out.push({ key: b, label: bucketLabel(b, gran), s: summarize(m.get(b) || []), empty: !m.has(b),
        partial: gran !== "day" && (b < start || nextBucket(b, gran) - 1 > end) });
    }
    // Edge buckets that only partly fall inside the period (e.g. a 1-day final week) would draw a false
    // collapse, so they are omitted from trend series whenever at least two full buckets remain.
    const full = out.filter((p) => !p.partial);
    return full.length >= 2 ? full : out;
  }

  /* ---------- breakdowns ---------- */
  function groupBy(rows, col) {
    const m = new Map();
    for (const i of rows) {
      const k = I[col][i];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    const out = new Map();
    for (const [k, r] of m) out.set(k, summarize(r));
    return out;
  }
  function growth(cur, prev) {
    if (prev === null || prev === undefined || prev === 0 || cur === null || cur === undefined) return null;
    return cur / prev - 1;
  }

  /* ---------- SKU / product table ---------- */
  function products(rows) {
    const g = groupBy(rows, "sku");
    const tot = summarize(rows);
    const out = [];
    for (const [k, s] of g) {
      out.push({
        sku: k, name: D.dims.skuLabels[k], category: D.dims.categories[D.dims.skuCategory[k]],
        units: s.units, net: s.net, gp: s.gp, gm: s.gm, returnRate: s.returnRate, discRate: s.discRate,
        refunds: s.refunds, revShare: tot.net ? s.net / tot.net : 0, gpShare: tot.gp ? s.gp / tot.gp : 0,
      });
    }
    return out;
  }

  /* ---------- order level (delivery / reviews: one record per order, not per item) ---------- */
  function orderLevel(rows) {
    const m = new Map();
    for (const i of rows) {
      if (!m.has(I.oi[i])) m.set(I.oi[i], { oi: I.oi[i], day: I.day[i], region: I.region[i], score: I.score[i], ddays: I.ddays[i], late: I.late[i], elig: I.elig[i] });
    }
    return Array.from(m.values());
  }

  /* ---------- marketing (spend is SIMULATED; scaled to the active filter by net-sales share) ---------- */
  let totalNetByMonth = null;
  function monthKey(d) { return isoDate(d).slice(0, 7); }
  function allNetByMonth() {
    if (totalNetByMonth) return totalNetByMonth;
    totalNetByMonth = {};
    for (let i = 0; i < N; i++) {
      if (!I.elig[i]) continue;
      const k = monthKey(I.day[i]);
      totalNetByMonth[k] = (totalNetByMonth[k] || 0) + I.price[i] - I.disc[i] - I.refund[i];
    }
    return totalNetByMonth;
  }
  function marketing(f, rows) {
    // filtered net by month -> share factor
    const fn = {};
    for (const i of rows) {
      const k = monthKey(I.day[i]);
      fn[k] = (fn[k] || 0) + I.price[i] - I.disc[i] - I.refund[i];
    }
    const tot = allNetByMonth();
    const factor = (mo) => (tot[mo] ? (fn[mo] || 0) / tot[mo] : 0);
    const spendByCh = {}, spendByMonth = {};
    for (const r of D.marketing) {
      const ms = dateToDay(r.month + "-01");
      // include month if it overlaps the period. Spend is monthly; the filtered share of that month's
      // net sales (factor) already scales it to the selected days/category/region, so no extra pro-rating.
      const me = nextBucket(ms, "month") - 1;
      if (Math.min(me, f.end) - Math.max(ms, f.start) + 1 <= 0) continue;
      const v = r.spend_syn * factor(r.month);
      spendByCh[r.channel] = (spendByCh[r.channel] || 0) + v;
      spendByMonth[r.month] = (spendByMonth[r.month] || 0) + v;
    }
    const channels = D.dims.mktChannels;
    const attr = {}, newByCh = {}, ordersByCh = {}, gpByCh = {};
    channels.forEach((c, i) => { attr[i] = 0; newByCh[i] = 0; ordersByCh[i] = new Set(); gpByCh[i] = 0; });
    const newSeen = new Set();
    for (const i of rows) {
      const k = I.mk[i];
      const net = I.price[i] - I.disc[i] - I.refund[i];
      attr[k] += net;
      gpByCh[k] += net - (I.ret[i] ? 0 : I.cost[i]);
      ordersByCh[k].add(I.oi[i]);
      if (I.first[i] && !newSeen.has(I.cu[i])) { newSeen.add(I.cu[i]); newByCh[k]++; }
    }
    const totalSpend = Object.values(spendByCh).reduce((a, b) => a + b, 0);
    const per = channels.map((c, i) => {
      const spend = spendByCh[c] || 0;
      return {
        name: c, idx: i, spend, attributed: attr[i], gp: gpByCh[i], orders: ordersByCh[i].size, newCustomers: newByCh[i],
        roas: spend > 0 ? attr[i] / spend : null,
        roi: spend > 0 ? (gpByCh[i] - spend) / spend : null,
        cac: spend > 0 && newByCh[i] > 0 ? spend / newByCh[i] : null,
        cpo: spend > 0 && ordersByCh[i].size ? spend / ordersByCh[i].size : null,
      };
    });
    const sAll = summarize(rows);
    return {
      per, spendByMonth, totalSpend,
      blendedCac: sAll.newCustomers > 0 ? totalSpend / sAll.newCustomers : null,
      costPerOrder: sAll.orders ? totalSpend / sAll.orders : null,
      attributedRevenue: per.filter((p) => p.spend > 0).reduce((a, p) => a + p.attributed, 0),
      paidRoas: totalSpend > 0 ? per.filter((p) => p.spend > 0).reduce((a, p) => a + p.attributed, 0) / totalSpend : null,
    };
  }

  /* ---------- RFM (thresholds in data.rfm; reproducible) ---------- */
  const SEGMENTS = ["Champions", "Loyal Customers", "Potential Loyalists", "New Customers", "At-Risk Customers", "Hibernating Customers"];
  function scoreR(days) { const c = D.rfm.recency_cuts_days; return days <= c[0] ? 5 : days <= c[1] ? 4 : days <= c[2] ? 3 : days <= c[3] ? 2 : 1; }
  function scoreF(n) { return n >= 4 ? 5 : n === 3 ? 4 : n === 2 ? 3 : 1; }
  function scoreM(v) { const c = D.rfm.monetary_cuts_brl; return v < c[0] ? 1 : v < c[1] ? 2 : v < c[2] ? 3 : v < c[3] ? 4 : 5; }
  function segmentOf(r, fr, m) {
    if (r >= 4 && fr >= 4) return "Champions";
    if (fr >= 3 && r >= 3) return "Loyal Customers";
    if (fr >= 3 && r <= 2) return "At-Risk Customers";
    if (fr === 1 && r === 5) return "New Customers";
    if (fr === 1 && (r === 4 || r === 3)) return "Potential Loyalists";
    if (r <= 2 && m >= 4) return "At-Risk Customers";
    return "Hibernating Customers";
  }
  function rfm(f) {
    // history from data start to period end, same category/channel/region filters
    const rows = select(f, { start: START, end: f.end });
    const cust = new Map();
    for (const i of rows) {
      let c = cust.get(I.cu[i]);
      if (!c) { c = { last: -1, orders: new Set(), spend: 0 }; cust.set(I.cu[i], c); }
      if (I.day[i] > c.last) c.last = I.day[i];
      c.orders.add(I.oi[i]);
      c.spend += I.price[i] - I.disc[i] - I.refund[i];
    }
    const segs = {};
    SEGMENTS.forEach((s) => (segs[s] = { name: s, customers: 0, revenue: 0, recencySum: 0, ordersSum: 0, list: [] }));
    for (const [cu, c] of cust) {
      const rec = f.end - c.last;
      const r = scoreR(rec), fr = scoreF(c.orders.size), m = scoreM(c.spend);
      const s = segs[segmentOf(r, fr, m)];
      s.customers++; s.revenue += c.spend; s.recencySum += rec; s.ordersSum += c.orders.size;
      s.list.push({ cu, recency: rec, orders: c.orders.size, spend: c.spend, r, f: fr, m });
    }
    const total = cust.size;
    return SEGMENTS.map((n) => {
      const s = segs[n];
      return { name: n, customers: s.customers, share: total ? s.customers / total : 0, revenue: s.revenue,
        avgRecency: s.customers ? s.recencySum / s.customers : null, avgOrders: s.customers ? s.ordersSum / s.customers : null, list: s.list };
    });
  }

  /* ---------- cohorts ---------- */
  function cohorts(f) {
    const rows = select(f, { start: START, end: f.end });
    const cohortSize = new Map(); // cohort idx -> Set of customers
    const active = new Map();     // cohort idx -> Map(offset -> Set cust)
    for (const i of rows) {
      const c = I.cohort[i];
      if (c < 0) continue;
      const [cy, cm] = D.dims.cohorts[c].split("-").map(Number);
      const dt = dayToDate(I.day[i]);
      const off = (dt.getUTCFullYear() - cy) * 12 + (dt.getUTCMonth() + 1 - cm);
      if (off < 0) continue;
      if (off === 0 && I.first[i]) {
        if (!cohortSize.has(c)) cohortSize.set(c, new Set());
        cohortSize.get(c).add(I.cu[i]);
      }
      if (off > 0) {
        if (!active.has(c)) active.set(c, new Map());
        const m = active.get(c);
        if (!m.has(off)) m.set(off, new Set());
        m.get(off).add(I.cu[i]);
      }
    }
    const endDt = dayToDate(f.end);
    const startMonth = isoDate(f.start).slice(0, 7);
    const out = [];
    for (const [c, set] of Array.from(cohortSize.entries()).sort((a, b) => a[0] - b[0])) {
      const label = D.dims.cohorts[c];
      if (label < startMonth) continue; // cohorts inside the selected period only
      const [cy, cm] = label.split("-").map(Number);
      const maxOff = (endDt.getUTCFullYear() - cy) * 12 + (endDt.getUTCMonth() + 1 - cm);
      const cells = [];
      for (let o = 0; o <= 12; o++) {
        if (o > maxOff) { cells.push(null); continue; }
        if (o === 0) { cells.push(1); continue; }
        const a = active.get(c) && active.get(c).get(o);
        // only customers that belong to the cohort
        let cnt = 0;
        if (a) for (const cu of a) if (set.has(cu)) cnt++;
        cells.push(set.size ? cnt / set.size : 0);
      }
      out.push({ label, size: set.size, cells });
    }
    return out;
  }

  /* ---------- value distribution ---------- */
  function customerValue(rows) {
    const spend = new Map();
    for (const i of rows) spend.set(I.cu[i], (spend.get(I.cu[i]) || 0) + I.price[i] - I.disc[i] - I.refund[i]);
    const v = Array.from(spend.values()).sort((a, b) => b - a);
    const total = v.reduce((a, b) => a + b, 0);
    const top10n = Math.max(1, Math.ceil(v.length * 0.1));
    const top10 = v.slice(0, top10n).reduce((a, b) => a + b, 0);
    return { values: v, total, top10Share: total ? top10 / total : null, top10Cut: v[top10n - 1] || 0, median: v.length ? v[Math.floor(v.length / 2)] : null };
  }

  /* ---------- inventory (SIMULATED snapshot at window end) ---------- */
  function inventory(f) {
    const out = [];
    for (const r of D.inventory) {
      const cat = D.dims.skuCategory[r.sku];
      if (f.cat !== null && cat !== f.cat) continue;
      const rate = r.sold90 / 90;
      const cover = rate > 0 ? r.onHand / rate : Infinity;
      const avgInv = Math.max(r.onHand, 1);
      out.push({
        sku: r.sku, name: D.dims.skuLabels[r.sku], category: D.dims.categories[cat], catIdx: cat,
        onHand: r.onHand, sold90: r.sold90, soldTotal: r.soldTotal, velocity: rate * 30, // units / month
        cover, value: r.onHand * r.unitCost, daysSinceReceipt: r.daysSinceReceipt,
        turnover: (r.sold90 * 4) / avgInv, // annualised units sold / on-hand
        sellThrough: r.sold90 + r.onHand > 0 ? r.sold90 / (r.sold90 + r.onHand) : null,
        status: r.sold90 <= 1 || cover > 180 ? "Slow-moving / excess" : cover < 21 ? "Stockout risk" : "Healthy",
      });
    }
    return out;
  }

  window.M = {
    D, I, N, START, END, SEGMENTS,
    dayToDate, dateToDay, isoDate, select, prevRange, summarize, series, groupBy, growth, products,
    orderLevel, marketing, rfm, cohorts, customerValue, inventory, bucketStart, nextBucket,
  };
})();
