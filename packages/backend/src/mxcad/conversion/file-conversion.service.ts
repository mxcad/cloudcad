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
import { ModuleRef } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RateLimiter } from "../../common/concurrency/rate-limiter";
import type {
	ConversionOptions,
	ConversionResult,
	MxCadConversionResult,
} from "../interfaces/file-conversion.interface";
import type { IMxcadConversionService } from "../interfaces/mxcad-conversion.interface";
import type { ConvertServerFileParam } from "../types/mxcad-context.types";
import {
	CONVERSION_ACCESS_GUARD,
	type IConversionAccessGuard,
} from "../../common/interfaces/conversion-access-guard";
import { FileTypeDetector } from "../utils/file-type-detector";
import { VipFeatureRequiredException } from "../../vip/errors/vip-feature-required.error";
import { runMxcadAssembly } from "./mxcad-exec";
import {
	IFunctionExecutor,
	type ConversionTask,
} from "../../function-executor/function-executor.interface";

/**
 * 转换服务（conversion-service 模式）错误文案中的环境性失败标记。
 * 与 packages/conversion-service mxcad/runner.ts 抛出的 ConversionExecutionError 文案对齐：
 * - '转换超时'（timedOut）
 * - '转换进程被终止 (<signal>)'（signal 非空）
 * - 'mxcadassembly 进程未正常启动（stderr: ...）'（exitCode=null）
 * - '转换输出格式错误'（_parseOutput 解析失败，code=1）
 * 以上均属环境性失败，重试可能成功。
 */
const TRANSIENT_ERROR_MARKERS = [
	"转换超时",
	"进程被终止",
	"进程未正常启动",
	"输出格式错误",
	"timed out",
];

/**
 * 判定转换服务错误文案是否为瞬态失败。
 * 转换服务只回错误字符串、不透传失败性质，故按文案归类；
 * 无法判定时按瞬态处理——标记 transient:true 供上层区分失败性质，重试不会有害；
 * 比把慢转换误判成确定性内容失败更安全。
 */
function isTransientConversionError(message?: string): boolean {
	if (!message) return true;
	return TRANSIENT_ERROR_MARKERS.some((m) => message.includes(m));
}

/**
 * 从引擎原始输出中解析成功结果；无完整 {"code":0} JSON 时返回 null。
 *
 * 供两个「输出不可信」的场景做最后采信判断：
 * - 超时：mxcad-exec 的 finish() 在子进程 close 时返回，若定时器已先触发则
 *   timedOut=true 而 stdout 可能已含完整成功结果（转换刚好卡在超时线上）。
 *   完整 code=0 JSON 是引擎已完成转换的正证据，优先采信而非误报超时失败。
 * - 异常：mxcadassembly 可能退出码非 0 但实际成功（引擎成功/失败退出码都恒 2123）。
 * 引擎输出是动态 JSON，仅保证 code 字段，故此处只认 code===0。
 */
function parseSuccessResult(
	rawOutput: string,
): MxCadConversionResult | null {
	const output = String(rawOutput || "");
	const iPos = output.lastIndexOf('{"code"');
	if (iPos === -1) return null;
	let ret: unknown;
	try {
		ret = JSON.parse(output.substring(iPos));
	} catch {
		return null;
	}
	if (ret && typeof ret === "object" && (ret as MxCadConversionResult).code === 0) {
		return ret as MxCadConversionResult;
	}
	return null;
}

@Injectable()
export class FileConversionService implements IMxcadConversionService {
	private readonly logger = new Logger(FileConversionService.name);
	private readonly mxCadAssemblyPath: string;
	private readonly mxCadBinPath: string;
	private readonly mxCadFileExt: string;
	private readonly compression: boolean;
	private readonly conversionRateLimiter: RateLimiter;
	private readonly mxcadDebugPath: string;
	/** 单次 mxcadassembly 转换超时（毫秒），来自 timeout.fileConversion，默认 180000 */
	private readonly conversionTimeoutMs: number;
	/**
	 * FUNCTION_EXECUTOR 部署模式。
	 * - 'process-pool'（默认）：本方法内直接 spawn mxcadassembly（进程内，行为不变）。
	 * - 'conversion-service'：转发到独立转换服务（经 IFunctionExecutor=HttpConversionExecutor，
	 *   其内部 POST /v1/conversions/async/convertFile + 轮询终态）。
	 * 两条分支互不影响：默认模式代码路径零改动，仅在 conversion-service 模式切到转发分支。
	 */
	private readonly useConversionService: boolean;

