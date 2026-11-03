"""Load, clean and validate the REAL Olist source data.

Output: a dict of cleaned DataFrames plus a data-quality log (list of dicts).
No synthetic values are created in this module.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402


def _log(log, check, detail, rows_affected=0, action=""):
    log.append({"check": check, "detail": detail, "rows_affected": int(rows_affected), "action": action})


def load_clean():
    log = []
    r = config.RAW

    # ---- orders -----------------------------------------------------------
    orders = pd.read_csv(r / "olist_orders_dataset.csv")
    n0 = len(orders)
    orders = orders.drop_duplicates("order_id")
    _log(log, "orders: duplicate order_id", "Exact duplicate order ids", n0 - len(orders), "dropped")
    ts_cols = ["order_purchase_timestamp", "order_approved_at", "order_delivered_carrier_date",
               "order_delivered_customer_date", "order_estimated_delivery_date"]
    for c in ts_cols:
        before = orders[c].isna().sum()
        orders[c] = pd.to_datetime(orders[c], errors="coerce")
        bad = orders[c].isna().sum() - before
        if bad:
            _log(log, f"orders: invalid date in {c}", "Unparseable timestamps set to NaT", bad, "set NaT")
    miss_purchase = orders["order_purchase_timestamp"].isna().sum()
    _log(log, "orders: missing purchase timestamp", "Orders without purchase date cannot be placed in time",
         miss_purchase, "dropped")
    orders = orders.dropna(subset=["order_purchase_timestamp"])
    # delivered orders missing a delivery date / delivered before purchase
    d = orders["order_status"].eq("delivered")
    nodate = (d & orders["order_delivered_customer_date"].isna()).sum()
    _log(log, "orders: delivered but no delivery date", "Status delivered, delivery timestamp missing",
         nodate, "kept; excluded from delivery-time metrics")
    neg = (orders["order_delivered_customer_date"] < orders["order_purchase_timestamp"]).sum()
    _log(log, "orders: delivery before purchase", "Impossible chronology", neg, "delivery time set NaN")
    bad_chron = orders["order_delivered_customer_date"] < orders["order_purchase_timestamp"]
    orders.loc[bad_chron, "order_delivered_customer_date"] = pd.NaT

    # ---- customers --------------------------------------------------------
    cust = pd.read_csv(r / "olist_customers_dataset.csv")
    n0 = len(cust)
    cust = cust.drop_duplicates("customer_id")
    _log(log, "customers: duplicate customer_id", "", n0 - len(cust), "dropped")
    cust["customer_city"] = cust["customer_city"].str.strip().str.lower().str.title()
    cust["region"] = cust["customer_state"].map(config.BRAZIL_REGION)
    _log(log, "customers: unmapped state", "State code not in region map", cust["region"].isna().sum(), "region=Unknown")
    cust["region"] = cust["region"].fillna("Unknown")

    # ---- products ---------------------------------------------------------
    prod = pd.read_csv(r / "olist_products_dataset.csv")
    prod = prod.drop_duplicates("product_id")
    trans = pd.read_csv(r / "product_category_name_translation.csv", encoding="utf-8-sig")
    prod = prod.merge(trans, on="product_category_name", how="left")
    missing_cat = prod["product_category_name"].isna().sum()
    _log(log, "products: missing category", "Cannot be classified as electronics", missing_cat, "excluded by scope")
    unmapped = (prod["product_category_name"].notna() & prod["product_category_name_english"].isna()).sum()
    _log(log, "products: category without English translation", "", unmapped, "excluded by scope (not electronics)")

    # ---- order items ------------------------------------------------------
    items = pd.read_csv(r / "olist_order_items_dataset.csv")
    n0 = len(items)
    items = items.drop_duplicates(["order_id", "order_item_id"])
    _log(log, "items: duplicate (order_id, order_item_id)", "", n0 - len(items), "dropped")
    bad_price = (items["price"] <= 0).sum()
    _log(log, "items: non-positive price", "", bad_price, "dropped")
    items = items[items["price"] > 0]
    orphan = (~items["order_id"].isin(orders["order_id"])).sum()
    _log(log, "items: order_id missing from orders", "Referential integrity", orphan, "dropped")
    items = items[items["order_id"].isin(orders["order_id"])]
    orphan_p = (~items["product_id"].isin(prod["product_id"])).sum()
    _log(log, "items: product_id missing from products", "Referential integrity", orphan_p, "dropped")
    items = items.merge(prod[["product_id", "product_category_name", "product_weight_g"]], on="product_id", how="inner")

    # ---- scope to electronics --------------------------------------------
    total_items = len(items)
    items = items[items["product_category_name"].isin(config.ELECTRONICS_CATEGORIES)].copy()
    items["category"] = items["product_category_name"].map(config.ELECTRONICS_CATEGORIES)
    _log(log, "scope: non-electronics items", "Items in categories outside ELECTRONICS_CATEGORIES",
         total_items - len(items), "excluded (documented scope)")

    # ---- reviews (one per order: keep the most recently answered) ---------
    rev = pd.read_csv(r / "olist_order_reviews_dataset.csv")
    rev["review_answer_timestamp"] = pd.to_datetime(rev["review_answer_timestamp"], errors="coerce")
    n0 = len(rev)
    rev = rev.sort_values("review_answer_timestamp").drop_duplicates("order_id", keep="last")
    _log(log, "reviews: multiple reviews per order", "Kept most recent per order", n0 - len(rev), "deduplicated")
    rev = rev[["order_id", "review_score"]]

    # ---- assemble order-item fact (real columns only) ---------------------
    orders = orders.merge(cust[["customer_id", "customer_unique_id", "customer_city", "customer_state", "region"]],
                          on="customer_id", how="left")
    _log(log, "orders: customer not found", "", orders["customer_unique_id"].isna().sum(), "dropped")
    orders = orders.dropna(subset=["customer_unique_id"])

    f = items.merge(orders, on="order_id", how="inner")
    f = f.merge(rev, on="order_id", how="left")

    # status eligibility
    f["eligible"] = f["order_status"].isin(config.ELIGIBLE_STATUSES)
    _log(log, "items: cancelled/unavailable orders", "Kept in fact table, flagged eligible=0, excluded from revenue KPIs",
         (~f["eligible"]).sum(), "flagged")

    # first purchase per customer: computed on ALL history (incl. 2016) for eligible electronics orders
    elig_orders = (f[f["eligible"]].groupby(["customer_unique_id", "order_id"])["order_purchase_timestamp"]
                   .min().reset_index().sort_values(["customer_unique_id", "order_purchase_timestamp", "order_id"]))
    elig_orders["order_rank"] = elig_orders.groupby("customer_unique_id").cumcount() + 1
    first_ts = elig_orders[elig_orders["order_rank"] == 1].set_index("customer_unique_id")["order_purchase_timestamp"]
    f["is_first_order"] = f["order_id"].isin(elig_orders.loc[elig_orders["order_rank"] == 1, "order_id"])
    f["cohort_month"] = f["customer_unique_id"].map(first_ts).dt.to_period("M").astype("string")

    # window
    in_win = (f["order_purchase_timestamp"] >= config.WINDOW_START) & \
             (f["order_purchase_timestamp"] < pd.Timestamp(config.WINDOW_END) + pd.Timedelta(days=1))
    _log(log, "window: outside reporting window", f"Kept {config.WINDOW_START}..{config.WINDOW_END}",
         (~in_win).sum(), "excluded")
    f = f[in_win].copy()

    # delivery metrics (real)
    f["delivery_days"] = (f["order_delivered_customer_date"] - f["order_purchase_timestamp"]).dt.total_seconds() / 86400
    f["late"] = (f["order_delivered_customer_date"] > f["order_estimated_delivery_date"]).where(
        f["order_delivered_customer_date"].notna())
    f["purchase_date"] = f["order_purchase_timestamp"].dt.normalize()

    missing_rev = f.loc[f["eligible"], "review_score"].isna().sum()
    _log(log, "items: no review score", "Order has no review", missing_rev, "left null; excluded from review metrics")

    f = f.sort_values(["order_purchase_timestamp", "order_id", "order_item_id"]).reset_index(drop=True)
    keep = ["order_id", "order_item_id", "product_id", "seller_id", "price", "freight_value", "category",
            "customer_unique_id", "customer_city", "customer_state", "region", "order_status", "eligible",
            "purchase_date", "order_purchase_timestamp", "delivery_days", "late", "review_score",
            "is_first_order", "cohort_month"]
    return {"fact": f[keep], "products": prod, "customers": cust}, log


if __name__ == "__main__":
    data, lg = load_clean()
    print(data["fact"].shape)
    for l in lg:
        print(l)
