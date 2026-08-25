import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminStatsService } from './admin-stats.service';

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  const mockPrisma = { $queryRaw: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminStatsService,
        { provide: DatabaseService, useValue: mockPrisma },
      ],
    }).compile();
    service = moduleRef.get(AdminStatsService);
  });

  /** 提取第 N 次 $queryRaw 调用的绑定参数（跳过 tagged template 头部） */
  const queryParams = (callIndex = 0): unknown[] => {
    const [, ...params] = mockPrisma.$queryRaw.mock.calls[callIndex];
    return params;
  };

  describe('getDailyRegistrations', () => {
    it('缺省返回最近 30 个自然日（东八区切日），UTC 边界为东八区零点', async () => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2026-08-25T10:00:00Z').getTime());
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDailyRegistrations();

      // 东八区 2026-07-27 零点 = UTC 2026-07-26T16:00Z；结束上界 = UTC 2026-08-25T16:00Z
      expect(queryParams()[0]).toEqual(new Date('2026-07-26T16:00:00.000Z'));
      expect(queryParams()[1]).toEqual(new Date('2026-08-25T16:00:00.000Z'));
      expect(result.startDate).toBe('2026-07-27');
      expect(result.endDate).toBe('2026-08-25');
      expect(result.series).toHaveLength(30);
      expect(result.series[0].date).toBe('2026-07-27');
      expect(result.total).toBe(0);
    });

    it('缺失日期零填充，total 为序列求和', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: '2026-08-02', count: 3 },
      ]);

      const result = await service.getDailyRegistrations({
        startDate: '2026-08-01',
        endDate: '2026-08-03',
      });

      expect(result.series).toEqual([
        { date: '2026-08-01', count: 0 },
        { date: '2026-08-02', count: 3 },
        { date: '2026-08-03', count: 0 },
      ]);
      expect(result.total).toBe(3);
    });

    it('provider 过滤作为第三个绑定参数传入', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getDailyRegistrations({
        startDate: '2026-08-01',
        endDate: '2026-08-01',
        provider: 'WECHAT',
      });

      const params = queryParams();
      expect(params).toHaveLength(3);
      // Prisma.sql 片段以 {strings, values} 形式嵌入参数
      expect(JSON.stringify(params[2])).toContain('WECHAT');
    });

    it.each(['20260801', '2026-8-1', 'not-a-date'])(
      '非法日期格式 %s 抛出 BadRequestException',
      async (bad) => {
        await expect(
          service.getDailyRegistrations({ startDate: bad })
        ).rejects.toThrow(BadRequestException);
      }
    );

    it('溢出日期（2026-02-31）抛出 BadRequestException', async () => {
      await expect(
        service.getDailyRegistrations({ startDate: '2026-02-31' })
      ).rejects.toThrow(BadRequestException);
    });

    it('startDate 晚于 endDate 抛出 BadRequestException', async () => {
      await expect(
        service.getDailyRegistrations({
          startDate: '2026-08-10',
          endDate: '2026-08-01',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('跨度超过 365 天抛出 BadRequestException', async () => {
      await expect(
        service.getDailyRegistrations({
          startDate: '2024-01-01',
          endDate: '2026-08-25',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDailyPurchases', () => {
    it('四次查询（序列/退款/区间汇总/档位），区间用户数为整区间去重而非按日累加', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            date: '2026-08-01',
            orderCount: 2,
            userCount: 1,
            amount: BigInt(500),
          },
        ])
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([
          { orderCount: 2, userCount: 2, amount: BigInt(800) },
        ])
        .mockResolvedValueOnce([
          {
            tierId: 'tier-1',
            tierLevel: 1,
            tierName: 'VIP1',
            orderCount: 2,
            userCount: 2,
            amount: BigInt(800),
          },
          {
            tierId: null,
            tierLevel: null,
            tierName: null,
            orderCount: 1,
            userCount: 1,
            amount: BigInt(100),
          },
        ]);

      const result = await service.getDailyPurchases({
        startDate: '2026-08-01',
        endDate: '2026-08-03',
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(4);

      // 零填充序列：仅首日有数据
      expect(result.series[0]).toEqual({
        date: '2026-08-01',
        orderCount: 2,
        userCount: 1,
        amount: 500,
      });
      expect(result.series[1]).toEqual({
        date: '2026-08-02',
        orderCount: 0,
        userCount: 0,
        amount: 0,
      });

      // 区间汇总来自独立 DISTINCT 查询，非按日累加
      expect(result.totals).toEqual({
        orderCount: 2,
        userCount: 2,
        amount: 800,
        refundedCount: 1,
      });

      // 档位细分：无档位订单 level 兜底 -1
      expect(result.byTier[0]).toMatchObject({
        tierId: 'tier-1',
        tierLevel: 1,
        amount: 800,
      });
      expect(result.byTier[1]).toMatchObject({
        tierId: null,
        tierLevel: -1,
        tierName: null,
      });
    });

    it('tierId 过滤作用于序列/退款/汇总查询，但不作用于档位细分', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([
          { orderCount: 0, userCount: 0, amount: BigInt(0) },
        ])
        .mockResolvedValueOnce([]);

      await service.getDailyPurchases({
        startDate: '2026-08-01',
        endDate: '2026-08-01',
        tierId: 'tier-9',
      });

      expect(JSON.stringify(queryParams(0))).toContain('tier-9');
      expect(JSON.stringify(queryParams(1))).toContain('tier-9');
      expect(JSON.stringify(queryParams(2))).toContain('tier-9');
      expect(JSON.stringify(queryParams(3))).not.toContain('tier-9');
    });
  });
});
