# 后端错误处理与日志审查报告

> 审查日期: 2026-05-08
> 审查范围: `packages/backend/src/` 下所有 TypeScript 源文件
> 审查维度: 异常处理、错误信息泄露、HTTP 状态码、日志记录、异步错误处理、数据库操作异常

---

## 一、总体评估

| 评估维度 | 评分 (1-5) | 简述 |
|----------|------------|------|
| 异常处理完整性 | 3.5 | 全局 ExceptionFilter 设计良好，但大量空 catch 块降低了覆盖质量 |
| 错误信息泄露防护 | 4 | sanitizeMessage 机制有效，但仍存在可改进的路径暴露 |
| HTTP 状态码恰当性 | 3.5 | 大部分正确，MxCadException 默认 HTTP 200 存在问题 |
| 日志记录 | 3.5 | 关键操作有日志覆盖，但存在敏感信息泄露风险和日志级别不统一 |
| 异步错误处理 | 3.5 | 大部分 Promise 正确处理，生产环境缺少全局兜底 |
| Prisma 异常处理 | 2.5 | 未发现 Prisma 错误码（P2002 等）的处理逻辑 |

**综合评分：3.4 / 5**

---

## 二、详细问题清单

### 问题 1：MxCadException 基类默认 HTTP 200 返回成功状态码

- **文件路径**: `src/mxcad/exceptions/mxcad.exception.ts:20-26`
- **严重程度**: 🔴 高
- **问题描述**: `MxCadException` 基类构造函数默认 `status = HttpStatus.OK`。这意味着所有子类异常（如 `MxCadParamException` 参数错误、`MxCadConvertException` 转换失败）在没有显式指定状态码时，都会返回 HTTP 200。这违反了 HTTP 语义——参数错误应返回 400，转换失败应返回 500。
- **代码片段**:
  ```typescript
  export class MxCadException extends HttpException {
    constructor(
      public readonly ret: string,
      message?: string,
      status: HttpStatus = HttpStatus.OK  // ← 问题：默认 200
    ) {
      super({ ret, message }, status);
    }
  }
  // MxCadParamException 继承后未设置 status，仍是 200
  export class MxCadParamException extends MxCadException {
    constructor(message: string = '参数错误') {
      super('errorparam', message);  // ← 未传 status，继承默认 200
    }
  }
  ```
- **修复建议**: 将基类默认值改为 `HttpStatus.INTERNAL_SERVER_ERROR`，各子类根据语义设定合理的状态码：`MxCadParamException` → 400，`MxCadConvertException` → 500，`MxCadFileExistsException` → 409。
- **是否需要用户确认**: 是——MxCAD App 客户端可能依赖 HTTP 200 + `ret` 字段来判断错误，修改状态码会影响客户端错误处理逻辑。

---

### 问题 2：UploadError 继承自 Error 而非 HttpException

- **文件路径**: `src/mxcad/errors/upload.error.ts:32`
- **严重程度**: 🔴 高
- **问题描述**: `UploadError` 类继承自 `Error`，而非 NestJS 的 `HttpException`。当此类异常被抛出时，全局 `GlobalExceptionFilter` 无法识别为 NestJS 异常，将进入通用 Error 处理分支，返回 500 Internal Server Error，丢失了具体错误码（如 `FILE_NOT_FOUND`、`PERMISSION_DENIED`）的语义。
- **代码片段**:
  ```typescript
  export class UploadError extends Error {  // ← 应继承 HttpException
    public readonly code: UploadErrorCode;
    public readonly details?: Record<string, unknown>;
    // ...
  }
  ```
- **修复建议**: 重建 `UploadError` 为 NestJS 的 `HttpException` 子类，在构造函数中将 `UploadErrorCode` 映射为适当的 HTTP 状态码（如 `FILE_NOT_FOUND`→404, `PERMISSION_DENIED`→403, `CONCURRENT_OPERATION`→409）。
- **是否需要用户确认**: 是——需要确认 `UploadError` 的抛出点和捕获点，确保改动不会破坏上下游逻辑。

---

### 问题 3：MxCadController 大量使用 @Res() 手动响应，绕过全局 ExceptionFilter

