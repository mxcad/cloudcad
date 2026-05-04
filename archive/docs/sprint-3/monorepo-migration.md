# Monorepo 骨架迁移

**日期:** 2026-05-02
**分支:** refactor/circular-deps
**目的:** 将项目从平坦的 `packages/*` 结构转换为标准的 pnpm workspace monorepo 结构，区分 packages（应用）和 packages（库）。

---

## 变更概览

### 目录结构变化

```
cloudcad/
├── packages/                      ← 新增
│   ├── backend/               ← 从 packages/backend/ 迁移
│   └── frontend/              ← 从 packages/frontend/ 迁移
├── packages/
│   ├── config-service/        ← 不动
│   ├── conversion-engine/     ← 新增（骨架，保留在 packages/）
│   ├── server-tasks/          ← 不动
│   └── svnVersionTool/        ← 不动
├── vendor/                    ← 不动
└── ...
```

### 设计原则

| 层级 | 目录 | 内容 |
|---|---|---|
| **packages/** | 可部署应用 | `backend` (NestJS API)、`frontend` (React SPA) |
| **packages/** | 内部库/工具 | `conversion-engine`、`config-service`、`svnVersionTool`、`server-tasks` |
| **vendor/** | 第三方离线资源 | 保持不变 |

---

## 已执行的工作

### 1. 更新 workspace 配置

**`pnpm-workspace.yaml`** — 添加 `packages/*` 匹配模式：

```yaml
packages:
  - 'packages/*'
  - 'packages/*'
```

### 2. 移动应用目录

| 原路径 | 新路径 | 方式 |
|---|---|---|
| `packages/backend/` | `packages/backend/` | robocopy /MOVE |
| `packages/frontend/` | `packages/frontend/` | mv |

### 3. 更新 tsconfig extends 路径

`extends: "../../tsconfig.json"` 保持不变——`packages/backend/` 和 `packages/frontend/` 与 `packages/backend/` 和 `packages/frontend/` 深度相同（均为 2 层），相对路径无需修改。

### 4. 更新构建/部署脚本中的路径引用

共更新 **20+ 个文件** 中的 `packages/backend` → `packages/backend` 和 `packages/frontend` → `packages/frontend`：

| 文件类别 | 文件列表 |
|---|---|
| CI/CD | `.github/workflows/test.yml`, `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| Docker | `.dockerignore`, `docker/docker-entrypoint.sh` |
| ESLint | `.eslintrc.js` |
| 构建脚本 | `runtime/scripts/pack-docker.js`, `pack-offline.js`, `clean-tsc-artifacts.js`, `add-copyright-header.js`, `cli.js`, `generate-frontend-permissions.js`, `generate-api-types.js`, `serve-static.js`, `pack-linux-deploy.js` |
| 源文件注释 | `packages/backend/.env`, `packages/backend/src/config/configuration.ts`, `packages/backend/src/common/enums/permissions.enum.ts`, `packages/backend/src/mxcad/services/file-conversion.service.ts`, `packages/backend/scripts/audit-permissions.ts`, `packages/frontend/src/constants/permissions.ts` |

### 5. 编译验证

- `packages/backend/`: `npx tsc --noEmit` — 通过（仅有 Prisma 生成类型预存错误，与本次迁移无关）
- `packages/conversion-engine/`: `npx tsc --noEmit` — 通过（零错误）

---

## 注意事项

1. **`pnpm-lock.yaml`** — 锁文件已由 `pnpm install` 自动更新，`packages/backend` 和 `packages/frontend` 的条目已变更为 `packages/backend` 和 `packages/frontend`。

2. **`.env` 中的相对路径** — `packages/backend/.env` 中的 `FRONTEND_FONTS_PATH=packages/frontend/dist/mxcadAppAssets/fonts` 已同步更新，`configuration.ts` 中的 `resolvePath()` 函数从 `process.cwd()` 向上两级解析，不受目录名 (`packages` → `packages`) 影响。

3. **`vendor/` 目录** — 完全未触碰，所有离线资源保持原样。

4. **`packages/conversion-engine/`** — 保留在 `packages/` 下，因为它是一个内部库而非可独立部署的应用。
