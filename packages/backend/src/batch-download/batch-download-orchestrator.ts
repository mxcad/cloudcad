import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveMxcadUploadDir } from '../common/utils/mxcad-upload-dir';
import { DatabaseService } from '../database/database.service';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import {
  resolveOutputFormat,
  formatUnsupportedMessage,
  type OutputFormatParams,
} from '../file-system/file-download/format-policy';
import { ConversionRunner } from './conversion-runner';
import { JobContext } from './job-context';
import { isInUploadsCache } from './upload-cache.util';
import type { BatchFileItem } from './dto/create-batch-download.dto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 批量下载节点：真实 DB 节点（select 子集）或 fileHash-only 合成节点（path 恒 null）。
 * nodeType 用 string：真实节点是 NodeType 枚举、合成节点是 'FILE' 字面量，判定点只比对 'FILE'。
 */
interface BatchDownloadNode {
  id: string;
  name: string;
  originalName?: string | null;
  path?: string | null;
  fileHash?: string | null;
  extension?: string | null;
  nodeType: string;
  size?: number | null;
}

type BatchItem = BatchFileItem & { relativePath?: string };

/**
 * 批量项解析结果：ok 分支携带可处理节点与派生字段；
 * error 分支携带 item 级错误文案，调用方 recordError 后跳过该项。
 */
type ResolvedBatchItem =
  | {
      ok: true;
      node: BatchDownloadNode;
      isFileHashItem: boolean;
      fileName: string;
      ext: string;
      prefix: string;
    }
  | { ok: false; error: string };

/**
 * 单格式路由结果：direct = 直取源文件；convert = 需转换（engineParams 可能为 undefined）；
 * unsupported = 不可路由格式，降为 item 级错误。
 */
type FormatRoute =
  | { kind: 'direct' }
  | { kind: 'convert'; engineParams?: OutputFormatParams }
  | { kind: 'unsupported'; message: string };

