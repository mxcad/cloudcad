# CloudCAD 计费模块（Billing）

## 概述

计费模块负责 VIP 会员付费购买的完整链路：**选套餐下单 → 支付网关下单 → 支付回调/查单 → 会员激活 → 退款重算 → 过期降级**。模块采用「支付网关抽象」设计：`PaymentGateway` 接口 + `PaymentGatewayFactory` 路由，目前内置微信支付（`wechat_pay`）与模拟支付（`mock`）两种实现，通过运行时配置切换，便于开发联调。

会员等级水位（activate / recalculateFromOrders / getEffectiveTier）已迁至 `vip` 模块的 `MembershipService`，billing 只负责"查订单、调网关、算金额、编排激活/重算"，数学归位 membership。

## 目录结构

```
src/billing/
├── billing.module.ts                    # 模块注册（imports/controllers/providers）
├── billing.controller.ts                # 用户端 + 管理端控制器
├── billing.service.ts                   # 核心业务：下单/回调/查单/退款（~800 行）
├── billing-cron.service.ts              # 定时任务：过期降级 + 超时关单
├── webhook.controller.ts                # 微信支付回调入口（XML）
├── wechat-ip.guard.ts                   # 回调 IP 白名单守卫（CIDR）
├── dto/                                 # 请求/响应 DTO
│   ├── create-order.dto.ts              #   创建订单
│   ├── repay-order.dto.ts               #   重新支付
│   ├── refund.dto.ts                    #   退款
│   ├── manual-complete.dto.ts           #   手动补单
│   ├── order-query.dto.ts               #   订单列表查询
│   └── order-response.dto.ts            #   下单/重支付响应
├── enums/billing.enum.ts                # OrderStatus 枚举
├── gateway/
│   ├── payment-gateway.interface.ts     # 支付网关抽象接口
│   ├── payment-gateway.factory.ts       # 网关工厂（按配置选择活跃网关）
│   ├── mock/mock-payment.gateway.ts     # 模拟网关（15s 自动完成）
│   └── wechat-pay/
│       ├── wechat-pay.gateway.ts        # 微信支付 V2 实现（统一下单/查单/退款）
│       └── wechat-pay.util.ts           # MD5/HMAC-SHA256 签名、XML 编解码
└── *.spec.ts                            # 单测（service/cron/factory/gateway/util）
```

## 核心组件详解

### 1. BillingModule（billing.module.ts）

```typescript
imports: [CommonModule, ConfigModule, DatabaseModule, RuntimeConfigModule,
          PermissionModule, StorageQuotaModule, AlertModule, TaskRunModule]
controllers: [BillingController, BillingAdminController, WebhookController]
providers: [BillingService, BillingCron, PaymentGatewayFactory,
            MockPaymentGateway, WechatPayGateway]
exports: [BillingService]
```

关键点：

- 依赖 `StorageQuotaModule`（`StorageInfoService`）：会员等级/到期变化后失效存储配额缓存，保证前端额度即时生效。
- 依赖 `RuntimeConfigModule`：`paymentEnabled`（支付总开关）、`TASK_ENABLED_KEYS.BILLING`（定时任务开关）。
- 依赖 `TaskRunModule` / `AlertModule`：定时任务注册手动触发（#210）+ 失败告警（#245）。
- 导出 `BillingService`；`app.module.ts` 与 `auth/auth.module.ts` 均注册了本模块（auth 侧未见直接消费 `BillingService`）。

### 2. BillingService（billing.service.ts）

核心方法一览：

