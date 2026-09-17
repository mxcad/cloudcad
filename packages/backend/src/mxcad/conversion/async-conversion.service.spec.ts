///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AsyncConversionService } from './async-conversion.service';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { FileStatus } from '../../common/enums/file-status.enum';

describe('AsyncConversionService', () => {
  let service: AsyncConversionService;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };
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
        // S4-3：EventEmitter2 全局可用（EventEmitterModule.forRoot），此处以 mock 提供
        { provide: EventEmitter2, useValue: eventEmitter },
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

  describe('registerTask（S5-2 上传链路统一：写 node.taskId + 确保 PROCESSING，不触发 executor.invoke）', () => {
    it('节点不存在时抛出 NotFoundException（404）', async () => {
      const prisma = (
        service as unknown as {
          prisma: { fileSystemNode: { findUnique: jest.Mock } };
        }
      ).prisma;
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(service.registerTask('missing-node')).rejects.toThrow(
        NotFoundException
      );
    });

    it('写 node.taskId + 节点已 PROCESSING 时不重复 transition（幂等）', async () => {
      const prisma = (
        service as unknown as {
          prisma: {
            fileSystemNode: { findUnique: jest.Mock; update: jest.Mock };
          };
        }
      ).prisma;
      const transitioner = (
        service as unknown as {
          nodeStatusTransitioner: { transition: jest.Mock };
        }
      ).nodeStatusTransitioner;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'PROCESSING',
        taskId: null,
      });
      prisma.fileSystemNode.update.mockResolvedValue({});

      const taskId = await service.registerTask('node-1');

      // 写 node.taskId（async_{nodeId}_{ts} 格式）
      expect(taskId).toMatch(/^async_node-1_\d+$/);
      expect(prisma.fileSystemNode.update).toHaveBeenCalledWith({
        where: { id: 'node-1' },
        data: { taskId },
      });
      // 节点已 PROCESSING → 幂等，不重复 transition
      expect(transitioner.transition).not.toHaveBeenCalled();
      // 不触发 executor.invoke（转换由调用方自行执行）
      const executor = (
        service as unknown as { executor: { invoke: jest.Mock } }
      ).executor;
      expect(executor.invoke).not.toHaveBeenCalled();
    });

    it('节点非 PROCESSING 时 transition 到 PROCESSING', async () => {
      const prisma = (
        service as unknown as {
          prisma: {
            fileSystemNode: { findUnique: jest.Mock; update: jest.Mock };
          };
        }
      ).prisma;
      const transitioner = (
        service as unknown as {
          nodeStatusTransitioner: { transition: jest.Mock };
        }
      ).nodeStatusTransitioner;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'UPLOADING',
        taskId: null,
      });
      prisma.fileSystemNode.update.mockResolvedValue({});
      transitioner.transition.mockResolvedValue(undefined);

      const taskId = await service.registerTask('node-1');

      expect(taskId).toMatch(/^async_node-1_\d+$/);
      expect(transitioner.transition).toHaveBeenCalledWith(
        'node-1',
        'UPLOADING',
        'PROCESSING'
      );
    });
  });

  describe('S4-3 终态变更后 emit conversion-task.changed.{ownerId}（SSE 实时推送）', () => {
    function callUpdateNodeStatus(
      nodeId: string,
      status: FileStatus
    ): Promise<void> {
      return (
        service as unknown as {
          updateNodeStatus: (nodeId: string, status: FileStatus) => Promise<void>;
        }
      ).updateNodeStatus(nodeId, status);
    }

    it('updateNodeStatus 终态变更后向 per-user 通道 emit { nodeId, status }', async () => {
      const prisma = (
        service as unknown as {
          prisma: { fileSystemNode: { findUnique: jest.Mock } };
        }
      ).prisma;
      const transitioner = (
        service as unknown as {
          nodeStatusTransitioner: { transition: jest.Mock };
        }
      ).nodeStatusTransitioner;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'PROCESSING',
        ownerId: 'user-1',
      });
      transitioner.transition.mockResolvedValue(undefined);

      await callUpdateNodeStatus('node-1', FileStatus.COMPLETED);

      expect(transitioner.transition).toHaveBeenCalledWith(
        'node-1',
        'PROCESSING',
        FileStatus.COMPLETED
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'conversion-task.changed.user-1',
        { nodeId: 'node-1', status: FileStatus.COMPLETED }
      );
    });

    it('节点无 ownerId 时不 emit（best-effort 降级，不影响状态迁移）', async () => {
      const prisma = (
        service as unknown as {
          prisma: { fileSystemNode: { findUnique: jest.Mock } };
        }
      ).prisma;
      const transitioner = (
        service as unknown as {
          nodeStatusTransitioner: { transition: jest.Mock };
        }
      ).nodeStatusTransitioner;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: 'PROCESSING',
        ownerId: null,
      });
      transitioner.transition.mockResolvedValue(undefined);

      await callUpdateNodeStatus('node-1', FileStatus.FAILED);

      // 状态迁移仍执行
      expect(transitioner.transition).toHaveBeenCalledWith(
        'node-1',
        'PROCESSING',
        FileStatus.FAILED
      );
      // 无 ownerId → 不 emit
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
