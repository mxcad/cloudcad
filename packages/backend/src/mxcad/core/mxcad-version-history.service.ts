import { Injectable, Logger, Inject } from '@nestjs/common';
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

/**
 * 历史版本内容解析失败：携带目标 HTTP 状态码与已本地化文案，由入口统一映射为响应。
 * 用于把原本散落在转换链路里的 `res.status(...).json(...)` 收敛为可抛异常，
 * 使同一解析逻辑同时服务「同步取内容」与「异步预热轮询」两条路径。
 */
class VersionContentError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'VersionContentError';
  }
}

@Injectable()
export class MxcadVersionHistoryService {
  private readonly logger = new Logger(MxcadVersionHistoryService.name);

  /** 在途历史版本转换（key = 目标 `_v<rev>.mxweb` 绝对路径）：并发请求复用同一转换 */
  private historyConversionLocks = new Map<string, Promise<string | null>>();

  /**
   * 最近一次历史版本转换失败（key 同上），带时间戳。
   * 预热模式（warmup=1）返回 202 后由前端轮询：若转换刚失败且无在途任务，
   * 据此直接报错而不是每轮重新发起转换（否则每个轮询间隔都会重跑一次转换 + 重占额度）。
   * 带 TTL：瞬时失败（转换服务抖动/超时）不应永久阻断，过期后允许重试。
   * 转换成功或等待者重试成功后清除。
   */
  private historyConversionFailures = new Map<
    string,
    { error: Error; at: number }
  >();

  /** 预热轮询短路窗口的长度：窗口内重复轮询不重跑转换，窗口外允许重试瞬时失败 */
  private static readonly HISTORY_FAILURE_MEMO_TTL_MS = 60_000;

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
        const resolved = await this.resolveMxwebVersion(filename, version, req, isWarmup);
        if (resolved.processing) {
          // 预热模式：bin→mxweb 转换已发起或仍在进行（FUNCTION_EXECUTOR=conversion-service
          // 时为独立服务的异步队列任务）。此处不长时间挂起本连接——转换耗时可能超过
          // nginx proxy_read_timeout（300s）或客户端超时，连接被切后前端拿到 504 误判
          // 「准备失败」，而转换其实仍在跑。改返回 202，由前端轮询本端点直到就绪（204）。
          res.status(202).json({ status: 'PROCESSING' });
          this.logger.log(`历史版本转换进行中，等待前端轮询: ${filename} v${version}`);
          return;
        }
        buffer = resolved.buffer!;
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
          throw new VersionContentError(404, result.message || '历史版本文件不存在');
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
      // 历史版本查看频率超限：透传 QuotaExceededException 完整响应体（code: QUOTA_EXCEEDED，
      // 含 restrictionKey/limit 等），前端全局 error interceptor 据此弹 VIP 升级引导
      if (error instanceof QuotaExceededException) {
        this.logger.warn(`历史版本转换频率超限: ${error.message}`);
        res.status(error.getStatus()).json(error.getResponse());
        return;
      }
      if (error instanceof VersionContentError) {
        res.status(error.status).json({ code: -1, message: error.message });
        return;
      }
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

  /**
   * 解析历史版本 mxweb 内容。
   *
   * @returns `{ buffer }`：内容就绪（`_v<rev>.mxweb` 缓存命中，或无 bin 分片时兜底解析完成）
   *          `{ processing: true }`：仅预热模式，bin→mxweb 转换已发起/在途、内容尚未就绪，
   *          调用方返回 202 由前端轮询，避免长时间挂起连接被代理/客户端超时切断
   *
   * 抛错语义（由 handleHistoricalVersionRequest 统一映射为 HTTP）：
   * - QuotaExceededException：查看频率超限（403，透传 restrictionKey/limit）
   * - VersionContentError：版本目录/分片/转换/原始文件提取失败（404/500 + 对应本地化文案）
   */
  private async resolveMxwebVersion(
    filename: string,
    version: string,
    req: Request,
    isWarmup: boolean
  ): Promise<{ buffer?: Buffer; processing: boolean }> {
    const filesDataPath = this.configService.get('filesDataPath', {
      infer: true,
    });
    const absoluteFilePath = path.resolve(filesDataPath, filename);
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
      return {
        buffer: await fsPromises.readFile(historyMxwebPath),
        processing: false,
      };
    }

