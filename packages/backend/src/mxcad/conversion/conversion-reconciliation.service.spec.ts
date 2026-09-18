///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this code, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversionReconciliationService } from './conversion-reconciliation.service';
import { DatabaseService } from '../../database/database.service';
import { IFunctionExecutor } from '../../function-executor/function-executor.interface';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { NodeTrashService } from '../../file-operations/node-trash.service';
import { FileStatus } from '../../common/enums/file-status.enum';

describe('ConversionReconciliationService（S5-3 卡死 node 恢复对账）', () => {
  let service: ConversionReconciliationService;
  let prisma: { fileSystemNode: { findMany: jest.Mock } };
  let executor: { getTaskStatus: jest.Mock };
  let transitioner: { transition: jest.Mock };
  let nodeTrashService: { deleteNode: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversionReconciliationService,
        {
          provide: DatabaseService,
          useValue: { fileSystemNode: { findMany: jest.fn() } },
        },
        { provide: IFunctionExecutor, useValue: { getTaskStatus: jest.fn() } },
        { provide: NodeStatusTransitioner, useValue: { transition: jest.fn() } },
        { provide: NodeTrashService, useValue: { deleteNode: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    service = module.get(ConversionReconciliationService);
    prisma = module.get(DatabaseService);
    executor = module.get(IFunctionExecutor);
    transitioner = module.get(NodeStatusTransitioner);
    nodeTrashService = module.get(NodeTrashService);
  });

  const stuckNode = (id: string, taskId: string, path: string | null = null) => ({
    id,
    fileStatus: FileStatus.PROCESSING,
    taskId,
    path,
  });

  it('任务 COMPLETED → node 置 COMPLETED', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([stuckNode('n1', 'task-1')]);
    executor.getTaskStatus.mockResolvedValue({ taskId: 'task-1', status: 'COMPLETED' });
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 1, recovered: 1 });
    expect(transitioner.transition).toHaveBeenCalledWith('n1', FileStatus.PROCESSING, FileStatus.COMPLETED);
  });

  it('任务 FAILED + 真实文件（path!=null）→ node 置 FAILED（保留）', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([
      stuckNode('n1', 'task-1', '/files/202601/node1/a.dwg'),
    ]);
    executor.getTaskStatus.mockResolvedValue({ taskId: 'task-1', status: 'FAILED' });
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 1, recovered: 1 });
    expect(transitioner.transition).toHaveBeenCalledWith('n1', FileStatus.PROCESSING, FileStatus.FAILED);
    expect(nodeTrashService.deleteNode).not.toHaveBeenCalled();
  });

  it('任务 FAILED + 上传幽灵（path=null）→ 删除节点（不留 FAILED 记录）', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([stuckNode('n1', 'task-1')]);
    executor.getTaskStatus.mockResolvedValue({ taskId: 'task-1', status: 'FAILED' });
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 1, recovered: 1 });
    expect(transitioner.transition).not.toHaveBeenCalled();
    expect(nodeTrashService.deleteNode).toHaveBeenCalledWith('n1', true);
  });

  it('任务 PENDING（仍在跑）→ 跳过不转换', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([stuckNode('n1', 'task-1')]);
    executor.getTaskStatus.mockResolvedValue({ taskId: 'task-1', status: 'PENDING' });
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 1, recovered: 0 });
    expect(transitioner.transition).not.toHaveBeenCalled();
  });

  it('任务 PROCESSING（仍在跑）→ 跳过不转换', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([stuckNode('n1', 'task-1')]);
    executor.getTaskStatus.mockResolvedValue({ taskId: 'task-1', status: 'PROCESSING' });
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 1, recovered: 0 });
    expect(transitioner.transition).not.toHaveBeenCalled();
  });

  it('任务丢失（getTaskStatus 抛错）+ 真实文件（path!=null）→ node 置 FAILED', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([
      stuckNode('n1', 'task-1', '/files/202601/node1/a.dwg'),
    ]);
    executor.getTaskStatus.mockRejectedValue(new Error('HTTP 404 for GET /v1/conversions/tasks/task-1'));
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 1, recovered: 1 });
    expect(transitioner.transition).toHaveBeenCalledWith('n1', FileStatus.PROCESSING, FileStatus.FAILED);
    expect(nodeTrashService.deleteNode).not.toHaveBeenCalled();
  });

  it('任务丢失（getTaskStatus 抛错）+ 上传幽灵（path=null）→ 删除节点', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([stuckNode('n1', 'task-1')]);
    executor.getTaskStatus.mockRejectedValue(new Error('HTTP 404 for GET /v1/conversions/tasks/task-1'));
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 1, recovered: 1 });
    expect(transitioner.transition).not.toHaveBeenCalled();
    expect(nodeTrashService.deleteNode).toHaveBeenCalledWith('n1', true);
  });

  it('无卡死 node → checked=0 recovered=0，不查任务状态', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([]);
    const result = await service.reconcile();
    expect(result).toEqual({ checked: 0, recovered: 0 });
    expect(executor.getTaskStatus).not.toHaveBeenCalled();
  });

  it('扫描条件：PROCESSING + taskId 非空 + updatedAt < now-宽限期（默认 30min）', async () => {
    prisma.fileSystemNode.findMany.mockResolvedValue([]);
    await service.reconcile();
    const where = prisma.fileSystemNode.findMany.mock.calls[0][0].where;
    expect(where.fileStatus).toEqual({ in: [FileStatus.PROCESSING] });
    expect(where.taskId).toEqual({ not: null });
    const cutoff = where.updatedAt.lt;
    const diffMs = Date.now() - cutoff.getTime();
    expect(diffMs).toBeGreaterThan(29 * 60 * 1000);
    expect(diffMs).toBeLessThan(31 * 60 * 1000);
  });
});
