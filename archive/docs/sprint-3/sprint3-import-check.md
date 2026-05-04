# Sprint 3 Import 路径断链风险检查报告

**分支**: refactor/circular-deps
**检查时间**: 2026-05-02
**检查范围**: `packages/backend/src/` 目录下所有 TypeScript 文件

---

## 1. 摘要

本次扫描共检测到约 **364 条** import 语句，覆盖 **约 150+ 个** TypeScript 文件。经分析，发现以下潜在断链风险：

| 风险等级 | 数量 | 说明 |
|---------|------|------|
| 🔴 高风险 | 2 | 跨模块深度依赖，存在循环依赖风险 |
| 🟡 中风险 | 5 | 深层相对路径 (≥3级)，维护性差 |
| 🟢 低风险 | 2 | workspace 依赖包，需要验证可用性 |

---

## 2. 高风险问题 (需优先处理)

### 2.1 public-file → mxcad/conversion 跨模块依赖

**问题描述**: `public-file` 模块直接引用了 `mxcad/conversion` 的内部服务

**涉及文件**:
- [public-file.service.ts:L24](file:///d:/project/cloudcad/packages/backend/src/public-file/public-file.service.ts#L24)
- [public-file-upload.service.ts:L27](file:///d:/project/cloudcad/packages/backend/src/public-file/services/public-file-upload.service.ts#L27)

**具体导入**:
```typescript
// public-file/public-file.service.ts
import { FileConversionService } from '../mxcad/conversion/file-conversion.service';

// public-file/services/public-file-upload.service.ts
import { FileConversionService } from '../../mxcad/conversion/file-conversion.service';
```

**风险分析**:
- `public-file` 是独立模块，不依赖 NestJS 模块体系
- `mxcad/conversion` 属于 `MxcadConversionModule`，内部包含对 `CommonModule`、`StorageModule` 等的依赖
- 如果 `MxcadConversionModule` 未来反向依赖 `public-file`，将形成循环依赖

**建议**: 考虑将 `FileConversionService` 提取到更通用的位置（如 `common/services/`），或通过事件/消息队列解耦

---

### 2.2 Backup 文件可能包含过时引用

**问题描述**: 存在备份文件 `jwt.strategy.ts.backup`，可能包含断链的旧代码

**涉及文件**:
- [auth/strategies/jwt.strategy.ts.backup](file:///d:/project/cloudcad/packages/backend/src/auth/strategies/jwt.strategy.ts.backup)

**建议**: 确认备份文件是否仍需要，如不需要建议删除

---

## 3. 中风险问题 (深层相对路径)

### 3.1 多处使用 3 层及以上相对路径

以下文件使用了较深的相对路径引用，维护时容易出错：

| 文件路径 | 导入语句示例 | 深度 |
|---------|------------|------|
| `mxcad/infra/file-system.service.ts` | `from '../../../config/app.config'` | 3层 |
| `mxcad/conversion/file-conversion.service.ts` | `from '../../../common/concurrency/rate-limiter'` | 3层 |
| `auth/services/sms/sms-verification.service.ts` | `from '../../../runtime-config/runtime-config.service'` | 3层 |
| `auth/services/sms/sms.module.ts` | `from '../../../redis/redis.module'` | 3层 |

**建议**: 考虑配置 TypeScript path aliases (如 `@/config/app.config`) 替代深层相对路径

---

## 4. 低风险问题 (Workspace 依赖)

### 4.1 @cloudcad/svn-version-tool 外部包依赖

**涉及文件**:
- [version-control/version-control.service.ts:L33](file:///d:/project/cloudcad/packages/backend/src/version-control/version-control.service.ts#L33)
- [mxcad/infra/linux-init.service.ts:L28](file:///d:/project/cloudcad/packages/backend/src/mxcad/infra/linux-init.service.ts#L28)

**导入方式**:
```typescript
import { svnCheckout, svnAdd, ... } from '@cloudcad/svn-version-tool';
```

**状态**: ✅ 已正确配置在 `package.json` 中为 `workspace:*`

**建议**: 确保 `packages/svnVersionTool/` 包正确构建，且类型定义 (`index.d.ts`) 与实际导出一致

---

## 5. 正常工作的导入模式 (无需修改)

以下导入模式经确认工作正常：

### 5.1 同级目录导入 (./)
```typescript
// mxcad/mxcad.module.ts
import { MxcadInfraModule } from './infra/mxcad-infra.module';
import { MxcadConversionModule } from './conversion/mxcad-conversion.module';
```

### 5.2 父目录导入 (../)
```typescript
// file-system/file-system.controller.ts
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
```

### 5.3 爷目录导入 (../../)
```typescript
// mxcad/core/mxcad.controller.ts
import { DatabaseService } from '../../database/database.service';
import { StorageService } from '../../storage/storage.service';
```

---

## 6. 目录结构验证

以下目录结构已验证存在且可用：

| 目录路径 | 状态 |
|---------|------|
| `packages/backend/src/mxcad/conversion/` | ✅ 存在 |
| `packages/backend/src/mxcad/infra/` | ✅ 存在 |
| `packages/backend/src/public-file/` | ✅ 存在 |
| `packages/backend/src/common/services/` | ✅ 存在 |
| `packages/svnVersionTool/` | ✅ 存在 |

---

## 7. 建议行动项

| 优先级 | 行动项 | 负责模块 |
|-------|-------|---------|
| P0 | 审查 `public-file → mxcad/conversion` 的依赖必要性 | 架构组 |
| P1 | 删除或归档 `jwt.strategy.ts.backup` | auth 模块 |
| P2 | 评估是否配置 path aliases 替代深层相对路径 | 全栈 |
| P2 | 验证 `@cloudcad/svn-version-tool` 类型定义完整性 | svnVersionTool |

---

## 8. 扫描方法

本次扫描使用了以下命令模式：
```bash
# 扫描所有 import 语句
grep -rn "^import .* from " packages/backend/src/ --include="*.ts"

# 扫描相对路径导入
grep -rn "from '\.\.\/" packages/backend/src/ --include="*.ts"
```

---

**报告生成时间**: 2026-05-02
