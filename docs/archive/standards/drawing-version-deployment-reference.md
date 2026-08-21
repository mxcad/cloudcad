# 图纸版本部署参考手册

## 配置文件索引

### 图纸版本配置变量表

| 环境变量 | 默认值 | 代码位置 | 配置位置 |
|---------|--------|---------|---------|
| `MX_REPO_PATH` | `data/mx-repo` | `backend/src/config/configuration.ts:255` | `.env`, `docker/.env.example`, `docker-compose.yml` |
| `FILES_DATA_PATH` | `data/files` | `backend/src/config/configuration.ts:254` | `.env`, `storage-service/lib/constants.js`, `docker/` |
| `SVN_GLOBAL_IGNORES` | `.tmp,.bak,.log,.cache` | `storage-service/lib/constants.js:25` | `.env`, `storage-service/` |
| `MX_VERSION_TOOL_PATH` | `packages/mxVersionTool/mxcmd.js` | `storage-service/lib/constants.js:24` | `.env`, `storage-service/` |
| `STORAGE_SERVICE_PORT` | `3200` | `storage-service/lib/constants.js:3` | `.env`, `docker/` |

### 服务模式对应关系

| 服务 | 文件 | IVersionControl 实现 |
|------|------|---------------------|
| 嵌入式 | `backend/src/version-control/providers/mx-version-control.provider.ts` | `MxVersionControlProvider` |
| 独立存储 | `storage-service/services/svn-agent.js` | `HttpStorageProvider` |

**关键规则**：修改 `IVersionControl` 接口时，必须同步更新两个实现。

## 图纸版本错误码速查

| 错误码 | 含义 | 现有自动修复 |
|-------|------|------------|
| `E155010` | 工作副本文件缺失 | `mx-version-control.provider.ts:487` 50 次循环 revert+retry |
| `E200009` | 提交失败 | `mx-version-control.provider.ts:527` cleanup+update 后重试 |
| `E170013` | 连接失败 | `mx-version-control.provider.ts:450` URL 修正 |
| `E180001` | 连接失败 | `mx-version-control.provider.ts:451` URL 修正 |
| `E155004` | 工作副本已锁定 | `mx-version-control.provider.ts:226` cleanup 解锁 |

## 辅助脚本命令参考

### `version:check`（部署前执行）

```
1. CLI 可用性          → checkMxAvailableSync()
2. mxVersionTool 包完整性 → packages/mxVersionTool/ 存在
3. 仓库完整性          → svnadmin verify（跳过旧版本不兼容）
4. 工作副本完整性      → FILES_DATA_PATH/.svn 存在 + svn info
5. 磁盘空间            → 剩余空间 > 1GB（可配置）
```

### `version:verify`（部署后执行）

```
1. svn status          → 工作副本状态
2. svn info            → 仓库连接正常
3. svn log --limit 1   → 历史查询正常
4. svn cat <testFile>  → 文件内容获取正常
5. svn commit --dry-run → 提交流程正常
```

## 变更记录格式

`deploy/version-changelog/YYYY-MM-DD-HHmmss.json`:

```json
{
  "deployedAt": "2026-07-29T10:00:00.000Z",
  "gitCommit": "abc123def456",
  "changedFiles": ["packages/mxVersionTool/mxcmd.js"],
  "healthCheck": { "status": "passed", "duration": 1234, "checks": [...] },
  "verification": { "status": "passed", "duration": 5678, "checks": [...] }
}
```
