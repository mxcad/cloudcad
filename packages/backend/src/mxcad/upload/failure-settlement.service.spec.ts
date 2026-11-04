///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { FileStatus } from '@cloudcad/db';
import { AuditLogService } from '../../audit/audit-log.service';
import { DatabaseService } from '../../database/database.service';
import { UploadGhostService } from '../conversion/upload-ghost.service';
import { FailureSettlementService } from './failure-settlement.service';
import type { IngestSource } from './drawing-ingest.service';

/**
 * FailureSettlementService（评审候选 6：从 DrawingIngestService 巨缝抽出的失败清算 stage）。
 *
 * 回归点：
 * - 每步独立容错：任一步抛错不阻断后续（额度释放抛错仍写审计、仍删节点）；
 * - 转换失败 → 释放占位（reservation.release 调用）+ 审计 failureStage=conversion；
 * - 落盘失败（已成功转换）→ NO_OP 句柄不 release + 审计 failureStage=materialize；
 * - 失败节点清理：幽灵节点（path=null、非 COMPLETED）硬删，真实文件 / COMPLETED no-op。
 */
describe('FailureSettlementService', () => {
  let service: FailureSettlementService;

  const mockAuditLogService = { log: jest.fn().mockResolvedValue(undefined) };
  const mockPrisma = {
    fileSystemNode: { findUnique: jest.fn() },
  };
  const mockUploadGhostService = {
    isGhost: jest.fn(),
    purgeGhostNode: jest.fn(),
  };

  const release = jest.fn().mockResolvedValue(undefined);
  const reservation = { release, reserved: true };
  const source: IngestSource = {
    kind: 'file',
    filePath: '/tmp/upload.dwg',
    fileHash: 'hash1',
    name: 'upload.dwg',
    size: 1024,
  };

  const baseOpts = () => ({
    context: { userId: 'user1', nodeId: 'parent1' } as never,
    source,
    reservation,
    nodeId: 'node1',
    audit: {
      name: 'upload.dwg',
      fileHash: 'hash1',
      size: 1024,
      error: 'boom',
      stage: 'conversion' as const,
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FailureSettlementService,
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: UploadGhostService, useValue: mockUploadGhostService },
      ],
    }).compile();
    service = module.get<FailureSettlementService>(FailureSettlementService);
    jest.clearAllMocks();
    release.mockResolvedValue(undefined);
  });

  it('转换失败：释放占位 + 写失败审计（failureStage=conversion）+ 删幽灵节点', async () => {
    mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
      fileStatus: FileStatus.PROCESSING,
      deletedAt: null,
      path: null,
    });
    mockUploadGhostService.isGhost.mockReturnValue(true);
    mockUploadGhostService.purgeGhostNode.mockResolvedValue(true);

    await service.settleNodeFailure(baseOpts());

    expect(release).toHaveBeenCalled();
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FILE_UPLOAD',
        success: false,
        errorMessage: 'boom',
        params: expect.objectContaining({ failureStage: 'conversion' }),
      })
    );
    expect(mockUploadGhostService.purgeGhostNode).toHaveBeenCalledWith('node1');
  });

  it('单步抛错不阻断后续：额度释放失败仍写审计 + 删节点', async () => {
    release.mockRejectedValue(new Error('release boom'));
    mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
      fileStatus: FileStatus.PROCESSING,
      deletedAt: null,
      path: null,
    });
    mockUploadGhostService.isGhost.mockReturnValue(true);
    mockUploadGhostService.purgeGhostNode.mockResolvedValue(true);

    await service.settleNodeFailure(baseOpts());

    expect(mockAuditLogService.log).toHaveBeenCalled();
    expect(mockUploadGhostService.purgeGhostNode).toHaveBeenCalledWith('node1');
  });

  it('COMPLETED 节点不删（已真实落盘，异常发生在落盘成功之后）', async () => {
    mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
      fileStatus: FileStatus.COMPLETED,
      deletedAt: null,
      path: '/data/x.mxweb',
    });
    await service.settleNodeFailure(baseOpts());
    expect(mockUploadGhostService.purgeGhostNode).not.toHaveBeenCalled();
  });

  it('非幽灵（真实文件 path 非空）不删', async () => {
    mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
      fileStatus: FileStatus.PROCESSING,
      deletedAt: null,
      path: '/data/real.dwg',
    });
    mockUploadGhostService.isGhost.mockReturnValue(false);
    await service.settleNodeFailure(baseOpts());
    expect(mockUploadGhostService.purgeGhostNode).not.toHaveBeenCalled();
  });

  it('落盘失败（转换已成功）：审计 failureStage=materialize', async () => {
    mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
    await service.settleNodeFailure({
      ...baseOpts(),
      audit: { ...baseOpts().audit, stage: 'materialize' as const },
    });
    expect(mockAuditLogService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ failureStage: 'materialize' }),
      })
    );
  });
});
