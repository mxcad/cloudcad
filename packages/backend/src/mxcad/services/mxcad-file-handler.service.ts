import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { DatabaseService } from '../../database/database.service';
import * as path from 'path';
import * as fs from 'fs';

/**
 * MxCAD 文件处理服务
 * 
 * 统一处理项目文件、图纸库、图块库的文件访问请求
 * 支持 mxweb 文件和外部参照文件的访问
 */
@Injectable()
export class MxcadFileHandlerService {
  private readonly logger = new Logger(MxcadFileHandlerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * 统一处理文件访问请求
   * @param filename 文件路径（格式：YYYYMM/nodeId/fileHash.dwg.mxweb 或 YYYYMM/nodeId/fileHash/image.jpg）
   * @param res Express Response 对象
   */
  async serveFile(filename: string, res: Response): Promise<void> {
    try {
      this.logger.log(`
----------------------------------------
[serveFile] 处理文件请求
- 文件路径: ${filename}
- 时间: ${new Date().toISOString()}
----------------------------------------
      `);

      const filesDataPath = this.configService.get('filesDataPath', { infer: true });
      const absoluteFilePath = path.resolve(filesDataPath, filename);

      this.logger.log(`[serveFile] 绝对路径: ${absoluteFilePath}`);

      // 文件存在，直接返回
      if (fs.existsSync(absoluteFilePath)) {
        this.logger.log(`[serveFile] 文件存在: ${absoluteFilePath}`);
        const fileStats = fs.statSync(absoluteFilePath);
        this.logger.log(`[serveFile] 文件大小: ${fileStats.size} bytes`);
        return this.streamFile(absoluteFilePath, res);
      }

      // 文件不存在，尝试外部参照路径 {dir}/{fileHash}/{fileName}
      this.logger.warn(`[serveFile] 文件不存在，尝试查找外部参照: ${filename}`);
      const extRefPath = await this.findExternalReferencePath(filename);

      if (extRefPath) {
        this.logger.log(`[serveFile] 找到外部参照文件: ${extRefPath}`);
        return this.streamFile(extRefPath, res);
      }

      this.logger.error(`[serveFile] 文件不存在: ${absoluteFilePath}`);
      throw new NotFoundException('文件不存在');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorStatus = (error as { status?: number }).status;
      const errorStatusCode = (error as { statusCode?: number }).statusCode;
      const errorResponse = (error as { response?: { error?: string } }).response;

      this.logger.error(`[serveFile] 处理失败: ${errorMessage}`, errorStack);
      if (!res.headersSent) {
        const status = errorStatus || errorStatusCode || 500;
        res.status(status).json({
          message: errorMessage || '获取文件失败',
          error: errorResponse?.error || 'Internal Server Error',
        });
      }
    }
  }

  /**
   * 查找外部参照文件路径
   * @param filename 请求的文件路径
   * @returns 外部参照文件路径，如果不存在则返回 null
   */
  private async findExternalReferencePath(filename: string): Promise<string | null> {
    try {
      // 解析路径：YYYYMM/{nodeId}/...
      const parts = filename.split('/');
      if (parts.length < 2) {
        return null;
      }

      const nodeId = parts[1];
      
      // 获取节点的 fileHash
      const node = await this.db.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { fileHash: true },
      });

      if (!node?.fileHash) {
        return null;
      }

      // 构建外部参照路径：{dir}/{fileHash}/{fileName}
      const dir = path.dirname(filename);
      const extRefPath = path.join(dir, node.fileHash, path.basename(filename));
      
      const filesDataPath = this.configService.get('filesDataPath', { infer: true });
      const fullPath = path.resolve(filesDataPath, extRefPath);

      // 检查外部参照文件是否存在
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }

      return null;
    } catch (error) {
      this.logger.error(`[findExternalReferencePath] 查找失败：${error.message}`);
      return null;
    }
  }

  /**
   * 流式传输文件
   * @param filePath 文件绝对路径
   * @param res Express Response 对象
   */
  private streamFile(filePath: string, res: Response): void {
    const fileStats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    // 设置 Content-Type
    const contentTypes: Record<string, string> = {
      '.mxweb': 'application/octet-stream',
      '.dwg': 'application/acad',
      '.dxf': 'application/dxf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    // 设置响应头
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileStats.size);
    // 禁用缓存，确保每次请求都获取最新文件
    // 特别是对于图纸库/图块库文件，用户可能刚刚保存并需要立即使用
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问
    // 对文件名进行编码，避免中文等非 ASCII 字符导致的响应头错误
    const encodedFilename = encodeURIComponent(path.basename(filePath));
    res.setHeader('Content-Disposition', `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);

    // 创建文件流并返回
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // 监听流错误
    fileStream.on('error', (error: Error) => {
      this.logger.error(`[streamFile] 文件流错误：${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: '文件读取失败' });
      }
    });

    this.logger.log(`[streamFile] 开始传输文件：${filePath}`);
  }
}
