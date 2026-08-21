/////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
/////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditLogService } from '../audit/audit-log.service';
import { BlacklistSource } from '@cloudcad/db';
import { IpWhitelistService, FILE_ENTRY_ID_PREFIX } from './ip-whitelist.service';
import { IpWhitelistFileService } from './ip-whitelist-file.service';

describe('IpWhitelistService', () => {
  let service: IpWhitelistService;
  let mockPrisma: { ipWhitelistEntry: Record<string, jest.Mock> };
  let mockFileService: { getEntries: jest.Mock };
  let mockAuditLogService: { log: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      ipWhitelistEntry: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };
    mockFileService = { getEntries: jest.fn().mockReturnValue([]) };
    mockAuditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpWhitelistService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: IpWhitelistFileService, useValue: mockFileService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<IpWhitelistService>(IpWhitelistService);
  });

  describe('isAllowed (fail-close 判定)', () => {
    it('环回地址恒放行（服务器本机自救通道）', async () => {
      mockFileService.getEntries.mockReturnValue([]);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([]);
      await expect(service.isAllowed('127.0.0.1')).resolves.toBe(true);
      await expect(service.isAllowed('::1')).resolves.toBe(true);
    });

    it('DB 白名单精确命中则放行', async () => {
      mockFileService.getEntries.mockReturnValue([]);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([
        { ip: '203.0.113.7' },
      ]);
      await expect(service.isAllowed('203.0.113.7')).resolves.toBe(true);
    });

    it('DB 白名单 CIDR 命中则放行', async () => {
      mockFileService.getEntries.mockReturnValue([]);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([
        { ip: '203.0.113.0/24' },
      ]);
      await expect(service.isAllowed('203.0.113.99')).resolves.toBe(true);
      await expect(service.isAllowed('203.0.114.1')).resolves.toBe(false);
    });

    it('本地文件白名单条目同样生效（DB 为空时兜底放行）', async () => {
      mockFileService.getEntries.mockReturnValue(['198.51.100.0/24']);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([]);
      await expect(service.isAllowed('198.51.100.5')).resolves.toBe(true);
    });

    it('两通道皆空时非环回一律拒绝（fail-close）', async () => {
      mockFileService.getEntries.mockReturnValue([]);
      mockPrisma.ipWhitelistEntry.findMany.mockResolvedValue([]);
      await expect(service.isAllowed('203.0.113.7')).resolves.toBe(false);
    });

    it('DB 异常时 fail-close（仅文件 + 环回通道），不误放行', async () => {
      mockFileService.getEntries.mockReturnValue([]);
      mockPrisma.ipWhitelistEntry.findMany.mockRejectedValue(
        new Error('db down')
      );
      await expect(service.isAllowed('203.0.113.7')).resolves.toBe(false);
    });
  });

  describe('addEntry', () => {
    const dto = { ip: ' 203.0.113.7 ', reason: '办公 IP', expiresAt: undefined };

    it('正常添加（来源 MANUAL）', async () => {
      mockPrisma.ipWhitelistEntry.findFirst.mockResolvedValue(null);
      mockPrisma.ipWhitelistEntry.create.mockResolvedValue({
        id: 'w1',
        ip: '203.0.113.7',
        source: BlacklistSource.MANUAL,
        reason: '办公 IP',
        createdBy: 'u1',
        createdAt: new Date(),
        expiresAt: null,
      });

      const res = await service.addEntry(dto, 'u1');
      expect(res.ip).toBe('203.0.113.7');
      expect(mockPrisma.ipWhitelistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ip: '203.0.113.7',
          source: BlacklistSource.MANUAL,
          createdBy: 'u1',
        }),
      });
      // 安全审计留痕
      expect(mockAuditLogService.log).toHaveBeenCalled();
    });

    it('非法 IP/CIDR 抛 BadRequest', async () => {
      await expect(
        service.addEntry({ ...dto, ip: 'not-an-ip' }, 'u1')
      ).rejects.toThrow(BadRequestException);
    });

    it('重复条目抛 Conflict', async () => {
      mockPrisma.ipWhitelistEntry.findFirst.mockResolvedValue({
        id: 'existing',
      });
      await expect(service.addEntry(dto, 'u1')).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('removeEntry', () => {
    it('本地文件条目（file: 前缀）不可经接口移除', async () => {
      await expect(
        service.removeEntry(`${FILE_ENTRY_ID_PREFIX}203.0.113.7`, 'u1')
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.ipWhitelistEntry.delete).not.toHaveBeenCalled();
    });

    it('条目不存在抛 NotFound', async () => {
      mockPrisma.ipWhitelistEntry.findUnique.mockResolvedValue(null);
      await expect(service.removeEntry('w1', 'u1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('正常移除（物理删除 + 审计留痕）', async () => {
      mockPrisma.ipWhitelistEntry.findUnique.mockResolvedValue({
        id: 'w1',
        ip: '203.0.113.7',
      });
      mockPrisma.ipWhitelistEntry.delete.mockResolvedValue({ id: 'w1' });

      await expect(service.removeEntry('w1', 'u1')).resolves.toEqual({
        id: 'w1',
      });
      expect(mockAuditLogService.log).toHaveBeenCalled();
    });
  });
});
