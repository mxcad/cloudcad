# CloudCAD 限界上下文映射

> DDD 战略设计产出，基于 2026-05-06 grill-with-docs 访谈共识。

## 核心链路

```
打开图纸 → 上传(dwg/dxf→mxweb转换) → 存储(mxweb落盘) → 版本管理(SVN提交) → 读取
```

## 限界上下文

```
┌─────────────────────────────────────────────────────────────┐
│                    图纸内容上下文                              │
│  (Drawing Content Context)                                  │
│                                                             │
│  聚合根: DrawingSession (编辑会话)                            │
│  ├── mxweb 数据（运行时内存中的图纸内容）                       │
│  ├── 编辑状态（已修改/未修改）                                 │
│  └── 关联的 FileNode ID                                     │
│                                                             │
│  领域服务:                                                    │
│  ├── mxcad — CAD 引擎交互、保存/加载 mxweb                  │
│  ├── storage — mxweb 二进制物理落盘                          │
│  └── conversion — dwg/dxf ↔ mxweb 格式转换                  │
│                                                             │
│  领域事件:                                                    │
│  ├── DrawingUploaded (图纸上传完成)                           │
│  ├── DrawingSaved (编辑器保存完成)                            │
│  └── ConversionFailed (格式转换失败)                         │
│                                                             │
│  当前导入: FileSystemModule (forwardRef), StorageModule       │
│          (forwardRef), VersionControlModule, ConversionModule │
└──────────────────────────────┬──────────────────────────────┘
                               │
                    直接服务调用（当前阶段）
                    后续重构为领域事件驱动
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    图纸组织上下文                              │
│  (Drawing Organization Context)                             │
│                                                             │
│  聚合根: FileNode (文件节点)                                  │
│  ├── Drawing（值对象 — 图纸 mxweb 文件路径、格式、hash）       │
│  ├── 父子关系（文件树结构）                                   │
│  ├── 权限归属（Project/Personal Space/Library）              │
│  ├── 版本历史（SVN 提交记录）                                 │
│  └── 存储路径（物理文件位置）                                  │
│                                                             │
│  领域服务:                                                    │
│  ├── file-system — 文件树 CRUD、权限检查                     │
│  └── version-control — SVN 提交、版本历史查询                │
│                                                             │
│  领域事件:                                                    │
│  ├── FileNodeCreated (文件节点创建)                           │
│  ├── VersionCommitted (SVN 提交成功)                         │
│  └── VersionCommitFailed (SVN 提交失败，需补偿)               │
│                                                             │
│  当前导入: StorageModule, VersionControlModule,              │
│          DatabaseModule, RolesModule, AuditLogModule         │
└─────────────────────────────────────────────────────────────┘
```

## 上下文关系

| 关系 | 说明 |
|------|------|
| **上游/下游** | 图纸内容上下文是上游（生产 mxweb 数据），图纸组织上下文是下游（持久化 + 版本化） |
| **通信方式（当前）** | 直接服务调用。`mxcad` 通过 NestJS DI 注入 `FileSystemService`、`StorageService`、`VersionControlService` |
| **通信方式（目标）** | 领域事件驱动。DrawingSaved 事件触发 VersionControl.commit()，解耦两个上下文 |
| **共享内核** | Database schema（Prisma models）、CommonModule（guards、interceptors） |

## 聚合设计

### FileNode（聚合根）

```
FileNode (Aggregate Root)
├── id: string
├── name: string
├── parentId: string | null
├── projectId: string
├── ownerId: string
├── fileStatus: FileStatus
├── drawing: Drawing (值对象)
│   ├── fileHash: string          # mxweb 文件 hash
│   ├── fileSize: number          # 文件大小（字节）
│   ├── mimeType: string          # application/dwg | application/dxf | application/mxweb
│   ├── extension: string         # .dwg | .dxf | .mxweb
│   ├── storagePath: string       # 物理存储路径
│   └── mxwebUrl: string | null   # CAD 引擎加载 URL
├── permissions: FilePermission[] # 权限列表
└── versions: VersionRecord[]     # 版本历史
```

**不变量:**
- 一个 FileNode 有且仅有一种归属（Project / Personal Space / Library）
- 删除 FileNode 时，其所有版本记录一同删除
- Drawing.fileHash 必须与 storage 中的 mxweb 文件一致

### DrawingSession（图纸内容上下文的聚合根）

```
DrawingSession (Aggregate Root)
├── sessionId: string
├── fileNodeId: string            # 关联的 FileNode
├── userId: string
├── mxwebData: Buffer             # 当前编辑器中的 mxweb 数据
├── isDirty: boolean              # 是否有未保存修改
├── openedAt: Date
└── lastSavedAt: Date
```

**不变量:**
- 一个 fileNodeId 在同一时间只能有一个活跃的 DrawingSession（并发约束）
- DrawingSession 关闭时，如果 isDirty 为 true，必须提示用户保存

## 后续迭代扩展

| 扩展点 | 说明 | 优先级 |
|--------|------|--------|
| 并发保存冲突处理 | 后保存者拉取最新 mxweb → 合并/放弃 → 重新保存 | P2 |
| 领域事件总线 | 引入 NestJS CQRS EventBus 替代直接调用 | P2 |
| Personal Space 上下文 | 复用 FileNode 聚合，isPersonalSpace=true | P2 |
| Library 上下文 | 独立的 LibraryController + 跳过 SVN | P3 |

## 参考

- [CONTEXT.md](../../CONTEXT.md) — 领域术语定义
- [ADR 0001](../../docs/adr/0001-merge-conversion-engine-into-backend.md) — 转换引擎合并决策
