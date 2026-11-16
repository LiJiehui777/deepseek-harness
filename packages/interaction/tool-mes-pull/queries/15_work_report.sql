-- @name: 报工信息
-- @module: workReport
-- @desc: 报工主表（production_product_main）。国网推送接口：报工信息。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   ProductMainServiceImpl 约 4496-4554 行（productionTimeScheduled 推送）
--   查询条件与 MES 的 getProductMainByStateGrid 一致：state='02submitted'、
--   customerName LIKE '%国网%'（ProductMainMapper.xml:362-397）
--   deviceNo 来自 basic_workstation.sg_no；工序号来自 technology_operation.sg_no
--
-- 注意：MES 在 ot.getActualFinishDate() 为空时跳过推送（判断见推送方法前半段），
-- 这里照实取出，由报文构造器告警。

SELECT
    pm.id                    AS "id",
    pm.product_no            AS "productNo",
    pm.state                 AS "state",
    pm.sgcc_sync             AS "sgccSync",
    pm.send_message          AS "sendMessage",
    pm.sg_date               AS "sgDate",
    pm.create_time           AS "createTime",
    ot.optask_no             AS "optaskNo",
    ot.actual_start_date     AS "actualStartDate",
    ot.actual_finish_date    AS "actualFinishDate",
    o.name                   AS "operationName",
    o.sg_no                  AS "sgNo",
    bw.sg_no                 AS "deviceNo",
    bw.name                  AS "workstationName",
    pmps.mps_no              AS "mpsNo",
    pmps.workshop            AS "workshop",
    pco.customer_order_no    AS "customerOrderNo",
    pco.sales_part_no        AS "salesPartNo"
FROM production_product_main pm
         LEFT JOIN production_operation_task ot ON ot.id = pm.operation_task_id
         LEFT JOIN technology_operation o ON o.id = ot.operation_id
         LEFT JOIN basic_workstation bw ON bw.id = pm.workstation_id
         LEFT JOIN production_operation_task_join_segment potjs
                   ON potjs.operation_task_id = ot.id
         LEFT JOIN plan_master_segment pms ON pms.id = potjs.master_segment_id
         LEFT JOIN plan_master_production_schedule pmps ON pmps.id = pms.mps_id
         LEFT JOIN plan_join_model_customer pjmc
                   ON pjmc.model_id = pmps.id
                       AND pjmc.model = 'plan_master_production_schedule'
         LEFT JOIN plan_customer_order pco ON pco.id = pjmc.customer_order_id
WHERE pco.customer_order_no = :key
  AND pm.state = '02submitted'
ORDER BY pm.product_no, pm.id
