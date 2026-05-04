///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import {
  CheckChunkDto,
  MergeChunksDto,
  CheckFileDto,
  CheckChunkResponseDto,
  UploadChunkResponseDto,
  MergeCompleteResponseDto,
  CheckFileResponseDto,
} from './dto';
import { PublicFileUploadService } from './services/public-file-upload.service';
import { FileConversionService } from '../mxcad/conversion/file-conversion.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * 公开文件服务
 * 提供无需认证的文件上传和访问功能
 */
@Injectable()
export class PublicFileService {
  private readonly logger = new Logger(PublicFileService.name);

  constructor(
    private readonly uploadService: PublicFileUploadService,
    @Optional() private readonly fileConversionService?: FileConversionService
  ) {}

  /**
   * 检查分片是否存在
   */
  async checkChunk(dto: CheckChunkDto): Promise<CheckChunkResponseDto> {
    const exist = await this.uploadService.checkChunkExists(dto);
    return { exist };
  }

  /**
   * 保存分片文件到临时目录
   * 手动处理文件保存，避免 Multer 解析顺序问题
   */
  async saveChunk(
    fileBuffer: Buffer,
    hash: string,
    chunkIndex: number
  ): Promise<void> {
    const chunkDir = this.uploadService.getChunkTempDirPath(hash);
    const chunkFilename = `${chunkIndex}_${hash}`;
    const chunkPath = path.join(chunkDir, chunkFilename);

    // 确保目录存在
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
      this.logger.log(`创建分片目录: ${chunkDir}`);
    }

