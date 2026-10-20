# 0076 — 日志级别分裂：实时流 error / 落盘流全量

**Status**: accepted（2026-10-20）

所有服务的实时日志（stdout）默认只放行 `error`，落盘日志保留全量（默认 `debug`）。覆盖四条应用服务（backend / conversion-service / storage-service / config-service）与 Redis；PG 与其他组件不动。

## 背景

运维只看错误、排障要全量，但这两条诉求此前绑在同一个开关上：

- **backend**（ADR-0055 §1）的 `LOG_LEVEL` 同时决定 pino 实例根级别与 pino-roll 落盘级别。生产默认 `warn`，而 pino 的实例级别是**硬门槛**——`info`/`debug` 记录在产生时即被丢弃，落盘流永远拿不到。`cleanup_run` 结构化日志因此默认不落盘，#282（清理任务指标埋点，原 GitHub #325）只能临时 `LOG_LEVEL=info` 补救。
- **conversion-service / storage-service / config-service** 的三份手写 JSON logger 此前**零级别过滤**：`log()` 全量写 stdout + 全量写文件。

即 backend 是「两边都只有 warn 以上」，三个服务是「两边都全量」——没有一个服务真正做到「实时少、文件全」。

## 决策

- **两条流各自限级**，env 同名同义：`LOG_FILE_LEVEL`（默认 `debug`）与 `LOG_CONSOLE_LEVEL`（生产默认 `error`，开发默认 `debug`）。
- **backend 的 pino 根级别 = 文件级别**。根级别是硬门槛，落盘流拿不到根级别之外的记录，所以「文件记全量」必须靠抬高根级别实现；实时流靠 transport target 自己的 `level` 收口到 `error`。
- **三份手写 logger** 在 `writeLine()` 内按级别分别判断：实时流 `isAtLeast(level, console)`，落盘流 `isAtLeast(level, file)`，两者独立。
- **Redis**（裸机形态）`redis-manager.js` 追加 `--logfile data/logs/redis.log --loglevel notice`：Redis 的 `logfile` 非空即关闭 stdout 输出，恰好原生实现「实时零输出 + 文件全量」。
- **PG 不动**：`pg_ctl start -l data/logs/postgres.log` 早已把日志引到文件，控制台本就零 PG 输出。

## 可测性接缝

级别分裂真正的风险点是「三个赋值点分别取对值」——pino 的根级别、stdout target 的 `level`、pino-roll target 的 `level`。此前这份 pinoHttp 配置是 `app.module.ts` 模块顶层的内联对象字面量，只能靠启动整个 NestJS 应用再起 pino transport 子进程才能观测。为此把它抽成无装饰器的纯函数 `buildPinoHttpOptions(logLevels, logDirAbs, logRetentionDays, isProduction)`（`src/config/pino-http-options.ts`），`app.module.ts` 只做一行调用。搬家不改变运行时行为，同一份对象字面量；返回类型刻意不标注 pino-http 的 `Options`——`pino-http` 不是 backend 的直接依赖，只由 `nestjs-pino` 传递引入，`import type` 解析不到，改由调用点做结构性检查。

- `resolveLogLevels()`：backend 14 例 + 三份手写 logger 各 8 例，覆盖默认值、env 优先级、旧别名、非法值回落。
- `buildPinoHttpOptions()`：13 例，断言根级别 = 文件级别、生产实时 target = `error`、落盘 target = 文件级别、`LOG_CONSOLE_LEVEL` 只动实时流、`LOG_FILE_LEVEL` 只动根 + 落盘、两条流级别互不影响、生产/开发 target 分叉、pino-roll 路径与 `limit.count`、流清单恰为两条且 `autoLogging: false`、redact 敏感路径未随抽取丢失、`mixin()` 未初始化时返回空对象。

Redis 那边是同一个缺陷类：`redis-manager.js` 的 argv 也是内联数组，而「Redis 实时零输出」的全部依据就是 `--logfile` 这个参数在不在——参数被删掉没有任何测试会红。argv 组装同样抽成纯函数 `buildRedisArgs({ port, dataDir, logFile, authConfPath })`（`runtime/scripts/lib/redis-args.js`，纯函数无顶层副作用，与 `lib/redis-takeover.js` 同约定），6 例断言 `--logfile`/`--loglevel notice` 恒在、密码经配置文件时置于 argv 首位且命令行不出现 `--requirepass`、`--port`/`--dir`/`--appendonly` 必须留在命令行（`detectRedisOwnership` 靠 cmdline 里的数据目录判实例归属）。密码配置文件写不进去的 `--requirepass` 降级分支留在 `startRedis()`，不放进纯函数。