- **文件路径**: `src/mxcad/core/mxcad.controller.ts:334-449, 456-614, 679-693, 718-731, 740-828, 838-1133, 1285-1495`
- **严重程度**: 🟡 中
- **问题描述**: `MxCadController` 中有约 10+ 个方法使用 `@Res() res: Response` 并手动调用 `res.json()` 或 `res.status().json()`，返回格式为 `{ code: -1, message: '...' }`。这些方法的错误不会经过 `GlobalExceptionFilter` 统一处理，导致：
  1. 错误响应格式不一致（使用 `code: -1` 而非全局统一的 `code: 'INTERNAL_SERVER_ERROR'` 等字符串码）
  2. 不会经过 `sanitizeMessage` 敏感信息过滤
  3. 不会记录全局错误日志（虽然有 Controller 自己的 logger）
  4. 不会设置统一的 `timestamp` 字段
- **代码示例**:
  ```typescript
  // mxcad.controller.ts:447
  return res.json({ code: -1, message: result.ret || 'upload failed' });
  // mxcad.controller.ts:782
  return res.status(404).json({ code: -1, message: '文件不存在' });
  ```
- **修复建议**: 将手动响应替换为抛出 NestJS 标准异常（`throw new NotFoundException('文件不存在')`），让全局 ExceptionFilter 统一处理。如果必须保持 `@Res()` 模式（如文件流响应），至少将错误场景委托给异常抛出。
- **是否需要用户确认**: 是——涉及接口响应格式变更，需要与前端协调。

---

### 问题 4：25 处空 catch 块，异常被完全吞掉

- **文件路径**: 共 25 处（详见列表）
- **严重程度**: 🟡 中
- **问题描述**: 审查发现 25 处空 catch 块（`} catch { }` 或 `.catch(() => false)`），异常被完全吞掉。部分场景合理（如 JSON 解析失败降级、文件存在性检查），但也有部分场景应该至少记录日志。

**需关注的空 catch 列表**（标记为需改进）：

| 文件 | 行号 | 场景 | 是否合理 |
|------|------|------|---------|
| `users/users.service.ts` | 974 | 邮箱验证码校验失败返回 false | ⚠️ 应记录警告日志 |
| `file-system/services/project-member.service.ts` | 357 | 删除项目成员失败抛出 NotFoundException | ⚠️ Prisma 异常被吞掉，应判断具体错误码 |
| `file-system/project-member/project-member.service.ts` | 389 | 同上（重复代码） | ⚠️ 同上 |
| `auth/auth-facade.service.ts` | 413 | JWT verify 失败抛出 BadRequestException | ✅ 合规——有文档说明 |
| `auth/auth-facade.service.ts` | 488 | 同上 | ✅ 合规 |
| `conversion/format-converter.service.ts` | 254, 275 | JSON 解析失败使用 fallback | ✅ 合规——工具类方法 |
| `conversion/process-runner.service.ts` | 385 | JSON 行解析继续循环 | ✅ 合规——循环查找 |
| `storage/local-storage.provider.ts` | 187 | fileExists 返回 false | ⚠️ 应区分"不存在"和"权限错误" |
| `storage/local-storage.provider.ts` | 298 | directoryExists 返回 false | ⚠️ 同上 |
| `storage/storage-check.service.ts` | 55 | checkInLocal 返回 false | ⚠️ 同上 |
| `common/guards/require-project-permission.guard.ts` | 266 | 权限查找返回 null | ⚠️ 应记录异常日志 |
| `common/services/file-copy.service.ts` | 239 | fileExists 返回 false | ⚠️ 同上 |
| `version-control/version-control.service.ts` | 743 | JSON 解析失败使用原始消息 | ✅ 合规——注释说明 |
| `version-control/providers/svn-version-control.provider.ts` | 594 | 同上 | ✅ 合规 |
| `mxcad/conversion/file-conversion.service.ts` | 450 | JSON 解析失败继续处理 | ✅ 合规 |
| `mxcad/infra/linux-init.service.ts` | 216 | access 检查无执行权限 | ✅ 合规——环境检查 |
| `mxcad/infra/thumbnail-utils.ts` | 50 | 缩略图不存在尝试下一个格式 | ✅ 合规 |
| `mxcad/infra/thumbnail-generation.service.ts` | 109 | CAD 文件不存在返回错误 | ✅ 合规 |
| `runtime-config/runtime-config.service.ts` | 306 | JSON 解析失败返回原始值 | ✅ 合规——回退策略 |
| `auth/services/sms/providers/tencent.provider.ts` | 163 | 健康检查返回 false | ⚠️ 应记录警告 |
| `health/health.controller.ts` | 54, 61, 96, 105 | 健康检查降级 | ✅ 合规——健康检查 |
| `mxcad/upload/file-merge.service.ts` | 315, 734 | `.catch(() => false)` | ⚠️ 吞掉 Promise rejection |
| `file-system/services/file-download-export.service.ts` | 229, 292 | `.catch(() => false)` | ⚠️ 同上 |

