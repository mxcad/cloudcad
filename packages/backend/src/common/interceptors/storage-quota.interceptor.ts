///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { QuotaEnforcementService } from '../../file-system/storage-quota/quota-enforcement.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';

/**
 * 拦截器处理的上传请求类型（Multer 扩展后的 Express Request）
 */
type MulterRequest = Request & {
  file?: Express.Multer.File;
  files?:
    | Express.Multer.File[]
    | Record<string, Express.Multer.File[]>;
};

/**
 * 存储配额拦截器
 * 在文件上传前检查用户配额是否充足
 */
@Injectable()
export class StorageQuotaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(StorageQuotaInterceptor.name);

  constructor(
    private readonly quotaEnforcementService: QuotaEnforcementService,
    private readonly runtimeConfigService: RuntimeConfigService
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const ct = request.headers['content-type'];
    if (ct?.includes('multipart/form-data')) {
      this.logger.log(
        `Content-Type: ${ct}, Content-Length: ${request.headers['content-length']}`
      );
    }
    const user = request.user;

    // 仅对已认证用户进行检查
    if (!user || !user.id) {
      return next.handle();
    }

    // 跳过配额查询接口本身
    const url = request.url;
    if (url.includes('/storage/quota') || url.includes('/storage-info')) {
      return next.handle();
    }

    // 检查是否启用配额强制检查
    const enforceQuota = await this.runtimeConfigService.getValue(
      'enforceStorageQuota',
      true
    );

    // 如果未启用强制检查，仅记录日志
    if (!enforceQuota) {
      this.logger.debug('配额强制检查已禁用');
      return next.handle();
    }

    // 获取文件大小和父节点 ID
    const fileSize = this.extractFileSize(request);
    const parentNodeId = this.extractParentNodeId(request);

    // 如果无法获取必要信息，记录原因并跳过检查
    const isWriteMethod = ['POST', 'PUT', 'PATCH'].includes(request.method);

    if (!fileSize) {
      const msg = `跳过配额检查: 无法获取文件大小, url=${url}, method=${request.method}`;
      if (isWriteMethod) {
        this.logger.warn(msg);
      } else {
        this.logger.debug(msg);
      }
      return next.handle();
    }

    if (!parentNodeId) {
      const msg = `跳过配额检查: 无法获取父节点ID, url=${url}, method=${request.method}`;
      if (isWriteMethod) {
        this.logger.warn(msg);
      } else {
        this.logger.debug(msg);
      }
      return next.handle();
    }

    // 执行配额检查
    try {
      await this.quotaEnforcementService.checkUploadQuota(
        user.id,
        parentNodeId,
        fileSize
      );
      this.logger.debug(
        `配额检查通过: userId=${user.id}, nodeId=${parentNodeId}, size=${fileSize}`
      );
    } catch (error) {
      // 配额不足，直接抛出异常
      if (error.response?.code === 'QUOTA_EXCEEDED') {
        throw error;
      }
      // 其他错误不阻断上传，但记录警告
      this.logger.warn(
        `配额检查异常: ${error.message}, userId=${user.id}, nodeId=${parentNodeId}`
      );
    }

    return next.handle();
  }

  /**
   * 从请求中提取文件大小
   * 支持多种上传方式：Multer 单文件/多文件、Base64、分片上传等
   */
  private extractFileSize(request: MulterRequest): number | null {
    // 1. Multer 单文件上传
    if (request.file?.size) {
      return request.file.size;
    }

    // 2. Multer 多文件上传（数组形式）
    if (request.files && Array.isArray(request.files)) {
      return request.files.reduce(
        (sum: number, file: Express.Multer.File) => sum + (file?.size || 0),
        0
      );
    }

    // 3. Multer 多文件上传（对象形式，如 { field1: [file1, file2], field2: [file3] }）
    if (request.files && typeof request.files === 'object') {
      let totalSize = 0;
      for (const field of Object.values(request.files)) {
        if (Array.isArray(field)) {
          totalSize += field.reduce(
            (sum: number, file: Express.Multer.File) => sum + (file?.size || 0),
            0
          );
        }
      }
      if (totalSize > 0) {
        return totalSize;
      }
    }

    // 4. Body 中的文件大小（Base64 上传、MxCad 上传等）
    if (request.body?.fileSize) {
      const size = Number(request.body.fileSize);
      if (!isNaN(size) && size > 0) {
        return size;
      }
    }

    // 5. Body 中的文件大小（分片上传）
    if (request.body?.size) {
      const size = Number(request.body.size);
      if (!isNaN(size) && size > 0) {
        return size;
      }
    }

    // 6. Body 中的总大小字段
    if (request.body?.totalSize) {
      const size = Number(request.body.totalSize);
      if (!isNaN(size) && size > 0) {
        return size;
      }
    }

    // 7. Axios/umi-request 等库的 data 字段
    if (request.body?.data?.size) {
      const size = Number(request.body.data.size);
      if (!isNaN(size) && size > 0) {
        return size;
      }
    }

    // 8. 前端上传库的嵌套字段（如 file.size）
    if (request.body?.['file']?.size) {
      const size = Number(request.body['file'].size);
      if (!isNaN(size) && size > 0) {
        return size;
      }
    }

    // 9. 分片上传的 chunkSize + chunks 乘积
    if (request.body?.chunkSize && request.body?.chunks) {
      const size = Number(request.body.chunkSize) * Number(request.body.chunks);
      if (!isNaN(size) && size > 0) {
        return size;
      }
    }

    // 10. Content-Length 头（对于纯文件上传的请求）
    const contentLength = request.headers?.['content-length'];
    if (contentLength && !request.body?.fileSize && !request.body?.size) {
      // 仅在没有其他大小信息时使用 Content-Length 作为估算
      // 注意：这包含 multipart 边界等开销，可能不完全准确
      const size = Number(contentLength);
      if (!isNaN(size) && size > 0) {
        return size;
      }
    }

    return null;
  }

  /**
   * 从请求中提取父节点 ID
   * 支持多种参数名称和位置（body、query、params）
   */
  private extractParentNodeId(request: MulterRequest): string | null {
    // 1. 从 body 获取
    const bodyKeys = [
      'parentId',
      'parent_id',
      'nodeId',
      'node_id',
      'targetNodeId',
      'target_node_id',
      'targetParentId',
      'target_parent_id',
      'folderId',
      'folder_id',
      'projectId',
      'project_id',
      'libraryKey',
      'library_key',
    ];

    for (const key of bodyKeys) {
      if (request.body?.[key]) {
        return request.body[key];
      }
    }

    // 2. 从 query 获取
    const queryKeys = [
      'parentId',
      'parent_id',
      'nodeId',
      'node_id',
      'targetNodeId',
      'target_node_id',
      'targetParentId',
      'target_parent_id',
      'folderId',
      'folder_id',
      'projectId',
      'project_id',
      'libraryKey',
      'library_key',
    ];

    for (const key of queryKeys) {
      if (request.query?.[key]) {
        return String(request.query[key]);
      }
    }

    // 3. 从 params 获取
    if (request.params?.nodeId) {
      return String(request.params.nodeId);
    }
    if (request.params?.projectId) {
      return String(request.params.projectId);
    }
    if (request.params?.folderId) {
      return String(request.params.folderId);
    }

    // 4. 从路由参数获取（如 /api/file-system/nodes/:nodeId/upload）
    if (request.params?.id) {
      return String(request.params.id);
    }

    return null;
  }
}
