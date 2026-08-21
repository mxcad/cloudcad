///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditLogService } from '../audit/audit-log.service';
import { IpBlacklistService } from './ip-blacklist.service';

describe('IpBlacklistService', () => {
  let service: IpBlacklistService;

  const mockPrisma = {
    ipBlacklistEntry: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockRedis = {
    exists: jest.fn(),
    hget: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    multi: jest.fn(),
  };

  const mockMulti = {
    del: jest.fn(),
    hset: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const mockAuditLogService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.multi.mockReturnValue(mockMulti);
    mockMulti.exec.mockResolvedValue([]);
    mockRedis.hdel.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpBlacklistService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<IpBlacklistService>(IpBlacklistService);
  });

  describe('isBlocked', () => {
    it('returns true when exact IP is in Redis cache (permanent)', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hget.mockResolvedValue('0');
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(true);
      expect(mockRedis.hget).toHaveBeenCalledWith(
        'ip-blacklist:exact',
        '203.0.113.7'
      );
      expect(mockPrisma.ipBlacklistEntry.findMany).not.toHaveBeenCalled();
    });

    it('returns true when exact IP entry has future expiresAt', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const future = String(Date.now() + 60_000);
      mockRedis.hget.mockResolvedValue(future);
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(true);
    });

    it('returns true when IP matches a CIDR in cache', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hget.mockResolvedValue(null);
      mockRedis.hgetall.mockResolvedValue({ '203.0.113.0/24': '0' });
      await expect(service.isBlocked('203.0.113.9')).resolves.toBe(true);
    });

    it('returns false when cache exists and nothing matches', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hget.mockResolvedValue(null);
      mockRedis.hgetall.mockResolvedValue({ '203.0.113.0/24': '0' });
      await expect(service.isBlocked('8.8.8.8')).resolves.toBe(false);
    });

    it('does not block when cached exact entry is expired, and lazily deletes it', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hget.mockResolvedValue(String(Date.now() - 1000));
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(false);
      expect(mockRedis.hdel).toHaveBeenCalledWith(
        'ip-blacklist:exact',
        '203.0.113.7'
      );
    });

    it('skips expired CIDR entries in cache', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hget.mockResolvedValue(null);
      mockRedis.hgetall.mockResolvedValue({
        '203.0.113.0/24': String(Date.now() - 1000),
      });
      await expect(service.isBlocked('203.0.113.9')).resolves.toBe(false);
    });

    it('rebuilds cache from DB when cache key missing, then checks', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([
        { ip: '203.0.113.7', expiresAt: null },
        { ip: '198.51.100.0/24', expiresAt: null },
      ]);
      mockRedis.hget.mockResolvedValue(null);
      mockRedis.hgetall.mockResolvedValue({ '198.51.100.0/24': '0' });
      await expect(service.isBlocked('198.51.100.5')).resolves.toBe(true);
      expect(mockPrisma.ipBlacklistEntry.findMany).toHaveBeenCalled();
      expect(mockMulti.hset).toHaveBeenCalledWith('ip-blacklist:exact', [
        '203.0.113.7',
        '0',
      ]);
      expect(mockMulti.hset).toHaveBeenCalledWith('ip-blacklist:cidr', [
        '198.51.100.0/24',
        '0',
      ]);
    });

    it('stores expiresAt timestamp in cache during rebuild', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const expiresAt = new Date(Date.now() + 3600_000);
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([
        { ip: '203.0.113.7', expiresAt },
      ]);
      mockRedis.hget.mockResolvedValue(String(expiresAt.getTime()));
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(true);
      expect(mockMulti.hset).toHaveBeenCalledWith('ip-blacklist:exact', [
        '203.0.113.7',
        String(expiresAt.getTime()),
      ]);
    });

    it('falls back to DB when Redis cache check throws', async () => {
      mockRedis.exists.mockRejectedValue(new Error('redis down'));
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([
        { ip: '203.0.113.7' },
      ]);
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(true);
    });

    it('falls back to DB when cache rebuild fails', async () => {
      mockRedis.exists.mockResolvedValue(0);
      mockPrisma.ipBlacklistEntry.findMany
        .mockRejectedValueOnce(new Error('db timeout'))
        .mockResolvedValueOnce([{ ip: '203.0.113.7' }]);
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(true);
    });

    it('fails open (false) when DB check throws', async () => {
      mockRedis.exists.mockRejectedValue(new Error('redis down'));
      mockPrisma.ipBlacklistEntry.findMany.mockRejectedValue(
        new Error('db down')
      );
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(false);
    });

    it('filters expired entries in DB fallback query', async () => {
      mockRedis.exists.mockRejectedValue(new Error('redis down'));
      // Prisma where 已过滤过期条目，DB 不会返回它们
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([]);
      await expect(service.isBlocked('203.0.113.7')).resolves.toBe(false);
      expect(mockPrisma.ipBlacklistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        })
      );
    });

    it('normalizes IPv4-mapped client IP', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hget.mockResolvedValue('0');
      await expect(service.isBlocked('::ffff:203.0.113.7')).resolves.toBe(true);
      expect(mockRedis.hget).toHaveBeenCalledWith(
        'ip-blacklist:exact',
        '203.0.113.7'
      );
    });

    it('matches IPv6 case-insensitively', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.hget.mockResolvedValue('0');
      await expect(service.isBlocked('2001:DB8::1')).resolves.toBe(true);
      expect(mockRedis.hget).toHaveBeenCalledWith(
        'ip-blacklist:exact',
        '2001:db8::1'
      );
    });
  });

  describe('listEntries', () => {
    it('returns paginated non-expired entries', async () => {
      const now = new Date();
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([
        {
          id: 'e1',
          ip: '203.0.113.7',
          source: 'MANUAL',
          reason: '撞库',
          createdBy: 'u1',
          createdAt: now,
          expiresAt: null,
        },
      ]);
      mockPrisma.ipBlacklistEntry.count.mockResolvedValue(1);
      const result = await service.listEntries(1, 20);
      expect(result.total).toBe(1);
      expect(result.items[0].source).toBe('manual');
      expect(result.items[0].expiresAt).toBeNull();
      expect(mockPrisma.ipBlacklistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 })
      );
    });

    it('filters by keyword across ip/reason/createdBy with case-insensitive contains', async () => {
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([]);
      mockPrisma.ipBlacklistEntry.count.mockResolvedValue(0);
      await service.listEntries(1, 20, '203.0.113');
      expect(mockPrisma.ipBlacklistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
            AND: [
              {
                OR: [
                  { ip: { contains: '203.0.113', mode: 'insensitive' } },
                  { reason: { contains: '203.0.113', mode: 'insensitive' } },
                  { createdBy: { contains: '203.0.113', mode: 'insensitive' } },
                ],
              },
            ],
          },
        })
      );
      expect(mockPrisma.ipBlacklistEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ AND: expect.any(Array) }),
        })
      );
    });

    it('trims keyword and skips filter when blank', async () => {
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([]);
      mockPrisma.ipBlacklistEntry.count.mockResolvedValue(0);
      await service.listEntries(1, 20, '   ');
      expect(mockPrisma.ipBlacklistEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        })
      );
      const call =
        mockPrisma.ipBlacklistEntry.findMany.mock.calls[0][0].where as Record<
          string,
          unknown
        >;
      expect(call.AND).toBeUndefined();
    });
  });

  describe('addEntry', () => {
    const baseDto = { ip: '203.0.113.0/24', reason: '扫描' };

    it('creates entry and rebuilds cache', async () => {
      mockPrisma.ipBlacklistEntry.findFirst.mockResolvedValue(null);
      mockPrisma.ipBlacklistEntry.create.mockResolvedValue({
        id: 'e1',
        ip: '203.0.113.0/24',
        source: 'MANUAL',
        reason: '扫描',
        createdBy: 'u1',
        createdAt: new Date(),
        expiresAt: null,
      });
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([]);
      const entry = await service.addEntry(baseDto, 'u1');
      expect(entry.ip).toBe('203.0.113.0/24');
      expect(entry.source).toBe('manual');
      expect(mockPrisma.ipBlacklistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ip: '203.0.113.0/24',
          source: 'MANUAL',
          createdBy: 'u1',
          expiresAt: null,
        }),
      });
      expect(mockMulti.exec).toHaveBeenCalled();
      // 安全审计：加入 IP 黑名单（名称快照=IP）
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        'IP_BLACKLIST_ADD',
        'IpBlacklistEntry',
        'e1',
        'u1',
        true,
        undefined,
        undefined,
        undefined,
        '203.0.113.0/24',
        expect.objectContaining({ ip: '203.0.113.0/24', reason: '扫描' })
      );
    });

    it('rejects invalid IP/CIDR', async () => {
      await expect(
        service.addEntry({ ...baseDto, ip: '999.0.0.0' }, 'u1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.ipBlacklistEntry.create).not.toHaveBeenCalled();
    });

    it('rejects non-aligned CIDR', async () => {
      await expect(
        service.addEntry({ ...baseDto, ip: '203.0.113.1/24' }, 'u1')
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate active entry', async () => {
      mockPrisma.ipBlacklistEntry.findFirst.mockResolvedValue({ id: 'e1' });
      await expect(service.addEntry(baseDto, 'u1')).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it('allows duplicate when existing entry is expired', async () => {
      mockPrisma.ipBlacklistEntry.findFirst.mockResolvedValue(null);
      mockPrisma.ipBlacklistEntry.create.mockResolvedValue({
        id: 'e1',
        ip: '203.0.113.0/24',
        source: 'MANUAL',
        reason: '扫描',
        createdBy: 'u1',
        createdAt: new Date(),
        expiresAt: null,
      });
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([]);
      await expect(service.addEntry(baseDto, 'u1')).resolves.toBeDefined();
    });

    it('normalizes IPv4-mapped IP on create', async () => {
      mockPrisma.ipBlacklistEntry.findFirst.mockResolvedValue(null);
      mockPrisma.ipBlacklistEntry.create.mockResolvedValue({
        id: 'e1',
        ip: '192.168.0.1',
        source: 'MANUAL',
        reason: 'x',
        createdBy: 'u1',
        createdAt: new Date(),
        expiresAt: null,
      });
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([]);
      await service.addEntry({ ip: '::ffff:192.168.0.1', reason: 'x' }, 'u1');
      expect(mockPrisma.ipBlacklistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ip: '192.168.0.1' }),
      });
    });

    it('cache rebuild failure does not block create', async () => {
      mockPrisma.ipBlacklistEntry.findFirst.mockResolvedValue(null);
      mockPrisma.ipBlacklistEntry.create.mockResolvedValue({
        id: 'e1',
        ip: '203.0.113.7',
        source: 'MANUAL',
        reason: 'x',
        createdBy: 'u1',
        createdAt: new Date(),
        expiresAt: null,
      });
      mockPrisma.ipBlacklistEntry.findMany.mockRejectedValue(
        new Error('db down')
      );
      await expect(
        service.addEntry({ ip: '203.0.113.7', reason: 'x' }, 'u1')
      ).resolves.toBeDefined();
    });
  });

  describe('removeEntry', () => {
    it('removes entry and rebuilds cache', async () => {
      mockPrisma.ipBlacklistEntry.findUnique.mockResolvedValue({
        id: 'e1',
        ip: '203.0.113.7',
      });
      mockPrisma.ipBlacklistEntry.delete.mockResolvedValue({ id: 'e1' });
      mockPrisma.ipBlacklistEntry.findMany.mockResolvedValue([]);
      await expect(service.removeEntry('e1', 'u1')).resolves.toEqual({
        id: 'e1',
      });
      expect(mockPrisma.ipBlacklistEntry.delete).toHaveBeenCalledWith({
        where: { id: 'e1' },
      });
    });

    it('throws NotFound when entry missing', async () => {
      mockPrisma.ipBlacklistEntry.findUnique.mockResolvedValue(null);
      await expect(service.removeEntry('missing', 'u1')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });
});