    // 写入分片文件
    await fs.promises.writeFile(chunkPath, fileBuffer);
    this.logger.log(`分片已保存: ${chunkPath}`);
  }

  /**
   * 检查文件是否已存在（秒传检查）
   * 如果文件已存在，返回文件哈希
   */
  async checkFile(dto: CheckFileDto): Promise<CheckFileResponseDto> {
    const { filename, fileHash } = dto;
    const { exist, mxwebPath } = await this.uploadService.checkFileExist(
      filename,
      fileHash
    );

    if (exist && mxwebPath) {
      this.logger.log(
        `[checkFile] 秒传成功: filename=${filename}, hash=${fileHash}`
      );

      return {
        exist: true,
        hash: fileHash,
        fileName: filename,
      };
    }

    return { exist: false };
  }

  /**
   * 合并分片并返回文件访问信息
   */
  async mergeChunks(dto: MergeChunksDto): Promise<MergeCompleteResponseDto> {
    const { hash, fileName } = await this.uploadService.mergeChunks(dto);

    return {
      ret: 'success',
      hash,
      fileName,
    };
  }

  /**
   * 根据 hash 在 uploads 目录中查找 mxweb 文件
   * 查找模式: {hash}.{原扩展名}.mxweb （如 4b298dd48355af1202b532fc4d051658.dwg.mxweb）
   */
  async findMxwebFile(hash: string): Promise<string | null> {
    const files = await this.uploadService.findFilesByPrefix(hash);
    const mxwebFile = files.find(
      (f) => f.startsWith(hash) && f.endsWith('.mxweb')
    );
    return mxwebFile ? this.uploadService.getFilePath(mxwebFile) : null;
  }

  /**
   * 在 uploads/{hash} 目录下查找指定文件
   * 如 findFileInDir(hash, "A1.dwg.mxweb") 返回 uploads/{hash}/A1.dwg.mxweb
   */
  async findFileInDir(hash: string, filename: string): Promise<string | null> {
    const dirPath = path.join(this.uploadService.getUploadPath(), hash);
    const filePath = path.join(dirPath, filename);

    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return null;
  }

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<Buffer> {
    return this.uploadService.readFile(filePath);
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<void> {
    return this.uploadService.deleteFile(filePath);
  }

  /**
   * 上传外部参照文件（公开接口，无需认证）
   * 外部参照文件存储在主图纸的 hash 目录下
   * @param fileBuffer 文件内容
   * @param srcFileHash 主图纸文件的 hash
   * @param extRefFileName 外部参照文件名（含扩展名）
   * @param fileHash 文件哈希值（可选）
   * @returns 上传结果
   */
  async uploadExtReference(
    fileBuffer: Buffer,
    srcFileHash: string,
    extRefFileName: string,
    fileHash?: string
  ): Promise<{ ret: string; hash?: string; message?: string }> {
    const logger = this.logger;

    if (!srcFileHash) {
      throw new BadRequestException('缺少源图纸哈希值');
    }

    if (!extRefFileName) {
      throw new BadRequestException('缺少外部参照文件名');
    }

    const ext = path.extname(extRefFileName).toLowerCase();
    const isDwgFile = ['.dwg', '.dxf'].includes(ext);

    let hash = fileHash;
    if (!hash) {
      hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
      logger.log(`[uploadExtReference] 后端计算 hash: ${hash}`);
    }

    const uploadPath = this.uploadService.getUploadPath();
    const srcDir = path.join(uploadPath, srcFileHash);

    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
      logger.log(`[uploadExtReference] 创建源图纸目录: ${srcDir}`);
    }

    try {
      if (isDwgFile) {
        // 对于 DWG/DXF 文件，需要进行转换
        const tempFilePath = path.join(srcDir, extRefFileName);
        await fs.promises.writeFile(tempFilePath, fileBuffer);

        try {
          // 调用转换服务将 DWG/DXF 转换为 MXWeb
          const { isOk, ret } = await this.fileConversionService.convertFile({
            srcPath: tempFilePath,
            fileHash: hash,
            createPreloadingData: true,
          });

          if (!isOk) {
            // 转换失败时，删除临时文件
            if (fs.existsSync(tempFilePath)) {
              await fs.promises.unlink(tempFilePath);
            }
            return {
              ret: 'failed',
              message: `文件转换失败: ${ret?.message || '未知错误'}`,
            };
          }

          // 转换成功后删除临时文件
          await fs.promises.unlink(tempFilePath);

          // 转换工具在原始文件旁边生成 {originalName}.mxweb，如: {hash}.dwg -> {hash}.dwg.mxweb
          const targetPath = tempFilePath + '.mxweb';

          logger.log(
            `[uploadExtReference] 外部参照文件上传并转换成功: ${extRefFileName} -> ${targetPath}`
          );
        } catch (convertError) {
          logger.error(
            `[uploadExtReference] 转换文件失败: ${convertError.message}`,
            convertError.stack
          );
          // 转换失败时，删除临时文件
          if (fs.existsSync(tempFilePath)) {
            await fs.promises.unlink(tempFilePath);
          }
          return {
            ret: 'failed',
            message: `文件转换失败: ${convertError.message}`,
          };
        }
      } else {
        // 对于非 DWG/DXF 文件，直接保存
        const targetPath = path.join(srcDir, extRefFileName);
        await fs.promises.writeFile(targetPath, fileBuffer);

        logger.log(
          `[uploadExtReference] 外部参照文件上传成功: ${extRefFileName} -> ${targetPath}`
        );
      }
      return { ret: 'ok', hash };
    } catch (error) {
      logger.error(
        `[uploadExtReference] 处理文件失败: ${error.message}`,
        error.stack
      );
      return { ret: 'failed', message: error.message };
    }
  }

  /**
   * 检查外部参照文件是否存在
   * @param srcFileHash 主图纸文件的 hash
   * @param extRefFileName 外部参照文件名
   * @returns 是否存在
   */
  async checkExtReferenceExists(
    srcFileHash: string,
    extRefFileName: string
  ): Promise<boolean> {
    const uploadPath = this.uploadService.getUploadPath();
    const srcDir = path.join(uploadPath, srcFileHash);

    const ext = path.extname(extRefFileName).toLowerCase();
    const isDwgFile = ['.dwg', '.dxf'].includes(ext);

    let targetPath: string;
    if (isDwgFile) {
      targetPath = path.join(srcDir, `${extRefFileName}.mxweb`);
    } else {
      targetPath = path.join(srcDir, extRefFileName);
    }

    return fs.existsSync(targetPath);
  }

  /**
   * 获取预加载数据（包含外部参照信息）
   * @param hash 文件 hash
   * @returns 预加载数据
   */
  async getPreloadingData(hash: string): Promise<any> {
    const uploadPath = this.uploadService.getUploadPath();

    try {
      // 查找 uploads 目录中以 hash 开头的 mxweb 文件
      const files = await this.uploadService.findFilesByPrefix(hash);
      const mxwebFile = files.find(
        (f) => f.startsWith(hash) && f.endsWith('.mxweb')
      );

      if (mxwebFile) {
        // 构造预加载数据文件名：{mxweb文件名}_preloading.json
        const preloadingFilename = `${mxwebFile}_preloading.json`;
        const preloadingPath = path.join(uploadPath, preloadingFilename);

        if (fs.existsSync(preloadingPath)) {
          const content = await fs.promises.readFile(preloadingPath, 'utf8');
          this.logger.log(
            `[getPreloadingData] 从路径读取预加载数据: ${preloadingPath}`
          );
          return JSON.parse(content);
        } else {
          this.logger.log(
            `[getPreloadingData] 预加载文件不存在: ${preloadingPath}`
          );
        }
      } else {
        this.logger.log(`[getPreloadingData] 未找到 mxweb 文件，hash: ${hash}`);
      }
    } catch (error) {
      this.logger.error(
        `[getPreloadingData] 查找预加载数据失败: ${error.message}`
      );
    }

    return null;
  }
}
