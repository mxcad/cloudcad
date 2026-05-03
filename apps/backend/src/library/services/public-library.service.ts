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

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FileSystemService } from '../../file-system/file-system.service';
import { LibraryType } from '../library.service';
import { CreateFolderDto } from '../../file-system/dto/create-folder.dto';
import {
  IPublicLibraryProvider,
  PUBLIC_LIBRARY_PROVIDER_DRAWING,
  PUBLIC_LIBRARY_PROVIDER_BLOCK,
} from '../interfaces/public-library-provider.interface';

@Injectable()
export class PublicLibraryService implements IPublicLibraryProvider {
  private readonly logger = new Logger(PublicLibraryService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileSystemService: FileSystemService,
    private readonly libraryType: LibraryType
  ) {}

  async getLibraryId(): Promise<string> {
    const library = await this.prisma.fileSystemNode.findFirst({
      where: {
        libraryKey: this.libraryType,
        isRoot: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!library) {
      throw new NotFoundException(
        `公共资源库 (${this.libraryType}) 不存在，请先初始化`
      );
    }

    return library.id;
  }

  async getRootNode() {
    const libraryId = await this.getLibraryId();

    return this.prisma.fileSystemNode.findUnique({
      where: { id: libraryId },
      include: {
        children: {
          where: {
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async createFolder(dto: CreateFolderDto): Promise<any> {
    const libraryId = await this.getLibraryId();
    const parentId = dto.parentId || libraryId;

    return this.fileSystemService.createFolder('system', parentId, dto);
  }

  async deleteNode(nodeId: string): Promise<any> {
    return this.fileSystemService.deleteNode(nodeId, true);
  }
}

export function createDrawingLibraryProvider(
  prisma: DatabaseService,
  fileSystemService: FileSystemService
): IPublicLibraryProvider {
  const service = new PublicLibraryService(prisma, fileSystemService, 'drawing');
  return {
    getLibraryId: () => service.getLibraryId(),
    getRootNode: () => service.getRootNode(),
    createFolder: (dto) => service.createFolder(dto),
    deleteNode: (nodeId) => service.deleteNode(nodeId),
  };
}

export function createBlockLibraryProvider(
  prisma: DatabaseService,
  fileSystemService: FileSystemService
): IPublicLibraryProvider {
  const service = new PublicLibraryService(prisma, fileSystemService, 'block');
  return {
    getLibraryId: () => service.getLibraryId(),
    getRootNode: () => service.getRootNode(),
    createFolder: (dto) => service.createFolder(dto),
    deleteNode: (nodeId) => service.deleteNode(nodeId),
  };
}

export {
  PUBLIC_LIBRARY_PROVIDER_DRAWING,
  PUBLIC_LIBRARY_PROVIDER_BLOCK,
};
