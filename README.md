# VOLTIX: Consumer Electronics & D2C Analytics Platform

An internal-BI-style analytics platform for **VOLTIX**, a **fictional** direct-to-consumer electronics brand.
It is built on **real Olist (Brazilian e-commerce) orders**, restricted to electronics-type categories, plus a
**clearly labelled synthetic layer** for the things Olist does not contain (unit cost, discounts, sales channel,
returns, marketing spend, inventory).

> **Read this first: what is real and what is simulated**
>
> | Real (Olist source) | Simulated (seeded, columns suffixed `_syn`) |
> |---|---|
> | order ids, purchase dates, order status | unit cost → gross profit & margin |
> | item prices, freight | discounts |
> | customers (`customer_unique_id`), city/state | sales channel (website / marketplace A / B) |
> | delivery dates, estimated delivery, review scores | returns, refunds, return reasons |
> | product ids & categories (translated) | marketing spend, attribution, inventory snapshot |
>
> VOLTIX is not a real company and these are **not** boAt/Noise/Samsung numbers. Any margin, discount, return, channel,
> marketing or inventory number shows the *method*, not a discovery about a real business. The dashboard no longer repeats a
> banner on every page; provenance is stated once in the **Data & methodology** panel (header button) and in the footer line, and here.

## Quick start

```bash
pip install -r requirements.txt          # pandas, numpy, openpyxl, pytest
python src/data_processing/build.py       # clean -> simulate -> SQLite -> dashboard data bundle
python tests/test_metrics.py              # 8 reconciliation tests (needs Node.js for the JS check)
python tests/test_targets.py              # planning targets vs independent pandas recomputation + exact gap decomposition
# open the dashboard, no server needed:
open src/dashboard/index.html             # (macOS)  or double-click the file / xdg-open on Linux
# optional local server:
python -m http.server 8000 --directory src/dashboard   # then visit http://localhost:8000
```
The original Olist CSV files are not included in this repository.
To rebuild the project from scratch, download the dataset from Kaggle
and place the required CSV files inside data/raw/.

The processed datasets and dashboard data bundle are included. Plotly is vendored in `src/dashboard/vendor/`, so it works fully offline.
To use a different dataset, replace the CSVs in `data/raw/` (same schema) and re-run the build.

## Design system
Mocha Brown `#6F4E37` (sidebar, headings, primary actions) · Platinum Silver `#E5E4E2` (borders, neutral surfaces) · Pale Lavender `#E6E0F0`
(selected states, hero KPIs). Flat, no gradients. Tokens live at the top of `css/style.css` and in `js/theme.js` (Plotly). Visible focus rings,
reduced-motion support, responsive grid (checked at 390, 768, 1024, 1280 and 1920 px: no horizontal scroll).

## What's in the dashboard (7 pages, all driven by one global filter state)

**Date range picker** with presets: Today, Last 7 Days, Last 30 Days, This Month, Last Month, Year to Date, Custom Range (typed or calendar, validated,
Apply / Cancel / Reset). Because the data ends on **2018-08-20**, "today" means the latest data date so every preset returns data. Default = Year to Date.
Every KPI, chart and table recomputes from the selected range and compares against the immediately preceding period of equal length.

| Page | Purpose |
|---|---|
| Executive Overview | 8 KPIs vs prior period, trend with prior-period overlay and anomaly markers, **Target vs Actual**, category contribution table (click = cross-filter), channel/region view, decision insights |
| Sales Intelligence | gross→net bridge, orders-vs-AOV decomposition of growth, discount vs margin, channel economics, region growth |
| Product Analytics | sortable/searchable SKU table (row click opens an order-line drill-down), revenue-vs-margin scatter, weak-margin and high-return lists, return reasons |
| Customer Intelligence | new vs returning, repeat rate, retention, RFM (row click lists customers), cohort heatmap, value distribution |
| Marketing Performance | spend vs attributed revenue, ROAS, ROI, CAC, channel mix; funnel/conversion data is not in the dataset so it is not shown |
| Inventory & Operations | days of cover, velocity vs stock, slow-moving and stock-out risk (snapshot as of the latest data date), delivery performance |
| Business Insights | rule-based findings, target summary table, unusual-period table |

Tables: sort, search, pagination, row highlight, CSV export, empty states. Charts: tooltips, legend toggles, click-to-cross-filter, drill-down modals.

### Target vs Actual (illustrative planning targets)
There is no real target data. Targets are **derived, illustrative planning assumptions**, shown separately from actuals (`js/targets.js`, constants in `PLAN`):
baseline = average of the prior 3 complete months (same filters); net sales and orders target = baseline × 1.03 per month; AOV target = baseline AOV;
gross margin target = baseline + 0.5 pp; gross profit = net target × margin target. Partial months are pro-rated by days; targets start Apr 2017;
status band ±2% (On track / Behind / Ahead). The gap is split exactly into a volume effect `(orders_a − orders_t) × AOV_t` and a value effect `orders_a × (AOV_a − AOV_t)`.
Seasonality is not modelled, so Nov peaks will read as "ahead" and quiet months as "behind".

