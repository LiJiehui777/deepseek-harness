-- @name: 原材料库存
-- @module: rawMaterialStock
-- @desc: 国网重点原材料（basic_part）。国网推送接口：原材料库存。
-- @key: part_no
--
-- 表与字段依据 MES 源码：
--   StockServiceImpl.rawMaterialStock:1300-1358
--   查询条件与 MES getRawMaterialStockId 一致（StockMapper.xml:1436-1442）：
--     part.active='t' AND part.type IS NOT NULL AND part.material_attribute='1'
--
-- 注意：
--  1. MES 的定时任务 SQL **没有**"未推送"过滤，每次全量捞；
--     本插件按合同号过滤（原材料与订单无直接关联时该值为空），实际使用建议
--     改用 material_attribute 维度单独拉取。
--  2. MES 的 convertCategoryCodeByPartName 入参是 part.voltage 而不是零件名，
--     语义与 PartName2Code 不同，报文构造器会就未命中给出告警。

SELECT
    bp.id                    AS "id",
    bp.part_no               AS "partNo",
    bp.part_name             AS "partName",
    bp.type                  AS "type",
    bp.voltage               AS "voltage",
    bp.unit                  AS "unit",
    bp.stock                 AS "stock",
    bp.specs                 AS "specs",
    bp.receipt_date          AS "receiptDate",
    bp.material_attribute    AS "materialAttribute",
    bp.sgcc_sync             AS "sgccSync",
    bp.send_message          AS "sendMessage",
    bp.sg_date               AS "sgDate",
    bp.create_time           AS "createTime"
FROM basic_part bp
WHERE bp.active = 't'
  AND bp.type IS NOT NULL
  AND bp.material_attribute = '1'
ORDER BY bp.part_no, bp.id
