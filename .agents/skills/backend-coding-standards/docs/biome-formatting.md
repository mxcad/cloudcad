# 后端格式化（Prettier）

> 全仓库统一使用 **Prettier**（根目录 `.prettierrc` 全局生效，后端无独立格式化配置）。

## 说明

后端**不使用 Biome**。历史上曾存在 `biome.json` 僵尸配置（未安装依赖、未接入脚本/CI），已删除。全仓（根目录、后端、前端）统一走 Prettier。

## 格式化命令

```bash
pnpm lint         # ESLint 检查
pnpm format       # Prettier 格式化（pnpm prettier --write .）
pnpm format:check # Prettier 检查（pnpm prettier --check .）
pnpm check:fix    # ESLint fix + Prettier format + type-check
```

## 陷阱

| 场景 | 问题 | 检查方法 |
|------|------|----------|
| 手动运行 `biome` | 无此工具（未安装），且 `organizeImports` 会把 DI 类改为 `import type` → 运行时失败 | 不要引入 Biome；一律用 Prettier |
| AI 手写 `import type` | DI 类变为 `import type` → 运行时失败 | grep `import type.*Service`，检查所有新 import 语句 |
