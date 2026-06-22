# Billing / Membership 架构文档

> 版本: v1.4
> 最后更新: 2026-06-22
>
> **ADR 建议**：本方案涉及重大架构决策（网关可插拔、幂等策略、分/元定价约定），
> 实施前应在 `docs/adr/` 下创建 `0005-billing-architecture.md` 记录决策上下文。

---

## 设计原则

1. **支付网关可插拔** — 通过抽象接口隔离具体支付实现，后续添加支付宝/Stripe 只需新增 gateway 文件
2. **幂等安全** — 回调处理必须幂等：`UPDATE ... WHERE status = PENDING`，防止微信重试/并发导致重复激活
3. **高可用** — 无状态服务、DB 级幂等、事务保证、不依赖内存/Redis
4. **价格可配置** — 套餐定价存 DB，管理员可运行时修改
5. **测试模式** — 同短信服务的 mock 模式，开发环境无需真实支付即可全流程调试
6. **功能限制预留** — 模型预留 `features` JSON 字段，未来开启功能分级无需改 schema

---

## 目录结构

```
packages/backend/src/billing/
├── billing.module.ts                  # 模块定义
├── billing.controller.ts              # 用户端 API（下单/查单/套餐/会员）
├── billing.service.ts                 # 门面服务（下单+回调+激活合一+退款）
├── billing-cron.service.ts            # 定时任务（过期降级 + PENDING 清理）
├── plans.service.ts                   # 套餐管理（含 originalPrice ≥ price 校验）
├── membership.service.ts              # 会员到期时间叠加 + getEffectiveTier
│
├── gateway/                           # ★ 支付网关插件体系
│   ├── payment-gateway.interface.ts   #   抽象接口
│   ├── payment-gateway.factory.ts     #   工厂：每次调用解析，无缓存
│   ├── mock/
│   │   └── mock-payment.gateway.ts    #   Mock 支付（开发/测试用）
│   ├── wechat-pay/
│   │   ├── wechat-pay.gateway.ts      #   微信支付 V2 实现
│   │   └── wechat-pay.util.ts         #   纯函数：MD5签名+XML构建
│   ├── alipay.gateway.ts              #   未来实现（预留）
│   └── stripe.gateway.ts              #   未来实现（预留）
│
├── dto/
│   ├── create-order.dto.ts
│   ├── prepay-params.dto.ts
│   ├── order-response.dto.ts
│   └── plan-response.dto.ts           # 含 priceYuan 计算字段，前端直接显示
│
├── enums/                             # 或统一放在 src/common/enums/billing.enum.ts
│   └── billing.enum.ts                # MembershipTier + OrderStatus TS 枚举
│
├── webhook.controller.ts              # 微信回调（无认证，返回 XML）
│
└── guards/
    └── wechat-ip.guard.ts             # Webhook IP 白名单 Guard（可选）
```

---

## 支付网关接口

```typescript
// gateway/payment-gateway.interface.ts
export interface CreatePaymentParams {
  orderNo: string;
  amount: number;           // 单位：分
  description: string;
  tradeType: string;        // JSAPI / NATIVE / MWEB / APP
  openid?: string;          // JSAPI 必传
  ip: string;
}

export interface CreatePaymentResult {
  gatewayOrderId: string;   // prepay_id / trade_no 等
  payParams?: Record<string, any>;  // 前端调起支付所需参数
  codeUrl?: string;         // NATIVE 二维码 URL
  redirectUrl?: string;     // MWEB 跳转 URL
}

export interface WebhookVerifyResult {
  isValid: boolean;
  orderNo: string;
  gatewayOrderId: string;
  amount: number;            // 分
  paidAt: Date;
}

export interface QueryOrderResult {
  status: 'SUCCESS' | 'NOTPAY' | 'CLOSED' | 'REFUND';
  gatewayOrderId?: string;
  amount?: number;
  paidAt?: Date;
}

export interface PaymentGateway {
  readonly name: string;

  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  verifyWebhook(
    payload: any,
    headers: Record<string, string>,
  ): Promise<WebhookVerifyResult>;

  queryOrder(orderNo: string): Promise<QueryOrderResult>;

  refund(orderNo: string, amount: number): Promise<void>;
}
```

### 工厂选择逻辑

```typescript
// gateway/payment-gateway.factory.ts
@Injectable()
export class PaymentGatewayFactory {
  private gateways: Map<string, PaymentGateway> = new Map();

  constructor(
    private configService: ConfigService,
    private runtimeConfigService: RuntimeConfigService,
    mockPaymentGateway: MockPaymentGateway,
    wechatPayGateway: WechatPayGateway,
    // 后续注入 alipayGateway, stripeGateway
  ) {
    // 全部注册，工厂按配置选中一个
    this.gateways.set(mockPaymentGateway.name, mockPaymentGateway);
    this.gateways.set(wechatPayGateway.name, wechatPayGateway);
  }

  /** 获取当前激活的支付网关（开发=mock / 生产=wechat_pay）
   *
   * ★ 每次调用都重新解析，不缓存。
   * 管理员在运行时切换 paymentEnabled 后立即生效，无需重启。
   *
   * 注意：resolveProvider 调用 RuntimeConfigService.getValue()（async），
   * 因此本方法必须为 async。
   */
  async getActiveGateway(): Promise<PaymentGateway> {
    const provider = await this.resolveProvider();
    const gateway = this.gateways.get(provider);
    if (!gateway) throw new Error(`active payment gateway not found: ${provider}`);
    return gateway;
  }

  getGateway(name: string): PaymentGateway {
    const gateway = this.gateways.get(name);
    if (!gateway) throw new Error(`unsupported payment gateway: ${name}`);
    return gateway;
  }

  getAvailableGateways(): string[] {
    return Array.from(this.gateways.keys());
  }

  private async resolveProvider(): Promise<string> {
    const runtimeEnabled = await this.runtimeConfigService.getValue<boolean>('paymentEnabled', false);
    if (!runtimeEnabled) return 'mock';
    return this.configService.get<string>('payment.provider', 'mock');
  }
}
```

