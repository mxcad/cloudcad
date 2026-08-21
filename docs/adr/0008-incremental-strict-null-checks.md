# 增量开启 strictNullChecks
**Status**: accepted

后端 `strictNullChecks: false` 导致大量运行时空指针异常无法在编译期捕获。全项目一次性开启会产生数千个类型错误，无法短时间修复。采用增量策略：新模块/接口目录下单独启用，旧模块分批治理。

**Details**（来自资料")

- TypeScript 官方：`strictNullChecks: true` 强制处理 null/undefined，是减少生产环境运行时错误最有效的单一选项
- NestJS CLI 默认 `false`，但 `nest new --strict` 会开启；社区主流推荐开启
- 真实案例：15000 行项目分 3 周从 847 错误减到 0

**Migration plan**

1. **Phase 1**：新接口文件目录（`auth/interfaces/`、`common/interfaces/`）单独开启。通过 ESLint `overrides` 对 `interfaces/` 目录施加严格规则
2. **Phase 2**：AuthModule 改造时，在其目录下创建独立 `tsconfig.json` 覆盖 `strictNullChecks: true`
3. **Phase 3**：每改造一个模块就开启该模块目录的 strictNullChecks
4. **Phase 4**：当 Layer 2 核心业务模块全部完成时，全项目开启

**Status**: accepted
