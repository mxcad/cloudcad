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

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PublicFileUploadService } from './services/public-file-upload.service';
import { FileConversionService } from '../mxcad/conversion/file-conversion.service';
import { ConvertFileParamsDto } from './dto';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { RestrictionEngine } from '../vip/restriction-engine.service';
import { QuotaExceededException } from '../vip/errors/quota-exceeded.error';
import { PreloadingDataDto, PreloadingFileInfoDto } from '../mxcad/dto/preloading-data.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { I18nContext } from 'nestjs-i18n';
/**
 * 预加载数据结构（来自 _preloading.json 文件，原始 JSON 格式）
 */
export interface PreloadingData {
  /** 是否为图纸 */
  tz: boolean;
  /** 源文件 MD5 哈希值 */
  src_file_md5: string;
  /** 图片列表 */
  images: string[];
  /** 外部参照文件列表 */
  externalReference: string[];
}

/**
 * 公开文件服务
 * 提供无需认证的文件访问和外部参照功能
 */
@Injectable()
export class PublicFileService {
  private readonly logger = new Logger(PublicFileService.name);

  constructor(
    private readonly uploadService: PublicFileUploadService,
    private readonly databaseService: DatabaseService,
    private readonly storageManager: StorageManager,
    private readonly restrictionEngine: RestrictionEngine,
    private readonly fileConversionService: FileConversionService
  ) {}

  /**
   * 在 uploads 目录下扁平查找 mxweb 文件
   * 如 findMxwebFile("abc123") → uploads/abc123.dwg.mxweb
   * 如果 uploads 目录未找到，则通过 DB 查询 fileHash 匹配的节点，从存储路径读取
   */
  async findMxwebFile(hash: string): Promise<string | null> {
    const files = await this.uploadService.findFilesByPrefix(hash);
    const mxwebFile = files.find(
      (f) => f.startsWith(hash) && f.endsWith('.mxweb')
    );
    if (mxwebFile) {
      return path.join(this.uploadService.getUploadPath(), mxwebFile);
    }

    // 未在 uploads 目录找到，尝试查询 DB 中 fileHash 匹配的节点
    try {
      const node = await this.databaseService.fileSystemNode.findFirst({
        where: { fileHash: hash, deletedAt: null },
        select: { path: true },
      });

      if (node?.path) {
        const fullPath = this.storageManager.getFullPath(node.path);
        if (fullPath && fs.existsSync(fullPath)) {
          this.logger.log(`[findMxwebFile] 通过 DB 查询到文件: hash=${hash}, path=${fullPath}`);
          return fullPath;
        }
      }
    } catch (error) {
      this.logger.warn(`[findMxwebFile] DB 查询失败: ${error.message}`);
    }

    return null;
  }

  /**
   * 判断解析后的路径是否严格位于 uploads 目录内（防路径遍历）。
   * 公开端点的 hash/filename 来自 URL 参数：Windows 下反斜杠也是路径分隔符，
   * 仅靠 Express 路由参数不含 `/` 无法挡住 `..` / `..\` 形式的越界。
   * 必须带 path.sep 后缀比较，否则 uploads 的同名前缀兄弟目录（uploads-evil）会被误判为内部。
   */
  private isWithinUploadPath(targetPath: string): boolean {
    const base = path.resolve(this.uploadService.getUploadPath());
    return path.resolve(targetPath).startsWith(base + path.sep);
  }