### Analytics methods
Period comparison; category contribution to net-sales change (pp); modified z-score anomaly flags (median/MAD > 3.5, needs ≥ 8 full periods);
OLS line for discount vs margin; RFM; cohort retention. Rules for the insight list are in `js/insights.js`; each insight shows the numbers behind it.

## Findings from the real data (Olist electronics scope, 2017-01 → 2018-08-20)

These come from real order data only (no simulated columns):

* **Scale:** 14,114 eligible orders, 13,896 customers, R$1.72M gross item sales. Gross value per order ≈ R$122.
* **Mix is concentrated:** Computer Accessories = 52% of gross sales; Mobile Accessories 19%; Computers & Laptops only 203 units but 13% of sales (avg price R$1,103).
* **Geography:** the Southeast holds 62% of sales; North only 3%.
* **Customers almost never come back:** only **1.5%** of customers placed more than one electronics order. Revenue is
  essentially first-purchase revenue; retention is the largest untapped lever (and "churn" cannot be meaningfully defined).
* **Delivery drives satisfaction:** 8.5% of delivered orders arrive after the estimated date; those orders average **2.61★ vs 4.21★** on time.
  Average delivery time is 13.1 days.
* **Growth:** Jan–Aug 2018 gross sales were R$905K vs R$373K for Jan–Aug 2017 (Olist volume was still ramping up in 2017), but monthly gross sales
  peaked at ~R$137K in Feb–Mar 2018 and ran R$92–101K in Jun–Jul 2018. Aug 2018 is a partial month (to the 20th).

Findings that depend on simulated cost/discount/returns/channels (for example "marketplace B has the lowest margin")
are produced by the dashboard's rule engine **but only demonstrate the method**; they follow from the simulation parameters in `src/config.py`. The in-app Data & methodology panel states which fields are modelled.

## Project structure

```
voltix-analytics/
├── data/raw/                 real Olist CSVs (inputs)
├── data/processed/           fact_order_item.csv, marketing_spend_syn.csv, inventory_syn.csv, voltix.db (SQLite)
├── sql/                      sales_analysis.sql, product_analysis.sql, customer_analysis.sql, marketing_inventory.sql
├── src/config.py             scope, window, simulation parameters, RFM thresholds (all assumptions in one place)
├── src/data_processing/      clean.py (real data) · synthetic.py (simulated layer) · build.py (orchestrator)
├── src/dashboard/            index.html · css/style.css · data/data.js
│   └── js/                   format.js · theme.js · metrics.js (KPI layer) · targets.js · analytics.js · insights.js ·
│                             components.js (cards, KPI, table, date picker, modal) · charts.js · app.js (state/router) · pages/*.js
├── tests/test_metrics.py     reconciliation: raw pandas ↔ SQL ↔ dashboard JS
├── tests/test_targets.py     targets recomputed independently in pandas; gap decomposition exactness
└── docs/                     DATA_DICTIONARY, METRICS, ARCHITECTURE, LIMITATIONS, QUESTIONS, DATA_QUALITY_REPORT
```
See `docs/ARCHITECTURE.md` for the data flow and design decisions.

## Validation performed

* Gross sales, order count and unit count reconcile between **raw CSVs (independent pandas)**, **SQL view**, and the **dashboard's JS metric layer**.
* `Net = Gross − Discounts − Refunds` identity; no double counting when joining orders to items; no cancelled orders in metrics; referential integrity; date range; one first-order per customer; simulation is reproducible from the seed.
* Dashboard filter results (category × channel × region, and a single month) were checked against SQL in a headless browser and matched exactly.
* Headless-Chromium (Playwright) QA: all 7 presets checked against SQL, custom/invalid ranges, filters, table sort/search/pagination/CSV/row-click, targets, empty states, no console errors, no horizontal scroll at 390–1920 px. Not tested: other browsers or assistive technology.

## Limitations (summary; full list in `docs/LIMITATIONS.md`)
Synthetic cost/discount/returns/channel/marketing/inventory; Olist is a Brazilian marketplace (BRL, not electronics-only) and SKU names are anonymised;
targets are illustrative and non-seasonal (no real plan data); no impressions, clicks or stock history; attribution is descriptive not causal; the source export thins out after ~21 Aug 2018 so the window ends 2018-08-20.

## Suggested next steps
Replace the simulated layer with real cost, ad-platform and inventory feeds; load real targets; build a Python notebook walkthrough and a Power BI/Excel reconciliation pack;
add repeat-purchase propensity modelling; run a holdout test before using any ROAS number.

## Running Tests

VOLTIX includes automated tests for validating CSV formatting behaviour in the dashboard.

### Prerequisites
- Node.js installed on your system.

### Run the tests

From the project root, open a terminal and execute:

```bash
node tests/test_format.js
```

The test suite checks:
- Normal text formatting.
- CSV formula injection prevention.
- Negative numeric values.
- Null and undefined values.
- Quotation mark escaping.
- Newline handling.

A successful run displays:

```text
All 12 VOLTIX CSV tests passed!
```