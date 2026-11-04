///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as path from 'path';
import { resolveMxcadUploadDir } from '../../common/utils/mxcad-upload-dir';
import { CacheManagerService } from '../infra/cache-manager.service';
import { FileSystemService as MxFileSystemService } from '../infra/file-system.service';
import { FileConversionService } from '../conversion/file-conversion.service';
import type { ConversionFailureCategory } from '@cloudcad/contracts';
import {
  CONVERSION_FILE_CHANNEL,
  type ConversionFileSseEvent,
} from '../conversion/conversion-task-sse.constants';
import { isArtifactReadyByHash } from '../utils/conversion-artifact';
import { buildIngestConversionOptions } from '../utils/ingest-conversion-options';
import type { ConversionQuotaReservation } from '../../vip/restriction-engine.service';
import { FileSystemNodeContext } from '../node/filesystem-node.service';
import type { NoNodeConversionStatus } from './drawing-ingest.service';

/** 在途无节点转换状态表保留时长：终态（COMPLETED/FAILED）条目保留 5 分钟 */
const NO_NODE_STATUS_TTL_MS = 5 * 60 * 1000;

/**
 * 无节点（游客 / 公开图纸）转换路径（评审候选 6：从 DrawingIngestService 巨缝抽出）。
 *
 * 与整包 / 分片节点路径的区别：不建 DB 节点、不落盘（mxweb 留在 uploads 目录供
 * public-file/access 预览）。完成（成功/失败）后 emit 到 CONVERSION_FILE_CHANNEL(hash)，
 * 前端按文件 SSE 收到即打开。在途状态表（hash → 状态 + 时间戳）供按文件 SSE 建连时
 * 查当前状态（处理"订阅前已转完"竞态），终态条目按 TTL 惰性清理。
 *
 * 依赖：eventEmitter（唯一 emit 点）+ fileSystemService / cacheManager /
 * fileConversionService + configService（mxcadUploadPath）。是 eventEmitter 与
 * noNodeConversionStatus 表在摄入域的唯一持有者。
 */
@Injectable()
export class NoNodeConversionService {
  private readonly logger = new Logger(NoNodeConversionService.name);

