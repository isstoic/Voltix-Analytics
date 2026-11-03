"""SYNTHETIC LAYER.

Olist contains no unit cost, list-price discount, sales channel, returns table,
marketing spend or inventory. These are simulated here with a fixed seed so the
build is reproducible. Every simulated column ends in `_syn` (or lives in a table
named *_syn) so it can never be mistaken for source data. Real order dates,
prices, customers, geography and review scores drive the simulation, but the
simulated values are NOT observations.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402


def add_synthetic(fact: pd.DataFrame):
    rng = np.random.default_rng(config.SEED)
    f = fact.copy()

    # ---- product unit cost (fixed per product) ---------------------------
    ref_price = f.groupby("product_id")["price"].median()
    cat_of = f.groupby("product_id")["category"].first()
    margin = cat_of.map(config.CATEGORY_MARGIN) + rng.normal(0, 0.05, len(cat_of))
    margin = margin.clip(0.08, 0.60)
    unit_cost = (ref_price * (1 - margin)).round(2)
    f["unit_cost_syn"] = f["product_id"].map(unit_cost)

    # ---- order-level attributes (one draw per order) ---------------------
    o = (f.groupby("order_id")
         .agg(date=("purchase_date", "first"), cust=("customer_unique_id", "first"),
              is_first=("is_first_order", "first"), score=("review_score", "first"),
              eligible=("eligible", "first"))
         .sort_index())
    n = len(o)
    # marketplaces gain share over time (simulated drift)
    t = (o["date"] - o["date"].min()).dt.days / max((o["date"].max() - o["date"].min()).days, 1)
    p_site = np.clip(0.42 - 0.12 * t, 0.2, 0.5)
    p_mpb = np.clip(0.18 + 0.08 * t, 0.1, 0.4)
    p_mpa = 1 - p_site - p_mpb
    u = rng.random(n)
    ch = np.where(u < p_site, 0, np.where(u < p_site + p_mpa, 1, 2))
    o["channel_syn"] = np.array(config.SALES_CHANNELS)[ch]

    mean_disc = o["channel_syn"].map(config.CHANNEL_MEAN_DISCOUNT) + \
        o["date"].dt.month.map(config.MONTH_DISCOUNT_BOOST).fillna(0.0)
    disc = np.clip(rng.normal(mean_disc, 0.05), 0, 0.40)
    disc = np.where(rng.random(n) < 0.25, 0.0, np.round(disc / 0.05) * 0.05)
    o["discount_rate_syn"] = disc

    # marketing attribution (last touch, simulated)
    acq = rng.choice(config.MARKETING_CHANNELS + [config.ORGANIC], size=n, p=config.ACQ_PROBS)
    rep = np.where(rng.random(n) < 0.4, "Email & CRM", config.ORGANIC)
    o["marketing_channel_syn"] = np.where(o["is_first"], acq, rep)

    # ---- merge back to items --------------------------------------------
    f = f.merge(o[["channel_syn", "discount_rate_syn", "marketing_channel_syn"]],
                left_on="order_id", right_index=True, how="left")
    f["discount_syn"] = (f["price"] * f["discount_rate_syn"]).round(2)

    # ---- returns (item level, delivered orders only) ---------------------
    base = f["category"].map(config.CATEGORY_RETURN_RATE) * f["channel_syn"].map(config.CHANNEL_RETURN_MULT)
    score = f["review_score"].fillna(4)
    mult = np.where(score <= 2, 3.2, np.where(score == 3, 1.4, 0.7))
    # a few SKUs are simulated as problem SKUs so that an outlier analysis has something to find
    pids = f["product_id"].drop_duplicates().to_numpy()
    top = f["product_id"].value_counts().head(60).index.to_numpy()
    problem = set(rng.choice(top, size=6, replace=False))
    sku_mult = f["product_id"].map(lambda p: 3.0 if p in problem else 1.0)
    p_ret = np.clip(base * mult * sku_mult, 0, 0.9)
    returned = (rng.random(len(f)) < p_ret) & f["order_status"].eq("delivered") & f["eligible"]
    f["returned_syn"] = returned.astype(int)
    f["refund_syn"] = np.where(returned, (f["price"] - f["discount_syn"]).round(2), 0.0)
    reasons = np.array(config.RETURN_REASONS)
    w_good = np.array([0.30, 0.25, 0.10, 0.25, 0.10])
    w_bad = np.array([0.40, 0.35, 0.10, 0.05, 0.10])
    pick = np.where(score <= 2,
                    rng.choice(len(reasons), size=len(f), p=w_bad),
                    rng.choice(len(reasons), size=len(f), p=w_good))
    f["return_reason_syn"] = np.where(returned, reasons[pick], "")

    # ---- marketing spend (monthly x channel, simulated budget rule) ------
    e = f[f["eligible"]].copy()
    e["net_syn"] = e["price"] - e["discount_syn"] - e["refund_syn"]
    e["month"] = e["purchase_date"].dt.to_period("M").astype(str)
    monthly = e.groupby("month")["net_syn"].sum()
    rows = []
    for m, net in monthly.items():
        for chn, share in config.MKT_BUDGET_SHARE.items():
            rows.append({"month": m, "channel": chn,
                         "spend_syn": round(float(net * share * rng.lognormal(0, 0.15)), 2)})
    mkt = pd.DataFrame(rows)

    # ---- inventory snapshot as of window end (simulated) -----------------
    end = pd.Timestamp(config.WINDOW_END)
    recent = e[e["purchase_date"] > end - pd.Timedelta(days=90)]
    units90 = recent.groupby("product_id").size()
    units_all = e.groupby("product_id").size().sort_values(ascending=False)
    skus = units_all.head(config.N_INVENTORY_SKUS).index
    inv = pd.DataFrame({"product_id": skus})
    inv["units_sold_total"] = inv["product_id"].map(units_all)
    inv["units_sold_90d"] = inv["product_id"].map(units90).fillna(0).astype(int)
    monthly_rate = np.maximum(inv["units_sold_90d"] / 3.0, 0.4)
    cover_months = np.exp(rng.normal(np.log(2.0), 0.75, len(inv)))
    inv["on_hand_syn"] = np.maximum(0, np.round(monthly_rate * cover_months)).astype(int)
    inv["days_since_last_receipt_syn"] = rng.integers(3, 220, len(inv))
    inv["unit_cost_syn"] = inv["product_id"].map(unit_cost)

    return f, mkt, inv