	/**
	 * 独立转换服务执行器的惰性解析缓存。
	 * 用 ModuleRef 延迟获取而非构造注入，规避 FileConversionService ↔ ProcessPoolExecutor
	 * 的构造期循环依赖（ProcessPoolExecutor 依赖 MXCAD_CONVERSION_SERVICE=FileConversionService）。
	 */
	private _functionExecutor?: IFunctionExecutor;

	constructor(
		private readonly configService: ConfigService,
		private readonly moduleRef: ModuleRef,
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

		// 转换超时可经 env TIMEOUT_FILE_CONVERSION 调整（默认 180000，
		// 与 conversion-service 1/2 级超时对齐；大图纸常超 60s，旧默认会把慢转换误杀）
		const timeoutMs = this.configService.get<number>('timeout.fileConversion');
		this.conversionTimeoutMs =
			typeof timeoutMs === "number" && timeoutMs > 0
				? timeoutMs
				: 180000;

		// 部署模式：仅 conversion-service 模式切转发分支，其余（默认 process-pool）保持进程内 spawn
		const executorMode =
			this.configService.get<string>("FUNCTION_EXECUTOR") || "process-pool";
		this.useConversionService = executorMode === "conversion-service";
		if (this.useConversionService) {
			this.logger.log("转换部署模式=conversion-service：转换请求转发到独立转换服务");
		}
	}

