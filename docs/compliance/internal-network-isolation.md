# 内部链路网络隔离与鉴权（等保 8.1.2.2 边界防护）

对应等保三级「安全通信 / 边界防护」条款中**内部服务链路**的落地说明。CloudCAD 部署形态下，backend(3001)、storage-service(3200)、conversion-service(3100)、PostgreSQL(5432)、Redis(6379) 构成**可信内网**，与外部互联网之间由 #418 的端口收口（全部 `127.0.0.1` 绑定）+ SSH 加固 + fail2ban 隔离。本文档说明**可信内网内部**各服务之间链路的鉴权与口令要求，确保「内网≠无鉴权」。

## 设计原则

可信内网隔离路线（#408 决策）：不引入 mTLS/服务网格等重设施，而是以**最小可用**的口令 + 共享密钥 + 端口收口组合达成边界防护。核心约束：

1. **端口收口**：所有内部服务端口仅绑定 `127.0.0.1`（见 #418），外部网络无法直连，链路只在本机/同容器网络内可达。
2. **有状态组件须口令**：Redis 生产环境强制 `requirepass`，防止同机/同网段未授权直连读写缓存与会话。
3. **无鉴权 HTTP 服务须共享密钥**：storage-service / conversion-service 的**非 health 路由**校验 `X-Internal-Service-Secret` 头，防止同网段任意进程伪造内部调用。
4. **health 端点豁免**：`/health` 只读探测端点不校验密钥（供部署健康检查/监控探活），其余业务路由全量校验。
5. **向后兼容**：密钥/口令**留空即不校验**（本地开发单机可跑）；生产部署必须显式配置非空值。

## 拓扑

```
                         外部互联网
                            │
        ┌───────────────────┴────────────────────────┐
        │  防火墙 / 主机边界（#418）                     │
        │  · 仅 80/443 对外（Nginx → backend 3001）      │
        │  · SSH 22 加固 + fail2ban                    │
        └───────────────────┬────────────────────────┘
                            │  127.0.0.1 环回 / cloudcad-net 容器网络
        ┌───────────────────┴────────────────────────┐
        │              可信内网（本文档范围）             │
        │                                              │
        │  backend(3001) ──X-Internal-Service-Secret──▶ storage-service(3200)
        │       │                                        │
        │       │ X-Internal-Service-Secret             │
        │       ▼                                        │
        │  conversion-service(3100)                      │
        │       │                                        │
        │  backend(3001) ──REDIS_PASSWORD──▶ Redis(6379) │
        │  backend(3001) ──DB_PASSWORD────▶ PostgreSQL(5432) │
        └────────────────────────────────────────────────┘
```

所有内部端口仅在本机环回（`127.0.0.1`）或 `cloudcad-net` 容器网络内可达，公网不可达。

## 端口表（三类可达性）

| 组件 | 端口 | 本机监听 | 容器网络 | 公网 | 鉴权方式 | 生产必填 | 配置项 |
|---|---|---|---|---|---|---|---|
| PostgreSQL | 5432 | `127.0.0.1` | cloudcad-net | ✗ | 数据库口令 | 是 | `DB_PASSWORD` |
| Redis | 6379 | `127.0.0.1` | cloudcad-net | ✗ | `requirepass` | 是 | `REDIS_PASSWORD` |
| backend | 3001 | `127.0.0.1` | cloudcad-net | 经 Nginx 80/443 | JWT / Session | — | `JWT_SECRET` / `SESSION_SECRET` |
| storage-service | 3200 | `127.0.0.1` | cloudcad-net | ✗ | `X-Internal-Service-Secret` 头（豁免 `/health` 与客户端直传 `POST /v1/files/upload`） | 是 | `INTERNAL_SERVICE_SECRET` |
| conversion-service | 3100 | `127.0.0.1` | cloudcad-net | ✗ | `X-Internal-Service-Secret` 头（兼容旧 `X-Conversion-Service-Secret`） | 是 | `INTERNAL_SERVICE_SECRET` / `CONVERSION_SERVICE_SECRET` |
| config-service | 3002 | `127.0.0.1` | cloudcad-net | ✗ | 内部只读 | — | — |
| cooperate | 3091 | `127.0.0.1` | cloudcad-net | 经 Nginx（公网 TLS 属 #418/3091 工程，不在本票） | 协同 token | — | — |

