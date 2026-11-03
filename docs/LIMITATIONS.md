# Limitations & Assumptions
1. **Olist is a Brazilian multi-category marketplace**, not an electronics brand. We keep 8 electronics-like categories (see `config.py`); revenue is in BRL. VOLTIX is a fictional framing.
2. **Simulated layer.** Unit cost, discounts, channel, returns, marketing spend/attribution and inventory are generated. They reproduce plausible patterns (category margins, marketplace discounting, Nov promotions, problem SKUs) because the parameters say so. Findings that rest on them are method demonstrations.
3. **Channel and returns relationships to real fields:** simulated return probability is raised for low review scores, which makes returns correlate with real satisfaction by construction.
4. **Marketing:** spend is budgeted from sales and attribution is random last-touch, so ROAS/CAC reflect the simulation rules. Attributed ≠ incremental. No impressions, clicks or conversions exist; none are invented.
5. **Inventory** is a single simulated snapshot (150 SKUs). Stockout history and batch aging cannot be derived from sales and are marked unavailable.
6. **Customers:** most buy once (≈1.5% repeat), so cohort retention and RFM Champions/Loyal are small; no customer is called "churned".
7. **Window:** 2017-01-01 → 2018-08-20. Earlier months have only a few orders; the export thins after ~21 Aug 2018. The first months (Jan-Feb 2017) are low-volume and noisy.
8. **Products** have anonymised ids (no names/brands/launch dates); labels are `Category · ID`.
9. **Geography:** the large geolocation files were not needed (customer state/city are in the customers table), so they are not used.
10. **Eligibility:** orders in `shipped/invoiced/processing/approved` count as demand even though some may later cancel.
11. **Targets are illustrative.** Derived from trailing actuals with a fixed 3% monthly growth assumption; no seasonality, no real plan. Treat achievement % as a method demo.
12. **Date presets** use the latest data date as "today"; the source has no live feed.
13. **Testing scope:** automated checks run in headless Chromium and Node; no cross-browser, screen-reader or load testing.
