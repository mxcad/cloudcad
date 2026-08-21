# 监控栈裸机离线部署（Log Monitor Ops / ADR-0055 §3）

> 对应 ticket：[#314 监控栈裸机离线部署包（二进制预下载 + systemd）](https://github.com/mxcad/cloudcad/issues/314)
>
> 适用场景：**非 docker 的裸机/多机部署**，且可能**无外网**（toC/toB 离线单机/多机形态）。与 [#313 监控栈 docker-compose 变体](https://github.com/mxcad/cloudcad/issues/313) 功能等价，复用同一份 `docker/monitoring/` 配置源与 `runtime/scripts/monitoring/promtail/` 模板。

## 拓扑

```
┌──────────────── 监控栈节点（裸机，systemd） ────────────────┐
│ Prometheus :9090    Loki :3100                             │
│ Grafana :3005       Alertmanager :9093                     │
│ 数据目录 data/monitoring/<组件>/（0750）                     │
└────────────────────────────────────────────────────────────┘
        ▲ /api/metrics（Bearer）                ▲ 内网 HTTP
        │                                       │
┌───────┴──────────── 业务节点（每台，systemd） ─┴───────────┐
│ Promtail 采集 data/logs/<服务>/*.log（标签 service/host/env/log_type）│
└────────────────────────────────────────────────────────────┘
```

## 一、离线包准备（打包机，有外网）

### 1. 下载二进制

```bash
# 默认 linux-amd64
./runtime/scripts/monitoring/download-binaries.sh
# 或指定架构
./runtime/scripts/monitoring/download-binaries.sh arm64
```

产物：`runtime/vendor/monitoring/<linux-amd64|linux-arm64>/<组件>/`，包含 prometheus / loki / grafana / alertmanager / promtail 五套二进制。

### 2. 随安装包分发

离线包需携带以下内容：

```
runtime/vendor/monitoring/                    # 监控栈二进制
runtime/scripts/monitoring/download-binaries.sh
runtime/scripts/monitoring/install-monitoring.sh
runtime/scripts/monitoring/systemd/*.service  # systemd unit 模板
runtime/scripts/monitoring/promtail/promtail.yml   # Promtail 配置模板
docker/monitoring/                            # 配置源（prometheus/alert-rules/loki/grafana/alertmanager）
```

> 与 `scripts/pack-linux-deploy.js`（离线部署包）结合：把 `runtime/vendor/monitoring` 纳入部署包即可离线分发。

## 二、监控栈节点安装

### 1. 创建运行用户

```bash
useradd -r -s /sbin/nologin cloudcad
```

### 2. 运行安装脚本

```bash
sudo ./runtime/scripts/monitoring/install-monitoring.sh \
  --role stack \
  --data-dir /app/data/monitoring \
  --scrape-token 'your-scrape-token' \
  --scrape-target '127.0.0.1:3001' \      # 后端 /api/metrics 的 host:port（nginx 或后端直连）
  --alertmanager-addr '127.0.0.1:9093' \
  --smtp-host smtp.example.com --smtp-port 587 \
  --smtp-auth-username ops@example.com --smtp-auth-password 'pass' \
  --alert-email-to ops@example.com,admin@example.com \
  --grafana-admin-password 'your-grafana-password'
```

脚本会：
- 渲染 4 个 systemd unit（`/etc/systemd/system/cloudcad-{prometheus,loki,grafana,alertmanager}.service`）
- 从 `docker/monitoring/` 渲染实际配置到 `/etc/cloudcad/monitoring/`（替换 `SCRAPE_TOKEN`/`SCRAPE_TARGET_HOST`/`alertmanager:9093`/SMTP 等）
- `systemctl enable --now` 全部服务

### 3. 验证

```bash
systemctl status cloudcad-prometheus cloudcad-loki cloudcad-grafana cloudcad-alertmanager
# Prometheus Targets 应看到 cloudcad-backend UP
curl -s http://127.0.0.1:9090/api/v1/targets | head
# Grafana 登录 http://<host>:3005
```

## 三、业务节点 Promtail 安装（每台业务机）

```bash
sudo ./runtime/scripts/monitoring/install-monitoring.sh \
  --role agent \
  --loki-url 'http://<monitor-host>:3100/loki/api/v1/push' \
  --node-name 'node-01' --env prod \
  --log-root '/app/data/logs'
```

脚本生成 `cloudcad-promtail.service`（续传位置 `/var/lib/cloudcad-promtail`），`enable --now` 后 Promtail 采集 `data/logs/<服务>/*.log`（标签 `service/host/env/log_type`）推送到 Loki。

## 四、运维

| 操作 | 命令 |
|---|---|
| 查看状态 | `sudo ./runtime/scripts/monitoring/install-monitoring.sh --role stack status` |
| 重启 | `sudo ./runtime/scripts/monitoring/install-monitoring.sh --role stack restart` |
| 卸载 | `sudo ./runtime/scripts/monitoring/install-monitoring.sh --role stack uninstall`（配置保留 `/etc/cloudcad/monitoring`） |
| 单服务 | `systemctl status/restart cloudcad-prometheus` 等 |

## 五、升级

1. 打包机重新下载新版本二进制（改 `PROM_VERSION`/`LOKI_VERSION`/`GRAFANA_VERSION`/`ALERTMANAGER_VERSION` 或直接覆盖 `runtime/vendor/monitoring/`）
2. 覆盖部署 `runtime/vendor/monitoring/<arch>/<组件>/` 二进制
3. `sudo ./runtime/scripts/monitoring/install-monitoring.sh --role stack restart`（或逐服务 `systemctl restart`）

> 注意：config 变更不随升级包覆盖客户已改配置；需手动更新 `/etc/cloudcad/monitoring/` 下的配置后重启对应服务。

## 六、与 compose 变体的关系

| 项 | docker-compose（#313） | 裸机 systemd（#314） |
|---|---|---|
| 编排 | `docker-compose.monitoring.yml` | `install-monitoring.sh` + systemd |
| 配置源 | `docker/monitoring/` | 复用同一份，脚本渲染 |
| Promtail | 每台业务机 | 每台业务机（systemd） |
| 数据目录 | `docker/data/monitoring/` | `/app/data/monitoring/` |
| 功能 | 等价 | 等价 |

两者共用：`docker/monitoring/prometheus/alert-rules.yml`（#316 填充）、`runtime/scripts/monitoring/promtail/promtail.yml`。

## 等保对照（ADR-0055 §5）

- 8.5.4 c/d 集中监测/集中审计：裸机下 Loki/Prometheus 集中收集，日志留存 ≥6 个月。
