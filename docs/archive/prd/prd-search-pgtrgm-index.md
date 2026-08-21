# PRD: 搜索性能优化 — pg_trgm 索引

## Problem Statement

PostgreSQL FTS 使用 `simple` 词典，不处理中文分词。中文搜索（如搜"平面图"）无法命中 GIN 索引，回退到 `ILIKE %平面图%` 全表扫描。英文文件名搜索也依赖 ILIKE 回退模糊匹配。大表（数十万文件）下搜索性能下降明显。

## Solution

启用 PostgreSQL `pg_trgm` extension，在 `file_system_nodes.name` 和 `file_system_nodes.description` 上建 GIN 三字母索引，加速所有 ILIKE/模糊查询。

## User Stories

1. 作为用户，我希望搜索中文文件名（如"平面图"）时响应迅速，而不是等待全表扫描
2. 作为用户，我希望模糊搜索（只记得文件名一部分）时响应迅速
3. 作为运维人员，我不希望为搜索性能引入额外的外部服务（Elasticsearch 等）
4. 作为开发者，我期望搜索性能随数据量增长能线性扩展，而不是指数退化

## Implementation Decisions

### 技术方案：pg_trgm

pg_trgm 是 PostgreSQL 自带 contrib extension，无需编译额外包。它将文本拆分为连续三个字符的片段（trigram），建立 GIN 索引后可以高效支持 `LIKE`、`ILIKE`、`%abc%`、相似度查询等。

### 变更范围

**Prisma migration：**
1. `CREATE EXTENSION IF NOT EXISTS pg_trgm`
2. 在 `file_system_nodes.name` 上建 GIN 索引：`CREATE INDEX idx_file_system_nodes_name_trgm ON file_system_nodes USING GIN (name gin_trgm_ops)`
3. 可选：在 `description` 上建同样索引

**代码变更：**
- `FtsQueryBuilder` 的 ILIKE 回退路径自动受益，无需修改代码
- 搜索流程不变：FTS 命中优先 → FTS 未命中时 ILIKE 回退（此时 pg_trgm 加速）

### 与现有索引的关系

- 现有 `idx_file_system_nodes_search_vector`（tsvector GIN）不变，继续服务英文 FTS
- 新增 `idx_file_system_nodes_name_trgm` 服务 ILIKE 回退路径
- 不需要移除现有 `idx_project_search` 和 `idx_library_search` 复合索引

### 性能预期

| 场景 | 当前 | 加 pg_trgm 后 |
|------|------|---------------|
| 搜"平面图"（10 万行） | 全表扫描，~500ms | 索引扫描，~5ms |
| 搜"door" ILIKE 回退 | seq scan | 索引扫描 |
| 英文 FTS 命中 | 不变 | 不变 |

## Out of Scope

- 中文分词器（zhparser/jieba）——TOB 部署需要编译 C 扩展，增加运维负担，文件名搜索不需要语义分词
- Elasticsearch/Meilisearch 引入——等 TOC 百万级规模时再考虑
- 搜索结果排序相关性调整

## Further Notes

- pg_trgm 对中文友好的原因：中文三个字一组也形成 trigram，"平面图"→ trigram 匹配"平面图"三个字
- 索引大小约为文本数据的 3-5 倍，对于文件名这种短文本可以忽略
- `gin_trgm_ops` 操作符类支持 `LIKE`、`ILIKE`、`~`（正则）查询