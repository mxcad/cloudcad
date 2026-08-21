# Metrics 模块

Prometheus 监控埋点：记录后端所有 HTTP 请求的计数与耗时，并暴露标准指标端点，供 Prometheus 定时抓取、Grafana 展示。

## 指标端点

```
GET /api/metrics   （Prometheus 文本格式，已从 Swagger 排除；需 SYSTEM_MONITOR 权限，无权限返回 403）
```

> 权限：`metrics.controller.ts` 类级 `@RequirePermissions([SystemPermission.SYSTEM_MONITOR])`（5efe51ab，原公开端点）。Prometheus 抓取需配置携带含 SYSTEM_MONITOR 角色（如 ADMIN）的 JWT，或经反向代理注入。

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
# 手动查看原始指标（需 SYSTEM_MONITOR 权限的 access token）
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/metrics
```

## 接入 Prometheus（部署时配置）

目前仓库部署体系（docker-compose / helm / nginx）尚未包含 Prometheus 采集端，如需接入：

1. 部署 Prometheus，配置抓取任务：
   ```yaml
   scrape_configs:
     - job_name: cloudcad-backend
       metrics_path: /api/metrics
       static_configs:
         - targets: ['backend:3001']
   ```
2. （可选）部署 Grafana，用 PromQL 查询指标并配置告警，示例：
   - `sum(rate(http_requests_total[5m]))` → QPS
   - `histogram_quantile(0.95, http_request_duration_seconds_bucket)` → P95 延迟
