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

import { Injectable, Logger, Inject, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as http from "http";
import * as https from "https";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RateLimiter } from "../../common/concurrency/rate-limiter";
import type {
	ConversionOptions,
	ConversionResult,
} from "../interfaces/file-conversion.interface";
import type { IMxcadConversionService } from "../interfaces/mxcad-conversion.interface";
import type { ConvertServerFileParam } from "../types/mxcad-context.types";
import {
	CONVERSION_ACCESS_GUARD,
	type IConversionAccessGuard,
} from "../../common/interfaces/conversion-access-guard";
import { FileTypeDetector } from "../utils/file-type-detector";
import { VipFeatureRequiredException } from "../../vip/errors/vip-feature-required.error";

const execAsync = promisify(exec);

@Injectable()
export class FileConversionService implements IMxcadConversionService {
	private readonly logger = new Logger(FileConversionService.name);
	private readonly mxCadAssemblyPath: string;
	private readonly mxCadBinPath: string;
	private readonly mxCadFileExt: string;
	private readonly compression: boolean;
	private readonly conversionRateLimiter: RateLimiter;
	private readonly mxcadDebugPath: string;

	constructor(
		private readonly configService: ConfigService,
		@Inject(CONVERSION_ACCESS_GUARD)
		@Optional()
		private readonly conversionAccessGuard?: IConversionAccessGuard,
	) {
		// 获取 MxCAD 转换配置
		const mxcadConfig = this.configService.get("mxcad", { infer: true });

		// 获取上传并发配置
		const uploadConfig = this.configService.get("upload", { infer: true });
		// 文件转换是 CPU 密集型任务，并发数关联 CPU 核心数
		// 默认使用 CPU 核心数，但最多配置的并发数（避免过度争抢 CPU）
		const cpuCount = os.cpus().length;
		const configMaxConcurrent = uploadConfig?.maxConcurrent;
		const maxConversionConcurrent = uploadConfig?.conversionMaxConcurrent || 4;
		const maxConcurrent = configMaxConcurrent
			? Math.min(configMaxConcurrent, cpuCount, maxConversionConcurrent)
			: Math.min(cpuCount, maxConversionConcurrent);

		// 初始化文件转换限流器
		this.conversionRateLimiter = new RateLimiter(maxConcurrent);
		this.logger.log(
			`文件转换限流器初始化: CPU核心数=${cpuCount}, 最大并发数=${maxConcurrent}`,
		);

		// 检测操作系统
		const isLinux = os.platform() === "linux";

		// 根据平台配置转换程序路径
		const projectRoot = path.join(process.cwd(), "..", "..");

		this.mxCadAssemblyPath =
			mxcadConfig?.assemblyPath ||
			(isLinux
				? path.join(projectRoot, "runtime", "linux", "mxcad", "mxcadassembly")
				: path.join(
						projectRoot,
						"runtime",
						"windows",
						"mxcad",
						"mxcadassembly.exe",
					));

		// Linux 下需要的工作目录（runtime/linux/mxcad）
		this.mxCadBinPath = isLinux
			? path.join(projectRoot, "runtime", "linux", "mxcad")
			: "";

		this.mxCadFileExt = mxcadConfig?.fileExt || ".mxweb";
		this.compression = mxcadConfig?.compression !== false;

		this.mxcadDebugPath = this.configService.get<string>('mxcadDebugPath') || path.join(projectRoot, 'data', 'debug');
	}

	/**
	 * 将路径解析为绝对路径
	 * 确保传递给 mxcadassembly.exe 的路径都是绝对路径
	 * @param inputPath 输入路径（可能是相对路径或绝对路径）
	 * @returns 绝对路径
	 */
	private resolveToAbsolutePath(inputPath: string): string {
		if (!inputPath) {
			return inputPath;
		}

		// 已经是绝对路径，直接返回
		if (path.isAbsolute(inputPath)) {
			return path.normalize(inputPath);
		}

		// 相对路径：基于项目根目录解析
		// 后端 cwd 通常是 packages/backend，项目根目录是其上两级
		const projectRoot = path.join(process.cwd(), "..", "..");
		const absolutePath = path.resolve(projectRoot, inputPath);

		this.logger.debug(
			`[resolveToAbsolutePath] ${inputPath} -> ${absolutePath}`,
		);

		return absolutePath;
	}