| 方法 | 说明 |
|------|------|
| `createOrder(userId, dto)` | 校验套餐（vipTier/durationPricing 必须存在且 isActive）→ 防降级（`getEffectiveTier`）→ 算价 → 2h 内同款 PENDING 复用 → 网关下单 → 落库 |
| `createOrderRecord(...)` | 建单主逻辑（私有）；P2002 唯一索引并发冲突时"关陈旧单后重试"或复用同款 PENDING 单 |
| `handlePaymentNotify(verified)` | 支付回调统一处理：事务内 PENDING→SUCCEEDED（金额校验、并发守卫 updateMany），TIMEOUT/CLOSED 单走 `reconcileTerminatedOrder` 网关对账，成功则 `activateMembershipForOrder` 激活会员 |
| `refreshOrder(userId, orderNo)` | 查单兜底：网关 SUCCESS → 走回调路径；CLOSED → 关单；NOTPAY 超 2h → TIMEOUT |
| `repayOrder(...)` | 重新支付：陈旧 PENDING（>2h）先关旧单再建新单；新单防降级校验；重复下单前关闭旧单 |
| `mockScan(userId, orderNo)` | 仅 mock 网关：`forceComplete` 后走 `refreshOrder` |
| `refund(orderNo, reason)` | 仅 SUCCEEDED 可退：DB 状态 REFUNDED（事务）→ 网关退款（3 次指数重试，失败回滚状态）→ 事务外 `recalculateMembershipAfterRefund` 重算会员水位 → 失效配额缓存 |
| `manualComplete(orderNo)` | 手动补单：构造 verified 结果走回调路径（`manual_` + 时间戳作为 gatewayOrderId） |
| `handleWechatNotify(xml)` | 网关验签 → `handlePaymentNotify`，失败返回 XML FAIL |
| `getUserMembership` | 直接委托 `MembershipService.getMembership` |

**金额计算**：`amount = round(vipTier.baseMonthlyPrice × durationPricing.multiplierBps × months / 10000)`（分）。

**并发安全设计**：

- 状态流转一律 `updateMany` + PENDING 状态守卫，count===0 说明已被并发修改，直接跳过，避免 P2025 → 500。
- P2002 并发兜底：命中唯一索引冲突时复用/关闭陈旧 PENDING，不重复建单。
- 回调迟到场景：cron 已把订单标 TIMEOUT/CLOSED 后收到回调，向网关 `queryOrder` 对账（金额 + SUCCESS 双校验）确认已支付则激活会员，避免"已付款订单被吞"。

### 3. 支付网关抽象（gateway/）

#### 接口（payment-gateway.interface.ts）

```typescript
interface PaymentGateway {
  readonly name: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>; // 下单
  verifyWebhook(payload, headers): Promise<WebhookVerifyResult>;           // 验签
  queryOrder(orderNo): Promise<QueryOrderResult>;                          // 查单
  refund(orderNo, amount): Promise<void>;                                  // 退款
}
```

#### 工厂（payment-gateway.factory.ts）

- 注册表：`mock`、`wechat_pay` 两个实例。
- `getActiveGateway()`：运行时配置 `paymentEnabled` 为 false 时抛错；否则取配置 `payment.provider`（默认 `mock`）。
- `getGateway(name)`：按名称取指定网关（回调/查单/退款按订单记录中的 gateway 路由）。

#### MockPaymentGateway（mock）

- `name = 'mock'`，下单返回伪 codeUrl/payParams/redirectUrl。
- 查单时订单创建超过 **15s** 自动返回 SUCCESS；`forceComplete()` 立即置为完成；`refund` 记入已退款集合。
- 用于开发/联调：前端可调 `POST /billing/orders/:orderNo/mock-scan` 模拟扫码。

#### WechatPayGateway（wechat-pay）

- 微信支付 V2 协议（XML + MD5/HMAC-SHA256 签名），API 域名主备切换（`api.mch.weixin.qq.com` → `api2.mch.weixin.qq.com`，仅网络错误时切换）。
- 下单：`/pay/unifiedorder`，支持 JSAPI（必传 openid）/ NATIVE（返回 code_url）/ MWEB（返回 mweb_url）/ APP。
- 查单：`/pay/orderquery` → trade_state 映射 SUCCESS/NOTPAY/CLOSED/REFUND。
- 退款：`/secapi/pay/refund`（需商户证书 pfx，未配置时告警）；Redis `SET NX` 原子锁（`wx:refund:<orderNo>`，1h 过期）防重复退款。
- 验签：排除法（除 sign 外所有非空字段参与签名），自动按回调 `sign_type` 识别签名算法；`total_fee` 严格 `^\d+$` 校验；`return_code`/`result_code` 均须 SUCCESS。

