# Contracts

跨包共享的 DI token + TypeScript 接口契约。所有包（backend、impl-mx）通过此包解耦，不直接依赖对方。

## Language

**DI Token**:
NestJS 注入令牌字符串常量（`DB`、`CONFIG`、`MEMBERSHIP_SERVICE` 等）。定义在 `src/tokens.ts` 中，通过 `src/index.ts` 统一导出。
_Avoid_: 硬编码字符串、魔法字符串

**Interface**:
TypeScript 接口类型（`IDatabaseService`、`IMembershipService`、`IRuntimeConfigService` 等），定义依赖的形状但不含实现。
_Avoid_: 抽象类、具体类型

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
│   └── token-blacklist.interface.ts
├── package.json
└── tsconfig.json
```

## Rules

- 只包含接口类型 + DI token，不含实现代码
- 不依赖 NestJS 或其他框架
- `import type` 仅在运行时不需要的类型场景使用
