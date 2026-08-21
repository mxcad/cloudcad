import { Test, type TestingModule } from '@nestjs/testing';
import type { RestrictionContext } from '../interfaces/restriction-strategy.interface';
import { StorageUsageService } from '../storage-usage/storage-usage.service';
import { ProjectSizeStrategy } from './project-size.strategy';

describe('ProjectSizeStrategy', () => {
  let strategy: ProjectSizeStrategy;
  let storageUsageService: any;

  beforeEach(async () => {
    storageUsageService = {
      usageSize: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectSizeStrategy,
        { provide: StorageUsageService, useValue: storageUsageService },
      ],
    }).compile();

    strategy = module.get<ProjectSizeStrategy>(ProjectSizeStrategy);
  });

  const buildCtx = (overrides: Partial<RestrictionContext> = {}): RestrictionContext => ({
    userId: 'user-1',
    projectId: 'project-1',
    tierLevel: 1,
    tierConfig: { 'quota.project_size_mb': 100 },
    ...overrides,
  });

  it('should pass when project total size + increment within limit', async () => {
    storageUsageService.usageSize.mockResolvedValue(50 * 1024 * 1024);
    const result = await strategy.check(buildCtx({ incrementBytes: 30 * 1024 * 1024 }));
    expect(result.allowed).toBe(true);
    expect(storageUsageService.usageSize).toHaveBeenCalledWith({
      kind: 'project',
      projectId: 'project-1',
    });
  });

  it('should deny when project total size + increment exceeds limit', async () => {
    storageUsageService.usageSize.mockResolvedValue(90 * 1024 * 1024);
    const result = await strategy.check(buildCtx({ incrementBytes: 20 * 1024 * 1024 }));
    expect(result.allowed).toBe(false);
    expect(result.key).toBe('quota.project_size_mb');
  });

  it('should pass when limit is 0 (unlimited)', async () => {
    const result = await strategy.check(buildCtx({ tierConfig: { 'quota.project_size_mb': 0 } }));
    expect(result.allowed).toBe(true);
    expect(storageUsageService.usageSize).not.toHaveBeenCalled();
  });

  it('should pass when projectId is not provided', async () => {
    const result = await strategy.check(buildCtx({ projectId: undefined }));
    expect(result.allowed).toBe(true);
    expect(storageUsageService.usageSize).not.toHaveBeenCalled();
  });

  it('should pass when project has no files (usageSize returns 0)', async () => {
    storageUsageService.usageSize.mockResolvedValue(0);
    const result = await strategy.check(buildCtx());
    expect(result.allowed).toBe(true);
  });
});