---

## Prisma Schema

```prisma
// ============================================================
// 新增枚举
// ============================================================
enum MembershipTier {
  FREE
  PRO
  ENTERPRISE
}

enum OrderStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
  CLOSED         // 用户主动取消
  TIMEOUT        // 超时未支付
}

// 状态转换图:
// PENDING ──→ SUCCEEDED (支付成功)
// PENDING ──→ FAILED    (支付失败)
// PENDING ──→ CLOSED    (用户取消)
// PENDING ──→ TIMEOUT   (超时，由定时任务迁移)
// SUCCEEDED ─→ REFUNDED (退款)

// ============================================================
// 新增模型
// ============================================================

model MembershipPlan {
  id            String           @id @default(cuid())
  name          String                        // "月度会员"
  durationDays  Int                           // 30
  price         Int                           // 售价（分）
  originalPrice Int?                          // 原价（分），可选：null 则不显示划线价
  tier          MembershipTier   @default(PRO)
  sortOrder     Int
  isActive      Boolean          @default(true)
  features      Json?                         // 预留：{ maxStorage: 1073741824, maxProjects: 50 }
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  orders        PaymentOrder[]
  @@unique([sortOrder, isActive])    // 防止管理员误设重复 sortOrder 导致冲突
  @@map("membership_plans")
}

model PaymentOrder {
  id              String        @id @default(cuid())
  orderNo         String        @unique                    // MC + cuid 片段
  userId          String
  planId          String
  amount          Int                                     // 分
  status          OrderStatus   @default(PENDING)

  // 支付网关
  gateway         String        @default("wechat_pay")    // 使用的网关
  gatewayOrderId  String?                                 // prepay_id / trade_no
  tradeType       String?                                 // JSAPI/NATIVE/MWEB/APP

  // 回调写入
  gatewayPaidId   String?                                 // transaction_id

  // 订单信息
  description     String?
  // 状态时间戳（按状态分别记录，便于排查）
  paidAt          DateTime?
  failedAt        DateTime?
  closedAt        DateTime?
  refundedAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // 关系
  user            User          @relation(fields: [userId], references: [id])
  plan            MembershipPlan @relation(fields: [planId], references: [id])

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([userId, status, createdAt])  // 复用 PENDING 订单查询优化
  @@map("payment_orders")
}

model UserMembership {
  id        String           @id @default(cuid())
  userId    String           @unique
  tier      MembershipTier   @default(FREE)
  expiresAt DateTime?
  metadata  Json?            // 预留
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  user      User             @relation(fields: [userId], references: [id])
  @@map("user_memberships")
}

// ============================================================
// User 模型追加字段
// ============================================================
model User {
  // ... 所有现有字段不变 ...
  membership    UserMembership?
  paymentOrders PaymentOrder[]
}
```

---

## API 设计

### 公开 API（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/billing/plans` | 套餐列表（前端定价页渲染） |
| POST | `/api/billing/webhook/wechat` | 微信支付回调（返回 XML） |

### 用户 API（需 JWT 认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/billing/orders` | 创建订单（下单，每用户每分钟限 5 次） |
| GET | `/api/billing/orders` | 订单历史 |
| POST | `/api/billing/orders/:orderNo/query` | 查单兜底（调微信查单） |
| GET | `/api/billing/membership` | 当前会员信息 |

### 管理 API（需 SYSTEM_CONFIG_WRITE 权限）

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/api/admin/billing/plans/:id` | 修改套餐（价格/时长/名称） |
| POST | `/api/admin/billing/plans` | 新增套餐 |
| DELETE | `/api/admin/billing/plans/:id` | 下架套餐（软删除：`isActive=false`，已有 PENDING 订单仍可完成） |
| POST | `/api/admin/billing/refund` | 退款（手动触发，需关联订单号） |
| POST | `/api/admin/billing/mock-callback` | **模拟支付回调（仅 mock 模式）** |

---

## 支付流程

### 生产模式（微信 V2，JSAPI 示例）

```
前端选套餐
    │
    ▼
POST /api/billing/orders { planId, tradeType: "JSAPI" }
    │
    ▼
BillingService.createOrder():
  1. 查 plan（从 DB，非硬编码）
  2. 查该用户是否有 PENDING + 同一 planId + createdAt>2h 内 → 复用旧 prepay_id
   3. 生成 orderNo = generateOrderNo()  // MC + UUID 紧凑片段
  4. 调 gatewayFactory.getActiveGateway().createPayment()
     ├─ WechatPayGateway: WechatPayUtil.buildXML() → axios.post 微信API
     └─ MockPaymentGateway: 直接返回 mock 参数，不调外部 API
  5. 写 PaymentOrder { status: PENDING, gatewayOrderId }
  6. 返回前端调起参数（含 codeUrl/payParams）
    │
    ▼
前端根据 gateway 判断:
├─ mock:   自动 POST /api/admin/billing/mock-callback → 走完整回调流程
├─ wechat: JSAPI 调起 WeixinJSBridge → 用户支付 → 微信回调
    │
    ▼
POST /api/billing/webhook/wechat（raw XML，生产环境）
  └── 或 POST /api/admin/billing/mock-callback（测试环境）
    │
    ▼
WebhookController.handleWechatNotify(xml) 或 BillingService.handlePaymentNotify(verified)
    │
    ▼
BillingService 统一处理（mock 和微信走同一个事务方法）:
  1. 查 PaymentOrder WHERE orderNo = XXX
  2. 校验 amount 一致
  3. 事务执行:
     a. UPDATE PaymentOrder SET status = SUCCEEDED ...
        WHERE id = ? AND status = PENDING（幂等）
     b. MembershipService.activate(userId, planId) 累加到期
  4. 返回成功
    │
    ▼
前端轮询 GET /api/billing/orders/:orderNo
  → 或 POST /api/billing/orders/:orderNo/query（兜底查单）
