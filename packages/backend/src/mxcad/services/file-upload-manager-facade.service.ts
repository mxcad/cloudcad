///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemService as MxFileSystemService } from './file-system.service';
import { FileConversionService } from './file-conversion.service';
import { FileSystemNodeService, FileSystemNodeContext } from '../node/filesystem-node.service';
import { CacheManagerService } from './cache-manager.service';
import { StorageManager } from '../../common/services/storage-manager.service';
import { VersionControlService } from '../../version-control/version-control.service';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { RateLimiter } from '../../common/concurrency/rate-limiter';
import {
  UploadChunkOptions,
  MergeOptions,
  MergeResult,
  UploadFileOptions,
} from './file-upload-manager.types';
import { ChunkUploadManagerService } from './chunk-upload-manager.service';
import { FileMergeService } from './file-merge.service';
import { ExternalRefService } from './external-ref.service';
import { UploadUtilityService } from './upload-utility.service';
import { FileConversionUploadService } from './file-conversion-upload.service';

@Injectable()
export class FileUploadManagerFacadeService {
  private readonly logger = new Logger(FileUploadManagerFacadeService.name);

  private readonly checkingFiles: Map<string, Promise<{ ret: string }>> = new Map();
  private readonly mxcadUploadPath: string;
  private readonly filesDataPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileConversionService: FileConversionService,
    private readonly fileSystemService: MxFileSystemService,
    @Inject('FileSystemServiceMain')
    private readonly fileSystemServiceMain: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly cacheManager: CacheManagerService,
    private readonly storageManager: StorageManager,
    private readonly versionControlService: VersionControlService,
    private readonly chunkUploadManagerService: ChunkUploadManagerService,
    private readonly fileMergeService: FileMergeService,
    private readonly externalRefService: ExternalRefService,
    private readonly uploadUtilityService: UploadUtilityService,
    private readonly fileConversionUploadService: FileConversionUploadService
  ) {
    this.mxcadUploadPath = this.configService.get('mxcadUploadPath') || '../../uploads';
    this.filesDataPath = this.configService.get('filesDataPath') || '../../filesData';
  }

  async checkChunkExist(options: UploadChunkOptions): Promise<{ ret: string }> {
    return this.chunkUploadManagerService.checkChunkExist(options);
  }

  async checkFileExist(
    filename: string,
    fileHash: string,
    context?: FileSystemNodeContext
  ): Promise<{ ret: string; nodeId?: string }> {
    return this.fileConversionUploadService.checkFileExist(filename, fileHash, context);
  }

  async mergeConvertFile(options: MergeOptions): Promise<MergeResult> {
    return this.fileMergeService.mergeConvertFile(options);
  }

  async uploadChunk(options: UploadChunkOptions): Promise<{ ret: string; tz?: boolean }> {
    return this.chunkUploadManagerService.uploadChunk(options);
  }

  async uploadAndConvertFile(options: UploadFileOptions): Promise<{ ret: string; tz?: boolean }> {
    return this.fileConversionUploadService.uploadAndConvertFile(options);
  }

  async mergeChunksWithPermission(options: MergeOptions): Promise<MergeResult> {
    return this.fileMergeService.mergeChunksWithPermission(options);
  }

  async uploadAndConvertFileWithPermission(
    options: UploadFileOptions
  ): Promise<{ ret: string; tz?: boolean; nodeId?: string }> {
    return this.fileConversionUploadService.uploadAndConvertFileWithPermission(options);
  }

  getConvertedFileName(fileHash: string, originalFilename: string): string {
    return this.uploadUtilityService.getConvertedFileName(fileHash, originalFilename);
  }

  async getExternalRefDirName(srcDwgNodeId: string): Promise<string> {
    return this.externalRefService.getExternalRefDirName(srcDwgNodeId);
  }

  async handleExternalReferenceFile(
    extRefHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string
  ): Promise<void> {
    return this.externalRefService.handleExternalReferenceFile(extRefHash, srcDwgNodeId, extRefFileName, srcFilePath);
  }

  async handleExternalReferenceImage(
    fileHash: string,
    srcDwgNodeId: string,
    extRefFileName: string,
    srcFilePath: string,
    context: FileSystemNodeContext
  ): Promise<void> {
    return this.externalRefService.handleExternalReferenceImage(fileHash, srcDwgNodeId, extRefFileName, srcFilePath, context);
  }
}