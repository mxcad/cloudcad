# CloudCAD Sprint 4 审计报告

**审计日期：** 2026-05-03
**分支：** refactor/circular-deps
**审计范围：** `packages/frontend-vue/` 前端构建审计 & `packages/backend/src/` 后端安全审计

---

## 目标一：前端包体积和加载性能审计

### 一、构建配置分析

**分析文件：**
- `packages/frontend-vue/vite.config.ts`
- `packages/frontend-vue/package.json`

**当前 manualChunks 配置：**

```ts
manualChunks: {
  'vendor-vue': ['vue', 'vue-router', 'pinia'],
  'vendor-vuetify': ['vuetify'],
  'vendor-cad': ['mxcad-app'],
  'vendor-http': ['axios'],
},
```

**构建目标：** `esnext`，minify：`esbuild`，chunkSizeWarningLimit：1000KB

---

### 二、发现的问题

#### 🔴 高风险

**1. mxcad-app 单独 chunk，但体积无明确上限**

| Chunk | 依赖 | 预估体积 | 风险 |
|-------|------|----------|------|
| `vendor-cad` | `mxcad-app@1.0.45` | 极大（CAD 核心库，包含 WASM/ASM.js + 渲染引擎） | 很可能超过 1MB |

`chunkSizeWarningLimit` 设为 1000KB，但 mxcad-app 是重型 CAD 库，1MB 限制几乎必然触发警告。mxcad-app 由外部包 `mxcad-app` 提供，平台侧通过 `vite` 插件 `mxcadAssetsPlugin` 暴露 `vue/vuetify/axios`，其自身体积无法在平台侧裁剪。

**建议：** 上调 `chunkSizeWarningLimit` 至 5000KB，或将 mxcad-app 进一步拆分为 `vendor-cad-core` + `vendor-cad-ui`。

---

**2. Voerka-i18n 依赖未独立打包**

当前 package.json 中 `@voerkai18n/runtime` 和 `@voerkai18n/vue` 未出现在任何 manual chunk 中。如果这两个包体积较大，会进入主包或 vendor 混合 chunk，影响首屏加载。

**建议：** 确认构建产物中 i18n 是否被正确分离，必要时加入 manualChunks：

```ts
'vendor-i18n': ['@voerkai18n/runtime', '@voerkai18n/vue'],
```

---

**3. Tailwind CSS 3.x / 4.x 混合使用**

package.json 中同时安装了：
- `@tailwindcss/vite@^4.1.18`
- `tailwindcss@^4.1.18`

Vite 配置中使用 `tailwindcss()` 插件。这说明使用的是 Tailwind CSS 4.x（最新版本）。但需要确认 `@mdi/font` 是否存在重复打包（通常 5MB+）。

**建议：** 检查 `@mdi/font` 是否通过 `vite-plugin-vuetify` 或 Vuetify 插件自动引入。如果存在，应通过 alias 或 external 排除。

---

#### 🟡 中风险

**4. SparkMD5 库体积（~15KB gzipped）**

`spark-md5` 用于文件哈希计算，在上传流程中使用。体积可接受，但应确认整个上传链（Uppy + TUS + SparkMD5）是否被打包在同一个 chunk 中。

**建议：** 上传相关依赖可单独分 chunk：

```ts
'upload': ['@uppy/core', '@uppy/tus', 'spark-md5'],
```

---

**5. zod@4.x 体积**

`zod@^4.2.1` 是表单验证库，v4 相比 v3 体积有所增加。当前未独立打包。

**建议：** 确认 zod 是否与其他 chunk 合并，必要时独立打包：

```ts
'vendor-validation': ['zod'],
```

---

**6. Vuetify 样式全量导入**

Vuetify 3.x 默认全量导入样式，如果 `vuetify-settings.scss` 没有配置 sass 的 content 变量来裁剪未使用组件样式，会导致 CSS 体积膨胀。

