# Metric Definitions (single source: `src/dashboard/js/metrics.js` and view `v_item_metrics`)

**Eligible orders** = status in delivered, shipped, invoiced, processing, approved. Cancelled/unavailable are excluded from all KPIs.
**Revenue excludes freight and taxes** (not in source). Refunds reduce revenue; returned units are assumed restocked (no COGS).

| Metric | Formula |
|---|---|
| Gross Sales | Σ item price |
| Discounts | Σ price × discount_rate (simulated) |
| Returns & Refunds | Σ (price − discount) for returned units (simulated) |
| Net Sales / Net Revenue | Gross − Discounts − Refunds |
| COGS | Σ unit_cost for units **not** returned |
| Gross Profit | Net Sales − COGS |
| Gross Margin % | Gross Profit ÷ Net Sales |
| Orders | COUNT DISTINCT order_id (never counted from item rows → no double counting) |
| AOV | Net Sales ÷ Orders |
| Units | number of eligible order lines |
| Return Rate (units) | Returned units ÷ Units. (A by-orders version is in `sql/product_analysis.sql`) |
| Discount Rate | Discounts ÷ Gross Sales |
| Revenue growth | Net_t ÷ Net_(t−1) − 1 vs the immediately preceding period of equal length |
| Growth decomposition | ΔNet = (Orders₁ − Orders₀) × AOV₀ + Orders₁ × (AOV₁ − AOV₀) |
| New customer | Customer in the period whose first-ever eligible order falls in it |
| Repeat Purchase Rate | Customers in period who had bought before ÷ customers in period |
| Retention Rate | Prev-period customers who bought again in the period ÷ prev-period customers |
| Purchase frequency | Orders ÷ customers in period |
| CLV proxy | Observed gross profit per customer in the period (descriptive; not predictive) |
| ROAS | Attributed revenue ÷ ad spend (revenue-based; **not** ROI) |
| ROI (marketing) | (Gross profit − spend) ÷ spend |
| CAC | Spend ÷ new customers |
| Cost per order | Spend ÷ all orders |
| Days of cover | On-hand ÷ (units sold last 90 d ÷ 90) |
| Inventory turnover (annualised) | (units sold last 90 d × 4) ÷ on-hand |
| Sell-through (90 d) | Sold 90 d ÷ (sold 90 d + on-hand) |

## RFM (as of the period end, full history of the same filters)
Recency days since last order → score 5/4/3/2/1 at ≤60/≤120/≤210/≤330/>330. Frequency orders → 1→1, 2→3, 3→4, 4+→5.
Monetary net R$ → <60→1, <120→2, <200→3, <350→4, else 5. Segments (first match): Champions R≥4&F≥4 · Loyal F≥3&R≥3 ·
At-Risk F≥3&R≤2 or R≤2&M≥4 · New F=1&R=5 · Potential Loyalists F=1&R∈{3,4} · else Hibernating. Thresholds live in `config.RFM`;
the SQL equivalent is in `sql/customer_analysis.sql`.

## Unavailable (never fabricated)
Real revenue targets (the targets shown are derived planning assumptions, see below), conversion rate, impressions/clicks, funnel, campaign-level performance, historical stockouts, inventory aging by batch.

## Planning targets (illustrative; `js/targets.js`, verified by `tests/test_targets.py`)
Baseline = average of the prior 3 complete calendar months under the same filters. Net sales & orders target = baseline × (1 + 3%) per month; AOV target = baseline AOV;
gross margin target = baseline + 0.5 pp; gross profit target = net target × margin target. Partial months pro-rated by days; no targets before Apr 2017.
Achievement = actual ÷ target; status band ±2%. Gap: volume effect = (orders_a − orders_t) × AOV_t; value effect = orders_a × (AOV_a − AOV_t); the two sum to the net-sales gap exactly.
## Analytics
Contribution (pp) = (category net change) ÷ (prior-period total net). Anomaly = |0.6745 × (x − median) ÷ MAD| > 3.5 on full periods only, ≥ 8 periods required.
