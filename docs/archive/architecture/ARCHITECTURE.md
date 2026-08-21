# CloudCAD 项目架构总览

> **读者**: 新加入的 AI Agent 或开发者。读完本文你应该能理解项目全貌、找到任何代码/文档的位置、知道当前分支正在做什么。

**当前分支**: `refactor/circular-deps`（领先 main 31 个提交）
**最后更新**: 2026-05-02

---

## 一、项目概览

CloudCAD 是一个基于 NestJS 的 CAD 协同设计平台后端，使用 pnpm monorepo 管理。

```
cloudcad/
├── packages/
│   ├── backend/          ← NestJS 后端（本分支工作重点）
│   └── frontend/         ← Vue 3 前端
├── packages/             ← 共享包（如 svn-version-tool）
├── docs/                 ← 全部项目文档（本文所在目录）
└── pnpm-workspace.yaml
```

**技术栈**: TypeScript, NestJS, Prisma (PostgreSQL), Redis, SVN, MinIO

---

## 二、后端模块地图

### 2.1 基础设施层

| 模块 | 路径 | 职责 |
|------|------|------|
| CommonModule | `src/common/common.module.ts` | 权限、缓存、存储管理、初始化、并发控制 |
| DatabaseModule | `src/database/` | Prisma 数据库连接 |
| RedisModule | `src/redis/` | Redis 缓存连接 |
| StorageModule | `src/storage/` | 文件存储（本地/MinIO） |
| RuntimeConfigModule | `src/runtime-config/` | 运行时动态配置 |
| CacheArchitectureModule | `src/cache-architecture/` | 三级缓存架构（L1内存/L2 Redis/L3 DB） |

### 2.2 业务模块

| 模块 | 路径 | 职责 |
|------|------|------|
| AuthModule | `src/auth/` | 认证（登录/注册/微信/Token/邮箱验证/短信验证） |
| UsersModule | `src/users/` | 用户 CRUD、账户注销/恢复 |
| RolesModule | `src/roles/` | 系统角色和项目角色权限管理 |
| PolicyEngineModule | `src/policy-engine/` | 动态权限策略引擎 |
| AuditLogModule | `src/audit/` | 审计日志 |
| FontsModule | `src/fonts/` | 字体管理 |
| LibraryModule | `src/library/` | 公共图纸库和图块库 |
| PersonalSpaceModule | `src/personal-space/` | 用户私人空间 |
| PublicFileModule | `src/public-file/` | 公开文件访问 |
| VersionControlModule | `src/version-control/` | SVN 版本控制集成 |

### 2.3 文件系统模块（冲刺二拆分完成）

> 原为一个巨大的 God Module（14 个 Service，~7200 行），已拆分为 8 个独立子模块 + 1 个 Facade。

```
file-system/
├── file-system.module.ts         ← 父模块（挂载所有子模块 + Facade）
├── file-system.service.ts        ← Facade 外观类（向后兼容）
├── file-system.controller.ts     ← REST API
├── file-hash/                    ← 文件 MD5 哈希计算（纯工具，零依赖）
├── file-validation/              ← 文件类型/大小/MIME/魔数验证
├── storage-quota/                ← 三种配额管理（个人/项目/资源库）
│   ├── storage-quota.service.ts
│   ├── storage-info.service.ts
│   └── quota-enforcement.service.ts
├── file-tree/                    ← 文件树节点 CRUD
├── file-permission/              ← 节点权限检查
├── project-member/               ← 项目成员管理
├── search/                       ← 全文搜索
├── file-download/                ← 文件下载/导出/ZIP/CAD 转换
└── dto/
```

> 另外两个相关服务（FileOperationsService, ProjectCrudService）已迁出到：
> `src/file-operations/file-operations.module.ts`

### 2.4 MxCAD 模块（冲刺二拆分完成）

> 原为一个巨大的 God Module（21 个 Service，~7800 行），已拆分为 9 个独立子模块。

```
mxcad/
├── mxcad.module.ts               ← 父模块
├── mxcad.controller.ts           ← REST API（2685 行）
├── infra/                        ← 基础设施：文件 I/O、缓存、缩略图、Linux 初始化
├── conversion/                   ← DWG/DXF → MxWeb 格式转换
├── chunk/                        ← 分片上传/合并
├── node/                         ← 文件系统节点创建与管理
├── external-ref/                 ← 外部参照处理
├── upload/                       ← 上传核心逻辑（合并+转换+存储）
├── save/                         ← 另存为功能
├── facade/                       ← 编排层（Facade + Orchestrator）
└── core/                         ← MxCadService + 文件流服务 + Controller
```

### 2.5 共享接口（冲刺一成果）

| 文件 | 用途 |
|------|------|
| `src/common/interfaces/user-service.interface.ts` | `USER_SERVICE` 令牌 + `IUserService` 接口 — 解耦 CommonModule/AuthModule/UsersModule |
| `src/common/interfaces/verification.interface.ts` | `SMS_VERIFICATION_SERVICE` / `EMAIL_VERIFICATION_SERVICE` 令牌 — 解耦 UsersModule/AuthModule |

