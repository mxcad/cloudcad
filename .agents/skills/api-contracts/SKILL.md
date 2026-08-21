---
name: api-contracts
description: API 契约 — 后端 DTO/Swagger → 前端 SDK 自动生成的工作流。触发条件：SDK 导出找不到（"has no exported member"）、DTO/Controller 修改导致 Swagger 输出变化、路由路径变更、请求/响应 body 结构变化、参数增减、前端报类型不匹配、generate:swagger 或 generate:api-types 执行后。Enforces backend-first fixes — never patch types in frontend.
---

# API 契约

```
🚨 核心原则： NEVER 在前端绕过类型。类型错了就是后端 DTO 缺装饰器，去修后端。
```

## 常见问题工作流

### 问题 1：`body?: never`

**SDK 类型出现 `body?: never` 但实际需要传 body = DTO 缺 `@ApiProperty`。**

```
→ 找到后端 DTO（packages/backend/src/*/dto/*.dto.ts）
→ 检查字段是否都有 @ApiProperty
  ├── 有 → 检查 Controller 是否用普通 import 而非 import type
  └── 无 → 补上 @ApiProperty 装饰器
→ 后端重启 + pnpm generate:api-types
→ 验证 body?: never 消失
```

**绝对禁止 `as any` 绕过**（multipart 场景除外：body 传**普通对象** + `as never`，禁止传原生 FormData）。

### 问题 2：SDK 函数名变更

**Controller 拆分/路由移动时，Swagger 用类名生成 operationId 导致函数名变化。**

```
旧: mxCadControllerCheckFileExist
新: mxcadUploadControllerCheckFileExist   ← 新类名前缀
```

**处理流程：** `pnpm generate:api-types` → 找出旧→新 mapping → 搜索全项目替换（两端 frontend + frontend_mobile + 测试 mock）→ `pnpm type-check`。

## SDK 使用规范

```typescript
// 所有 API 调用必须走 @/api-sdk 或 @cloudcad/api-sdk。禁止 fetch()
import { authControllerLogin } from '@/api-sdk';
import { client } from '@cloudcad/api-sdk/client.gen'; // 深导入走包路径
const { data } = await authControllerLogin({ body: { email, password } });

// 参数格式
await controllerFoo({ path: { id: 'xxx' }, query: { q: 1 }, body: { name: 'n' } });

// multipart 场景：body 传普通对象（SDK 的 formDataBodySerializer 自动序列化为 FormData）
// ⚠️ 禁止传原生 FormData — Object.entries(FormData) 返回 []，字段会全部丢失
await controllerBar({ path: { id }, body: { file, hash, targetType } as never });
```

**例外（可接受直接 URL）：** `.mxweb` 文件流、缩略图图片链接。

## 工作流总览

### 构建模式（`pnpm build`）

```
后端 DTO（@ApiProperty）→ Controller（普通 import，@ApiResponse type）
  → pnpm build → backend nest build → generate:swagger → swagger_json.json 更新
    → postbuild → pnpm generate:api-types → packages/api-sdk/ 重新生成
      → 前端 import from '@/api-sdk' 或 '@cloudcad/api-sdk'
```

### 开发模式（`pnpm dev`）— 全自动链路

```
DTO 改动
  → NestJS --watch 检测文件变更 → 自动重编译 + 重启
    → main.ts → syncSwaggerAndSdk(app)    [仅 NODE_ENV=development]
      → ① 写 swagger_json.json
      → ② triggerSdkGeneration() → node scripts/generate-sdk.cjs
        → @cloudcad/api-sdk 全量重建
          → Vite HMR（通过 resolve.alias 直接监听源文件）
            → 前端热更新，无需重启
```

> **注意**：Vite 不执行类型检查。SDK 自动重建后，**需要手动跑 `pnpm type-check`** 确认两端前端的类型正确性。建议在 DTO 改动完成后执行：
> ```
> pnpm --filter frontend type-check && pnpm --filter frontend_mobile type-check
> ```

### 手动模式（问题排查时）

```
后端 DTO（@ApiProperty）→ Controller（普通 import，@ApiResponse type）
  → 后端重启 → swagger_json.json 更新
    → pnpm generate:api-types → packages/api-sdk/ 重新生成
      → 前端 import from '@/api-sdk' 或 '@cloudcad/api-sdk'
```

> 完整参考：DTO/Controller 装饰器规范、测试 mock 模式、检查清单 → [REFERENCE.md](REFERENCE.md)
