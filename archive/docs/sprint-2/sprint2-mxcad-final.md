# 冲刺二：Mxcad 上帝模块拆分最终归总

**日期**: 2026-05-02  
**分支**: refactor/circular-deps  
**规划文档**: docs/sprint2-pre-analysis.md  
**阶段文档**: docs/sprint2-phase1-mxcad.md, docs/sprint2-phase2-mxcad.md, docs/sprint2-phase5-mxcad.md, docs/sprint2-phase6-mxcad.md, docs/sprint2-phase7-mxcad.md

---

## 一、成果总览

### 拆分前后对比

| 指标 | 拆分前（上帝模块） | 拆分后 |
|------|------------------|--------|
| 模块数 | 1 个（MxCadModule） | 1 个编排模块 + 9 个子模块 |
| 服务数 | 21 个（全部在一处） | 每个子模块 1-4 个服务 |
| 控制器 | 1 个（MxCadController） | 移至 MxcadCoreModule |
| 代码行数 | ~7,800 | 分散到各子模块 |
| MxCadModule providers | 21 项 | 1 项（FileUploadManagerFacadeService）+ 2 个别名/守卫 |
| 模块间依赖 | 隐式依赖（同模块内联） | 显式依赖（通过 imports） |
| 循环依赖风险 | 高（7 处 forwardRef） | 低（消除到仅保留 FileSystemModule 的 forwardRef） |

### 代码行数变化

```
原始 MxcadModule:      ~7,800 行（21 服务 + 1 控制器 + 1 模块文件）
拆分后总计:            ~7,800 行（零新增代码，仅文件移动+路径更新）
```

**零业务逻辑修改** — 全部拆分只做文件移动和 import 路径更新。

---

## 二、9 个子模块完整清单

| # | 子模块 | 目录 | 服务 | 行数 | 对外依赖 |
|---|--------|------|------|------|---------|
| 1 | **MxcadInfraModule** | `infra/` | FileSystemService(mx) | 258 | ConfigModule |
| | | | CacheManagerService | 179 | |
| | | | ThumbnailGenerationService | 325 | |
| | | | LinuxInitService | 235 | |
| | | | thumbnail-utils（工具） | - | |
| 2 | **MxcadConversionModule** | `conversion/` | FileConversionService | 510 | ConfigModule |
| 3 | **MxcadChunkModule** | `chunk/` | ChunkUploadService | 511 | ConfigModule, CommonModule, StorageModule |
| | | | FileCheckService | 98 | |
| 4 | **MxcadNodeModule** | `node/` | FileSystemNodeService | 802 | DatabaseModule, ConfigModule, CommonModule, FileSystemModule |
| | | | NodeCreationService | 601 | |
| 5 | **MxcadExternalRefModule** | `external-ref/` | ExternalRefService | 127 | ConfigModule, DatabaseModule, CommonModule, FileSystemModule, MxcadInfraModule, MxcadNodeModule |
| | | | ExternalReferenceHandler | 258 | |
| | | | ExternalReferenceUpdateService | 378 | |
| 6 | **MxcadFacadeModule** | `facade/` | UploadOrchestrator | 543 | ConfigModule, CommonModule, MxcadChunkModule, MxcadNodeModule, MxcadConversionModule |
| 7 | **MxcadUploadModule** | `upload/` | FileMergeService | 640 | ConfigModule, DatabaseModule, CommonModule, FileSystemModule, VersionControlModule, StorageModule, MxcadInfraModule, MxcadConversionModule, MxcadNodeModule, MxcadExternalRefModule |
| | | | FileConversionUploadService | 652 | |
| | | | UploadUtilityService | 138 | |
| | | | ChunkUploadManagerService | 103 | |
| 8 | **MxcadSaveModule** | `save/` | SaveAsService | 342 | DatabaseModule, ConfigModule, CommonModule, FileSystemModule, VersionControlModule, MxcadConversionModule, MxcadNodeModule |
| 9 | **MxcadCoreModule** | `core/` | MxCadService | 890 | 全部下层子模块 + 外部模块 |
| | | | MxcadFileHandlerService | 174 | |
| | | | MxCadController | 2,685 | |
| - | **MxCadModule（编排）** | 根目录 | FileUploadManagerFacadeService（仅注册） | 0（仅编排） | 导入全部 9 个子模块 |

### 剩余文件

