/* Transparent rule-based insight engine.
 * Each rule inspects calculated metrics for the CURRENT filters/period and fires only when its condition is met.
 * Every insight records the rule that triggered it and the numbers behind it. Nothing is hard-coded as a finding. */
(function () {
  const { D } = window.M;
  const { brlFull: money, pct, pp, spct } = Fmt;

  function generate(f, ctx) {
    const out = [];
    const { cur, prev, prods, byCat, byCh, mkt, cv, target, contrib, anomalies } = ctx;
    const add = (o) => out.push(o);

    // 1. Growth decomposition: orders vs AOV
    if (prev && prev.net > 0 && cur.orders && prev.orders) {
      const g = cur.net / prev.net - 1, go = cur.orders / prev.orders - 1, ga = cur.aov / prev.aov - 1;
      if (Math.abs(g) >= 0.03) {
        const driver = Math.abs(go) >= Math.abs(ga) ? "order volume" : "order value";
        add({
          sev: g >= 0 ? "pos" : "neg", rule: "|Net sales change| ≥ 3% vs the prior period",
          obs: `Net sales ${g >= 0 ? "rose" : "fell"} ${pct(Math.abs(g))} versus the prior period, driven mainly by ${driver} (orders ${spct(go)}, AOV ${spct(ga)}).`,
          metric: `Net sales ${money(cur.net)} vs ${money(prev.net)}`,
          impl: driver === "order volume" ? "Results depend on acquiring and retaining buyers rather than basket size." : "Customers are spending more or less per order; check whether product mix or price is behind it.",
          action: driver === "order volume" ? "Protect conversion and acquisition efficiency; test bundles to lift AOV." : "Confirm the AOV change is not caused by a few large orders before acting on it.",
          kpi: "Orders, AOV",
        });
      }
    }

    // 2. Target gap
    if (target && target.available) {
      const m = target.metrics.net, gap = target.gap;
      if (m.status !== "on" && m.status !== "na") {
        const vol = gap.volume, val = gap.value;
        const main = Math.abs(vol) >= Math.abs(val) ? "order volume" : "order value";
        add({
          sev: m.status === "above" ? "pos" : "neg", rule: `Net revenue outside ±${pct(Targets.PLAN.band, 0)} of the planning target`,
          obs: `Net revenue is ${pct(m.ach, 0)} of the planning target (${money(gap.net)} ${gap.net >= 0 ? "above" : "below"} plan). The gap is mostly ${main}: volume ${money(vol)}, basket value ${money(val)}.`,
          metric: `Actual ${money(m.a)} vs target ${money(m.t)}`,
          impl: "The plan assumes the prior 3-month run-rate plus " + pct(Targets.PLAN.growth, 0) + " monthly growth; deviations show where recent performance departed from trend. Seasonality is not modelled.",
          action: main === "order volume" ? "Review traffic, conversion and acquisition channels for the period." : "Review pricing, discounting and product mix for the period.",
          kpi: "Target attainment %, orders, AOV",
        });
      }
    }

    // 3. Category contribution to change
    if (contrib && contrib.length > 1 && prev && prev.net > 0) {
      const sorted = contrib.filter((c) => c.contribution !== null).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
      const top = sorted[0];
      if (top && Math.abs(top.contribution) >= 0.02) {
        add({
          sev: top.contribution >= 0 ? "pos" : "neg", rule: "Largest category contribution to net-sales change is ≥ 2 pp",
          obs: `${top.name} contributed ${pp(top.contribution)} to the ${spct(cur.net / prev.net - 1)} change in net sales (${money(top.delta)}).`,
          metric: `${top.name}: ${money(top.net)} vs ${money(top.prevNet)}`,
          impl: "Change in total revenue is concentrated in one category rather than broad-based.",
          action: "Examine pricing, availability and promotion in this category before drawing company-wide conclusions.",
          kpi: "Category net sales, contribution to growth",
        });
      }
    }

    // 4. Margin movement
    if (prev && cur.gm !== null && prev.gm !== null && Math.abs(cur.gm - prev.gm) >= 0.015) {
      const d = cur.gm - prev.gm;
      add({
        sev: d >= 0 ? "pos" : "neg", rule: "|Gross margin change| ≥ 1.5 pp vs the prior period",
        obs: `Gross margin ${d >= 0 ? "improved" : "declined"} ${pp(d)} to ${pct(cur.gm)} (discount rate ${pct(cur.discRate)} vs ${pct(prev.discRate)}).`,
        metric: `Margin ${pct(cur.gm)} vs ${pct(prev.gm)}`,
        impl: d < 0 ? "Profit is growing more slowly than sales (or falling faster). Discounts, mix or returns may be eroding margin." : "Mix or pricing is favouring higher-margin lines.",
        action: d < 0 ? "Break down margin by category and channel before adding promotional spend." : "Identify which categories drove the gain and protect that mix.",
        kpi: "Gross margin %, discount rate",
      });
    }

    // 5. High-revenue, below-average-margin category
    const catRows = Array.from(byCat.entries()).map(([k, s]) => ({ name: D.dims.categories[k], ...s })).filter((c) => c.net > 0);
    if (catRows.length > 1 && cur.gm !== null) {
      const big = catRows.slice().sort((a, b) => b.net - a.net)[0];
      if (big.gm !== null && big.gm < cur.gm - 0.03 && big.net / cur.net > 0.1) {
        add({
          sev: "warn", rule: "Largest category (>10% of net sales) has margin >3 pp below the blended margin",
          obs: `${big.name} is the largest category (${pct(big.net / cur.net)} of net sales) but earns ${pct(big.gm)} gross margin vs ${pct(cur.gm)} blended.`,
          metric: `${big.name}: ${money(big.net)} net sales, ${money(big.gp)} gross profit`,
          impl: "Revenue is concentrated in a lower-margin line, so profit grows more slowly than sales.",
          action: "Review unit costs, discount depth and channel mix for this category; consider pricing tests.",
          kpi: "Category gross margin and gross profit",
        });
      }
    }

    // 6. Channel margin spread
    const chRows = Array.from(byCh.entries()).map(([k, s]) => ({ name: D.dims.channels[k], ...s })).filter((c) => c.net > 0 && c.gm !== null);
    if (chRows.length > 1) {
      chRows.sort((a, b) => b.gm - a.gm);
      const hi = chRows[0], lo = chRows[chRows.length - 1];
      if (hi.gm - lo.gm >= 0.03) {
        add({
          sev: "info", rule: "Channel margin spread ≥ 3 pp",
          obs: `${hi.name} earns ${pct(hi.gm)} margin vs ${pct(lo.gm)} on ${lo.name} (discount rate ${pct(hi.discRate)} vs ${pct(lo.discRate)}; return rate ${pct(hi.returnRate)} vs ${pct(lo.returnRate)}).`,
          metric: `${hi.name} gross profit ${money(hi.gp)}; ${lo.name} ${money(lo.gp)}`,
          impl: "Channel mix moves blended profit even when revenue is unchanged.",
          action: `Direct incremental promotion toward ${hi.name}; review fees or discount depth on ${lo.name}.`,
          kpi: "Margin by channel, channel share of gross profit",
        });
      }
    }

    // 7. Return outliers
    if (cur.returnRate !== null) {
      const outl = prods.filter((p) => p.units >= 15 && p.returnRate >= Math.max(2 * cur.returnRate, 0.12));
      if (outl.length) {
        const lost = outl.reduce((a, p) => a + p.refunds, 0);
        const worst = outl.slice().sort((a, b) => b.returnRate - a.returnRate)[0];
        add({
          sev: "neg", rule: "SKU return rate ≥ max(2× blended, 12%) with ≥ 15 units",
          obs: `${outl.length} SKU${outl.length > 1 ? "s have" : " has"} a return rate at least twice the blended ${pct(cur.returnRate)}, accounting for ${money(lost)} of refunds.`,
          metric: `Highest: ${worst.name} at ${pct(worst.returnRate)}`,
          impl: "Concentrated returns usually point to product quality, listing accuracy or fit problems rather than demand issues.",
          action: "Investigate these SKUs (return reasons, supplier quality, listing content) before promoting them.",
          kpi: "SKU return rate, refund value",
        });
      }
    }

    // 8. Discount dependence
    if (cur.discRate !== null) {
      const dep = catRows.filter((c) => c.discRate !== null && c.discRate > cur.discRate * 1.4 && c.net / cur.net > 0.03);
      if (dep.length) {
        const d = dep.sort((a, b) => b.discRate - a.discRate)[0];
        add({
          sev: "warn", rule: "Category discount rate > 1.4× blended (category >3% of sales)",
          obs: `${d.name} is discounted ${pct(d.discRate)} of gross sales vs ${pct(cur.discRate)} blended.`,
          metric: `Margin ${pct(d.gm)}; blended ${pct(cur.gm)}`,
          impl: "Category sales may be leaning on promotions: volume gained at the cost of margin.",
          action: "Test lower discount depth on a sample of SKUs and compare unit sales and gross profit.",
          kpi: "Discount rate, gross profit per order",
        });
      }
    }

    // 9. Repeat purchase dependency
    if (cur.customers >= 50) {
      add({
        sev: cur.repeatRate < 0.05 ? "warn" : "info", rule: "Shown when ≥ 50 customers in the period",
        obs: `Only ${pct(cur.repeatRate)} of customers in this period had bought before (${cur.returningCustomers.toLocaleString()} returning vs ${cur.newCustomers.toLocaleString()} new).`,
        metric: `Purchase frequency ${cur.freq.toFixed(2)} orders per customer`,
        impl: cur.repeatRate < 0.05 ? "Revenue is overwhelmingly first-time purchases, so lifetime value rests on the first order and retention is a large untapped lever." : "A meaningful share of revenue comes from returning customers.",
        action: "Pilot post-purchase CRM (accessory cross-sell, warranty registration) and measure 90-day repurchase by cohort.",
        kpi: "Repeat purchase rate, 90-day repurchase rate",
      });
    }

    // 10. Customer concentration
    if (cv && cv.top10Share !== null && cur.customers >= 100) {
      add({
        sev: "info", rule: "Shown when ≥ 100 customers",
        obs: `The top 10% of customers account for ${pct(cv.top10Share)} of net sales (median customer spend ${money(cv.median)}).`,
        metric: `Top-decile threshold: ${money(cv.top10Cut)}`,
        impl: cv.top10Share > 0.3 ? "Revenue is moderately concentrated in high-ticket buyers (often laptops and PCs)." : "Revenue is broadly spread across customers.",
        action: "Profile high-value buyers (category, region) to target look-alike acquisition.",
        kpi: "Top-decile revenue share",
      });
    }

    // 11. Marketing efficiency
    if (mkt && mkt.per.some((p) => p.spend > 0)) {
      const valid = mkt.per.filter((p) => p.cac !== null && p.spend > 0);
      if (valid.length > 1) {
        const best = valid.slice().sort((a, b) => a.cac - b.cac)[0], worst = valid.slice().sort((a, b) => b.cac - a.cac)[0];
        if (worst.cac > best.cac * 1.3) {
          add({
            sev: "info", rule: "Highest-CAC channel is ≥ 1.3× the lowest",
            obs: `CAC ranges from ${money(best.cac)} (${best.name}) to ${money(worst.cac)} (${worst.name}).`,
            metric: `ROAS ${best.roas.toFixed(1)}x vs ${worst.roas.toFixed(1)}x (attributed revenue, not incremental)`,
            impl: "ROAS and CAC use last-touch attribution, which does not establish that a channel caused the revenue.",
            action: "Validate with a holdout or geo test before reallocating budget between these channels.",
            kpi: "CAC, incremental ROAS",
          });
        }
      }
    }

    // 12. Delivery experience
    const ord = ctx.orders.filter((o) => o.ddays >= 0);
    if (ord.length >= 100) {
      const withLate = ord.filter((o) => o.late >= 0);
      const late = withLate.filter((o) => o.late === 1).length / withLate.length;
      const sc = ord.filter((o) => o.score > 0);
      const lateScore = sc.filter((o) => o.late === 1), onScore = sc.filter((o) => o.late === 0);
      if (lateScore.length >= 20 && onScore.length >= 20) {
        const a = lateScore.reduce((x, o) => x + o.score, 0) / lateScore.length, b = onScore.reduce((x, o) => x + o.score, 0) / onScore.length;
        if (b - a >= 0.5) {
          add({
            sev: "warn", rule: "Late-delivery review score ≥ 0.5 below the on-time score (≥ 20 orders each)",
            obs: `${pct(late)} of delivered orders arrive after the estimated date, and late orders average ${a.toFixed(2)} stars vs ${b.toFixed(2)} for on-time orders.`,
            metric: `${lateScore.length} late vs ${onScore.length} on-time reviewed orders`,
            impl: "Delivery reliability is a measurable driver of customer satisfaction.",
            action: "Review carrier performance by region and tighten delivery-date estimates.",
            kpi: "On-time delivery %, average review score",
          });
        }
      }
    }

    // 13. Unusual periods
    if (anomalies && anomalies.length) {
      const a = anomalies[0];
      add({
        sev: a.dir === "high" ? "info" : "warn", rule: "Modified z-score > 3.5 on net sales (median/MAD)",
        obs: `${anomalies.length} unusual period${anomalies.length > 1 ? "s" : ""} detected in net sales. The largest is ${a.label}: ${money(a.value)} vs a typical ${money(a.expected)} (${spct(a.dev)}).`,
        metric: `Robust z-score ${a.z.toFixed(1)}`,
        impl: a.dir === "high" ? "Spikes often coincide with promotions or seasonal events (for example Black Friday); check whether the lift was profitable." : "Dips can reflect stock, site or fulfilment disruption, or data gaps at the edge of the dataset.",
        action: "Cross-check the period against promotion calendar, stock availability and operational incidents.",
        kpi: "Net sales by period, orders",
      });
    }
    return out;
  }
  window.Insights = { generate };
})();