- **修复建议**: 对标记为 ⚠️ 的空 catch 块，至少添加 `this.logger.warn()` 记录异常信息。对 `.catch(() => false)` 模式，添加错误日志。
- **是否需要用户确认**: 否

---

### 问题 5：全局 ExceptionFilter 的 getErrorCode 未覆盖所有常见状态码

- **文件路径**: `src/common/filters/exception.filter.ts:158-170`
- **严重程度**: 🟢 低
- **问题描述**: `getErrorCode` 方法只映射了 8 种 HTTP 状态码。缺少 413 (Payload Too Large)、415 (Unsupported Media Type)、429 (Too Many Requests) 等常见状态码的映射。
- **修复建议**: 补充缺失的常规状态码映射，同时可以考虑改为动态生成 code 字符串（如 `HTTP_${status}`）作为兜底。
- **是否需要用户确认**: 否

---

### 问题 6：缺少 Prisma 数据库异常处理 ✅ 已修复 (7b7957c3)

- **文件路径**: 所有使用 `prisma.*` 的服务文件
- **严重程度**: 🔴 高
- **修复状态**: ✅ 已修复 — commit `7b7957c3`: add global PrismaExceptionFilter to handle database constraint errors with meaningful HTTP responses (P0 security)
- **问题描述**: 搜索全代码库未发现任何 `PrismaClientKnownRequestError`、`P2002`、`P2003`、`P2014` 等 Prisma 特定错误码的处理逻辑。这意味着：
  1. 唯一约束冲突（P2002）不会转换为友好的 409 Conflict 响应
  2. 外键约束违反（P2003）不会转换为适当的业务错误
  3. 记录不存在（P2025）不会转换为 404
  4. 所有 Prisma 异常直接冒泡到全局 ExceptionFilter 作为 500 错误，丢失语义
- **修复建议**:
  1. 创建 `PrismaExceptionFilter` 或在 `GlobalExceptionFilter` 中增加对 `PrismaClientKnownRequestError` 的判断
  2. 映射常见错误码：
     - `P2002` (唯一约束冲突) → 409 Conflict
     - `P2003` (外键约束) → 400 Bad Request
     - `P2025` (记录不存在) → 404 Not Found
  3. 考虑在 `GlobalExceptionFilter.catch()` 的 HttpException 分支之前增加 `PrismaClientKnownRequestError` 分支
- **是否需要用户确认**: 否——但建议先在一个服务中试点，验证映射逻辑无误后再全局推广。

---

### 问题 7：生产环境缺少全局未处理 Promise rejection 和未捕获异常的兜底处理 ✅ 已修复 (eac7f418)

- **文件路径**: `src/main.ts`（缺失）; `src/test/setup.ts:50,53`（仅有空的测试处理器）
- **严重程度**: 🟡 中
- **修复状态**: ✅ 已修复 — commit `eac7f418`: main.ts 添加 unhandledRejection 全局兜底处理
- **问题描述**: 在生产入口文件 `main.ts` 中没有注册 `process.on('unhandledRejection', ...)` 和 `process.on('uncaughtException', ...)` 处理器。仅在测试文件 `setup.ts` 中注册了两个**空处理器**（什么都不做）。
  如果在运行时发生未捕获的 Promise rejection 或被 event emitter 抛出的异常未被捕获，Node.js 进程可能会因默认行为终止。
