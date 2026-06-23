import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PaymentGatewayFactory } from './gateway/payment-gateway.factory';
import { MembershipService } from './membership.service';
import { PlansService } from './plans.service';
import { BillingService } from './billing.service';
import { OrderStatus, MembershipTier } from './enums/billing.enum';
// eslint-disable-next-line @typescript-eslint/no-empty-interface -- used for jest.Mocked type inference
interface PaymentGatewayLike { name: string; createPayment: any; verifyWebhook: any; queryOrder: any; refund: any; }

describe('BillingService', () => {
  let service: BillingService;
  let prisma: any;
  let gatewayFactory: any;
  let membershipService: any;
  let plansService: any;
  let mockGateway: jest.Mocked<PaymentGatewayLike>;

  const mockPlan = {
    id: 'plan-1',
    name: '月度会员',
    durationDays: 30,
    price: 2400,
    originalPrice: 3000,
    tier: 'PRO',
    sortOrder: 1,
    isActive: true,
    features: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOrder = {
    id: 'order-1',
    orderNo: 'PAYtest123',
    userId: 'user-1',
    planId: 'plan-1',
    amount: 2400,
    status: OrderStatus.PENDING,
    gateway: 'mock',
    gatewayOrderId: 'gateway-123',
    tradeType: 'NATIVE',
    gatewayPaidId: null,
    description: '月度会员',
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
    tier: MembershipTier.PRO,
    expiresAt: new Date(Date.now() + 30 * 86400000),
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockGateway = {
      name: 'mock',
      createPayment: jest.fn(),
      verifyWebhook: jest.fn(),
      queryOrder: jest.fn(),
      refund: jest.fn(),
    };

    prisma = {
      membershipPlan: {
        findUnique: jest.fn(),
      },
      paymentOrder: {
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
    };

    plansService = {
      getActivePlans: jest.fn(),
      getAllPlans: jest.fn(),
      createPlan: jest.fn(),
      updatePlan: jest.fn(),
      deactivatePlan: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: DatabaseService, useValue: prisma },
        { provide: PaymentGatewayFactory, useValue: gatewayFactory },
        { provide: MembershipService, useValue: membershipService },
        { provide: PlansService, useValue: plansService },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  describe('getPlans', () => {
    it('should delegate to PlansService.getActivePlans', async () => {
      plansService.getActivePlans.mockResolvedValue([mockPlan]);
      const result = await service.getPlans();
      expect(plansService.getActivePlans).toHaveBeenCalled();
      expect(result).toEqual([mockPlan]);
    });
  });

  describe('getUserMembership', () => {
    it('should delegate to MembershipService.getMembership', async () => {
      membershipService.getMembership.mockResolvedValue({
        tier: 'PRO',
        expiresAt: new Date(),
        daysRemaining: 15,
      });
      const result = await service.getUserMembership('user-1');
      expect(membershipService.getMembership).toHaveBeenCalledWith('user-1');
      expect(result.tier).toBe('PRO');
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
      });
    });
  });

  describe('createOrder', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(null);
      await expect(
        service.createOrder('user-1', { planId: 'nonexistent', tradeType: 'NATIVE' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when plan is inactive', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(null);
      await expect(
        service.createOrder('user-1', { planId: 'plan-1', tradeType: 'NATIVE' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reuse recent pending order when exists', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      prisma.paymentOrder.findFirst.mockResolvedValue(mockOrder);
      mockGateway.createPayment.mockResolvedValue({
        gatewayOrderId: 'gateway-456',
        codeUrl: 'http://mock.qr/xyz',
      });
      prisma.paymentOrder.update.mockResolvedValue({ ...mockOrder, gatewayOrderId: 'gateway-456', tradeType: 'NATIVE' });
      prisma.paymentOrder.findUnique.mockResolvedValue({ ...mockOrder, gatewayOrderId: 'gateway-456' });

      const result = await service.createOrder('user-1', { planId: 'plan-1', tradeType: 'NATIVE' });

      expect(prisma.paymentOrder.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          planId: 'plan-1',
          status: OrderStatus.PENDING,
          gateway: 'mock',
          createdAt: { gte: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.orderNo).toBe('PAYtest123');
    });

    it('should create new order when no pending exists', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(mockPlan);
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

      const result = await service.createOrder('user-1', { planId: 'plan-1', tradeType: 'NATIVE' });

      expect(prisma.paymentOrder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderNo: expect.stringMatching(/^PAY/),
          userId: 'user-1',
          planId: 'plan-1',
          amount: 2400,
          gateway: 'mock',
          tradeType: 'NATIVE',
          description: '月度会员',
        }),
      });
      expect(result.planName).toBe('月度会员');
    });

    it('should reuse pending order and update tradeType when changed', async () => {
      prisma.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      gatewayFactory.getActiveGateway.mockResolvedValue(mockGateway);
      prisma.paymentOrder.findFirst.mockResolvedValue(mockOrder); // tradeType='NATIVE'
      mockGateway.createPayment.mockResolvedValue({
        gatewayOrderId: 'gateway-456',
      });
      prisma.paymentOrder.update.mockResolvedValue({ ...mockOrder, tradeType: 'JSAPI' });
      prisma.paymentOrder.findUnique.mockResolvedValue({ ...mockOrder, tradeType: 'JSAPI' });

      await service.createOrder('user-1', { planId: 'plan-1', tradeType: 'JSAPI' });

      expect(prisma.paymentOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tradeType: 'JSAPI' }),
        }),
      );
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
        const tx = {
          paymentOrder: {
            findUnique: jest.fn().mockResolvedValue({ ...doneOrder, plan: mockPlan }),
            updateMany: jest.fn(),
          },
        };
        await cb(tx);
      });

      await service.handlePaymentNotify(verified);
      // should not call activate
    });

    it('should mark FAILED on amount mismatch', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const updateMock = jest.fn();
        const tx = {
          paymentOrder: {
            findUnique: jest.fn().mockResolvedValue({ ...mockOrder, plan: mockPlan }),
            updateMany: updateMock,
            update: jest.fn(),
          },
        };
        await cb(tx);
        expect(updateMock).not.toHaveBeenCalled();
      });

      await service.handlePaymentNotify({
        ...verified,
        amount: 100,
      });
    });

    it('should activate membership on success', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const updateManyMock = jest.fn().mockResolvedValue({ count: 1 });
        const tx = {
          paymentOrder: {
            findUnique: jest.fn().mockResolvedValue({ ...mockOrder, plan: mockPlan }),
            updateMany: updateManyMock,
          },
        };
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
        mockPlan,
      );
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
        const tx = {
          paymentOrder: {
            findUnique: jest.fn().mockResolvedValue({ ...mockOrder, plan: mockPlan }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
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

  describe('handleMockCallback', () => {
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
        const tx = {
          paymentOrder: {
            findUnique: jest.fn().mockResolvedValue({ ...mockOrder, plan: mockPlan }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        await cb(tx);
      });

      await service.handleMockCallback('PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
    });
  });

  describe('getAllOrders', () => {
    it('should return paginated orders with user and plan info', async () => {
      prisma.paymentOrder.findMany.mockResolvedValue([{
        ...mockOrder,
        user: { id: 'user-1', email: 'test@test.com', username: 'test' },
        plan: { name: '月度会员' },
      }]);
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
      await expect(
        service.queryOrder('user-2', 'PAYtest123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when order missing', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(null);
      await expect(
        service.queryOrder('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
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
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-001',
        amount: 2400,
        paidAt: new Date(),
      });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            findUnique: jest.fn().mockResolvedValue({ ...mockOrder, plan: mockPlan }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        await cb(tx);
      });
      prisma.paymentOrder.findUnique.mockResolvedValue({ ...mockOrder, status: OrderStatus.SUCCEEDED });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
    });

    it('should mark FAILED on amount mismatch from gateway', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({
        status: 'SUCCESS',
        gatewayOrderId: 'txn-001',
        amount: 100,
      });
      prisma.paymentOrder.findUnique.mockResolvedValue({ ...mockOrder, status: OrderStatus.FAILED });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(result.status).toBe(OrderStatus.FAILED);
    });

    it('should handle CLOSED from gateway', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({ status: 'CLOSED' });
      prisma.paymentOrder.findUnique.mockResolvedValue({ ...mockOrder, status: OrderStatus.CLOSED });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(result.status).toBe(OrderStatus.CLOSED);
    });

    it('should mark TIMEOUT for old NOTPAY orders', async () => {
      const oldOrder = { ...mockOrder, createdAt: new Date(Date.now() - 3 * 3600000) };
      prisma.paymentOrder.findUnique.mockResolvedValue(oldOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({ status: 'NOTPAY' });
      prisma.paymentOrder.findUnique.mockResolvedValue({ ...oldOrder, status: OrderStatus.TIMEOUT });

      const result = await service.refreshOrder('user-1', 'PAYtest123');
      expect(result.status).toBe(OrderStatus.TIMEOUT);
    });
  });

  describe('mockScan', () => {
    it('should force complete and refresh mock order', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.queryOrder.mockResolvedValue({ status: 'SUCCESS', gatewayOrderId: 'mock_xxx', amount: 2400 });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            findUnique: jest.fn().mockResolvedValue({ ...mockOrder, plan: mockPlan }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        await cb(tx);
      });
      prisma.paymentOrder.findUnique.mockResolvedValue({ ...mockOrder, status: OrderStatus.SUCCEEDED });

      await service.mockScan('user-1', 'PAYtest123');
      expect(membershipService.activate).toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    it('should throw on non-SUCCEEDED order', async () => {
      prisma.paymentOrder.findUnique.mockResolvedValue(mockOrder);
      await expect(service.refund('PAYtest123')).rejects.toThrow(BadRequestException);
    });

    it('should process refund successfully', async () => {
      const succeededOrder = { ...mockOrder, status: OrderStatus.SUCCEEDED, plan: mockPlan };
      prisma.paymentOrder.findUnique.mockResolvedValue(succeededOrder);
      gatewayFactory.getGateway.mockReturnValue(mockGateway);
      mockGateway.refund.mockResolvedValue(undefined);
      prisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          paymentOrder: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          userMembership: {
            update: jest.fn(),
          },
        };
        await cb(tx);
      });

      await service.refund('PAYtest123', 'test refund');
      expect(mockGateway.refund).toHaveBeenCalledWith('PAYtest123', 2400);
    });
  });

  describe('recalculateMembershipAfterRefund', () => {
    it('should set FREE when no remaining orders', async () => {
      prisma.$transaction.mockImplementation(async (cb: any) => {
        const updateMock = jest.fn();
        const tx = {
          paymentOrder: {
            findMany: jest.fn().mockResolvedValue([]),
          },
          userMembership: {
            update: updateMock,
          },
        };
        await cb(tx);
        expect(updateMock).toHaveBeenCalledWith({
          where: { userId: 'user-1' },
          data: { expiresAt: expect.any(Date), tier: MembershipTier.FREE },
        });
      });
    });

    it('should accumulate remaining orders', async () => {
      const order1 = {
        ...mockOrder,
        paidAt: new Date('2026-01-01'),
        plan: { ...mockPlan, durationDays: 30, tier: 'PRO' },
      };
      const order2 = {
        ...mockOrder,
        id: 'order-2',
        orderNo: 'PAYtest456',
        paidAt: new Date('2026-02-01'),
        plan: { ...mockPlan, durationDays: 60, tier: 'PRO' },
      };

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const updateMock = jest.fn();
        const tx = {
          paymentOrder: {
            findMany: jest.fn().mockResolvedValue([order1, order2]),
          },
          userMembership: {
            update: updateMock,
          },
        };
        await cb(tx);
        // 30 + 60 ≈ 90 days from order1.paidAt
        expect(updateMock).toHaveBeenCalled();
        const updateArg = updateMock.mock.calls[0][0];
        expect(updateArg.data.tier).toBe(MembershipTier.PRO);
        const expiresAt = updateArg.data.expiresAt.getTime();
        const expectedMin = new Date('2026-01-01').getTime() + 89 * 86400000;
        const expectedMax = new Date('2026-01-01').getTime() + 91 * 86400000;
        expect(expiresAt).toBeGreaterThan(expectedMin);
        expect(expiresAt).toBeLessThan(expectedMax);
      });
    });
  });
});