    const lockKey = historyMxwebPath;
    let existingLock = this.historyConversionLocks.get(lockKey);

    if (existingLock) {
      if (isWarmup) {
        // 预热模式：已有在途转换 → 直接 202 由前端轮询，不挂起等待
        this.logger.log(`预热请求命中在途转换: ${historyMxwebName}`);
        return { processing: true };
      }
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
        this.historyConversionFailures.delete(lockKey);
        existingLock = undefined;
      }
      if (fs.existsSync(historyMxwebPath)) {
        this.logger.log(`转换完成，返回缓存文件: ${historyMxwebName}`);
        return {
          buffer: await fsPromises.readFile(historyMxwebPath),
          processing: false,
        };
      }
      if (existingLock) {
        this.logger.log(
          `等待完成但 historyMxwebPath 不存在，将尝试 _initial.mxweb 逻辑`
        );
        return {
          buffer: await this.resolveVersionFallback(
            filename,
            version,
            absoluteFilePath,
            fileDir,
            mxwebBaseName
          ),
          processing: false,
        };
      }
    }

    if (isWarmup) {
      // 预热模式：上一次转换刚失败且无在途任务 → 直接报错（避免轮询反复重跑转换 + 重占额度）
      const previousFailure = this.historyConversionFailures.get(lockKey);
      if (
        previousFailure &&
        Date.now() - previousFailure.at <
          MxcadVersionHistoryService.HISTORY_FAILURE_MEMO_TTL_MS
      ) {
        this.logger.warn(
          `预热命中近期转换失败，短路返回错误（避免轮询重跑转换）: ${historyMxwebName}`
        );
        throw new VersionContentError(
          500,
          this.formatConversionFailed(previousFailure.error.message)
        );
      }

      // 校验版本库目录 + 占额度为同步步骤（错误立即返回给前端，如 403 频率超限），
      // 「拉分片 + 转换」本体异步执行
      const ensured = await this.ensureHistoryConversionStarted(
        fileDir,
        version,
        req,
        lockKey,
        mxwebBaseName,
        historyMxwebName
      );
      if (ensured.noBinShards) {
        // 无 bin 分片：无重量级转换，同步解析兜底内容（_initial.mxweb / MX 原始文件）
        return {
          buffer: await this.resolveVersionFallback(
            filename,
            version,
            absoluteFilePath,
            fileDir,
            mxwebBaseName
          ),
          processing: false,
        };
      }
      // 重量级 bin→mxweb 转换：已有在途任务或本次新发起 → 前端继续轮询
      if (fs.existsSync(historyMxwebPath)) {
        // 极端情况：转换在发起后瞬间完成
        return {
          buffer: await fsPromises.readFile(historyMxwebPath),
          processing: false,
        };
      }
      return { processing: true };
    }

    this.logger.log(
      `历史版本 mxweb 不存在，从 MX 获取 .bin 分片文件并转换`
    );

    let buffer: Buffer;

    const ensured = await this.ensureHistoryConversionStarted(
      fileDir,
      version,
      req,
      lockKey,
      mxwebBaseName,
      historyMxwebName
    );
    if (!ensured.noBinShards) {
      const task = this.historyConversionLocks.get(lockKey);
      if (task) {
        try {
          const resultPath = await task;
          if (resultPath) {
            buffer = await fsPromises.readFile(resultPath);
          }
        } catch (error: unknown) {
          // 频率超限原样上抛（由入口映射为 403 + restrictionKey/limit），不折叠为转换失败
          if (error instanceof QuotaExceededException) throw error;
          const err = error as Error;
          this.logger.error(`历史版本转换失败: ${err.message}`);
          throw new VersionContentError(
            500,
            this.formatConversionFailed(err.message)
          );
        }
      }
    }

    if (!buffer) {
      buffer = await this.resolveVersionFallback(
        filename,
        version,
        absoluteFilePath,
        fileDir,
        mxwebBaseName
      );
    }
    return { buffer, processing: false };
  }

  /**
   * 确保历史版本 bin→mxweb 转换已发起（锁保护，幂等）。
   *
   * 锁在**首个 await 之前**注册：预检（列目录/占额）本身是异步的，若等预检通过后才建锁，
   * 两个并发请求会各自建锁互相覆盖，先建者 await 不到自己的转换而留下未处理 rejection。
   *
   * 「校验 MX 版本库目录 + 占额度」为预检步骤，失败立即抛出给调用方
   * （含 QuotaExceededException → 403）；实际「拉取 bin 分片 + 转换」在锁 Promise 上
   * 异步完成，调用方按需 await。
   *
   * @returns `existing: true` 已有在途任务（复用）；`noBinShards: true` 该版本无 .bin 分片
   *          （无重量级转换，调用方走 _initial.mxweb / 原始文件兜底）
   */
  private async ensureHistoryConversionStarted(
    fileDir: string,
    version: string,
    req: Request,
    lockKey: string,
    mxwebBaseName: string,
    historyMxwebName: string
  ): Promise<{ existing: boolean; noBinShards: boolean }> {
    if (this.historyConversionLocks.has(lockKey)) {
      return { existing: true, noBinShards: false };
    }

    let resolveTask!: (value: string | null) => void;
    let rejectTask!: (reason: Error) => void;
    const task = new Promise<string | null>(
      (resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
      }
    );
    this.historyConversionLocks.set(lockKey, task);

    // 预检失败时创建者不会 await 该任务（直接抛出），挂一个静默处理器避免未处理 rejection；
    // 等待者 `await task` 仍会正常收到 rejection，不受影响。
    void task.catch(() => undefined);

    /** 预检失败：释放锁 + 记录失败（供预热轮询短路）+ reject 任务（使等待者不悬挂），并抛给调用方 */
    const abort = (error: Error): never => {
      this.historyConversionLocks.delete(lockKey);
      this.historyConversionFailures.set(lockKey, { error, at: Date.now() });
      rejectTask(error);
      throw new VersionContentError(
        500,
        this.formatConversionFailed(error.message)
      );
    };

    const listResult =
      await this.versionControlService.listDirectoryAtRevision(
        fileDir,
        parseInt(version, 10)
      );

    if (!listResult.success || !listResult.files) {
      abort(new Error('历史版本目录不存在'));
    }

    const binFiles = listResult.files.filter(
      (f: string) => f.endsWith('.bin')
    );

    if (binFiles.length === 0) {
      // 无 bin 分片：无重量级转换，释放占位锁（不走转换链路）
      this.historyConversionLocks.delete(lockKey);
      resolveTask(null);
      return { existing: false, noBinShards: true };
    }

    this.logger.log(`找到 ${binFiles.length} 个分片 bin 文件`);

    // bin→mxweb 与 mxweb→bin（保存）一致按用户限频：仅在真正执行转换时占位，
    // 缓存命中（含等待同一转换的其他请求）直接返回不占位；游客（分享访问）无 userId 不限制。
    const userId = (req as any).user?.id as string | undefined;
    let quotaReserved = false;
    if (userId) {
      try {
        await this.restrictionEngine.reserveHistoryCountOrThrow(userId);
        quotaReserved = true;
      } catch (error) {
        // 频率超限不算转换失败（内容本身可转换），不记入失败记忆，下次请求重新占额
        if (error instanceof QuotaExceededException) {
          this.historyConversionLocks.delete(lockKey);
          rejectTask(error);
          throw error;
        }
        abort(error as Error);
      }
    }

    this.runHistoryConversion({
      fileDir,
      version,
      binFiles,
      lockKey,
      userId,
      quotaReserved,
      mxwebBaseName,
      historyMxwebName,
      resolveTask,
      rejectTask,
    }).catch(() => {
      // runHistoryConversion 内部已捕获全部异常并 reject 锁 Promise；此处仅兜底避免未处理 rejection
    });

    return { existing: false, noBinShards: false };
  }

  /**
   * 执行历史版本 bin→mxweb 转换本体（锁 Promise 上异步完成，调用方按需 await）。
   * 失败时回补已占位的额度、记录失败（供预热轮询短路），并删除锁使后续请求可重试。
   */
  private async runHistoryConversion(args: {
    fileDir: string;
    version: string;
    binFiles: string[];
    lockKey: string;
    userId: string | undefined;
    quotaReserved: boolean;
    mxwebBaseName: string;
    historyMxwebName: string;
    resolveTask: (value: string | null) => void;
    rejectTask: (reason: Error) => void;
  }): Promise<void> {
    const {
      fileDir,
      version,
      binFiles,
      lockKey,
      userId,
      quotaReserved,
      mxwebBaseName,
      historyMxwebName,
      resolveTask,
      rejectTask,
    } = args;

    try {
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
            throw new Error(`分片文件获取失败: ${binFile}`);
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
          throw new Error(
            `bin→mxweb 转换失败: ${conversionResult.error}`
          );
        }

        this.logger.log(
          `成功转换并保存历史版本 mxweb: ${historyMxwebName}`
        );
        this.historyConversionFailures.delete(lockKey);
        resolveTask(conversionResult.outputPath);
      } finally {
        await this.cleanupTempFiles(tempDir);
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`历史版本转换失败: ${err.message}`);
      // 转换失败时回补已占位的额度，避免失败任务耗尽窗口配额
      if (quotaReserved && userId) {
        await this.restrictionEngine
          .releaseHistoryCount(userId)
          .catch(() => {});
      }
      this.historyConversionFailures.set(lockKey, { error: err, at: Date.now() });
      rejectTask(err);
    } finally {
      this.historyConversionLocks.delete(lockKey);
    }
  }

  /**
   * 无 bin 分片时的兜底解析：`_initial.mxweb` 本地缓存 → MX 原始文件（必要时转换并回写缓存）。
   * 产物回写 `_initial.mxweb`，后续请求（含预热轮询）直接命中。
   */
  private async resolveVersionFallback(
    filename: string,
    version: string,
    absoluteFilePath: string,
    fileDir: string,
    mxwebBaseName: string
  ): Promise<Buffer> {
    const initialMxwebName = mxwebBaseName.replace(
      /\.mxweb$/,
      '_initial.mxweb'
    );
    const initialMxwebPath = path.join(fileDir, initialMxwebName);

    if (fs.existsSync(initialMxwebPath)) {
      this.logger.log(
        `成功返回初始版本 mxweb: ${initialMxwebName} (本地文件)`
      );
      return fsPromises.readFile(initialMxwebPath);
    }

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
      throw new VersionContentError(
        404,
        I18nContext.current()?.t('error.file.history_file_not_found') ?? '历史版本原始文件不存在'
      );
    }

    const originalBuffer = originalResult.content;

    const baseBeforeMxweb = mxwebBaseName.replace(/\.mxweb$/, '');
    const lastDotIndex = baseBeforeMxweb.lastIndexOf('.');
    const originalExt =
      lastDotIndex !== -1
        ? baseBeforeMxweb.substring(lastDotIndex)
        : '';
    const originalFileName = baseBeforeMxweb;

    let buffer: Buffer;

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
          throw new VersionContentError(
            500,
            I18nContext.current()?.t('error.mxcad.history_file_conversion_failed') ?? '历史版本文件转换失败'
          );
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
    return buffer;
  }

  /** 历史版本转换失败文案（error.mxcad_extra.history_conversion_failed_detail） */
  private formatConversionFailed(detail: string): string {
    return (
      I18nContext.current()?.t('error.mxcad_extra.history_conversion_failed_detail', {
        args: { error: detail },
      }) ?? `历史版本文件转换失败: ${detail}`
    );
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
