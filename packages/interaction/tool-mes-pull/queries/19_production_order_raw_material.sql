-- @name: 生产订单选用原材料
-- @module: productionOrderRawMaterial
-- @desc: 生产订单实际投入的原材料（production_product_input）。国网推送接口：选用原材料。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   ProductMainServiceImpl.productionOrderRawMaterial:4839-4928
--   查询条件与 MES getProductionOrderRawMaterialId 一致（ProductInputMapper.xml:141-160）：
--     bp.material_attribute='1' AND ppi.sgcc_sync=0
--     AND (bp.type IS NOT NULL OR bp.voltage IS NOT NULL)
--
-- 注意：RawMaterialNo 用 "_" 连接 part_no 与 part_batch_no（:4885）。
-- 旧的已停用实现（OperationTaskServiceImpl:4814）用的是 "type-voltage-中国-specs"，
-- 规则完全不同，不要混用。

SELECT
    ppi.id                   AS "id",
    ppi.part_batch_no        AS "partBatchNo",
    ppi.sgcc_sync            AS "sgccSync",
    ppi.send_message         AS "sendMessage",
    ppi.sg_date              AS "sgDate",
    ppi.create_time          AS "createTime",
    bp.part_no               AS "partNo",
    bp.part_name             AS "partName",
    bp.type                  AS "type",
    bp.voltage               AS "voltage",
    pmps.mps_no              AS "mpsNo",
    pco.customer_order_no    AS "customerOrderNo"
FROM production_product_input ppi
         LEFT JOIN basic_part bp ON bp.id = ppi.part_id
         LEFT JOIN production_product_main ppm ON ppm.id = ppi.product_main_id
         LEFT JOIN production_operation_task pot ON pot.id = ppm.operation_task_id
         LEFT JOIN production_operation_task_join_segment potjs
                   ON potjs.operation_task_id = pot.id
         LEFT JOIN plan_master_segment pms ON pms.id = potjs.master_segment_id
         LEFT JOIN plan_master_production_schedule pmps ON pmps.id = pms.mps_id
         LEFT JOIN plan_join_model_customer pjmc
                   ON pjmc.model_id = pmps.id
                       AND pjmc.model = 'plan_master_production_schedule'
         LEFT JOIN plan_customer_order pco ON pco.id = pjmc.customer_order_id
WHERE pco.customer_order_no = :key
  AND bp.material_attribute = '1'
  AND (bp.type IS NOT NULL OR bp.voltage IS NOT NULL)
ORDER BY ppi.id
