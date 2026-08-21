///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RolesModule } from '../../roles/roles.module';
import { FileTreeModule } from '../file-tree/file-tree.module';
import { FileSystemPermissionService } from './file-system-permission.service';

@Module({
  imports: [DatabaseModule, RolesModule, FileTreeModule],
  providers: [
    FileSystemPermissionService,
  ],
  exports: [
    FileSystemPermissionService,
  ],
})
export class FilePermissionModule {}
