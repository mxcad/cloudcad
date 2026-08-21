# 0057 — 历史版本访问的权限与限频模型（游客/分享/登录三态）

**Status**: accepted

历史版本查看（`GET /mxcad/filesData/*path?v=N`，触发 bin→mxweb 转换）的访问控制与频率限制模型，按身份维度区分三态：登录用户受限、游客（未登录、无分享链接）拒绝、分享访问（shareToken）放行且不限频；其中「分享链接 + 版本参数」组合口子**有意不封堵**。

**Background / 触发背景**

- 历史版本访问会触发 bin→mxweb 转换，消耗转换引擎算力，因此需要防滥用（登录用户窗口限频，ADR-0043 同源）。
- 但「把图纸分享出去给他人查看」是核心功能，不能因限制历史版本访问而破坏分享查看。
- 需要明确三类身份的边界：游客（未登录、无分享链接）、被分享者（shareToken）、登录用户。
- 转换结果必落缓存（`_v<rev>.mxweb`），同一版本只转换一次，这是「不封堵分享+版本」决策的技术前提。

**Decision**

1. **身份维度三层，行为互不重叠**：

   | 身份 | 版本图纸访问（`?v=N`） | 限频占位 | 说明 |
   |------|------------------------|----------|------|
   | 登录用户 | 允许 | 按 `userId` 占位 `quota.history_window_count` | 首次转换前 `reserveHistoryCountOrThrow`；缓存命中不占位；转换失败 `releaseHistoryCount` 回补；超限 403（窗口小时数复用 `quota.conversion_window_hours`，Redis 键 `history:window:user:{userId}:{slot}`） |
   | 游客（未登录、无 shareToken） | **拒绝**（401 请先登录） | 不涉及 | `authorizeFilesDataAccess` 在无 shareToken 且无 `req.user` 时抛 `UnauthorizedException`；前端版本历史入口由 `VERSION_READ` 权限派生（游客无权限）隐藏 |
   | 分享访问（shareToken） | 允许（含拼接 `v=N` 访问历史版本） | **不占位、不限频** | `validateShareFileAccess` 校验 token + 路径匹配后放行；无 `userId` → 不调用 `reserveHistoryCountOrThrow` |

2. **分享 + 版本参数（`shareToken & v=N`）口子不封堵，保持现状**：
   - 分享校验只比对 token 与文件路径，**不拦截版本参数**。正常前端分享流程只加载当前版本（不传 `v`），只有人为构造 URL 才会组合到历史版本。
   - 不封堵理由：
     a. **分享是核心功能**，分享与版本访问是两个独立概念，不应因版本访问的防滥用设计而收窄分享授权范围。
     b. **版本访问必有缓存**：首次访问分片下载 + bin→mxweb 转换生成 `_v<rev>.mxweb`，之后命中缓存秒开、不重复转换；同一版本只转换一次，成本可控。
     c. **滥用面有限**：被分享者无 `userId` 不占配额，但分享 token 只对应单个文件、版本号范围取决于该文件历史 commit 数，且分享可随时撤销。
     d. 封堵需在 `authorizeFilesDataAccess` 或版本入口判断 `shareToken && v`，复杂度与收益不成比例。

3. **限频只在真正执行转换处发生**：缓存命中（含等待同一转换的其他请求）直接返回不占位；无 bin 分片（走 `_initial`/原始文件兜底）不占位；游客（分享访问）无 `userId` 不限制。与 ADR-0043「限制只发生在转换执行点」同一原则。

**Rejected options**

- **封堵分享 + `v` 参数**（在分享校验或版本入口拒绝「shareToken 且带版本号」的请求）：否决原因——分享是核心功能，被分享者查看分享文件的版本快照未超出分享者授权范围；版本访问有缓存兜底，滥用成本已被「单文件 + 单版本一次转换 + 可撤销分享」约束；封堵引入额外判断逻辑且需前后端联动（前端分享页不传 v，收益仅防人为构造 URL）。

**Cross-references**

- ADR-0043 转换频率限制（窗口化）：同一窗口机制与「限制只发生在转换执行点」原则
- ADR-0036 会员状态读侧权威：限制值经 `MembershipService.getQuota` 解析
- ADR-0022 配置注册表共享模块：窗口键注册进 `ConfigKeyRegistry`（运行时配置）
- `packages/backend/src/vip/quota-keys.ts` → `HISTORY_WINDOW_COUNT`
- `packages/backend/src/vip/restriction-engine.service.ts` → `reserveHistoryCountOrThrow` / `releaseHistoryCount`
- `packages/backend/src/mxcad/core/mxcad-version-history.service.ts` → `handleHistoricalVersionRequest`（游客无 userId 不占位）
- `packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts` → `authorizeFilesDataAccess`（游客 401）
