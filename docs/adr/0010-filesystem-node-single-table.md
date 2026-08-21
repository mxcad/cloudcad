# FileSystemNode 保持单表不拆分

FileSystemNode 通过 `NodeType` 枚举（PROJECT / PERSONAL_SPACE / FOLDER / FILE / LIBRARY_DRAWING / LIBRARY_BLOCK）区分六类实体，大量字段对不同类型为 nullable。我们确认**保持单表**，不按归属类型拆分为独立表。

**Status**: accepted

**Considered Options**

1. **单表（chosen）** — 当前模式。字段 nullable，树遍历简单直接，后端的文件树服务（file-tree.service.ts）、搜索服务（search.service.ts）、回收站（node-trash.service.ts）均以单表递归查询为核心。Google Drive 的 `drive_item` 单表、Dropbox 的 `entries` 单表同模式。

2. **分拆为 Project / PersonalSpace / Library 独立表** — 可消除 nullable 字段，获得数据库级约束。但：
   - 树遍历从单表递归变成跨表 UNION/JOIN，性能损失且复杂度翻倍
   - 所有 `nodeType in (PROJECT, PERSONAL_SPACE)` 的查询需改为 UNION
   - 前后端数百处 `FileSystemNode` 引用均需改动
   - 不可逆迁移：百万级数据行需锁表窗口

3. **Class Table Inheritance（基表 + 详情表）** — `FileSystemNode` 存公共树数据，`project_details` / `library_details` 存专属字段。当前各类专属字段极少（仅 libraryType），收益无法覆盖复杂度。

**Consequences**

- 单表不动，`@ApiProperty` 和 DTO 映射不变
- OwnershipStrategy（ADR-0009）在行为层约束六类实体的差异，数据层保持统一
- 未来若有大量归属专属字段，优先用基表+详情表模式扩展，不拆主表
