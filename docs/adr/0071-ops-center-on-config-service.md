# 0071 — 运维中心（Ops Center）建在 config-service

**Status**: accepted（2026-10-01）

## 背景

私有化部署的运维目前只有 CLI 交互菜单（`cloudcad.bat`/`cloudcad.sh` → `runtime/scripts/cli.js`），对运维小白门槛高；菜单混入排障项（仅启动基础服务/图纸版本检查/验证），日志分散在多处且无打包能力。需求：网页化的运维入口（运维中心），让零运维经验的人完成日常运维，且底层必须复用 CLI 命令函数、不写第二套逻辑。

## 决策

运维中心建在 **config-service（3002）**：UI 扩展其自带管理页（`public/index.html`），执行层通过 `require('runtime/scripts/commands/*')` 函数级复用 CLI 命令，CLI 交互菜单仍是运维能力的单一事实源、config-service 只做薄壳。长任务（部署/迁移/日志打包）一律**后台 job + 进度落盘 `data/ops/current-task.json` + 页面轮询**，禁止在 HTTP 请求内同步执行分钟级任务（现有备份接口的同步 await 模式仅限秒级操作）。

## 决定性约束（为什么不是 backend + React 管理后台）

部署流程 `stopAppServices()` 停的应用层是 `['backend', 'frontend', 'conversion']`（`start.js:181`），config-service 属基础服务（`INFRA_PM2_NAMES`，`start.js:184`）**部署全程存活**。backend 承载部署类操作会在执行中途自停——响应断、进度无法回报，只能靠 detached 子进程 + 重启后轮询等复杂补丁救。而 config-service：①部署全程存活，是唯一能从头驱动到尾的进程；②与 runtime/scripts 同为 CommonJS，可直接函数级 require；③已具备服务启停（`/api/service/*`）、DB 备份恢复（`/api/db/*`）、下载 token、独立鉴权端点，遵循零依赖哲学；④自带现成管理页。

## 否决方案

- **backend ops 模块 + React admin 页**：权限/审计/UI 组件/SDK 流程最全、体验上限最高，但「部署中途自停」是死穴；且 TS/webpack 工程复用 CJS 命令函数只能 spawn 子进程，间接。
- **混合（UI 放 React、执行放 config-service）**：两处代码、两套鉴权，最差。

## 后果（非显然约束）

- config-service 鉴权**删除 `admin123` 回退**：`INITIAL_ADMIN_PASSWORD` 未设置时拒绝登录，提示用 cloudcad 菜单的密码向导初始化（backend 侧该 env 本就必填无缺省，等保 8.1.4.1）。
- 运维密码（.env `INITIAL_ADMIN_PASSWORD`）与产品管理员密码（DB）初始相同、之后各改各的**不联动**——接受的边界：运维密码是部署机凭据，业务管理员密码是产品数据。
- 运维中心不经 `@cloudcad/api-sdk`（该 SDK 只服务 backend 的 OpenAPI 契约），PC 管理后台不消费 config-service；两层 UI 各自独立登录是特性而非缺陷。
- CLI 菜单的排障项（仅启动基础服务/图纸版本检查/图纸版本验证）按部署形态门控：**部署包隐藏、开发机保留**（`scope:'dev'` 过滤机制）；版本检查/验证在部署包内由部署向导自动执行，不再作为独立入口。
- 日志治理统一收口：全部日志源清单 + 打包（`data/log-bundles/logs-<时间戳>.zip`）在 CLI 与 Web 共用同一实现；部署/升级过程日志补落盘 `data/logs/deploy/`（此前 setup-offline/verify-deploy 只写控制台）。
