# NestJS 最佳实践合规检查报告

## 检查范围

扫描路径：`apps/backend/src/**/*.ts`

检查时间：2026-05-02

---

## 检查结果概览

| 检查项 | 问题数量 | 严重程度 |
|--------|----------|----------|
| Controller 直接调用数据库 | 7处 | 高 |
| Service 使用 setTimeout/setInterval | 5处 | 中 |
| 未使用 NestJS 内置异常 | 11处 | 中 |
| 未正确使用依赖注入 | 0处 | - |
| Module imports/exports/providers 不一致 | 1处 | 低 |

---

## 1. Controller 直接调用数据库（绕过 Service 层）

### 问题描述

Controller 层直接注入并调用数据库（Prisma），违反了分层架构原则。业务逻辑应放在 Service 层。

### 问题位置

**文件**: `apps/backend/src/mxcad/core/mxcad.controller.ts`

| 行号 | 代码位置 | 问题描述 |
|------|----------|----------|
| 106 | 构造函数注入 | `private readonly prisma: DatabaseService` |
| 577 | `findUnique` | `this.prisma.fileSystemNode.findUnique()` |
| 598 | `findUnique` | `this.prisma.fileSystemNode.findUnique()` |
| 1692 | `findFirst` | `this.prisma.fileSystemNode.findFirst()` |
| 1888 | `findUnique` | `this.prisma.user.findUnique()` |
| 1979 | `findUnique` | `this.prisma.user.findUnique()` |
| 2004 | `findMany` | `this.prisma.fileSystemNode.findMany()` |
| 2050 | `findFirst` | `this.prisma.fileSystemNode.findFirst()` |
| 2077 | `findUnique` | `this.prisma.fileSystemNode.findUnique()` |

### 修复建议

将数据库操作迁移到 `MxCadService` 或专用的数据服务中，Controller 只负责接收请求和返回响应。

---

## 2. Service 中使用 setTimeout/setInterval（应使用 @nestjs/schedule）

### 问题描述

Service 层直接使用原生 `setTimeout`/`setInterval`，应使用 `@nestjs/schedule` 模块以获得更好的可测试性和生命周期管理。

### 问题位置

| 文件路径 | 行号 | 使用方式 | 用途 |
|----------|------|----------|------|
| `apps/backend/src/mxcad/external-ref/external-reference-update.service.ts` | 48 | `setTimeout(resolve, 100)` | 等待文件系统写入完成 |
| `apps/backend/src/database/database.service.ts` | 80 | `setTimeout(reject, timeout)` | 数据库连接超时 |
| `apps/backend/src/common/services/file-lock.service.ts` | 264 | `setTimeout(resolve, ms)` | sleep 辅助函数 |
| `apps/backend/src/cache-architecture/services/cache-monitor.service.ts` | 53 | `setInterval(() => ..., interval)` | 定期清理性能数据 |
| `apps/backend/src/mxcad/chunk/chunk-upload.service.ts` | 399 | `setTimeout(resolve, ms)` | sleep 辅助函数 |

### 修复建议

1. **周期性任务**（如 `cache-monitor.service.ts`）：使用 `@nestjs/schedule` 的 `@Cron()` 装饰器
2. **简单延迟**（如 `file-lock.service.ts`、`chunk-upload.service.ts`）：可保留，但建议提取为工具函数
3. **连接超时**（如 `database.service.ts`）：可保留，属于底层操作

---

## 3. 未使用 NestJS 内置异常（直接 throw new Error）

### 问题描述

代码中直接使用 `throw new Error()` 而非 NestJS 提供的异常类（如 `HttpException`、`NotFoundException` 等），导致异常处理不一致。

### 问题位置

| 文件路径 | 行号 | 错误消息 | 建议替换 |
|----------|------|----------|----------|
| `apps/backend/src/file-system/file-system.service.ts` | 256 | `uploadFile 方法尚未实现到子服务中` | `NotImplementedException` |
| `apps/backend/src/file-system/file-system.service.ts` | 266 | `getTrashItems 方法尚未实现到子服务中` | `NotImplementedException` |
| `apps/backend/src/file-system/file-system.service.ts` | 484 | `节点不存在` | `NotFoundException` |
| `apps/backend/src/file-system/file-system.service.ts` | 495 | `节点不存在` | `NotFoundException` |
| `apps/backend/src/storage/local-storage.provider.ts` | 160 | `文件不存在: ${key}` | `NotFoundException` |
| `apps/backend/src/storage/local-storage.provider.ts` | 198 | `文件不存在: ${key}` | `NotFoundException` |
| `apps/backend/src/storage/local-storage.provider.ts` | 204 | `路径是目录而非文件: ${key}` | `BadRequestException` |
| `apps/backend/src/cache-architecture/services/cache-warmup.service.ts` | 339 | `预热用户 ${userId} 失败: ...` | `InternalServerErrorException` |
| `apps/backend/src/cache-architecture/services/cache-warmup.service.ts` | 399 | `预热项目 ${projectId} 失败: ...` | `InternalServerErrorException` |
| `apps/backend/src/auth/services/wechat.service.ts` | 72 | `微信 AppID 未配置...` | `BadRequestException` |
| `apps/backend/src/auth/services/wechat.service.ts` | 75 | `微信回调地址未配置...` | `BadRequestException` |

### 修复建议

使用 NestJS 内置异常类：
- `NotFoundException` - 资源不存在
- `BadRequestException` - 请求参数错误或配置缺失
- `InternalServerErrorException` - 服务器内部错误
- `NotImplementedException` - 方法未实现

---

## 4. 未正确使用依赖注入

### 检查结果

**未发现问题**

代码中所有 Service 依赖均通过构造函数注入，没有发现直接使用 `new` 创建服务实例的情况。

> 注：`new Logger(ClassName)` 是 NestJS 推荐的日志记录方式，不属于问题。

---

## 5. Module imports/exports/providers 一致性检查

### 问题描述

`FileSystemModule` 的 exports 数组中导出了子模块而非服务，虽然功能上可行，但不符合最佳实践。

### 问题位置

**文件**: `apps/backend/src/file-system/file-system.module.ts`

```typescript
exports: [
  FileSystemService,
  FileHashModule,           // 导出模块而非服务
  FileValidationModule,     // 导出模块而非服务
  StorageQuotaModule,       // 导出模块而非服务
  FileTreeModule,           // 导出模块而非服务
  FilePermissionModule,     // 导出模块而非服务
  ProjectMemberModule,      // 导出模块而非服务
  SearchModule,             // 导出模块而非服务
  FileDownloadModule,       // 导出模块而非服务
],
```

### 修复建议

建议仅导出本模块的服务，子模块应由各自的模块管理导出。如果需要导出子模块的服务，应在子模块中定义 exports，然后在需要的地方导入子模块。

---

## 总结与建议

### 优先级排序

1. **高优先级**：修复 Controller 直接调用数据库问题，确保分层架构
2. **中优先级**：统一使用 NestJS 内置异常类
3. **中优先级**：将周期性任务迁移到 `@nestjs/schedule`
4. **低优先级**：优化 Module 的 exports 配置

### 代码规范建议

1. 严格遵循 NestJS 分层架构：Controller → Service → Repository
2. 使用 `@nestjs/schedule` 处理定时任务
3. 统一使用 NestJS 异常类进行错误处理
4. Module 仅导出自身提供的服务，子模块通过 imports 引入

---

**检查完成** ✅