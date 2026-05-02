import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { DatabaseService } from '../../database/database.service';
import { FileSystemService } from '../../file-system/file-system.service';
import { FileSystemNodeService } from './filesystem-node.service';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

/**
 * 外部参照处理服务
 * 
 * 负责处理项目文件和图纸库的外部参照文件访问请求
 * 提供统一的外部参照文件读取和流式传输逻辑
 */
@Injectable()
export class ExternalReferenceHandler {
  private readonly logger = new Logger(ExternalReferenceHandler.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly fileSystemService: FileSystemService,
    private readonly fileSystemNodeService: FileSystemNodeService
  ) {}

  /**
   * 处理外部参照文件请求
   * 
   * @param nodeId 节点 ID
   * @param fileName 外部参照文件名
   * @param res Express Response 对象
   * @param isLibrary 是否为图纸库（true=图纸库无需登录，false=项目文件需要登录验证）
   * @param userId 用户 ID（项目文件访问时必需）
   */
  async handleExternalReferenceRequest(
    nodeId: string,
    fileName: string,
    res: Response,
    isLibrary: boolean = false,
    userId?: string
  ): Promise<void> {
    try {
      this.logger.log(
        `[handleExternalReferenceRequest] 开始处理：nodeId=${nodeId}, fileName=${fileName}, isLibrary=${isLibrary}`
      );

      // 1. 获取节点信息
      const node = await this.getNodeInfo(nodeId, isLibrary, userId);

      if (!node) {
        throw new NotFoundException('节点不存在');
      }

      if (node.isFolder) {
        throw new BadRequestException('该节点是文件夹，不是文件');
      }

      // 2. 验证 fileHash 存在
      if (!node.fileHash) {
        this.logger.error(
          `[handleExternalReferenceRequest] node.fileHash 为空：nodeId=${nodeId}`
        );
        throw new BadRequestException('文件尚未转换完成');
      }

      // 3. 获取外部参照目录名称（从 preloading.json 中提取 src_file_md5）
      // preloading.json 文件命名：{nodeId}.dwg.mxweb_preloading.json
      const filesDataPath = this.configService.get('filesDataPath', { infer: true });
      const storageRootPath = path.resolve(filesDataPath, node.path, '..');
      const preloadingFilePath = path.join(
        storageRootPath,
        `${nodeId}.dwg.mxweb_preloading.json`
      );

      let externalRefDirName: string;
      try {
        const preloadingData = JSON.parse(
          await fsPromises.readFile(preloadingFilePath, 'utf-8')
        );
        externalRefDirName = preloadingData.src_file_md5;
        if (!externalRefDirName) {
          this.logger.error(
            `[handleExternalReferenceRequest] preloading.json 中没有 src_file_md5 字段：${preloadingFilePath}`
          );
          // 降级使用 nodeId 作为目录名
          externalRefDirName = nodeId;
        }
      } catch (readError: unknown) {
        this.logger.error(
          `[handleExternalReferenceRequest] 读取 preloading.json 失败：${(readError as Error).message}`
        );
        // 降级使用 nodeId 作为目录名
        externalRefDirName = nodeId;
      }

      // 4. 构建外部参照文件路径
      // 外部参照文件可能存储在两个位置：
      // 1. {storageRootPath}/{externalRefDirName}/{fileName} (标准结构)
      // 2. {storageRootPath}/{fileName} (扁平结构，外部参照和源文件在同一目录)
      let externalRefFilePath = path.join(
        storageRootPath,
        externalRefDirName,
        fileName
      );

      // 如果标准路径不存在，尝试扁平结构
      if (!fs.existsSync(externalRefFilePath)) {
        externalRefFilePath = path.join(storageRootPath, fileName);
        this.logger.log(
          `[handleExternalReferenceRequest] 标准路径不存在，尝试扁平结构：${externalRefFilePath}`
        );
      }

      this.logger.log(
        `[handleExternalReferenceRequest] 访问文件：${externalRefFilePath}`
      );

      // 5. 检查文件是否存在
      if (!fs.existsSync(externalRefFilePath)) {
        this.logger.error(
          `[handleExternalReferenceRequest] 文件不存在：${externalRefFilePath}`
        );
        throw new NotFoundException('外部参照文件不存在');
      }

      // 6. 返回文件流
      await this.streamFile(externalRefFilePath, fileName, res);

      this.logger.log(
        `[handleExternalReferenceRequest] 成功返回文件：${externalRefFilePath}`
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorStatus = (error as { status?: number }).status;
      const errorStatusCode = (error as { statusCode?: number }).statusCode;
      const errorResponse = (error as { response?: { error?: string } }).response;

      this.logger.error(
        `[handleExternalReferenceRequest] 获取文件失败：${errorMessage}`,
        errorStack
      );
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
   * 获取节点信息
   * 
   * @param identifier 节点 ID 或 fileHash
   * @param isLibrary 是否为图纸库
   * @param userId 用户 ID（项目文件访问时必需）
   * @private
   */
  private async getNodeInfo(
    identifier: string,
    isLibrary: boolean,
    userId?: string
  ): Promise<{
    id: string;
    path: string;
    fileHash: string;
    isFolder: boolean;
  } | null> {
    // 首先尝试作为 nodeId 查找
    let node = await this.db.fileSystemNode.findUnique({
      where: { id: identifier },
      select: {
        id: true,
        path: true,
        fileHash: true,
        isFolder: true,
      },
    });

    // 如果找不到，尝试作为 fileHash 查找（MxCAD 可能使用 fileHash 请求外部参照）
    if (!node) {
      this.logger.log(
        `[getNodeInfo] 未找到 nodeId=${identifier}，尝试作为 fileHash 查找`
      );
      node = await this.fileSystemNodeService.findByFileHash(identifier);
      if (node) {
        this.logger.log(
          `[getNodeInfo] 通过 fileHash 找到节点：id=${node.id}, fileHash=${identifier}`
        );
      }
    }

    return node;
  }

  /**
   * 流式传输文件
   * 
   * @param filePath 文件绝对路径
   * @param fileName 文件名（用于 Content-Disposition）
   * @param res Express Response 对象
   * @private
   */
  private async streamFile(
    filePath: string,
    fileName: string,
    res: Response
  ): Promise<void> {
    // 获取文件信息
    const fileStats = fs.statSync(filePath);
    const ext = path.extname(fileName).toLowerCase();
    const contentType = this.getContentType(ext);

    // 设置响应头
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', fileStats.size);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存 1 小时
    res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问

    // 创建文件流并返回
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // 监听流错误
    fileStream.on('error', (error: Error) => {
      this.logger.error(`文件流错误：${error.message}`, error);
      if (!res.headersSent) {
        res.status(500).json({ message: '文件读取失败' });
      }
    });
  }

  /**
   * 获取文件 Content-Type
   * 
   * @param ext 文件扩展名
   * @private
   */
  private getContentType(ext: string): string {
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.dwg': 'application/acad',
      '.dxf': 'application/dxf',
      '.mxweb': 'application/octet-stream',
    };
    return contentTypes[ext] || 'application/octet-stream';
  }
}