**唯一剩余的不测项**：不在运行时断言「pino 真的按 target 级别压制了 stdout」「Redis 真的因为 `--logfile` 而不写 stdout」。前者是 pino 自己的契约，后者是 Redis 自己的契约——断言它们等于测试上游库本身。我们这一层能断言的只有「配置数据形状正确」，pino 与 Redis 两侧都已覆盖。

## 已接受的代价

**`LOG_LEVEL` 保留为旧别名**（优先级 `LOG_FILE_LEVEL` > `LOG_LEVEL`）。已部署实例的 `.env` 里写着显式 `LOG_LEVEL=warn`，直接删掉这个名字会让「想收敛落盘体量的人」静默升级成 debug 刷屏。代价：这些实例的落盘级别**不会自动变成 debug**，要拿全量须删除该行或改名。

**`resolveLogLevels()` 保留 4 份重复**（backend `src/config/log-levels.ts` + 三份手写 logger）。收敛目标是既有的 `@cloudcad/contracts`（后端域、有 scan:purity 门禁、tsc→dist 产物线），不需要新建包；真正的成本在依赖面——config-service 与 storage-service 当前**零 `@cloudcad/*` 依赖**，收敛等于给这两个零依赖服务引入首个 workspace 依赖，须同步离线安装清单三处（`pack-offline.js` / `setup-offline.js` / `verify-deploy.js`）并复验断网验证门禁。另注：contracts 的 purity 门禁禁 `process`，共享实现必须吃 env 快照参数、不能读 `process.env`。与本次改级别的体量不匹配，另立票据。`@cloudad/platform` 是跨端（PC / 移动端）共用层，承载后端日志级别解析器是错误归宿。

**级别审计只提级「明确的失败语义」**：`conversion-service` 启动失败 / Redis 持久化与删除失败 / Redis 不可用回退 / 任务记录损坏跳过 / 回调失败与异常；`storage-service` 路由表加载失败 / SVN 提交与 cat 失败。以下**刻意不提级**：

- `storage-service` 令牌验证失败与非法操作 → `warn`（非 `error`）：逐请求触发，提到 error 会让攻击流量淹没 error-only 控制台。
- `storage-service` `svn log` E160013（首次提交前无历史）→ 保持默认：代码注释已明确这是正常空历史而非失败。
- `TaskStore` 崩溃恢复、同步等待中断、无路由表文件 → 保持默认：可自愈或预期状态。

**docker 形态的 Redis 不改**：容器内 `--logfile` 需要新增 bind mount，而 Redis 不自带轮转，宿主上会变成一个无界增长文件——反而不如现状 docker json-file driver 的 `max-size 50m × max-file 3` 轮转。

**mxcadAssembly / cooperate 是黑盒**，日志级别不可控。frontend dev（Vite 构建输出）不属运行期日志，不动。

## 后果

- 开发环境不受影响：`NODE_ENV != production` 时实时流默认 `debug`，backend 仍走 pino-pretty 全量彩色输出。
- 实时排障有逃生口：`LOG_CONSOLE_LEVEL=info`（或 `warn`/`debug`）临时放开，不影响落盘级别。
- **warn 级日志从此只进文件**（登录失败、`INITIAL_ADMIN_PASSWORD` 未设置、清理备份失败等）。需要看时用 `LOG_CONSOLE_LEVEL=warn`。
- **落盘体量上升**：backend 从 `warn` 抬到 `debug` 后，180 天保留期内的 app.log 体量明显增长；反向收敛用 `LOG_FILE_LEVEL=info`。访问日志（`access-logger.ts`，独立 pino 实例 + 独立文件）不受影响。
- `LOG_LEVEL=info` 采集 `cleanup_run` 的旧说明已失效（默认 `debug` 已覆盖），`src/metrics/README.md` 与 `cleanup-metrics.service.ts` 注释已同步更新。
- 日志中心新增 `redis` 源（`data/logs/redis.log`），`logs:bundle` 一并打包。
