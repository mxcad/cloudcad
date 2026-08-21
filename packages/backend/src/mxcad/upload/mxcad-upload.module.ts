///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RuntimeConfigModule } from '../../runtime-config/runtime-config.module';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { StorageManagementModule } from '../../storage-management/storage-management.module';
import { FileTreeModule } from '../../file-system/file-tree/file-tree.module';
import { FileOperationsModule } from '../../file-operations/file-operations.module';
import { StorageModule } from '../../storage/storage.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { AuditLogModule } from '../../audit/audit-log.module';
import { DrawingIngestService } from './drawing-ingest.service';
import { UploadUtilityService } from './upload-utility.service';
import { FileNodeMaterializer } from './file-node-materializer.service';
import { NodeStatusTransitioner } from '../../file-system/file-status/node-status-transitioner';
import { ChunkUploadManagerService } from '../services/chunk-upload-manager.service';

@Module({
  imports: [
    ConfigModule,
    RuntimeConfigModule,
    DatabaseModule,
    CommonModule,
    StorageManagementModule,
    FileTreeModule,
    FileOperationsModule,
    StorageModule,
    VersionControlModule,
    MxcadInfraModule,
    MxcadNodeModule,
    MxcadConversionModule,
    MxcadExternalRefModule,
    MxcadSaveModule,
    AuditLogModule,
  ],
  providers: [
    DrawingIngestService,
    FileNodeMaterializer,
    NodeStatusTransitioner,
    UploadUtilityService,
    ChunkUploadManagerService,
  ],
  exports: [
    DrawingIngestService,
    UploadUtilityService,
    ChunkUploadManagerService,
  ],
})
export class MxcadUploadModule {}
