///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileStore } from "@tus/file-store";
import { Server } from "@tus/server";
import { TusEventHandler } from "./tus-event-handler.service";

/**
 * Tus 上传协议服务
 *
 * 基于 @tus/server 实现标准 tus 协议的分片上传服务。
 *
 * 上传完成后的处理流程（统一走 TusEventHandler）：
 * - 已登录用户（userId 存在）：hash 对比 + 转换 + 创建文件节点
 * - 匿名用户（userId 为空）：仅复制文件到 uploads 目录，不做转换
 */
@Injectable()
export class TusService {
	private readonly logger = new Logger(TusService.name);
	private server: Server;
	private _initialized = false;

	constructor(
		private readonly configService: ConfigService,
		private readonly tusEventHandler: TusEventHandler,
	) {}

	private ensureInitialized(): void {
		if (this._initialized) return;
		this._initialized = true;
		try {
			const tempPath = this.configService.get<string>(
				"mxcadTempPath",
			) as string;
			const maxFileSize =
				(this.configService.get<number>("upload.maxFileSize") as number) ||
				500 * 1024 * 1024;

			this.logger.log(`初始化 Tus 上传服务器，临时目录: ${tempPath}`);

			const store = new FileStore({
				directory: tempPath,
			});

			this.server = new Server({
				path: "/api/v1/files",
				datastore: store,
				maxSize: maxFileSize,
				relativeLocation: true,
				onUploadFinish: async (req, upload) => {
					const logger = new Logger("TusServer");
					logger.log(
						`上传完成: ${upload.id}, 文件: ${upload.metadata?.filename || "unknown"}`,
					);

					try {
						const user = (req as any).user || {};
						// JWT payload 中用户 ID 在 sub 字段（标准 JWT claim），兼容 id 字段
						const userId = user.id || user.sub;

						const result = await this.tusEventHandler.handleUploadFinish(
							upload.id,
							"",
							upload.metadata || {},
							userId,
							user.role,
						);

						if (result?.nodeId) {
							return { headers: { "X-Node-Id": result.nodeId } };
						}
					} catch (error) {
						logger.error(
							`处理上传完成事件失败: ${(error as Error).message}`,
							(error as Error).stack,
						);
					}

					return {};
				},
			});

			this.logger.log("Tus 上传服务器初始化完成");
		} catch (error) {
			this.logger.error(
				`Tus 上传服务器初始化失败: ${(error as Error).message}`,
			);
			throw error;
		}
	}

	getServer() {
		return this.server;
	}

	getHandler() {
		this.ensureInitialized();
		return this.server.handle.bind(this.server);
	}
}