```

> **限频**：`POST /api/billing/orders` 每用户每分钟最多 5 次，防止恶意刷单（使用 `@nestjs/throttler` 或自定义 Guard）。
>
> **关键设计**：`BillingService.handlePaymentNotify(WebhookVerifyResult)` 是统一入口，
> 无论是微信回调还是 mock 管理 API，最终走同一个事务方法，保证测试环境与生产环境的行为一致。

### Mock 模式（开发/测试）— 前端零感知

```
开发者在 Pricing 页点击"开通会员"
    │
    ▼
POST /api/billing/orders { planId }
    │
    ▼
BillingService.createOrder():
  ├─ 创建 PaymentOrder { status: PENDING }
  ├─ MockPaymentGateway 返回 mock 参数
  ├─ **自动调用 handleMockCallback(orderNo)**  ← 同步完成，不额外请求
  │     └─ handlePaymentNotify(verified) 事务激活会员
  └─ 返回 { orderNo, status: "SUCCEEDED", ... }
    │
    ▼
前端收到 status: "SUCCEEDED" → 跳转到 /billing 显示会员已激活
```

---

### Webhook 安全

微信支付回调地址是公开无认证的，需在基础设施层防护：

```
# Nginx / Cloudflare 层限制仅微信官方 IP 段可访问
location /api/billing/webhook/ {
  allow 103.244.8.0/24;   # 微信官方 IP（需定期更新）
  allow 103.244.52.0/24;
  # ...
  deny all;
  proxy_pass http://backend;
}
```

或在 NestJS 侧用 Guard 配合微信 IP 列表校验（`wechat-pay.util.ts` 维护 IP 段常量）。

---

## 核心服务实现要点

### MembershipService — 到期时间叠加 + 有效会员判断

```typescript
@Injectable()
export class MembershipService {
  constructor(private prisma: PrismaService) {}

  /** 会员等级权重，用于保护升级不降级 */
  private static readonly TIER_WEIGHT: Record<MembershipTier, number> = {
    [MembershipTier.FREE]: 0,
    [MembershipTier.PRO]: 1,
    [MembershipTier.ENTERPRISE]: 2,
  };

  async activate(
    tx: PrismaTx,             // 在 payment 事务内执行
    userId: string,
    plan: MembershipPlan,
  ): Promise<UserMembership> {
    const existing = await tx.userMembership.findUnique({ where: { userId } });
    const now = new Date();
    // 有会员且未过期 → 叠加；否则从当前时间起算
    const base = existing?.expiresAt && existing.expiresAt > now
      ? existing.expiresAt
      : now;
    const newExpiresAt = new Date(base.getTime() + plan.durationDays * 86400000);
    // 保护升级不降级：取现有 tier 和 plan.tier 中权重更高的那个
    const currentWeight = existing
      ? MembershipService.TIER_WEIGHT[existing.tier] ?? 0
      : 0;
    const effectiveTier = currentWeight > MembershipService.TIER_WEIGHT[plan.tier]
      ? existing!.tier
      : plan.tier;
    return tx.userMembership.upsert({
      where: { userId },
      create: { userId, tier: plan.tier, expiresAt: newExpiresAt },
      update: { tier: effectiveTier, expiresAt: newExpiresAt },
    });
  }

  async getMembership(userId: string): Promise<{
    tier: MembershipTier;
    expiresAt: Date | null;
    daysRemaining: number;
  }> {
    const m = await this.prisma.userMembership.findUnique({ where: { userId } });
    if (!m || !m.expiresAt || m.expiresAt <= new Date()) {
      return { tier: MembershipTier.FREE, expiresAt: null, daysRemaining: 0 };
    }
    return {
      tier: m.tier,
      expiresAt: m.expiresAt,
      daysRemaining: Math.ceil((m.expiresAt.getTime() - Date.now()) / 86400000),
    };
  }

