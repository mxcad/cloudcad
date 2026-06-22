import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { PlansService } from "./plans.service";

describe("PlansService", () => {
  let service: PlansService;

  const mockPlan = {
    id: "plan-1",
    name: "月度会员",
    durationDays: 30,
    price: 2400,
    originalPrice: 3000,
    tier: "PRO",
    sortOrder: 1,
    isActive: true,
    features: { maxStorage: 1073741824 },
  };

  const mockPrisma = {
    membershipPlan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
  });

  describe("getActivePlans", () => {
    it("should return only active plans with priceYuan", async () => {
      mockPrisma.membershipPlan.findMany.mockResolvedValue([mockPlan]);
      const result = await service.getActivePlans();
      expect(result).toHaveLength(1);
      expect(result[0].priceYuan).toBe(24);
      expect(result[0].originalPriceYuan).toBe(30);
      expect(result[0].name).toBe("月度会员");
    });
  });

  describe("getPlanById", () => {
    it("should return plan when found", async () => {
      mockPrisma.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      const result = await service.getPlanById("plan-1");
      expect(result.id).toBe("plan-1");
      expect(result.priceYuan).toBe(24);
    });

    it("should throw NotFoundException when plan not found", async () => {
      mockPrisma.membershipPlan.findUnique.mockResolvedValue(null);
      await expect(service.getPlanById("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  describe("createPlan", () => {
    it("should create plan when valid", async () => {
      const input = {
        name: "新套餐",
        durationDays: 30,
        price: 1000,
        originalPrice: 1200,
        tier: "PRO",
        sortOrder: 5,
      };
      mockPrisma.membershipPlan.create.mockResolvedValue({ ...mockPlan, ...input, id: "new-plan" });
      const result = await service.createPlan(input);
      expect(result.priceYuan).toBe(10);
    });

    it("should reject when originalPrice < price", async () => {
      const input = {
        name: "假打折",
        durationDays: 30,
        price: 2000,
        originalPrice: 1000,
        tier: "PRO",
        sortOrder: 6,
      };
      await expect(service.createPlan(input)).rejects.toThrow(BadRequestException);
    });

    it("should allow creating plan without originalPrice", async () => {
      const input = {
        name: "无原价",
        durationDays: 30,
        price: 1000,
        tier: "PRO",
        sortOrder: 7,
      };
      const createdPlan = { ...mockPlan, ...input, id: "no-op", originalPrice: null };
      mockPrisma.membershipPlan.create.mockResolvedValue(createdPlan);
      const result = await service.createPlan(input);
      expect(result.originalPriceYuan).toBeNull();
    });
  });

  describe("updatePlan", () => {
    it("should update plan fields", async () => {
      mockPrisma.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrisma.membershipPlan.update.mockResolvedValue({ ...mockPlan, name: "改版" });
      const result = await service.updatePlan("plan-1", { name: "改版" });
      expect(result.name).toBe("改版");
    });

    it("should throw NotFoundException when updating nonexistent plan", async () => {
      mockPrisma.membershipPlan.findUnique.mockResolvedValue(null);
      await expect(service.updatePlan("nonexistent", { name: "x" })).rejects.toThrow(NotFoundException);
    });

    it("should reject update when new originalPrice < new price", async () => {
      mockPrisma.membershipPlan.findUnique.mockResolvedValue({ ...mockPlan, price: 1000, originalPrice: 1200 });
      await expect(service.updatePlan("plan-1", { price: 1500, originalPrice: 1200 })).rejects.toThrow(BadRequestException);
    });
  });

  describe("deactivatePlan", () => {
    it("should soft-delete plan", async () => {
      mockPrisma.membershipPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrisma.membershipPlan.update.mockResolvedValue({ ...mockPlan, isActive: false });
      const result = await service.deactivatePlan("plan-1");
      expect(result.isActive).toBe(false);
    });

    it("should throw on nonexistent plan", async () => {
      mockPrisma.membershipPlan.findUnique.mockResolvedValue(null);
      await expect(service.deactivatePlan("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });
});
