///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
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
		private readonly jwtService: JwtService,
	) {}

	private ensureInitialized(): void {
		if (this._initialized) return;
		this._initialized = true;
		try {
			const uploadPath = this.configService.get<string>("mxcadUploadPath", { infer: true }) as string;
			const maxFileSize =
				(this.configService.get<number>("upload.maxFileSize") as number) ||
				500 * 1024 * 1024;

			this.logger.log(`初始化 Tus 上传服务器，上传目录: ${uploadPath}`);

			const store = new FileStore({
				directory: uploadPath,
			});

			this.server = new Server({
				path: "/api/v1/files",
				datastore: store,
				maxSize: maxFileSize,
				onIncomingRequest: async (req, uploadId) => {
					// 防御性提取 Authorization header：@tus/server 将 header 包装为 Web API Headers 类型
					// 当 Uppy 在 headers 和 onBeforeRequest 中都设置 Authorization 时，
					// Headers.get() 会将多个值以逗号拼接，导致 token 被污染（如 "Bearer token1, Bearer token2"）
					// 此处只取第一个以 "Bearer " 开头的有效 token
					const rawAuth = req.headers.get('authorization');
					
					if (!rawAuth) {
						this.logger.debug(`匿名上传请求（无 Authorization header）: ${uploadId}`);
						return;
					}

					// 处理可能存在的逗号分隔多值
					const parts = rawAuth.split(',');
					const bearerPart = parts.map(p => p.trimStart()).find(p => p.startsWith('Bearer ')) || parts[0].trimStart();
					const token = bearerPart.startsWith('Bearer ')
						? bearerPart.slice(7)
						: bearerPart;

					if (!token) {
						this.logger.debug(`匿名上传请求（空 Authorization header）: ${uploadId}`);
						return;
					}

					try {
						const payload = this.jwtService.verify(token);
						(req as any).user = payload;
						this.logger.log(`JWT 认证成功: ${payload.sub || payload.id}`);
					} catch (error) {
						this.logger.warn(`JWT 验证失败: ${(error as Error).message}`);
						throw { status_code: 401, body: "Invalid token" };
					}
				},
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
							const headers: Record<string, string> = { "X-Node-Id": result.nodeId };
							if (!userId) {
								headers["X-File-Hash"] = result.nodeId;
							}
							return { headers };
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
