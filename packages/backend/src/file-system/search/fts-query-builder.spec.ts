import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { FtsQueryBuilder } from './fts-query-builder';

describe('FtsQueryBuilder', () => {
  let service: FtsQueryBuilder;
  const mockPrisma = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FtsQueryBuilder,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FtsQueryBuilder>(FtsQueryBuilder);
  });

  it('returns matched=false for empty keyword', async () => {
    const result = await service.matchIds('');
    expect(result.matched).toBe(false);
    expect(result.ids.size).toBe(0);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns matched=false for whitespace-only keyword', async () => {
    const result = await service.matchIds('   ');
    expect(result.matched).toBe(false);
    expect(result.ids.size).toBe(0);
  });

  it('returns matched=true + ids when FTS finds results', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);

    const result = await service.matchIds('building plan');

    expect(result.matched).toBe(true);
    expect(result.ids).toEqual(new Set(['n1', 'n2']));
  });

  it('returns matched=false + empty ids when FTS finds nothing', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await service.matchIds('zzz_nonexistent');

    expect(result.matched).toBe(false);
    expect(result.ids.size).toBe(0);
  });

  it('falls back to matched=false on database error', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB connection lost'));

    const result = await service.matchIds('test');

    expect(result.matched).toBe(false);
    expect(result.ids.size).toBe(0);
  });

  it('respects maxResults parameter', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await service.matchIds('test', 50);
    await service.matchIds('test', 200);

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('passes keyword as parameterized query', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'n1' }]);

    await service.matchIds('hello-world');

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