### 4. Webhook 入口与验签（webhook.controller.ts + wechat-ip.guard.ts）

- `POST /billing/webhook/wechat`：`@Public()`（免 JWT）、`@Version(VERSION_NEUTRAL)`、`@UseGuards(WechatIpGuard)`、Swagger 排除。
- **IP 白名单守卫**：取 `X-Forwarded-For` 首个 IP（否则 `req.ip`），按 CIDR 匹配；白名单来自环境变量 `WECHAT_IP_WHITELIST`（逗号分隔），默认 `103.244.8.0/24`、`103.244.52.0/24`。**默认 log-only**（白名单外 IP 放行但记 warn 日志）：微信官方明确回调出口 IP 段不固定，强白名单会丢单（实例：2026-08-19 生产故障，真实微信回调被 403 拒绝，订单停留 PENDING，用户已扣款会员未开通）。设置 `WECHAT_IP_GUARD_ENFORCE=true` 可恢复强制模式。
- 运行时配置 `paymentEnabled` 关闭时返回 503 XML FAIL；空 body 返回 400；验签失败返回 500 XML FAIL；成功返回 `<return_code>SUCCESS</return_code>`。
- 注意：IP 守卫只做网络层白名单，业务层签名校验在 `WechatPayGateway.verifyWebhook` 中完成（网关侧验签 + 服务侧回调路径），两层共同保障回调可信。

### 5. BillingCron（billing-cron.service.ts）

| Cron 表达式 | 任务 | 行为 |
|-------------|------|------|
| `0 2 * * *` | `downgradeExpiredMemberships` | 每日 02:00（服务器时区，建议 UTC+8）：`expiresAt <= now` 的会员置 `tierLevel: 0, expiresAt: null`，并失效配额缓存 |
| `0 */2 * * *` | `timeoutPendingOrders` | 每 2 小时：PENDING 且创建超 2h 的订单置 `TIMEOUT + closedAt` |

两个任务均：受运行时配置 `TASK_ENABLED_KEYS.BILLING`（默认 true）控制；注册到 `TaskRunService`（`BILLING.DOWNGRADE_MEMBERSHIPS` / `BILLING.TIMEOUT_ORDERS`）支持手动触发；失败时经 `AlertService` 上报 CRITICAL 告警（source `scheduler:billing`，messageKey `task_run_failed`）。

## API 端点

### 用户端（`BillingController`，前缀 `/billing`，需登录）

| 方法 | 路径 | 限流 | 描述 |
|------|------|------|------|
| GET | `/billing/membership` | — | 当前会员信息（委托 MembershipService） |
| GET | `/billing/orders` | — | 订单历史（page/limit/status/keyword，orderNo 模糊搜） |
| POST | `/billing/orders` | 5 次/分钟 | 创建订单，返回支付参数（codeUrl/payParams/redirectUrl） |
| GET | `/billing/orders/:orderNo` | — | 查询单个订单（仅本人） |
| POST | `/billing/orders/:orderNo/query` | — | 查单兜底（主动向网关对账刷新状态） |
| POST | `/billing/orders/:orderNo/repay` | 10 次/分钟 | 重新支付（过期后重新获取支付参数） |
| POST | `/billing/orders/:orderNo/mock-scan` | — | 模拟支付（仅 mock 网关订单） |

### 管理端（`BillingAdminController`，前缀 `/admin/billing`，`PermissionsGuard` + 权限点）

