import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import { ConversionRunner } from './conversion-runner';
import { JobContext } from './job-context';
import { isInUploadsCache } from './upload-cache.util';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BatchDownloadOrchestrator {
  private readonly logger = new Logger(BatchDownloadOrchestrator.name);
  private readonly mxcadUploadPath: string;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileDownloadExportService: FileDownloadExportService,
    private readonly conversionRunner: ConversionRunner,
    private readonly configService: ConfigService
  ) {
    this.mxcadUploadPath =
      this.configService.get<string>('mxcadUploadPath') || '';
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
      node: any;
      fileName: string;
      ext: string;
      prefix: string;
      label: string;
      format: string;
      pdfParams?: {
        width?: string;
        height?: string;
        colorPolicy?: string;
        dwgVersion?: number;
      };
    }> = [];

    for (const item of ctx.expandedItems) {
      if (isTerminated()) return;
      // fileHash-only 项（CAD 编辑器内存导出）：无 DB 节点，构造合成节点
      //（path 缺失，源文件由 conversion-runner 按 fileHash 解析）
      let node: any;
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
            // 转换缓存 key 的失效维度（节点更新→缓存失效，ADR-0060）
            updatedAt: true,
          },
        });
      }

      if (!node || node.nodeType !== 'FILE') {
        await ctx.recordError(
          item.nodeId ?? item.fileHash,
          item.fileName,
          'Node not found or not a file'
        );
        continue;
      }

      // fileHash-only 项源文件由 conversion-runner 按 fileHash 解析，跳过 path 校验
      if (!isFileHashItem && !node.path) {
        await ctx.recordError(
          item.nodeId ?? item.fileHash,
          item.fileName,
          'File path is missing'
        );
        continue;
      }

      const fileName = node.originalName || node.name;
      const ext = path.extname(fileName).toLowerCase();
      const prefix = item.relativePath ? `${item.relativePath}/` : '';
      const formats = ctx.getFormats(item, ext);

      for (const format of formats) {
        if (isTerminated()) break;
        const label = `${fileName} (${format})`;

        // 路由只看请求格式、不看源文件 ext：mxweb 源 + dwg/dxf/pdf 必须走转换
        // （快照最新 mxweb → 排队转换，与单文件 downloadNodeWithFormat 一致）；
        // 仅 original/mxweb 格式直取源文件。fileHash-only 项恒转换（源恒 .mxweb、请求恒 dwg/dxf/pdf）
        if (!isFileHashItem && (format === 'original' || format === 'mxweb')) {
          await this.tryAddOriginal(node, format, fileName, prefix, label, ctx);
          ctx.completedCount++;
        } else {
          const pdfParams =
            format === 'pdf'
              ? {
                  width: item.width || '2000',
                  height: item.height || '2000',
                  colorPolicy: item.colorPolicy || 'mono',
                }
              : (format === 'dwg' || format === 'dxf') && item.dwgVersion
                ? { dwgVersion: item.dwgVersion }
                : undefined;
          pending.push({
            node,
            fileName,
            ext,
            prefix,
            label,
            format,
            pdfParams,
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
    item: any,
    ctx: JobContext,
    isTerminated: () => boolean
  ): Promise<void> {
    // fileHash-only 项（CAD 编辑器内存导出）：无 DB 节点，构造合成节点
    //（path 缺失，源文件由 conversion-runner 按 fileHash 解析）
    let node: any;
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
      await ctx.recordError(
        item.nodeId ?? item.fileHash,
        item.fileName,
        'Node not found or not a file'
      );
      return;
    }

    // fileHash-only 项源文件由 conversion-runner 按 fileHash 解析，跳过 path 校验
    if (!isFileHashItem && !node.path) {
      await ctx.recordError(
        item.nodeId ?? item.fileHash,
        item.fileName,
        'File path is missing'
      );
      return;
    }

    const fileName = node.originalName || node.name;
    const ext = path.extname(fileName).toLowerCase();
    const prefix = item.relativePath ? `${item.relativePath}/` : '';
    const formats = ctx.getFormats(item, ext);

    for (const format of formats) {
      if (isTerminated()) break;
      const label = `${fileName} (${format})`;

      // 路由只看请求格式、不看源文件 ext：mxweb 源 + dwg/dxf/pdf 必须走转换
      // （快照最新 mxweb → 排队转换，与单文件 downloadNodeWithFormat 一致）；
      // 仅 original/mxweb 格式直取源文件。fileHash-only 项恒转换（源恒 .mxweb、请求恒 dwg/dxf/pdf）
      if (!isFileHashItem && (format === 'original' || format === 'mxweb')) {
        await this.tryAddOriginal(node, format, fileName, prefix, label, ctx);
      } else {
        await this.tryConvert(
          node,
          fileName,
          ext,
          format,
          item,
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

  private async tryAddOriginal(
    node: any,
    format: string,
    fileName: string,
    prefix: string,
    label: string,
    ctx: JobContext
  ): Promise<void> {
    try {
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
    node: any,
    fileName: string,
    ext: string,
    format: string,
    item: any,
    prefix: string,
    label: string,
    ctx: JobContext
  ): Promise<void> {
    const pdfParams =
      format === 'pdf'
        ? {
            width: item.width || '2000',
            height: item.height || '2000',
            colorPolicy: item.colorPolicy || 'mono',
          }
        : (format === 'dwg' || format === 'dxf') && item.dwgVersion
          ? { dwgVersion: item.dwgVersion }
          : undefined;
    const result = await this.conversionRunner.convertFile(
      {
        id: node.id,
        fileHash: node.fileHash,
        path: node.path,
        name: fileName,
        updatedAt: node.updatedAt,
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
