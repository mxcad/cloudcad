# Sprint 3 清理发现报告

**生成时间**: 2026-05-02  
**分支**: refactor/circular-deps  
**分析范围**: apps/backend/src

## 1. 备份文件分析

### jwt.strategy.ts.backup

**位置**: `apps/backend/src/auth/strategies/jwt.strategy.ts.backup`

**文件信息**:
- 大小: 1914 字节
- 创建时间: 2026/4/30 22:35

**引用检查**: ✅ 无任何文件引用此备份文件

**建议**: 可以安全删除

---

## 2. public-file 模块跨模块依赖

### 发现清单

以下文件直接引用了 `mxcad/conversion/` 内部服务（跨模块深层依赖）：

| 文件 | 行号 | 引用内容 |
|------|------|----------|
| `public-file/services/public-file-upload.service.ts` | 27 | `import { FileConversionService } from '../../mxcad/conversion/file-conversion.service'` |
| `public-file/public-file.service.ts` | 24 | `import { FileConversionService } from '../mxcad/conversion/file-conversion.service'` |

**问题分析**:
- `public-file` 模块直接依赖 `mxcad` 模块的内部服务 `FileConversionService`
- 这违反了模块封装原则，应该通过 `mxcad` 模块导出的公共接口访问
- 路径深度: 2-3层相对路径

**建议**:
- 在 `mxcad` 模块中导出 `FileConversionService` 或使用 facade 模式
- `public-file` 模块应通过 `mxcad` 模块的公开 API 访问转换功能

---

## 3. 深层相对路径分析

### 统计概览

扫描发现 **74个文件** 使用了3层及以上相对路径 (`../../../xxx`)。

### 高频深层引用文件 (Top 10)

| 文件 | 深层引用数量 |
|------|--------------|
| `mxcad.controller.ts` | 13 |
| `mxcad-core.module.ts` | 7 |
| `node-creation.service.ts` | 7 |
| `save-as.service.ts` | 5 |
| `public-file-upload.service.ts` | 5 |
| `mxcad-upload.module.ts` | 5 |
| `permission.service.ts` | 4 |
| `file-upload-manager-facade.service.ts` | 4 |
| `file-download-export.service.ts` | 4 |
| `mxcad.service.ts` | 4 |

### 典型深层路径示例

```
../../../runtime-config/runtime-config.service
../../../common/concurrency/rate-limiter
../../../config/app.config
../../../common/interfaces/verification-service.interface
```

### 4层及以上路径

✅ **未发现** 4层及以上相对路径 (`../../../../xxx`)

---

## 4. TypeScript 编译状态

**后端编译检查** (`npx tsc --noEmit --project apps/backend/tsconfig.json`):

**状态**: ❌ 存在预先存在的编译错误

**主要错误类型**:
1. **Prisma 客户端类型缺失** - 多个文件引用 `@prisma/client` 中不存在的导出成员
   - `FileSystemNode`, `Permission`, `ProjectPermission`, `Prisma`, `User`, `FileStatus` 等
   - 原因: Prisma schema 可能未正确生成或导入路径错误

2. **DatabaseService 属性缺失** - 大量文件访问不存在的属性
   - `fileSystemNode`, `projectRole`, `user`, `role` 等
   - 原因: `DatabaseService` 类型定义可能不完整或重构后未更新

3. **Express 类型问题** - Request/Response 类型不匹配
   - `setHeader`, `status`, `json`, `headersSent` 等属性不存在
   - 原因: 可能使用了错误的类型定义

4. **模块找不到错误** - 部分模块路径无法解析
   - `../../../common/concurrency/rate-limiter`
   - `../../interfaces/file-system.interface`
   - `../../../config/app.config`

**注意**: 这些错误是预先存在的，不是本次清理导致的问题。

---

## 5. 建议行动清单

### 高优先级

1. **删除备份文件**
   ```bash
   rm apps/backend/src/auth/strategies/jwt.strategy.ts.backup
   ```

2. **修复 public-file 跨模块依赖**
   - 在 `mxcad` 模块中创建公开的导出或 facade
   - 更新 `public-file` 模块的导入方式

### 中优先级

3. **减少深层相对路径**
   - 考虑使用 TypeScript path mapping (已在 tsconfig.json 中配置 `@/` 别名)
   - 将 `../../../xxx` 替换为 `@/xxx` 形式