- **修复建议**: 在 `main.ts` 的 `bootstrap()` 函数开头注册以下处理器：
  ```typescript
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的 Promise Rejection', reason instanceof Error ? reason.stack : reason);
  });
  process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常', error.stack);
    process.exit(1); // 可选：取决于运维策略
  });
  ```
- **是否需要用户确认**: 是——是否需要 `process.exit(1)` 取决于运维部署策略（是否依赖 PM2/Docker 自动重启）。

---

### 问题 8：登录服务日志可能暴露用户账号信息

- **文件路径**: `src/auth/services/login.service.ts:48`
- **严重程度**: 🟢 低
- **问题描述**: 登录服务在 `this.logger.log(`用户登录尝试: ${account}`)` 中直接记录用户的登录账号（可能是邮箱或手机号）。这在日志中可能构成 PII（个人可识别信息）泄露风险。
- **修复建议**: 对登录账号进行脱敏处理：
  ```typescript
  const maskedAccount = account.includes('@')
    ? account.replace(/(.{2}).*(@.*)/, '$1***$2')  // 邮箱脱敏
    : account.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'); // 手机号脱敏
  this.logger.log(`用户登录尝试: ${maskedAccount}`);
  ```
- **是否需要用户确认**: 是——取决于隐私合规需求。

---

### 问题 9：部分 Controller 的 @ApiResponse 声明的状态码与实际返回不一致

- **文件路径**: `src/mxcad/core/mxcad.controller.ts:307-333, 457-483` 等多处
- **严重程度**: 🟢 低
- **问题描述**: `uploadExtReferenceDwg` 和 `uploadExtReferenceImage` 的 Swagger `@ApiResponse` 声明状态码包括 400、404、403，但实际方法中所有错误（包括参数验证失败、文件未找到、权限不足）都返回 `res.json({ code: -1, message: '...' })`，HTTP 状态码是 200。Swagger 文档与运行时行为不一致。
- **修复建议**: 统一错误响应方式——使用 `throw new BadRequestException()` 代替 `res.json()`，让 NestJS 和全局 ExceptionFilter 设置正确的状态码。
- **是否需要用户确认**: 参见问题 3。

---

### 问题 10：Controller 中使用 `handleFileRequest` 中 try-catch 内部抛出 NestJS 异常但被外层 catch 捕获丢失语义

- **文件路径**: `src/mxcad/core/mxcad.controller.ts:1285-1495`
- **严重程度**: 🟡 中
- **问题描述**: `handleFileRequest` 方法内层 try-catch 中抛出的 `NotFoundException`（第 1432-1434 行）和 catch 块抛出的异常（第 1437-1438 行）会被外层 catch（第 1486 行）捕获，并统一返回 "访问文件失败" 的 500 错误，丢失了 404/401 等精确语义。
- **代码片段**:
  ```typescript
  // 第 1436 行
  } catch (error) {
    this.logger.error(`获取存储文件信息失败: ${error.message}`, error);
    throw error;  // ← NotFoundException 被外层 catch 捕获变成 500
  }
  // 第 1486 行
  } catch (error) {
    this.logger.error(`访问文件失败: ${error.message}`, error);
    if (!res.headersSent) {
      res.status(500).json({ code: -1, message: '访问文件失败' });  // ← 所有异常变 500
    }
  }
  ```
- **修复建议**: 在外层 catch 中判断异常类型，对 `HttpException` 子类返回其对应的状态码，而非统一 500。
  ```typescript
  } catch (error) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const message = error instanceof HttpException ? error.message : '访问文件失败';
    this.logger.error(`访问文件失败: ${error.message}`, error);
    if (!res.headersSent) {
      res.status(status).json({ code: -1, message });
    }
  }
  ```
- **是否需要用户确认**: 否

---

## 三、良好实践（亮点）

1. **GlobalExceptionFilter 的敏感信息过滤机制**：`sanitizeMessage` 方法通过正则过滤了 Windows/Unix 路径、数据库连接字符串、环境变量等敏感信息，有效防止信息泄露。

