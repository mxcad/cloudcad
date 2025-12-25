import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MxCadPermissionService } from './mxcad-permission.service';
import { FileUploadManagerService } from './services/file-upload-manager.service';
import { FileSystemNodeService } from './services/filesystem-node.service';
import { FileConversionService } from './services/file-conversion.service';

@Injectable()
export class MxCadService {
  private readonly logger = new Logger(MxCadService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly permissionService: MxCadPermissionService,
    private readonly fileUploadManager: FileUploadManagerService,
    private readonly fileSystemNodeService: FileSystemNodeService,
    private readonly fileConversionService: FileConversionService,
  ) {}

  /**
   * 检查分片是否存在
   */
  async checkChunkExist(
    chunk: number,
    fileHash: string,
    size: number,
    chunks: number,
    fileName: string,
    context?: any
  ): Promise<{ ret: string }> {
    return this.fileUploadManager.checkChunkExist({
      hash: fileHash,
      name: fileName,
      size,
      chunk,
      chunks,
      context: this.validateContext(context),
    });
  }

  /**
   * 检查文件是否存在
   */
  async checkFileExist(filename: string, fileHash: string, context?: any): Promise<{ ret: string }> {
    return this.fileUploadManager.checkFileExist(filename, fileHash, this.validateContext(context));
  }

  /**
   * 上传分片文件
   */
  async uploadChunk(
    hash: string,
    name: string,
    size: number,
    chunk: number,
    chunks: number,
    context?: any
  ): Promise<{ ret: string; tz?: boolean }> {
    return this.fileUploadManager.uploadChunk({
      hash,
      name,
      size,
      chunk,
      chunks,
      context: this.validateContext(context),
    });
  }

  /**
   * 上传完整文件并转换
   */
  async uploadAndConvertFile(
    filePath: string,
    hash: string,
    name: string,
    size: number
  ): Promise<{ ret: string; tz?: boolean }> {
    // 对于没有上下文的上传，创建一个默认上下文
    const context = await this.createDefaultContext();
    return this.fileUploadManager.uploadAndConvertFile({
      filePath,
      hash,
      name,
      size,
      context,
    });
  }

  /**
   * 转换服务器文件
   */
  async convertServerFile(param: any): Promise<any> {
    try {
      if (param.async === 'true' && param.resultposturl) {
        // 异步转换
        this.fileConversionService.convertFileAsync({
          srcPath: param.srcpath,
          fileHash: param.src_file_md5,
          createPreloadingData: true,
        }, param.resultposturl).then((taskId) => {
          // 这里应该发送回调，暂时省略
          this.logger.log(`异步转换完成: ${param.srcpath}, 任务ID: ${taskId}`);
        });
        return { code: 0, message: 'async calling' };
      } else {
        // 同步转换
        const { isOk, ret } = await this.fileConversionService.convertFile({
          srcPath: param.srcpath,
          fileHash: param.src_file_md5,
          createPreloadingData: true,
        });
        return isOk ? ret : { code: 12, message: 'param error' };
      }
    } catch (error) {
      this.logger.error(`转换服务器文件失败: ${error.message}`, error.stack);
      return { code: 12, message: 'param error' };
    }
  }

  /**
   * 检查图纸状态
   */
  async checkTzStatus(fileHash: string): Promise<{ code: number }> {
    // 这里应该实现 tz 状态检查逻辑，暂时返回成功
    return { code: 0 };
  }

  /**
   * 为 MxCAD-App 推断上下文信息
   */
  async inferContextForMxCadApp(fileHash: string, request: any): Promise<any> {
    return this.fileSystemNodeService.inferContextForMxCadApp(fileHash, request);
  }

  /**
   * 检查用户是否有项目访问权限
   */
  async checkProjectPermission(projectId: string, userId: string, userRole: string): Promise<boolean> {
    return this.fileSystemNodeService.checkProjectPermission(projectId, userId, userRole);
  }

  /**
   * 修改后的上传分片文件方法，添加权限验证
   */
  async uploadChunkWithPermission(
    hash: string,
    name: string,
    size: number,
    chunk: number,
    chunks: number,
    context?: any
  ): Promise<{ ret: string; tz?: boolean }> {
// 验证权限
    await this.permissionService.validateUploadPermission(context);

    const result = await this.fileUploadManager.uploadChunk({
      hash,
      name,
      size,
      chunk,
      chunks,
      context: this.validateContext(context),
    });
return result;
  }

  /**
   * 合并分片文件方法（用于完成请求）
   */
  async mergeChunksWithPermission(
    hash: string,
    name: string,
    size: number,
    chunks: number,
    context?: any
  ): Promise<{ ret: string; tz?: boolean }> {
// 验证权限
    await this.permissionService.validateUploadPermission(context);

    const result = await this.fileUploadManager.mergeChunksWithPermission({
      hash,
      name,
      size,
      chunks,
      context: this.validateContext(context),
    });
return result;
  }

  /**
   * 修改后的上传完整文件方法，添加权限验证和文件节点创建
   */
  async uploadAndConvertFileWithPermission(
    filePath: string,
    hash: string,
    name: string,
    size: number,
    context?: any
  ): Promise<{ ret: string; tz?: boolean }> {
    // 验证权限
    await this.permissionService.validateUploadPermission(context);

    return this.fileUploadManager.uploadAndConvertFileWithPermission({
      filePath,
      hash,
      name,
      size,
      context: this.validateContext(context),
    });
  }

  /**
   * 公共日志方法，供其他模块使用
   */
  logError(message: string, error?: any): void {
    this.logger.error(message, error);
  }

  logInfo(message: string): void {
    this.logger.log(message);
  }

  logWarn(message: string): void {
    this.logger.warn(message);
  }

  /**
   * 验证和标准化上下文
   */
  private validateContext(context: any): any {
    if (!context) {
      throw new Error('上下文参数不能为空');
    }

    // 确保必要的字段存在
    if (!context.userId) {
      throw new Error('上下文缺少用户ID');
    }

    if (!context.projectId) {
      throw new Error('上下文缺少项目ID');
    }

    return context;
  }

  /**
   * 创建默认上下文（用于没有上下文的操作）
   */
  private async createDefaultContext(): Promise<any> {
    // 这里可以创建一个默认的用户和项目上下文
    // 或者抛出异常要求必须提供上下文
    throw new Error('必须提供有效的上下文参数');
  }
}