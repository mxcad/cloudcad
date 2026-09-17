# Contracts

跨包共享的 DI token + TypeScript 接口契约 + 纯函数式契约。所有包（backend、impl-mx、conversion-service）通过此包解耦，不直接依赖对方。

## Language

**DI Token**:
NestJS 注入令牌字符串常量（`DB`、`CONFIG`、`MEMBERSHIP_SERVICE` 等）。定义在 `src/tokens.ts` 中，通过 `src/index.ts` 统一导出。
_Avoid_: 硬编码字符串、魔法字符串

**Interface**:
TypeScript 接口类型（`IDatabaseService`、`IMembershipService`、`IRuntimeConfigService` 等），定义依赖的形状但不含实现。
_Avoid_: 抽象类、具体类型

**Pure Function Contract（纯函数式契约）**:
无 IO、无框架 import、无副作用的纯函数 + 纯常量，与接口并列入包（准入四条与逃逸口见 ADR-0069）。首个实例是 `src/conversion/mxcad-engine-contract.ts`：mxcad 两级参数契约的唯一实现，`ENGINE_INPUT_FIELDS`（唯一字段清单）、`CONTENT_KEY_FIELDS`（`= ENGINE_INPUT_FIELDS − outpath`，派生不手写）、`buildEngineParams`（camelCase → lowercase 唯一翻译点）、`parseEngineOutput`（引擎 stdout 解析，要求 `code` 为 number）。`backend` 与 `conversion-service` 共同消费。
_Avoid_: 工具函数包、共享 utils、把业务实现搬进 contracts

## Package Structure

```
packages/contracts/
├── src/
│   ├── index.ts              # 统一导出
│   ├── tokens.ts             # DI token 常量
│   ├── database.interface.ts
│   ├── membership.interface.ts
│   ├── config.interface.ts
│   ├── auth-token.interface.ts
│   ├── email.interface.ts
│   ├── sms.interface.ts
│   ├── conversion/
│   │   └── mxcad-engine-contract.ts   # 两级参数契约（纯函数）
│   └── token-blacklist.interface.ts
├── scripts/
│   └── scan-purity.js        # 纯度门禁（pnpm scan:purity）
├── package.json
└── tsconfig.json
```

## Rules

- 只包含契约：接口类型 + DI token + 纯函数式契约（无 IO / 无框架 / 无副作用），不含业务实现类
- 不依赖 NestJS 或其他框架；禁止 `node:*`、`reflect-metadata`、`class-validator`、`class-transformer`
- `import type` 仅在运行时不需要的类型场景使用
- 改动 `src/` 后跑 `pnpm scan:purity`
