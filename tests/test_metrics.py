"""Validation tests for core business metrics.

Run:  python -m pytest tests -q      (or: python tests/test_metrics.py)
Three independent routes to the same numbers must agree:
  A. pandas computed directly from the RAW Olist CSVs (no pipeline code)
  B. SQL over the SQLite database (v_item_metrics)
  C. the dashboard's JavaScript metric layer (run under Node)
"""
import json, sqlite3, subprocess, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import config  # noqa: E402

TOL = 0.01


def raw_gross_and_orders():
    """Route A: from raw CSVs, independently of clean.py."""
    o = pd.read_csv(config.RAW / "olist_orders_dataset.csv", parse_dates=["order_purchase_timestamp"])
    i = pd.read_csv(config.RAW / "olist_order_items_dataset.csv")
    p = pd.read_csv(config.RAW / "olist_products_dataset.csv")
    m = i.merge(o, on="order_id").merge(p[["product_id", "product_category_name"]], on="product_id")
    m = m[m.product_category_name.isin(config.ELECTRONICS_CATEGORIES)]
    m = m[m.order_status.isin(config.ELIGIBLE_STATUSES)]
    d = m.order_purchase_timestamp
    m = m[(d >= config.WINDOW_START) & (d < pd.Timestamp(config.WINDOW_END) + pd.Timedelta(days=1))]
    return m.price.sum(), m.order_id.nunique(), len(m)


def db():
    return sqlite3.connect(config.DB_PATH)


def test_gross_sales_reconciles_with_raw():
    g, orders, units = raw_gross_and_orders()
    r = db().execute("select sum(gross_sales), count(distinct order_id), count(*) from v_item_metrics").fetchone()
    assert abs(r[0] - g) < TOL, (r[0], g)
    assert r[1] == orders and r[2] == units


def test_net_sales_identity():
    r = db().execute("select sum(gross_sales), sum(discounts), sum(refunds), sum(net_sales) from v_item_metrics").fetchone()
    assert abs(r[0] - r[1] - r[2] - r[3]) < 0.5


def test_no_double_counting_when_joining_orders_to_items():
    """Orders counted by DISTINCT id; sum of per-order net equals item-level net."""
    c = db()
    a = c.execute("select sum(net_sales) from v_item_metrics").fetchone()[0]
    b = c.execute("select sum(n) from (select order_id, sum(net_sales) n from v_item_metrics group by order_id)").fetchone()[0]
    assert abs(a - b) < 0.01
    dup = c.execute("select count(*) from (select order_id, order_item_id from fact_order_item group by 1,2 having count(*)>1)").fetchone()[0]
    assert dup == 0


def test_no_cancelled_orders_in_metrics():
    n = db().execute("select count(*) from v_item_metrics where order_status in ('canceled','unavailable')").fetchone()[0]
    assert n == 0


def test_referential_integrity_and_ranges():
    c = db()
    assert c.execute("select count(*) from fact_order_item f left join dim_product p using(product_id) where p.product_id is null").fetchone()[0] == 0
    assert c.execute("select count(*) from fact_order_item f left join dim_customer d using(customer_unique_id) where d.customer_unique_id is null").fetchone()[0] == 0
    lo, hi = c.execute("select min(purchase_date), max(purchase_date) from fact_order_item").fetchone()
    assert lo >= config.WINDOW_START and hi <= config.WINDOW_END
    assert c.execute("select count(*) from fact_order_item where price<=0 or discount_syn<0 or refund_syn<0").fetchone()[0] == 0
    assert c.execute("select count(*) from fact_order_item where returned_syn=1 and order_status<>'delivered'").fetchone()[0] == 0


def test_first_order_flag_is_one_per_customer():
    n = db().execute("select count(*) from (select customer_unique_id, count(distinct order_id) k from fact_order_item where is_first_order=1 and eligible=1 group by 1 having k>1)").fetchone()[0]
    assert n == 0


def test_simulation_is_reproducible():
    """Same seed -> identical simulated columns."""
    sys.path.insert(0, str(ROOT / "src" / "data_processing"))
    from clean import load_clean
    from synthetic import add_synthetic
    d, _ = load_clean()
    a, _, _ = add_synthetic(d["fact"]); b, _, _ = add_synthetic(d["fact"])
    pd.testing.assert_frame_equal(a, b)


NODE = r"""
global.window = {};
require(process.argv[2]);
require(process.argv[3]);
const M = window.M, D = window.VOLTIX_DATA;
const f = {start: M.START, end: M.END, cat: null, ch: null, region: null};
const full = M.summarize(M.select(f));
const cat0 = M.summarize(M.select({...f, cat: 0}));
const mk = M.marketing(f, M.select(f));
console.log(JSON.stringify({gross: full.gross, net: full.net, gp: full.gp, orders: full.orders, units: full.units,
  returned: full.returnedUnits, cat0net: cat0.net, spend: mk.totalSpend, cats: D.dims.categories[0]}));
"""


def test_dashboard_js_matches_sql():
    """Route C vs B: dashboard metric layer must reproduce SQL totals exactly (full period, no filters)."""
    tmp = ROOT / "tests" / "_node_check.js"
    tmp.write_text(NODE)
    try:
        out = subprocess.run(["node", str(tmp), str(config.DASH_DATA / "data.js"), str(ROOT / "src/dashboard/js/metrics.js")],
                             capture_output=True, text=True, check=True).stdout
    finally:
        tmp.unlink()
    js = json.loads(out)
    c = db()
    s = c.execute("select sum(gross_sales), sum(net_sales), sum(gross_profit), count(distinct order_id), count(*), sum(returned_syn) from v_item_metrics").fetchone()
    assert abs(js["gross"] - s[0]) < 1 and abs(js["net"] - s[1]) < 1 and abs(js["gp"] - s[2]) < 1
    assert js["orders"] == s[3] and js["units"] == s[4] and js["returned"] == s[5]
    cat_net = c.execute("select sum(net_sales) from v_item_metrics where category=?", (js["cats"],)).fetchone()[0]
    assert abs(js["cat0net"] - cat_net) < 1
    spend = c.execute("select sum(spend_syn) from marketing_spend_syn").fetchone()[0]
    assert abs(js["spend"] - spend) < 1


if __name__ == "__main__":
    fns = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for fn in fns:
        fn(); print("PASS", fn.__name__)
