# 0044 — IP 黑名单：应用层手动管理 + 自动封禁预留
**Status**: accepted

实施平台级 IP 黑名单：管理员在后台手动将恶意来源 IP/CIDR 加入黑名单，该来源的所有请求被全局拦截（403）。决定在后端应用层（NestJS Guard）实现而非运维层（nginx/fail2ban/iptables），本期只做手动管理、模型为自动封禁预留 `source` 字段。触发背景：平台仅有 IP 维度短时限流（`RateLimitGuard`，窗口过自动恢复），缺少持久、可审计、可撤销的"彻底拒绝"手段；后端 `admin` 模块与前端 `/admin/*` 页面体系已就绪，缺少安全运营管理面。

**Decision**

1. **执行层 = 后端应用层**：新增全局 `IpBlacklistGuard`，注册在 `RateLimitGuard` 之前，拦截所有请求（含登录、公开接口），命中返回 **403** 且不向请求方泄露黑名单详情。运维层（nginx/fail2ban/iptables/高防）不进产品代码，仅作为部署文档可选项（补充 L4/L3 防护）。理由：管理面产品化（UI/权限/审计/撤销）、多实例与容器化部署一致；`RateLimitGuard` 的 IP 提取（X-Forwarded-For/CLS）基建复用。
2. **本期范围 = 仅手动管理**；自动封禁（异常 IP 检测 → 写入 `source:'auto'` 条目）是**独立后续任务**，本期不实现。判定逻辑（触发源、误伤容忍、是否人工确认）是独立安全设计，与手动管理捆绑会膨胀且无法验收。
3. **匹配粒度**：精确 IP + CIDR（含 IPv6），`node:net`/ipaddr.js 严格校验（掩码位对齐），防管理员手滑封错段。
4. **生命周期**：`expiresAt` 可空（空 = 永久，仅可人工移除；非空 = 到期惰性失效，查询时过滤，无定时任务）。移除 = 物理删除，不做停用状态；操作痕迹由审计日志（AuditLog）承担，条目自身记录 `createdBy`。
5. **权限**：新增 `SYSTEM_IP_BLACKLIST_MANAGE`（读写一体），默认仅 ADMIN 角色。**部署升级规则（本 ADR 的关键约束）**：新权限点必须**双写**两处——`initialization.service.ts` 的 `createSystemDefaultRoles()` ADMIN permissions 数组 **和** `permissions.enum.ts` 的 `SYSTEM_ROLE_PERMISSIONS[ADMIN]`；存量部署升级后由启动初始化服务幂等补齐 ADMIN 角色权限关联（`createMany` + `skipDuplicates`，已有机制），**不手写 INSERT SQL**。漏双写一处 = 存量部署升级后 ADMIN 无权限。
6. **模块**：独立 `packages/backend/src/ip-blacklist/`（`IpBlacklistService` + `IpBlacklistGuard` + `IpBlacklistController`），管理 API：`GET /api/v1/admin/ip-blacklist`（分页列表）、`POST`（添加 `{ ip, reason, expiresAt? }`）、`DELETE /:id`（移除），`@RequirePermissions(SYSTEM_IP_BLACKLIST_MANAGE)`。
7. **缓存与降级**：Redis 缓存（精确 IP 用 SET、CIDR 线性扫描）+ **DB 为权威源**；缓存故障回源 DB，DB 挂才 fail-open。**降级哲学区分**：限流可 fail-open（丢的是拦截），黑名单不能 fail-open（丢的是安全）。
8. **三层联动**：后端 DTO 落地后 `generate:swagger` → `generate:api-types` 重生成 SDK，前端调用一律走 SDK 生成函数（禁 fetch）；前端新增 `pages/IpBlacklistPage` + 路由 `/admin/ip-blacklist` + Layout 导航（仅权限可见）。
9. **数据库**：新增 `IpBlacklistEntry` 表 + `Permission` 枚举加 `SYSTEM_IP_BLACKLIST_MANAGE`，走 `prisma migrate dev` 生成 migration 并提交，生产 `migrate deploy`（禁 db push）。新表无存量数据迁移。

**Rejected options**

- **运维层实现（nginx/fail2ban/iptables）**：单机方案，多实例要逐台配置；无审计、无撤销路径、封禁=人工运维动作而非产品功能；SaaS/容器化部署不可行。仅保留为部署期可选补充层（L4/L3 防护），不进代码。
- **自动收集本期并入**：异常 IP 判定（触发源：登录失败频次/限流超阈值/扫描特征；误伤容忍度；人工确认）是独立安全策略设计，需要自己的决策树；模型已预留 `source:'auto'`，届时为增量开发（检测器写条目，判定/管理/拦截全复用）。
- **fail-closed（缓存故障全拒）**：一次 Redis 抖动全员 403，误伤所有用户。
- **不预留 `source` 字段**：将来迁移成本高于现在一个枚举字段；且会模糊"自动封禁与手动黑名单共用同一模型"这一领域结论。
- **塞进现有 admin 模块**：`admin.controller.ts` 已是杂项集合（stats/缓存清理），黑名单有独立生命周期、独立全局 Guard、独立缓存，应独立成模块。

**Status**: accepted

**Cross-references**
- CONTEXT.md「IP 黑名单（IP Blacklist）」「IP 黑名单条目（Blacklist Entry）」
- ADR-0043 转换频率限制（游客按 IP 计数的先例）
- AGENTS.md 数据库迁移工作流（migrate dev → 提交 migration → 生产 migrate deploy）
- `RateLimitGuard`（common/guards/rate-limit.guard.ts）：IP 提取与全局拦截先例