| 方法 | 路径 | 权限 | 描述 |
|------|------|------|------|
| GET | `/admin/billing/orders` | `SYSTEM_BILLING_READ` | 所有订单（分页，含用户邮箱/用户名、套餐名/等级） |
| POST | `/admin/billing/refund` | `SYSTEM_BILLING_WRITE` | 退款（orderNo + reason） |
| POST | `/admin/billing/manual-complete` | `SYSTEM_BILLING_WRITE` | 手动补单（3 次/10s） |

### Webhook（`WebhookController`）

| 方法 | 路径 | 守卫 | 描述 |
|------|------|------|------|
| POST | `/billing/webhook/wechat` | `WechatIpGuard`（免登录） | 微信支付回调，XML 响应 |

## DTO 说明（dto/）

| DTO | 字段 | 校验 |
|-----|------|------|
| `CreateOrderDto` | `vipTierId`（必填）、`durationPricingId`（必填）、`tradeType`（默认 `JSAPI`）、`openid?`（JSAPI 必传）、`ip?`、`redirectUrl?`（MWEB 必传） | `IsString` / `IsIn(['JSAPI','NATIVE','MWEB','APP'])` |
| `RepayOrderDto` | `tradeType?`、`redirectUrl?`、`ip?`、`openid?` | 同上，全部可选 |
| `RefundDto` | `orderNo`（必填）、`reason?` | `IsString` |
| `ManualCompleteDto` | `orderNo`（必填） | `IsString` |
| `ListOrdersQueryDto` | `page`（默认 1，≥1）、`limit`（默认 20，≥1）、`status?`（`OrderStatus` 枚举）、`keyword?`（订单号模糊搜） | class-validator + `Type(() => Number)` 转换 |
| `OrderResponseDto` | 见 `buildPayResponse` 返回：`id/orderNo/vipTierId/months/amount/status/gateway/gatewayOrderId`、`codeUrl?`（NATIVE）、`payParams?`（JSAPI）、`redirectUrl?`（MWEB）、`vipTierName/durationLabel/priceYuan/createdAt` | Swagger 文档用，金额 `amount` 为分、`priceYuan = amount / 100` |

## 数据模型

`PaymentOrder`（`payment_orders`，Prisma schema 单一源 `packages/db/prisma/schema.prisma`）：

```prisma
model PaymentOrder {
  id             String      @id @default(cuid())
  orderNo        String      @unique        // PAY + 24 位随机 hex
  userId         String
  vipTierId      String?                     // 关联 VipTier
  months         Int?                        // 购买月数
  amount         Int                         // 金额（分）
  status         OrderStatus @default(PENDING)
  gateway        String      @default("wechat_pay")  // mock | wechat_pay
  gatewayOrderId String?                     // prepay_id
  tradeType      String?                     // JSAPI/NATIVE/MWEB/APP
  gatewayPaidId  String?                     // 微信 transaction_id
  description    String?
  paidAt / failedAt / closedAt / refundedAt  DateTime?
  refundReason   String?
  createdAt / updatedAt
  @@index([userId, status, createdAt]) 等
}
```

关联模型：

- `VipTier`（`vip_tiers`）：`level`（unique）、`name`、`baseMonthlyPrice`（分/月）、`isActive`、`configs` JSON。
- `DurationPricing`（`duration_pricings`）：`months`（unique）、`multiplierBps`（万分之一倍率，折扣曲线）、`label`、`isActive`、`sortOrder`。
- `UserMembership`（`user_memberships`，会员水位，vip 域）：`userId`（unique）、`tierLevel`（默认 0）、`expiresAt`。

订单状态枚举（`enums/billing.enum.ts`）：`PENDING → SUCCEEDED / FAILED / TIMEOUT / CLOSED → REFUNDED`。

状态流转路径：

