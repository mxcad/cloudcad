# @cloudcad/contracts

跨包共享的 DI token + TypeScript 接口契约。

所有包（backend、impl-mx）通过此包解耦，不直接依赖对方。是 CloudCAD 可替换模块架构的基石。

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
│   └── token-blacklist.interface.ts  # Token 黑名单接口
├── dist/                        # 编译输出
├── package.json
└── tsconfig.json
```

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

- **只包含接口类型 + DI token**，不含实现代码
- **不依赖 NestJS 或其他框架** — 纯 TypeScript 类型包
- **`import type` 仅在运行时不需要的类型场景使用**
- 后端 DTO 类（含装饰器）与 contracts 类型通过结构类型兼容
- 新增可替换模块的接口，优先写入此包而非后端本地 `interfaces/`

## 许可证

本软件采用自定义开源许可证。详见项目根目录 LICENSE 文件。
