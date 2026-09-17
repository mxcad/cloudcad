import { Test, TestingModule } from '@nestjs/testing';
import { ContextPermissionStrategy } from './context-permission.strategy';
import { DatabaseService } from '../../database/database.service';
import { ClsService } from 'nestjs-cls';
import { SystemPermission } from '../../common/enums/permissions.enum';

describe('ContextPermissionStrategy', () => {
  let strategy: ContextPermissionStrategy;

  const mockPrisma = { user: { findUnique: jest.fn() } };
  const mockClsService = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'test@test.com' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextPermissionStrategy,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: ClsService, useValue: mockClsService }
      ]
    }).compile();
    strategy = module.get<ContextPermissionStrategy>(ContextPermissionStrategy);
  });

  it('should allow non-sensitive permissions during any time', async () => {
    const result = await strategy.checkContextRules(
      'user-1',
      SystemPermission.SYSTEM_USER_READ,
      {
        time: new Date('2026-01-01T03:00:00'),
        ipAddress: '1.2.3.4'
      }
    );
    expect(result).toBe(true);
  });

  it('should block sensitive permissions outside work hours', async () => {
    const result = await strategy.checkContextRules(
      'user-1',
      SystemPermission.SYSTEM_USER_DELETE,
      { time: new Date('2026-01-01T03:00:00') }
    );
    expect(result).toBe(false);
  });

  it('should allow sensitive permissions during work hours', async () => {
    const result = await strategy.checkContextRules(
      'user-1',
      SystemPermission.SYSTEM_USER_DELETE,
      {
        time: new Date('2026-01-01T10:00:00'),
        ipAddress: '1.2.3.4'
      }
    );
    expect(result).toBe(true);
  });

  it('should deny when user does not exist (findUnique returns null)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await strategy.checkContextRules(
      'ghost-user',
      SystemPermission.SYSTEM_USER_READ,
      { ipAddress: '1.2.3.4' }
    );
    expect(result).toBe(false);
  });

  it('should deny when user lookup throws', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('db down'));
    const result = await strategy.checkContextRules(
      'user-1',
      SystemPermission.SYSTEM_USER_READ,
      { userAgent: 'test-agent' }
    );
    expect(result).toBe(false);
  });
});
