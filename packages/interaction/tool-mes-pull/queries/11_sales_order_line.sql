-- @name: 销售订单明细
-- @module: salesOrderLine
-- @desc: 客户订单行（plan_customer_order）。国网推送接口：订单明细。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   CustomerOrderServiceImpl.pushOrUpdateSgOrderLine:2804-2840
--   明细表 plan_customer_order 通过 customer_order_no 关联主单 contract_no
--   （见 CustomerOrderServiceImpl:2653 的 selectOne 条件）
--
-- 注意：MES 推送前会校验主单已推送（:2654 getSendSg），这里把 send_sg 一并取出，
-- 让审核环节能看到"主单未推则明细不能推"这一前置条件。

SELECT
    co.id                    AS "id",
    co.customer_order_no     AS "customerOrderNo",
    co.otc_line_no           AS "otcLineNo",
    co.sales_part_no         AS "salesPartNo",
    co.sales_part_name       AS "salesPartName",
    co.otc_quantity          AS "otcQuantity",
    co.otc_unit              AS "otcUnit",
    co.customer_po_line_no   AS "customerPoLineNo",
    co.specification_model   AS "specificationModel",
    co.product_type          AS "productType",
    co.customer_name         AS "customerName",
    co.project_name          AS "projectName",
    co.wanted_delivery_date  AS "wantedDeliveryDate",
    co.planned_delivery_date AS "plannedDeliveryDate",
    co.co_state              AS "coState",
    co.send_sg               AS "sendSg",
    co.sg_id                 AS "sgId",
    co.sg_message            AS "sgMessage",
    co.sg_date               AS "sgDate",
    co.create_time           AS "createTime",
    c.send_sg                AS "headerSendSg"
FROM plan_customer_order co
         LEFT JOIN plan_customer c ON c.contract_no = co.customer_order_no
WHERE co.customer_order_no = :key
ORDER BY co.otc_line_no, co.id
