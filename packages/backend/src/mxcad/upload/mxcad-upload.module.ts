///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { CommonModule } from '../../common/common.module';
import { FileSystemModule } from '../../file-system/file-system.module';
import { FileSystemService as MainFileSystemService } from '../../file-system/file-system.service';
import { StorageModule } from '../../storage/storage.module';
import { VersionControlModule } from '../../version-control/version-control.module';
import { MxcadInfraModule } from '../infra/mxcad-infra.module';
import { MxcadNodeModule } from '../node/mxcad-node.module';
import { MxcadConversionModule } from '../conversion/mxcad-conversion.module';
import { MxcadExternalRefModule } from '../external-ref/mxcad-external-ref.module';
import { MxcadSaveModule } from '../save/mxcad-save.module';
import { FileMergeService } from './file-merge.service';
import { FileConversionUploadService } from './file-conversion-upload.service';
import { UploadUtilityService } from './upload-utility.service';
import { ChunkUploadManagerService } from './chunk-upload-manager.service';

@Module({
  imports: [ConfigModule, DatabaseModule, CommonModule, FileSystemModule, StorageModule, VersionControlModule, MxcadInfraModule, MxcadNodeModule, MxcadConversionModule, MxcadExternalRefModule, MxcadSaveModule],
  providers: [
    FileMergeService,
    FileConversionUploadService,
    UploadUtilityService,
    ChunkUploadManagerService,
    { provide: 'FileSystemServiceMain', useExisting: MainFileSystemService },
  ],
  exports: [
    FileMergeService,
    FileConversionUploadService,
    UploadUtilityService,
    ChunkUploadManagerService,
  ],
})
export class MxcadUploadModule {}
