"""Orchestrates the full build:

    raw Olist CSVs -> clean (real) -> synthetic layer -> processed CSVs + SQLite DB
                   -> dashboard data bundle (src/dashboard/data/data.js)
                   -> data-quality report (docs/DATA_QUALITY_REPORT.md)

Run:  python src/data_processing/build.py
"""
import json
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from clean import load_clean  # noqa: E402
from synthetic import add_synthetic  # noqa: E402

EPOCH = pd.Timestamp("2017-01-01")


def write_sqlite(f, mkt, inv, prod_labels):
    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    if config.DB_PATH.exists():
        config.DB_PATH.unlink()
    con = sqlite3.connect(config.DB_PATH)
    fact = f.copy()
    fact["purchase_date"] = fact["purchase_date"].dt.strftime("%Y-%m-%d")
    fact["order_purchase_timestamp"] = fact["order_purchase_timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")
    fact["eligible"] = fact["eligible"].astype(int)
    fact["is_first_order"] = fact["is_first_order"].astype(int)
    fact["late"] = fact["late"].astype("float").where(fact["late"].notna(), None)
    fact["cohort_month"] = fact["cohort_month"].astype(str)
    fact.to_sql("fact_order_item", con, index=False)

    dim_p = (f.groupby("product_id").agg(category=("category", "first"), unit_cost_syn=("unit_cost_syn", "first"))
             .reset_index())
    dim_p["sku_label"] = dim_p["product_id"].map(prod_labels)
    dim_p.to_sql("dim_product", con, index=False)

    dim_c = (f.sort_values("order_purchase_timestamp").groupby("customer_unique_id")
             .agg(city=("customer_city", "first"), state=("customer_state", "first"),
                  region=("region", "first"), cohort_month=("cohort_month", "first")).reset_index())
    dim_c["cohort_month"] = dim_c["cohort_month"].astype(str)
    dim_c.to_sql("dim_customer", con, index=False)
    mkt.to_sql("marketing_spend_syn", con, index=False)
    inv.to_sql("inventory_syn", con, index=False)
    con.executescript("""
        CREATE INDEX ix_f_date ON fact_order_item(purchase_date);
        CREATE INDEX ix_f_order ON fact_order_item(order_id);
        CREATE INDEX ix_f_cust ON fact_order_item(customer_unique_id);
        CREATE VIEW v_item_metrics AS
        SELECT *, substr(purchase_date,1,7) AS month,
               price AS gross_sales,
               discount_syn AS discounts,
               refund_syn AS refunds,
               price - discount_syn - refund_syn AS net_sales,
               unit_cost_syn * (1 - returned_syn) AS cogs,
               price - discount_syn - refund_syn - unit_cost_syn * (1 - returned_syn) AS gross_profit
        FROM fact_order_item WHERE eligible = 1;
    """)
    con.commit()
    con.close()