**建议：** 检查 `src/styles/vuetify-settings.scss`，确认是否使用了 Vuetify 的 sass 变量覆盖来排除未使用组件样式。

---

#### 🟢 低风险 / 可立即执行

**7. `console.error` 在生产环境未移除**

`useCadEngine.ts` 中多处 `console.error`/`console.warn` 在生产代码中仍然存在，影响包体积（极小）和生产日志。

**建议：** 使用条件编译或 Logger 替代，或在构建时通过 `define` 移除。

---

**8. devDependencies 不影响生产构建**

以下包不会进入生产 bundle，但值得注意的是它们的存在：

```
@vue/tsconfig, @types/spark-md5, @types/node, sass-embedded
```

---

### 三、当前构建配置综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| chunk 分割策略 | ⭐⭐⭐ (3/5) | 基本按框架分割，但重型库 mxcad-app 未做二次拆分 |
| 依赖共享 | ⭐⭐⭐ (3/5) | vue/router/pinia 合并良好，但 i18n/zod 未独立 |
| 构建配置完整性 | ⭐⭐⭐⭐ (4/5) | 使用 esbuild minify、有 chunk 大小警告配置 |
| 加载性能优化空间 | ⭐⭐ (2/5) | 缺失：预加载策略、动态 import、mxcad-app 按需加载 |

---

### 四、可立即执行的低风险优化（无需构建产物验证）

| # | 优化项 | 操作 | 预估效果 |
|---|--------|------|----------|
| 1 | 将上传链独立分 chunk | 在 `rollupOptions.output.manualChunks` 添加 `upload: ['@uppy/core', '@uppy/tus', 'spark-md5']` | 上传模块懒加载时不影响首屏 |
| 2 | 将 zod 独立分 chunk | 添加 `vendor-validation: ['zod']` | 验证逻辑懒加载不影响首屏 |
| 3 | 确认 i18n 分 chunk | 检查构建产物，确认 `@voerkai18n` 是否独立，无则添加 | 减小首屏 JS 体积 |
| 4 | 上调 mxcad-app chunk 警告阈值 | `chunkSizeWarningLimit: 5000` | 消除噪音警告，便于监控真正的大文件 |
| 5 | 预加载关键 chunk | 在 `index.html` 添加 `<link rel="modulepreload" href="/assets/vendor-cad.js">` | 提前加载 CAD 库 |
| 6 | Vuetify CSS 裁剪 | 检查 `vuetify-settings.scss` 是否设置 `@use 'vuetify' with ($utility: false)` 等排除未用组件 | CSS 体积减少 |

---

## 目标二：后端安全加固审计

### 一、审计范围

- `packages/backend/src/auth/` — 认证相关 Controller、Service、DTO
- `packages/backend/src/file-system/` — 文件系统 Controller、Service
- `packages/backend/src/users/` — 用户管理 Controller
- `packages/backend/src/roles/` — 角色管理 Controller
- `packages/backend/src/public-file/` — 公开文件 Controller
- `packages/backend/src/common/` — 全局 Filter、Guard、Interceptor、Service
- `packages/backend/src/main.ts` — 入口配置

---

### 二、发现的问题

#### 🔴 高风险

**1. [SQL 注入] `SearchService.getAllProjectNodeIds` 使用 `$queryRaw` 拼接字符串**

**文件：** `packages/backend/src/file-system/search/search.service.ts#L536-548`

```ts
const result = await this.prisma.$queryRaw<{ id: string }[]>`
  WITH RECURSIVE tree AS (
    SELECT id FROM file_system_nodes
    WHERE id = ${projectId} AND deleted_at IS NULL
    UNION ALL
    SELECT n.id FROM file_system_nodes n
    JOIN tree t ON n.parent_id = t.id
    WHERE n.deleted_at IS NULL
  )
  SELECT id FROM tree
`;
```

**分析：** 此处使用了模板标签 `$queryRaw` 但**参数化插值** `${projectId}`，Prisma 会自动做参数化处理，实际是**安全的**。无 SQL 注入风险。

