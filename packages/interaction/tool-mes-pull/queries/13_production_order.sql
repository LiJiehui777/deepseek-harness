-- @name: 生产订单
-- @module: productionOrder
-- @desc: 生产订单（同样来自主生产计划，字段是独立的一组）。国网推送接口：生产订单。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   MasterProductionScheduleServiceImpl.productionOrder:2624-2690
--
-- 与「排产计划」的区别：笔记里写"字段相同"是错的，这是 14 个独立字段
-- （no/materialNo/specificationType/makt/demandQuantity/... ）。
-- MES 用 mps.ssgcc_sync / ssend_message / ssg_date 这一组独立状态字段（第 2 通路）。

SELECT
    pmps.id                        AS "id",
    pmps.mps_no                    AS "mpsNo",
    pmps.part_id                   AS "partId",
    pmps.qty_required              AS "qtyRequired",
    pmps.workshop                  AS "workshop",
    pmps.is_audit                  AS "isAudit",
    pmps.ssgcc_sync                AS "ssgccSync",
    pmps.ssend_message             AS "ssendMessage",
    pmps.ssg_date                  AS "ssgDate",
    pmps.create_time               AS "createTime",
    pco.customer_order_no          AS "customerOrderNo",
    pco.otc_line_no                AS "otcLineNo",
    pco.sales_part_no              AS "salesPartNo",
    pco.sales_part_name            AS "salesPartName",
    pco.otc_unit                   AS "otcUnit",
    pco.unit                       AS "unit",
    pco.specification_model        AS "specificationModel",
    pco.wanted_delivery_date       AS "wantedDeliveryDate",
    pc.contract_no                 AS "contractNo",
    pc.customer_name               AS "customerName",
    pc.factory_place_order_date    AS "factoryPlaceOrderDate",
    bp.specs                       AS "specs",
    bp.part_no                     AS "partNo",
    bp.part_name                   AS "partName"
FROM plan_master_production_schedule pmps
         LEFT JOIN plan_join_model_customer pjmc
                   ON pjmc.model_id = pmps.id
                       AND pjmc.model = 'plan_master_production_schedule'
         LEFT JOIN plan_customer_order pco ON pco.id = pjmc.customer_order_id
         LEFT JOIN plan_customer pc ON pc.id = pco.customer_id
         LEFT JOIN basic_part bp ON bp.id = pmps.part_id
WHERE pc.contract_no = :key
ORDER BY pmps.mps_no, pmps.id
