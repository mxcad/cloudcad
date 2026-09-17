# CloudCAD 监控栈（Log Monitor Ops）

对应 ADR-0055 §3 采集端拓扑与 §4 指标告警规则。独立监控栈节点：**Prometheus + Grafana + Loki + Alertmanager**，配合每台业务机上的 **Promtail** 采集日志。

> 实现 ticket：[#313 监控栈 docker-compose 变体](https://github.com/mxcad/cloudcad/issues/313)、[#314 裸机离线部署包](https://github.com/mxcad/cloudcad/issues/314)、[#315 /metrics Bearer 认证](https://github.com/mxcad/cloudcad/issues/315)、[#316 告警规则](https://github.com/mxcad/cloudcad/issues/316)、[#317 Grafana 看板](https://github.com/mxcad/cloudcad/issues/317)。

## 拓扑

```
┌──────────────────────── 业务节点（每台） ────────────────────────┐
│ backend/storage/conversion/config                                │
│   → data/logs/<服务>/app-*.log  (180天)                          │
│   → data/logs/<服务>/access-*.log (180天)                        │
│   → Promtail（标签 service/host/env/log_type）──┐                │
└────────────────────────────────────────────────────┼────────────┘
                                                     │ 内网 HTTP
┌──────────────────────── 监控栈节点 ─────────────────┼────────────┐
│ Loki（app 90天 / access 180天） ◄───────────────────┘            │
│ Prometheus ◄─ Bearer 抓取 backend /api/metrics (#315)            │
│ Grafana（登录认证，Loki+Prometheus 数据源）                      │
│ Alertmanager（severity → SMTP 邮件）                             │
└───────────────────────────────────────────────────────────────┘
```

## 一、docker-compose 变体（单机 docker，与业务栈同机）

### 前置

1. 业务栈网络 `cloudcad-network`（由业务 `docker-compose.yml` 创建；若先起监控栈需手动建）：

   ```bash
   docker network create cloudcad-network
   ```

2. 准备监控栈环境变量：

   ```bash
   cp docker/.env.example docker/.env.monitoring
   # 编辑 docker/.env.monitoring，设置 SCRAPE_TOKEN / GRAFANA_ADMIN_PASSWORD / SMTP_* / ALERT_EMAIL_TO
   ```

### 启动

```bash
docker compose -f docker/docker-compose.monitoring.yml --env-file docker/.env.monitoring up -d
docker compose -f docker/docker-compose.monitoring.yml ps
```

### 访问

| 组件 | 地址 | 说明 |
|---|---|---|
| Grafana | `http://<host>:3005` | 单管理员登录（`GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASSWORD`） |
| Prometheus | `http://<host>:9090` | Targets → `cloudcad-backend` 应 UP |
| Alertmanager | `http://<host>:9093` | 告警状态 |
| Loki | `http://<host>:3100` | 日志 API |

### 停止

监控栈与业务解耦：停业务容器不影响监控栈；停监控栈不影响业务。

```bash
docker compose -f docker/docker-compose.monitoring.yml down
```

数据落盘 `docker/data/monitoring/<组件>/`，便于备份。

## 二、Promtail（业务机日志采集）

Promtail 需**每台业务机**部署一份，采集 `data/logs/<服务>/*.log` 并推送监控栈 Loki。

- 配置模板：[`runtime/scripts/monitoring/promtail/promtail.yml`](../../runtime/scripts/monitoring/promtail/promtail.yml)
- systemd unit 模板：[`runtime/scripts/monitoring/promtail/promtail.service`](../../runtime/scripts/monitoring/promtail/promtail.service)
- 标签：`service`（从路径推断，如 backend/storage/conversion/config）、`host`、`env`、`log_type`（`app`/`access`）
- 目标：`LOKI_URL`（内网 HTTP，如 `http://<monitor-host>:3100/loki/api/v1/push`）

裸机离线部署（二进制预下载 + systemd）见 ticket **#314**。

## 三、环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SCRAPE_TOKEN` | 必填 | `/metrics` 抓取 Bearer Token（与后端一致，见 #315） |
| `SCRAPE_TARGET_HOST` | `cloudcad-app:80` | 后端指标抓取 host:port（nginx 80） |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana 管理员 |
| `GRAFANA_ADMIN_PASSWORD` | 必填 | Grafana 管理员密码 |
| `GRAFANA_ROOT_URL` | `http://localhost:3005/` | Grafana 外部访问地址 |
| `SMTP_HOST` / `SMTP_PORT` | 必填 / 587 | 告警邮件 SMTP |
| `SMTP_FROM` | `CloudCAD Alert <noreply@cloudcad.com>` | 发件人 |
| `SMTP_AUTH_USERNAME` / `SMTP_AUTH_PASSWORD` | 空 | SMTP 认证 |
| `ALERT_EMAIL_TO` | 必填 | 告警收件人（逗号分隔） |
| `PROM_PORT` / `LOKI_PORT` / `GRAFANA_PORT` / `ALERTMANAGER_PORT` | 9090/3100/3005/9093 | 对外端口 |
| `PROM_RETENTION` | `30d` | Prometheus 指标保留 |

## 四、告警规则与阈值（#316）

规则文件：[`prometheus/alert-rules.yml`](./prometheus/alert-rules.yml)（可外部覆盖，`promtool check rules` 校验通过）。

| 规则 | 表达式要点 | 阈值 | 持续 | severity（分级） |
|---|---|---|---|---|
| HostCpuUsageHigh | `host_cpu_usage_percent` | > 85% | 5m | warning（P1） |
| HostMemoryUsageHigh | `host_memory_usage_percent` | > 85% | 5m | warning（P1） |
| HostDiskSpaceLow | `host_disk_free_percent{mount}` | < 10% | 10m | warning（P1） |
| HttpServerErrorRateHigh | 5xx 占比（已排除 /health、/metrics） | > 5% | 5m | critical（P0） |
| HttpP99LatencyHigh | `histogram_quantile(0.99, …)` | > 2s | 5m | critical（P0） |
| NodeEventLoopLagHigh | `nodejs_eventloop_lag_seconds` | > 100ms | 5m | warning（P1） |
| BackendTargetDown | `up == 0` | — | 即时 | critical（P0） |
| DbPoolUsageHigh | **待实现**：database.service 暴露连接池 gauge 后启用（规则文件内已留注释模板） | > 80% | 5m | warning（P1） |

**主机级指标来源**：`host_*` 三条 gauge 由后端进程内 `HostMetricsService`（每 5s 采样）暴露到 `/api/metrics`——无需 node_exporter，Windows 裸机/docker/多机全形态可用。磁盘采样路径经 `HOST_METRIC_DISK_PATHS`（逗号分隔，默认进程工作目录）配置。

**Alertmanager 路由**（[`alertmanager/alertmanager.yml`](./alertmanager/alertmanager.yml)）：critical/P0 立即外发（group_wait 10s、repeat 15m）；warning/P1 聚合 15min（与业务 AlertService P1 窗口语义对齐）；info/P2 group_wait 8h 日报风格。抑制规则：磁盘告警期间抑制同实例的 CPU/内存/5xx/P99 衍生噪声。

### 阈值调优记录

> 上线后观察 2-4 周，按误报/漏报在此登记（同时改 alert-rules.yml 阈值并注明日期）。

| 日期 | 规则 | 变更（旧→新） | 原因 |
|---|---|---|---|
| _待上线后填写_ | | | |

## 五、与其它 ticket 的衔接

- **#315**：后端 `/metrics` 改为 Bearer Token 认证，本栈 Prometheus 已用 `SCRAPE_TOKEN` 配置抓取头。
- **#316**：8 条指标告警规则 + Alertmanager severity 路由细化（见上文第四节）。
- **#317**：Grafana 看板 JSON（当前仅预置数据源与目录）。
- **#314**：裸机离线部署包（Loki/Prometheus/Grafana/Alertmanager/Promtail 二进制 + systemd）。

## 等保对照（ADR-0055 §5）

- 8.5.4 c/d 集中监测 / 集中审计：本栈 Loki/Prometheus 集中收集，日志留存 ≥6 个月。