---

## 三、冲刺历史

### 冲刺一：消除模块循环依赖

**目标**: 消除 5 对双向 `forwardRef` 循环依赖
**方案**: 提取共享接口到 `common/interfaces/`，依赖接口而非具体实现

| 循环依赖对 | 结果 |
|-----------|------|
| CommonModule ↔ AuditLogModule | 完全消除（移除未使用的注入） |
| CommonModule ↔ UsersModule | 完全消除（提取 IUserService 接口） |
| CommonModule ↔ CacheArchitectureModule | 完全消除（移除无实际依赖的 forwardRef） |
| AuthModule ↔ UsersModule | TypeScript 解耦（接口 + 模块级 token 导出） |
| FileSystemModule ↔ RolesModule | 完全消除（移除不必要的 import + 清理未使用注入） |

**关键文档**: `docs/decircularize-report.md`

### 冲刺二：上帝模块拆分

**目标**: 将 file-system（14 服务）和 mxcad（21 服务）拆分为功能明确的子模块

**file-system 拆分**（6 个 Phase）:
| Phase | 子模块 | 关键文档 |
|-------|--------|---------|
| Phase 1 | FileHash, FileValidation, StorageQuota | `sprint2-phase1-filesystem.md` |
| Phase 2 | FileTree, FilePermission | `sprint2-phase2-filesystem.md` |
| Phase 3 | ProjectMember, Search, FileDownload | `sprint2-phase3-filesystem.md` |
| Phase 5 | 父模块精简 + 验证 | `sprint2-phase5-filesystem.md` |

**mxcad 拆分**（7 个 Phase）:
| Phase | 子模块 | 关键文档 |
|-------|--------|---------|
| Phase 1 | MxcadInfra | `sprint2-phase1-mxcad.md` |
| Phase 2 | MxcadConversion | `sprint2-phase2-mxcad.md` |
| Phase 5 | MxcadExternalRef | `sprint2-phase5-mxcad.md` |
| Phase 6 | MxcadCore | `sprint2-phase6-mxcad.md` |
| Phase 7 | 收尾总结 | `sprint2-phase7-mxcad.md` |

**关键文档**: `docs/sprint2-pre-analysis.md`（拆分前置分析）、`docs/sprint2-final-summary.md`（最终总结）

### 冲刺三：测试防线（进行中）

**目标**: 为拆分后的模块补充单元测试

**当前测试覆盖**（11 个 spec 文件）:

| 服务 | 用例数 | 状态 |
|------|--------|------|
| FileValidationService | 28 | 完成 |
| FileOperationsService | 72 | 完成 |
| FileTreeService | 32 | 完成 |
| VersionControlService | 27 | 完成 |
| MxCadController | 24 | 完成 |
| SearchService | 26 | 完成 |
| ProjectCrudService | 骨架 | TODO 实现 |
| FileConversionService | 骨架 | TODO 实现 |
| FileSystemService | 骨架 | TODO 实现 |
| FileSystemNodeService | 骨架 | TODO 实现 |

**质量审计**: `docs/sprint3-test-quality-audit.md` — 发现引用计数逻辑、SVN 回滚、并发冲突测试完全缺失

**优先级路线图**: `docs/sprint3-test-priority-roadmap.md`

---

## 四、文档索引

### 4.1 架构与设计文档

| 文档 | 说明 |
|------|------|
| `AI_CONTEXT.md` | 项目级 AI 上下文 |
| `architecture-health-report.md` | 架构健康度评估 |
| `module-dependency-graph.md` | 模块依赖关系图 |
| `database-entity-report.md` | 数据库实体报告 |
| `business-flow-diagrams.md` | 核心业务流程 |
| `monorepo-migration.md` | Monorepo 迁移记录 |
| `vue3-migration-plan.md` | Vue 3 迁移计划 |

### 4.2 冲刺一文档（循环依赖）

| 文档 | 说明 |
|------|------|
| `circular-deps-analysis.md` | 循环依赖分析报告 |
| `decircularize-report.md` | 循环依赖修复报告 |
| `dependency-audit-report.md` | 依赖审计报告 |
| `audit-decircularize.md` | 解耦化审计 |
| `audit-dep-cleanup.md` | 依赖清理审计 |
| `audit-global-consistency.md` | 全局一致性审计 |
| `audit-p0-p1-p2-fixes.md` | P0/P1/P2 修复审计 |

### 4.3 冲刺二文档（上帝模块拆分）

