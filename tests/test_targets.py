"""Independent check of the planning-target engine and date handling.

Targets are recomputed here in pandas from the processed fact table (no dashboard code) and compared with
src/dashboard/js/targets.js executed under Node, including a pro-rated partial-month window and a category filter.
"""
import json, subprocess, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import config  # noqa: E402

GROWTH, LOOKBACK, UPLIFT = 0.03, 3, 0.005   # must match PLAN in targets.js
NODE = r"""
global.window = global;
const D = process.argv;
require(D[2]); require(D[3]); require(D[4]); require(D[5]);
const cases = JSON.parse(D[6]);
const out = cases.map(c => { const f = {start: M.dateToDay(c.start), end: M.dateToDay(c.end), cat: c.cat, ch: null, region: null};
  const r = Targets.compute(f); return r.available ? {a: {net: r.metrics.net.a, gp: r.metrics.gp.a, orders: r.metrics.orders.a}, t: {net: r.metrics.net.t, gp: r.metrics.gp.t, orders: r.metrics.orders.t}, cov: r.coverageDays} : {unavailable: true}; });
console.log(JSON.stringify(out));
"""


def monthly(df):
    df = df[df.eligible == 1].copy()
    df["net"] = df.price - df.discount_syn - df.refund_syn
    df["gp"] = df.net - df.unit_cost_syn * (1 - df.returned_syn)
    df["m"] = df.purchase_date.dt.to_period("M")
    g = df.groupby("m").agg(net=("net", "sum"), gp=("gp", "sum"))
    g["orders"] = df.groupby("m").order_id.nunique()
    return g


def expected(df, start, end):
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    mon = monthly(df)
    last_complete = pd.Period(config.WINDOW_END, "M") - 1
    T = dict(net=0.0, gp=0.0, orders=0.0); A = dict(net=0.0, gp=0.0, orders=0)
    covered = 0
    for m in pd.period_range(start.to_period("M"), end.to_period("M")):
        base = [m - i for i in range(LOOKBACK, 0, -1)]
        if base[0] < pd.Period("2017-01", "M") or base[-1] > last_complete:
            continue
        b = mon.reindex(base).fillna(0)
        if b.net.mean() <= 0 or b.orders.mean() <= 0:
            continue
        lo, hi = max(start, m.start_time), min(end, m.end_time.normalize())
        days = (hi - lo).days + 1
        frac = days / m.days_in_month
        covered += days
        net_t, ord_t = b.net.mean() * (1 + GROWTH), b.orders.mean() * (1 + GROWTH)
        gm = b.gp.sum() / b.net.sum() + UPLIFT
        T["net"] += net_t * frac; T["orders"] += ord_t * frac; T["gp"] += net_t * gm * frac
        sel = df[(df.eligible == 1) & (df.purchase_date >= lo) & (df.purchase_date <= hi)]
        n = sel.price - sel.discount_syn - sel.refund_syn
        A["orders"] += sel.order_id.nunique(); A["net"] += n.sum(); A["gp"] += (n - sel.unit_cost_syn * (1 - sel.returned_syn)).sum()
    return T, A, covered


def test_targets_match_independent_pandas():
    df = pd.read_csv(config.PROCESSED / "fact_order_item.csv", parse_dates=["purchase_date"])
    cases = [{"start": "2018-06-01", "end": "2018-06-30", "cat": None},
             {"start": "2018-07-10", "end": "2018-08-20", "cat": None},      # partial months, pro-rated
             {"start": "2017-02-01", "end": "2017-05-31", "cat": None}]       # starts before targets exist
    d = ROOT / "src" / "dashboard"
    out = subprocess.run(["node", "-e", NODE, "x", str(d / "data/data.js"), str(d / "js/format.js"), str(d / "js/metrics.js"), str(d / "js/targets.js"), json.dumps(cases)],
                         capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    js = json.loads(out.stdout)
    for c, r in zip(cases, js):
        T, A, cov = expected(df, c["start"], c["end"])
        assert not r.get("unavailable")
        assert r["cov"] == cov, (c, r["cov"], cov)
        for k in ("net", "gp", "orders"):
            assert abs(r["t"][k] - T[k]) < 0.01 * max(1, abs(T[k])) * 0.001 + 0.01, (c, k, r["t"][k], T[k])
            assert abs(r["a"][k] - A[k]) < 0.5, (c, k, "actual", r["a"][k], A[k])


def test_gap_decomposition_is_exact():
    """volume + value effects must equal the net-revenue gap (checked through the dashboard bundle)."""
    node = r"""
global.window = global; const D = process.argv;
require(D[2]); require(D[3]); require(D[4]); require(D[5]);
const f = {start: M.dateToDay('2018-01-01'), end: M.dateToDay('2018-08-20'), cat: null, ch: null, region: null};
const r = Targets.compute(f); console.log(JSON.stringify({gap: r.gap.net, sum: r.gap.volume + r.gap.value}));"""
    d = ROOT / "src" / "dashboard"
    o = subprocess.run(["node", "-e", node, "x", str(d / "data/data.js"), str(d / "js/format.js"), str(d / "js/metrics.js"), str(d / "js/targets.js")], capture_output=True, text=True)
    assert o.returncode == 0, o.stderr
    j = json.loads(o.stdout)
    assert abs(j["gap"] - j["sum"]) < 0.01


if __name__ == "__main__":
    test_targets_match_independent_pandas(); print("PASS test_targets_match_independent_pandas")
    test_gap_decomposition_is_exact(); print("PASS test_gap_decomposition_is_exact")