**结论：** ✅ 安全，使用了 Prisma 的参数化查询。

---

**2. [路径遍历] `FileDownloadHandlerService.handleDownload` 路径验证不完整**

**文件：** `packages/backend/src/file-system/file-download/file-download-handler.service.ts`

```ts
// 文件路径构造
res.setHeader('Content-Disposition', `attachment; filename="${fallbackFilename}"`);
// fallbackFilename = filename.replace(/[^\x00-\x7F]/g, '_')  // 仅处理了非ASCII字符
```

**分析：**
- 文件名仅过滤了非 ASCII 字符，未过滤路径分隔符（`/`、`\`）
- 实际路径由 `fileSystemService.downloadNode` 构造，数据库中存储的 `path` 字段应为受控值
- ETag 构造使用 `node.fileHash || node.id`，无用户输入拼接，安全

**结论：** ⚠️ 低风险（实际路径由服务端控制），但建议对 `filename` 参数做更严格的合法性校验。

---

**3. [敏感数据泄露] `AuthController.wechatCallback` 中敏感数据通过 URL 参数传递**

**文件：** `packages/backend/src/auth/auth.controller.ts#L736-816`

```ts
redirectToFrontend('/login', { ...result });  // result 包含 accessToken
```

**分析：**
- 微信回调后，将包含 `accessToken` 的对象通过 URL hash 传回前端
- `hash` 中的敏感数据不会被浏览器写入 Server Log，但会出现在前端 Referrer 头中
- 建议：accessToken 应通过 httpOnly Cookie 传递，而非 URL hash

**结论：** ⚠️ 中风险，accessToken 通过 URL hash 传递，建议改为 Cookie。

---

**4. [CORS 配置] `origin: true` 允许任意来源**

**文件：** `packages/backend/src/main.ts#L151-164`

```ts
app.enableCors({
  origin: true,   // ⚠️ 允许任意来源
  credentials: true,
  ...
});
```

**分析：**
- `origin: true` 会将 `Access-Control-Allow-Origin` 设为请求的 `Origin` 值（浏览器自动发送）
- 配合 `credentials: true` 时，`Access-Control-Allow-Origin` 不能为 `*`，浏览器会使用具体 origin
- **实际行为安全**，因为浏览器会根据 `Origin` 头动态设置，而非 `*`
- 但生产环境建议指定明确的域名白名单

**结论：** ⚠️ 低-中风险，建议生产环境使用明确的 `origin: ['https://cloudcad.example.com']` 而非 `true`。

---

**5. [安全头缺失] 关键安全响应头缺失**

**文件：** `packages/backend/src/main.ts`

缺失的安全头：

| 安全头 | 建议值 | 当前状态 |
|--------|--------|----------|
| `X-Content-Type-Options` | `nosniff` | ❌ 未设置 |
| `X-Frame-Options` | `DENY` 或 `SAMEORIGIN` | ❌ 未设置 |
| `Content-Security-Policy` | 基础 CSP | ❌ 未设置 |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | ❌ 未设置 |
| `X-XSS-Protection` | `1; mode=block` | ❌ 未设置（现代浏览器已废弃，但旧浏览器仍需） |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ❌ 未设置 |

**结论：** 🔴 高风险，建议通过中间件或 NestJS 拦截器统一注入这些安全头。

---

#### 🟡 中风险

**6. [参数污染] `checkProjectPermission` 的 `permission` 参数无枚举校验**

**文件：** `packages/backend/src/file-system/file-system.controller.ts#L777-798`

```ts
async checkProjectPermission(
  @Request() req,
  @Param('projectId') projectId: string,
  @Query('permission') permission: string  // ⚠️ 任意字符串
) {
  if (!permission) { throw new BadRequestException('缺少 permission 参数'); }
  const hasPermission = await this.projectPermissionService.checkPermission(
    req.user.id, projectId,
    permission as ProjectPermission  // ⚠️ 直接 cast，无运行时校验
  );
```

