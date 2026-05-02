///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MxUploadReturn } from '../enums/mxcad-return.enum';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { RateLimiter } from '../../common/concurrency/rate-limiter';
import {
  UploadChunkOptions,
  MergeOptions,
  MergeResult,
} from '../services/file-upload-manager.types';
import { FileMergeService } from './file-merge.service';
import * as path from 'path';

@Injectable()
export class ChunkUploadManagerService {
  private readonly logger = new Logger(ChunkUploadManagerService.name);
  private readonly uploadRateLimiter: RateLimiter;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileSystemService: MxFileSystemService,
    private readonly fileMergeService: FileMergeService
  ) {
    // 分片上传是 I/O 密集型，可以较高的并发数
    const uploadConfig = this.configService.get('upload', { infer: true });
    const maxConcurrent = uploadConfig?.chunkMaxConcurrent || 5;
    this.uploadRateLimiter = new RateLimiter(maxConcurrent);
    this.logger.log(`分片上传限流器初始化: 最大并发数=${maxConcurrent}`);
  }

  async checkChunkExist(options: UploadChunkOptions): Promise<{ ret: string }> {
    const { chunk, hash, size, chunks: totalChunks, name, context } = options;

    this.logger.log(
      `[checkChunkExist] 开始检查: userId=${context.userId}, nodeId=${context.nodeId}, chunk=${chunk}/${totalChunks}, hash=${hash}, name=${name}, size=${size}`
    );

    try {
      if (chunk === 0) {
        const maxSize = 104857600;
        if (size > maxSize) {
          this.logger.warn(
            `[checkChunkExist] 文件大小超过限制: ${size} bytes > ${maxSize} bytes`
          );
          return { ret: 'errorparam' };
        }
      }

      const cbfilename = `${chunk}_${hash}`;
      const tmpDir = this.fileSystemService.getChunkTempDirPath(hash);
      const chunkPath = path.join(tmpDir, cbfilename);

      const chunkExists = await this.fileSystemService.exists(chunkPath);
      if (chunkExists) {
        const chunkSize = await this.fileSystemService.getFileSize(chunkPath);
        if (chunkSize !== size) {
          return { ret: MxUploadReturn.kChunkNoExist };
        }

        if (chunk === totalChunks - 1) {
          this.logger.log(`🔍 最后分片已上传，检查是否需要合并: ${name}`);

          let allChunksExist = true;
          for (let i = 0; i < totalChunks; i++) {
            const eachChunkPath = path.join(tmpDir, `${i}_${hash}`);
            if (!(await this.fileSystemService.exists(eachChunkPath))) {
              allChunksExist = false;
              break;
            }
          }

          if (allChunksExist) {
            this.logger.log(
              `✅ 所有分片已存在，等待 uploadChunk 触发合并: ${name}`
            );
            return { ret: MxUploadReturn.kChunkAlreadyExist };
          }
        }

        return { ret: MxUploadReturn.kChunkAlreadyExist };
      } else {
        return { ret: MxUploadReturn.kChunkNoExist };
      }
    } catch (error) {
      this.logger.error(`检查分片存在性失败: ${error.message}`, error.stack);
      return { ret: MxUploadReturn.kChunkNoExist };
    }
  }

  async uploadChunk(
    options: UploadChunkOptions
  ): Promise<{ ret: string; tz?: boolean }> {
    const { hash, chunks, name, size, chunk, context } = options;

    return this.uploadRateLimiter.execute(async () => {
      const isLastChunk = chunk + 1 === chunks;

      if (isLastChunk) {
        this.logger.log(`[uploadChunk] 最后一个分片，触发合并: hash=${hash}`);
        return this.fileMergeService.mergeConvertFile({
          hash,
          chunks,
          name,
          size,
          context,
        });
      } else {
        this.logger.log(`[uploadChunk] 保存分片: hash=${hash}, chunk=${chunk}`);
        return { ret: MxUploadReturn.kOk };
      }
    });
  }
}