  /**
   * 在 uploads/{hash} 目录下查找指定文件
   * 如 findFileInDir(hash, "A1.dwg.mxweb") 返回 uploads/{hash}/A1.dwg.mxweb
   */
  async findFileInDir(hash: string, filename: string): Promise<string | null> {
    const dirPath = path.join(this.uploadService.getUploadPath(), hash);
    const filePath = path.join(dirPath, filename);

    if (this.isWithinUploadPath(filePath) && fs.existsSync(filePath)) {
      return filePath;
    }

    // DWG/DXF 外部参照在磁盘上存储为 {filename}.mxweb
    const mxwebPath = path.join(dirPath, `${filename}.mxweb`);
    if (this.isWithinUploadPath(mxwebPath) && fs.existsSync(mxwebPath)) {
      return mxwebPath;
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
    fileHash?: string,
    ip?: string,
    userId?: string
  ): Promise<{ ret: string; hash?: string; message?: string }> {
    const logger = this.logger;

    if (!srcFileHash) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_source_hash') ?? '缺少源图纸哈希值');
    }

    if (!extRefFileName) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.missing_ref_filename') ?? '缺少外部参照文件名');
    }

    // 验证文件名安全性（防止路径遍历攻击）
    if (extRefFileName.includes('..') || extRefFileName.includes('/') || extRefFileName.includes('\\')) {
      throw new BadRequestException(I18nContext.current()?.t('error.file.name_contains_illegal_chars') ?? '文件名包含非法字符');
    }

