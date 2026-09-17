-- S5-1：file_system_nodes 加 fileStatus 索引
-- 统一任务列表（UnifiedConversionService.listTasks）+ 卡死 node 对账
-- （ConversionReconciliationService.reconcile）均按 fileStatus IN (非 COMPLETED) 过滤；
-- fileStatus 低基数（多数 COMPLETED），索引让 PG 只扫非 COMPLETED 子集，
-- 避免 node 表大时面板轮询 / 对账全表扫描
CREATE INDEX "file_system_nodes_fileStatus_idx" ON "file_system_nodes"("fileStatus");
