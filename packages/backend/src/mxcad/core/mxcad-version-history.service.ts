import { Injectable, Logger, NotFoundException, InternalServerErrorException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import type { Response, Request } from 'express';
import { FileTypeDetector } from '../utils/file-type-detector';
import { IVersionControl, VERSION_CONTROL_TOKEN } from '../../version-control/interfaces/version-control.interface';
import { FileConversionService } from '../conversion/file-conversion.service';
import { I18nContext } from 'nestjs-i18n';
import { AppConfig } from '../../config/app.config';
import { RestrictionEngine } from '../../vip/restriction-engine.service';
import { QuotaExceededException } from '../../vip/errors/quota-exceeded.error';

@Injectable()
export class MxcadVersionHistoryService {
  private readonly logger = new Logger(MxcadVersionHistoryService.name);

  private historyConversionLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @Inject(VERSION_CONTROL_TOKEN)
    private readonly versionControlService: IVersionControl,
    private readonly fileConversionService: FileConversionService,
    private readonly restrictionEngine: RestrictionEngine,
  ) {}

  async handleHistoricalVersionRequest(
    filename: string,
    version: string,
    res: Response,
    req: Request,
    isHeadRequest: boolean,
    isWarmup = false
  ): Promise<void> {
    try {
      this.logger.log(
        `访问历史版本文件: ${filename} v${version}, 方法: ${isHeadRequest ? 'HEAD' : 'GET'}${isWarmup ? ', 预热模式(warmup)' : ''}`
      );

      const filesDataPath = this.configService.get('filesDataPath', {
        infer: true,
      });
      const absoluteFilePath = path.resolve(filesDataPath, filename);

      if (version === '-1') {
        const fileDir = path.dirname(absoluteFilePath);
        const mxwebBaseName = path.basename(filename);
        const initialMxwebName = mxwebBaseName.replace(/\.mxweb$/, '_initial.mxweb');
        const initialMxwebPath = path.join(fileDir, initialMxwebName);
        const servePath = fs.existsSync(initialMxwebPath) ? initialMxwebPath : absoluteFilePath;

        if (!fs.existsSync(servePath)) {
          res.status(404).json({ code: -1, message: (I18nContext.current()?.t('error.file.not_found') ?? '文件不存在') });
          return;
        }

        const contentType = this.getContentType(filename);

        if (isHeadRequest) {
          const stats = fs.statSync(servePath);
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', stats.size);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end();
          return;
        }

        if (isWarmup) {
          // 预热模式：初始版本文件已在磁盘，仅确认存在，不返回内容
          res.status(204).end();
          return;
        }

        const stats = fs.statSync(servePath);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Access-Control-Allow-Origin', '*');
        const fileStream = fs.createReadStream(servePath);
        fileStream.pipe(res);
        fileStream.on('error', (error) => {
          this.logger.error(`初始版本文件流错误: ${error.message}`);
          if (!res.headersSent) {
            res.status(500).json({ code: -1, message: '读取初始版本文件失败' });
          }
        });
        return;
      }

      if (isHeadRequest) {
        this.logger.log(`HEAD 请求 - 返回本地文件信息: ${absoluteFilePath}`);

        if (!fs.existsSync(absoluteFilePath)) {
          this.logger.error(`本地文件不存在: ${absoluteFilePath}`);
          res.status(404).json({ code: -1, message: (I18nContext.current()?.t('error.file.not_found') ?? '文件不存在') });
          return;
        }

        const fileStats = fs.statSync(absoluteFilePath);
        const contentType = this.getContentType(filename);
        const etag = `"v${version}-${fileStats.mtime.getTime()}"`;

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', fileStats.size);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('ETag', etag);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end();
        return;
      }

      this.logger.log(
        `GET 请求 - 从 MX 获取历史版本: ${filename} v${version}`
      );

      res.removeHeader('If-None-Match');
      res.removeHeader('If-Modified-Since');

      let buffer: Buffer;

      if (filename.endsWith('.mxweb')) {
        const fileDir = path.dirname(absoluteFilePath);
        const mxwebBaseName = path.basename(filename);

        const historyMxwebName = mxwebBaseName.replace(
          /\.mxweb$/,
          `_v${version}.mxweb`
        );
        const historyMxwebPath = path.join(fileDir, historyMxwebName);

        if (fs.existsSync(historyMxwebPath)) {
          this.logger.log(
            `历史版本 mxweb 已存在，直接返回: ${historyMxwebName}`
          );
          buffer = await fsPromises.readFile(historyMxwebPath);
        } else {
          const lockKey = historyMxwebPath;
          let existingLock = this.historyConversionLocks.get(lockKey);

          if (existingLock) {
            this.logger.log(`等待正在进行的转换: ${historyMxwebName}`);
            try {
              await existingLock;
            } catch (error) {
              // 等待的转换已失败（reject）：删除失效锁，落入下方创建分支自行重试，
              // 避免本次请求继承失败直接 500（偶尔打不开的来源之一）
              const err = error as Error;
              this.logger.warn(
                `等待的历史版本转换失败(${err.message})，删除锁并自行重试: ${historyMxwebName}`
              );
              this.historyConversionLocks.delete(lockKey);
              existingLock = undefined;
            }
            if (fs.existsSync(historyMxwebPath)) {
              this.logger.log(`转换完成，返回缓存文件: ${historyMxwebName}`);
              buffer = await fsPromises.readFile(historyMxwebPath);
            } else if (existingLock) {
              this.logger.log(
                `等待完成但 historyMxwebPath 不存在，将尝试 _initial.mxweb 逻辑`
              );
            }
          }

          if (!buffer && !existingLock) {
            this.logger.log(
              `历史版本 mxweb 不存在，从 MX 获取 .bin 分片文件并转换`
            );

            let resolveConversionTask: (value: string | null) => void;
            let rejectConversionTask: (reason: Error) => void;
            const conversionTask = new Promise<string | null>(
              (resolve, reject) => {
                resolveConversionTask = resolve;
                rejectConversionTask = reject;
              }
            );

            this.historyConversionLocks.set(lockKey, conversionTask);

            // 记录是否已成功占位历史版本转换额度：转换失败时据此回补，避免失败任务耗尽窗口配额
            let historyQuotaReserved = false;

            (async () => {
              try {
                const listResult =
                  await this.versionControlService.listDirectoryAtRevision(
                    fileDir,
                    parseInt(version, 10)
                  );

                if (!listResult.success || !listResult.files) {
                  throw new NotFoundException(I18nContext.current()?.t('error.file.version_history_not_found') ?? '历史版本目录不存在');
                }

                const binFiles = listResult.files.filter(
                  (f: string) => f.endsWith('.bin')
                );

                if (binFiles.length === 0) {
                  resolveConversionTask!(null);
                  return;
                }

                this.logger.log(`找到 ${binFiles.length} 个分片 bin 文件`);

                // bin→mxweb 与 mxweb→bin（保存）一致按用户限频：仅在真正执行转换时占位，
                // 缓存命中（含等待同一转换的其他请求）直接返回不占位；游客（分享访问）无 userId 不限制。
                const userId = (req as any).user?.id as string | undefined;
                if (userId) {
                  await this.restrictionEngine.reserveHistoryCountOrThrow(userId);
                  historyQuotaReserved = true;
                }

                const mxcadTempPath = this.configService.get('mxcadTempPath', {
                  infer: true,
                });
                const tempDir = path.join(
                  mxcadTempPath,
                  `mxcad-history-${version}-${Date.now()}`
                );
                await fsPromises.mkdir(tempDir, { recursive: true });

                try {
                  for (const binFile of binFiles) {
                    const binFilePath = path.join(fileDir, binFile);
                    this.logger.log(`获取分片文件: ${binFile} v${version}`);

                    const binResult =
                      await this.versionControlService.getFileContentAtRevision(
                        binFilePath,
                        parseInt(version, 10)
                      );

                    if (!binResult.success || !binResult.content) {
                      throw new NotFoundException(
                        `分片文件获取失败: ${binFile}`
                      );
                    }

                    const tempBinFile = path.join(tempDir, binFile);
                    await fsPromises.writeFile(tempBinFile, binResult.content);
                  }

                  const binSrcPath = path.join(tempDir, `${mxwebBaseName}.bin`);
                  const conversionResult =
                    await this.fileConversionService.convertBinToMxweb(
                      binSrcPath,
                      fileDir,
                      historyMxwebName
                    );

                  if (
                    !conversionResult.success ||
                    !conversionResult.outputPath
                  ) {
                    throw new InternalServerErrorException(
                      `bin→mxweb 转换失败: ${conversionResult.error}`
                    );
                  }

                  this.logger.log(
                    `成功转换并保存历史版本 mxweb: ${historyMxwebName}`
                  );

                  resolveConversionTask!(conversionResult.outputPath);
                } finally {
                  await this.cleanupTempFiles(tempDir);
                }
              } catch (error) {
                rejectConversionTask!(error as Error);
              }
            })();

            try {
              const resultPath = await conversionTask;
              if (resultPath) {
                buffer = await fsPromises.readFile(resultPath);
              }
            } catch (error: unknown) {
              // 历史版本查看频率超限：透传 QuotaExceededException 完整响应体（code: QUOTA_EXCEEDED，
              // 含 restrictionKey/limit 等），前端全局 error interceptor 据此弹 VIP 升级引导
              if (error instanceof QuotaExceededException) {
                this.logger.warn(`历史版本转换频率超限: ${error.message}`);
                res.status(error.getStatus()).json(error.getResponse());
                return;
              }
              const err = error as Error;
              this.logger.error(`历史版本转换失败: ${err.message}`);
              // 转换失败时回补已占位的额度，避免失败任务耗尽窗口配额
              if (historyQuotaReserved) {
                const userId = (req as any).user?.id as string | undefined;
                if (userId) {
                  await this.restrictionEngine
                    .releaseHistoryCount(userId)
                    .catch(() => {});
                }
              }
              res.status(500).json({
                code: -1,
                message: I18nContext.current()?.t('error.mxcad_extra.history_conversion_failed_detail', { args: { error: err.message } }) ?? `历史版本文件转换失败: ${err.message}`,
              });
              return;
            } finally {
              this.historyConversionLocks.delete(lockKey);
            }
          }

          if (!buffer) {
            const initialMxwebName = mxwebBaseName.replace(
              /\.mxweb$/,
              '_initial.mxweb'
            );
            const initialMxwebPath = path.join(fileDir, initialMxwebName);

            if (fs.existsSync(initialMxwebPath)) {
              buffer = await fsPromises.readFile(initialMxwebPath);
              this.logger.log(
                `成功返回初始版本 mxweb: ${initialMxwebName} (本地文件)`
              );
            } else {
              this.logger.log(
                `_initial.mxweb 不存在，从 MX 提取原始文件: ${filename} v${version}`
              );

              const originalResult =
                await this.versionControlService.getFileContentAtRevision(
                  absoluteFilePath,
                  parseInt(version, 10)
                );

              if (!originalResult.success || !originalResult.content) {
                this.logger.error(
                  `MX 原始文件提取失败: ${filename} v${version}`
                );
                res.status(404).json({
                  code: -1,
                  message: (I18nContext.current()?.t('error.file.history_file_not_found') ?? '历史版本原始文件不存在'),
                });
                return;
              }

              const originalBuffer = originalResult.content;

              const baseBeforeMxweb = mxwebBaseName.replace(/\.mxweb$/, '');
              const lastDotIndex = baseBeforeMxweb.lastIndexOf('.');
              const originalExt =
                lastDotIndex !== -1
                  ? baseBeforeMxweb.substring(lastDotIndex)
                  : '';
              const originalFileName = baseBeforeMxweb;

              if (
                originalExt &&
                FileTypeDetector.needsConversion(originalFileName)
              ) {
                const mxcadUploadPath = this.configService.get(
                  'mxcadUploadPath',
                  { infer: true }
                );
                const fileHash = crypto
                  .createHash('md5')
                  .update(originalBuffer)
                  .digest('hex');
                const ext = originalExt.substring(1);
                const cachedMxwebName = `${fileHash}.${ext}.mxweb`;
                const cachedMxwebPath = path.join(
                  mxcadUploadPath,
                  cachedMxwebName
                );

                if (fs.existsSync(cachedMxwebPath)) {
                  buffer = await fsPromises.readFile(cachedMxwebPath);
                  this.logger.log(`uploads 缓存命中: ${cachedMxwebName}`);
                } else {
                  const srcFileName = `${fileHash}.${ext}`;
                  const srcFilePath = path.join(mxcadUploadPath, srcFileName);
                  await fsPromises.writeFile(srcFilePath, originalBuffer);

                  const conversionResult =
                    await this.fileConversionService.convertFile({
                      srcPath: srcFilePath,
                      fileHash,
                    });

                  if (!conversionResult.isOk) {
                    this.logger.error(
                      `历史版本文件转换失败: ${conversionResult.error}`
                    );
                    res.status(500).json({
                      code: -1,
                      message: (I18nContext.current()?.t('error.mxcad.history_file_conversion_failed') ?? '历史版本文件转换失败'),
                    });
                    return;
                  }

                  buffer = await fsPromises.readFile(cachedMxwebPath);
                  await fsPromises.unlink(srcFilePath).catch(() => {});
                  this.logger.log(
                    `uploads 缓存已生成: ${cachedMxwebName}`
                  );
                }
              } else {
                buffer = originalBuffer;
              }

              await fsPromises.writeFile(initialMxwebPath, buffer);
              this.logger.log(
                `已保存初始版本 mxweb: ${initialMxwebName}`
              );
            }
          }
        }
      } else {
        const result =
          await this.versionControlService.getFileContentAtRevision(
            absoluteFilePath,
            parseInt(version, 10)
          );

        if (!result.success || !result.content) {
          this.logger.error(
            `历史版本文件不存在或读取失败: ${filename} v${version}`
          );
          res.status(404).json({
            code: -1,
            message: result.message || '历史版本文件不存在',
          });
          return;
        }

        buffer = result.content;
        this.logger.log(`成功返回历史版本文件: ${filename} v${version}`);
      }

      const contentType = this.getContentType(filename);

      if (isWarmup) {
        // 预热模式：版本 mxweb 已就绪（缓存已生成/内容已取得），仅确认成功，不返回内容，
        // 避免前端为触发缓存而下载整个文件（文件随后由编辑器打开时读取）
        res.status(204).end();
        this.logger.log(`预热完成（不返回内容）: ${filename} v${version}`);
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Access-Control-Allow-Origin', '*');

      res.status(200).send(buffer);

      this.logger.log(`成功返回历史版本文件: ${filename} v${version}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `获取历史版本文件失败: ${filename} v${version}, 错误: ${err.message}`,
        err.stack
      );
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: (I18nContext.current()?.t('error.mxcad.fetch_history_failed') ?? '获取历史版本文件失败') });
      }
    }
  }

  async cleanupTempFiles(tempDir: string): Promise<void> {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
      this.logger.log(`已清理临时目录: ${tempDir}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(`清理临时目录失败: ${tempDir}, 错误: ${err.message}`);
    }
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mxweb': 'application/octet-stream',
      '.dwg': 'application/dwg',
      '.dxf': 'application/dxf',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.json': 'application/json',
      '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