  private readonly noNodeConversionStatus: Map<
    string,
    { status: NoNodeConversionStatus; updatedAt: number }
  > = new Map();
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileSystemService: MxFileSystemService,
    private readonly cacheManager: CacheManagerService,
    private readonly fileConversionService: FileConversionService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.mxcadUploadPath = resolveMxcadUploadDir(this.configService);
  }

  /**
   * 在途无节点转换状态（惰性清理：终态条目超 TTL 即删，视为无记录。
   * PROCESSING 不清理（转换进行中））。
   */
  getNoNodeConversionStatus(
    hash: string
  ): NoNodeConversionStatus | undefined {
    const entry = this.noNodeConversionStatus.get(hash);
    if (!entry) return undefined;
    if (
      entry.status !== 'PROCESSING' &&
      Date.now() - entry.updatedAt > NO_NODE_STATUS_TTL_MS
    ) {
      this.noNodeConversionStatus.delete(hash);
      return undefined;
    }
    return entry.status;
  }

  /**
   * 无节点转换当前状态（供按文件 SSE 建连推当前状态）：优先在途表；无记录
   * （服务重启 / 完成后 TTL 过期）按 mxweb 是否就位兜底——就位 = COMPLETED，
   * 未就位 = PROCESSING（视为进行中，等完成事件；前端有超时兜底）。
   */
  async getNoNodeFileState(
    hash: string
  ): Promise<NoNodeConversionStatus> {
    const status = this.getNoNodeConversionStatus(hash);
    if (status) return status;
    if (await this.isNoNodeMxwebInPlace(hash)) return 'COMPLETED';
    return 'PROCESSING';
  }

  /** 该 hash 的 mxweb 是否已在 uploads 目录就位（与 public-file findMxwebFile 同判据：<hash>.<ext>.mxweb） */
  private async isNoNodeMxwebInPlace(hash: string): Promise<boolean> {
    return isArtifactReadyByHash(this.mxcadUploadPath, hash);
  }

  /**
   * 后台无节点转换（游客 / 公开图纸打开）：fire-and-forget，不阻塞上传/合并请求。
   *
   * 与 runBackgroundChunkConversion / runBackgroundCadConversion 同模式，区别是不建
   * DB 节点、不落盘（mxweb 留在 uploads 目录供 public-file/access 预览）。完成（成功/
   * 失败）后 emit 到 CONVERSION_FILE_CHANNEL(hash)，前端按文件 SSE 收到即打开（latest-
   * wins：只打开最后打开的那个文件）。任何异常都不向上抛出（后台任务，避免 unhandledRejection）。
   *
   * 返回后台任务 Promise：调用方 fire-and-forget 忽略返回值，测试可 await 它等待完成再断言。
   */
  runBackgroundNoNodeConversion(args: {
    filepath: string;
    fileHash: string;
    fileName: string;
    fileSize: number;
    context: FileSystemNodeContext;
    source: { ip?: string };
    /** 「无缓存打开」：强制重转，绕过转换产物就位短路（同名覆盖） */
    forceConvert?: boolean;
    /** 分片场景的 chunk 临时目录（合并后清理）；整包场景为 undefined */
    tmpDir?: string;
    /** 分片场景的合并缓存 key（合并后清理）；整包场景为 undefined */
    mergeKey?: string;
    reservation: ConversionQuotaReservation;
  }): Promise<void> {
    const {
      filepath,
      fileHash: hash,
      fileName,
      context,
      source,
      forceConvert,
      tmpDir,
      mergeKey,
      reservation,
    } = args;

    this.noNodeConversionStatus.set(hash, {
      status: 'PROCESSING',
      updatedAt: Date.now(),
    });

    return (async () => {
      const setStatus = (status: NoNodeConversionStatus) => {
        this.noNodeConversionStatus.set(hash, {
          status,
          updatedAt: Date.now(),
        });
      };
      const emitDone = (
        status: 'COMPLETED' | 'FAILED',
        // FAILED 时透传失败原因 + 性质分类：游客无 nodeId、查不了节点 status 端点，
        // 前端据此区分「文件内容问题」vs「引擎/服务异常」
        failure?: { error?: string; errorCategory?: ConversionFailureCategory }
      ) => {
        try {
          this.eventEmitter.emit(CONVERSION_FILE_CHANNEL(hash), {
            hash,
            status,
            ...(failure ?? {}),
          } satisfies ConversionFileSseEvent);
        } catch (err) {
          this.logger.warn(
            `[DrawingIngest.noNode] SSE emit 失败（业务不阻塞）: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      };
      const cleanup = async () => {
        if (tmpDir) {
          await this.fileSystemService.deleteDirectory(tmpDir).catch(() => {});
        }
        if (mergeKey) {
          this.cacheManager.delete('file-upload', mergeKey);
        }
      };
      try {
        // .mxweb 无需转换（边界：分片上传 mxweb），直接标记完成通知前端
        const isMxwebFile =
          path.extname(fileName).toLowerCase() === '.mxweb';
        if (isMxwebFile) {
          setStatus('COMPLETED');
          emitDone('COMPLETED');
          await cleanup();
          this.logger.log(
            `[DrawingIngest.noNode] .mxweb 文件，跳过转换: ${fileName} (${hash})`
          );
          return;
        }
        const result = await this.fileConversionService.convertFile(
          buildIngestConversionOptions({
            srcPath: filepath,
            fileHash: hash,
            forceConvert,
            // 无节点（游客/公开图纸）转换：用文件 hash 兜底做落盘目录标识，
            // 失败现场仍落盘（否则未登录用户转换失败丢原因）
            debugNodeId: hash,
          })
        );
        if (result.isOk) {
          setStatus('COMPLETED');
          emitDone('COMPLETED');
          await cleanup();
          this.logger.log(
            `[DrawingIngest.noNode] 无节点转换完成: ${fileName} (${hash})`
          );
        } else {
          setStatus('FAILED');
          emitDone('FAILED', {
            error: result.error,
            errorCategory: result.errorCategory,
          });
          await reservation.release();
          await cleanup();
          this.logger.warn(
            `[DrawingIngest.noNode] 无节点转换失败: ${fileName} (${hash}) ` +
              `（transient=${result.transient ?? 'unknown'}，${
                result.error || '未知错误'
              }）`
          );
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[DrawingIngest.noNode] 无节点转换异常: ${errMsg}`,
          error instanceof Error ? error.stack : undefined
        );
        setStatus('FAILED');
        emitDone('FAILED', { error: errMsg });
        try {
          await reservation.release();
          await cleanup();
        } catch (cleanupErr) {
          this.logger.error(
            `[DrawingIngest.noNode] 失败清理异常: ${
              cleanupErr instanceof Error
                ? cleanupErr.message
                : String(cleanupErr)
            }`
          );
        }
      }
    })();
  }
}
