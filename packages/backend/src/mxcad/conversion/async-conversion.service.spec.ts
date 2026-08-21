///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AsyncConversionService } from './async-conversion.service';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';

describe('AsyncConversionService', () => {
  let service: AsyncConversionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsyncConversionService,
        {
          provide: IFunctionExecutor,
          useValue: { invoke: jest.fn(), getTaskStatus: jest.fn() },
        },
        {
          provide: DatabaseService,
          useValue: {
            fileSystemNode: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: NodeStatusTransitioner,
          useValue: { transition: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AsyncConversionService>(AsyncConversionService);
  });

  describe('getNodeConversionStatus', () => {
    it('节点不存在时抛出 NotFoundException（404）而非裸 Error', async () => {
      const prisma = (
        service as unknown as {
          prisma: { fileSystemNode: { findUnique: jest.Mock } };
        }
      ).prisma;
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(
        service.getNodeConversionStatus('missing-node')
      ).rejects.toThrow(NotFoundException);
    });

    it('节点存在时返回 fileStatus', async () => {
      const prisma = (
        service as unknown as {
          prisma: { fileSystemNode: { findUnique: jest.Mock } };
        }
      ).prisma;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'COMPLETED',
        taskId: null,
      });

      const result = await service.getNodeConversionStatus('node-1');
      expect(result.fileStatus).toBe('COMPLETED');
      expect(result.taskId).toBeUndefined();
    });
  });
});
