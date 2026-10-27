# 0083 — 统一用户事件流：全浏览器共享一条 SSE 长连接（命名事件 + 事件票据 + Web Locks 跨标签领导者选举）

**Status**: accepted（2026-10-27）

## 背景

线上（.139 部署）与本地均复现「开 3 个 CAD 标签后第 3 个彻底卡死、关掉它其余标签恢复」的故障。netstat 实证根因：

- 浏览器 HTTP/1.1 每主机连接上限 **6**；
- 旧架构**每个标签**各开 **2 条常驻 SSE**（`/v1/users/profile/account-events` 账户事件 + `/v1/notices/stream` 通知流），N 个标签 = 2N 条常驻代理连接；
- 3 个标签 = 6 条，连接池占满，该主机上**所有**后续请求（静态资源、API）排队卡死；关一个标签释放 2 条，其余恢复——与用户观察完全吻合。

修复必须在**应用层**（协议无关）：客户自管 nginx / 宝塔 + ESA CDN 等边缘形态下，我们无法控制其是否启用 HTTP/2，协议层修复（h2c）不成立。

## 决策

### D1 后端：users 模块统一端点，SSE 命名事件多路复用

- 新端点 `GET /v1/users/events/stream?ticket=`（`@Public() + @ApiExcludeEndpoint()`，ADR-0034 豁免，不进 SDK）：一条 SSE 连接承载两类**命名事件**——`event: account`（EventEmitter2 每用户通道，进程内）与 `event: notice`（Redis pub/sub 跨节点扇出，复用 NoticeSseService 的原始连接 attach 机制）。
- 帧载荷与旧端点**逐字节兼容**（前端消费逻辑不变：都是「有变化」的纯信号，收到后整表重拉权威数据）；建连首帧推 notice 快照帧（保住旧通知流首帧语义），account 不推初始帧；15s 保活（`sse.helpers.ts` 单一出口）。
- 端点归 **users 模块**（账户事件本就属 users；notice 侧以 attach 方式挂接，NoticeCenterModule 单向被引，无环）。
- **旧端点全部保留**（`profile/account-events`、`notices/stream`）：移动端与存量 PC 构建仍在用，退休排后续票（expand-contract 收尾）。

### D2 鉴权：复用一次性事件票据，JWT 不落 URL

- 建连前经 SDK `noticeCenterControllerIssueTicket`（JWT 守卫）签发一次性 ticket（Redis GETDEL 消费、5min TTL、签发限流 60/min），SSE 请求只带 `?ticket=`——长连接 URL 里不放 JWT（代理日志/Referer 泄露面）。
- 票据机制零改动，原样复用通知流既有实现。

### D3 前端：模块级协调器 + Web Locks 跨标签领导者选举

- 新服务 `services/userEventStream.ts`（模块级单例，形态对齐 `batchDownloadProgress.ts` 先例）：出口 `subscribeUserEvents('account' | 'notice', handler) → unsubscribe`。
- **领导者**：抢 Web Lock `cloudcad-user-events:<userId>` → 签 ticket → 开**全浏览器唯一一条** EventSource；命名帧分发给本标签订阅者，并经 `BroadcastChannel` 扇出给跟随标签。
- **跟随者**：不开连接，只听 BroadcastChannel；领导者标签关闭/崩溃时浏览器自动释放锁，排队中的跟随者立即接管。
- **降级**：无 Web Locks / BroadcastChannel 的老浏览器 → 每标签直开统一流（每标签 1 条连接，仍优于旧的 2 条）。
- 断连/401 → 关流、重签 ticket、指数退避重连（5s 起、30s 封顶，收帧成功重置）；最后一个订阅者移除即关流放锁。
- 接线：`AuthContext`（account → `refreshUser()`）与 `useNoticeStream`（notice → 整表重拉，轮询/visibilitychange 兜底保留）改接协调器；按需进度流（转换/批量下载/打开图纸）零改动。

### D4 已否决备选

| 备选 | 否决理由 |
|---|---|
| 维持现状（每标签 2 条 SSE） | 3 标签即占满 6 连接上限，故障即由此而来 |
| 仅修协议层（h2c / 强制 HTTP/2） | 客户自管 nginx、宝塔 + ESA CDN 等边缘形态不可控；HTTP/2 下每主机连接上限问题虽缓解，但边缘不升级时故障原样存在。应用层收敛对任意边缘形态都有效 |
| 后端自定义单连接多路复用协议（非 SSE 的自定义帧协议） | 过度设计：SSE 原生支持命名事件，语义等价且浏览器 `EventSource` 自带断线重连；自研协议要自己实现重连/心跳/代理兼容 |
| 心跳自愈（检测连接池耗尽后主动断流） | 治标：不减少连接数，只是把卡死换成事件丢失；且「检测耗尽」在浏览器侧无可靠 API |

### D5 已知取舍：领导者冻结

领导者标签**冻结**（未关闭、无响应）时，Web Lock 不释放，跟随者持锁等待、无法接管——该浏览器内事件推送暂停，直到用户关闭领导者标签（锁自动释放、跟随者接管）。已接受并记录：冻结标签本身已不可交互，其持有的连接对「能操作的标签」是纯负担，关标签即恢复；轮询兜底（通知 30s 轮询）保证最坏情况下事件延迟有界。

## 后果与代价

- **连接数**：N 标签从 2N 条常驻 SSE 降为**全浏览器 1 条**（降级模式 N 条）。3 标签场景从「占满卡死」变为「1 条」。
- **三层联动**：后端新端点 + 服务（users 模块引 NoticeCenterModule）；API SDK 零改动（端点 `@ApiExcludeEndpoint`，ticket 签发函数 SDK 已有）；前端协调器 + 两处接线。DB 零改动。
- **测试**：后端单测（服务帧语义 + 控制器票据校验）+ 集成测试（真 Redis：account/notice 双命名帧、票据兑换、断连清理）；前端协调器 spec（双模块实例模拟双标签：选举/扇出/接管/退避/降级）+ 接线 spec 适配。
- **旧端点双轨期**：移动端未迁移前，`profile/account-events` 与 `notices/stream` 保留；移动端迁移与旧端点退休排后续票。
- **部署文档**：客户自管 nginx/反代时 SSE 需 `proxy_buffering off` + 长读超时（服务端已发 `X-Accel-Buffering: no`，nginx 默认即遵守；反代若强制 buffering 需显式关闭）——已补入部署说明。

## 相关

- **ADR-0034** — `@ApiExcludeEndpoint` 豁免（ticket 鉴权的 SSE 端点不进 SDK）
- **ADR-0080** — 通知呈现分级与已读/已看拆分（本 ADR 的 notice 事件是其推送通道）
- **ADR-0059** — 部署运行时（部署说明的反代 SSE 小节随其文档体系维护）
- `packages/backend/src/users/user-events-sse.service.ts` — 统一流服务（命名帧/快照/保活/清理）
- `packages/frontend/src/services/userEventStream.ts` — 跨标签协调器（选举/扇出/退避/降级）
- `CONTEXT.md` — 「用户事件流」「事件票据」词条
