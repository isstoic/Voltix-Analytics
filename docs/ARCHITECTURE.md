# Architecture

```
data/raw (Olist CSVs)
   │  clean.py      dedupe, validate dates & keys, scope to electronics, flag eligibility, derive first-order/cohort   [REAL ONLY]
   ▼
fact (real columns)
   │  synthetic.py  seeded simulation of cost, discount, channel, returns, marketing, inventory                         [_syn columns]
   ▼
build.py ──► data/processed/*.csv + voltix.db (fact_order_item, dim_*, *_syn tables, v_item_metrics view)
         ├─► sql/*.sql          analytical queries over the DB
         ├─► src/dashboard/data/data.js   compact columnar bundle (no server needed)
         └─► docs/DATA_QUALITY_REPORT.md
dashboard:  data.js → metrics.js (ONE metric layer) → targets.js / analytics.js / insights.js → app.js (filter state, lazy render context, router) → pages/*.js
            shared UI: format.js, theme.js, components.js (KPI, table, date picker, modal), charts.js
(There is no Python analytics module: analysis runs in the JS layer and is reconciled to SQL/pandas by tests.)
```
**Design decisions**
* *Separation of concerns:* processing (Python), business logic (`metrics.js`, SQL view), presentation (`pages/*.js`, `components.js`). Pages never compute KPIs themselves; each render builds one memoised context shared by all components.
* *Same definitions twice, checked:* the SQL view and the JS layer implement identical formulas and are reconciled by tests.
* *Static, offline front end:* data is shipped as a JS bundle so `index.html` opens with a double-click (no CORS/server). A `python -m http.server` also works.
* *Honesty by construction:* modelled columns carry a `_syn` suffix in the data; the UI states provenance once (Data & methodology panel + footer) instead of per widget; unavailable metrics render an explicit state.
* *Reproducibility:* fixed seed (`config.SEED`); all assumptions live in `src/config.py`.
* *Dates:* presets are relative to the latest data date (2018-08-20), not the wall clock, so they always show data.
