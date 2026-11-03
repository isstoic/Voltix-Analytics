# Data Dictionary

Currency: BRL (R$). Taxes are not in the source; item `price` excludes freight. **Bold `_syn` = simulated.**

## fact_order_item (one row per order line; 1 unit per line in Olist)
| Column | Type | Source | Description |
|---|---|---|---|
| order_id, order_item_id | text/int | real | Order and line number (unique together) |
| product_id, seller_id | text | real | Product and seller |
| price | real | real | Item selling price (R$) |
| freight_value | real | real | Shipping charged. **Excluded from revenue metrics** |
| category | text | real (mapped) | VOLTIX electronics category derived from Olist category (see `config.ELECTRONICS_CATEGORIES`) |
| customer_unique_id | text | real | Person-level id (Olist's `customer_id` changes per order) |
| customer_city / customer_state / region | text | real (+ mapped region) | Customer location; Brazil macro-region mapped from state |
| order_status, eligible | text/int | real | `eligible=1` for delivered/shipped/invoiced/processing/approved |
| purchase_date, order_purchase_timestamp | date/ts | real | When ordered |
| delivery_days, late | real/int | real | Purchase→delivered days; 1 if delivered after estimate (null if undelivered) |
| review_score | int | real | 1-5 review score for the order (latest review) |
| is_first_order, cohort_month | int/text | derived (real) | First eligible electronics order of the customer; month of that order |
| **unit_cost_syn** | real | simulated | Unit cost = median price × (1 − category margin ± noise) |
| **channel_syn** | text | simulated | VOLTIX Website / Marketplace A / Marketplace B (per order) |
| **discount_rate_syn, discount_syn** | real | simulated | Discount % and amount (R$) off list price |
| **marketing_channel_syn** | text | simulated | Last-touch label (Paid Search, Paid Social, Marketplace Ads, Email & CRM, Affiliates, Organic/Direct) |
| **returned_syn, refund_syn, return_reason_syn** | int/real/text | simulated | Returned unit flag, refunded value, reason (delivered orders only) |

## dim_product / dim_customer
`dim_product(product_id, category, unit_cost_syn, sku_label)`; `dim_customer(customer_unique_id, city, state, region, cohort_month)`.

## marketing_spend_syn (simulated)
`month, channel, spend_syn`: monthly budget ≈ share of that month's net sales per channel × lognormal noise.

## inventory_syn (simulated snapshot at window end)
`product_id, units_sold_total (real), units_sold_90d (real), on_hand_syn, days_since_last_receipt_syn, unit_cost_syn` for the 150 best-selling SKUs.

## v_item_metrics (view; eligible rows only)
Adds `month, gross_sales, discounts, refunds, net_sales, cogs, gross_profit` using the definitions in `METRICS.md`.