  /**
   * getEffectiveTier — 供其他服务查询用户当前有效会员等级
   * 与 getMembership 不同，此方法返回原始 tier（即使已过期），
   * 由调用方结合 expiresAt 自行判断。适用于：
   * - 需要区分"从未购买"和"已过期"的场景
   * - 降级 Cron 执行前查询过期会员
   */
  async getEffectiveTier(userId: string): Promise<MembershipTier> {
    const m = await this.prisma.userMembership.findUnique({ where: { userId } });
    return m?.tier ?? MembershipTier.FREE;
  }
}
```

### BillingService — 下单 + 回调（统一入口）

```typescript
@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private gatewayFactory: PaymentGatewayFactory,
    private membershipService: MembershipService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const plan = await this.prisma.membershipPlan.findUniqueOrThrow({
      where: { id: dto.planId, isActive: true },
    });

    // 复用 2h 内未支付的同套餐订单
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
    const pending = await this.prisma.paymentOrder.findFirst({
      where: {
        userId,
        planId: plan.id,
        status: OrderStatus.PENDING,
        createdAt: { gte: twoHoursAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      return this.buildPayResponse(pending, plan, dto.tradeType);
    }

    // 新订单 — 调用当前激活的网关
    const orderNo = generateOrderNo();
    const gateway = await this.gatewayFactory.getActiveGateway();
    const result = await gateway.createPayment({
      orderNo,
      amount: plan.price,
      description: plan.name,
      tradeType: dto.tradeType,
      openid: dto.openid,
      ip: dto.ip,
    });

    const order = await this.prisma.paymentOrder.create({
      data: {
        orderNo, userId, planId: plan.id, amount: plan.price,
        gateway: gateway.name,
        gatewayOrderId: result.gatewayOrderId,
        tradeType: dto.tradeType, description: plan.name,
      },
    });

    // Mock 模式：自动完成支付，前端无需调起支付 SDK
    if (gateway.name === 'mock') {
      await this.handleMockCallback(orderNo);
      // ★ 回调后再查一次，确保返回 DB 中最新的 status（SUCCEEDED）
      const updated = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
      return this.buildPayResponse(updated!, plan, dto.tradeType, result, true);
    }

    return this.buildPayResponse(order, plan, dto.tradeType, result);
  }

  /**
   * ★ 统一回调入口 — 无论是微信回调还是 mock-callback 都走这里
   * 保证 mock 与生产环境行为完全一致
   *
   * 幂等保证：update 的 where 条件包含 status: PENDING，
   * 防止微信重试或并发回调导致重复激活会员。
   * 如果已成功，update 影响行数为 0，不会再次调用 activate。
   */
  async handlePaymentNotify(verified: WebhookVerifyResult): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.paymentOrder.findUnique({
        where: { orderNo: verified.orderNo },
        include: { plan: true },
      });
      if (!order) throw new Error(`order not found: ${verified.orderNo}`);
      if (order.status !== OrderStatus.PENDING) return; // 快速跳过，非竞态

      if (order.amount !== verified.amount) {
        throw new Error(`amount mismatch: order=${order.amount} callback=${verified.amount}`);
      }

      // WHERE id + status 保证并发安全：两个并发事务只有一个会更新成功
      const { count } = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.SUCCEEDED,
          gatewayPaidId: verified.gatewayOrderId,
          paidAt: verified.paidAt,
        },
      });

      // 影响行数为 0 说明已被其他事务更新，直接跳过
      if (count === 0) return;

      await this.membershipService.activate(tx, order.userId, order.plan);
    });
  }

  // 注意：handleMockCallback 在 createOrder 同步流程中调用，
  // 此时 order 刚创建（status=PENDING），不会触发幂等跳过，但设计上 safe。

  /** 微信回调入口（WebhookController 调用） */
  async handleWechatNotify(xml: string): Promise<string> {
    try {
      const gateway = this.gatewayFactory.getGateway('wechat_pay');
      const verified = await gateway.verifyWebhook(xml, {});
      if (!verified.isValid) return this.failXml('sign verification failed');
      await this.handlePaymentNotify(verified);
      return this.successXml();
    } catch (e) {
      this.logger.error('wechat notify failed', e);
      return this.failXml('internal error');
    }
  }

  /** Mock 回调入口（createOrder 内联调用 + 管理 API 手动调用） */
  async handleMockCallback(orderNo: string): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new Error(`order not found: ${orderNo}`);

    const gateway = this.gatewayFactory.getGateway('mock');
    const verified = await gateway.verifyWebhook({
      out_trade_no: orderNo,
      transaction_id: `mock_txn_${Date.now()}`,
      total_fee: order.amount,
    }, {});
    await this.handlePaymentNotify(verified);
  }

  private successXml() {
    return '<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>';
  }

  private failXml(msg: string) {
    return `<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[${msg}]]></return_msg></xml>`;
  }
}
```

---

### 退款流程

```typescript
@Injectable()
export class BillingService {
  /** 退款（管理员触发） */
  async refund(orderNo: string, reason?: string): Promise<void> {
    const order = await this.prisma.paymentOrder.findUnique({ where: { orderNo } });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.SUCCEEDED) {
      throw new BadRequestException('only succeeded orders can be refunded');
    }

    // 调网关退款
    const gateway = this.gatewayFactory.getGateway(order.gateway);
    await gateway.refund(orderNo, order.amount);

    // 事务：更新订单状态 + 扣减会员期
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: OrderStatus.SUCCEEDED },
        data: {
          status: OrderStatus.REFUNDED,
          refundedAt: new Date(),
        },
      });
      if (count === 0) return; // 幂等：已被其他管理员退款

      // 销毁会员：expiresAt 置为当前时间（立即过期）
      // ★ 同时将 tier 降为 FREE，避免 cron 执行前 query 读到过期但 tier 未降的不一致
      await tx.userMembership.update({
        where: { userId: order.userId },
        data: { expiresAt: new Date(), tier: MembershipTier.FREE },
      });
    });
  }
}
```

退款策略：
| 场景 | 处理方式 |
|------|---------|
| 全额退款 | `expiresAt = now`，会员立即失效 |
| 按比例退款（未来） | 计算已用天数，`expiresAt = now + 剩余天数`，仅缩短不延长 |

> 注意：
> - 退款操作需管理员手动触发，暂不实现自动退款（用户发起退款申请走客服流程）。
> - WechatPayGateway 退款需要使用微信支付证书（mTLS），详见 [WechatPayGateway 实现要点](#wechatpaygateway-实现要点)。mock 模式下退款仅写日志，无需证书。

### 定时任务

```typescript
// 使用 @nestjs/schedule（项目已有）
@Injectable()
export class BillingCron {
  constructor(private prisma: PrismaService) {}

  /** 每日凌晨 2:00 降级已过期会员 */
  @Cron('0 2 * * *')
  async downgradeExpiredMemberships() {
    const expired = await this.prisma.userMembership.findMany({
      where: { expiresAt: { lte: new Date(), not: null } },
    });
    for (const m of expired) {
      await this.prisma.userMembership.update({
        where: { id: m.id },
        data: { tier: MembershipTier.FREE, expiresAt: null },
      });
      this.logger.log(`membership expired & downgraded: userId=${m.userId}`);
    }
  }

  /** 每日凌晨 3:00 清理超时 PENDING 订单（>24h 未支付） */
  @Cron('0 3 * * *')
  async timeoutPendingOrders() {
    const cutoff = new Date(Date.now() - 24 * 3600000);
    const { count } = await this.prisma.paymentOrder.updateMany({
      where: {
        status: OrderStatus.PENDING,
        createdAt: { lte: cutoff },
      },
      data: { status: OrderStatus.TIMEOUT, closedAt: new Date() },
    });
    if (count > 0) this.logger.log(`timed out ${count} pending orders`);
  }
}
```

> **设计说明**：`downgradeExpiredMemberships` 将过期的 `tier` 真正置为 `FREE`，这样其他查询 `user.membership.tier` 的服务（如 StorageQuota、ProjectMember）能直接读到正确值，无需每次都判断 `expiresAt`。

---

## 微信支付 V2 工具类

```typescript
// gateway/wechat-pay/wechat-pay.util.ts
// 纯函数，无 DI 依赖，可直接单元测试
// 注意：fast-xml-parser 需手动安装: pnpm add fast-xml-parser -F backend
import * as crypto from 'node:crypto';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const parser = new XMLParser({
  explicitArray: false,
  ignoreAttributes: true,
  cdataPropName: '__cdata',
});
const builder = new XMLBuilder({
  format: true,
  cdataPropName: '__cdata',
});

