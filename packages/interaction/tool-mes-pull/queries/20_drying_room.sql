-- @name: 烘房除气
-- @module: dryingRoom
-- @desc: 烘房出入库记录（production_drying_room_history）。一条数据推两个接口：报工 + 过程检。
-- @key: contract_no
--
-- 表与字段依据 MES 源码：
--   ProductionDryingRoomHistoryServiceImpl.productionDegassing:460-572
--   查询条件与 MES getProductionDegassingId 一致
--   （ProductionDryingRoomHistoryMapper.xml:173-179）
--
-- 关联工单：MES 用 operationTaskMapper.getBypdrId(pdr.id) 反查工单，
-- 该方法在 MES 里**没有判空**，触发 P0-2（单条脏数据中断整批）。
-- 这里用 LEFT JOIN，把"找不到工单"如实暴露成一行缺字段的数据，
-- 由报文构造器的告警提示审核员，而不是让整批拉取失败。
--
-- 设备号：MES 用 workstationMapper.getSgNoByName(pdr.roomName)
-- 即按烘房名去 basic_workstation.sg_no 里找（:465）。

SELECT
    pdr.id                    AS "id",
    pdr.sn_no                 AS "snNo",
    pdr.room_name             AS "roomName",
    pdr.contract_no           AS "contractNo",
    pdr.customer_name         AS "customerName",
    pdr.cable_no              AS "cableNo",
    pdr.warehouse_in          AS "warehouseIn",
    pdr.warehouse_out         AS "warehouseOut",
    pdr.status                AS "status",
    pdr.active                AS "active",
    pdr.sgcc_sync             AS "sgccSync",
    pdr.send_message          AS "sendMessage",
    pdr.sg_date               AS "sgDate",
    pdr.create_time           AS "createTime",
    bw.sg_no                  AS "deviceNo",
    ot.optask_no              AS "optaskNo",
    o.name                    AS "operationName",
    pmps.mps_no               AS "mpsNo",
    pmps.workshop             AS "workshop"
FROM production_drying_room_history pdr
         LEFT JOIN basic_workstation bw ON bw.name = pdr.room_name
         LEFT JOIN production_operation_task ot
                   ON ot.id = (SELECT ppo.operation_task_id
                               FROM production_product_output ppo
                               WHERE ppo.id = pdr.product_output_id)
         LEFT JOIN technology_operation o ON o.id = ot.operation_id
         LEFT JOIN production_operation_task_join_segment potjs
                   ON potjs.operation_task_id = ot.id
         LEFT JOIN plan_master_segment pms ON pms.id = potjs.master_segment_id
         LEFT JOIN plan_master_production_schedule pmps ON pmps.id = pms.mps_id
WHERE pdr.contract_no = :key
  AND pdr.customer_name LIKE '%国网%'
ORDER BY pdr.id