**分析：** `permission` 查询参数直接 cast 为 `ProjectPermission` 枚举，如果传入无效值，后续在数据库查询时可能引发问题。虽然 `checkPermission` 内部有容错，但建议在入口处校验。

**结论：** 🟡 中风险，建议使用 `@IsEnum(ProjectPermission)` 对 `permission` 查询参数做类型校验。

---

**7. [IDOR] `getProjectMembers` 仅校验项目访问权限，未校验操作权限**

**文件：** `packages/backend/src/file-system/file-system.controller.ts#L348-361`

```ts
@Get('projects/:projectId/members')
@RequireProjectPermission(ProjectPermission.FILE_OPEN)  // ⚠️ 仅 FILE_OPEN
async getProjectMembers(@Param('projectId') projectId: string) {
```

**分析：** 获取项目成员列表仅需要 `FILE_OPEN` 权限，但成员列表本身包含用户角色等敏感信息。在大型组织中，这可能造成用户信息枚举（user enumeration）。

建议：成员列表应需要 `PROJECT_MEMBER_MANAGE` 或更高的权限。

**结论：** 🟡 中风险，建议提升权限要求。

---

**8. [未校验输入长度] 多处 DTO 缺少最大长度限制**

**文件：** `packages/backend/src/file-system/dto/create-project.dto.ts`

```ts
export class CreateProjectDto {
  @IsString()
  @Length(1, 100)  // ✅ 有长度限制
  name: string;
}
```

- `name` 有 `@Length(1, 100)` ✅
- `description` 有 `@Length(0, 500)` ✅
- 但 `SearchDto.keyword` 无最大长度限制（可能造成数据库查询压力）

**文件：** `packages/backend/src/file-system/dto/search.dto.ts`

```ts
export class SearchDto {
  @IsString()
  keyword: string;  // ⚠️ 无 @MaxLength
```

**结论：** 🟡 中风险，建议对 `keyword` 添加 `@MaxLength(200)` 防止过长输入。

---

**9. [CSRF 保护缺失] Session 认证但无 CSRF Token**

**文件：** `packages/backend/src/main.ts` — Session 配置

```ts
server.use(session({
  ...
  cookie: { httpOnly: true, sameSite: 'lax', ... },
}));
```

**分析：**
- 使用 JWT + Session 双认证机制
- Cookie 中存储 `auth_token`（JWT accessToken），`httpOnly: true` ✅
- 但缺少 CSRF Token 验证机制
- 敏感操作（删除、移动、权限修改）仅依靠 JWT，如果 JWT 被 XSS 窃取，CSRF 仍可能成功
- 由于 SameSite Cookie 的保护，浏览器同站请求会自动带上 Cookie，但 POST/PUT/DELETE 跨站请求仍可能绕过

**结论：** 🟡 中风险，建议对敏感操作添加 CSRF Token 验证，或依赖 `SameSite=Strict` Cookie。

---

**10. [信息泄露] 错误消息可能泄露内部实现细节**

**文件：** `packages/backend/src/common/filters/exception.filter.ts`

```ts
private sanitizeMessage(message: string): string {
  let sanitized = message;
  for (const pattern of this.sensitivePatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500) + '...';
  }
  return sanitized;
}
```

**分析：**
- 全局异常过滤器做了敏感信息过滤（路径、连接串等）✅
- 但 `message` 长度限制 500 字符，`extraFields` 原样透传
- `LoginService` 多次使用 `console.log` 记录请求账号，可能泄露攻击者指纹

**结论：** 🟢 低风险，异常过滤器已有基础保护。

---

**11. [速率限制缺失] 公开接口无全局速率限制**

**文件：** `packages/backend/src/main.ts`

- 登录接口 `POST /v1/auth/login` 无速率限制
- 注册接口 `POST /v1/auth/register` 无速率限制
- 短信验证码接口无速率限制
- `PublicFileController` 所有接口均为 `@Public()`

