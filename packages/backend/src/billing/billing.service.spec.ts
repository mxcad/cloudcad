import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PaymentGatewayFactory } from './gateway/payment-gateway.factory';
import { MembershipService } from '../vip/membership.service';
import { StorageInfoService } from '../file-system/storage-quota/storage-info.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { EmailService } from '../notification/email.service';
import { AuditLogService } from '../audit/audit-log.service';
import { BillingService } from './billing.service';
import { OrderStatus, RefundApplicationStatus } from './enums/billing.enum';
import { AuditAction } from '../common/enums/audit.enum';
import { Prisma } from '@cloudcad/db';

interface PaymentGatewayLike {
  name: string;
  createPayment: any;
  verifyWebhook: any;
  queryOrder: any;
  refund: any;
  forceComplete?: any;
}

interface BuildTxOptions {
  paymentOrderFindUnique?: any;
  paymentOrderUpdateMany?: jest.Mock;
  paymentOrderUpdate?: jest.Mock;
  paymentOrderFindMany?: jest.Mock;
  userMembershipFindUnique?: any;
  userMembershipUpsert?: jest.Mock;
  vipTierFindUnique?: any;
}

function buildTx(opts: BuildTxOptions = {}) {
  return {
    paymentOrder: {
      findUnique: jest.fn().mockResolvedValue(
        opts.paymentOrderFindUnique ?? {
          id: 'order-1',
          vipTier: { id: 'vip-tier-1', level: 1, baseMonthlyPrice: 1500 },
          months: 1,
        }
      ),
      updateMany:
        opts.paymentOrderUpdateMany ??
        jest.fn().mockResolvedValue({ count: 1 }),
      update: opts.paymentOrderUpdate ?? jest.fn(),
      findMany: opts.paymentOrderFindMany ?? jest.fn(),
    },
    userMembership: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.userMembershipFindUnique ?? null),
      upsert: opts.userMembershipUpsert ?? jest.fn(),
    },
    vipTier: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.vipTierFindUnique ?? undefined),
    },
  };
}

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;
  let gatewayFactory: any;
  let membershipService: any;
  let storageInfoService: any;
  let runtimeConfigService: any;
  let emailService: any;
  let auditLogService: any;
  let mockGateway: jest.Mocked<PaymentGatewayLike>;

  const mockVipTier = {
    id: 'vip-tier-1',
    level: 1,
    name: 'VIP1',
    baseMonthlyPrice: 1500,
    isActive: true,
    configs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDurationPricing = {
    id: 'dur-1',
    months: 1,
    multiplierBps: 10000,
    label: '1个月',
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
  };

  const mockOrder = {
    id: 'order-1',
    orderNo: 'PAYtest123',
    userId: 'user-1',
    vipTierId: 'tier-1',
    months: 1,
    amount: 2400,
    status: OrderStatus.PENDING,
    gateway: 'mock',
    gatewayOrderId: 'gateway-123',
    tradeType: 'NATIVE',
    gatewayPaidId: null,
    description: 'VIP1 1个月',
    paidAt: null,
    failedAt: null,
    closedAt: null,
    refundedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserMembership = {
    id: 'mem-1',
    userId: 'user-1',
    tierLevel: 1,
    expiresAt: new Date(Date.now() + 30 * 86400000),
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVipTier2 = {
    id: 'vip-tier-2',
    level: 2,
    name: 'VIP2',
    baseMonthlyPrice: 3000,
    isActive: true,
    configs: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGateway = {
      name: 'mock',
      createPayment: jest.fn(),
      verifyWebhook: jest.fn(),
      // 默认未支付：重新下单前的网关对账（reconcileGatewayPaidOrder）返回 false
      queryOrder: jest.fn().mockResolvedValue({ status: 'NOTPAY' }),
      refund: jest.fn(),
      forceComplete: jest.fn(),
    };

    prisma = {
      vipTier: { findUnique: jest.fn(), findFirst: jest.fn() },
      durationPricing: { findUnique: jest.fn(), findFirst: jest.fn() },
      paymentOrder: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      refundApplication: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      userMembership: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    gatewayFactory = {
      getActiveGateway: jest.fn(),
      getGateway: jest.fn(),
    };

    membershipService = {
      getMembership: jest.fn(),
      getEffectiveTier: jest.fn(),
      activate: jest.fn(),
      recalculateFromOrders: jest.fn(),
    };

    storageInfoService = {
      invalidateQuotaCache: jest.fn(),
    };

    runtimeConfigService = {
      getValue: jest.fn(),
    };

    emailService = {
      sendRefundApplicationNotify: jest.fn(),
      sendRefundResultNotify: jest.fn(),
    };

    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: DatabaseService, useValue: prisma },
        { provide: PaymentGatewayFactory, useValue: gatewayFactory },
        { provide: MembershipService, useValue: membershipService },
        { provide: StorageInfoService, useValue: storageInfoService },
        { provide: RuntimeConfigService, useValue: runtimeConfigService },
        { provide: EmailService, useValue: emailService },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('getUserMembership', () => {
    it('should delegate to MembershipService.getMembership', async () => {
      membershipService.getMembership.mockResolvedValue({
        tierLevel: 1,
        expiresAt: new Date(),
        daysRemaining: 15,
      });
      const result = await service.getUserMembership('user-1');
      expect(membershipService.getMembership).toHaveBeenCalledWith('user-1');
      expect(result.tierLevel).toBe(1);
    });
  });

  describe('getUserOrders', () => {
    it('should return paginated orders', async () => {
      prisma.paymentOrder.findMany.mockResolvedValue([mockOrder]);
      prisma.paymentOrder.count.mockResolvedValue(1);
      const result = await service.getUserOrders('user-1', 1, 20);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
        include: {
          refundApplications: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              reason: true,
              createdAt: true,
              reviewNote: true,
              reviewedAt: true,
            },
          },
        },
      });
    });
  });

  describe('createOrder', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(
        service.createOrder('user-1', {
          vipTierId: 'nonexistent',
          durationPricingId: 'dur-1',
          tradeType: 'NATIVE',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when vip tier is inactive', async () => {
      prisma.vipTier.findUnique.mockResolvedValue(null);
      await expect(
        service.createOrder('user-1', {
          vipTierId: 'vip-tier-1',
          durationPricingId: 'dur-1',
          tradeType: 'NATIVE',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should reuse recent pending order when exists', async () => {
      prisma.vipTier.findUnique.mockResolvedValue(mockVipTier);
      prisma.durationPricing.findUnique.mockResolvedValue(mockDurationPricing);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      prisma.paymentOrder.findFirst.mockResolvedValue(mockOrder);
      mockGateway.createPayment.mockResolvedValue({
        gatewayOrderId: 'gateway-456',
        codeUrl: 'http://mock.qr/xyz',
      });
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        gatewayOrderId: 'gateway-456',
      });

      const result = await service.createOrder('user-1', {
        vipTierId: 'vip-tier-1',
        durationPricingId: 'dur-1',
        tradeType: 'NATIVE',
      });

      expect(prisma.paymentOrder.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          vipTierId: 'vip-tier-1',
          months: 1,
          status: OrderStatus.PENDING,
          gateway: 'mock',
          createdAt: { gte: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.orderNo).toBe('PAYtest123');
    });

    // 回归：复用的 PENDING 单在微信侧已支付（回调丢失）时，createOrder
    // 应查单对账完成订单，而非重新下单被 ORDERPAID 拒绝。
    it('should complete reused pending order via reconcile when already paid at gateway', async () => {
      prisma.vipTier.findUnique.mockResolvedValue(mockVipTier);
      prisma.durationPricing.findUnique.mockResolvedValue(mockDurationPricing);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      prisma.paymentOrder.findFirst.mockResolvedValue(mockOrder);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-paid-101',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
      });

      const result = await service.createOrder('user-1', {
        vipTierId: 'vip-tier-1',
        durationPricingId: 'dur-1',
        tradeType: 'NATIVE',
      });

      expect(mockGateway.createPayment).not.toHaveBeenCalled();
      expect(membershipService.activate).toHaveBeenCalled();
      expect(result.status).toBe(OrderStatus.SUCCEEDED);
    });

    it('should create new order when no pending exists', async () => {
      prisma.vipTier.findUnique.mockResolvedValue(mockVipTier);
      prisma.durationPricing.findUnique.mockResolvedValue(mockDurationPricing);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      prisma.paymentOrder.findFirst.mockResolvedValue(null);
      mockGateway.createPayment.mockResolvedValue({
        gatewayOrderId: 'gateway-789',
        codeUrl: 'http://mock.qr/abc',
      });
      prisma.paymentOrder.create.mockResolvedValue({
        ...mockOrder,
        orderNo: 'PAYnew123',
        gatewayOrderId: 'gateway-789',
      });
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        orderNo: 'PAYnew123',
        gatewayOrderId: 'gateway-789',
      });

      const result = await service.createOrder('user-1', {
        vipTierId: 'vip-tier-1',
        durationPricingId: 'dur-1',
        tradeType: 'NATIVE',
      });

      expect(prisma.paymentOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderNo: expect.stringMatching(/^PAY/),
          userId: 'user-1',
          vipTierId: 'vip-tier-1',
          months: 1,
          amount: 1500,
          gateway: 'mock',
          tradeType: 'NATIVE',
          description: 'VIP1 1个月',
        }),
      });
      expect(result.vipTierName).toBe('VIP1');
    });

    it('should reuse pending order and update tradeType when changed', async () => {
      prisma.vipTier.findUnique.mockResolvedValue(mockVipTier);
      prisma.durationPricing.findUnique.mockResolvedValue(mockDurationPricing);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      prisma.paymentOrder.findFirst.mockResolvedValue(mockOrder);
      mockGateway.createPayment.mockResolvedValue({
        gatewayOrderId: 'gateway-456',
      });
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        tradeType: 'JSAPI',
      });

      await service.createOrder('user-1', {
        vipTierId: 'vip-tier-1',
        durationPricingId: 'dur-1',
        tradeType: 'JSAPI',
      });

      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrder.id, status: OrderStatus.PENDING },
          data: expect.objectContaining({ tradeType: 'JSAPI' }),
        })
      );
    });

    it('should reuse existing pending order with its own orderNo/amount on P2002', async () => {
      prisma.vipTier.findUnique.mockResolvedValue(mockVipTier);
      prisma.durationPricing.findUnique.mockResolvedValue(mockDurationPricing);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      // 第一次 findFirst（复用分支）未命中 → 走建单主逻辑；第二次 findFirst（P2002 兜底）命中已有订单
      prisma.paymentOrder.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValue(mockOrder);
      // 第一次 createPayment 用新 orderNo（会失败）；第二次必须用 existing 的 orderNo/amount 重新下单
      mockGateway.createPayment
        .mockResolvedValueOnce({ gatewayOrderId: 'gateway-failed-new' })
        .mockResolvedValue({
          gatewayOrderId: 'gateway-reused',
          codeUrl: 'http://mock.qr/reused',
        });
      prisma.paymentOrder.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.8.0',
        })
      );
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.createOrder('user-1', {
        vipTierId: 'vip-tier-1',
        durationPricingId: 'dur-1',
        tradeType: 'NATIVE',
      });

      // 关键：用 existing 的 orderNo/amount 重新下单，而不是本次失败请求编码的新 orderNo
      expect(mockGateway.createPayment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderNo: mockOrder.orderNo,
          amount: mockOrder.amount,
          tradeType: 'NATIVE',
        })
      );
      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith({
        where: { id: mockOrder.id, status: OrderStatus.PENDING },
        data: expect.objectContaining({ gatewayOrderId: 'gateway-reused' }),
      });
      expect(result.orderNo).toBe(mockOrder.orderNo);
      expect(result.codeUrl).toBe('http://mock.qr/reused');
    });

    describe('price calculation across duration discount curve', () => {
      const tier1500 = { ...mockVipTier, baseMonthlyPrice: 1500 };
      const tier3000 = { ...mockVipTier, baseMonthlyPrice: 3000 };
      const tier6000 = { ...mockVipTier, baseMonthlyPrice: 6000 };
      const dur = (months: number, multiplierBps: number) => ({
        ...mockDurationPricing,
        months,
        multiplierBps,
      });

      // worked examples from production seed (金额单位：分)
      // 公式：round(月价 × bps/10000 × 月数)
      const priceCases: Array<{
        name: string;
        tier: any;
        dur: any;
        expected: number;
      }> = [
        {
          name: 'VIP1 1个月 无折扣',
          tier: tier1500,
          dur: dur(1, 10000),
          expected: 1500,
        },
        {
          name: 'VIP1 3个月 95折',
          tier: tier1500,
          dur: dur(3, 9500),
          expected: 4275,
        },
        {
          name: 'VIP2 3个月 95折',
          tier: tier3000,
          dur: dur(3, 9500),
          expected: 8550,
        },
        {
          name: 'VIP2 6个月 86折',
          tier: tier3000,
          dur: dur(6, 8600),
          expected: 15480,
        },
        {
          name: 'VIP2 12个月 7折',
          tier: tier3000,
          dur: dur(12, 7000),
          expected: 25200,
        },
        {
          name: 'VIP3 12个月 7折',
          tier: tier6000,
          dur: dur(12, 7000),
          expected: 50400,
        },
      ];

      it.each(priceCases)(
        '$name → $expected 分',
        async ({ tier, dur, expected }) => {
          prisma.vipTier.findUnique.mockResolvedValue(tier);
          prisma.durationPricing.findUnique.mockResolvedValue(dur);
          gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
          prisma.paymentOrder.findFirst.mockResolvedValue(null);
          mockGateway.createPayment.mockResolvedValue({
            gatewayOrderId: 'gw-1',
          });
          prisma.paymentOrder.create.mockResolvedValue({
            ...mockOrder,
            amount: expected,
            months: dur.months,
          });

          await service.createOrder('user-1', {
            vipTierId: 'vip-tier-1',
            durationPricingId: 'dur-1',
            tradeType: 'NATIVE',
          });

          expect(prisma.paymentOrder.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              amount: expected,
              months: dur.months,
            }),
          });
        }
      );

      it('rounds fractional cents instead of truncating', async () => {
        // 1000 × 9555 × 1 / 10000 = 955.5 → Math.round → 956
        prisma.vipTier.findUnique.mockResolvedValue({
          ...mockVipTier,
          baseMonthlyPrice: 1000,
        });
        prisma.durationPricing.findUnique.mockResolvedValue(dur(1, 9555));
        gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
        prisma.paymentOrder.findFirst.mockResolvedValue(null);
        mockGateway.createPayment.mockResolvedValue({ gatewayOrderId: 'gw-1' });
        prisma.paymentOrder.create.mockResolvedValue({
          ...mockOrder,
          amount: 956,
          months: 1,
        });

        await service.createOrder('user-1', {
          vipTierId: 'vip-tier-1',
          durationPricingId: 'dur-1',
          tradeType: 'NATIVE',
        });

        expect(prisma.paymentOrder.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ amount: 956 }),
        });
      });
    });
  });

  describe('handlePaymentNotify', () => {
    const verified = {
      isValid: true,
      orderNo: 'PAYtest123',
      gatewayOrderId: 'txn-001',
      amount: 2400,
      paidAt: new Date(),
    };

    it('should skip when order status is not PENDING', async () => {
      const doneOrder = { ...mockOrder, status: OrderStatus.SUCCEEDED };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...doneOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      await service.handlePaymentNotify(verified);
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('should mark FAILED on amount mismatch with PENDING guard', async () => {
      const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
          paymentOrderUpdateMany: updateManyMock,
        });
        await cb(tx);
        expect(updateManyMock).toHaveBeenCalledWith({
          where: { id: mockOrder.id, status: OrderStatus.PENDING },
          data: expect.objectContaining({ status: OrderStatus.FAILED }),
        });
      });

      await service.handlePaymentNotify({ ...verified, amount: 100 });
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('should reconcile TIMEOUT order as SUCCEEDED when gateway confirms payment', async () => {
      const timeoutOrder = {
        ...mockOrder,
        status: OrderStatus.TIMEOUT,
        vipTier: mockVipTier,
      };
      const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-001',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: timeoutOrder,
          paymentOrderUpdateMany: updateManyMock,
        });
        await cb(tx);
        expect(updateManyMock).toHaveBeenCalledWith({
          where: { id: mockOrder.id, status: OrderStatus.TIMEOUT },
          data: expect.objectContaining({
            status: OrderStatus.SUCCEEDED,
            gatewayPaidId: 'txn-001',
          }),
        });
      });

      await service.handlePaymentNotify(verified);
      expect(membershipService.activate).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { level: 1, baseMonthlyPrice: 1500 },
        30
      );
    });

    it('should not reconcile when gateway reports non-SUCCESS for TIMEOUT order', async () => {
      const timeoutOrder = {
        ...mockOrder,
        status: OrderStatus.TIMEOUT,
        vipTier: mockVipTier,
      };
      const updateManyMock = jest.fn().mockResolvedValue({ count: 0 });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({ status: 'NOTPAY' });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: timeoutOrder,
          paymentOrderUpdateMany: updateManyMock,
        });
        await cb(tx);
      });

      await service.handlePaymentNotify(verified);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('should activate membership on success', async () => {
      const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: {
            ...mockOrder,
            vipTier: mockVipTier,
            months: 1,
          },
          paymentOrderUpdateMany: updateManyMock,
        });
        await cb(tx);
        expect(updateManyMock).toHaveBeenCalledWith({
          where: { id: mockOrder.id, status: OrderStatus.PENDING },
          data: expect.objectContaining({
            status: OrderStatus.SUCCEEDED,
            gatewayPaidId: 'txn-001',
          }),
        });
      });

      await service.handlePaymentNotify(verified);
      expect(membershipService.activate).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { level: 1, baseMonthlyPrice: 1500 },
        30
      );
    });

    it('should pass months-converted days on same-tier renewal', async () => {
      const activeMembership = {
        ...mockUserMembership,
        tierLevel: 1,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: {
            ...mockOrder,
            vipTier: mockVipTier,
            months: 1,
          },
          userMembershipFindUnique: activeMembership,
        });
        await cb(tx);
      });

      await service.handlePaymentNotify(verified);
      expect(membershipService.activate).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { level: 1, baseMonthlyPrice: 1500 },
        30
      );
    });

    it('should pass tier and months-converted days on upgrade order (proration in membership)', async () => {
      const orderWithVip2 = {
        ...mockOrder,
        vipTier: mockVipTier2,
        months: 3,
        amount: 9000,
      };

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: orderWithVip2,
        });
        await cb(tx);
      });

      await service.handlePaymentNotify({ ...verified, amount: 9000 });

      // 升级折算数学在 membership：billing 只传等级对象 + 原始天数（3 × 30）
      expect(membershipService.activate).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { level: 2, baseMonthlyPrice: 3000 },
        90
      );
    });

    it('should pass converted days even when zero-price tier (guard in membership)', async () => {
      // 新档位 baseMonthlyPrice=0 的除零保护在 membership，billing 只做"月→天"换算
      const zeroPriceTier = { ...mockVipTier2, baseMonthlyPrice: 0 };
      const orderZeroTier = { ...mockOrder, vipTier: zeroPriceTier, months: 3 };

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: orderZeroTier,
        });
        await cb(tx);
      });

      await service.handlePaymentNotify(verified);

      expect(membershipService.activate).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        { level: 2, baseMonthlyPrice: 0 },
        90
      );
      const actualDays = membershipService.activate.mock.calls[0][3];
      expect(Number.isFinite(actualDays)).toBe(true);
    });
  });

  describe('handleWechatNotify', () => {
    it('should return SUCCESS xml when verification passes', async () => {
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.verifyWebhook.mockResolvedValue({
        isValid: true,
        orderNo: 'PAYtest123',
        gatewayOrderId: 'txn-001',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      const result = await service.handleWechatNotify('<xml></xml>');
      expect(result).toContain('SUCCESS');
    });

    it('should return FAIL xml when sign verification fails', async () => {
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.verifyWebhook.mockResolvedValue({
        isValid: false,
        orderNo: '',
        gatewayOrderId: '',
        amount: 0,
        paidAt: new Date(),
      });

      const result = await service.handleWechatNotify('<xml></xml>');
      expect(result).toContain('FAIL');
    });
  });

  describe('manualComplete', () => {
    it('should verify and notify for mock callback', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.verifyWebhook.mockResolvedValue({
        isValid: true,
        orderNo: 'PAYtest123',
        gatewayOrderId: 'mock_txn_123',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      await service.manualComplete('PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
    });
  });

  describe('getAllOrders', () => {
    it('should return paginated orders with user and vip tier info', async () => {
      prisma.paymentOrder.findMany.mockResolvedValue([
        {
          ...mockOrder,
          user: { id: 'user-1', email: 'test@test.com', username: 'test' },
          vipTier: { name: 'VIP1', level: 1 },
        },
      ]);
      prisma.paymentOrder.count.mockResolvedValue(1);
      const result = await service.getAllOrders(1, 20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].user.email).toBe('test@test.com');
    });
  });

  describe('queryOrder', () => {
    it('should return order for the owner', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      const result = await service.queryOrder('user-1', 'PAYtest123');
      expect(result.orderNo).toBe('PAYtest123');
    });

    it('should throw NotFoundException for other user', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      await expect(service.queryOrder('user-2', 'PAYtest123')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw NotFoundException when order missing', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(null);
      await expect(service.queryOrder('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('repayOrder', () => {
    const repayDto = { tradeType: 'NATIVE' };

    it('should throw NotFoundException when order missing', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(null);
      await expect(
        service.repayOrder('user-1', 'PAYmissing', repayDto)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for other user', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        userId: 'other-user',
      });
      await expect(
        service.repayOrder('user-1', 'PAYtest123', repayDto)
      ).rejects.toThrow(NotFoundException);
    });

    it('should return pay response without re-issuing when order is not PENDING', async () => {
      const succeeded = {
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
        vipTier: mockVipTier,
      };
      prisma.paymentOrder.findUnique.mockResolvedValue(succeeded);

      const result = await service.repayOrder('user-1', 'PAYtest123', repayDto);

      expect(gatewayFactory.getActiveGateway).not.toHaveBeenCalled();
      expect(mockGateway.createPayment).not.toHaveBeenCalled();
      expect(result.status).toBe(OrderStatus.SUCCEEDED);
    });

    it('should throw BadRequestException when stale order would downgrade current tier', async () => {
      const staleOrder = {
        ...mockOrder,
        createdAt: new Date(Date.now() - 3 * 3600000),
        vipTier: mockVipTier,
      };
      prisma.paymentOrder.findUnique.mockResolvedValue(staleOrder);
      membershipService.getEffectiveTier.mockResolvedValue(2);

      await expect(
        service.repayOrder('user-1', 'PAYtest123', repayDto)
      ).rejects.toThrow(BadRequestException);
      expect(prisma.paymentOrder.updateMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException and keep stale order open when duration pricing missing', async () => {
      const staleOrder = {
        ...mockOrder,
        createdAt: new Date(Date.now() - 3 * 3600000),
        vipTier: mockVipTier,
      };
      prisma.paymentOrder.findUnique.mockResolvedValue(staleOrder);
      membershipService.getEffectiveTier.mockResolvedValue(0);
      prisma.durationPricing.findFirst.mockResolvedValue(null);

      await expect(
        service.repayOrder('user-1', 'PAYtest123', repayDto)
      ).rejects.toThrow(NotFoundException);
      expect(prisma.paymentOrder.updateMany).not.toHaveBeenCalled();
    });

    it('should close stale order and create a new order', async () => {
      const staleOrder = {
        ...mockOrder,
        createdAt: new Date(Date.now() - 3 * 3600000),
        months: 3,
        vipTier: mockVipTier,
      };
      prisma.paymentOrder.findUnique.mockResolvedValue(staleOrder);
      membershipService.getEffectiveTier.mockResolvedValue(0);
      prisma.durationPricing.findFirst.mockResolvedValue({
        id: 'dur-3',
        months: 3,
        multiplierBps: 9500,
        label: '3个月',
        isActive: true,
      });
      // createOrder 内部依赖：旧单关掉后按新 pricing 重建
      prisma.vipTier.findUnique.mockResolvedValue(mockVipTier);
      prisma.durationPricing.findUnique.mockResolvedValue({
        ...mockDurationPricing,
        id: 'dur-3',
        months: 3,
        multiplierBps: 9500,
      });
      prisma.paymentOrder.findFirst.mockResolvedValue(null);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      mockGateway.createPayment.mockResolvedValue({ gatewayOrderId: 'gw-new' });
      prisma.paymentOrder.create.mockResolvedValue({
        ...mockOrder,
        orderNo: 'PAYrenew',
        months: 3,
        amount: 4275,
      });

      await service.repayOrder('user-1', 'PAYtest123', repayDto);

      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith({
        where: { id: staleOrder.id, status: OrderStatus.PENDING },
        data: expect.objectContaining({
          status: OrderStatus.TIMEOUT,
          closedAt: expect.any(Date),
        }),
      });
      expect(prisma.paymentOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ months: 3, amount: 4275 }),
      });
    });

    it('should re-issue payment on fresh pending order with same orderNo', async () => {
      const freshOrder = { ...mockOrder, vipTier: mockVipTier };
      prisma.paymentOrder.findUnique.mockResolvedValue(freshOrder);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      mockGateway.createPayment.mockResolvedValue({ gatewayOrderId: 'gw-2' });
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.repayOrder('user-1', 'PAYtest123', repayDto);

      expect(mockGateway.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderNo: 'PAYtest123',
          amount: 2400,
          tradeType: 'NATIVE',
        })
      );
      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith({
        where: { id: freshOrder.id, status: OrderStatus.PENDING },
        data: expect.objectContaining({ gatewayOrderId: 'gw-2' }),
      });
      expect(result.orderNo).toBe('PAYtest123');
      expect(result.gatewayOrderId).toBe('gw-2');
    });

    // 回归：用户已支付但回调丢失（订单停留 PENDING）时，重新下单会被微信以
    // ORDERPAID（"该订单已支付"）拒绝并 500。repay 必须先查单对账，
    // 已支付则完成订单 + 激活会员，直接返回终态而非报错。
    it('should complete order via gateway reconcile instead of re-issuing when already paid (missing callback)', async () => {
      const freshOrder = { ...mockOrder, vipTier: mockVipTier };
      prisma.paymentOrder.findUnique
        .mockResolvedValueOnce(freshOrder)
        .mockResolvedValue({ ...mockOrder, status: OrderStatus.SUCCEEDED });
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-paid-001',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      const result = await service.repayOrder('user-1', 'PAYtest123', repayDto);

      expect(mockGateway.createPayment).not.toHaveBeenCalled();
      expect(mockGateway.queryOrder).toHaveBeenCalledWith('PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
        'user-1'
      );
      expect(result.status).toBe(OrderStatus.SUCCEEDED);
    });

    // 回归：查单时尚未支付、下单瞬间支付完成的竞态窗口内，微信以 ORDERPAID
    // 拒绝重新下单。repay 应捕获该错误转对账完成订单，而非 500。
    it('should complete order when createPayment rejected with ORDERPAID (race window)', async () => {
      const freshOrder = { ...mockOrder, vipTier: mockVipTier };
      prisma.paymentOrder.findUnique
        .mockResolvedValueOnce(freshOrder)
        .mockResolvedValue({ ...mockOrder, status: OrderStatus.SUCCEEDED });
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      // 第一次查单（下单前对账）未支付；第二次查单（ORDERPAID 兜底）已支付
      mockGateway.queryOrder
        .mockResolvedValueOnce({ status: 'NOTPAY' })
        .mockResolvedValue({
          status: 'SUCCESS',
          gatewayOrderId: 'txn-paid-002',
          amount: 2400,
          paidAt: new Date(),
        });
      const orderPaidError = new Error(
        'wechat api business error: 该订单已支付'
      ) as Error & { errCode?: string };
      orderPaidError.errCode = 'ORDERPAID';
      mockGateway.createPayment.mockRejectedValue(orderPaidError);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      const result = await service.repayOrder('user-1', 'PAYtest123', repayDto);

      expect(mockGateway.createPayment).toHaveBeenCalledTimes(1);
      expect(mockGateway.queryOrder).toHaveBeenCalledTimes(2);
      expect(membershipService.activate).toHaveBeenCalled();
      expect(result.status).toBe(OrderStatus.SUCCEEDED);
    });

    it('should propagate non-ORDERPAID createPayment errors', async () => {
      const freshOrder = { ...mockOrder, vipTier: mockVipTier };
      prisma.paymentOrder.findUnique.mockResolvedValueOnce(freshOrder);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      mockGateway.createPayment.mockRejectedValue(
        new Error('wechat api business error: 系统繁忙')
      );

      await expect(
        service.repayOrder('user-1', 'PAYtest123', repayDto)
      ).rejects.toThrow('wechat api business error: 系统繁忙');
      expect(mockGateway.queryOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshOrder', () => {
    it('should return order immediately when not PENDING', async () => {
      const succeeded = { ...mockOrder, status: OrderStatus.SUCCEEDED };
      prisma.paymentOrder.findUnique.mockResolvedValue(succeeded);
      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(result.status).toBe(OrderStatus.SUCCEEDED);
    });

    it('should handle SUCCESS from gateway', async () => {
      prisma.paymentOrder.findUnique
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValue({ ...mockOrder, status: OrderStatus.SUCCEEDED });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-001',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
      expect(result.status).toBe(OrderStatus.SUCCEEDED);
    });

    it('should mark FAILED on amount mismatch from gateway', async () => {
      prisma.paymentOrder.findUnique
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValue({ ...mockOrder, status: OrderStatus.FAILED });
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-001',
        amount: 100,
      });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(result.status).toBe(OrderStatus.FAILED);
    });

    it('should handle CLOSED from gateway', async () => {
      prisma.paymentOrder.findUnique
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValue({ ...mockOrder, status: OrderStatus.CLOSED });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({ status: 'CLOSED' });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(result.status).toBe(OrderStatus.CLOSED);
    });

    it('should mark TIMEOUT for old NOTPAY orders', async () => {
      const oldOrder = {
        ...mockOrder,
        createdAt: new Date(Date.now() - 3 * 3600000),
      };
      prisma.paymentOrder.findUnique
        .mockResolvedValueOnce(oldOrder)
        .mockResolvedValue({ ...oldOrder, status: OrderStatus.TIMEOUT });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({ status: 'NOTPAY' });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(result.status).toBe(OrderStatus.TIMEOUT);
    });
  });

  describe('reconcilePendingOrders', () => {
    // 回归：回调丢失（IP 白名单拦截/网络故障）时，cron 主动查单对账
    // 补激活已支付订单，不依赖用户操作
    it('should complete and activate paid orders found by gateway query', async () => {
      prisma.paymentOrder.findMany.mockResolvedValue([
        { orderNo: 'PAYtest123', amount: 2400, gateway: 'mock' },
      ]);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-reconcile-1',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      const recovered = await service.reconcilePendingOrders(new Date());

      expect(recovered).toBe(1);
      expect(mockGateway.queryOrder).toHaveBeenCalledWith('PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
      expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
        'user-1'
      );
    });

    it('should mark FAILED on amount mismatch and never activate', async () => {
      prisma.paymentOrder.findMany.mockResolvedValue([
        { orderNo: 'PAYtest123', amount: 2400, gateway: 'mock' },
      ]);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-reconcile-2',
        amount: 100,
        paidAt: new Date(),
      });
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });

      const recovered = await service.reconcilePendingOrders(new Date());

      expect(recovered).toBe(0);
      expect(membershipService.activate).not.toHaveBeenCalled();
      expect(prisma.paymentOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderNo: 'PAYtest123', status: OrderStatus.PENDING },
          data: expect.objectContaining({ status: OrderStatus.FAILED }),
        })
      );
    });

    it('should skip orders gateway reports NOTPAY', async () => {
      prisma.paymentOrder.findMany.mockResolvedValue([
        { orderNo: 'PAYtest123', amount: 2400, gateway: 'mock' },
      ]);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({ status: 'NOTPAY' });

      const recovered = await service.reconcilePendingOrders(new Date());

      expect(recovered).toBe(0);
      expect(membershipService.activate).not.toHaveBeenCalled();
    });

    it('should continue on single order failure', async () => {
      prisma.paymentOrder.findMany.mockResolvedValue([
        { orderNo: 'PAYbad001', amount: 2400, gateway: 'mock' },
        { orderNo: 'PAYtest123', amount: 2400, gateway: 'mock' },
      ]);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder
        .mockRejectedValueOnce(new Error('gateway timeout'))
        .mockResolvedValueOnce({
          status: 'SUCCESS',
          gatewayOrderId: 'txn-reconcile-3',
          amount: 2400,
          paidAt: new Date(),
        });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      const recovered = await service.reconcilePendingOrders(new Date());

      // 单笔失败不阻断本轮其余订单
      expect(recovered).toBe(1);
      expect(membershipService.activate).toHaveBeenCalledTimes(1);
    });
  });

  describe('mockScan', () => {
    it('should force complete and refresh mock order', async () => {
      prisma.paymentOrder.findUnique
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValue({ ...mockOrder, status: OrderStatus.SUCCEEDED });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'mock_xxx',
        amount: 2400,
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = buildTx({
          paymentOrderFindUnique: { ...mockOrder, vipTier: mockVipTier },
        });
        await cb(tx);
      });

      await service.mockScan('user-1', 'PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    it('should throw on non-SUCCEEDED order', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      await expect(service.refund('PAYtest123')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw when optimistic lock fails (already refunded)', async () => {
      const succeededOrder = {
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
        vipTier: mockVipTier,
      };
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      const updateManyMock = jest.fn().mockResolvedValue({ count: 0 });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = { paymentOrder: { updateMany: updateManyMock } };
        await cb(tx);
      });

      await expect(service.refund('PAYtest123', 'test refund')).rejects.toThrow(
        BadRequestException
      );
      expect(updateManyMock).toHaveBeenCalled();
    });

    it('should process refund successfully', async () => {
      const succeededOrder = {
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
        vipTier: mockVipTier,
      };
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.refund.mockResolvedValue(undefined);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
          },
        };
        await cb(tx);
      });

      await service.refund('PAYtest123', 'test refund');
      expect(mockGateway.refund).toHaveBeenCalledWith('PAYtest123', 2400);
      // 重算已移到外层事务 commit 之后：无剩余订单时委托 membership 落 free 会员
      expect(membershipService.recalculateFromOrders).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        []
      );
    });

    it('should rollback DB on gateway failure', async () => {
      const succeededOrder = {
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
        vipTier: mockVipTier,
      };
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.refund.mockRejectedValue(new Error('gateway timeout'));
      const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = { paymentOrder: { updateMany: updateManyMock } };
        await cb(tx);
      });

      await expect(
        service.refund('PAYtest123', 'gateway error')
      ).rejects.toThrow(BadRequestException);
      expect(updateManyMock).toHaveBeenCalled();
    });

    it('should skip idempotently when order is already REFUNDED', async () => {
      // 上一轮退款成功但申请未闭环，重试时不得二次打款
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.REFUNDED,
        refundedAt: new Date(),
        vipTier: mockVipTier,
      });

      await service.refund('PAYtest123', 'retry reason');

      expect(mockGateway.refund).not.toHaveBeenCalled();
      expect(prisma.paymentOrder.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('applyRefund', () => {
    const succeededOrder = {
      ...mockOrder,
      status: OrderStatus.SUCCEEDED,
    };

    it('should create application and return it', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      const created = {
        id: 'app-1',
        orderId: 'order-1',
        userId: 'user-1',
        amount: 2400,
        reason: '不想要了',
        status: RefundApplicationStatus.PENDING,
        createdAt: new Date(),
      };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          refundApplication: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(created),
          },
        };
        return cb(tx);
      });
      // mailEnabled=false：跳过邮件通知，验证申请流程不受邮件影响
      runtimeConfigService.getValue.mockResolvedValue(false);

      const result = await service.applyRefund('user-1', 'PAYtest123', '不想要了');
      expect(result).toEqual(created);
      expect(runtimeConfigService.getValue).toHaveBeenCalledWith(
        'mailEnabled',
        false
      );
      // 资金敏感操作审计
      expect(auditLogService.log).toHaveBeenCalledWith(
        AuditAction.REFUND_APPLY,
        expect.anything(),
        'PAYtest123',
        'user-1',
        true,
        undefined,
        undefined,
        undefined,
        'PAYtest123',
        expect.objectContaining({ applicationId: 'app-1', amount: 2400 })
      );
    });

    it('should throw NotFound for order of another user', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        userId: 'other-user',
      });
      await expect(
        service.applyRefund('user-1', 'PAYtest123', '不想要了')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when order is not SUCCEEDED', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      await expect(
        service.applyRefund('user-1', 'PAYtest123', '不想要了')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when a PENDING application already exists', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          refundApplication: {
            findFirst: jest.fn().mockResolvedValue({ id: 'app-0' }),
            create: jest.fn(),
          },
        };
        return cb(tx);
      });

      await expect(
        service.applyRefund('user-1', 'PAYtest123', '不想要了')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw friendly error on partial unique index conflict (P2002)', async () => {
      // 并发兜底：两条请求同时通过 findFirst 检查，DB 部分唯一索引命中其一
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      prisma.$transaction.mockImplementation(async () => {
        throw new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`orderId`)',
          { code: 'P2002', clientVersion: '7.8.0' }
        );
      });

      await expect(
        service.applyRefund('user-1', 'PAYtest123', '不想要了')
      ).rejects.toThrow(BadRequestException);
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('should not block application when email notify fails', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      const created = {
        id: 'app-1',
        orderId: 'order-1',
        userId: 'user-1',
        amount: 2400,
        reason: '不想要了',
        status: RefundApplicationStatus.PENDING,
        createdAt: new Date(),
      };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          refundApplication: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(created),
          },
        };
        return cb(tx);
      });
      runtimeConfigService.getValue
        .mockResolvedValueOnce(true) // mailEnabled
        .mockResolvedValueOnce('admin@example.com'); // refundNotifyEmails
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        username: 'u1',
      });
      emailService.sendRefundApplicationNotify.mockRejectedValue(
        new Error('smtp down')
      );

      // 邮件失败只记日志，申请必须成功
      const result = await service.applyRefund('user-1', 'PAYtest123', '不想要了');
      expect(result).toEqual(created);
      // fire-and-forget：等待微任务链执行完再断言邮件调用
      await new Promise((r) => setTimeout(r, 0));
      expect(emailService.sendRefundApplicationNotify).toHaveBeenCalled();
    });
  });

  describe('listRefundApplications', () => {
    it('should query with status filter and include user/order', async () => {
      prisma.refundApplication.findMany.mockResolvedValue([
        { id: 'app-1', status: RefundApplicationStatus.PENDING },
      ]);
      prisma.refundApplication.count.mockResolvedValue(1);

      const result = await service.listRefundApplications(1, 10, 'PENDING' as any);
      expect(prisma.refundApplication.findMany).toHaveBeenCalledWith({
        where: { status: RefundApplicationStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
        include: {
          user: { select: { id: true, email: true, username: true } },
          reviewer: {
            select: { id: true, email: true, username: true },
          },
          order: {
            select: {
              orderNo: true,
              description: true,
              status: true,
              gateway: true,
            },
          },
        },
      });
      expect(result.total).toBe(1);
    });
  });

  describe('approveRefundApplication', () => {
    const pendingApplication = {
      id: 'app-1',
      orderId: 'order-1',
      userId: 'user-1',
      amount: 2400,
      reason: '不想要了',
      status: RefundApplicationStatus.PENDING,
      createdAt: new Date(),
      order: { ...mockOrder, status: OrderStatus.SUCCEEDED, vipTier: mockVipTier },
      user: { id: 'user-1', email: 'user@example.com', username: 'u1' },
    };

    it('should refund order and mark application APPROVED', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue(pendingApplication);
      prisma.refundApplication.updateMany.mockResolvedValue({ count: 1 });
      // refund() 内部链路
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
        vipTier: mockVipTier,
      });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.refund.mockResolvedValue(undefined);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
          },
        };
        await cb(tx);
      });
      runtimeConfigService.getValue.mockResolvedValue(false); // mailEnabled=false 跳过结果通知

      await service.approveRefundApplication('app-1', 'admin-1', '同意退款');

      expect(mockGateway.refund).toHaveBeenCalledWith('PAYtest123', 2400);
      // 乐观锁标记 APPROVED：并发驳回时 count=0 上抛，不会覆写对方结果
      expect(prisma.refundApplication.updateMany).toHaveBeenCalledWith({
        where: { id: 'app-1', status: RefundApplicationStatus.PENDING },
        data: expect.objectContaining({
          status: RefundApplicationStatus.APPROVED,
          reviewerId: 'admin-1',
          reviewNote: '同意退款',
        }),
      });
      // 资金敏感操作审计
      expect(auditLogService.log).toHaveBeenCalledWith(
        AuditAction.REFUND_APPROVE,
        expect.anything(),
        'PAYtest123',
        'admin-1',
        true,
        undefined,
        undefined,
        undefined,
        'PAYtest123',
        expect.objectContaining({ applicationId: 'app-1' })
      );
    });

    it('should mark APPROVED when order was already refunded (idempotent retry)', async () => {
      // 上一轮 refund 成功但申请未标记（进程中断等），管理员重试：refund() 幂等跳过，申请正常闭环
      prisma.refundApplication.findUnique.mockResolvedValue(pendingApplication);
      prisma.refundApplication.updateMany.mockResolvedValue({ count: 1 });
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.REFUNDED,
        refundedAt: new Date(),
        vipTier: mockVipTier,
      });
      runtimeConfigService.getValue.mockResolvedValue(false);

      await service.approveRefundApplication('app-1', 'admin-1');

      expect(mockGateway.refund).not.toHaveBeenCalled();
      expect(prisma.refundApplication.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1', status: RefundApplicationStatus.PENDING },
        })
      );
    });

    it('should throw when application was concurrently rejected (optimistic lock)', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue(pendingApplication);
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
        vipTier: mockVipTier,
      });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.refund.mockResolvedValue(undefined);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
          },
        };
        await cb(tx);
      });
      prisma.refundApplication.updateMany.mockResolvedValue({ count: 0 });
      runtimeConfigService.getValue.mockResolvedValue(false);

      await expect(
        service.approveRefundApplication('app-1', 'admin-1')
      ).rejects.toThrow(BadRequestException);
      // 退款已执行但申请未被标记为 APPROVED（保持并发处理的 REJECTED 结果）
      expect(prisma.refundApplication.updateMany).toHaveBeenCalledWith({
        where: { id: 'app-1', status: RefundApplicationStatus.PENDING },
        data: expect.objectContaining({
          status: RefundApplicationStatus.APPROVED,
        }),
      });
    });

    it('should throw when application not found', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue(null);
      await expect(
        service.approveRefundApplication('app-x', 'admin-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when application is not PENDING', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue({
        ...pendingApplication,
        status: RefundApplicationStatus.APPROVED,
      });
      await expect(
        service.approveRefundApplication('app-1', 'admin-1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should keep application PENDING when gateway refund fails', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue(pendingApplication);
      prisma.paymentOrder.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.SUCCEEDED,
        vipTier: mockVipTier,
      });
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.refund.mockRejectedValue(new Error('gateway timeout'));
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = { paymentOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
        await cb(tx);
      });

      await expect(
        service.approveRefundApplication('app-1', 'admin-1')
      ).rejects.toThrow(BadRequestException);
      // 申请未被置为 APPROVED（保持 PENDING 供管理员重试）
      expect(prisma.refundApplication.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('rejectRefundApplication', () => {
    const pendingApplication = {
      id: 'app-1',
      orderId: 'order-1',
      userId: 'user-1',
      amount: 2400,
      reason: '不想要了',
      status: RefundApplicationStatus.PENDING,
      createdAt: new Date(),
      order: { ...mockOrder, status: OrderStatus.SUCCEEDED },
      user: { id: 'user-1', email: 'user@example.com', username: 'u1' },
    };

    it('should mark application REJECTED and keep order untouched', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue(pendingApplication);
      prisma.refundApplication.updateMany.mockResolvedValue({ count: 1 });
      runtimeConfigService.getValue.mockResolvedValue(false); // mailEnabled=false

      await service.rejectRefundApplication('app-1', 'admin-1', '不符合退款条件');

      expect(prisma.refundApplication.updateMany).toHaveBeenCalledWith({
        where: { id: 'app-1', status: RefundApplicationStatus.PENDING },
        data: expect.objectContaining({
          status: RefundApplicationStatus.REJECTED,
          reviewerId: 'admin-1',
          reviewNote: '不符合退款条件',
        }),
      });
      // 订单状态不被修改
      expect(prisma.paymentOrder.update).not.toHaveBeenCalled();
      expect(prisma.paymentOrder.updateMany).not.toHaveBeenCalled();
      // 资金敏感操作审计
      expect(auditLogService.log).toHaveBeenCalledWith(
        AuditAction.REFUND_REJECT,
        expect.anything(),
        'PAYtest123',
        'admin-1',
        true,
        undefined,
        undefined,
        undefined,
        'PAYtest123',
        expect.objectContaining({ applicationId: 'app-1' })
      );
    });

    it('should throw when application not found', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue(null);
      await expect(
        service.rejectRefundApplication('app-x', 'admin-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when application already processed', async () => {
      prisma.refundApplication.findUnique.mockResolvedValue(pendingApplication);
      prisma.refundApplication.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.rejectRefundApplication('app-1', 'admin-1')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recalculateMembershipAfterRefund (billing orchestration)', () => {
    it('should query succeeded orders and delegate to membership recalculateFromOrders', async () => {
      const vipTier1 = {
        id: 'vip-tier-1',
        level: 1,
        name: 'VIP1',
        baseMonthlyPrice: 1500,
        isActive: true,
        configs: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const day = 86400000;
      const now = Date.now();
      const order1 = {
        ...mockOrder,
        paidAt: new Date(now + 10 * day),
        months: 1,
        vipTierId: 'vip-tier-1',
        vipTier: vipTier1,
      };
      const order2 = {
        ...mockOrder,
        id: 'order-2',
        orderNo: 'PAYtest456',
        paidAt: new Date(now + 40 * day),
        months: 2,
        vipTierId: 'vip-tier-1',
        vipTier: vipTier1,
      };
      const findManyMock = jest.fn().mockResolvedValue([order1, order2]);
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = { paymentOrder: { findMany: findManyMock } };
        await cb(tx);
      });

      await (service as any).recalculateMembershipAfterRefund({
        userId: 'user-1',
      });

      expect(findManyMock).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: OrderStatus.SUCCEEDED },
        include: { vipTier: true },
      });
      expect(membershipService.recalculateFromOrders).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        [
          { vipTierLevel: 1, months: 1, paidAt: order1.paidAt },
          { vipTierLevel: 1, months: 2, paidAt: order2.paidAt },
        ]
      );
    });

    it('should filter orders without vipTier or months before delegating', async () => {
      const validOrder = {
        ...mockOrder,
        paidAt: new Date(),
        months: 1,
        vipTier: mockVipTier,
      };
      const noTierOrder = { ...mockOrder, id: 'order-x', vipTier: null };
      const noMonthsOrder = {
        ...mockOrder,
        id: 'order-y',
        months: null,
        vipTier: mockVipTier,
      };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            findMany: jest
              .fn()
              .mockResolvedValue([validOrder, noTierOrder, noMonthsOrder]),
          },
        };
        await cb(tx);
      });

      await (service as any).recalculateMembershipAfterRefund({
        userId: 'user-1',
      });

      expect(membershipService.recalculateFromOrders).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        [{ vipTierLevel: 1, months: 1, paidAt: validOrder.paidAt }]
      );
    });

    it('should pass paidAt-null orders through (cursor semantics in membership)', async () => {
      const orderWithNullPaidAt = {
        ...mockOrder,
        paidAt: null,
        months: 1,
        vipTier: mockVipTier,
      };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            findMany: jest.fn().mockResolvedValue([orderWithNullPaidAt]),
          },
        };
        await cb(tx);
      });

      await (service as any).recalculateMembershipAfterRefund({
        userId: 'user-1',
      });

      expect(membershipService.recalculateFromOrders).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        [{ vipTierLevel: 1, months: 1, paidAt: null }]
      );
    });
  });
});
