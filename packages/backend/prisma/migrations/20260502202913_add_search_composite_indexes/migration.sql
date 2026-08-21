-- 添加搜索复合索引优化查询性能
-- 根据 docs/search-module-audit.md 第十二节的审计发现添加

-- 1. 为 projectId 相关的搜索查询添加复合索引
-- 用于 searchProjectFiles 和 searchAllProjects 的查询优化
CREATE INDEX IF NOT EXISTS "idx_project_search" ON "file_system_nodes" ("projectId", "deletedAt", "isFolder", "updatedAt");

-- 2. 为 libraryKey 相关的搜索查询添加复合索引
-- 用于 searchLibrary 的查询优化
CREATE INDEX IF NOT EXISTS "idx_library_search" ON "file_system_nodes" ("libraryKey", "deletedAt", "isFolder", "updatedAt");