`services/` 目录中遗留的工型文件（非服务，未迁移）：
- `file-conversion.service.spec.ts` — 测试文件（随对应服务保留路径）
- `file-upload-manager.types.ts` — 共享类型定义（被多个子模块引用）

---

## 三、拆分过程回顾

### 3.1 执行顺序（从叶到根）

```
Phase 1 ──── 基础设施层（零内部依赖）
  ├── MxcadInfraModule     — 4个纯基础设施服务
  └── MxcadConversionModule — 文件格式转换

Phase 2 ──── 上传基础设施 + 文件系统节点
  ├── MxcadChunkModule      — 分片上传（ChunkUploadService/FileCheckService）
  └── MxcadNodeModule       — 文件系统节点（FileSystemNodeService/NodeCreationService）
                              ⚠️ 依赖 file-system 模块的 FileTreeService

Phase 5 ──── 外部参照 + 编排层
  ├── MxcadExternalRefModule — 外部参照链（3 服务）
  └── MxcadFacadeModule      — UploadOrchestrator

Phase 7 ──── 另存为
  └── MxcadSaveModule        — SaveAsService

Phase 6 ──── 上传核心 + 最终核心
  ├── MxcadUploadModule      — 上传链（4 服务，含 ChunkUploadManagerService 迁移）
  └── MxcadCoreModule        — MxCadService/MxcadFileHandlerService/MxCadController
```

### 3.2 执行统计

| 指标 | 数值 |
|------|------|
| 总阶段数 | 5 个（Phase 1/2/5/7/6，按拓扑序执行） |
| 新增模块文件 | 9 个 |
| 移动服务/工具文件 | 16 个 |
| 更新 import 路径的文件 | 20+ 个 |
| 修复的断链 | 2 处（Phase 1 遗留的 `./file-system.service` 路径） |
| 总提交数 | 7 个（含 5 个模块提交 + 2 个文档提交） |

---

## 四、关键技术决策与难点

### 4.1 决策：NestJS 模块作用域限制

**问题**: 当子模块 A 被父模块 B 导入时，A 的提供者无法注入 B 的提供者（即使 B 中注册了这些服务）。

**影响**: FileUploadManagerFacadeService 依赖 4 个仍留在 MxCadModule 的服务（ChunkUploadManagerService, FileMergeService, UploadUtilityService, FileConversionUploadService），无法在 Phase 5 时随 UploadOrchestrator 一起移入 MxcadFacadeModule。

**解决方案**: 
- FileUploadManagerFacadeService 的物理文件移入 `facade/` 目录，但注册留在 MxCadModule
- 待 Phase 6 的 MxcadUploadModule 完成后，FileUploadManagerFacadeService 的所有依赖都已独立，可安全迁移
- 最终状态：FileUploadManagerFacadeService 仍是 MxCadModule 中唯一保留的提供服务（过渡安排）

### 4.2 决策：ChunkUploadManagerService 延迟迁移

**问题**: ChunkUploadManagerService 在 Phase 2 时因依赖 FileMergeService 无法随 ChunkUploadService/FileCheckService 移入 MxcadChunkModule（同上的模块作用域问题）。

**解决方案**: 暂留 MxCadModule 中，待 Phase 6 的 MxcadUploadModule（含 FileMergeService）完成后一并迁移。

### 4.3 难点：控制器和服务的大规模路径更新

`MxCadController`（2,685 行）和 `MxCadService`（890 行）移入 `core/` 后，需要更新 30+ 条 import 路径（`./xxx` → `../xxx`, `../xxx` → `../../xxx`, `./services/` → `../infra/` 等）。逐条编辑易出错，采用按块整体替换策略，确保一致性。

### 4.4 难点：非标准格式的导入引用

- `file-upload-manager.types.ts` 使用 `import('./xxx').Type` 动态类型导入语法，不能遗漏
- `file-download-export.service.ts` 使用 `import type { MxCadService } from '...'` 类型导入
- `mxcad.service.ts` 存在 `import('./services/filesystem-node.service')` 动态 import

以上非常规 import 格式在路径更新时需要特别注意。

### 4.5 发现：Phase 1 遗留的断链

在 refactoring 过程中发现 Phase 1 移动 `FileSystemService`(mx) 到 `infra/` 时，有 2 个文件（`external-ref.service.ts` 和 `upload-utility.service.ts`）的 import 路径未更新（仍指向 `./file-system.service` 但文件已不存在）。

这些断链在 Phase 5 移动 `external-ref.service.ts` 时一并修复。

