///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { FileStatus, Prisma } from '@cloudcad/db';
import { DatabaseService } from '../../database/database.service';
import { FileStatusStateMachine } from './file-status-state-machine';

/**
 * 文件节点状态转换器
 *
 * 把「先 validateTransition 再 updateFileStatus」两步约定收敛为一步：
 * 校验 + 写入原子完成。FileStatus 的全部写入必须经过此入口，
 * 禁止直接写 prisma.fileSystemNode.fileStatus（ADR-0035 / ADR-0037）。
 *
 * @param tx 可选事务客户端：在既有事务内完成校验 + 写入时传入
 */
@Injectable()
export class NodeStatusTransitioner {
  private readonly logger = new Logger(NodeStatusTransitioner.name);

  constructor(private readonly prisma: DatabaseService) {}

  async transition(
    nodeId: string,
    from: FileStatus | null,
    to: FileStatus,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    FileStatusStateMachine.validateTransition(from, to);
    const client = tx ?? this.prisma;
    await client.fileSystemNode.update({
      where: { id: nodeId },
      data: { fileStatus: to },
    });
    this.logger.log(
      `[NodeStatusTransitioner] 状态转换: ${from ?? 'null'} → ${to} (${nodeId})`
    );
  }
}
