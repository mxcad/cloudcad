# PRD: 搜索体验改进 — 语法发现与 UI 打通

## Problem Statement

后端搜索支持丰富的语法（`ext:.dwg`、`size:>1MB`、`modified:>-7d`、`type:file` 等），但用户不知道这些语法存在。同时 SearchFilters 面板（637 行）与搜索框完全割裂——用户要么打字、要么点面板，两者不互通。

## Solution

将 SearchFilters 面板改造成**标签式筛选器**，用户点选筛选条件时自动以 `ext:.dwg` 格式填入搜索框。搜索框内以 chip/标签形式展示活跃筛选条件，可直接移除。

## User Stories

1. 作为普通用户，我想在文件列表中按 DWG 格式过滤文件，以便快速找到图纸
2. 作为普通用户，我想按文件大小范围过滤，以便找到大文件清理空间
3. 作为普通用户，我想按修改时间过滤，以便找到最近修改的图纸
4. 作为高级用户，我可以在搜索框直接输入 `ext:.dwg size:>10MB` 语法，以便快速组合筛选
5. 作为新用户，我看到搜索框时应该有提示告诉我支持哪些语法
6. 作为用户，我添加筛选条件后能在搜索框中看到活动的 chip 标签，并且点击 × 就能移除

## Implementation Decisions

### 架构变化

- **搜索框 + chip 区域**：搜索框下方或内部显示当前激活的筛选 chip，每个 chip 可单独移除
- **筛选面板 → 语法生成器**：用户在面板选择条件后，自动转换为 `key:value` 语法追加到搜索框
- **双向同步**：搜索框里的语法与面板的状态保持同步，删除搜索框中的 `ext:.dwg` 时面板中的对应选项自动取消
- **内联提示**：搜索框 focus 时显示语法提示浮层（ext:、size:、type:、modified:、sort:）

### 前端文件范围

- `packages/frontend/src/components/search/SearchInput.tsx` — 增加 chip 展示区域和语法提示
- `packages/frontend/src/components/search/SearchFilters.tsx` — 改造为与搜索框双向同步
- `packages/frontend/src/hooks/file-system/useFileSystemSearch.ts` — 简化，状态由搜索框统一管理
- 后端 `SearchDto` 和 `search-query.parser.ts` 无需改动

### 不变的部分

- 后端查询解析引擎不变，前端生成的语法字符串直接进入 `keyword` 字段
- 现有的 SearchScope、分页、排序逻辑不变

## Out of Scope

- PostgreSQL 全文搜索性能优化（另见 issue #94）
- 搜索结果的排序算法调整
- 移动端搜索改造

## Further Notes

- 后端 parseSearchQuery 已支持：ext:、type:、status:、modified:、created:、size:、sort:、短语 ""、排除 -
- 语法提示浮层应列出所有支持的语法