export function md5Sign(params: Record<string, any>, key: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&') + `&key=${key}`;
  return crypto.createHash('md5').update(sorted, 'utf8').digest('hex').toUpperCase();
}

export function buildXML(root: string, data: Record<string, any>): string {
  return builder.build({ [root]: data });
}

export function parseXML(xml: string): any {
  return parser.parse(xml);
}

export function generateNonceStr(): string {
  return crypto.randomBytes(16).toString('hex');
}
```

---

## WechatPayGateway 实现要点

### 证书管理

退款等敏感操作需要微信支付双向证书（mTLS），证书文件路径通过环境变量配置：

```typescript
// gateway/wechat-pay/wechat-pay.gateway.ts
import * as https from 'node:https';
import * as fs from 'node:fs';
import axios from 'axios';

@Injectable()
export class WechatPayGateway implements PaymentGateway {
  readonly name = 'wechat_pay';

  private readonly apiBase: string;
  private readonly backupApiBase: string;  // ★ 备用域名
  private readonly httpsAgent?: https.Agent;

  constructor(private configService: ConfigService) {
    // 主备域名，用于故障切换
    this.apiBase = 'https://api.mch.weixin.qq.com';
    this.backupApiBase = 'https://api2.mch.weixin.qq.com';

    // 退款需要加载证书
    const certPath = this.configService.get<string>('wechatPay.certPath');
    const keyPath = this.configService.get<string>('wechatPay.keyPath');
    if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      this.httpsAgent = new https.Agent({
        pfx: fs.readFileSync(certPath),
        passphrase: this.configService.get<string>('wechatPay.mchId'),
      });
    }
  }

  // ... createPayment, verifyWebhook, queryOrder ...
}
```

### 域名备用策略

微信支付提供主备域名，对接时按序尝试，提高可用性：

```typescript
private async requestWechatApi(
  path: string,
  data: Record<string, any>,
  useCert = false,
): Promise<any> {
  const xml = buildXML('xml', data);
  const domains = [this.apiBase, this.backupApiBase];

  for (let i = 0; i < domains.length; i++) {
    try {
      const url = `${domains[i]}${path}`;
      const config: Record<string, any> = {
        headers: { 'Content-Type': 'application/xml' },
      };
      if (useCert && this.httpsAgent) {
        config.httpsAgent = this.httpsAgent;
      }
      const res = await axios.post(url, xml, config);
      const parsed = parseXML(res.data);
      if (parsed?.xml?.return_code === 'SUCCESS') return parsed.xml;
      // 业务失败（如签名错误）不切换域名，直接抛出
      throw new Error(`wechat api error: ${parsed?.xml?.return_msg}`);
    } catch (err) {
      const isNetworkError = (err as any)?.code === 'ECONNREFUSED'
        || (err as any)?.code === 'ETIMEDOUT'
        || (err as any)?.code === 'ECONNRESET'
        || (err as any)?.response?.status === 503;
      if (isNetworkError && i < domains.length - 1) {
        this.logger.warn(`wechat api domain failed, switching to backup: ${domains[i]}`);
        continue;  // 尝试备用域名
      }
      throw err;
    }
  }
  throw new Error('all wechat pay domains are unavailable');
}

async refund(orderNo: string, amount: number): Promise<void> {
  const xml = buildXML('xml', {
    appid: this.configService.get<string>('wechatPay.appId'),
    mch_id: this.configService.get<string>('wechatPay.mchId'),
    nonce_str: generateNonceStr(),
    out_trade_no: orderNo,
    out_refund_no: `RF${orderNo.slice(2)}`,  // RF + 原订单号后缀
    total_fee: amount,
    refund_fee: amount,
  });
  // 退款需要证书（useCert = true）
  await this.requestWechatApi('/secapi/pay/refund', xml, true);
}
```

> **证书更新**：微信支付平台证书会定期更新，生产环境应关注证书过期时间，设置监控告警。证书文件建议通过 CI/CD 部署时同步，或挂载为 Docker Secret。`pem` 格式证书也可通过 `https.Agent` 的 `cert` + `key` 选项加载。

---

## 测试模式（Mock Payment Gateway）

### 设计思路

完全参照已有 `SmsProvider` → `MockSmsProvider` 模式，`PaymentGateway` 接口下新增 `MockPaymentGateway` 实现。开发/测试环境无需真实微信支付即可完成全流程联调。

### MockPaymentGateway 实现

```typescript
// gateway/mock/mock-payment.gateway.ts
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentGateway.name);

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const mockPrepayId = `mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.logger.log(
      `[Mock Pay] 创建支付: 订单=${params.orderNo}, 金额=${params.amount}分, ` +
      `商品=${params.description}, tradeType=${params.tradeType}`
    );

    // 模拟延迟
    await new Promise(r => setTimeout(r, 300));

    return {
      gatewayOrderId: mockPrepayId,
      codeUrl: `http://mock.qr/${mockPrepayId}`,              // NATIVE 场景
      payParams: {
        appId: 'mock_appid',
        timeStamp: String(Date.now()),
        nonceStr: 'mock_nonce',
        package: `prepay_id=${mockPrepayId}`,
        signType: 'MD5',
        paySign: 'mock_sign',
      },
      redirectUrl: `http://mock.pay/${mockPrepayId}`,         // MWEB 场景
    };
  }

  async verifyWebhook(
    payload: any,
    headers: Record<string, string>,
  ): Promise<WebhookVerifyResult> {
    // mock 模式回调由管理 API 触发, 无需验证签名
    return {
      isValid: true,
      orderNo: payload.out_trade_no as string,
      gatewayOrderId: payload.transaction_id as string,
      amount: payload.total_fee as number,
      paidAt: new Date(),
    };
  }

  async queryOrder(orderNo: string): Promise<QueryOrderResult> {
    this.logger.log(`[Mock Pay] 查询订单: ${orderNo}`);
    // 由前端调用, 返回成功表明可轮询
    return {
      status: 'SUCCESS',
      gatewayOrderId: `mock_${orderNo}`,
      amount: 0,
      paidAt: new Date(),
    };
  }

  async refund(orderNo: string, amount: number): Promise<void> {
    this.logger.log(`[Mock Pay] 退款: 订单=${orderNo}, 金额=${amount}分`);
  }
}
```

### 配置切换

```env
# .env — 支付提供商（开发环境默认 mock）
PAYMENT_PROVIDER=mock                         # 开发/测试
# PAYMENT_PROVIDER=wechat_pay                 # 生产环境

