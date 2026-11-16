-- @name: 工单
-- @module: workOrder
-- @desc: 工序任务（production_operation_task）。国网推送接口：工单。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   OperationTaskServiceImpl.workOrder:4511-4595
--   关联链与 MES 定时任务 SQL 一致（OperationTaskMapper.xml:2235-2252）：
--     production_operation_task → production_operation_task_join_segment
--       → plan_master_segment → plan_master_production_schedule
--       → plan_join_model_customer → plan_customer_order
--   工序名与国网工序号来自 technology_operation（o.getName / o.getSgNo）
--
-- 注意：MES 在 state='05canceled' 时跳过推送（:4514），并把工单状态经
-- convertStatus 转成 1/3/5；这里取出原始 state 由报文构造器转换。

SELECT
    pot.id                          AS "id",
    pot.optask_no                   AS "optaskNo",
    pot.state                       AS "state",
    pot.planned_quantity            AS "plannedQuantity",
    pot.completed_quantity          AS "completedQuantity",
    pot.planned_start_date          AS "plannedStartDate",
    pot.planned_finish_date         AS "plannedFinishDate",
    pot.actual_start_date           AS "actualStartDate",
    pot.actual_finish_date          AS "actualFinishDate",
    pot.sgcc_sync                   AS "sgccSync",
    pot.send_message                AS "sendMessage",
    pot.sg_date                     AS "sgDate",
    pot.create_time                 AS "createTime",
    o.name                          AS "operationName",
    o.sg_no                         AS "sgNo",
    pmps.mps_no                     AS "mpsNo",
    pmps.workshop                   AS "workshop",
    pco.customer_order_no           AS "customerOrderNo",
    pco.sales_part_no               AS "salesPartNo",
    pco.sales_part_name             AS "salesPartName"
FROM production_operation_task pot
         LEFT JOIN technology_operation o ON o.id = pot.operation_id
         LEFT JOIN (
    SELECT DISTINCT pot2.id,
                    potjs.master_segment_id AS segment_id
    FROM production_operation_task pot2
             LEFT JOIN production_operation_task_join_segment potjs
                       ON potjs.operation_task_id = pot2.id
) seg ON seg.id = pot.id
         LEFT JOIN plan_master_segment pms ON pms.id = seg.segment_id
         LEFT JOIN plan_master_production_schedule pmps ON pmps.id = pms.mps_id
         LEFT JOIN plan_join_model_customer pjmc
                   ON pjmc.model_id = pmps.id
                       AND pjmc.model = 'plan_master_production_schedule'
         LEFT JOIN plan_customer_order pco ON pco.id = pjmc.customer_order_id
WHERE pco.customer_order_no = :key
ORDER BY pot.optask_no, pot.id