4. **修复 Prisma 类型问题**
   - 运行 `pnpm prisma generate` 确保类型最新
   - 检查导入语句是否正确

### 低优先级

5. **模块结构优化**
   - 评估是否需要重新组织 mxcad 模块的 internal/external API
   - 考虑使用 Barrel exports (index.ts) 简化导入

---

## 附录: 完整深层引用文件列表

<details>
<summary>点击展开 74 个文件的完整列表</summary>

| 文件名 | 深层引用数 |
|--------|-----------|
| mxcad.controller.ts | 13 |
| mxcad-core.module.ts | 7 |
| node-creation.service.ts | 7 |
| save-as.service.ts | 5 |
| public-file-upload.service.ts | 5 |
| mxcad-upload.module.ts | 5 |
| permission.service.ts | 4 |
| file-upload-manager-facade.service.ts | 4 |
| file-download-export.service.ts | 4 |
| mxcad.service.ts | 4 |
| project-member.service.ts | 4 |
| mxcad-save.module.ts | 4 |
| file-system-permission.service.ts | 3 |
| mxcad-external-ref.module.ts | 3 |
| permission-cache.service.ts | 3 |
| file-validation.service.ts | 3 |
| file-conversion-upload.service.ts | 3 |
| project-crud.service.spec.ts | 3 |
| chunk-upload.service.ts | 3 |
| file-operations.service.spec.ts | 3 |
| mxcad-node.module.ts | 3 |
| file-download.module.ts | 3 |
| cache-warmup.service.ts | 3 |
| policy-config.controller.ts | 3 |
| role.strategy.ts | 3 |
| registration.service.ts | 3 |
| require-project-permission.guard.ts | 3 |
| sms.module.ts | 3 |
| file-merge.service.ts | 3 |
| storage-info.service.ts | 2 |
| file-permission.module.ts | 2 |
| storage-quota.module.ts | 2 |
| file-check.service.ts | 2 |
| file-tree.module.ts | 2 |
| file-tree.service.ts | 2 |
| project-member.module.ts | 2 |
| external-reference-update.service.ts | 2 |
| search.service.ts | 2 |
| mxcad-chunk.module.ts | 2 |
| policy-config.service.ts | 2 |
| password.service.ts | 2 |
| upload-utility.service.ts | 2 |
| permission.strategy.ts | 2 |
| account-binding.service.ts | 2 |
| password-reset.dto.ts | 2 |
| login.service.ts | 2 |
| role.dto.ts | 2 |
| storage-quota.interceptor.ts | 2 |
| external-reference-handler.service.ts | 2 |
| file-system.service.ts | 2 |
| filesystem-node.service.ts | 2 |
| directory-allocator.service.ts | 2 |
| cache-cleanup.scheduler.ts | 2 |
| create-role.dto.ts | 1 |
| user-response.dto.ts | 1 |
| deactivate-account.dto.ts | 1 |
| upload.orchestrator.ts | 1 |
| permission-policy.interface.ts | 1 |
| mxcad-facade.module.ts | 1 |
| request.types.ts | 1 |
| chunk-upload-manager.service.ts | 1 |
| policy-engine.service.ts | 1 |
| project-role.mapper.ts | 1 |
| l3-cache.provider.ts | 1 |
| l2-cache.provider.ts | 1 |
| disk-monitor.service.ts | 1 |
| user-cleanup.controller.ts | 1 |
| role-permissions.mapper.ts | 1 |
| refresh-token.strategy.ts | 1 |
| auth-token.service.ts | 1 |
| auth.dto.ts | 1 |
| audit-log.dto.ts | 1 |
| jwt.strategy.ts | 1 |
| sms-verification.service.ts | 1 |
| email.service.ts | 1 |
| file-extensions.service.ts | 1 |
| storage-quota.service.ts | 1 |
| search.module.ts | 1 |
| file-validation.module.ts | 1 |
| external-ref.service.ts | 1 |
| mxcad-file-handler.service.ts | 1 |
| file-conversion.service.ts | 1 |
| user-cleanup.service.ts | 1 |
| role-inheritance.service.ts | 1 |
| initialization.service.ts | 1 |
| file-lock.service.ts | 1 |
| storage-manager.service.ts | 1 |
| storage-cleanup.service.ts | 1 |
| roles-cache.service.ts | 1 |

</details>
