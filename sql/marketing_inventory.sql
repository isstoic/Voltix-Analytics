-- Marketing & inventory (BOTH SIMULATED; see docs/LIMITATIONS.md)

-- 1. Monthly spend by channel
SELECT month, channel, ROUND(spend_syn,2) spend FROM marketing_spend_syn ORDER BY month, channel;

-- 2. Attributed revenue, ROAS and CAC by marketing channel (last-touch labels are simulated)
WITH sp AS (SELECT channel, SUM(spend_syn) spend FROM marketing_spend_syn GROUP BY 1),
at AS (SELECT marketing_channel_syn channel, SUM(net_sales) attributed, COUNT(DISTINCT order_id) orders,
              COUNT(DISTINCT CASE WHEN is_first_order=1 THEN customer_unique_id END) new_customers
       FROM v_item_metrics GROUP BY 1)
SELECT sp.channel, ROUND(spend) spend, ROUND(attributed) attributed, ROUND(attributed/spend,2) roas,
       ROUND(spend/new_customers,2) cac, ROUND(spend/orders,2) cost_per_order
FROM sp JOIN at USING (channel) ORDER BY roas DESC;

-- 3. Inventory days of cover and status (snapshot as of window end)
SELECT p.sku_label, i.on_hand_syn, i.units_sold_90d,
       ROUND(CASE WHEN i.units_sold_90d>0 THEN i.on_hand_syn/(i.units_sold_90d/90.0) END) days_of_cover,
       CASE WHEN i.units_sold_90d<=1 OR i.on_hand_syn/(i.units_sold_90d/90.0) > 180 THEN 'Slow-moving / excess'
            WHEN i.on_hand_syn/(i.units_sold_90d/90.0) < 21 THEN 'Stockout risk' ELSE 'Healthy' END status
FROM inventory_syn i JOIN dim_product p USING (product_id) ORDER BY days_of_cover;