```
                    ┌──────────────┐
                    │   PENDING    │◄──────── 下单（网关下单成功才落库）
                    └──────┬───────┘
       ┌──────────┬────────┼──────────┬──────────┐
       │ 回调/查单 │  cron超时  │  网关关单   │ 金额不匹配 │
       ▼          ▼        ▼          ▼
   SUCCEEDED    TIMEOUT   CLOSED     FAILED
       │
       ▼  （仅 SUCCEEDED 可退）
     REFUNDED
```

- `TIMEOUT`/`CLOSED` 后仍可能收到已付款回调 → `reconcileTerminatedOrder` 网关对账后回补 `SUCCEEDED` 并激活会员。
- `FAILED` 由金额不匹配触发（回调或查单时校验），记录原因到 `description`。

## 支付流程

1. 用户选套餐调 `POST /billing/orders`：服务端校验套餐/防降级/算价，工厂取活跃网关 `createPayment`，落库 PENDING 订单，返回支付参数。
2. 用户支付后（或前端轮询）调 `POST /billing/orders/:orderNo/query` 兜底查单；微信异步回调 `POST /billing/webhook/wechat`（IP 白名单 + 网关签名双层校验）。
3. 回调进入 `handlePaymentNotify`：金额校验 → PENDING→SUCCEEDED → `MembershipService.activate`（升级按剩余天数折算）→ 失效配额缓存；若订单已被 cron 标 TIMEOUT/CLOSED，则向网关对账确认后补激活。
4. 退款（`/admin/billing/refund`）：DB 置 REFUNDED → 网关退款（3 次重试）→ 按剩余 SUCCEEDED 订单重算会员水位（`MembershipService.recalculateFromOrders`，按 paidAt 升序游标叠加）→ 失效配额缓存。
5. cron：每日 02:00 过期会员降级；每 2h 超时未付订单关单。

### 订单生命周期时序（正常支付）

```
前端                    后端 BillingService               支付网关（微信/mock）
 │  POST /billing/orders  │                                  │
 │───────────────────────►│  校验套餐/防降级/算价                │
 │                        │  getActiveGateway()               │
 │                        │──────────────────────────────────►│ createPayment
 │                        │◄──────────────────────────────────│ prepay_id/code_url
 │                        │  paymentOrder.create (PENDING)     │
 │◄───────────────────────│  { codeUrl, payParams, ... }       │
 │  轮询 query（兜底）       │                                  │
 │───────────────────────►│  gateway.queryOrder                │
 │                        │  或微信异步回调 webhook（验签）        │
 │                        │  updateMany PENDING→SUCCEEDED      │
 │                        │  MembershipService.activate        │
 │                        │  StorageInfoService 失效配额缓存      │
 │◄───────────────────────│  SUCCESS 反馈                      │
```

### 创建订单请求示例

```json
POST /billing/orders
{
  "vipTierId": "clx...",           // VipTier.id
  "durationPricingId": "cly...",   // DurationPricing.id
  "tradeType": "NATIVE",           // JSAPI | NATIVE | MWEB | APP
  "openid": "oX...",               // JSAPI 必传
  "ip": "1.2.3.4",                 // 后端未取到时回退 127.0.0.1
  "redirectUrl": "https://app.example.com/pay-callback" // MWEB 必传
}
```

## 安全设计要点

1. **回调双层防护**：`WechatIpGuard` 网络层 CIDR 白名单（env 可覆盖） + `WechatPayGateway.verifyWebhook` 业务层签名校验（排除法签名、`total_fee` 正则严格校验、return_code/result_code 双重 SUCCESS）。
2. **金额一致性**：回调与查单均校验网关金额 = 订单金额，不一致置 FAILED 并记录原因，绝不激活会员。
3. **防重复处理**：状态流转全部 `updateMany` + 状态守卫；退款用 Redis `SET NX` 原子锁；回调幂等由 DB 状态机保障。
4. **防降级购买**：下单/重支付时 `getEffectiveTier` 对比目标等级，低于当前等级直接拒绝（i18n 文案）。
5. **过期兜底**：2h 未付订单 cron 关单；已付但回调迟到的订单通过对账路径补激活，不丢单。

