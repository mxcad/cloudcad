import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserCrudService } from './user-crud.service';
import { PermissionCacheService } from '../../permission/services/permission-cache.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { DatabaseService } from '../../database/database.service';
import { MembershipService } from '../../vip/membership.service';
import { StorageInfoService } from '../../file-system/storage-quota/storage-info.service';
import { StorageUsageService } from '../../vip/storage-usage/storage-usage.service';
import { PASSWORD_HASHER } from '../interfaces/password-hasher.interface';

describe('UserCrudService.updateMembership', () => {
  let service: UserCrudService;
  let prisma: any;
  let storageInfoService: { invalidateQuotaCache: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      userMembership: {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      vipTier: {
        aggregate: jest.fn().mockResolvedValue({ _max: { level: 2 } }),
      },
    };

    storageInfoService = {
      invalidateQuotaCache: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UserCrudService,
        { provide: DatabaseService, useValue: prisma },
        { provide: PermissionCacheService, useValue: {} },
        { provide: RuntimeConfigService, useValue: {} },
        { provide: PASSWORD_HASHER, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MembershipService, useValue: {} },
        { provide: StorageInfoService, useValue: storageInfoService },
        {
          provide: StorageUsageService,
          useValue: { usageSize: jest.fn().mockResolvedValue(0) },
        },
      ],
    }).compile();

    service = module.get(UserCrudService);
  });

  it('should throw NotFoundException when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.updateMembership('user-1', 1, '2026-12-31')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should reject active membership without expiry time', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(service.updateMembership('user-1', 1, undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.userMembership.upsert).not.toHaveBeenCalled();
  });

  it('should reject tier above max configured level', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(
      service.updateMembership('user-1', 3, '2026-12-31'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should upsert membership with parsed expiry date', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.userMembership.upsert.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await service.updateMembership('user-1', 1, '2026-12-31T00:00:00.000Z');

    expect(prisma.userMembership.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        tierLevel: 1,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      },
      update: {
        tierLevel: 1,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      },
    });
    expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
      'user-1'
    );
  });

  it('should remove membership when tier is 0', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await service.updateMembership('user-1', 0, undefined);

    expect(prisma.userMembership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(storageInfoService.invalidateQuotaCache).toHaveBeenCalledWith(
      'user-1'
    );
  });
});
