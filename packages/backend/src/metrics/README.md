# Metrics 模块

Prometheus 监控埋点：记录后端所有 HTTP 请求的计数与耗时，并暴露标准指标端点，供 Prometheus 定时抓取、Grafana 展示。

## 指标端点

```
GET /api/metrics   （Prometheus 文本格式，已从 Swagger 排除）
```

## 认证（#315，等保 8.5.4 c 监控数据访问控制）

`/api/metrics` 支持两种认证方式：

| 方式 | 条件 | 说明 |
|------|------|------|
| **抓取令牌** | 配置了 `SCRAPE_TOKEN` 环境变量 | 请求带 `Authorization: Bearer <SCRAPE_TOKEN>` 或 Basic 认证（密码字段=令牌，用户名任意）即放行；无状态服务友好，**Prometheus 推荐方式** |
| **用户权限** | 始终可用（回退通道） | 已登录用户需 `SYSTEM_MONITOR` 权限（如 ADMIN），未配置 `SCRAPE_TOKEN` 时这是唯一通道，行为与历史版本一致 |

- 令牌比对为恒定时间比较（SHA-256 摘要 + `timingSafeEqual`），防时序侧信道
- 无凭据 / 错误凭据返回 **401**
- 未配置 `SCRAPE_TOKEN` 时匿名请求返回 **403**

实现链路：`JwtStrategyExecutor`（仅对声明 `@ScrapeAuth()` 的端点）校验凭据并标记 `request.isScrapeAuth` → `MetricsAccessGuard` 直通或回退 `SYSTEM_MONITOR` 权限检查。

## 采集的指标

| 指标 | 类型 | 含义 |
|------|------|------|
| `http_requests_total` | Counter | HTTP 请求总数，按 `method / path / status` 打标签 |
| `http_request_duration_seconds` | Histogram | 请求耗时分布（0.005s ~ 10s 分桶），可算 P50/P95/P99 |
| Node.js 运行时指标 | 默认 | 进程内存、CPU、事件循环延迟等（`collectDefaultMetrics`） |

## 工作机制

- `prometheus.middleware.ts` 全局拦截每个请求：进入时计时，响应结束时记录计数 + 耗时
- `/health`、`/metrics` 等探活路径自动排除，避免监控自身刷屏
- `normalizePath()` 将 UUID / 数字 ID 归一化为 `/:id`，防止标签基数爆炸

## 查看方式

```bash
# 方式一：抓取令牌（后端配置 SCRAPE_TOKEN 后）
curl -H "Authorization: Bearer <SCRAPE_TOKEN>" http://localhost:3001/api/metrics

# Basic 认证形式（用户名任意，密码=令牌）
curl -u "prometheus:<SCRAPE_TOKEN>" http://localhost:3001/api/metrics

# 方式二：SYSTEM_MONITOR 权限用户的 access token
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/metrics
```

## 接入 Prometheus

仓库已交付监控栈（`docker/monitoring/`，ADR-0055 §3/§4），Prometheus 已按抓取令牌方式配置：

```yaml
# docker/monitoring/prometheus/prometheus.yml（节选）
scrape_configs:
  - job_name: cloudcad-backend
    metrics_path: /api/metrics
    bearer_token: ${SCRAPE_TOKEN}   # 与后端 SCRAPE_TOKEN 保持一致
    static_configs:
      - targets: ['cloudcad-app:80']
```

自建 Prometheus 推荐用 `bearer_token_file` 避免令牌落明文配置：

```yaml
scrape_configs:
  - job_name: cloudcad-backend
    metrics_path: /api/metrics
    bearer_token_file: /etc/prometheus/scrape-token   # 文件内容仅为令牌本身
    static_configs:
      - targets: ['backend:3001']
```
