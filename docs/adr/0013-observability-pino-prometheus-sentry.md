# ADR-0013: 可观测性 — pino + Prometheus RED + Sentry
**Status**: accepted

## Status

Accepted

## Context

后端日志为 NestJS Logger 纯文本，无法被 ELK/Loki 解析；CLS 已设 traceId/requestId 但未注入日志输出；无任何性能指标暴露端点；生产错误定位依赖用户反馈。

## Decision

三层补全，互不阻塞：

1. **结构化日志** — 用 `nestjs-pino` 替换默认 Logger，JSON 格式，自动追加 `service`、`traceId`、`requestId`（从 CLS 读取）。开发环境用 `pino-pretty` 保持可读。现有 `this.logger.log()` 调用不改，参数作为 `msg` 字段保留。

2. **Prometheus RED 指标** — 用 `prom-client` 暴露 `/metrics` 端点，挂 NestJS 中间件记录：
   - `http_requests_total`（Counter，label: controller, status）
   - `http_request_duration_seconds`（Histogram，label: controller, bucket: P50/P95/P99）
   label 粒度为 Controller 级别，不按路由细分。

3. **Sentry 错误聚合** — 后端用 `@sentry/node` 在 GlobalExceptionFilter 上报 5xx + 未捕获异常，4xx 不过滤。前端用 `@sentry/react` 在 ErrorBoundary 上报组件崩溃。前后端共享同一 DSN，通过 `environment` 区分。

## Considered Options

- **winston**：功能更丰富但 pino 快 5x，本项目日志量不大差异不明显，选 pino 主要因为 `nestjs-pino` 的自动 request logging 减少胶水代码。
- **按路由粒度做 metric label**：会导致高基数（Prometheus 性能风险），选 Controller 级别足够定位问题。
- **Sentry 全量上报**：4xx 是预期行为，上报只会制造噪音。
- **ELK/Loki 不在本次范围**：只输出 JSON，采集端后续按需接入。

## Consequences

- 所有 Service/Controller 的 `Logger` 注入点不变，迁移成本接近零。
- `/metrics` 端点建议用 BasicAuth 或 IP 白名单保护，不在本次范围但需记入后续任务。
- 分布式追踪仍缺失，单实例 + monorepo 下优先级低。如未来拆微服务再补 OpenTelemetry。