# @cloudcad/contracts

跨包共享的 DI token + TypeScript 接口契约 + 纯函数式契约（ADR-0069）。

所有包（backend、impl-mx、conversion-service）通过此包解耦，不直接依赖对方。是 CloudCAD 可替换模块架构的基石。

## 目录结构

```
packages/contracts/
├── src/
│   ├── index.ts                 # 统一导出
│   ├── tokens.ts                # DI token 常量
│   ├── database.interface.ts    # 数据库服务接口
│   ├── membership.interface.ts  # 会员服务接口
│   ├── config.interface.ts      # 配置服务接口
│   ├── auth-token.interface.ts  # 认证令牌接口
│   ├── email.interface.ts       # 邮件服务接口
│   ├── sms.interface.ts         # 短信服务接口
│   ├── conversion/
│   │   └── mxcad-engine-contract.ts  # mxcad 两级参数契约（纯函数，见下）
│   └── token-blacklist.interface.ts  # Token 黑名单接口
├── scripts/
│   └── scan-purity.js           # 纯度门禁（pnpm scan:purity）
├── dist/                        # 编译输出
├── package.json
└── tsconfig.json
```

## 纯函数式契约（ADR-0069）

`src/conversion/mxcad-engine-contract.ts` 是首个非接口契约：mxcad 两级参数契约（ADR-0064）的**唯一实现**，由 `backend` 与 `conversion-service` 共同消费。

| 导出 | 说明 |
|------|------|
| `ENGINE_INPUT_FIELDS` | 引擎输入字段全集（camelCase），唯一字段清单 |
| `CONTENT_KEY_FIELDS` | `= ENGINE_INPUT_FIELDS − outpath`，内容身份派生字段集（**派生**，禁止手写第二份） |
| `buildEngineParams` | camelCase 请求 → lowercase 引擎参数（唯一的命名翻译点） |
| `parseEngineOutput` | 引擎原始 stdout → `{ code, message, newpath, ... }`（要求 `code` 为 number） |
| `ConversionRequest` / `MxCadEngineParams` / `MxCadConversionResult` | 两级形状类型 |

准入四条与逃逸口见 ADR-0069；改动 src/ 后必须跑 `pnpm scan:purity`。

## DI Token

所有 token 统一在 `src/tokens.ts` 定义，按层级分组：

| 层级 | Token | 接口 | 说明 |
|------|-------|------|------|
| 基础设施 | `DB` | `IDatabaseService` | 数据库服务 |
| 基础设施 | `CONFIG` | `IRuntimeConfigService` | 运行时配置 |
| 基础设施 | `EMAIL` | `IEmailVerificationService` | 邮件验证 |
| 基础设施 | `SMS` | `ISmsVerificationService` | 短信验证 |
| 基础设施 | `TOKEN_BLACKLIST` | `ITokenBlacklistService` | Token 黑名单 |
| 业务服务 | `MEMBERSHIP_SERVICE` | `IMembershipService` | 会员服务 |
| 领域仓库 | `USER_REPOSITORY` | `IUserRepository` | 用户仓库 |

## 使用方式

### 定义接口（contracts）

```typescript
// src/database.interface.ts
export interface IDatabaseService {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<unknown>;
  // ...
}
```

### 注册 Token

```typescript
// src/tokens.ts
export const DB = 'DB';
export const CONFIG = 'CONFIG';
```

### 实现接口（backend / impl-mx）

```typescript
import { IDatabaseService } from '@cloudcad/contracts';

export class DatabaseService implements IDatabaseService {
  // ...
}
```

### 注入使用（backend）

```typescript
import { Inject } from '@nestjs/common';
import { DB } from '@cloudcad/contracts';
import type { IDatabaseService } from '@cloudcad/contracts';

export class SomeService {
  constructor(@Inject(DB) private readonly db: IDatabaseService) {}
}
```

## 规则

- **只包含契约**：DI token 常量 + TypeScript 接口类型 + **纯函数式契约**（无 IO / 无框架 / 无副作用），不含业务实现类（准入四条与逃逸口见 ADR-0069）
- **不依赖 NestJS 或其他框架** — 纯 TypeScript；禁止 `node:*`、`reflect-metadata`、`class-validator`、`class-transformer`
- **`import type` 仅在运行时不需要的类型场景使用**
- 后端 DTO 类（含装饰器）与 contracts 类型通过结构类型兼容
- 新增可替换模块的接口，优先写入此包而非后端本地 `interfaces/`
- 改动 `src/` 后跑 `pnpm scan:purity`（`scripts/scan-purity.js`），确认无 IO / 无框架 / 无副作用

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
