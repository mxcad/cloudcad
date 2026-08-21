import { Test, TestingModule } from '@nestjs/testing';
import { ContextPermissionStrategy } from './context-permission.strategy';
import { DatabaseService } from '../../database/database.service';
import { ClsService } from 'nestjs-cls';
import { SystemPermission } from '../../common/enums/permissions.enum';
import { PolicyConfigService } from '../../policy-engine/services/policy-config.service';
import { PolicyEngineService } from '../../policy-engine/services/policy-engine.service';

describe('ContextPermissionStrategy', () => {
  describe('without policy engine', () => {
    let strategy: ContextPermissionStrategy;

    const mockPrisma = { user: { findUnique: jest.fn() } };
    const mockClsService = { get: jest.fn() };

    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ContextPermissionStrategy,
          { provide: DatabaseService, useValue: mockPrisma },
          { provide: ClsService, useValue: mockClsService },
        ],
      }).compile();
      strategy = module.get<ContextPermissionStrategy>(ContextPermissionStrategy);
    });

    it('should allow non-sensitive permissions during any time', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'test@test.com' });
      const result = await strategy.checkContextRules('user-1', SystemPermission.SYSTEM_USER_READ, {
        time: new Date('2026-01-01T03:00:00'),
        ipAddress: '1.2.3.4',
      });
      expect(result).toBe(true);
    });

    it('should block sensitive permissions outside work hours', async () => {
      const result = await strategy.checkContextRules('user-1', SystemPermission.SYSTEM_USER_DELETE, {
        time: new Date('2026-01-01T03:00:00'),
      });
      expect(result).toBe(false);
    });

    it('should allow sensitive permissions during work hours', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ email: 'test@test.com' });
      const result = await strategy.checkContextRules('user-1', SystemPermission.SYSTEM_USER_DELETE, {
        time: new Date('2026-01-01T10:00:00'),
        ipAddress: '1.2.3.4',
      });
      expect(result).toBe(true);
    });
  });

  describe('with policy engine', () => {
    let strategy: ContextPermissionStrategy;

    const mockPrisma = { user: { findUnique: jest.fn() } };
    const mockClsService = { get: jest.fn() };
    const mockPolicyConfigService = {
      getEnabledPoliciesForPermission: jest.fn(),
    };
    const mockPolicyEngineService = {
      createPolicy: jest.fn(),
      evaluatePolicies: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ContextPermissionStrategy,
          { provide: DatabaseService, useValue: mockPrisma },
          { provide: ClsService, useValue: mockClsService },
          { provide: PolicyConfigService, useValue: mockPolicyConfigService },
          { provide: PolicyEngineService, useValue: mockPolicyEngineService },
        ],
      }).compile();
      strategy = module.get<ContextPermissionStrategy>(ContextPermissionStrategy);
    });

    it('should allow when no policies configured', async () => {
      mockPolicyConfigService.getEnabledPoliciesForPermission.mockResolvedValue([]);
      const result = await strategy.checkContextRules('user-1', SystemPermission.SYSTEM_USER_READ, {
        time: new Date(),
      });
      expect(result).toBe(true);
    });

    it('should allow when all policies pass', async () => {
      const mockPolicy = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
      mockPolicyConfigService.getEnabledPoliciesForPermission.mockResolvedValue([
        { id: 'p1', type: 'time', name: 'time-rule', config: {}, enabled: true },
      ]);
      mockPolicyEngineService.createPolicy.mockReturnValue(mockPolicy);
      mockPolicyEngineService.evaluatePolicies.mockResolvedValue({ allowed: true });

      const result = await strategy.checkContextRules('user-1', SystemPermission.SYSTEM_USER_READ, {
        time: new Date(),
      });
      expect(result).toBe(true);
    });

    it('should deny when any policy fails', async () => {
      mockPolicyConfigService.getEnabledPoliciesForPermission.mockResolvedValue([
        { id: 'p1', type: 'ip', name: 'ip-rule', config: {}, enabled: true },
      ]);
      mockPolicyEngineService.createPolicy.mockReturnValue({ evaluate: jest.fn() });
      mockPolicyEngineService.evaluatePolicies.mockResolvedValue({
        allowed: false,
        denialReason: 'IP not allowed',
      });

      const result = await strategy.checkContextRules('user-1', SystemPermission.SYSTEM_USER_READ, {
        time: new Date(),
        ipAddress: '1.2.3.4',
      });
      expect(result).toBe(false);
    });

    it('should deny on policy evaluation error', async () => {
      mockPolicyConfigService.getEnabledPoliciesForPermission.mockResolvedValue([
        { id: 'p1', type: 'ip', name: 'ip-rule', config: {}, enabled: true },
      ]);
      mockPolicyEngineService.createPolicy.mockReturnValue({ evaluate: jest.fn() });
      mockPolicyEngineService.evaluatePolicies.mockRejectedValue(new Error('Engine error'));

      const result = await strategy.checkContextRules('user-1', SystemPermission.SYSTEM_USER_READ, {
        time: new Date(),
      });
      expect(result).toBe(false);
    });
  });
});