## 与 vip 模块的关系

- **单向依赖：billing → vip**。`billing.service.ts` 导入 `../vip/membership.service` 的 `MembershipService` 与 `MONTH_DAYS`（30 天/月约定单点）：支付成功调 `activate(tx, ...)`、退款后调 `recalculateFromOrders`、下单/重支付调 `getEffectiveTier` 防降级。
- **vip 不反向依赖 billing**：vip 目录下无任何 billing 导入；`recalculateFromOrders` 注释明确约定"数据获取留 billing（查 paymentOrder 并映射入参），数学归位 membership"。
- 反向引用仅存在于模块注册层：`auth/auth.module.ts:101` 在 imports 中导入 `BillingModule`（`app.module.ts` 亦注册），auth 侧未直接消费 `BillingService`。

## 配置项

| 配置 | 来源 | 默认 | 说明 |
|------|------|------|------|
| `payment.provider` | env | `mock` | 活跃网关（`mock` / `wechat_pay`） |
| `paymentEnabled` | 运行时配置 | `false` | 支付总开关（下单、回调均校验） |
| `wechatPay.appId/mchId/key/notifyUrl` | env | — | 微信支付商户参数 |
| `wechatPay.signType` | env | `MD5` | 签名算法（`MD5` / `HMAC-SHA256`） |
| `wechatPay.certPath/keyPath` | env | — | 商户证书（退款接口必需） |
| `WECHAT_IP_WHITELIST` | env | 103.244.8.0/24, 103.244.52.0/24 | 回调 IP 白名单（CIDR 逗号分隔） |
| `WECHAT_IP_GUARD_ENFORCE` | env | `false` | `true` 时 IP 白名单强制拒绝（默认 log-only 放行 + 留痕，微信回调 IP 段不固定，以验签为准） |
| `TASK_ENABLED_KEYS.BILLING` | 运行时配置 | `true` | 计费定时任务开关 |

## 测试

- `billing.service.spec.ts`：覆盖全部公开方法 + 折扣曲线价格计算 + 退款重算编排（mock Prisma/网关/MembershipService）。
- `billing-cron.service.spec.ts`：过期降级、超时关单（含开关禁用分支）。
- `gateway/payment-gateway.factory.spec.ts`：活跃网关解析、按名获取。
- `gateway/wechat-pay/wechat-pay.gateway.spec.ts`：verifyWebhook 验签（伪造签名/非法 total_fee 拒绝）。
- `gateway/wechat-pay/wechat-pay.util.spec.ts`：MD5/HMAC 签名、XML 编解码、nonce。

运行：`pnpm test -- --testPathPattern="billing"`（后端目录下）。

## 排障要点

| 现象 | 排查方向 |
|------|----------|
| 下单报 `payment is disabled` | 运行时配置 `paymentEnabled` 未开启（`getActiveGateway` 抛错） |
| 回调 503 | `paymentEnabled` 关闭或请求体为空（400） |
| 回调 401/拒收 | log-only 模式默认放行仅留痕；enforce 模式下来源 IP 不在 `WECHAT_IP_WHITELIST` 会被 403，误拦真实微信回源 IP 会导致丢单（2026-08-19 实例），排查看 `WechatIpGuard` warn 日志 |
| 订单卡 TIMEOUT 但用户已付款 | cron 超时关单后回调迟到；查日志确认 `reconcileTerminatedOrder` 对账补激活是否成功（要求网关侧查单 SUCCESS 且金额一致） |
| 退款失败回滚 | 网关 3 次重试均失败则 DB 状态回滚为 SUCCEEDED；检查商户证书（pfx）与密钥是否配置、Redis 退款锁是否残留 |
| 重复退款被拒 | Redis `wx:refund:<orderNo>` 锁（1h）或 DB 状态已非 SUCCEEDED |