@Injectable()
export class BatchDownloadOrchestrator {
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileDownloadExportService: FileDownloadExportService,
    private readonly conversionRunner: ConversionRunner,
    private readonly configService: ConfigService
  ) {
    this.mxcadUploadPath = resolveMxcadUploadDir(this.configService);
  }

  /**
   * 委托 conversion-service 模式的批量路径：
   * original/mxweb 文件即时加入，所有需要转换的格式统一收集后一次提交给 workflow 批量转换，
   * 结果按序回填到 archiveEntries / errors。
   */
  async processDelegated(
    ctx: JobContext,
    isTerminated: () => boolean
  ): Promise<void> {
    const pending: Array<{
      node: BatchDownloadNode;
      fileName: string;
      ext: string;
      prefix: string;
      label: string;
      format: string;
      pdfParams?: OutputFormatParams;
    }> = [];

    for (const item of ctx.expandedItems) {
      if (isTerminated()) return;
      const resolved = await this.resolveItemNode(item);
      // 显式 === false：strictNullChecks 关闭时布尔判别式的真值收窄不生效（ADR-0008 增量开启中）
      if (resolved.ok === false) {
        await ctx.recordError(
          item.nodeId ?? item.fileHash,
          item.fileName,
          resolved.error
        );
        continue;
      }
      const { node, isFileHashItem, fileName, ext, prefix } = resolved;

      for (const format of ctx.getFormats(item, ext)) {
        if (isTerminated()) break;
        const label = `${fileName} (${format})`;
        const route = this.routeFormat(format, item, isFileHashItem);
        if (route.kind === 'unsupported') {
          await ctx.recordError(
            item.nodeId ?? item.fileHash,
            fileName,
            route.message
          );
          continue;
        }
        if (route.kind === 'direct') {
          await this.tryAddOriginal(node, format, fileName, prefix, label, ctx);
          ctx.completedCount++;
        } else {
          pending.push({
            node,
            fileName,
            ext,
            prefix,
            label,
            format,
            pdfParams: route.engineParams,
          });
        }
      }
      await ctx.syncCounts();
    }

    if (pending.length > 0) {
      const results = await this.conversionRunner.convertMany(
        pending.map((p) => ({
          node: p.node,
          format: p.format,
          pdfParams: p.pdfParams,
        })),
        ctx.userId ?? undefined
      );
      results.forEach((result, index) => {
        const p = pending[index];
        if (result.success && result.filePath) {
          const baseName = `${path.basename(p.fileName, p.ext)}.${p.format}`;
          const sanitized = ctx.sanitizeZipName(p.prefix + baseName);
          ctx.archiveEntries.push({
            name: sanitized,
            stream: fs.createReadStream(result.filePath),
            sourcePath: result.filePath,
            temp: !isInUploadsCache(result.filePath, this.mxcadUploadPath),
          });
          ctx.convertedFiles.push(result.filePath);
        } else {
          ctx.errorCount++;
          ctx.errors.push({
            nodeId: p.node.id,
            fileName: p.label,
            error: result.error || 'Conversion failed',
          });
        }
        ctx.completedCount++;
        ctx.emitProgress(p.label);
      });
      await ctx.syncCounts();
    }
  }

  async processItem(
    item: BatchItem,
    ctx: JobContext,
    isTerminated: () => boolean
  ): Promise<void> {
    const resolved = await this.resolveItemNode(item);
    if (resolved.ok === false) {
      await ctx.recordError(
        item.nodeId ?? item.fileHash,
        item.fileName,
        resolved.error
      );
      return;
    }
    const { node, isFileHashItem, fileName, ext, prefix } = resolved;

    for (const format of ctx.getFormats(item, ext)) {
      if (isTerminated()) break;
      const label = `${fileName} (${format})`;
      const route = this.routeFormat(format, item, isFileHashItem);
      if (route.kind === 'unsupported') {
        await ctx.recordError(
          item.nodeId ?? item.fileHash,
          fileName,
          route.message
        );
        continue;
      }
      if (route.kind === 'direct') {
        await this.tryAddOriginal(node, format, fileName, prefix, label, ctx);
      } else {
        await this.tryConvert(
          node,
          fileName,
          ext,
          format,
          route.engineParams,
          prefix,
          label,
          ctx
        );
      }

      ctx.completedCount++;
      await ctx.syncCounts();
      ctx.emitProgress(label);
    }
  }

  /**
   * 批量项解析为可处理节点（delegated / 逐项两条路径共用）：
   * fileHash-only 项（CAD 编辑器内存导出）无 DB 节点，构造合成节点
   *（path 缺失，源文件由 conversion-runner 按 fileHash 解析），跳过 path 校验。
   */
  private async resolveItemNode(item: BatchItem): Promise<ResolvedBatchItem> {
    let node: BatchDownloadNode | null;
    let isFileHashItem = false;
    if (!item.nodeId && item.fileHash) {
      const name = item.fileName;
      node = {
        id: item.fileHash,
        name,
        originalName: name,
        path: null,
        fileHash: item.fileHash,
        extension: path.extname(name).toLowerCase(),
        nodeType: 'FILE',
      };
      isFileHashItem = true;
    } else {
      node = await this.prisma.fileSystemNode.findUnique({
        where: { id: item.nodeId },
        select: {
          id: true,
          name: true,
          originalName: true,
          path: true,
          fileHash: true,
          extension: true,
          nodeType: true,
          size: true,
        },
      });
    }

    if (!node || node.nodeType !== 'FILE') {
      return { ok: false, error: 'Node not found or not a file' };
    }
    if (!isFileHashItem && !node.path) {
      return { ok: false, error: 'File path is missing' };
    }
    const fileName = node.originalName || node.name;
    return {
      ok: true,
      node,
      isFileHashItem,
      fileName,
      ext: path.extname(fileName).toLowerCase(),
      prefix: item.relativePath ? `${item.relativePath}/` : '',
    };
  }

  /**
   * 单格式路由（两条路径共用）：路由只看请求格式、不看源文件 ext：
   * mxweb 源 + dwg/dxf/pdf 必须走转换（快照最新 mxweb → 排队转换，与单文件
   * downloadNodeWithFormat 一致）；仅 original/mxweb 格式直取源文件。
   * fileHash-only 项恒转换（源恒 .mxweb、请求恒 dwg/dxf/pdf）。
   */
  private routeFormat(
    format: string,
    item: BatchItem,
    isFileHashItem: boolean
  ): FormatRoute {
    let resolved: ReturnType<typeof resolveOutputFormat>;
    try {
      resolved = resolveOutputFormat(format, item);
    } catch {
      // 未知/不可路由格式：降为 item 级错误（显式报错），
      // 不让单个坏格式把整个 job 打成 FAILED（历史脏数据/直写 DB 可达）
      return { kind: 'unsupported', message: formatUnsupportedMessage(format) };
    }
    if (!isFileHashItem && !resolved.needsConversion) {
      return { kind: 'direct' };
    }
    return { kind: 'convert', engineParams: resolved.engineParams };
  }

  private async tryAddOriginal(
    node: BatchDownloadNode,
    format: string,
    fileName: string,
    prefix: string,
    label: string,
    ctx: JobContext
  ): Promise<void> {
    try {
      // 直取格式必有 path（调用方已守卫）；显式短路让 node.path 收窄为 string，
      // 避免对 getFullPath(string) 传可空值
      if (!node.path) {
        ctx.errorCount++;
        ctx.errors.push({
          nodeId: node.id,
          fileName: label,
          error: 'File path is missing',
        });
        return;
      }
      const fullPath = this.fileDownloadExportService.getFullPath(node.path);
      if (!fs.existsSync(fullPath)) {
        ctx.errorCount++;
        ctx.errors.push({
          nodeId: node.id,
          fileName: label,
          error: 'Source file not found',
        });
        return;
      }
      // 源文件已是 .mxweb 时不再叠加后缀（与单文件 downloadNodeWithFormat 命名一致）
      const srcExt = path.extname(fileName).toLowerCase();
      const baseName =
        format === 'original' || srcExt === '.mxweb'
          ? fileName
          : `${fileName}.mxweb`;
      const sanitized = ctx.sanitizeZipName(prefix + baseName);
      ctx.archiveEntries.push({
        name: sanitized,
        stream: fs.createReadStream(fullPath),
        // 与转换产物（result.filePath）统一为绝对路径，单文件下载端点直接 fs 读取
        sourcePath: fullPath,
        temp: false,
      });
    } catch (err) {
      ctx.errorCount++;
      ctx.errors.push({
        nodeId: node.id,
        fileName: label,
        error: (err as Error).message,
      });
    }
  }

  private async tryConvert(
    node: BatchDownloadNode,
    fileName: string,
    ext: string,
    format: string,
    pdfParams: OutputFormatParams | undefined,
    prefix: string,
    label: string,
    ctx: JobContext
  ): Promise<void> {
    const result = await this.conversionRunner.convertFile(
      {
        id: node.id,
        fileHash: node.fileHash,
        path: node.path,
        name: fileName,
      },
      format,
      pdfParams,
      ctx.userId ?? undefined
    );
    if (result.success && result.filePath) {
      const baseName = `${path.basename(fileName, ext)}.${format}`;
      const sanitized = ctx.sanitizeZipName(prefix + baseName);
      ctx.archiveEntries.push({
        name: sanitized,
        stream: fs.createReadStream(result.filePath),
        sourcePath: result.filePath,
        temp: !isInUploadsCache(result.filePath, this.mxcadUploadPath),
      });
      ctx.convertedFiles.push(result.filePath);
    } else {
      ctx.errorCount++;
      ctx.errors.push({
        nodeId: node.id,
        fileName: label,
        error: result.error || 'Conversion failed',
      });
    }
  }
}