	/**
	 * 检测是否为 Linux 平台
	 */
	private isLinux(): boolean {
		return os.platform() === "linux";
	}

	/**
	 * 判断是否为无需保存调试信息的错误（如试用过期 code=-3, tryexpire=true）
	 */
	private isSkipDebugError(ret: { code?: number; tryexpire?: string }): boolean {
		return ret.code === -3 || ret.tryexpire === 'true';
	}

	/**
	 * 转换失败时保存调试信息到 debug 目录
	 */
	private async saveConversionDebugInfo(info: {
		nodeId: string;
		srcPath: string;
		commandStr: string;
		exitCode: string | number;
		stdout: string;
		stderr: string;
		errorMessage: string;
	}): Promise<void> {
		const { nodeId, srcPath, commandStr, exitCode, stdout, stderr, errorMessage } = info;
		const debugDir = path.join(this.mxcadDebugPath, nodeId);

		try {
			await fs.promises.mkdir(debugDir, { recursive: true });

			const logLines = [
				`=== MxCAD 转换失败调试信息 ===`,
				`时间: ${new Date().toISOString()}`,
				`节点ID: ${nodeId}`,
				`源文件: ${srcPath}`,
				`命令: ${commandStr}`,
				`退出码: ${exitCode}`,
				`错误信息: ${errorMessage}`,
				`--- stdout ---`,
				stdout,
				`--- stderr ---`,
				stderr,
			];
			await fs.promises.writeFile(
				path.join(debugDir, 'conversion-debug.log'),
				logLines.join('\n'),
				'utf-8',
			);

			const srcBaseName = path.basename(srcPath);
			await fs.promises.copyFile(srcPath, path.join(debugDir, srcBaseName));

			this.logger.log(`转换调试信息已保存: ${debugDir}`);
		} catch (saveErr) {
			this.logger.warn(`保存转换调试信息失败: ${saveErr.message}`);
		}
	}

	/**
	 * 执行文件转换（带并发限制）
	 */
	async convertFile(options: ConversionOptions): Promise<ConversionResult> {
		// 导出下载方向（mxweb → 其他格式）会员门控：方向由源文件类型自动推导，
		// 所有转换调用点（打开/导出）共用本入口，调用点无需感知门控与运行时开关。
		// 门控实现由 VIP 模块注入（@Optional()），未注入（测试/内部场景）时跳过。
		// 例外：内部转换（如保存时生成 bin 文件：mxweb→bin）通过 skipExportGate 显式跳过，
		// 该操作等价于打开方向转换，不属于用户主动的导出下载。
		if (!options.skipExportGate && this.isExportDirection(options.srcPath)) {
			await this.conversionAccessGuard?.assertExportDownloadAllowed(
				options.userId,
			);
		}
		return this.conversionRateLimiter.execute(async () => {
			return this.executeConversion(options);
		}, options.priority || 'high');
	}

	/**
	 * 转换方向推导：源文件为 .mxweb 即导出下载方向（mxweb → 其他格式），
	 * 否则为打开方向（dwg/dxf → mxweb）。与业务定义一一对应，新增转换入口自动覆盖。
	 */
	private isExportDirection(srcPath: string): boolean {
		return path.extname(srcPath).toLowerCase() === ".mxweb";
	}