# 微信支付（V2，仅 PAYMENT_PROVIDER=wechat_pay 时生效）
WECHATPAY_APPID=wx3d2a3968ed0e6bda
WECHATPAY_MCHID=1446619502
WECHATPAY_KEY=chengdumengxiangkaidekejiyouxian
WECHATPAY_NOTIFY_URL=https://your-domain.com/api/billing/webhook/wechat
```

### 运行时配置控制

新增运行时配置项（参照 `smsEnabled` 模式）：

```typescript
// ★ 前置步骤：在 runtime-config.types.ts 的 RuntimeConfigCategory 联合类型中追加 'billing'
// 当前类型：'mail' | 'sms' | 'support' | 'file' | 'user' | 'system' | 'wechat' | 'storage'
// 新增后：'mail' | 'sms' | 'support' | 'file' | 'user' | 'system' | 'wechat' | 'storage' | 'billing'

// runtime-config.constants.ts 追加
{
  key: 'paymentEnabled',
  type: 'boolean',
  category: 'billing',
  description: '支付功能开关（关闭时强制回退 mock 模式）',
  defaultValue: false,   // 默认关闭，管理员手动开启
  isPublic: false,
},
```

切换逻辑：

```
PAYMENT_PROVIDER=wechat_pay  +  paymentEnabled=true   → 真实微信支付
PAYMENT_PROVIDER=mock        +  paymentEnabled=false  → Mock 支付（默认）
PAYMENT_PROVIDER=wechat_pay  +  paymentEnabled=false  → 强制回退 Mock
```

### 管理 API：模拟回调（仅 mock 模式可用）

开发/测试时，管理员可通过 API 手动触发支付回调，无需真的扫码：

```
POST /api/admin/billing/mock-callback { orderNo: "MCxxx" }
```

```typescript
// billing.controller.ts
@Post('/admin/billing/mock-callback')
@RequirePermissions([SystemPermission.SYSTEM_CONFIG_WRITE])
async mockCallback(@Body() dto: { orderNo: string }) {
  // 仅 mock 模式可用
  const gateway = this.gatewayFactory.getGateway('mock');
  const result = await gateway.verifyWebhook({
    out_trade_no: dto.orderNo,
    transaction_id: `mock_txn_${Date.now()}`,
    total_fee: /* 从 DB 查对应订单的 amount */,
  }, {});
  // 复用同一个 handlePaymentNotify，走完整的事务流程
  return this.billingService.handlePaymentNotify(result);
}
```

### Mock 模式的前端适配

**前端零改动** — 和短信 mock 一样，前端不感知当前是 mock 还是真实支付。

关键设计：

```
mock 模式下下单流程:
前端 POST /api/billing/orders
  → 后端创建 PaymentOrder, status = PENDING
  → 调用 MockPaymentGateway.createPayment()
  → 返回 JSAPI 调起参数（和微信结构一样）
  → 后端**立即自动完成**：同一请求内调用 handleMockCallback
  → 更新 status = SUCCEEDED + 激活会员
  → 返回 { orderNo, status: "SUCCEEDED" }
  ↑
前端收到 SUCCEEDED → 直接跳转到 /billing 看到会员已生效
```

即 `POST /api/billing/orders` 在 mock 模式下是一个**同步完成**的操作：
- 创建订单
- 模拟支付成功
- 激活会员
- 一次性返回 `status: "SUCCEEDED"`

前端轮询 `GET /api/billing/orders/:orderNo` 第一次就能查到 `SUCCEEDED`。

> 注：`POST /api/admin/billing/mock-callback` 管理 API 依然保留，
> 供自动化测试场景手动控制回调时机。开发日常使用自动完成即可。

### 测试模式适用场景

| 场景 | 使用模式 | 说明 |
|------|---------|------|
| 本地开发 | `PAYMENT_PROVIDER=mock` | 无需微信商户号，零配置启动 |
| 自动化测试 | `PAYMENT_PROVIDER=mock` | 测试用例调用 mock-callback 走通全流程 |
| QA 环境 | `PAYMENT_PROVIDER=mock` | QA 通过管理界面手动模拟回调 |
| 验收演示 | `PAYMENT_PROVIDER=mock` | 演示给客户看完整购买流程 |
| 生产 | `PAYMENT_PROVIDER=wechat_pay` | 真实微信支付 |

### 测试策略

#### 单元测试覆盖

| 文件 | 覆盖范围 | 关键场景 |
|------|---------|---------|
| `wechat-pay.util.ts` | 纯函数 | MD5 签名正确性、XML 构建/解析、nonceStr 唯一性 |
| `membership.service.ts` | `activate`、`getMembership`、`getEffectiveTier` | 到期叠加、已过期从当前起算、tier 保护升级不降级 |
| `plans.service.ts` | CRUD 校验 | `originalPrice ≥ price` 校验、软删除 `isActive=false` |
| `payment-gateway.factory.ts` | `getActiveGateway`、`resolveProvider` | `paymentEnabled=true/false` 切换、gateway 不存在抛错 |
| `mock-payment.gateway.ts` | 全接口 | 模拟创建支付、回调、查单、退款 |

#### 集成测试覆盖

- **幂等性**：同一回调请求并发 2 次 → 仅激活 1 次会员
- **并发安全**：同一 PENDING 订单并发处理 → `updateMany` 影响行数为 1
- **Mock 全流程**：`POST /api/billing/orders` → 自动回调 → `status=SUCCEEDED` → 会员激活
- **微信回调全流程**：模拟微信 XML 回调 → `handlePaymentNotify` → 状态变更 + 会员激活
- **退款**：SUCCEEDED 订单退款 → `status=REFUNDED` → `tier=FREE` + `expiresAt` 置为过去
- **PENDING 复用**：2h 内同套餐订单复用旧 `orderNo`

#### 覆盖率目标

建议纳入项目现有 P1 阈值体系 (70%)：
- `billing.service.ts` — P1
- `membership.service.ts` — P1

---

## 环境变量配置

```env
# 支付提供商（开发=mock, 生产=wechat_pay）
PAYMENT_PROVIDER=mock