def build_bundle(f, mkt, inv, prod_labels):
    """Columnar JSON bundle consumed by the dashboard's metric layer."""
    f = f.copy()
    f["day"] = (f["purchase_date"] - EPOCH).dt.days
    f["oi"] = pd.factorize(f["order_id"])[0]
    f["cu"] = pd.factorize(f["customer_unique_id"])[0]

    cats = list(config.ELECTRONICS_CATEGORIES.values())
    channels = config.SALES_CHANNELS
    mchans = config.MARKETING_CHANNELS + [config.ORGANIC]
    regions = ["North", "Northeast", "Central-West", "Southeast", "South"]
    states = sorted(f["customer_state"].unique())
    top_cities = f[f["eligible"]].groupby("customer_city")["price"].size().sort_values(ascending=False).head(30).index.tolist()
    cities = top_cities + ["Other cities"]
    reasons = [""] + config.RETURN_REASONS
    skus = f["product_id"].value_counts().index.tolist()
    sku_ix = {p: i for i, p in enumerate(skus)}
    cohorts = sorted(f["cohort_month"].dropna().unique())
    cohort_ix = {c: i for i, c in enumerate(cohorts)}

    def r2(s):
        return [round(float(x), 2) for x in s]

    cols = {
        "oi": f["oi"].tolist(),
        "day": f["day"].tolist(),
        "cat": f["category"].map({c: i for i, c in enumerate(cats)}).tolist(),
        "sku": f["product_id"].map(sku_ix).tolist(),
        "region": f["region"].map({r: i for i, r in enumerate(regions)}).tolist(),
        "state": f["customer_state"].map({s: i for i, s in enumerate(states)}).tolist(),
        "city": f["customer_city"].map(lambda c: cities.index(c) if c in top_cities else len(cities) - 1).tolist(),
        "ch": f["channel_syn"].map({c: i for i, c in enumerate(channels)}).tolist(),
        "mk": f["marketing_channel_syn"].map({c: i for i, c in enumerate(mchans)}).tolist(),
        "cu": f["cu"].tolist(),
        "price": r2(f["price"]),
        "freight": r2(f["freight_value"]),
        "cost": r2(f["unit_cost_syn"]),
        "disc": r2(f["discount_syn"]),
        "ret": f["returned_syn"].tolist(),
        "refund": r2(f["refund_syn"]),
        "rr": f["return_reason_syn"].map({r: i for i, r in enumerate(reasons)}).tolist(),
        "score": f["review_score"].fillna(-1).astype(int).tolist(),
        "ddays": [round(float(x), 1) if pd.notna(x) else -1 for x in f["delivery_days"]],
        "late": [int(x) if pd.notna(x) else -1 for x in f["late"].astype("float")],
        "elig": f["eligible"].astype(int).tolist(),
        "first": f["is_first_order"].astype(int).tolist(),
        "cohort": f["cohort_month"].map(cohort_ix).fillna(-1).astype(int).tolist(),
    }
    inv_rows = []
    cat_of = f.groupby("product_id")["category"].first()
    for _, r in inv.iterrows():
        inv_rows.append({"sku": sku_ix[r.product_id], "onHand": int(r.on_hand_syn),
                         "sold90": int(r.units_sold_90d), "soldTotal": int(r.units_sold_total),
                         "daysSinceReceipt": int(r.days_since_last_receipt_syn), "unitCost": float(r.unit_cost_syn)})
    bundle = {
        "meta": {
            "company": "VOLTIX", "epoch": "2017-01-01",
            "windowStart": config.WINDOW_START, "windowEnd": config.WINDOW_END,
            "built": str(pd.Timestamp.now().date()),
            "nItems": len(f), "currency": "BRL",
        },
        "dims": {"categories": cats, "channels": channels, "mktChannels": mchans, "regions": regions,
                 "states": states, "cities": cities, "returnReasons": reasons, "cohorts": cohorts,
                 "skuLabels": [prod_labels[p] for p in skus],
                 "skuCategory": [cats.index(cat_of[p]) for p in skus]},
        "items": cols,
        "marketing": mkt.to_dict(orient="records"),
        "inventory": inv_rows,
        "rfm": config.RFM,
    }
    config.DASH_DATA.mkdir(parents=True, exist_ok=True)
    with open(config.DASH_DATA / "data.js", "w") as fh:
        fh.write("window.VOLTIX_DATA = ")
        json.dump(bundle, fh, separators=(",", ":"))
        fh.write(";\n")
    return bundle


def write_dq_report(log, f):
    config.DOCS.mkdir(exist_ok=True)
    lines = ["# Data Quality Report", "",
             "Generated by `src/data_processing/build.py`. Every check below was run on the raw Olist files.", "",
             "| Check | Detail | Rows affected | Action |", "|---|---|---:|---|"]
    for l in log:
        lines.append(f"| {l['check']} | {l['detail']} | {l['rows_affected']:,} | {l['action']} |")
    e = f[f["eligible"]]
    lines += ["", "## Resulting analytical dataset", "",
              f"- Order-item rows: **{len(f):,}** ({int(f['eligible'].sum()):,} eligible)",
              f"- Orders (eligible): **{e['order_id'].nunique():,}**",
              f"- Unique customers (eligible): **{e['customer_unique_id'].nunique():,}**",
              f"- Date range: **{f['purchase_date'].min().date()} to {f['purchase_date'].max().date()}**",
              f"- Gross sales (item price, excl. freight): **R$ {e['price'].sum():,.2f}**", ""]
    (config.DOCS / "DATA_QUALITY_REPORT.md").write_text("\n".join(lines))


def main():
    data, log = load_clean()
    fact = data["fact"]
    f, mkt, inv = add_synthetic(fact)
    prod_labels = {p: f"{c} · {p[:6].upper()}" for p, c in f.groupby("product_id")["category"].first().items()}

    config.PROCESSED.mkdir(parents=True, exist_ok=True)
    f.to_csv(config.PROCESSED / "fact_order_item.csv", index=False)
    mkt.to_csv(config.PROCESSED / "marketing_spend_syn.csv", index=False)
    inv.to_csv(config.PROCESSED / "inventory_syn.csv", index=False)
    write_sqlite(f, mkt, inv, prod_labels)
    build_bundle(f, mkt, inv, prod_labels)
    write_dq_report(log, f)
    e = f[f["eligible"]]
    print(f"Built: {len(f):,} items | {e.order_id.nunique():,} orders | {e.customer_unique_id.nunique():,} customers")
    print(f"Gross sales R$ {e.price.sum():,.0f} | discounts R$ {e.discount_syn.sum():,.0f} | refunds R$ {e.refund_syn.sum():,.0f}")


if __name__ == "__main__":
    main()
