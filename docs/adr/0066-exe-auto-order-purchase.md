# 0066 — EXE 桌面端自动下单购买流程（EXE auto-order purchase flow）

**Status**: accepted
**Date**: 2026-09-14

## 背景

EXE 桌面端（独立项目，另一团队维护）需要引导用户在浏览器中完成会员购买并扫码支付。EXE 通过 OAuth 设备授权码流（ADR-0041）获取访问令牌后，拼接 `/member-center` 路由在系统浏览器中打开会员中心页面。

原始流程要求用户在页面上手动选择档位、时长，再点击购买——对 EXE 用户来说步骤过多。需求：EXE 打开浏览器后，页面**自动创建一个最低档 1 个月的订单**并展示微信支付二维码，用户直接扫码完成支付。

同时需要防止恶意调用者疯狂创建订单（刷单）。

## 决策

### 1. 路由：`/member-center?auto=1`

不新增 `/buy` 路由。EXE 只需在已有的 `/member-center` 后面加一个 query 参数即可触发自动下单流程，最小化 EXE 侧改动。

前端 `MemberCenter.tsx` 在 `useEffect` mount 时检测 `?auto=1`，执行一次自动建单后立即清除参数（`history.replaceState`），防止刷新重复触发。

### 2. 后端：`POST /api/v1/billing/orders/auto`

新增独立端点，不复用 `POST /orders`（后者需要前端传 `vipTierId` + `durationPricingId`）。

服务端自动选择：
- **档位**：`level > 0` 的最低有效 VIP 档位（排除 level=0 的免费档）
- **时长**：优先 1 个月，无 1 个月定价时回落为最小可用时长

复用 `createOrder` 的完整校验链（档位降级校验 + 2 小时同款 PENDING 订单复用 + 金额计算 + 订单记录），不新建逻辑。

响应体与 `createOrder` 一致，额外包含 `vipTierName` 和 `durationLabel`（前端合规展示订单内容）。

### 3. 防刷：双层限流

**ThrottlerGuard（IP 维度）**：全局注册 `APP_GUARD`，路由级 `@Throttle({ limit: 5, ttl: 60000 })` 限制同一 IP 每 60 秒最多 5 次。这同时修复了此前 7 处 `@Throttle` 装饰器因未注册 Guard 而空转的问题。

**AccountRateLimitService（账号维度）**：新增 `order_create` 动作，默认每账号每小时 10 次（env 可调）。失败时锁定账号。

双层限流互补：IP 限流防无认证刷单，账号限流防单账号高频调用。

### 4. 二维码形态：NATIVE

EXE 场景下用户在桌面浏览器扫码，使用微信支付 Native（二维码）形态。不删除 JSAPI/MWEB/APP 分支（保留移动端/公众号内场景的降级能力），但 `?auto=1` 入口默认传 `tradeType: 'NATIVE'`。

### 5. 前端合规展示

支付弹窗展示订单标签（如 "VIP1 · 1个月"），满足支付合规要求（用户需知晓购买内容）。`WechatPayModal` 新增可选 `orderLabel` prop，有值时在金额上方渲染加粗文本。

### 6. PlanSelectOverlay 默认时长改为 1 个月

原默认 3 个月改为 1 个月，与自动下单的默认时长一致，降低非 auto 路径的用户决策成本。

## 影响

- **前端**：MemberCenter.tsx（auto=1 检测 + 自动建单 + 支付弹窗）、WechatPayModal.tsx（orderLabel prop）、PlanSelectOverlay.tsx（默认时长 1 月）、api-sdk 重生成
- **后端**：billing.controller.ts（新增 `/orders/auto` 端点）、billing.service.ts（`autoCreateOrder` 方法）、billing.service.spec.ts（4 例新增）、billing/dto/auto-create-order.dto.ts（新建）、app.module.ts（ThrottlerGuard 注册）、auth/account-rate-limit.service.ts（`order_create` 动作）、config（`orderCreateMax`/`orderCreateWindowSeconds`）
- **EXE 侧**：仅需在 `/member-center` 后追加 `?auto=1`

## 备选方案

- **新增 `/buy` 路由**：否决。EXE 已拼 `/member-center`，新增路由需 EXE 侧改动，不如加 query 参数简洁。
- **复用 `POST /orders` + 前端自动填参**：否决。`createOrder` 需要前端传 `vipTierId` + `durationPricingId`，前端需先查询档位/时长列表再选，多一次网络请求且逻辑分散。独立端点让服务端完全控制选参逻辑。
- **前端定时重试自动建单**：否决。增加复杂度和不确定性，mount 时执行一次 + 失败展示错误 + 用户可手动重试即可。
