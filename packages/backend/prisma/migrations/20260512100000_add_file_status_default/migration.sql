-- 为 file_system_nodes 表的 fileStatus 列添加默认值 COMPLETED
-- 对应 schema.prisma 中 fileStatus FileStatus? @default(COMPLETED) 的变更
-- 确保新创建的节点自动获得 COMPLETED 状态，消除历史数据中 null 的模糊语义

ALTER TABLE "file_system_nodes" ALTER COLUMN "fileStatus" SET DEFAULT 'COMPLETED'::"FileStatus";