> 三类可达性说明：**本机监听**=compose 全部 `127.0.0.1:port:port` 绑定，宿主机仅环回可达；**容器网络**=容器间经 `cloudcad-net` bridge 以服务名直连（如 `http://storage-service:3200`）；**公网**=仅 Nginx 反代的 80/443 对外，其余端口公网不可达。

## Redis 口令（requirepass）

- **backend 出站**：`configuration.ts` 的 `redis.password` 读取 `REDIS_PASSWORD`，`redis.module.ts` 建连时透传 `password`。
- **compose 侧**：`docker/docker-compose.yml` 与 `deploy/docker-compose.standalone.yml` 的 redis 服务用 shell 条件展开 `${REDIS_PASSWORD:+--requirepass $REDIS_PASSWORD}`——**非空才启用** `--requirepass`，dev 留空则不启用（向后兼容本地无密码 Redis）。healthcheck 同步带 `redis-cli ${REDIS_PASSWORD:+-a $REDIS_PASSWORD} --no-auth-warning ping`。
- **生产门禁**：`configuration.ts` 在 `NODE_ENV=production` 时把 `REDIS_PASSWORD` 列入 `requiredVars`，缺失即启动失败（fail-fast）。
- **conversion-service 可选 Redis 队列**：`QUEUE_DRIVER=redis` 时经 `REDIS_URL` 连接，URL 内嵌口令（`redis://:pass@host:6379/0`）；`QUEUE_DRIVER=local`（standalone 默认）则不连 Redis。

## 内部服务共享密钥（X-Internal-Service-Secret）

- **统一头**：`X-Internal-Service-Secret`，值来自 env `INTERNAL_SERVICE_SECRET`。
- **backend 出站**：`common/utils/internal-service-auth.ts` 的 `internalServiceSecretHeader(secret)` 生成头（secret 空则不带头）。所有出站调用点展开该头：
  - `storage/http-storage.provider.ts`（`request`/`requestBuffer`）
  - `version-control/providers/http-version-control.provider.ts`（`request`/`requestBuffer`）
  - `function-executor/http-conversion.executor.ts`（`request`）
  - `batch-download/conversion-runner.ts`（`httpRequest`，另保留旧 `X-Conversion-Service-Secret`）
  - `conversion-monitor/conversion-monitor.service.ts`（`httpGet` 拉取 `/v1/conversions/stats`）
- **storage-service 服务端**：`server.js` 的 `checkSecret` 对**后端内部路由**校验 `X-Internal-Service-Secret === INTERNAL_SERVICE_SECRET`（未配置则跳过）。**豁免两类**：`/health`（只读探测）与 `POST /v1/files/upload`（客户端直传路由，走 JWT 上传令牌鉴权，见 `UploadTokenService`，客户端不持有内部密钥）。前端文件访问经 backend `/api/...` 代理，不直连 storage-service，故其余 `/v1/files/*`、`/v1/svn/*`、`/v1/cache/*` 均为后端内部路由，全量校验。
- **conversion-service 服务端**：`routes/conversions.js` 的 `checkSecret` 对**所有非 health 路由**校验，**任一**匹配即放行：
  - `X-Internal-Service-Secret === INTERNAL_SERVICE_SECRET`（统一密钥，新）
  - `X-Conversion-Service-Secret === CONVERSION_SERVICE_SECRET`（batchConvert 旧链路，向后兼容）
- **health 豁免**：两服务的 `/health` 在 `server.js` 先行处理，不进入 `checkSecret`。

## 部署配置要求（生产）

`.env` 必须显式设置以下非空值（`setup-offline.js` 的 `fillEmptySecrets` 会自动生成 `REDIS_PASSWORD` / `INTERNAL_SERVICE_SECRET` 空值占位）：

```env
REDIS_PASSWORD=<非空>
INTERNAL_SERVICE_SECRET=<非空>
# 可选：保留 batchConvert 旧链路密钥（新链路用 INTERNAL_SERVICE_SECRET 即可）
CONVERSION_SERVICE_SECRET=<可选非空>
```

