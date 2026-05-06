///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileStore } from "@tus/file-store";
import { Server } from "@tus/server";
import { TusEventHandler } from "./tus-event-handler.service";
import { FileConversionService } from "../conversion/file-conversion.service";
import * as path from "path";
import * as fs from "fs";

@Injectable()
export class TusService {
	private readonly logger = new Logger(TusService.name);
	private server: Server;
	private _initialized = false;

	constructor(
		private readonly configService: ConfigService,
		private readonly tusEventHandler: TusEventHandler,
		private readonly fileConversionService: FileConversionService,
	) {}

	private ensureInitialized(): void {
		if (this._initialized) return;
		this._initialized = true;
		try {
			const tempPath = this.configService.get<string>(
				"mxcadTempPath",
			) as string;
			const uploadPath = this.configService.get<string>(
				"mxcadUploadPath",
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
				onUploadFinish: async (req, upload) => {
					const logger = new Logger("TusServer");
					logger.log(
						`上传完成: ${upload.id}, 文件: ${upload.metadata?.filename || "unknown"}`,
					);

					try {
						const user = (req as any).user;
						const metadata = upload.metadata || {};
						const filename = metadata.filename || "unknown";
						const fileHash = metadata.fileHash || upload.id;

						// 已登录用户：走正常流程（创建文件节点 + 转换）
						if (user?.id) {
							const result = await this.tusEventHandler.handleUploadFinish(
								upload.id,
								"",
								metadata,
								user.id,
								user.role,
							);

							if (result?.nodeId) {
								return { headers: { "X-Node-Id": result.nodeId } };
							}
						}

						// 匿名用户：将文件复制到 uploads/{hash}/ 目录并触发转换
						const tusFilePath = path.join(tempPath, upload.id);
						const ext = path.extname(filename);

						if (!fs.existsSync(tusFilePath)) {
							logger.warn(`TUS 上传文件不存在: ${tusFilePath}`);
							return {};
						}

						// 创建目标目录 uploads/{hash}/
						const targetDir = path.join(uploadPath, fileHash);
						if (!fs.existsSync(targetDir)) {
							fs.mkdirSync(targetDir, { recursive: true });
						}

						// 复制原始文件到 uploads/{hash}/{filename}
						const targetPath = path.join(targetDir, filename);
						await fs.promises.copyFile(tusFilePath, targetPath);
						logger.log(`匿名上传文件已复制到: ${targetPath}`);

						// 尝试转换 CAD 文件为 mxweb 格式
						if (this.fileConversionService.needsConversion(filename)) {
							try {
								logger.log(`开始转换匿名上传文件: ${filename}`);
								const { isOk } = await this.fileConversionService.convertFile({
									srcPath: targetPath,
									fileHash,
									createPreloadingData: true,
								});

								if (isOk) {
									logger.log(`匿名上传文件转换成功: ${filename} -> ${fileHash}${ext}.mxweb`);
								} else {
									logger.warn(`匿名上传文件转换失败: ${filename}，将提供原始文件`);
								}
							} catch (convertError) {
								logger.warn(`文件转换异常: ${(convertError as Error).message}，将提供原始文件`);
							}
						}

						// 返回 hash 和文件名给前端
						return {
							headers: {
								"X-File-Hash": fileHash,
								"X-File-Name": filename,
							},
						};
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
