/* Analytical helpers built on the metric layer: anomaly detection and contribution analysis. */
(function () {
  const { M } = window;
  const { D } = M;
  const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

  /** Robust outlier detection (median / MAD, modified z-score > 3.5) on a series of buckets.
   * Needs at least `minPoints` buckets; constant series are never flagged. */
  function anomalies(ser, pick, minPoints) {
    const pts = ser.filter((p) => !p.partial);
    if (pts.length < (minPoints || 8)) return [];
    const vals = pts.map((p) => pick(p.s));
    const med = median(vals), mad = median(vals.map((v) => Math.abs(v - med)));
    if (!mad) return [];
    const out = [];
    pts.forEach((p, i) => {
      const z = (0.6745 * (vals[i] - med)) / mad;
      if (Math.abs(z) > 3.5) out.push({ label: p.label, value: vals[i], expected: med, dev: med ? vals[i] / med - 1 : null, z, absz: Math.abs(z), dir: z > 0 ? "high" : "low" });
    });
    return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  }

  /** Contribution of each group to the change in net sales between two periods. */
  function contribution(curMap, prevMap, labelFn) {
    let prevTotal = 0, curTotal = 0;
    for (const s of prevMap.values()) prevTotal += s.net;
    for (const s of curMap.values()) curTotal += s.net;
    const keys = new Set([...curMap.keys(), ...(prevMap ? prevMap.keys() : [])]);
    const out = [];
    for (const k of keys) {
      const c = curMap.get(k), p = prevMap.get(k);
      const net = c ? c.net : 0, pnet = p ? p.net : 0;
      out.push({
        name: labelFn(k), key: k, net, prevNet: pnet, delta: net - pnet,
        growth: pnet > 0 ? net / pnet - 1 : null,
        share: curTotal ? net / curTotal : 0,
        contribution: prevTotal ? (net - pnet) / prevTotal : null, // percentage points of total growth
        gm: c ? c.gm : null, prevGm: p ? p.gm : null,
        gmChange: c && p && c.gm !== null && p.gm !== null ? c.gm - p.gm : null,
        gp: c ? c.gp : 0, units: c ? c.units : 0, discRate: c ? c.discRate : null, returnRate: c ? c.returnRate : null,
      });
    }
    return out;
  }
  /** Ordinary least-squares line through (x, y) points; null if fewer than 3 points or no x variance. */
  function linreg(xs, ys) {
    const n = xs.length; if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
    if (!sxx) return null;
    return { slope: sxy / sxx, intercept: my - (sxy / sxx) * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : null };
  }
  window.Analytics = { anomalies, contribution, median, linreg };
})();