| 文档 | 说明 |
|------|------|
| `sprint2-pre-analysis.md` | 拆分前置分析（依赖图、风险点、执行顺序） |
| `sprint2-phase1-filesystem.md` | file-system Phase 1（叶节点） |
| `sprint2-phase2-filesystem.md` | file-system Phase 2（核心服务） |
| `sprint2-phase3-filesystem.md` | file-system Phase 3（上层服务） |
| `sprint2-phase5-filesystem.md` | file-system Phase 5（父模块精简） |
| `sprint2-phase1-mxcad.md` | mxcad Phase 1（基础设施） |
| `sprint2-phase2-mxcad.md` | mxcad Phase 2（转换） |
| `sprint2-phase5-mxcad.md` | mxcad Phase 5（外部参照） |
| `sprint2-phase6-mxcad.md` | mxcad Phase 6（核心） |
| `sprint2-phase7-mxcad.md` | mxcad Phase 7（收尾） |
| `sprint2-phase1-audit.md` | Phase 1 审计 |
| `sprint2-phase2-audit.md` | Phase 2 审计 |
| `sprint2-phase3-audit.md` | Phase 3 审计 |
| `sprint2-final-summary.md` | 冲刺二最终总结 |
| `sprint2-full-inventory.md` | 拆分后完整服务清单 |
| `sprint2-mxcad-final.md` | mxcad 拆分最终报告 |
| `sprint2-remaining-work.md` | 剩余工作清单 |

### 4.4 冲刺三文档（测试防线）

| 文档 | 说明 |
|------|------|
| `sprint3-test-planning.md` | 测试规划（覆盖率目标、P0/P1 优先级） |
| `sprint3-test-priority-roadmap.md` | 测试补全优先级路线图 |
| `sprint3-test-quality-audit.md` | 测试质量深度审计 |
| `sprint3-test-progress.md` | 测试进度跟踪 |
| `sprint3-test-task-assignment.md` | 测试任务分配 |
| `sprint3-import-check.md` | 导入路径检查 |
| `sprint3-cleanup-findings.md` | 代码清理发现 |
| `sprint3-progress-check.md` | 进度检查 |
| `test-coverage-gap.md` | 测试覆盖缺口分析 |

### 4.5 API 与接口文档

| 文档 | 说明 |
|------|------|
| `api-inventory.md` | API 接口清单 |
| `api-final-status.md` | API 最终状态 |
| `admin-api-plan.md` | 管理后台 API 规划 |

### 4.6 前端文档

| 文档 | 说明 |
|------|------|
| `frontend-code-review.md` | 前端代码审查 |
| `frontend-refactor-plan.md` | 前端重构计划 |
| `upload-migration-plan.md` | 上传功能迁移计划 |

### 4.7 审计与检查文档

| 文档 | 说明 |
|------|------|
| `project-full-audit.md` | 项目全量审计 |

---

## 五、关键设计决策

### 5.1 循环依赖解耦模式

当两个 NestJS 模块互相需要对方的 Service 时，使用**接口令牌 + 模块级 provider 导出**：

1. 在 `common/interfaces/` 定义接口和字符串令牌
2. Service A 使用 `@Inject(TOKEN)` 注入接口，而非直接 import 具体类
3. Service B 所在的模块注册 `{ provide: TOKEN, useExisting: ServiceB }` 并导出 TOKEN
4. TypeScript 层面无循环 import，NestJS DI 通过模块的 `forwardRef` 解决运行时循环

### 5.2 上帝模块拆分模式

1. **叶节点优先**：先拆分零依赖的纯工具服务（FileHash、FileValidation）
2. **核心服务次之**：拆分被上层广泛依赖的服务（FileTree、FilePermission）
3. **上层服务最后**：拆分依赖核心层的服务（ProjectMember、Search、FileDownload）
4. **Facade 保留**：父模块保留一个 Facade Service 作为向后兼容的 API 入口
5. **每步验证**：每拆分一个模块立即 `npx tsc --noEmit`

### 5.3 测试防线策略

1. **数据安全优先**：引用计数逻辑、SVN 回滚、并发冲突 → 不可逆数据丢失风险
2. **性价比优先**：填充已有 spec 骨架（mock 已就绪）优先于从零创建
3. **上游优先**：UsersService → AuthFacadeService → MxCadService（按依赖广度排序）

---

## 六、快速定位指南

| 你想找... | 去看... |
|-----------|--------|
| 某个后端模块的职责 | 本文 §2 |
| 循环依赖怎么解决的 | `decircularize-report.md` |
| 文件系统有哪些子模块 | 本文 §2.3 或 `sprint2-pre-analysis.md` |
| MxCAD 有哪些子模块 | 本文 §2.4 或 `sprint2-pre-analysis.md` |
| 当前测试覆盖情况 | `sprint3-test-quality-audit.md` |
| 接下来该测试什么 | `sprint3-test-priority-roadmap.md` |
| 为什么要这样拆分模块 | `sprint2-pre-analysis.md`（依赖图+风险分析） |
| 某个接口令牌的定义 | `src/common/interfaces/` |
| 数据库表结构 | `database-entity-report.md` |
| API 端点列表 | `api-inventory.md` |
| monorepo 配置 | `pnpm-workspace.yaml` + `monorepo-migration.md` |
| Jest 配置 | `packages/backend/jest.config.ts` |

---

*文档版本: 1.0.0 | 下次更新: 冲刺三完成时*
