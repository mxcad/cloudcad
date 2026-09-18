///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
        // convertNodeForExport 经 ModuleRef 惰性解析 FileDownloadExportService，
        // 以 mock 提供避免测试容器解析真实服务
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn().mockReturnValue({
              // 须返回 Promise：convertNodeForExport 对返回值直接 .then()
              precomputeExport: jest.fn().mockResolvedValue(undefined),
            }),
          },
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

  describe('convertNode 去重守卫（重复提交覆盖 taskId 修复）', () => {
    it('在途任务（PROCESSING + taskId）：返回已有 taskId，不覆盖、不 transition、不 invoke', async () => {
      const prisma = (
        service as unknown as {
          prisma: {
            fileSystemNode: { findUnique: jest.Mock; update: jest.Mock };
          };
        }
      ).prisma;
      const executor = (
        service as unknown as { executor: { invoke: jest.Mock } }
      ).executor;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: FileStatus.PROCESSING,
        taskId: 'async_node-1_111',
        path: null,
      });

      const result = await service.convertNode('node-1');

      expect(result).toBe('async_node-1_111');
      expect(prisma.fileSystemNode.update).not.toHaveBeenCalled();
      expect(executor.invoke).not.toHaveBeenCalled();
    });

    it('在途任务（UPLOADING + taskId，上传链路 registerTask 写入）：同样返回已有 taskId', async () => {
      const prisma = (
        service as unknown as {
          prisma: {
            fileSystemNode: { findUnique: jest.Mock; update: jest.Mock };
          };
        }
      ).prisma;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: FileStatus.UPLOADING,
        taskId: 'async_node-1_222',
        path: null,
      });

      const result = await service.convertNode('node-1');

      expect(result).toBe('async_node-1_222');
      expect(prisma.fileSystemNode.update).not.toHaveBeenCalled();
    });

    it('终态残留 taskId（FAILED）：不阻塞重新提交，生成新 taskId 并 invoke', async () => {
      const prisma = (
        service as unknown as {
          prisma: {
            fileSystemNode: { findUnique: jest.Mock; update: jest.Mock };
          };
        }
      ).prisma;
      const executor = (
        service as unknown as { executor: { invoke: jest.Mock } }
      ).executor;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: FileStatus.FAILED,
        taskId: 'async_node-1_old',
        path: null,
      });
      prisma.fileSystemNode.update.mockResolvedValue({});
      executor.invoke.mockResolvedValue({ status: 'COMPLETED' });

      const result = await service.convertNode('node-1');

      expect(result).toMatch(/^async_node-1_\d+$/);
      expect(result).not.toBe('async_node-1_old');
      expect(prisma.fileSystemNode.update).toHaveBeenCalledWith({
        where: { id: 'node-1' },
        data: { taskId: result },
      });
      expect(executor.invoke).toHaveBeenCalledTimes(1);
    });

    it('convertNodeForExport 同守卫：在途任务返回已有 taskId，不覆盖、不预转换', async () => {
      const prisma = (
        service as unknown as {
          prisma: {
            fileSystemNode: { findUnique: jest.Mock; update: jest.Mock };
          };
        }
      ).prisma;
      const moduleRef = (
        service as unknown as { moduleRef: { get: jest.Mock } }
      ).moduleRef;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: FileStatus.PROCESSING,
        taskId: 'async_node-1_333',
        path: null,
      });

      const result = await service.convertNodeForExport(
        'node-1',
        'pdf',
        'user-1'
      );

      expect(result).toBe('async_node-1_333');
      expect(prisma.fileSystemNode.update).not.toHaveBeenCalled();
      expect(moduleRef.get).not.toHaveBeenCalled();
    });

    it('convertNodeForExport 终态残留 taskId（COMPLETED）：生成新 taskId 并预转换', async () => {
      const prisma = (
        service as unknown as {
          prisma: {
            fileSystemNode: { findUnique: jest.Mock; update: jest.Mock };
          };
        }
      ).prisma;
      const moduleRef = (
        service as unknown as { moduleRef: { get: jest.Mock } }
      ).moduleRef;
      prisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        fileStatus: FileStatus.COMPLETED,
        taskId: 'async_export_node-1_old',
        path: null,
      });
      prisma.fileSystemNode.update.mockResolvedValue({});

      const result = await service.convertNodeForExport(
        'node-1',
        'pdf',
        'user-1'
      );

      expect(result).toMatch(/^async_export_node-1_\d+$/);
      expect(result).not.toBe('async_export_node-1_old');
      expect(moduleRef.get).toHaveBeenCalledWith(
        expect.anything(),
        { strict: false }
      );
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

  describe('转换在途时节点被删除：不回写终态、清 taskId', () => {
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

    it('已软删节点：跳过状态迁移与 SSE，清 taskId，select 含 deletedAt', async () => {
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
        fileStatus: 'DELETED',
        ownerId: 'user-1',
        deletedAt: new Date('2026-09-17T03:55:29Z'),
      });
      prisma.fileSystemNode.update.mockResolvedValue({});

      await callUpdateNodeStatus('node-1', FileStatus.COMPLETED);

      // DELETED→COMPLETED 是状态机合法边（恢复用），照写会让已删文件静默复活
      expect(transitioner.transition).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(prisma.fileSystemNode.update).toHaveBeenCalledWith({
        where: { id: 'node-1' },
        data: { taskId: null },
      });
      expect(prisma.fileSystemNode.findUnique.mock.calls[0][0].select).toEqual(
        expect.objectContaining({ deletedAt: true })
      );
    });

    it('节点已物理删除：静默返回，不迁移不 emit 不写库', async () => {
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
      prisma.fileSystemNode.findUnique.mockResolvedValue(null);

      await expect(callUpdateNodeStatus('node-1', FileStatus.FAILED)).resolves.toBe(
        undefined
      );

      expect(transitioner.transition).not.toHaveBeenCalled();
      expect(prisma.fileSystemNode.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('清 taskId 失败：best-effort 降级，整体仍正常返回', async () => {
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
        fileStatus: 'DELETED',
        ownerId: 'user-1',
        deletedAt: new Date('2026-09-17T03:55:29Z'),
      });
      prisma.fileSystemNode.update.mockRejectedValue(new Error('db down'));

      await expect(callUpdateNodeStatus('node-1', FileStatus.FAILED)).resolves.toBe(
        undefined
      );

      expect(transitioner.transition).not.toHaveBeenCalled();
    });
  });
});