compose 文件已把 `INTERNAL_SERVICE_SECRET` / `REDIS_PASSWORD` 透传到 backend、storage-service、conversion-service 三处；`deploy/docker-compose.standalone.yml` 的 backend 对 `REDIS_PASSWORD` 用 `${REDIS_PASSWORD:?...}` 强制必填。

## 共享密钥清单

| 密钥 | 环境变量 | 使用方（出站） | 校验方（入站） | 头 |
|---|---|---|---|---|
| 内网统一密钥 | `INTERNAL_SERVICE_SECRET` | backend → storage/conversion/monitor | storage-service、conversion-service 非 health 路由 | `X-Internal-Service-Secret` |
| 转换旧链路密钥 | `CONVERSION_SERVICE_SECRET` | backend `conversion-runner`（batchConvert） | conversion-service（向后兼容） | `X-Conversion-Service-Secret` |
| Redis 口令 | `REDIS_PASSWORD` | backend redis 客户端、compose healthcheck | Redis `requirepass` | — |
| PG 口令 | `DB_PASSWORD` | backend Prisma | PostgreSQL | — |

> 生产部署时 `INTERNAL_SERVICE_SECRET` 与 `REDIS_PASSWORD` 必须非空且**相互独立**（勿复用同一值）。`setup-offline.js` 的 `fillEmptySecrets` 会为两者各生成独立随机值。

## 多机拆分时失效声明

本文档的边界防护**仅对「单节点部署」成立**。若未来将 backend / storage-service / conversion-service 拆分到**不同物理机**：

1. 各服务不再共享 `127.0.0.1` 环回，须经**受控内网/VPN** 互联，`cloudcad-net` 容器网络不再覆盖跨机链路；
2. 共享密钥头在**明文 HTTP** 跨机传输，**必须**升级为 TLS（mTLS 或反向代理终结），否则 `X-Internal-Service-Secret` 在内网链路可被窃听/重放；
3. 端口收口（`127.0.0.1` 绑定）对跨机无效，须改用**防火墙/安全组**限制源 IP 白名单；
4. 届时须重新评估并更新本文档，**不可**直接沿用单机假设。

**当前约束**：backend / storage-service / conversion-service 必须与 PostgreSQL/Redis 同机（或同 `cloudcad-net`）部署，`CONVERSION_SERVICE_URL` / `STORAGE_SERVICE_URL` 指向 `127.0.0.1` 或容器服务名。

## 离线部署存量升级说明（补设密码不锁死自己）

旧实例（无 `REDIS_PASSWORD` / `INTERNAL_SERVICE_SECRET`）升级时：

1. **先备份** `.env` 与 Redis 持久化文件（`dump.rdb`）；
2. 在 `.env` 追加 `REDIS_PASSWORD=<新值>` 与 `INTERNAL_SERVICE_SECRET=<新值>`（`setup-offline.js` 的 `fillEmptySecrets` 仅填空值行，不会覆盖已有值）；
3. **同一次重启**内同时生效：compose 的 redis `requirepass` 与 backend 的 `redis.password` 同步读取新值，不会出现「backend 带密码连无密码 Redis」或反向的不匹配；
4. 若升级后 backend 报 Redis 认证失败，核对 `.env` 的 `REDIS_PASSWORD` 与 compose 实际注入值一致（大小写/引号）；
5. `INTERNAL_SERVICE_SECRET` 须 backend 与 storage/conversion 服务**三处同值**（compose 已统一透传），不一致则内部调用 401。

> 密钥属资产，变更/轮换须同步备份（见 #424 / #413 secrets 管理定案）。

## 与既有边界防护的关系

- **#418**：端口收口（`127.0.0.1` 绑定）+ SSH 加固 + fail2ban + 登录失败告警——**外部互联网边界**。
- **#419（本文档）**：可信内网**内部**链路的口令 + 共享密钥——**内部服务边界**。
- 两者叠加构成完整的「外部隔离 + 内部鉴权」边界防护，覆盖等保 8.1.2.2。