	/**
	 * 实际执行文件转换（内部方法）
	 */
	private async executeConversion(
		options: ConversionOptions,
	): Promise<ConversionResult> {
		let stdout = "";
		let stderr = "";
		let commandStr = "";
		let absoluteSrcPath = "";
		const originalDir = process.cwd();
		let changedDir = false;

		try {
			const {
				srcPath,
				fileHash,
				createPreloadingData = true,
				compression = this.compression,
				outname,
				cmd,
				width,
				height,
				colorPolicy,
				outjpg,
			} = options;

			// 确保源文件路径是绝对路径
			absoluteSrcPath = this.resolveToAbsolutePath(srcPath);

			// 构建完整的 param 对象
			const param: Record<string, unknown> = {
				srcpath: absoluteSrcPath.replace(/\\/g, "/"),
				src_file_md5: fileHash,
				create_preloading_data: createPreloadingData,
			};

			// 添加可选参数
			if (!compression) {
				param.compression = 0;
			}

			if (outname) {
				param.outname = outname;
			}

			if (cmd) {
				param.cmd = cmd;
			}

			if (width) {
				param.width = width;
			}

			if (height) {
				param.height = height;
			}

			if (colorPolicy) {
				param.colorPolicy = colorPolicy;
			}

			if (outjpg) {
				param.outjpg = outjpg;
			}

			if (options.roate_angle !== undefined) {
				param.roate_angle = options.roate_angle;
			}
			if (options.view_angle !== undefined) {
				param.view_angle = options.view_angle;
			}
			if (options.bd_pt1_x) {
				param.bd_pt1_x = options.bd_pt1_x;
			}
			if (options.bd_pt1_y) {
				param.bd_pt1_y = options.bd_pt1_y;
			}
			if (options.bd_pt2_x) {
				param.bd_pt2_x = options.bd_pt2_x;
			}
			if (options.bd_pt2_y) {
				param.bd_pt2_y = options.bd_pt2_y;
			}
			if (options.open_file_md5) {
				param.open_file_md5 = options.open_file_md5;
			}
			if (options.layout_name) {
				param.layout_name = options.layout_name;
			}
			if (options.create_clip_block !== undefined) {
				param.create_clip_block = options.create_clip_block;
			}

			if (options.dwgVersion !== undefined) {
				param.dwg_version = options.dwgVersion;
			}

			// Linux 平台特殊处理
			if (this.isLinux()) {
				if (this.mxCadBinPath) {
					process.chdir(this.mxCadBinPath);
					changedDir = true;
					this.logger.log(`[Linux] 切换工作目录: ${this.mxCadBinPath}`);
				}

				// 将参数中的双引号替换为单引号
				const paramStr = JSON.stringify(param).replace(/"/g, "'");
				commandStr = `"${this.mxCadAssemblyPath}" "${paramStr}"`;
				this.logger.log(`执行 MxCAD 转换命令 (Linux): ${commandStr}`);

				const execResult = await execAsync(commandStr, {
					encoding: "utf8",
					timeout: options.timeout || 60000,
					maxBuffer: 50 * 1024 * 1024,
				});

				stdout = execResult.stdout;
				stderr = execResult.stderr;
			} else {
				// Windows 平台
				commandStr = `"${this.mxCadAssemblyPath}" ${JSON.stringify(param)}`;
				this.logger.log(`执行 MxCAD 转换命令: ${commandStr}`);

				const execResult = await execAsync(commandStr, {
					encoding: "utf8",
					timeout: options.timeout || 60000,
					maxBuffer: 50 * 1024 * 1024,
				});

				stdout = execResult.stdout;
				stderr = execResult.stderr;
			}

			// 尝试从 stdout 或 stderr 解析结果
			const output = Buffer.isBuffer(stdout)
				? stdout.toString()
				: stdout ||
					(Buffer.isBuffer(stderr) ? stderr.toString() : stderr) ||
					"";

			try {
				let strOutput = output.toString();
				const iPos = strOutput.lastIndexOf('{"code"');
				if (iPos !== -1) {
					strOutput = strOutput.substring(iPos);
				}
				const ret = JSON.parse(strOutput);

				if (ret.code === 0) {
					this.logger.log(`文件转换成功: ${srcPath}`);
					return { isOk: true, ret };
				} else {
					this.logger.error(`文件转换失败: ${ret.message}`);
					if (options.debugNodeId && !this.isSkipDebugError(ret)) {
						await this.saveConversionDebugInfo({
							nodeId: options.debugNodeId,
							srcPath: absoluteSrcPath,
							commandStr,
							exitCode: ret.code,
							stdout,
							stderr,
							errorMessage: ret.message || '转换失败',
						});
					}
					return { isOk: false, ret, error: ret.message };
				}
			} catch (e) {
				this.logger.error(`解析 MxCAD 输出失败: ${e.message}`);
				this.logger.error(`原始输出: ${output}`);
				if (options.debugNodeId) {
					await this.saveConversionDebugInfo({
						nodeId: options.debugNodeId,
						srcPath: absoluteSrcPath,
						commandStr,
						exitCode: -1,
						stdout,
						stderr,
						errorMessage: `解析输出失败: ${e.message}`,
					});
				}
				return {
					isOk: false,
					ret: { code: -1, message: "解析输出失败" },
					error: e.message,
				};
			}
		} catch (error: unknown) {
			// 确保 stdout 和 stderr 是字符串
			const errorStdout = (error as { stdout?: Buffer | string }).stdout
				? Buffer.isBuffer((error as { stdout?: Buffer | string }).stdout)
					? (
							(error as { stdout?: Buffer | string }).stdout as Buffer
						).toString()
					: (error as { stdout?: Buffer | string }).stdout
				: stdout || "";
			const errorStderr = (error as { stderr?: Buffer | string }).stderr
				? Buffer.isBuffer((error as { stderr?: Buffer | string }).stderr)
					? (
							(error as { stderr?: Buffer | string }).stderr as Buffer
						).toString()
					: (error as { stderr?: Buffer | string }).stderr
				: stderr || "";

			// 检查 stdout 或 stderr 是否包含成功的结果（mxcadassembly 可能退出码非0但实际成功）
			const outputToCheck = errorStdout || errorStderr;

			if (outputToCheck) {
				try {
					const outputStr =
						typeof outputToCheck === "string"
							? outputToCheck
							: outputToCheck.toString();

					const iPos = outputStr.lastIndexOf('{"code"');

					if (iPos !== -1) {
						const strOutput = outputStr.substring(iPos);
						const ret = JSON.parse(strOutput);

						if (ret.code === 0) {
							this.logger.log(`文件转换成功: ${options.srcPath}`);
							return { isOk: true, ret };
						}
					}
				} catch (parseError) {
					// JSON 解析失败，继续错误处理
				}
			}

			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const errorCode = (error as { code?: string | number }).code;

			this.logger.error(`文件转换异常: ${errorMessage}`);
			this.logger.error(`退出码: ${errorCode}`);
			this.logger.error(`stdout: [${errorStdout}]`);
			this.logger.error(`stderr: [${errorStderr}]`);

			if (options.debugNodeId) {
				await this.saveConversionDebugInfo({
					nodeId: options.debugNodeId,
					srcPath: absoluteSrcPath,
					commandStr,
					exitCode: errorCode ?? -1,
					stdout: String(errorStdout),
					stderr: String(errorStderr),
					errorMessage,
				});
			}

			return {
				isOk: false,
				ret: { code: -1, message: errorMessage },
				error: errorMessage,
			};
		} finally {
			// 恢复原始工作目录
			if (changedDir) {
				process.chdir(originalDir);
				this.logger.log(`[Linux] 恢复工作目录: ${originalDir}`);
			}
		}
	}

	async convertFileAsync(
		options: ConversionOptions,
		callbackUrl?: string,
	): Promise<string> {
		const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

		this.convertFile(options)
			.then(async (result) => {
				this.logger.log(`异步转换完成: taskId=${taskId}, isOk=${result.isOk}`);
				if (callbackUrl) {
					try {
						await this.postCallback(callbackUrl, {
							taskId,
							status: result.isOk ? "completed" : "failed",
							newpath: result.ret?.newpath,
							error: result.error,
						});
					} catch (callbackError) {
						this.logger.warn(`异步转换回调失败: ${callbackError.message}`);
					}
				}
			})
			.catch((error: Error) => {
				this.logger.error(`异步转换失败: taskId=${taskId}, ${error.message}`, error.stack);
				if (callbackUrl) {
					this.postCallback(callbackUrl, {
						taskId,
						status: "failed",
						error: error.message,
					}).catch((callbackError) => {
						this.logger.warn(`异步转换回调失败: ${callbackError.message}`);
					});
				}
			});

		this.logger.log(`异步转换已提交: taskId=${taskId}`);
		return taskId;
	}

	private async postCallback(url: string, payload: Record<string, unknown>): Promise<void> {
		const body = JSON.stringify(payload);
		return new Promise((resolve, reject) => {
			const isHttps = url.startsWith("https");
			const mod = isHttps ? https : http;
			const parsed = new URL(url);
			const options: http.RequestOptions = {
				hostname: parsed.hostname,
				port: parsed.port || (isHttps ? 443 : 80),
				path: parsed.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body),
				},
				timeout: 10000,
			};
			const req = mod.request(options, (res: http.IncomingMessage) => {
				res.resume();
				res.on("end", () => {
					if (res.statusCode && res.statusCode >= 400) {
						reject(new Error(`Callback HTTP ${res.statusCode}`));
					} else {
						resolve();
					}
				});
			});
			req.on("error", reject);
			req.on("timeout", () => {
				req.destroy();
				reject(new Error("Callback timeout"));
			});
			req.write(body);
			req.end();
		});
	}

	getConvertedExtension(originalFilename: string): string {
		const extension = path.extname(originalFilename).toLowerCase();

		switch (extension) {
			case ".dwg":
			case ".dxf":
				return this.mxCadFileExt;
			case ".pdf":
				return ".pdf";
			case ".png":
			case ".jpg":
			case ".jpeg":
				return extension;
			default:
				return this.mxCadFileExt;
		}
	}

	needsConversion(filename: string): boolean {
		return FileTypeDetector.needsConversion(filename);
	}

	async convertServerFile(param: ConvertServerFileParam): Promise<unknown> {
		try {
			if (!param) {
				return { code: 12, message: 'param error' };
			}

			const conversionOptions: ConversionOptions = {
				srcPath: param.srcPath || param.srcpath || '',
				fileHash: param.fileHash || param.src_file_md5 || '',
				userId: param.userId,
				createPreloadingData: param.createPreloadingData ?? true,
				outname: param.outname,
				cmd: param.cmd,
				width: param.width ? String(param.width) : undefined,
				height: param.height ? String(param.height) : undefined,
				colorPolicy: param.colorPolicy,
				outjpg: param.outjpg,
				dwgVersion: param.dwgVersion,
				priority: param.priority,
			};

			if (param.async === 'true' && param.resultposturl) {
				this.convertFileAsync(conversionOptions, param.resultposturl)
					.then((taskId) => {
						this.logger.log(
							`异步转换完成: ${param.srcPath || param.srcpath}, 任务ID: ${taskId}`
						);
					});
				return { code: 0, message: 'async calling' };
			}

			const { isOk, ret } = await this.convertFile(conversionOptions);
			return isOk ? ret : { code: 12, message: 'param error' };
		} catch (error) {
			// 导出下载方向会员门控拒绝（VipFeatureRequiredException）必须原样透传，
			// 前端据此弹购买会员引导；其余转换失败按既有语义折叠为 code 12。
			if (error instanceof VipFeatureRequiredException) throw error;
			this.logger.error(`转换服务器文件失败: ${error.message}`, error.stack);
			return { code: 12, message: 'param error' };
		}
	}

	async checkTzStatus(fileHash: string): Promise<{ code: number }> {
		return { code: 0 };
	}

	async generateBinFiles(mxwebPath: string, nodeName: string): Promise<void> {
		try {
			this.logger.log(`[generateBinFiles] 开始生成 bin 文件: ${mxwebPath}`);

			const mxwebName = path.basename(mxwebPath);
			const outname = `${mxwebName}.bin`;

			const result = await this.convertFile({
				srcPath: mxwebPath,
				fileHash: '',
				createPreloadingData: true,
				outname,
				// 保存时生成 bin 文件属于内部保存流水线（等价打开方向转换），
				// 非用户主动导出下载，跳过导出下载会员门控。
				skipExportGate: true,
			});

			if (result.isOk) {
				this.logger.log(`[generateBinFiles] bin 文件生成成功: ${nodeName}`);
			} else {
				this.logger.error(
					`[generateBinFiles] bin 文件生成失败: ${result.error || '未知错误'}`
				);
			}
		} catch (error) {
			this.logger.error(
				`[generateBinFiles] bin 文件生成异常: ${nodeName}`,
				error.stack
			);
		}
	}

	async convertBinToMxweb(
		binPath: string,
		outputPath: string,
		outName: string,
	): Promise<{ success: boolean; outputPath?: string; error?: string }> {
		let stdout = "";
		let stderr = "";
		const originalDir = process.cwd();
		let changedDir = false;

		try {
			this.logger.log(`[convertBinToMxweb] 开始转换: ${binPath} -> ${outName}`);

			const absoluteBinPath = this.resolveToAbsolutePath(binPath);
			const absoluteOutputPath = this.resolveToAbsolutePath(outputPath);

			const param: Record<string, string> = {
				srcpath: absoluteBinPath.replace(/\\/g, "/"),
				outpath: absoluteOutputPath.replace(/\\/g, "/"),
				outname: outName,
			};

			if (this.isLinux()) {
				if (this.mxCadBinPath) {
					process.chdir(this.mxCadBinPath);
					changedDir = true;
					this.logger.log(`[Linux] 切换工作目录: ${this.mxCadBinPath}`);
				}

				const paramStr = JSON.stringify(param).replace(/"/g, "'");
				const cmd = `"${this.mxCadAssemblyPath}" "${paramStr}"`;
				this.logger.log(`执行 bin→mxweb 转换命令 (Linux): ${cmd}`);

				const execResult = await execAsync(cmd, {
					encoding: "utf8",
					timeout: 60000,
					maxBuffer: 50 * 1024 * 1024,
				});

				stdout = execResult.stdout;
				stderr = execResult.stderr;
			} else {
				const cmd = `"${this.mxCadAssemblyPath}" ${JSON.stringify(param)}`;
				this.logger.log(`执行 bin→mxweb 转换命令: ${cmd}`);

				const execResult = await execAsync(cmd, {
					encoding: "utf8",
					timeout: 60000,
					maxBuffer: 50 * 1024 * 1024,
				});

				stdout = execResult.stdout;
				stderr = execResult.stderr;
			}

			const output = Buffer.isBuffer(stdout)
				? stdout.toString()
				: stdout ||
					(Buffer.isBuffer(stderr) ? stderr.toString() : stderr) ||
					"";

			try {
				let strOutput = output.toString();
				const iPos = strOutput.lastIndexOf('{"code"');
				if (iPos !== -1) {
					strOutput = strOutput.substring(iPos);
				}
				const ret = JSON.parse(strOutput);

				if (ret.code === 0) {
					const resultPath = path.join(outputPath, outName);
					this.logger.log(`[convertBinToMxweb] 转换成功: ${resultPath}`);
					return { success: true, outputPath: resultPath };
				} else {
					this.logger.error(`[convertBinToMxweb] 转换失败: ${ret.message}`);
					return { success: false, error: ret.message };
				}
			} catch (e) {
				this.logger.error(`[convertBinToMxweb] 解析输出失败: ${e.message}`);
				this.logger.error(`原始输出: ${output}`);
				return { success: false, error: `解析输出失败: ${e.message}` };
			}
		} catch (error: unknown) {
			const err = error as Error & {
				code?: number;
				stdout?: string | Buffer;
				stderr?: string | Buffer;
			};

			const errorStdout = err.stdout
				? Buffer.isBuffer(err.stdout)
					? err.stdout.toString()
					: err.stdout
				: stdout || "";
			const errorStderr = err.stderr
				? Buffer.isBuffer(err.stderr)
					? err.stderr.toString()
					: err.stderr
				: stderr || "";

			const outputToCheck = errorStdout || errorStderr;

			if (outputToCheck) {
				try {
					const iPos = outputToCheck.lastIndexOf('{"code"');

					if (iPos !== -1) {
						const strOutput = outputToCheck.substring(iPos);
						const ret = JSON.parse(strOutput);

						if (ret.code === 0) {
							const resultPath = path.join(outputPath, outName);
							this.logger.log(`[convertBinToMxweb] 转换成功: ${resultPath}`);
							return { success: true, outputPath: resultPath };
						}
					}
				} catch {
					// JSON 解析失败，继续错误处理
				}
			}

			this.logger.error(`[convertBinToMxweb] 转换异常: ${err.message}`);
			this.logger.error(`退出码: ${err.code}`);
			this.logger.error(`stdout: [${errorStdout}]`);
			this.logger.error(`stderr: [${errorStderr}]`);

			return { success: false, error: err.message };
		} finally {
			if (changedDir) {
				process.chdir(originalDir);
				this.logger.log(`[Linux] 恢复工作目录: ${originalDir}`);
			}
		}
	}
}
