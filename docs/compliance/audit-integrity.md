# 审计归档完整性保护（等保 8.4.3.3 / 8.1.4.3 审计记录保护）

对应等保三级「安全审计 / 审计记录保护」条款的落地说明。CloudCAD 的审计日志（`audit_logs` 表）默认保留 183 天（>6 个月整）热数据，超期记录**先归档留存再删除**（fail-closed），并叠加 SHA-256 校验清单与逐期哈希链，保证归档产物**可校验、防篡改、防断链/删期**。本文档说明归档流程、完整性机制、保护边界与运维核验手段。

## 设计原则

1. **fail-closed 归档**（#322）：超期记录必须先落盘归档（CSV + 清单 + 链文件），**全部成功**才允许删库；任一分片写盘失败即整体失败，记录保留并上报告警，绝不出现「已删但未归档」。
2. **可校验**（#322）：每个月度分片生成 `sha256sum` 兼容的校验清单，运维可随时复核归档内容未被截断/篡改。
3. **防篡改/防断链**（#420）：逐期哈希链把各月归档**时间序串联**，单期篡改、插期、删期均可被检出（见「哈希链机制」）。
4. **生产默认开启**（#420）：`NODE_ENV=production` 且未显式关闭时归档默认开启；关闭时启动 `Logger WARN` 提示合规缺口（不阻塞启动）。
5. **异地留存**（#420）：归档目录随每日备份异地同步（复用 `BACKUP_REMOTE_*` 通道），同步失败 P1 告警，与本地归档→删库解耦。

## 归档流程

```
每日 02:00（audit-cleanup cron，AUDIT_LOG_RETENTION_DAYS=183）
        │
        ▼
  查询全部超期记录（createdAt < now-183d，无行数上限）
        │
        ▼
  按 createdAt 的 UTC 月分片（YYYY-MM）
        │
        ▼
  逐月落盘（全部成功后才删库）：
    ├── <month>.csv          UTF-8 BOM，字段与审计导出一致
    ├── <month>.sha256       <sha256>  <month>.csv（两空格，兼容 sha256sum -c）
    └── <month>.chain.json   { month, csvSha256, prevHash, chainHash }
        │
        ▼
  构建/续接哈希链（时间序）：
    └── chain-head.json      { latestMonth, latestChainHash }
        │
        ▼
  按同一 cutoff 删除超期记录（fail-closed 门禁）
        │
        ▼
每日 01:00（backup cron）备份成功后：
  └── 归档目录异地同步（rsync/oss/s3，复用 BACKUP_REMOTE_*）
```

## 哈希链机制（#420）

每期归档产物 `<month>.chain.json` 记录：

| 字段 | 含义 |
|---|---|
| `month` | 归档月份（UTC，YYYY-MM） |
| `csvSha256` | 本期 CSV 的 SHA-256（与 `.sha256` 清单一致） |
| `prevHash` | 时间序**前一期**的 `chainHash`；**首期为空串** |
| `chainHash` | 本期链接哈希 = `SHA-256(`${month}|${csvSha256}|${prevHash}`)` 十六进制 |

链接规则：

- 本期 `prevHash` = 时间序前一期的 `chainHash`；无前一期则为空串（首期约定）。
- 本期 `chainHash` = `SHA-256(`${month}|${csvSha256}|${prevHash}`)`。
- 链头状态文件 `chain-head.json` = `{ latestMonth, latestChainHash }`，记录当前最新期链接哈希，随每日异地推送上行。

**单一事实源**：链接哈希公式与核验逻辑收敛在 `packages/backend/src/audit/audit-chain.ts`（纯函数模块，无 NestJS 依赖），归档生成（`AuditArchiveService.buildChain`）与运维核验（CLI `--verify-chain`）共用同一公式，避免「生成」与「核验」漂移。

### 可检出的篡改类型

`--verify-chain` 逐期做**三重校验**（按序，命中即停并定位断点）：

| # | 校验 | 检出的篡改 | 断点原因 |
|---|---|---|---|
| 1 | 重算 `chainHash` 与清单一致 | 改某期 `chain.json` 的 `csvSha256`/`prevHash`/`chainHash` | 该期 `CHAIN_HASH_MISMATCH` |
| 2 | 实际 CSV 内容哈希 = `entry.csvSha256` | 改某期 **CSV 本体**（清单/链文件完好） | 该期 `CSV_MISMATCH` |
| 3 | `prevHash` = 上一期 `chainHash` | 插期 / 删期 / 断链 | 该期 `PREV_HASH_BREAK` |

