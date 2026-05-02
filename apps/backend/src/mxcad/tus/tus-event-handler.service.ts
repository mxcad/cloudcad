///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from '@nestjs/common';

/**
 * Tus 事件处理器
 *
 * 处理 @tus/server 的上传完成事件（finish）。
 * 在文件上传完成后调用 FileMergeService 进行文件转换和节点创建。
 *
 * 职责：
 * 1. 监听 tus onUploadFinish 事件
 * 2. 获取上传文件信息（文件路径、元数据等）
 * 3. 调用文件转换服务进行格式转换
 * 4. 创建文件系统节点
 * 5. 清理临时文件
 */
@Injectable()
export class TusEventHandler {
  private readonly logger = new Logger(TusEventHandler.name);

  constructor() {
    this.logger.log('TusEventHandler 已初始化');
  }

  /**
   * 处理上传完成事件
   * @param uploadId tus 上传 ID
   * @param filePath 上传文件路径
   * @param metadata 上传元数据（文件名、哈希等）
   */
  async handleUploadFinish(
    uploadId: string,
    filePath: string,
    metadata: Record<string, string>
  ): Promise<void> {
    const filename = metadata.filename || 'unknown';
    this.logger.log(`处理上传完成事件: uploadId=${uploadId}, filename=${filename}`);

    try {
      // TODO: 在后续实现中，此处将调用 FileMergeService 和 FileConversionUploadService
      // 进行文件转换、节点创建等业务逻辑
      this.logger.log(`上传文件暂存路径: ${filePath}`);
      this.logger.log(`上传元数据: ${JSON.stringify(metadata)}`);

      // 验证文件是否存在
      const fs = await import('fs');
      if (!fs.existsSync(filePath)) {
        this.logger.error(`上传文件不存在: ${filePath}`);
        return;
      }

      this.logger.log(`上传完成处理成功: uploadId=${uploadId}, filename=${filename}`);
    } catch (error) {
      this.logger.error(
        `处理上传完成事件失败: uploadId=${uploadId}, error=${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
