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

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { FileTreeModule } from '../../file-system/file-tree/file-tree.module';
import { FileSystemNodeService } from './filesystem-node.service';
import { NodeCreationService } from './node-creation.service';

/**
 * MxCAD 节点模块
 *
 * 职责：提供文件系统节点相关的服务
 */
@Module({
  imports: [DatabaseModule, CommonModule, FileTreeModule],
  providers: [FileSystemNodeService, NodeCreationService],
  exports: [FileSystemNodeService, NodeCreationService],
})
export class MxcadNodeModule {}
