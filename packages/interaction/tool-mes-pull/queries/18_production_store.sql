-- @name: 产成品库存
-- @module: productionStore
-- @desc: 客户订单维度的产成品库存（plan_customer_order）。国网推送接口：产成品库存。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   CustomerOrderServiceImpl.productionStore:2922-2987
--   查询条件与 MES getProductionStoreId 一致（CustomerOrderMapper.xml:782-794）
--
-- 关键字段说明：
--   sgc_sg_id 在这里是**订单行在程析的主键**（co.sg_id），被 MES 当作 PoItemId 用。
--   这是"跨实体外键当幂等键"的设计缺陷：订单行未推送时该值为空，
--   更新分支会拼出 PoItemId=null。报文构造器会就此告警。

SELECT
    co.id                       AS "id",
    co.customer_order_no        AS "customerOrderNo",
    co.sales_part_no            AS "salesPartNo",
    co.part_no                  AS "partNo",
    co.sales_part_name          AS "salesPartName",
    co.unship_qty               AS "unshipQty",
    co.storage_time             AS "storageTime",
    co.sg_id                    AS "sgId",
    co.sgcc_sync                AS "sgccSync",
    co.send_message             AS "sendMessage",
    co.ssg_date                 AS "ssgDate",
    co.create_time              AS "createTime",
    c.customer_contract_no      AS "customerContractNo",
    c.customer_name             AS "customerName"
FROM plan_customer_order co
         LEFT JOIN plan_customer c ON c.id = co.customer_id
WHERE co.customer_order_no = :key
ORDER BY co.otc_line_no, co.id
