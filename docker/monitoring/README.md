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

## 四、与其它 ticket 的衔接

- **#315**：后端 `/metrics` 改为 Bearer Token 认证，本栈 Prometheus 已用 `SCRAPE_TOKEN` 配置抓取头。
- **#316**：8 条指标告警规则（`docker/monitoring/prometheus/alert-rules.yml`，当前为空占位）+ Alertmanager severity 路由细化。
- **#317**：Grafana 看板 JSON（当前仅预置数据源与目录）。
- **#314**：裸机离线部署包（Loki/Prometheus/Grafana/Alertmanager/Promtail 二进制 + systemd）。

## 等保对照（ADR-0055 §5）

- 8.5.4 c/d 集中监测 / 集中审计：本栈 Loki/Prometheus 集中收集，日志留存 ≥6 个月。
