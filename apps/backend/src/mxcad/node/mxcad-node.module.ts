///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FileSystemNodeService } from './filesystem-node.service';
import { NodeCreationService } from './node-creation.service';

/**
 * Mxcad 文件系统节点子模块
 *
 * 职责: 提供文件系统节点的创建、查询和引用管理。
 * 依赖 file-system 模块的 FileTreeService。
 *
 * 包含的服务:
 * - FileSystemNodeService: 文件系统节点 CRUD、并发控制、MVKCAD-App 上下文推断
 * - NodeCreationService: 节点创建和引用（带事务和锁机制）
 */
@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    CommonModule,
    forwardRef(() => FileSystemModule),
  ],
  providers: [FileSystemNodeService, NodeCreationService],
  exports: [FileSystemNodeService, NodeCreationService],
})
export class MxcadNodeModule {}