# 微信支付（V2，仅在 PAYMENT_PROVIDER=wechat_pay 时必填）
WECHATPAY_APPID=wx3d2a3968ed0e6bda
WECHATPAY_MCHID=1446619502
WECHATPAY_KEY=chengdumengxiangkaidekejiyouxian
WECHATPAY_NOTIFY_URL=https://your-domain.com/api/billing/webhook/wechat

# 微信支付证书（退款等敏感操作需要 mTLS，PAYMENT_PROVIDER=wechat_pay 时建议配置）
# cert_path / key_path 任选一种格式（pfx 或 pem + key）
WECHATPAY_CERT_PATH=./certs/wechat/apiclient_cert.p12   # PKCS12 格式
# WECHATPAY_CERT_PATH=./certs/wechat/apiclient_cert.pem # PEM 格式（如用 pem 需同时配置 KEY_PATH）
# WECHATPAY_KEY_PATH=./certs/wechat/apiclient_key.pem

# 注意：现有 WECHAT_APPID / WECHAT_APP_SECRET 用于微信登录，不要混淆
```

配置加载参照现有 `src/config/configuration.ts` + `src/config/app.config.ts` 模式，新增 `payment` + `wechatPay` 两个配置段。

---

## orderNo 生成

```typescript
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';

function generateOrderNo(): string {
  // 使用 UUID v4 的紧凑形式，MC 前缀便于日志识别
  const suffix = randomUUID().replace(/-/g, '').substring(0, 24);
  return `MC${suffix}`;  // e.g. MC550e8400e29b41d4a716446655440000
}
```

- `randomUUID` 来自 `node:crypto`，无需额外依赖
- 微信 V2 `out_trade_no` 限制 32 字符：`MC`(2) + 24 = 26 字符，安全

---

## plan-response.dto.ts 约定

后端价格字段 `price` / `originalPrice` 以**分**为单位存储，避免浮点精度问题。

DTO 中增加 `priceYuan` / `originalPriceYuan` 计算字段，前端直接使用，避免分/元转换失误：

```typescript
import { ApiProperty } from '@nestjs/swagger';

class PlanResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  durationDays: number;

  /** 售价（分） */
  price: number;

  /** 原价（分），null 时不显示划线价 */
  originalPrice: number | null;

  /** 售价（元），前端直接展示，避免分/元转换失误 */
  @ApiProperty()
  priceYuan: number;

  /** 原价（元） */
  @ApiProperty()
  originalPriceYuan: number | null;

  @ApiProperty({ enum: MembershipTier })
  tier: MembershipTier;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  features: Record<string, any> | null;

  @ApiProperty()
  isActive: boolean;
}
```

> 注意：`price` / `originalPrice` 以分存储不在 `@ApiProperty` 暴露，前端统一使用 `priceYuan` / `originalPriceYuan`。

---

## 种子数据

放在 `prisma/seed.ts` 末尾（参照种子脚本现有模式）：

```typescript
// prisma/seed.ts 追加
async function seedMembershipPlans(prisma: PrismaClient) {
  const exists = await prisma.membershipPlan.findFirst();
  if (exists) return;

  await prisma.membershipPlan.createMany({
    data: [
      {
        name: '月度会员', durationDays: 30,  price: 2400, originalPrice: 3000,
        sortOrder: 1, tier: 'PRO',
        features: { maxStorage: 1073741824, maxProjects: 50, maxCollaborators: 5, versionHistoryDays: 30 },
      },
      {
        name: '半年会员', durationDays: 180, price: 14000, originalPrice: 18000,
        sortOrder: 2, tier: 'PRO',
        features: { maxStorage: 2147483648, maxProjects: 100, maxCollaborators: 10, versionHistoryDays: 90 },
      },
      {
        name: '年度会员', durationDays: 365, price: 26000, originalPrice: 28800,
        sortOrder: 3, tier: 'PRO',
        features: { maxStorage: 5368709120, maxProjects: 200, maxCollaborators: 20, versionHistoryDays: 365 },
      },
    ],
  });
  console.log('membership plans seeded');
}
```

运行方式：`pnpm db:seed`（沿用现有命令）。

> **验证规则**：`PlansService` 在创建/修改套餐时，必须校验 `originalPrice`（如有）≥ `price`，防止显示假打折。

---

## 可观测性

| 场景 | 记录方式 |
|------|----------|
| 下单失败 | `this.logger.error('create order failed', { userId, error })` |
| 支付回调成功 | `this.logger.log('payment succeeded', { orderNo, userId, amount })` |
| 支付回调失败 | `this.logger.warn('payment callback invalid', { orderNo, reason })` |
| 会员激活 | `AuditLog.record(USER_MEMBERSHIP_ACTIVATE)` — 如果后续加 audit action |
| 会员过期降级 | `this.logger.log('membership expired & downgraded', { userId })` |
| 超时 PENDING 清理 | `this.logger.log('timed out N pending orders')` |
| 退款成功 | `AuditLog.record(ORDER_REFUNDED, { orderNo, amount })` |
| Mock 回调触发 | `this.logger.warn('mock callback triggered', { orderNo, adminId })` |
| 查单兜底 | 前端 10s 轮询 /orders/:no，3 次失败后建议联系客服 |

---

## 前端

### 路由

```
/pricing    → 定价页（GET /api/billing/plans 动态渲染）
/billing    → 我的会员（GET /api/billing/membership + /orders）
```

### 组件

```
components/billing/
├── PricingCard.tsx          // 套餐卡片
├── PricingPage.tsx          // 定价页
├── BillingPage.tsx          // 我的会员页
├── OrderHistory.tsx         // 购买记录
├── MembershipBadge.tsx      // 头像旁 Pro 标签
└── WechatPayButton.tsx      // 微信支付按钮（封装 JSAPI 调起）
```

### 侧边栏

```tsx
// Layout.tsx menuItems 追加
{
  to: '/pricing',
  icon: Crown,
  label: '会员中心',
  visible: true,
}
```

---

## 未来扩展

### 添加支付宝

1. 创建 `gateway/alipay.gateway.ts` 实现 `PaymentGateway` 接口
2. 在 `PaymentGatewayFactory` 构造函数中注入
3. 前端传 `tradeType: 'alipay'` 时自动路由到支付宝网关

### 添加 Stripe

同上，新建 `gateway/stripe.gateway.ts`。

### 功能限制

`MembershipPlan.features` JSON 字段预留结构：
```json
{
  "maxStorage": 1073741824,
  "maxProjects": 50,
  "maxCollaborators": 5,
  "versionHistoryDays": 30,
  "externalReference": true,
  "apiRateLimit": 1000
}
```

在 `StorageQuotaService` / `ProjectMemberService` 等处查询 `user.membership.plan.features` 即可实现分级限制。

### 续费提醒

```typescript
// 使用 @nestjs/schedule（项目已有）
// 如需更友好的日期格式化，可安装 dayjs: pnpm add dayjs -F backend
@Cron(CronExpression.EVERY_DAY_AT_10AM)
async remindExpiring() {
  const now = Date.now();
  const soon3d = new Date(now + 3 * 86400000);
  const expiring = await this.prisma.userMembership.findMany({
    where: { expiresAt: { gte: new Date(now), lte: soon3d } },
    include: { user: true },
  });
  for (const m of expiring) {
    const dateStr = m.expiresAt.toISOString().split('T')[0]; // YYYY-MM-DD
    await this.notificationService.send(m.userId, {
      type: 'MEMBERSHIP_EXPIRING',
      title: '会员即将到期',
      body: `您的会员将在 ${dateStr} 到期，请及时续费`,
    });
  }
}
```

---

## 实施清单

| # | 任务 | 文件 | 依赖 |
|--|------|------|------|
| 1 | Prisma schema 新增 enum + model | `schema.prisma` | - |
| 2 | 运行 migration | `pnpm prisma migrate dev` | 1 |
| 3 | 安装依赖（fast-xml-parser） | `pnpm add fast-xml-parser -F backend` | - |
| 4 | TS enum 文件（billing.enum.ts） | `src/common/enums/` 或 `billing/enums/` | 1 |
| 5 | 配置定义（app.config.ts + configuration.ts） | `src/config/` | - |
| 6 | 运行时配置新增 `paymentEnabled` + 扩展 RuntimeConfigCategory | `runtime-config.constants.ts` + `runtime-config.types.ts` | - |
| 7 | `.env` 新增 `PAYMENT_PROVIDER` + `WECHATPAY_*` | `.env` | 5 |
| 8 | `PaymentGateway` 接口 | `gateway/payment-gateway.interface.ts` | - |
| 9 | `WechatPayUtil` 纯函数 | `gateway/wechat-pay/wechat-pay.util.ts` | 3 |
| 10 | `MockPaymentGateway` 实现 | `gateway/mock/mock-payment.gateway.ts` | 8 |
| 11 | `WechatPayGateway` 实现（含证书管理 + 域名备用策略） | `gateway/wechat-pay/wechat-pay.gateway.ts` | 8, 9 |
| 12 | `PaymentGatewayFactory`（resolveProvider 为 async） | `gateway/payment-gateway.factory.ts` | 8, 10, 11 |
| 13 | `PlansService`（含 originalPrice ≥ price 校验） | `plans.service.ts` | 1 |
| 14 | `MembershipService`（含 tier 保护逻辑） | `membership.service.ts` | 1 |
| 15 | `BillingService`（下单+统一回调+幂等更新+退款） | `billing.service.ts` | 12, 13, 14 |
| 16 | `BillingController`（用户 API + admin API + refund） | `billing.controller.ts` | 15 |
| 17 | `WebhookController`（微信回调，无认证） | `webhook.controller.ts` | 15 |
| 18 | `BillingModule` 组装 | `billing.module.ts` | 16, 17 |
| 19 | `BillingCron`（过期降级 + PENDING 清理） | `billing-cron.service.ts` | 1 |
| 20 | Nginx/IP Guard 白名单 Webhook 路径 | nginx 配置 / guard | 17 |
| 21 | 种子数据（含 features） | `prisma/seed.ts` | 1 |
| 22 | 前端 Pricing 页 | `pages/Pricing.tsx` | 16 |
| 23 | 前端 Billing 页 | `pages/Billing.tsx` | 16 |
| 24 | 侧边栏入口 | `Layout.tsx` | 22 |
| 25 | 移动端页面 | `frontend_mobile/` | 22 |
| 26 | Mock 模式全流程测试（无需微信） | - | 18, 19 |
| 27 | 微信沙箱全流程测试 | - | 18, 20 |

> **开发建议**：先完成 #8-#12 的接口 + Mock 实现，不依赖微信商户号即可开发 #13-#24 的所有业务逻辑。
> 微信支付联调（#27）可以放到最后，PAYMENT_PROVIDER=mock 可以覆盖 90% 的开发调试场景。
