import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import type { RestrictionContext } from '../interfaces/restriction-strategy.interface';
import { MaxProjectsStrategy } from './max-projects.strategy';

describe('MaxProjectsStrategy', () => {
  let strategy: MaxProjectsStrategy;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      fileSystemNode: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaxProjectsStrategy,
        { provide: DatabaseService, useValue: prisma },
      ],
    }).compile();

    strategy = module.get<MaxProjectsStrategy>(MaxProjectsStrategy);
  });

  const buildCtx = (overrides: Partial<RestrictionContext> = {}): RestrictionContext => ({
    userId: 'user-1',
    tierLevel: 1,
    tierConfig: { 'quota.max_projects': 5 },
    ...overrides,
  });

  it('should pass when under project limit', async () => {
    prisma.fileSystemNode.count.mockResolvedValue(3);
    const result = await strategy.check(buildCtx());
    expect(result.allowed).toBe(true);
  });

  it('should deny when at project limit', async () => {
    prisma.fileSystemNode.count.mockResolvedValue(5);
    const result = await strategy.check(buildCtx());
    expect(result.allowed).toBe(false);
    expect(result.key).toBe('quota.max_projects');
  });

  it('should pass when predicted addition fits within limit', async () => {
    prisma.fileSystemNode.count.mockResolvedValue(4);
    const result = await strategy.check(buildCtx({ metadata: { predictedAdditional: 1 } }));
    expect(result.allowed).toBe(true);
  });

  it('should deny when predicted addition exceeds limit', async () => {
    prisma.fileSystemNode.count.mockResolvedValue(5);
    const result = await strategy.check(buildCtx({ metadata: { predictedAdditional: 1 } }));
    expect(result.allowed).toBe(false);
    expect(result.key).toBe('quota.max_projects');
    expect(result.messageKey).toBe('error.quota.max_projects_exceeded');
    expect(result.current).toBe(5);
    expect(result.limit).toBe(5);
    expect(result.need).toBe(1);
  });

  it('should deny when already over project limit', async () => {
    prisma.fileSystemNode.count.mockResolvedValue(6);
    const result = await strategy.check(buildCtx());
    expect(result.allowed).toBe(false);
    expect(result.key).toBe('quota.max_projects');
    expect(result.need).toBe(2);
  });

  it('should pass when limit is 0 (unlimited)', async () => {
    const result = await strategy.check(buildCtx({ tierConfig: { 'quota.max_projects': 0 } }));
    expect(result.allowed).toBe(true);
  });
});
