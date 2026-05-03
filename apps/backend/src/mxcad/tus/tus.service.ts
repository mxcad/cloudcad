///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { TusEventHandler } from './tus-event-handler.service';
import { AppConfig } from '../../config/app.config';

/**
 * Tus 上传服务器服务
 *
 * 基于 @tus/server 创建符合 tus 协议的文件上传服务。
 * 在模块初始化时自动启动 tus 服务器，挂载到 Express 应用。
 *
 * 存储后端使用 FileStore（本地文件系统），
 * 上传文件暂存到临时目录，finish 事件触发后移动到最终位置。
 */
@Injectable()
export class TusService implements OnModuleInit {
  private readonly logger = new Logger(TusService.name);
  private server: Server;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
    private readonly tusEventHandler: TusEventHandler
  ) {}

  /**
   * 模块初始化时启动 tus 服务器
   */
  async onModuleInit(): Promise<void> {
    const tempPath = this.configService.get('mxcadTempPath', { infer: true }) as string;
    const maxFileSize = this.configService.get('upload.maxFileSize', { infer: true }) as number || 500 * 1024 * 1024;

    this.logger.log(`初始化 Tus 上传服务器，临时目录: ${tempPath}`);

    const store = new FileStore({
      directory: tempPath,
    });

    this.server = new Server({
      path: '/api/v1/files',
      store,
      maxFileSize,
      async onUploadFinish(req, res, upload) {
        const logger = new Logger('TusServer');
        logger.log(`上传完成: ${upload.id}, 文件: ${upload.metadata?.filename || 'unknown'}`);
        
        // 调用 TusEventHandler 处理上传完成事件
        try {
          const userId = (req as any).user?.id;
          await tusEventHandler.handleUploadFinish(
            upload.id,
            '', // filePath 将在 handleUploadFinish 中通过 FileStore 获取
            upload.metadata || {},
            userId
          );
        } catch (error) {
          logger.error(`处理上传完成事件失败: ${(error as Error).message}`, (error as Error).stack);
        }
      },
    });

    this.logger.log('Tus 上传服务器初始化完成');
  }

  /**
   * 获取 tus 服务器实例
   */
  getServer() {
    return this.server;
  }

  /**
   * 获取 tus 服务器的处理函数，用于挂载到 Express 路由
   */
  getHandler() {
    return this.server.handle.bind(this.server);
  }
}
