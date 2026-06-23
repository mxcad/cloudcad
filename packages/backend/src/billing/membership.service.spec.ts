import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseService } from "../database/database.service";
import { MembershipService } from "./membership.service";

describe("MembershipService", () => {
  let service: MembershipService;

  const mockPrisma = {
    userMembership: {
      findUnique: jest.fn(),
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