	/**
	 * 惰性解析 IFunctionExecutor（env=conversion-service 时 = HttpConversionExecutor）。
	 *
	 * 用 ModuleRef 延迟获取而非构造注入：ProcessPoolExecutor 依赖 MXCAD_CONVERSION_SERVICE
	 * (=本服务)，构造期注入会形成循环依赖。延迟到首次 conversion-service 模式转换请求时解析
	 * （此时本服务实例已构造完成，ProcessPoolExecutor 可正常取到本服务），strict:false 未接线
	 * 时返回 undefined，转发分支自动降级为进程内 spawn。
	 */
	private getFunctionExecutor(): IFunctionExecutor | undefined {
		if (this._functionExecutor === undefined) {
			try {
				this._functionExecutor = this.moduleRef.get<IFunctionExecutor>(
					IFunctionExecutor,
					{ strict: false },
				);
			} catch {
				this._functionExecutor = undefined;
			}
		}
		return this._functionExecutor;
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

			// 部署模式分支：conversion-service 模式转发到独立转换服务（经 IFunctionExecutor）。
			// 关键：转换服务的 MxcadRunner 按 ConversionOptions 驼峰形状读取入参（srcPath/fileHash/
			// createPreloadingData/outname/...），并非 mxcadassembly 小写参数（srcpath/src_file_md5/...）。
			// 故此处转发 ConversionOptions 形状（srcPath 用已解析绝对路径，转换服务 _resolvePath 原样返回），
			// 而非下方进程内 spawn 用的 mxcadassembly 参数 param——否则转换服务读 params.srcPath 恒 undefined，
			// _resolvePath 返回 undefined 后 .replace 崩溃（Cannot read properties of undefined）。
			// 各字段取上方解构的有效值（已套用 this.compression 等默认），保证与进程内 spawn 结果等价。
			// 默认 process-pool 模式走下方进程内 spawn，行为不变。
			if (this.useConversionService && this.getFunctionExecutor()) {
				const serviceParam: Record<string, unknown> = {
					srcPath: absoluteSrcPath,
					fileHash,
					createPreloadingData,
					compression,
				};
				if (outname) serviceParam.outname = outname;
				if (cmd) serviceParam.cmd = cmd;
				if (width) serviceParam.width = width;
				if (height) serviceParam.height = height;
				if (colorPolicy) serviceParam.colorPolicy = colorPolicy;
				if (outjpg) serviceParam.outjpg = outjpg;
				if (options.roate_angle !== undefined)
					serviceParam.roate_angle = options.roate_angle;
				if (options.view_angle !== undefined)
					serviceParam.view_angle = options.view_angle;
				if (options.dwgVersion !== undefined)
					serviceParam.dwgVersion = options.dwgVersion;
				if (options.layout_name)
					serviceParam.layout_name = options.layout_name;
				// 721fe02 把 param 重构为驼峰 serviceParam 时漏抄这 6 个字段（进程内 param 有、
				// serviceParam 无），致 conversion-service 模式下 cut_dwg/print_to_pdf 的裁剪框
				// (bd_pt1_x/bd_pt1_y/bd_pt2_x/bd_pt2_y)、open_file_md5、create_clip_block 丢失，
				// 引擎缺区域信息回 {"message":"false"}。补齐以与进程内 spawn 等价。
				if (options.bd_pt1_x)
					serviceParam.bd_pt1_x = options.bd_pt1_x;
				if (options.bd_pt1_y)
					serviceParam.bd_pt1_y = options.bd_pt1_y;
				if (options.bd_pt2_x)
					serviceParam.bd_pt2_x = options.bd_pt2_x;
				if (options.bd_pt2_y)
					serviceParam.bd_pt2_y = options.bd_pt2_y;
				if (options.open_file_md5)
					serviceParam.open_file_md5 = options.open_file_md5;
				if (options.create_clip_block !== undefined)
					serviceParam.create_clip_block = options.create_clip_block;
				return await this.forwardViaExecutor(
					"convertFile",
					serviceParam,
					options.priority === "low" ? 3 : 2,
				);
			}

			// 参数序列化：Linux 用单引号 JSON（mxcadassembly 约定），Windows 用原始 JSON
			const paramStr = this.isLinux()
				? JSON.stringify(param).replace(/"/g, "'")
				: JSON.stringify(param);
			commandStr = `"${this.mxCadAssemblyPath}" ${paramStr}`;
			this.logger.log(`执行 MxCAD 转换命令: ${commandStr}`);

			// 以独立进程组运行 mxcadassembly：超时/失败时杀整组，杜绝孤儿进程累积
			const runResult = await runMxcadAssembly(
				this.mxCadAssemblyPath,
				paramStr,
				{
					cwd: this.isLinux()
						? this.mxCadBinPath || undefined
						: undefined,
					timeoutMs: options.timeout || this.conversionTimeoutMs,
					logger: this.logger,
				},
			);
			stdout = runResult.stdout;
			stderr = runResult.stderr;

			// 始终记录 mxcadassembly 原始输出（含成功/失败/超时）：
			// 此前成功路径只打 srcPath、失败路径只打 ret.message，子进程 stdout/stderr
			// 从未进后端日志，导致"手动跑正常、后端跑 read file error"无从对照。
			// 现在把引擎原始输出落日志，失败时可直接与手动执行结果比对定位。
			// 放在超时/未正常启动分支之前，保证这两类失败也能拿到引擎原始输出。
			if (stdout || stderr) {
				this.logger.log(
					`mxcadassembly 原始输出: stdout=[${stdout}] stderr=[${stderr}]`,
				);
			}

			if (runResult.timedOut) {
				// 先尝试采信完整成功结果：runMxcadAssembly 在子进程 close 时结算，
				// 若超时定时器已先触发则 timedOut=true 而 stdout 可能已含完整 code=0 结果
				// （转换刚好卡在超时线上完成）。完整 code=0 JSON 是引擎已完成转换的正证据，
				// 优先采信而非误报「文件转换超时」——超时是环境性失败（可重试），
				// 而这里引擎其实已经转完了。
				const salvaged = parseSuccessResult(stdout || stderr);
				if (salvaged) {
					if (outname && !salvaged.newpath) {
						salvaged.newpath = path.join(
							path.dirname(absoluteSrcPath),
							outname,
						);
					}
					this.logger.warn(
						`文件转换卡在超时线内完成，采信引擎成功结果: ${srcPath}`,
					);
					return { isOk: true, ret: salvaged };
				}
				const timeoutMsg = `文件转换超时(${
					options.timeout || this.conversionTimeoutMs
				}ms)`;
				this.logger.error(`${timeoutMsg}，已杀进程组`);
				return {
					isOk: false,
					ret: { code: -2, message: timeoutMsg },
					error: timeoutMsg,
					transient: true,
				};
			}

			// 引擎进程未正常退出：exitCode=null（spawn 失败）或 signal 非空（被信号杀死）。
			// 此前这类失败折叠进下方「解析输出失败」，无法区分引擎环境问题与内容问题，
			// 也无法在日志里看出「进程根本没起来」和「引擎拒绝了文件」的区别。
			if (runResult.exitCode === null || runResult.signal) {
				const spawnMsg = `mxcadAssembly 进程未正常启动（signal=${
					runResult.signal ?? "null"
				}，stderr=${stderr.slice(0, 200) || "无"}）`;
				this.logger.error(spawnMsg);
				return {
					isOk: false,
					ret: { code: -2, message: spawnMsg },
					error: spawnMsg,
					transient: true,
				};
			}

			this.logger.log(`文件转换退出: exitCode=${runResult.exitCode}`);

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
					// 引擎有时不回 newpath（进程内路径此前依赖调用方自己推断产物位置），
					// 用 outname 补算，与 conversion-service MxcadRunner 的补算逻辑对齐。
					if (outname && !ret.newpath) {
						ret.newpath = path.join(path.dirname(absoluteSrcPath), outname);
					}
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
					// 引擎返回非 0 code = 确定性内容失败（如 read file error），
					// 按 transient:false 标记供上层区分失败性质（同一输入重试会再失败）。
					return {
						isOk: false,
						ret,
						error: ret.message,
						transient: false,
					};
				}
			} catch (e) {
				// 引擎已退出（exitCode 非 null、无 signal）但输出不是可解析的 JSON
				// —— 引擎协议/配置异常，属环境性失败（transient:true），可能与内容无关。
				const parseMsg = `mxcadAssembly 输出无法解析（${e.message}，原始输出=${
					String(output).slice(0, 300) || "空"
				})}`;
				this.logger.error(`解析 MxCAD 输出失败: ${parseMsg}`);
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
					ret: { code: -2, message: parseMsg },
					error: parseMsg,
					transient: true,
				};
			}
		} catch (error: unknown) {
			// 异常路径（如 spawn 失败）：stdout/stderr 已由 runMxcadAssembly 捕获（可能为空）
			const outputToCheck = stdout || stderr;

			// 检查 stdout 或 stderr 是否包含成功的结果（mxcadassembly 可能退出码非0但实际成功）
			const salvaged = outputToCheck ? parseSuccessResult(outputToCheck) : null;
			if (salvaged) {
				if (options.outname && !salvaged.newpath) {
					salvaged.newpath = path.join(
						path.dirname(absoluteSrcPath),
						options.outname,
					);
				}
				this.logger.log(`文件转换成功: ${options.srcPath}`);
				return { isOk: true, ret: salvaged };
			}

			const errorMessage =
				error instanceof Error ? error.message : String(error);

			this.logger.error(`文件转换异常: ${errorMessage}`);
			this.logger.error(`stdout: [${stdout}]`);
			this.logger.error(`stderr: [${stderr}]`);

			if (options.debugNodeId) {
				await this.saveConversionDebugInfo({
					nodeId: options.debugNodeId,
					srcPath: absoluteSrcPath,
					commandStr,
					exitCode: -1,
					stdout,
					stderr,
					errorMessage,
				});
			}

			// 异常路径无法判断成败性质（多半是 spawn/IO 环境异常），按瞬态处理。
			return {
				isOk: false,
				ret: { code: -2, message: errorMessage },
				error: errorMessage,
				transient: true,
			};
		}
	}

	/**
	 * 转发到独立转换服务（env=conversion-service 模式）。
	 *
	 * 经 IFunctionExecutor（此时为 HttpConversionExecutor）POST /v1/conversions/async/convertFile
	 * + 轮询终态，把执行器结果映射回 file-conversion 的 {isOk, ret, error} 形状。
	 *
	 * 传入的 param 即 mxcadassembly 参数对象（srcpath/src_file_md5/outname/cmd/width/height...），
	 * 与进程内 spawn 传入的参数完全一致，保证两种部署模式转换结果等价。
	 * 独立服务的任务结果 = mxcadassembly 输出（含 code/newpath），metadata 承载该输出，
	 * 故 COMPLETED 时 ret 直接取 metadata（与进程内解析形状一致）。
	 */
	private async forwardViaExecutor(
		taskType: "convertFile" | "convertBinToMxweb",
		param: Record<string, unknown>,
		priority: 1 | 2 | 3,
	): Promise<ConversionResult> {
		const taskId = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
		const task: ConversionTask = {
			id: taskId,
			type: taskType,
			params: param,
			priority,
			createdAt: new Date(),
		};
		const executor = this.getFunctionExecutor();
		if (!executor) {
			// 未接线（测试/未导入 FunctionExecutorModule）：按转换失败返回，调用方走既有错误处理。
			// 执行器缺失是部署/接线问题，重试可能成功 → 瞬态。
			const err = "conversion-service executor unavailable";
			this.logger.error(`转换服务执行器不可用（${taskType}）：${err}`);
			return {
				isOk: false,
				ret: { code: -2, message: err },
				error: err,
				transient: true,
			};
		}
		const result = await executor.invoke(task);
		if (result.status === "COMPLETED") {
			const metadata = result.metadata as
				| Record<string, unknown>
				| undefined;
			// 独立服务结果 = mxcadassembly 输出（含 code/newpath），与进程内解析形状一致
			const ret: MxCadConversionResult =
				metadata && typeof metadata === "object"
					? (metadata as MxCadConversionResult)
					: { code: 0, newpath: result.outputPath };
			this.logger.log(
				`转换服务完成: ${taskType} taskId=${taskId} newpath=${result.outputPath}`,
			);
			return { isOk: true, ret };
		}
		this.logger.error(
			`转换服务失败: ${taskType} taskId=${taskId} ${result.error}`,
		);
		// 转换服务只回错误字符串、不透传失败性质，按文案归类（见 isTransientConversionError）。
		return {
			isOk: false,
			ret: { code: -1, message: result.error },
			error: result.error,
			transient: isTransientConversionError(result.error),
		};
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

	/**
	 * bin → mxweb 转换（保存链路内部转换，带并发限制）。
	 * 与 convertFile 共享同一 conversionRateLimiter：两者都 spawn 重量级 mxcadassembly 进程，
	 * 收进同一并发池才能真实约束 mxcadassembly 进程总数。此前走 ProcessPoolExecutor 时被独立
	 * RateLimiter(4) 限流、version-history 直连路径则完全裸奔，两池相加可超 CPU 核数。
	 * 保存为用户同步等待步骤，优先级 'high'。
	 *
	 * 返回 `transient` 供调用方区分「可重试的环境性失败」与「确定性内容失败」
	 * （与 convertFile 的 ConversionResult.transient 同语义）。
	 */
	async convertBinToMxweb(
		binPath: string,
		outputPath: string,
		outName: string,
	): Promise<{
		success: boolean;
		outputPath?: string;
		error?: string;
		transient?: boolean;
	}> {
		return this.conversionRateLimiter.execute(
			async () => this.executeBinToMxweb(binPath, outputPath, outName),
			"high",
		);
	}

	private async executeBinToMxweb(
		binPath: string,
		outputPath: string,
		outName: string,
	): Promise<{
		success: boolean;
		outputPath?: string;
		error?: string;
		transient?: boolean;
	}> {
		let stdout = "";
		let stderr = "";

		try {
			this.logger.log(`[convertBinToMxweb] 开始转换: ${binPath} -> ${outName}`);

			const absoluteBinPath = this.resolveToAbsolutePath(binPath);
			const absoluteOutputPath = this.resolveToAbsolutePath(outputPath);

			const param: Record<string, string> = {
				srcpath: absoluteBinPath.replace(/\\/g, "/"),
				outpath: absoluteOutputPath.replace(/\\/g, "/"),
				outname: outName,
			};

			// 部署模式分支：conversion-service 模式转发到独立转换服务。
			// 同 convertFile：转换服务 MxcadRunner 按驼峰 srcPath 读源路径（非小写 srcpath），
			// binToMxweb 额外带 outpath（输出目录）。srcPath/outpath 用已解析绝对路径，
			// 转换服务 _resolvePath 原样返回。runner 按 outpath 有无区分 binToMxweb/convertFile。
			if (this.useConversionService && this.getFunctionExecutor()) {
				const serviceParam: Record<string, unknown> = {
					srcPath: absoluteBinPath,
					outpath: absoluteOutputPath,
					outname: outName,
				};
				const result = await this.forwardViaExecutor(
					"convertBinToMxweb",
					serviceParam,
					2,
				);
				return result.isOk
					? {
							// mxcadassembly 不返回 newpath，转换服务成功时该字段为 ''（非 nullish），
							// 须用 || 而非 ?? 回落本地计算路径（与进程内分支一致），
							// 否则 outputPath='' 被调用方判为失败且 error=undefined
							// （历史版本「bin→mxweb 转换失败: undefined」根因）
							success: true,
							outputPath:
								result.ret.newpath || path.join(outputPath, outName),
						}
					: {
							success: false,
							error: result.error,
							transient: result.transient,
						};
			}

			// 参数序列化：Linux 用单引号 JSON，Windows 用原始 JSON
			const paramStr = this.isLinux()
				? JSON.stringify(param).replace(/"/g, "'")
				: JSON.stringify(param);
			const cmd = `"${this.mxCadAssemblyPath}" ${paramStr}`;
			this.logger.log(`执行 bin→mxweb 转换命令: ${cmd}`);

			// 以独立进程组运行：超时/失败时杀整组，杜绝孤儿进程累积
			const runResult = await runMxcadAssembly(
				this.mxCadAssemblyPath,
				paramStr,
				{
					cwd: this.isLinux()
						? this.mxCadBinPath || undefined
						: undefined,
					timeoutMs: this.conversionTimeoutMs,
					logger: this.logger,
				},
			);
			stdout = runResult.stdout;
			stderr = runResult.stderr;

			// 同 convertFile：超时/未正常启动先采信完整成功输出，再判失败。
			if (runResult.timedOut) {
				const salvaged = parseSuccessResult(stdout || stderr);
				if (salvaged) {
					const resultPath = path.join(outputPath, outName);
					this.logger.warn(
						`[convertBinToMxweb] 卡在超时线内完成，采信引擎成功结果: ${resultPath}`,
					);
					return { success: true, outputPath: resultPath };
				}
				const timeoutMsg = `[convertBinToMxweb] 转换超时(${this.conversionTimeoutMs}ms)`;
				this.logger.error(`${timeoutMsg}，已杀进程组`);
				return { success: false, error: timeoutMsg, transient: true };
			}

			if (runResult.exitCode === null || runResult.signal) {
				const spawnMsg = `[convertBinToMxweb] mxcadAssembly 进程未正常启动（signal=${
					runResult.signal ?? "null"
				}，stderr=${stderr.slice(0, 200) || "无"}）`;
				this.logger.error(spawnMsg);
				return { success: false, error: spawnMsg, transient: true };
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
					// 引擎返回非 0 code = 确定性内容失败
					return { success: false, error: ret.message, transient: false };
				}
			} catch (e) {
				const parseMsg = `[convertBinToMxweb] mxcadAssembly 输出无法解析（${
					e.message
				}，原始输出=${String(output).slice(0, 300) || "空"}）`;
				this.logger.error(parseMsg);
				return { success: false, error: parseMsg, transient: true };
			}
		} catch (error: unknown) {
			// 异常路径（如 spawn 失败）：stdout/stderr 已由 runMxcadAssembly 捕获（可能为空）
			const outputToCheck = stdout || stderr;

			// 检查 stdout 或 stderr 是否包含成功的结果（mxcadassembly 可能退出码非0但实际成功）
			const salvaged = outputToCheck ? parseSuccessResult(outputToCheck) : null;
			if (salvaged) {
				const resultPath = path.join(outputPath, outName);
				this.logger.log(`[convertBinToMxweb] 转换成功: ${resultPath}`);
				return { success: true, outputPath: resultPath };
			}

			const message =
				error instanceof Error ? error.message : String(error);
			this.logger.error(`[convertBinToMxweb] 转换异常: ${message}`);
			this.logger.error(`stdout: [${stdout}]`);
			this.logger.error(`stderr: [${stderr}]`);

			return { success: false, error: message, transient: true };
		}
	}
}
