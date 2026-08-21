---
name: drawing-version-deployment
description: 图纸版本部署规范 — 图纸版本管理涉及的 SVN 配置完整性验证与部署前后自动检查。触发条件：(1) 修改 packages/mxVersionTool/ 下任意文件；(2) 修改 packages/backend/src/version-control/ 下任意文件；(3) 修改 packages/backend/src/storage/ 下任意文件；(4) 修改 packages/storage-service/ 下任意文件；(5) 变更 MX_REPO_PATH / FILES_DATA_PATH / MX_VERSION_TOOL_PATH 等图纸版本路径配置；(6) 变更文件存储路径规范；(7) 变更部署脚本中版本控制运行时相关；(8) 变更 .env/.env.example 中图纸版本配置变量。
---

<what-to-do>

图纸版本变更必须经过「配置完整性扫描 → 自动部署验证 → 变更记录」三步。不允许只改一个配置文件就关任务。

</what-to-do>

<supporting-info>

## 第一步：配置完整性扫描

修改图纸版本相关代码后，用下表逐一比对——9个配置点缺一不可：

| # | 配置位置 | 需检查的变量 | 嵌入式模式 | 独立存储模式 |
|---|---------|------------|-----------|------------|
| 1 | `packages/backend/.env` | `MX_REPO_PATH`, `FILES_DATA_PATH`, `SVN_GLOBAL_IGNORES` | ✓ | ✓ |
| 2 | `packages/backend/.env.example` | 同上（新变量必须加到这里） | ✓ | ✓ |
| 3 | `packages/backend/src/config/configuration.ts` | 默认值与 env 映射 | ✓ | — |
| 4 | `packages/backend/src/config/app.config.ts` | `MxConfig` 接口 | ✓ | — |
| 5 | `packages/storage-service/lib/constants.js` | `SVN_CONFIG`, `FILES_DATA_PATH` | — | ✓ |
| 6 | `packages/storage-service/services/svn-agent.js` | `SVN_CONFIG.mxToolPath` 调用 | — | ✓ |
| 7 | `docker/.env.example` / `docker/docker-compose.yml` | 环境变量映射 | ✓ | ✓ |
| 8 | `deploy/docker-compose.standalone.yml` | 环境变量映射（独立部署） | — | ✓ |
| 9 | `docs/` / `README.md` | 配置文档说明 | ✓ | ✓ |

## 第二步：部署时自动验证

集成在 `cli.js` 中，部署流程自动执行：

```
deployMode:
  1. startInfrastructure()
  2. version:check (CLI可用性→仓库完整性→工作副本→磁盘空间)
  3. runDatabaseMigration()
  4. build
  5. startAppServices()
  6. version:verify (svn status→svn info→svn log→svn cat→svn commit --dry-run)
```

手动调用：`node runtime/scripts/cli.js version:check` / `node runtime/scripts/cli.js version:verify`

## 第三步：变更记录

部署后自动在 `deploy/version-changelog/` 下生成 JSON 记录文件。

## 工作流速查

| 操作 | 命令/位置 |
|------|----------|
| 配置完整性扫描 | 参照上表逐项核对 |
| 部署前检查 | `node runtime/scripts/cli.js version:check` |
| 部署后验证 | `node runtime/scripts/cli.js version:verify` |
| 辅助脚本 | `runtime/scripts/drawing-version-helper.js` |
| 变更记录目录 | `deploy/version-changelog/` |

## 交叉引用

- 后端图纸版本 Provider：加载 `backend-coding-standards` Skill
- 文件路径规范：`file-storage-paths` Skill
- 配置管理体系：`config-management` Skill
- API 契约：`api-contracts` Skill（DTO 变更后 SDK 重生成）

</supporting-info>