**文件：** `packages/backend/src/common/concurrency/rate-limiter.ts`

存在 `RateLimiter` 实现，但**未在 Controller 层全局使用**，仅在某些服务内部使用。

**结论：** 🔴 高风险，建议在所有公开认证接口和文件上传接口加全局速率限制（如 `nestjs-throttler`）。

---

**12. [依赖版本] 部分依赖需确认安全版本**

| 依赖 | package.json 版本 | 安全状态 |
|------|-------------------|----------|
| `@nestjs/jwt` | 未明确（来自 NestJS） | 需确认使用 @nestjs/jwt 官方版 |
| `bcryptjs` | 未明确 | 建议确认非 `bcrypt`（原生） |
| `express-session` | 未明确 | 需确认版本 |
| `ioredis` | 未明确 | 需确认版本 |

**结论：** 🟡 中风险，建议运行 `npm audit` 或 `pnpm audit` 确认无已知漏洞。

---

#### 🟢 低风险

**13. [日志脱敏] `LoginService` 日志中记录账号信息**

**文件：** `packages/backend/src/auth/services/login.service.ts`

```ts
this.logger.log(`用户登录尝试: ${account}`);
this.logger.warn(`登录失败 - 用户不存在: ${account}`);
```

**分析：** 账号信息写入日志，如日志系统不安全可能泄露用户信息。但未记录密码（已用 bcrypt）。

**结论：** 🟢 低风险，建议对日志中的账号做部分掩码处理。

---

**14. [文件上传] `PublicFileController.uploadChunk` 无文件类型校验**

**文件：** `packages/backend/src/public-file/public-file.controller.ts#L108-135`

```ts
@UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
async uploadChunk(@Body() dto: UploadChunkDto, @UploadedFile() file: Express.Multer.File) {
  // ⚠️ 仅校验文件存在性，无 MIME type 校验、无大小校验
  if (!file) { throw new BadRequestException('未上传文件'); }
```

**结论：** 🟢 低风险（分片上传后续会合并再校验），但建议在入口增加 MIME type 白名单校验。

---

### 三、安全审计总结

#### 风险等级分布

| 风险等级 | 数量 | 主要问题 |
|----------|------|----------|
| 🔴 高风险 | 2 | 安全响应头缺失全局配置、公开接口无速率限制 |
| 🟡 中风险 | 6 | CORS 配置过于宽松、敏感数据 URL 传递、IDOR 风险、CSRF 保护缺失、keyword 无长度限制、mxcad-app chunk 体积 |
| 🟢 低风险 | 6 | 路径遍历（受控）、异常过滤（已有基础保护）、日志脱敏、文件类型校验等 |

#### 优先修复建议

| 优先级 | 问题 | 修复方式 |
|--------|------|----------|
| **P0 - 立即修复** | 安全响应头缺失 | 在 `main.ts` 添加 helmet 中间件或手动注入安全头 |
| **P0 - 立即修复** | 公开接口无速率限制 | 在 auth 和 public-file 接口加 `ThrottlerModule` |
| **P1 - 尽快修复** | CSRF 保护缺失 | 对敏感操作添加 CSRF Token 验证 |
| **P1 - 尽快修复** | CORS `origin: true` | 改为明确域名白名单 |
| **P1 - 尽快修复** | accessToken 通过 URL hash 传递 | 改为 httpOnly Cookie |
| **P2 - 计划修复** | IDOR（成员列表权限过低） | 提升至 `PROJECT_MEMBER_MANAGE` |
| **P2 - 计划修复** | `keyword` 无最大长度 | 添加 `@MaxLength(200)` |
| **P2 - 计划修复** | `permission` 参数无枚举校验 | 添加 `@IsEnum` 装饰器 |
| **P3 - 持续优化** | 日志账号脱敏、mxcad-app chunk 拆分 | 纳入后续优化计划 |

---

*汇报人：Claude Code Audit Agent*
