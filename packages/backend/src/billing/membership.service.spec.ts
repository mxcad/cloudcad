import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { MembershipService } from "./membership.service";

describe("MembershipService", () => {
  let service: MembershipService;

  const mockPrisma = {
    userMembership: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const mockTx: any = {
    userMembership: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MembershipService>(MembershipService);
  });

  describe("activate", () => {
    const plan30: any = { id: "plan-30", name: "月度", durationDays: 30, tier: "PRO", price: 2400, sortOrder: 1, isActive: true, features: null, createdAt: new Date(), updatedAt: new Date(), originalPrice: null };
    const plan60: any = { id: "plan-60", name: "双月", durationDays: 60, tier: "PRO", price: 4000, sortOrder: 2, isActive: true, features: null, createdAt: new Date(), updatedAt: new Date(), originalPrice: null };

    it("should create new membership when no existing record", async () => {
      mockTx.userMembership.findUnique.mockResolvedValue(null);
      const now = Date.now();

      mockTx.userMembership.upsert.mockImplementation(async ({ create }) => create);
      await service.activate(mockTx, "user-1", plan30);

      expect(mockTx.userMembership.upsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: expect.objectContaining({
          userId: "user-1",
          tier: "PRO",
          expiresAt: expect.any(Date),
        }),
        update: expect.any(Object),
      });

      const expiresAt = mockTx.userMembership.upsert.mock.calls[0][0].create.expiresAt.getTime();
      expect(expiresAt - now).toBeGreaterThan(29.5 * 86400000);
      expect(expiresAt - now).toBeLessThan(30.5 * 86400000);
    });

    it("should extend existing membership when still active", async () => {
      const future = new Date(Date.now() + 10 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: "user-1",
        tier: "PRO",
        expiresAt: future,
      });

      mockTx.userMembership.upsert.mockImplementation(async ({ update }) => update);
      await service.activate(mockTx, "user-1", plan30);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      expect(newExpiry - future.getTime()).toBeGreaterThan(29.5 * 86400000);
      expect(newExpiry - future.getTime()).toBeLessThan(30.5 * 86400000);
    });

    it("should start from now when membership expired", async () => {
      const past = new Date(Date.now() - 5 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: "user-1",
        tier: "PRO",
        expiresAt: past,
      });

      mockTx.userMembership.upsert.mockImplementation(async ({ update }) => update);
      await service.activate(mockTx, "user-1", plan30);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      const now = Date.now();
      expect(newExpiry - now).toBeGreaterThan(29.5 * 86400000);
      expect(newExpiry - now).toBeLessThan(30.5 * 86400000);
    });

    it("should accumulate multiple renewals", async () => {
      const future = new Date(Date.now() + 10 * 86400000);
      mockTx.userMembership.findUnique.mockResolvedValue({
        userId: "user-1",
        tier: "PRO",
        expiresAt: future,
      });

      mockTx.userMembership.upsert.mockImplementation(async ({ update }) => update);
      await service.activate(mockTx, "user-1", plan60);

      const updateCall = mockTx.userMembership.upsert.mock.calls[0][0];
      const newExpiry = updateCall.update.expiresAt.getTime();
      expect(newExpiry - Date.now()).toBeGreaterThan(69 * 86400000);
      expect(newExpiry - Date.now()).toBeLessThan(71 * 86400000);
    });
  });

  describe("getMembership", () => {
    it("should return FREE when no membership record exists", async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue(null);
      const result = await service.getMembership("nonexistent-user");
      expect(result.tier).toBe("FREE");
      expect(result.daysRemaining).toBe(0);
      expect(result.expiresAt).toBeNull();
    });

    it("should return FREE when membership is expired", async () => {
      const yesterday = new Date(Date.now() - 86400000);
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: "user-1",
        tier: "PRO",
        expiresAt: yesterday,
      });
      const result = await service.getMembership("user-1");
      expect(result.tier).toBe("FREE");
      expect(result.daysRemaining).toBe(0);
    });

    it("should return active membership with days remaining", async () => {
      const future = new Date(Date.now() + 15 * 86400000);
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: "user-1",
        tier: "PRO",
        expiresAt: future,
      });
      const result = await service.getMembership("user-1");
      expect(result.tier).toBe("PRO");
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.expiresAt).toBe(future);
    });
  });

  describe("getEffectiveTier", () => {
    it("should return FREE when no record exists", async () => {
      mockPrisma.userMembership.findUnique.mockResolvedValue(null);
      const result = await service.getEffectiveTier("nonexistent-user");
      expect(result).toBe("FREE");
    });

    it("should return FREE when expired", async () => {
      const yesterday = new Date(Date.now() - 86400000);
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: "user-1",
        tier: "PRO",
        expiresAt: yesterday,
      });
      const result = await service.getEffectiveTier("user-1");
      expect(result).toBe("FREE");
    });

    it("should return stored tier when active", async () => {
      const future = new Date(Date.now() + 30 * 86400000);
      mockPrisma.userMembership.findUnique.mockResolvedValue({
        userId: "user-1",
        tier: "PRO",
        expiresAt: future,
      });
      const result = await service.getEffectiveTier("user-1");
      expect(result).toBe("PRO");
    });
  });
});
