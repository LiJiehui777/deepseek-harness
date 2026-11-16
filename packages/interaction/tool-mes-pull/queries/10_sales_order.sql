-- @name: 销售订单
-- @module: salesOrder
-- @desc: 主销售订单（plan_customer）。国网推送接口：订单主体。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：mes-plan/.../service/impl/CustomerOrderServiceImpl.java
--   推送实现 pushOrUpdateSgOrderBody:2738-2794
--   查询条件 customerName LIKE '%国网%'（与 MES 定时任务一致）
--
-- 可用占位符: :key / :contractNo（等价，都替换成触发的合同号）

SELECT
    c.id                     AS "id",
    c.contract_no            AS "contractNo",
    c.customer_contract_no   AS "customerContractNo",
    c.customer_name          AS "customerName",
    c.entity_name            AS "entityName",
    c.province               AS "province",
    c.place_order_date       AS "placeOrderDate",
    c.customer_no            AS "customerNo",
    c.sales_man              AS "salesMan",
    c.sales_department       AS "salesDepartment",
    c.bid_batch              AS "bidBatch",
    c.bid_number             AS "bidNumber",
    c.send_sg                AS "sendSg",
    c.sg_id                  AS "sgId",
    c.sg_message             AS "sgMessage",
    c.sg_date                AS "sgDate",
    c.create_time            AS "createTime"
FROM plan_customer c
WHERE c.contract_no = :key
ORDER BY c.id
