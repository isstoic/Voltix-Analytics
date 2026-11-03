-- VOLTIX customer analysis (SQLite). customer_unique_id identifies a person (customer_id changes per order in Olist).

-- 1. New vs returning customers per month (first-ever eligible electronics order)
SELECT month, COUNT(DISTINCT CASE WHEN is_first_order=1 THEN customer_unique_id END) new_customers,
              COUNT(DISTINCT CASE WHEN is_first_order=0 THEN customer_unique_id END) returning_customers
FROM v_item_metrics GROUP BY month ORDER BY month;

-- 2. Repeat purchase rate, frequency, revenue per customer
WITH c AS (SELECT customer_unique_id, COUNT(DISTINCT order_id) orders, SUM(net_sales) net FROM v_item_metrics GROUP BY 1)
SELECT COUNT(*) customers, ROUND(1.0*SUM(orders>1)/COUNT(*),4) repeat_purchase_rate,
       ROUND(1.0*SUM(orders)/COUNT(*),3) purchase_frequency, ROUND(SUM(net)/COUNT(*),2) avg_revenue_per_customer FROM c;

-- 3. RFM scoring (as of 2018-08-20). Thresholds identical to src/config.py
WITH base AS (
  SELECT customer_unique_id,
         CAST(julianday('2018-08-20') - julianday(MAX(purchase_date)) AS INT) recency,
         COUNT(DISTINCT order_id) freq, SUM(net_sales) monetary
  FROM v_item_metrics GROUP BY 1),
sc AS (
  SELECT *, CASE WHEN recency<=60 THEN 5 WHEN recency<=120 THEN 4 WHEN recency<=210 THEN 3 WHEN recency<=330 THEN 2 ELSE 1 END r,
            CASE WHEN freq>=4 THEN 5 WHEN freq=3 THEN 4 WHEN freq=2 THEN 3 ELSE 1 END f,
            CASE WHEN monetary<60 THEN 1 WHEN monetary<120 THEN 2 WHEN monetary<200 THEN 3 WHEN monetary<350 THEN 4 ELSE 5 END m FROM base),
seg AS (
  SELECT *, CASE WHEN r>=4 AND f>=4 THEN 'Champions' WHEN f>=3 AND r>=3 THEN 'Loyal Customers'
                 WHEN f>=3 AND r<=2 THEN 'At-Risk Customers' WHEN f=1 AND r=5 THEN 'New Customers'
                 WHEN f=1 AND r IN (3,4) THEN 'Potential Loyalists' WHEN r<=2 AND m>=4 THEN 'At-Risk Customers'
                 ELSE 'Hibernating Customers' END segment FROM sc)
SELECT segment, COUNT(*) customers, ROUND(SUM(monetary)) revenue, ROUND(AVG(recency)) avg_recency_days FROM seg GROUP BY 1 ORDER BY revenue DESC;

-- 4. Cohort retention (months since first purchase)
WITH o AS (SELECT DISTINCT customer_unique_id cu, cohort_month, substr(purchase_date,1,7) mo FROM v_item_metrics),
x AS (SELECT cohort_month,
             (CAST(substr(mo,1,4) AS INT)-CAST(substr(cohort_month,1,4) AS INT))*12 + CAST(substr(mo,6,2) AS INT)-CAST(substr(cohort_month,6,2) AS INT) AS m, cu FROM o)
SELECT cohort_month, m, COUNT(DISTINCT cu) active_customers FROM x WHERE m BETWEEN 0 AND 6 GROUP BY 1,2 ORDER BY 1,2;

-- 5. Customer value concentration: share of net sales from the top decile
WITH c AS (SELECT customer_unique_id, SUM(net_sales) net FROM v_item_metrics GROUP BY 1),
r AS (SELECT net, ROW_NUMBER() OVER (ORDER BY net DESC) rn, COUNT(*) OVER () n FROM c)
SELECT ROUND(SUM(CASE WHEN rn <= 0.1*n THEN net END)/SUM(net),3) top_decile_share FROM r;

-- 6. Delivery vs satisfaction (REAL data): one row per order
WITH o AS (SELECT order_id, MAX(late) late, MAX(review_score) score FROM v_item_metrics WHERE delivery_days IS NOT NULL GROUP BY 1)
SELECT late, COUNT(*) orders, ROUND(AVG(score),2) avg_review FROM o WHERE late IS NOT NULL GROUP BY late;
