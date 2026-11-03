-- VOLTIX product analysis (SQLite)

-- 1. Product performance matrix (SKU level)
SELECT p.sku_label, p.category, COUNT(*) units, ROUND(SUM(v.net_sales)) net_sales, ROUND(SUM(v.gross_profit)) gross_profit,
       ROUND(SUM(v.gross_profit)/SUM(v.net_sales),3) gross_margin,
       ROUND(1.0*SUM(v.returned_syn)/COUNT(*),3) return_rate,
       ROUND(SUM(v.discounts)/SUM(v.gross_sales),3) discount_rate
FROM v_item_metrics v JOIN dim_product p USING (product_id)
GROUP BY p.product_id HAVING units >= 5 ORDER BY net_sales DESC LIMIT 100;

-- 2. Pareto: share of gross profit held by the top 20% of SKUs
WITH s AS (SELECT product_id, SUM(gross_profit) gp FROM v_item_metrics GROUP BY product_id),
r AS (SELECT gp, ROW_NUMBER() OVER (ORDER BY gp DESC) rn, COUNT(*) OVER () n FROM s)
SELECT ROUND(SUM(CASE WHEN rn <= 0.2*n THEN gp END) / SUM(gp), 3) AS top20pct_sku_profit_share FROM r;

-- 3. Popular but low-margin SKUs (top-quartile units, margin below blended)
WITH s AS (SELECT product_id, COUNT(*) units, SUM(gross_profit)/SUM(net_sales) gm FROM v_item_metrics GROUP BY product_id),
b AS (SELECT SUM(gross_profit)/SUM(net_sales) blended FROM v_item_metrics)
SELECT p.sku_label, units, ROUND(gm,3) gross_margin, ROUND(b.blended,3) blended
FROM s JOIN dim_product p USING (product_id), b
WHERE units >= 20 AND gm < b.blended - 0.05 ORDER BY units DESC;

-- 4. Return outliers (>= 15 units, return rate >= max(2x blended, 12%))
WITH b AS (SELECT 1.0*SUM(returned_syn)/COUNT(*) rr FROM v_item_metrics)
SELECT p.sku_label, COUNT(*) units, ROUND(1.0*SUM(returned_syn)/COUNT(*),3) return_rate, ROUND(SUM(refunds)) refunded
FROM v_item_metrics v JOIN dim_product p USING (product_id), b
GROUP BY p.product_id, b.rr HAVING units >= 15 AND 1.0*SUM(returned_syn)/COUNT(*) >= MAX(2*b.rr, 0.12) ORDER BY refunded DESC;

-- 5. Return rate: by UNITS vs by ORDERS (different definitions)
SELECT category,
       ROUND(1.0*SUM(returned_syn)/COUNT(*),4) AS return_rate_units,
       ROUND(1.0*COUNT(DISTINCT CASE WHEN returned_syn=1 THEN order_id END)/COUNT(DISTINCT order_id),4) AS return_rate_orders
FROM v_item_metrics GROUP BY category;

-- 6. Return reasons
SELECT return_reason_syn reason, COUNT(*) units, ROUND(SUM(refunds)) refunded FROM v_item_metrics WHERE returned_syn=1 GROUP BY 1 ORDER BY 2 DESC;
