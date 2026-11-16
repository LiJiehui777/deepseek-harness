-- @name: 成品信息
-- @module: finishedProduct
-- @desc: 成品实时库存（warehouse_stock）。国网推送接口：成品信息。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   StockServiceImpl.finishedProduct:1416-1518
--   查询条件与 MES getFinishedProductId 一致（StockMapper.xml:1393-1435）：
--     location_type/material_attribute 相关条件 + customer_name LIKE '%国网%'
--     + qa.apply_type='06finishedproduct' + qr.otc_status=1
--   缆号 ws.cable 是行级唯一键（MES 按缆号推送，且只新增不更新）
--
-- 注意：MES 在此模块**只新增不更新**（:1473 的 if (true)），原因见代码注释：
-- 程析按缆号查询不支持精确匹配，no 传 * 会命中 *-1/*-2 导致更新错行。
-- 报文构造器会把这条缺陷作为告警展示。

SELECT
    ws.id                           AS "id",
    ws.cable                        AS "cable",
    ws.system_no                    AS "systemNo",
    ws.stock_quantity               AS "stockQuantity",
    ws.reserve_quantity             AS "reserveQuantity",
    ws.available_stock_quantity     AS "availableStockQuantity",
    ws.sgcc_sync                    AS "sgccSync",
    ws.send_message                 AS "sendMessage",
    ws.sg_date                      AS "sgDate",
    ws.create_time                  AS "createTime",
    pco.customer_order_no           AS "customerOrderNo",
    pco.otc_line_no                 AS "otcLineNo",
    pco.specification_model         AS "specificationModel",
    pmps.mps_no                     AS "mpsNo",
    bp.specs                        AS "specs",
    bp.part_no                      AS "partNo",
    bp.part_name                    AS "partName"
FROM warehouse_stock ws
         LEFT JOIN basic_part bp ON bp.id = ws.part_id
         LEFT JOIN production_product_output ppo ON ppo.system_no = ws.system_no
         LEFT JOIN production_product_main ppm ON ppm.id = ppo.product_main_id
         LEFT JOIN production_operation_task pot ON pot.id = ppm.operation_task_id
         LEFT JOIN quality_apply_part qap ON qap.system_no = ppo.system_no
         LEFT JOIN quality_result qr ON qr.apply_part_id = qap.id
         LEFT JOIN quality_apply qa ON qa.id = qap.apply_id
         LEFT JOIN production_operation_task_join_segment potjs
                   ON potjs.operation_task_id = pot.id
         LEFT JOIN plan_master_segment pms ON pms.id = potjs.master_segment_id
         LEFT JOIN plan_master_production_schedule pmps ON pmps.id = pms.mps_id
         LEFT JOIN plan_join_model_customer pjmc
                   ON pjmc.model_id = pmps.id
                       AND pjmc.model = 'plan_master_production_schedule'
         LEFT JOIN plan_customer_order pco ON pco.id = pjmc.customer_order_id
WHERE pco.customer_order_no = :key
  AND ws.stock_quantity + ws.available_stock_quantity + ws.reserve_quantity > 0
  AND qa.apply_type = '06finishedproduct'
  AND qr.otc_status = 1
ORDER BY ws.cable, ws.id