2. **@Catch() 无参数装饰器**：`GlobalExceptionFilter` 使用 `@Catch()` 捕获所有异常类型，确保无遗漏。

3. **分级日志记录**：状态码 >= 500 使用 `logger.error`，其余使用 `logger.warn`，日志级别合理。

4. **统一响应拦截器**：`ResponseInterceptor` 将正常响应包装为 `{ code, message, data, timestamp }` 格式，保持 API 一致性。

5. **审计日志服务的容错处理**：`AuditLogService.log()` 方法（src/audit/audit-log.service.ts:74-78）捕获写入失败但不向上抛出，确保审计日志失败不影响主业务流程。

6. **LoginService 对用户状态的严格验证**：登录时检查 `user.status !== 'ACTIVE'`，对禁用用户返回 `ForbiddenException`，安全性良好。

7. **历史版本转换的并发控制**：`mxcad.controller.ts` 中使用 `historyConversionLocks` Map 防止同一版本的并发重复转换，设计合理。

8. **文件操作的异常与日志完整性**：`local-storage.provider.ts` 中所有 CRUD 操作都有 try-catch + 日志记录 + 异常重新抛出，覆盖全面。

---

## 四、总结表格

| # | 问题 | 文件路径:行号 | 严重程度 | 是否需要确认 |
|---|------|-------------|----------|------------|
| 1 | MxCadException 默认 HTTP 200 | `mxcad/exceptions/mxcad.exception.ts:20-26` | 🔴 高 | 是 |
| 2 | UploadError 继承 Error 而非 HttpException | `mxcad/errors/upload.error.ts:32` | 🔴 高 | 是 |
| 3 | MxCadController 手动响应绕过全局 Filter | `mxcad/core/mxcad.controller.ts` 多处 | 🟡 中 | 是 |
| 4 | 25 处空 catch 块吞掉异常 | 详见列表 | 🟡 中 | 否 |
| 5 | getErrorCode 未覆盖所有状态码 | `common/filters/exception.filter.ts:158-170` | 🟢 低 | 否 |
| 6 | 缺少 Prisma 数据库异常处理 | 所有 prisma 调用 | 🔴 高 | 否 |
| 7 | 生产环境缺少全局兜底处理 | `main.ts` | 🟡 中 | 是 |
| 8 | 登录日志可能暴露用户账号 | `auth/services/login.service.ts:48` | 🟢 低 | 是 |
| 9 | Swagger 状态码与运行时不一致 | `mxcad/core/mxcad.controller.ts` 多处 | 🟢 低 | 参见 #3 |
| 10 | handleFileRequest 嵌套 try-catch 丢失异常语义 | `mxcad/core/mxcad.controller.ts:1285-1495` | 🟡 中 | 否 |

---

## 五、优先修复建议

按优先级排序的修复路线图：

### 第一阶段（高优先级，建议本迭代修复）

1. **问题 6 - Prisma 异常处理**：在 `GlobalExceptionFilter` 中添加 `PrismaClientKnownRequestError` 处理分支，这是影响面最广的问题，当前所有 Prisma 异常都返回 500。

2. **问题 1 - MxCadException 默认状态码**：修改默认值为 500，子类设定合理状态码，但需与 MxCAD App 客户端同步验证。

3. **问题 2 - UploadError 继承体系**：重建为 HttpException 子类，确保上传错误语义不丢失。

### 第二阶段（中优先级，建议后续迭代修复）

4. **问题 3 - 统一错误响应格式**：逐步将 `@Res()` 手动响应迁移为标准异常抛出模式。

5. **问题 7 - 全局兜底处理**：在 main.ts 添加 unhandledRejection/uncaughtException 处理器。

6. **问题 10 - 嵌套 try-catch 修复**：修复 handleFileRequest 的错误语义丢失问题。

### 第三阶段（低优先级，持续改进）

7. **问题 4 - 空 catch 块补充日志**
8. **问题 5 - 完善状态码映射**
9. **问题 8 - 登录日志脱敏**
10. **问题 9 - Swagger 文档一致性**

---

> 审查工具: Grep/Glob/Read 静态分析
> 未修改任何代码文件
