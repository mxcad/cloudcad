-- 跨项目转移模式（6 域矩阵，仅 PROJECT 根使用）：
--   transferOut*（出向：本项目文件 → 其他项目 / 个人空间 / 公共库）
--   transferIn*（入向：其他项目 / 个人空间 / 公共库 → 本项目）
-- 默认值：出向→个人空间 NONE（防图纸被复制私有化盗走）、出向→公共库 COPY_ONLY（发布=复制，不破坏源项目）、其余 ALL
CREATE TYPE "CrossProjectTransferMode" AS ENUM ('NONE', 'COPY_ONLY', 'MOVE_ONLY', 'ALL');

-- 新权限：谁能修改项目的跨项目转移设置（与 schema.prisma enum ProjectPermission 同步）
ALTER TYPE "ProjectPermission" ADD VALUE 'PROJECT_TRANSFER_MANAGE';

ALTER TABLE "file_system_nodes"
  ADD COLUMN "transferOutToProject" "CrossProjectTransferMode" DEFAULT 'ALL',
  ADD COLUMN "transferOutToPersonalSpace" "CrossProjectTransferMode" DEFAULT 'NONE',
  ADD COLUMN "transferOutToLibrary" "CrossProjectTransferMode" DEFAULT 'COPY_ONLY',
  ADD COLUMN "transferInFromProject" "CrossProjectTransferMode" DEFAULT 'ALL',
  ADD COLUMN "transferInFromPersonalSpace" "CrossProjectTransferMode" DEFAULT 'ALL',
  ADD COLUMN "transferInFromLibrary" "CrossProjectTransferMode" DEFAULT 'ALL';
