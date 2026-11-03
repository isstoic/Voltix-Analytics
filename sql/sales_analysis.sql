-- VOLTIX sales analysis (SQLite). Source: v_item_metrics (eligible orders only; net = gross - discount - refund).
-- Columns marked _syn are SIMULATED (see docs/DATA_DICTIONARY.md).

-- 1. Monthly P&L with month-over-month growth
WITH m AS (
  SELECT month,
         COUNT(DISTINCT order_id)      AS orders,
         COUNT(*)                      AS units,
         SUM(gross_sales)              AS gross_sales,
         SUM(discounts)                AS discounts,
         SUM(refunds)                  AS refunds,
         SUM(net_sales)                AS net_sales,
         SUM(gross_profit)             AS gross_profit
  FROM v_item_metrics GROUP BY month)
SELECT month, orders, units, ROUND(gross_sales) gross_sales, ROUND(discounts) discounts, ROUND(refunds) refunds,
       ROUND(net_sales) net_sales, ROUND(gross_profit) gross_profit,
       ROUND(gross_profit / net_sales, 3)                         AS gross_margin,
       ROUND(net_sales / orders, 2)                               AS aov,
       ROUND(net_sales / LAG(net_sales) OVER (ORDER BY month) - 1, 3) AS net_sales_mom
FROM m ORDER BY month;

-- 2. Growth decomposition (orders vs AOV), month over month
WITH m AS (
  SELECT month, COUNT(DISTINCT order_id) AS orders, SUM(net_sales) AS net FROM v_item_metrics GROUP BY month),
d AS (
  SELECT month, orders, net, net/orders AS aov,
         LAG(orders) OVER (ORDER BY month) AS p_orders, LAG(net/orders) OVER (ORDER BY month) AS p_aov,
         LAG(net) OVER (ORDER BY month) AS p_net FROM m)
SELECT month, ROUND(net - p_net) AS delta_net,
       ROUND((orders - p_orders) * p_aov) AS from_order_volume,
       ROUND(orders * (aov - p_aov))      AS from_order_value
FROM d WHERE p_net IS NOT NULL;

-- 3. Category and channel profitability (simulated cost/discount/channel)
SELECT category, channel_syn AS channel, COUNT(DISTINCT order_id) orders, ROUND(SUM(net_sales)) net_sales,
       ROUND(SUM(gross_profit)) gross_profit, ROUND(SUM(gross_profit)/SUM(net_sales),3) gross_margin,
       ROUND(SUM(discounts)/SUM(gross_sales),3) discount_rate
FROM v_item_metrics GROUP BY category, channel_syn ORDER BY net_sales DESC;

-- 4. Profit before vs after discounts
SELECT category,
       ROUND(SUM(gross_sales - unit_cost_syn * (1 - returned_syn)))                     AS profit_before_discount,
       ROUND(SUM(gross_sales - discounts - unit_cost_syn * (1 - returned_syn)))         AS profit_after_discount,
       ROUND(SUM(gross_profit))                                                         AS profit_after_discount_and_refunds
FROM v_item_metrics GROUP BY category;

-- 5. Revenue by customer region (real) with growth vs prior 6 months
SELECT region,
       ROUND(SUM(CASE WHEN purchase_date >= '2018-02-19' THEN net_sales END)) AS last_6m,
       ROUND(SUM(CASE WHEN purchase_date <  '2018-02-19' AND purchase_date >= '2017-08-20' THEN net_sales END)) AS prior_6m,
       ROUND(1.0*SUM(CASE WHEN purchase_date >= '2018-02-19' THEN net_sales END) /
             SUM(CASE WHEN purchase_date <  '2018-02-19' AND purchase_date >= '2017-08-20' THEN net_sales END) - 1, 3) AS growth
FROM v_item_metrics GROUP BY region ORDER BY last_6m DESC;

-- 6. Discount depth vs margin (discount bands)
SELECT CASE WHEN discount_rate_syn = 0 THEN '0%' WHEN discount_rate_syn <= .10 THEN '5-10%'
            WHEN discount_rate_syn <= .20 THEN '15-20%' ELSE '25%+' END AS discount_band,
       COUNT(*) units, ROUND(SUM(gross_profit)/SUM(net_sales),3) gross_margin, ROUND(SUM(net_sales)) net_sales
FROM v_item_metrics GROUP BY 1 ORDER BY MIN(discount_rate_syn);