其他：`chain.json` 不可读 → `CHAIN_FILE_UNREADABLE`；CSV 不可读 → `CSV_UNREADABLE`；归档目录缺失 → `ARCHIVE_DIR_MISSING`（CLI 退出码 1）。

> **CSV 篡改可检出**（验收项）：`--verify-chain` 会重算每期 CSV 实际内容哈希并与 `chain.json` 的 `csvSha256` 比对，故**仅改动 CSV 文件**（清单/链文件未动）也能被检出为 `CSV_MISMATCH`。这与 `sha256sum -c <month>.sha256`（单期内容复核）互补：前者逐期全量校验，后者可针对单期快速复核。

## 保护边界声明

**抗单机篡改**：持有归档目录本地访问权的攻击者，若改动任意一期 CSV/清单/链文件，会导致该期或后续期校验失败（`--verify-chain` 可检出）。链头 `chain-head.json` 随每日异地推送上行，异地副本可对照本地链头发现本地篡改。

**不抗「持有异地推送凭据的协同攻击」**：本机制**不能**防御同时持有「本地归档目录访问权」与「异地推送凭据（`BACKUP_REMOTE_*`）」的攻击者——其可同步篡改本地与异地副本，使两侧一致通过校验。此为哈希链的固有边界（无第三方锚定/跨组织信任根），须由**异地推送凭据的最小化与隔离**（#419 共享密钥、#424 secrets 管理）补充约束：异地推送凭据仅限备份/运维通道持有，不与归档目录同权。

## 运维核验与查询

### 核验哈希链

```bash
cd packages/backend
pnpm audit:archive-query -- --verify-chain [--dir <归档目录>] [--json]
```

- 链完整：退出码 `0`，输出「N 期连续完整」。
- 链断裂：退出码 `1`，输出首个断点期与原因（`CHAIN_HASH_MISMATCH` / `PREV_HASH_BREAK` / `CHAIN_FILE_UNREADABLE` / `ARCHIVE_DIR_MISSING`）。
- `--json` 输出结构化结果（`verifiedCount` / `months` / `firstBreak`）。

### 检索某月归档

```bash
cd packages/backend
pnpm audit:archive-query -- --month 2026-07 [--userId u] [--action a] [--keyword k] [--json] [--dir <归档目录>]
```

fail-closed：先校验该月 SHA-256 清单，不匹配/缺失一律**拒绝输出**（防输出被篡改/损坏的数据）。

### 单期内容复核（sha256sum）

```bash
sha256sum -c 2026-07.sha256   # 清单两空格格式，兼容标准 sha256sum
```

## 配置项

| 配置项 | 环境变量 | 代码默认 | 说明 |
|---|---|---|---|
| 归档开关 | `AUDIT_ARCHIVE_ENABLED` | `false` | `true` 时超期记录先归档再删库；`false` 直接删库 |
| 归档目录 | `AUDIT_ARCHIVE_PATH` | `data/archives/audit-logs` | 相对路径基于项目根解析；目录 0750 / 文件 0640 |
| 保留天数 | `AUDIT_LOG_RETENTION_DAYS` | `183` | >6 个月整 |
| 异地通道 | `BACKUP_REMOTE_*` | `none` | 归档目录随每日备份异地同步（rsync/oss/s3） |

> **生产默认开启（模板约定 + 启动告警，非代码硬默认）**：代码层 `configuration.ts` 的 `AUDIT_ARCHIVE_ENABLED` 默认 `false`（`parseBoolean(..., false)`），**不会**在生产自动开启。生产默认开启由**部署模板约定**达成——`packages/backend/.env.example` 与 `docker/.env.example` 均已写 `AUDIT_ARCHIVE_ENABLED=true`，新装实例（含离线部署经 `.env.example` 拷贝）默认开启归档。兜底：`NODE_ENV=production` 且归档关闭时，`AuditArchiveService` 启动 `Logger WARN` 提示合规缺口（不阻塞启动）。本地开发如需快速删库可显式置 `false`。

## 与既有机制的关系

- **#322**：fail-closed 按月归档 + SHA-256 清单（本文档的归档流程与可校验基础）。
- **#323**：删除前置归档校验（`verifyArchivedForCutoff`，未归档拒删门禁）。
- **#324**：归档查询脚本（`audit:archive-query --month`，集中审计可查询）。
- **#420（本文档）**：哈希链 + 生产默认开启 + 异地同步 + `--verify-chain` 核验（防篡改/断链/删期）。
- **#419**：异地推送通道的共享密钥（保护边界声明的凭据隔离前提）。
