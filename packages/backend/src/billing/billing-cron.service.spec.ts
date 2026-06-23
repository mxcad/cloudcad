import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { BillingCron } from "./billing-cron.service";
import { OrderStatus, MembershipTier } from "./enums/billing.enum";

describe("BillingCron", () => {
  let service: BillingCron;

  const mockPrisma = {
    userMembership: {
      updateMany: jest.fn(),
    },
    paymentOrder: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingCron,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BillingCron>(BillingCron);
  });

  describe("downgradeExpiredMemberships", () => {
    it("should downgrade expired memberships to FREE", async () => {
      mockPrisma.userMembership.updateMany.mockResolvedValue({ count: 3 });
      await service.downgradeExpiredMemberships();
      expect(mockPrisma.userMembership.updateMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lte: expect.any(Date), not: null },
        },
        data: { tier: MembershipTier.FREE, expiresAt: null },
      });
    });

    it("should not log when no memberships are expired", async () => {
      mockPrisma.userMembership.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.downgradeExpiredMemberships()).resolves.toBeUndefined();
    });
  });

  describe("timeoutPendingOrders", () => {
    it("should timeout pending orders older than 24h", async () => {
      mockPrisma.paymentOrder.updateMany.mockResolvedValue({ count: 2 });
      await service.timeoutPendingOrders();
      expect(mockPrisma.paymentOrder.updateMany).toHaveBeenCalledWith({
        where: {
          status: OrderStatus.PENDING,
          createdAt: { lte: expect.any(Date) },
        },
        data: { status: OrderStatus.TIMEOUT, closedAt: expect.any(Date) },
      });
    });

    it("should not log when no pending orders to timeout", async () => {
      mockPrisma.paymentOrder.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.timeoutPendingOrders()).resolves.toBeUndefined();
    });
  });
});
