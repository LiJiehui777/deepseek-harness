-- @name: 排产计划
-- @module: productionPlan
-- @desc: 主生产计划（plan_master_production_schedule）。国网推送接口：排产计划。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   MasterProductionScheduleServiceImpl.productionPlan:2560-2621
--   计划 ↔ 客户订单 ↔ 主订单 的关联：
--     plan_join_model_customer(model='plan_master_production_schedule')
--   与 MES 定时任务 SQL 完全一致的关联方式（MasterProductionScheduleMapper.xml:388-399）
--
-- 注意：MES 在 wantedDeliveryDate 为空时**阻断推送**（:2564-2569），
-- 这里照实取出，由报文构造器给出告警。

SELECT
    pmps.id                        AS "id",
    pmps.mps_no                    AS "mpsNo",
    pmps.qty_required              AS "qtyRequired",
    pmps.required_date             AS "requiredDate",
    pmps.promised_delivery_date    AS "promisedDeliveryDate",
    pmps.workshop                  AS "workshop",
    pmps.is_audit                  AS "isAudit",
    pmps.allocate_state            AS "allocateState",
    pmps.sgcc_sync                 AS "sgccSync",
    pmps.send_message              AS "sendMessage",
    pmps.sg_date                   AS "sgDate",
    pmps.create_time               AS "createTime",
    pco.customer_order_no          AS "customerOrderNo",
    pco.otc_line_no                AS "otcLineNo",
    pco.sales_part_no              AS "salesPartNo",
    pco.sales_part_name            AS "salesPartName",
    pco.wanted_delivery_date       AS "wantedDeliveryDate",
    pco.specification_model        AS "specificationModel",
    pc.factory_place_order_date    AS "factoryPlaceOrderDate",
    pc.contract_no                 AS "contractNo",
    pc.customer_name               AS "customerName"
FROM plan_master_production_schedule pmps
         LEFT JOIN plan_join_model_customer pjmc
                   ON pjmc.model_id = pmps.id
                       AND pjmc.model = 'plan_master_production_schedule'
         LEFT JOIN plan_customer_order pco ON pco.id = pjmc.customer_order_id
         LEFT JOIN plan_customer pc ON pc.id = pco.customer_id
WHERE pc.contract_no = :key
ORDER BY pmps.mps_no, pmps.id
