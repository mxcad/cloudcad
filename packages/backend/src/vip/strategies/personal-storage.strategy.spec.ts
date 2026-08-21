import { Test, type TestingModule } from '@nestjs/testing';
import type { RestrictionContext } from '../interfaces/restriction-strategy.interface';
import { StorageUsageService } from '../storage-usage/storage-usage.service';
import { PersonalStorageStrategy } from './personal-storage.strategy';

describe('PersonalStorageStrategy', () => {
  let strategy: PersonalStorageStrategy;
  let storageUsageService: any;

  beforeEach(async () => {
    storageUsageService = {
      usageSize: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalStorageStrategy,
        { provide: StorageUsageService, useValue: storageUsageService },
      ],
    }).compile();

    strategy = module.get<PersonalStorageStrategy>(PersonalStorageStrategy);
  });

  const buildCtx = (overrides: Partial<RestrictionContext> = {}): RestrictionContext => ({
    userId: 'user-1',
    tierLevel: 1,
    tierConfig: { 'quota.personal_storage_mb': 50 },
    ...overrides,
  });

  it('should pass when personal storage within limit', async () => {
    storageUsageService.usageSize.mockResolvedValue(10 * 1024 * 1024);
    const result = await strategy.check(buildCtx({ incrementBytes: 20 * 1024 * 1024 }));
    expect(result.allowed).toBe(true);
    expect(storageUsageService.usageSize).toHaveBeenCalledWith({
      kind: 'personal',
      userId: 'user-1',
    });
  });

  it('should deny when personal storage exceeds limit', async () => {
    storageUsageService.usageSize.mockResolvedValue(45 * 1024 * 1024);
    const result = await strategy.check(buildCtx({ incrementBytes: 10 * 1024 * 1024 }));
    expect(result.allowed).toBe(false);
    expect(result.key).toBe('quota.personal_storage_mb');
  });

  it('should pass when limit is 0 (unlimited)', async () => {
    const result = await strategy.check(buildCtx({ tierConfig: { 'quota.personal_storage_mb': 0 } }));
    expect(result.allowed).toBe(true);
    expect(storageUsageService.usageSize).not.toHaveBeenCalled();
  });

  it('should pass when personal space missing (usageSize returns 0)', async () => {
    storageUsageService.usageSize.mockResolvedValue(0);
    const result = await strategy.check(buildCtx());
    expect(result.allowed).toBe(true);
  });

  it('should query personal scope for current user', async () => {
    storageUsageService.usageSize.mockResolvedValue(10 * 1024 * 1024);
    await strategy.check(buildCtx({ incrementBytes: 0 }));
    expect(storageUsageService.usageSize).toHaveBeenCalledWith({
      kind: 'personal',
      userId: 'user-1',
    });
  });
});