    const ext = path.extname(extRefFileName).toLowerCase();
    const isDwgFile = ['.dwg', '.dxf'].includes(ext);
    const isImageFile = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext);

    if (!isDwgFile && !isImageFile) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.type_unsupported') ?? '不支持的文件类型');
    }

    let hash = fileHash;
    if (!hash) {
      hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
      logger.log(`[uploadExtReference] 后端计算 hash: ${hash}`);
    }

    const uploadPath = this.uploadService.getUploadPath();
    const srcDir = path.join(uploadPath, srcFileHash);

    // 确保目标目录在 uploads 路径下，防止路径遍历
    // 必须带 path.sep 后缀比较：uploads 的同名前缀兄弟目录（如 ../uploads-evil →
    // /data/uploads-evil）会被裸 startsWith 误判为内部，且下方 mkdirSync 会真建出来
    const resolvedSrcDir = path.resolve(srcDir);
    const resolvedUploadPath = path.resolve(uploadPath);
    if (!resolvedSrcDir.startsWith(resolvedUploadPath + path.sep)) {
      throw new BadRequestException(I18nContext.current()?.t('error.public_file.source_path_invalid') ?? '无效的源路径');
    }

    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
      logger.log(`[uploadExtReference] 创建源图纸目录: ${srcDir}`);
    }

    try {
      if (isDwgFile) {
        // 对于 DWG/DXF 文件，需要进行转换
        const tempFilePath = path.join(srcDir, extRefFileName);

        // 再次验证解析后的路径在预期目录内
        const resolvedTempPath = path.resolve(tempFilePath);
        if (!resolvedTempPath.startsWith(resolvedSrcDir)) {
          throw new BadRequestException(I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径');
        }

        // ADR-0043：转换频率限制占位——已登录用户按 userId，游客按 IP。
        // 占位在写临时文件之前：超限 403 时不落任何临时文件。
        if (userId) {
          await this.restrictionEngine.reserveConversionCountOrThrow(userId);
        } else if (ip) {
          await this.restrictionEngine.reserveGuestConversionCountOrThrow(ip);
        }

        try {
          await fs.promises.writeFile(tempFilePath, fileBuffer);

          // 调用转换服务将 DWG/DXF 转换为 MXWeb
          const { isOk, ret } = await this.fileConversionService.convertFile({
            srcPath: tempFilePath,
            fileHash: hash,
            createPreloadingData: true,
          });

          if (!isOk) {
            await this.releaseConversionReservation(ip, userId);
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
          await this.releaseConversionReservation(ip, userId);
          if (convertError instanceof QuotaExceededException) throw convertError;
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
        // 对于图片文件，直接保存
        const targetPath = path.join(srcDir, extRefFileName);

        // 再次验证解析后的路径在预期目录内
        const resolvedTargetPath = path.resolve(targetPath);
        if (!resolvedTargetPath.startsWith(resolvedSrcDir)) {
          throw new BadRequestException(I18nContext.current()?.t('error.mxcad.path_invalid') ?? '无效的文件路径');
        }

        await fs.promises.writeFile(targetPath, fileBuffer);

        logger.log(
          `[uploadExtReference] 外部参照文件上传成功: ${extRefFileName} -> ${targetPath}`
        );
      }
      return { ret: 'ok', hash };
    } catch (error) {
      if (error instanceof QuotaExceededException) throw error;
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

    // srcHash/fileName 来自公开查询参数且无格式校验，越界路径一律按不存在处理，
    // 否则 existsSync 成为任意文件存在性探测（oracle）
    if (!this.isWithinUploadPath(targetPath)) {
      return false;
    }
    return fs.existsSync(targetPath);
  }

  /**
   * 获取预加载数据（包含外部参照信息）
   * @param hash 文件 hash
   * @returns 预加载数据
   */
  async getPreloadingData(hash: string): Promise<PreloadingDataDto | null> {
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
          const rawData: PreloadingData = JSON.parse(content);

          this.logger.log(
            `[getPreloadingData] 从路径读取预加载数据: ${preloadingPath}`
          );

          // 外部参照文件存储在 uploads/{hash}/ 目录下
          const hashDir = path.join(uploadPath, hash);

          // 将原始字符串数组转为包含文件大小和类型的对象数组
          const externalReference = await this.enrichFileInfoList(
            rawData.externalReference,
            hashDir,
            'dwg'
          );
          const images = await this.enrichFileInfoList(
            rawData.images,
            hashDir,
            'image'
          );

          return {
            tz: rawData.tz,
            src_file_md5: rawData.src_file_md5,
            images,
            externalReference,
          };
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

  /**
   * 将文件名列表转为包含文件大小和类型的对象列表
   * @param fileNames 原始文件名列表
   * @param dirPath 文件所在目录路径
   * @param defaultType 默认文件类型
   */
  private async enrichFileInfoList(
    fileNames: string[],
    dirPath: string,
    defaultType: 'dwg' | 'image',
  ): Promise<PreloadingFileInfoDto[]> {
    if (!fileNames || fileNames.length === 0) return [];

    const results: PreloadingFileInfoDto[] = [];
    for (const name of fileNames) {
      let size = 0;
      let type = defaultType;

      const ext = path.extname(name).toLowerCase();
      const isDwgFile = ['.dwg', '.dxf'].includes(ext);
      const isImageFile = ['.png', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.bmp'].includes(ext);
      if (isDwgFile) type = 'dwg';
      else if (isImageFile) type = 'image';

      // DWG 文件需要 .mxweb 后缀
      const targetFileName = isDwgFile ? `${name}.mxweb` : name;
      const targetPath = path.join(dirPath, targetFileName);

      try {
        const stat = await fs.promises.stat(targetPath);
        size = stat.size;
      } catch {
        // 文件不存在时 size 保持 0
      }

      results.push({ name, size, type });
    }
    return results;
  }

  /**
   * 将 mxweb 文件转换为指定格式（公开接口，无需认证）
   * @param fileHash 已通过分片上传到 uploads 目录的 mxweb 文件 MD5
   * @param targetFormat 目标格式: dwg, dxf, pdf, mxweb
   * @param params 转换参数（可选）
   * @param ip 客户端 IP（游客转换频率限制，ADR-0043）
   * @param userId 可选认证用户（登录用户走 userId 计数，避免公开端点绕行 userId 限制）
   * @returns 转换后的文件 buffer 和元信息
   */
  async convertMxwebByHash(
    fileHash: string,
    targetFormat: string,
    params?: ConvertFileParamsDto,
    ip?: string,
    userId?: string,
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    if (!this.fileConversionService) {
      throw new Error('文件转换服务不可用');
    }

    const mxwebPath = await this.findMxwebFile(fileHash);
    if (!mxwebPath) {
      throw new NotFoundException(I18nContext.current()?.t('error.file_extra.file_not_exist_by_hash', { args: { hash: fileHash } }) ?? `文件不存在: ${fileHash}`);
    }

    if (targetFormat === 'mxweb') {
      const buffer = await fs.promises.readFile(mxwebPath);
      return {
        buffer,
        filename: `converted.mxweb`,
        mimeType: 'application/octet-stream',
      };
    }

    // ADR-0043：转换频率限制占位——已登录用户按 userId，游客按 IP，超限直接 403。
    // 导出下载方向（mxweb → 其他格式）会员门控由转换服务按源文件类型自动执行（含游客）。
    if (userId) {
      await this.restrictionEngine.reserveConversionCountOrThrow(userId);
    } else if (ip) {
      await this.restrictionEngine.reserveGuestConversionCountOrThrow(ip);
    }

    const timestamp = Date.now();
    const outname = `${fileHash}_${timestamp}.${targetFormat}`;
    const uploadPath = this.uploadService.getUploadPath();
    let outputFile: string | undefined;

    this.logger.log(`[convertMxwebByHash] params?.colorPolicy: ${params?.colorPolicy}, all keys: ${Object.keys(params || {})}`);

    try {
      const result = await this.fileConversionService.convertFile({
        srcPath: mxwebPath,
        fileHash,
        userId,
        createPreloadingData: false,
        outname,
        cmd: params?.cmd,
        width: params?.width,
        height: params?.height,
        colorPolicy: params?.colorPolicy,
        roate_angle: params?.roate_angle,
        view_angle: params?.view_angle,
        bd_pt1_x: params?.bd_pt1_x,
        bd_pt1_y: params?.bd_pt1_y,
        bd_pt2_x: params?.bd_pt2_x,
        bd_pt2_y: params?.bd_pt2_y,
        open_file_md5: params?.open_file_md5,
        layout_name: params?.layout_name,
        create_clip_block: params?.create_clip_block,
        dwgVersion: params?.dwgVersion,
      });

      if (!result.isOk) {
        throw new Error(
          `文件转换失败: ${result.ret?.message || '未知错误'}`
        );
      }

      // mxcadassembly.exe 将输出文件写到源文件同目录
      outputFile = path.join(uploadPath, outname);
      if (!fs.existsSync(outputFile)) {
        throw new Error('转换后的文件未生成');
      }

      const convertedBuffer = await fs.promises.readFile(outputFile);

      const mimeTypes: Record<string, string> = {
        dwg: 'application/acad',
        dxf: 'application/dxf',
        pdf: 'application/pdf',
      };

      this.logger.log(
        `[convertMxwebByHash] 转换成功: ${targetFormat}, hash=${fileHash}, 大小: ${convertedBuffer.length} bytes`
      );

      return {
        buffer: convertedBuffer,
        filename: `converted.${targetFormat}`,
        mimeType: mimeTypes[targetFormat] || 'application/octet-stream',
      };
    } catch (error) {
      await this.releaseConversionReservation(ip, userId);
      throw error;
    } finally {
      try {
        if (outputFile && fs.existsSync(outputFile)) {
          await fs.promises.unlink(outputFile);
        }
      } catch (e) {
        this.logger.warn(`[convertMxwebByHash] 清理临时文件失败: ${e.message}`);
      }
    }
  }

  /**
   * 释放本次转换的频率限制占位：登录用户按 userId，游客按 IP（ADR-0043）。
   */
  private async releaseConversionReservation(
    ip?: string,
    userId?: string
  ): Promise<void> {
    if (userId) {
      await this.restrictionEngine
        .releaseConversionCount(userId)
        .catch(() => undefined);
    } else if (ip) {
      await this.restrictionEngine
        .releaseGuestConversionCount(ip)
        .catch(() => undefined);
    }
  }
}
