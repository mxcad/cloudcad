# @cloudcad/api-sdk

CloudCAD API SDK — 由后端 Swagger/OpenAPI 规范自动生成的 HTTP 客户端与 DTO 类型。

## 技术栈

| 技术 | 说明 |
|------|------|
| @hey-api/openapi-ts | OpenAPI → TypeScript 代码生成器 |
| @hey-api/client-fetch | 基于 Fetch API 的 HTTP 客户端 |

## 目录结构

```
packages/api-sdk/
├── src/
│   ├── index.ts              # 统一导出入口
│   ├── client.gen.ts         # HTTP 客户端实例（自动生成）
│   ├── sdk.gen.ts            # API 调用方法（自动生成）
│   ├── types.gen.ts          # DTO 类型定义（自动生成）
│   ├── client/               # 自定义客户端扩展
│   └── core/                 # 核心工具函数
├── scripts/
│   └── generate-sdk.cjs      # SDK 生成脚本
├── openapi-ts.config.ts      # @hey-api/openapi-ts 配置
├── package.json
└── tsconfig.json
```

## 生成 SDK

```bash
# 后端构建时会生成 swagger_json.json
# 然后运行 SDK 生成
pnpm generate:sdk
```

SDK 生成流程：

1. 后端 `pnpm build` → `swagger_json.json`（项目根目录）
2. `pnpm generate:sdk` → `@hey-api/openapi-ts` 读取 OpenAPI 规范
3. 输出到 `src/` — 生成 `client.gen.ts`、`sdk.gen.ts`、`types.gen.ts`

## 使用方式

```typescript
// 前端/移动端通过桥接层导入
import { client } from '@cloudcad/api-sdk/client';
import { getProjects, listFiles } from '@cloudcad/api-sdk/sdk.gen';
```

### 调用 API

```typescript
const { data, error } = await getProjects({
  query: { page: 1, pageSize: 20 },
});

// 或使用 client 直接请求
const res = await client.get('/api/v1/projects');
```

### multipart 上传

```typescript
import { uploadFile } from '@cloudcad/api-sdk/sdk.gen';

// 传普通对象（SDK 的 formDataBodySerializer 自动序列化为 FormData，file 可为 Blob/File）
// ⚠️ 禁止传原生 FormData：Object.entries(FormData) 返回 []，所有字段会被静默丢弃
const { data } = await uploadFile({
  body: { file, hash, nodeId } as never,
});
```

## 注意事项

- **勿手动编辑 `.gen.ts` 文件** — 修改后端 DTO 后重新生成即可
- 后端路由/DTO 变更 → `pnpm generate:api-types`（根目录） → 前端类型自动更新
- 前端通过 `src/api-sdk/index.ts` 桥接导出，不直接引用 `.gen.ts`
- 前端使用 Vite HMR 插件 `@cloudcad/api-sdk/vite-plugin` 实现 SDK 变更自动热重载

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
