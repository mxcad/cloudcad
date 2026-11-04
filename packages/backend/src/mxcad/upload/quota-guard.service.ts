///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable } from '@nestjs/common';
import { NodeMutationGuard } from '../../file-operations/node-mutation.guard';
import { FileSystemNodeContext } from '../node/filesystem-node.service';
import type { IngestTarget } from './drawing-ingest.service';

/**
 * 上传前字节配额门控（评审候选 6：从 DrawingIngestService 巨缝抽出的单一 stage）。
 *
 * 职责：按客户端上报文件大小断言配额（ADR-0037 时机前移），空间不足立即抛
 * QuotaExceededException（403）。权威断言（摄入时按服务器真实文件大小复核）仍在
 * 摄入路径保留，本门控只是提前拦截，不替代权威检查。
 *
 * 依赖单一（nodeMutationGuard.assertByteQuota），供两处共用：
 * - 秒传预检 checkExist（前端所有正常上传路径的第一步，尚未传输任何字节）
 * - 分片上传入口（controller 每个分片请求，绕过秒传预检/直连 API 时尽早失败）
 */
@Injectable()
export class QuotaGuardService {
  constructor(private readonly nodeMutationGuard: NodeMutationGuard) {}

  async assertQuotaBeforeUpload(target: IngestTarget): Promise<void> {
    await this.checkQuota(this.targetToContext(target), target.fileSize);
  }

  async checkQuota(
    context: FileSystemNodeContext,
    fileSize?: number
  ): Promise<void> {
    if (!context?.userId || !context?.nodeId) return;
    if (!fileSize || fileSize <= 0) return;
    await this.nodeMutationGuard.assertByteQuota(
      { node: { id: context.nodeId }, incrementBytes: fileSize },
      context.userId
    );
  }

  private targetToContext(target: IngestTarget): FileSystemNodeContext {
    return {
      userId: target.userId,
      userRole: 'USER',
      nodeId: target.parentNodeId,
      srcDwgNodeId: target.srcDwgNodeId,
      isImage: target.isImage,
      isLibrary: target.isLibrary,
      conflictStrategy: target.conflictStrategy,
      fileSize: target.fileSize,
    };
  }
}
