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
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { FileSystemService } from '../file-system/file-system.service';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { DatabaseService } from '../database/database.service';
import {
  PublicLibraryService,
  createDrawingLibraryProvider,
  createBlockLibraryProvider,
  PUBLIC_LIBRARY_PROVIDER_DRAWING,
  PUBLIC_LIBRARY_PROVIDER_BLOCK,
} from './services/public-library.service';

@Module({
  imports: [DatabaseModule, CommonModule, FileSystemModule],
  controllers: [LibraryController],
  providers: [
    LibraryService,
    PublicLibraryService,
    {
      provide: PUBLIC_LIBRARY_PROVIDER_DRAWING,
      useFactory: (prisma, fileSystemService) =>
        createDrawingLibraryProvider(prisma, fileSystemService),
      inject: [DatabaseService, FileSystemService],
    },
    {
      provide: PUBLIC_LIBRARY_PROVIDER_BLOCK,
      useFactory: (prisma, fileSystemService) =>
        createBlockLibraryProvider(prisma, fileSystemService),
      inject: [DatabaseService, FileSystemService],
    },
  ],
  exports: [LibraryService],
})
export class LibraryModule {}
