import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FileDownloadExportService } from '../file-system/file-download/file-download-export.service';
import { ConversionRunner } from './conversion-runner';
import { JobContext } from './job-context';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BatchDownloadOrchestrator {
  private readonly logger = new Logger(BatchDownloadOrchestrator.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileDownloadExportService: FileDownloadExportService,
    private readonly conversionRunner: ConversionRunner
  ) {}

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
      const node = await this.prisma.fileSystemNode.findUnique({
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

      if (!node || node.nodeType !== 'FILE') {
        await ctx.recordError(
          item.nodeId,
          item.fileName,
          'Node not found or not a file'
        );
        continue;
      }

      if (!node.path) {
        await ctx.recordError(
          item.nodeId,
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

        if (format === 'original' || format === 'mxweb' || ext === '.mxweb') {
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
    const node = await this.prisma.fileSystemNode.findUnique({
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

    if (!node || node.nodeType !== 'FILE') {
      await ctx.recordError(
        item.nodeId,
        item.fileName,
        'Node not found or not a file'
      );
      return;
    }

    if (!node.path) {
      await ctx.recordError(item.nodeId, item.fileName, 'File path is missing');
      return;
    }

    const fileName = node.originalName || node.name;
    const ext = path.extname(fileName).toLowerCase();
    const prefix = item.relativePath ? `${item.relativePath}/` : '';
    const formats = ctx.getFormats(item, ext);

    for (const format of formats) {
      if (isTerminated()) break;
      const label = `${fileName} (${format})`;

      if (format === 'original' || format === 'mxweb' || ext === '.mxweb') {
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
      const baseName = format === 'original' ? fileName : `${fileName}.mxweb`;
      const sanitized = ctx.sanitizeZipName(prefix + baseName);
      ctx.archiveEntries.push({
        name: sanitized,
        stream: fs.createReadStream(fullPath),
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
      { id: node.id, fileHash: node.fileHash, path: node.path, name: fileName },
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
