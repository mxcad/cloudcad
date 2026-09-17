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
| `cleanup_records_deleted_total{task}` | Counter | 后台清理任务累计删除记录数（#325 / ADR-0055 §7） |
| `cleanup_space_freed_bytes{task}` | Counter | 后台清理任务累计释放磁盘字节（仅可统计字节的任务产生序列） |
| `cleanup_last_duration_seconds{task}` | Gauge | 各清理任务最近一次运行耗时（秒） |
| Node.js 运行时指标 | 默认 | 进程内存、CPU、事件循环延迟等（`collectDefaultMetrics`） |

## 清理任务指标（#325）

`CleanupMetricsService.observe({ task, recordsDeleted?, spaceFreedBytes?, durationSeconds })`
是唯一的埋点接缝：同时更新上述三个指标并向应用日志写一条结构化 JSON
（`event=cleanup_run`，字段 `task / rows / freed / duration`，单位秒），单一代码路径
保证日志与指标数值一致。各清理 scheduler 在裸执行函数（定时 + 手动触发共用）中调用。

`task` 标签取值统一来自 `TASK_NAMES` 常量（如 `storage-cleanup:expired-storage`）。

### 失败分级语义（ADR-0055 §7）

- **完全失败** → P1 `task_run_failed`（沿用现有链路，15min 同源聚合邮件）
- **部分成功**（已删部分但有单项失败）→ P2 `cleanup.partial`，detail 携带
  `errorCount + errorSummary`（前 10 条），每日日报汇总

### 生产环境采集结构化日志

生产根级别默认 `warn`，`cleanup_run` 日志不落盘。需要时设置：

```bash
LOG_LEVEL=info   # 仅影响落盘流；stdout 的 pino/file 目标保持 warn 不刷屏
```

### 备份轮转埋点说明

`backup:*` 任务的 cleanup_* 埋点随备份工作流落地后补齐（避免与备份工作流并行改动冲突）。

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