### 4.6 环境限制

本项目的 tsc 运行在 Windows 环境下，`2>&1` 重定向语法被错误解析为文件名参数 `'2'`，导致 `npx tsc --noEmit 2>&1` 始终报 `TS6231` 错误。需要使用 `npx tsc --noEmit`（无重定向）获取完整输出，再通过 `grep` 过滤。

---

## 五、MxCadModule 最终结构

```typescript
@Module({
  imports: [
    // NestJS 标准模块
    DatabaseModule, CommonModule, ConfigModule, RuntimeConfigModule,
    JwtModule, MulterModule,
    // 外部业务模块
    FileSystemModule, StorageModule, VersionControlModule, RolesModule,
    // mxcad 子模块（9个）
    MxcadInfraModule,
    MxcadConversionModule,
    MxcadChunkModule,
    MxcadNodeModule,
    MxcadExternalRefModule,
    MxcadFacadeModule,
    MxcadUploadModule,
    MxcadSaveModule,
    MxcadCoreModule,
  ],
  controllers: [],  // → 已移至 MxcadCoreModule
  providers: [
    FileUploadManagerFacadeService,  // 过渡性保留（待后续迁移）
    { provide: 'FileSystemServiceMain', useExisting: MainFileSystemService },
    RequireProjectPermissionGuard,
  ],
  exports: [],  // → 已由各子模块分别导出
})
```

### 子模块依赖层级

```
MxcadCoreModule (Layer 3: API + 主服务)
  ├── MxcadFacadeModule (Layer 3: 编排)
  ├── MxcadUploadModule (Layer 2: 上传业务)
  ├── MxcadSaveModule   (Layer 2: 另存为业务)
  ├── MxcadExternalRefModule (Layer 2: 外部参照)
  ├── MxcadChunkModule  (Layer 1: 分片基础设施)
  ├── MxcadNodeModule   (Layer 1: 文件系统节点)

MxcadNodeModule ─────→ FileSystemModule (外部，FileTreeService)
MxcadExternalRefModule → MxcadNodeModule, MxcadInfraModule
MxcadUploadModule      → MxcadNodeModule, MxcadInfraModule, MxcadConversionModule, MxcadExternalRefModule
MxcadSaveModule        → MxcadNodeModule, MxcadConversionModule
MxcadCoreModule        → 全部下层子模块
```

---

## 六、对冲刺三的建议

### 6.1 后续可做的工作

1. **迁移 FileUploadManagerFacadeService 到 MxcadFacadeModule**
   - 当前仍是 MxCadModule 中唯一保留的提供服务
   - 移至 MxcadFacadeModule 后 MxCadModule 将完全成为纯编排模块
   - 需要检查是否有外部模块直接通过 MxCadModule 注入此服务

2. **file-system 模块上帝模块拆分**
   - 规划文档中的 file-system 拆分已在并行推进中
   - 依赖关系已清晰：mxcad → file-system 仅通过 FileTreeService 和 FileSystemService(Facade) 两个入口

3. **消除遗留的 forwardRef**
   - MxCadModule 中 `FileSystemModule` 和 `StorageModule` 仍然使用 forwardRef
   - 待 file-system 拆分完成且 mxcad 子模块的导入关系理顺后可以移除

4. **统一子模块命名规范**
   - 当前模块名前缀全部为 `Mxcad`（如 MxcadInfraModule, MxcadNodeModule...）
   - 保持一致性，后续新增模块也遵循此规范

### 6.2 拆分方法论总结

| 原则 | 实践 |
|------|------|
| **从叶到根** | 先拆分零依赖的基础设施，逐步向上到业务逻辑和编排层 |
| **每拆即验** | 每个子模块拆分后立即 `tsc --noEmit` 验证，不累积 |
| **只移不改** | 不修改业务逻辑，只做文件移动和路径更新 |
| **按功能内聚** | 子模块按业务功能组织（上传、节点、外部参照、另存为） |
| **模块作用域意识** | NestJS 中父模块的提供者对子模块不可见，拆分子模块前需确保所有依赖已就绪 |

### 6.3 常用操作速查

```bash
# 移动服务到子模块
git mv src/mxcad/services/xxx.service.ts src/mxcad/submodule/xxx.service.ts

# 验证编译
cd packages/backend && npx tsc --noEmit

# 提交（每子模块一次）
git add -A && git commit -m "refactor(mxcad): 拆分 子模块名"
```
