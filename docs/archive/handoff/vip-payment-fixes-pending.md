# VIP / 支付修复 — 遗留待办清单

> 由 code-review 与验证流程产生，非本次修复范围内的遗留项。优先级为建议顺序。

## 1. i18n 新 key 提取与补译（P1）

本次修复新增/修改了 `t()` 源文本，VoerkaI18n 未提取，多语言环境会回退中文：

| 新增/变更 key | 位置 |
|---|---|
| `永久有效` | MemberCenter.tsx:302 / ProfileMembershipTab.tsx / MembershipBadge.tsx |
| `VIP1 用户每日 100 次`（原 500） | MemberCenter.tsx:111 |
| `VIP1 为 100 次/日，VIP2 为 1000 次/日`（原 500/2000） | MemberCenter.tsx:139 |
| `剩余 {months} 个月 {days} 天` / `剩余 {months} 个月` / `剩余 {days} 天` | MembershipBadge.tsx（已改为带空格 key，需确认语言包存在） |

处理：`pnpm i18n:extract` → 编辑 `translates/messages/default.json` 补 4 语言 → `pnpm i18n:compile -t`。同时清理因文案变更产生的僵尸条目。

## 2. ~~后端集成测试编译失败（P1，属 @cloudcad/db 迁移中间态）~~ ✅ 已解决

`pnpm --filter backend test:integration` 现 **22 个 suite / 238 个测试全部通过**。修复内容：
- **Prisma 7**：9 个测试文件 `new PrismaClient()` 补 `{ adapter: new PrismaPg(...) }`（对齐 `src/test/global-setup.ts` 范式）
- **jest 基础设施**：`src/test/setup.ts` 的 ioredis mock 升级为功能版（共享存储 + pub/sub 总线，补 `on/duplicate/subscribe/publish/unsubscribe/multi/eval/setex/decr/scan`）；`test/jest-integration.json` 移除 `resetMocks/restoreMocks`（会清空 AppModule 内 mock 实现）
- **bootstrap 对齐 main.ts**：新增共享 helper `src/test/integration-app.ts`（`initIntegrationApp` 启用 URI 版本化 v1 + ValidationPipe），22 个 AppModule 类测试改用之
- **API 形状适配**：成功响应被 `ResponseInterceptor` 包成 `{code,message,data,timestamp}`（断言改 `response.body.data.*`）；login 用 `account` 字段且返回 200；username 需匹配 `^[a-zA-Z0-9_]{3,20}$`；admin 凭据用 `.env` 的 `INITIAL_ADMIN_EMAIL/PASSWORD`
- **schema/服务重构适配**：`FileSystemService`→`FileTreeService`、`FileOperationsService`→`NodeTrashService`、`role`→`roleId`、`externalRefInfo` 移除、`UserStatus.DELETED`→`INACTIVE`、`lastSyncedVipTime`→`externalVipExpiresAt`、import 深度 `../../../src`→`../../src` 等；`roles.service.update` 断言改 `objectContaining`；权限策略/Cls 等新 DI token 补齐 mock
- **源码修复（2 处真 bug）**：`auth-token.service.ts` 补 `jti: randomUUID()`（同秒签发 refresh JWT 完全相同撞唯一约束）与 `refreshToken()` 验签 try/catch 抛 401；`src/test/test-utils.ts` `MockUser.role` 类型对齐当前模型

> ⚠️ 测试库准备：本地需先建 `cloudcad_test`（`CREATE DATABASE`）→ `DATABASE_URL=...cloudcad_test pnpm prisma migrate deploy` → `pnpm db:seed` → 手工把 `runtime_configs.paymentEnabled` 置 `true`（或 seed 中补）。`httpx` 空目录问题曾需 `pnpm install --force` 修复。
>
> ⚠️ `src/main.ts` 仍有两处 `session.userId` 类型报错：`src/common/types/session.types.ts` 等文件被并行重构删除所致（`cls.middleware.ts`/`version-neutral.decorator.ts` 同批），属其他进行中工作，非集成测试修复引入。

## 3. 代码低危项（P2，按需处理）

- `wechat-ip.guard.ts`：直接信任 `x-forwarded-for`（直连部署可伪造），IPv6 输入 parseInt→NaN 永不匹配。建议可信代理后改 `req.ip`。
- `rate-limit.guard`：`@Public()` 使 webhook 落入公开限流 100/min/IP，微信集中 IP 高并发回调可能偶发 429（微信带退避重试，影响有限）。
- `node-copy-move.service.ts`：移动节点到自身子树无循环检测；移动配额主体用 `node.ownerId`（成员移动他人文件按文件所有者配额）——语义需产品确认。
- `membership.service.ts getMembership`：永久会员 `daysRemaining = Infinity`，JSON 序列化为 null；前端已按 `expiresAt===null` 兜底，若其他消费端直接用该字段需注意。
- `mock-payment.gateway.ts`：`orders` Map 为实例级，多实例部署 mock 永不自动完成（仅 dev 影响）。

## 4. 数据语义待统一（P2）

- ~~`billing.service.ts hasValidExternalWatermark`：字段 `metadata.lastSyncedVipTime` 实际承载"外部会员到期时间"，字段名有误导~~ ✅ 已解决：metadata 键重命名为 `externalVipExpiresAt`（含读取方、ADR-0018、CONTEXT.md、测试 fixture 同步），明确语义为"外部会员到期时间"，外部同步写入见 ADR-0018。
- **永久会员付费购买无时长收益**（`membership.activate` 对永久会员只提升 tierLevel 不叠加时长）：需产品确认"永久会员再购买"预期。

## 5. 已修复项快速索引（对照）

见本次会话修复：
- 阻断级：webhook `@Public()`、微信内 NATIVE 降级、refund 重算移出事务、P2002 孤儿订单、永久会员全链路
- 中危：订单状态写回守卫、TIMEOUT 终态对账、repay 陈旧单、PERSONAL_STORAGE 误计、登录/管理端有效期判定、profile 密码剔除、MWEB `mweb_url`
- 低危：nonce 移除、/32 掩码、total_fee 严格解析、时区统一、save/saveAs 配额异常传播、覆盖保存增量、非 CAD 直传配额等
