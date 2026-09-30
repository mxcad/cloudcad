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
import {
	interpretEngineRun,
	resolveEngineNewpath,
	runMxcadAssembly,
	salvageSuccessResult,
} from "@cloudcad/engine-exec";
import type { EngineRunOutcome } from "@cloudcad/engine-exec";
import {
	IFunctionExecutor,
	type ConversionTask,
} from "../../function-executor/function-executor.interface";
import {
	ENGINE_INPUT_FIELDS,
	buildEngineParams,
	isTransientFailure,
} from "@cloudcad/contracts";
import type {
	ConversionRequest,
	EngineInputField,
	MxCadEngineParams,
} from "@cloudcad/contracts";
import { cachedArtifactReady } from "../utils/conversion-artifact";

/**
 * 从转换选项中挑选契约定义的引擎输入字段（camelCase），丢弃 undefined 字段。
 *
 * 供「转发给 conversion-service」路径使用：HTTP 边界只应携带引擎认识的字段，
 * 编排字段（userId/timeout/priority/debugNodeId/traceid/...）不进转换服务。
 * 字段集来自 ENGINE_INPUT_FIELDS 唯一清单而非第二份手写枚举——721fe02 漏抄 6 字段
 * 的根因正是这里与进程内 param 各自维护一套手写字段表。
 */
function pickContractFields(options: ConversionOptions): ConversionRequest {
	const picked: Partial<Record<EngineInputField, unknown>> = {};
	for (const field of ENGINE_INPUT_FIELDS) {
		const value = (options as Partial<Record<EngineInputField, unknown>>)[field];
		if (value !== undefined) picked[field] = value;
	}
	return picked as ConversionRequest;
}

/**
 * 从 convertServerFile 入口参数中挑选契约定义的引擎输入字段（camelCase）。
 *
 * 与 pickContractFields 同形、同源于 ENGINE_INPUT_FIELDS 唯一清单：入口形状
 * （ConvertServerFileParam）与映射各只维护一份，新增引擎字段自动进映射，
 * 不再靠手写枚举（此前此处手写 12 字段，丢 11 个引擎字段——裁剪框/打印角度/
 * 布局/压缩等经此入口永不可达，368ca55 同类事故）。width/height 引擎侧是
 * 字符串，入口允许 number，在此统一 String()。
 */
function pickEngineFields(
	param: ConvertServerFileParam,
): Partial<ConversionOptions> {
	const picked: Partial<Record<EngineInputField, unknown>> = {};
	for (const field of ENGINE_INPUT_FIELDS) {
		const value = (param as Partial<Record<EngineInputField, unknown>>)[field];
		if (value === undefined) continue;
		picked[field] =
			field === 'width' || field === 'height' ? String(value) : value;
	}
	return picked as Partial<ConversionOptions>;
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
	private readonly mxcadUploadPath: string;
	/** 单次 mxcadassembly 转换超时（毫秒），来自 timeout.fileConversion，默认 180000 */
	private readonly conversionTimeoutMs: number;
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

		// 与 UploadUtilityService 同一配置键与同一相对路径默认值：产物命名与目录形态
		// 必须一致，否则本服务的就位检查会与秒传存在性检查给出相反结论。
		this.mxcadUploadPath =
			this.configService.get('mxcadUploadPath') || '../../uploads';

		// 转换超时可经 env TIMEOUT_FILE_CONVERSION 调整（默认 180000，
		// 与 conversion-service 1/2 级超时对齐；大图纸常超 60s，旧默认会把慢转换误杀）
		const timeoutMs = this.configService.get<number>('timeout.fileConversion');
		this.conversionTimeoutMs =
			typeof timeoutMs === "number" && timeoutMs > 0
				? timeoutMs
				: 180000;
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
	 * 转换前产物就位短路：产物已存在且非空则直接返回成功，不再 spawn 引擎。
	 *
	 * 缓存判定此前只存在于摄入边界（ingestWholeFile 的 `!forceUpload` 秒传分支），
	 * 因此 5 条路径的冗余转换全部绕过它：forceUpload、分片合并 ingestChunks、
	 * 无节点 ingestNoNodePreview、面板触发 convertNode / retryTask，以及本方法自身。
	 * 这 5 条最终都汇聚到 convertFile，在此加一道即全部覆盖。
	 *
	 * 仅对「打开方向」的默认产物命名生效（源 CAD → 上传目录
	 * `<hash>.<源扩展名>.mxweb`）。导出方向（.mxweb 源）、bin→mxweb（outpath）、
	 * 自定义产物名或命令（outname/cmd）的产物位置不可推导，一律回落真实转换。
	 * 产物不在、或任何 fs 异常一律返回 null 走原逻辑，fail-closed。
	 */
	private cachedConversionResult(
		options: ConversionOptions
	): ConversionResult | null {
		if (
			!options.fileHash ||
			options.outpath !== undefined ||
			options.outname ||
			options.cmd ||
			this.isExportDirection(options.srcPath)
		) {
			return null;
		}

		if (!cachedArtifactReady(this.mxcadUploadPath, options.fileHash, options.srcPath)) {
			return null;
		}

		this.logger.log(
			`转换产物已就位，跳过引擎执行: ${path.basename(options.srcPath)}`
		);
		// newpath 与真实转换保持一致为 ''：本方向引擎不回 newpath，
		// resolveEngineNewpath 的回落值即 ''，调用方按既有语义处理。
		return { isOk: true, ret: { code: 0, message: "ok", newpath: "" } };
	}

	/**
	 * 实际执行文件转换（内部方法）
	 */
	private async executeConversion(
		options: ConversionOptions,
	): Promise<ConversionResult> {
		const cached = this.cachedConversionResult(options);
		if (cached) return cached;

		let stdout = "";
		let stderr = "";
		let commandStr = "";
		let absoluteSrcPath = "";
		// 声明在 try 外：catch 的异常救回分支也要用它做 newpath 回落。
		let param: MxCadEngineParams = { srcpath: "" };

		try {
			const { srcPath, compression = this.compression } = options;

			// 确保源文件路径是绝对路径
			absoluteSrcPath = this.resolveToAbsolutePath(srcPath);

			// 引擎参数对象（srcpath/src_file_md5/dwg_version 等小写下划线低层形状）统一由
			// @cloudcad/contracts 的 buildEngineParams 生成：字段集与逐字段判定条件
			// （truthy vs !== undefined）与 conversion-service runner 同源，见 ADR-0064/0069。
			// 此前这里手写 20+ 行 if 分支，是 721fe02 漏抄 6 字段的根因。
			param = buildEngineParams({
				...options,
				srcPath: absoluteSrcPath,
				compression,
			});

			// 部署模式分支：conversion-service 模式转发到独立转换服务（经 IFunctionExecutor）。
			// 关键：转换服务的 MxcadRunner 按 camelCase 契约形状读取入参（srcPath/fileHash/
			// createPreloadingData/outname/...），并非 mxcadassembly 小写参数（srcpath/src_file_md5/...）。
			// 故此处转发契约形状（srcPath 用已解析绝对路径，转换服务 _resolvePath 原样返回），
			// 而非下方进程内 spawn 用的 mxcadassembly 参数 param——否则转换服务读 params.srcPath 恒 undefined，
			// _resolvePath 返回 undefined 后 .replace 崩溃（Cannot read properties of undefined）。
			// pickContractFields 按 ENGINE_INPUT_FIELDS 唯一清单取字段（srcPath/compression 用已解析有效值），
			// 与进程内 buildEngineParams 结果等价，且不会再漏抄字段。
			// 默认（本地执行器）走下方进程内 spawn，行为不变。
			// 守卫按执行器自声明的 isRemote 判定（fail-closed：缺省/未知一律不转发）：
			// ProcessPoolExecutor 的 executeTask 回调本服务 convertFile，向其转发会
			// convertFile↔invoke 无限递归死锁（f2df958 曾删此守卫，2026-09-18 回归）。
			// 执行器选谁仍由 FunctionExecutorModule 按 FUNCTION_EXECUTOR 一处决定，此处不读配置。
			if (this.getFunctionExecutor()?.isRemote === true) {
				return await this.forwardViaExecutor(
					"convertFile",
					pickContractFields({
						...options,
						srcPath: absoluteSrcPath,
						compression,
					}),
					options.priority === "low" ? 3 : 2,
					options.debugNodeId,
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

			// 引擎结果解读（超时救回 → signal → exitCode===null → 解析 → 分类）集中在
			// @cloudcad/engine-exec 的 interpretEngineRun：backend 进程内转换与
			// conversion-service 队列执行器共用同一份判定顺序，不再各写一遍。
			// 本方法只负责本服务的 adapter 职责：渲染用户可见文案、按 debugNodeId 落盘调试信息。
			return await this.toConversionResult(
				interpretEngineRun(runResult, { param }),
				{
				subject: "文件转换",
				prefix: "",
				absoluteSrcPath,
					commandStr,
					stdout,
					stderr,
					timeoutMs: options.timeout || this.conversionTimeoutMs,
					debugNodeId: options.debugNodeId,
				},
			);

		} catch (error: unknown) {
			// 异常路径（如 spawn 失败）：stdout/stderr 已由 runMxcadAssembly 捕获（可能为空）
			const outputToCheck = stdout || stderr;

			// 检查 stdout 或 stderr 是否包含成功的结果（mxcadassembly 可能退出码非0但实际成功）
			const salvaged = outputToCheck ? salvageSuccessResult(outputToCheck) : null;
			if (salvaged) {
				this.logger.log(`文件转换成功: ${options.srcPath}`);
				return { isOk: true, ret: resolveEngineNewpath(salvaged, param) };
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
					errorCategory: "unknown",
					transient: isTransientFailure("unknown"),
				};
		}
	}

	/**
	 * 把引擎结果解读结论映射为 ConversionResult：本服务对 interpretEngineRun 的 adapter。
	 *
	 * 判定顺序与失败分类来自 @cloudcad/engine-exec（backend 与 conversion-service 共用的
	 * 唯一解读点）；本方法只做两件 adapter 职责：
	 * - 渲染用户可见文案（timeout/spawn/parse 各自一句中文，含超时毫秒与 stderr 片段）；
	 * - 按 debugNodeId 落盘失败现场（content-error 遵循 isSkipDebugError 的豁免）。
	 *
	 * transient 一律由分类派生（isTransientFailure），不在此硬编码 true/false——
	 * 唯一不可重试分类是 content-error，写死会与分类语义分叉。
	 * convertFile 与 convertBinToMxweb 共用本方法，只靠 subject/prefix 区分方向。
	 */
	private async toConversionResult(
		outcome: EngineRunOutcome,
		span: {
			/** 超时/成功/失败文案的主语：「文件转换」或「[convertBinToMxweb] 转换」 */
			subject: string;
			/** spawn/解析失败文案的方向前缀：convertFile 为空串 */
			prefix: string;
			absoluteSrcPath: string;
			commandStr: string;
			stdout: string;
			stderr: string;
			timeoutMs: number;
			debugNodeId?: string;
		},
	): Promise<ConversionResult> {
		if (outcome.ok) {
			if (outcome.salvaged) {
				// 引擎被掐在「已写完产物、未及退出」：结果来自超时救回。用 warn 保留这条罕见信号，
				// 否则日志里「引擎刚好卡在超时线内转完」与「正常返回」无法区分。
				this.logger.warn(
					`${span.subject}卡在超时线内完成，采信引擎成功结果: ${span.absoluteSrcPath}`,
				);
			} else {
				this.logger.log(`${span.subject}成功: ${span.absoluteSrcPath}`);
			}
			return { isOk: true, ret: outcome.result! };
		}

		switch (outcome.category) {
			case "timeout": {
				const msg = `${span.subject}超时(${span.timeoutMs}ms)`;
				this.logger.error(`${msg}，已杀进程组`);
				return {
					isOk: false,
					ret: { code: -2, message: msg },
					error: msg,
					errorCategory: "timeout",
					transient: isTransientFailure("timeout"),
				};
			}

			case "killed":
			case "not-started": {
				// 引擎进程未正常退出：signal 非空（被信号杀死）或 exitCode===null（spawn 失败）。
				// 必须早于「解析输出」判定，否则 ENOENT 的 stderr 会被误判成输出格式错误，
				// 掩盖真实的路径/部署问题。
				const msg = `${span.prefix}mxcadAssembly 进程未正常启动（signal=${
					outcome.signal ?? "null"
				}，stderr=${span.stderr.slice(0, 200) || "无"}）`;
				this.logger.error(msg);
				return {
					isOk: false,
					ret: { code: -2, message: msg },
					error: msg,
					errorCategory: outcome.category,
					transient: isTransientFailure(outcome.category),
				};
			}

			case "output-unparseable": {
				// 引擎已退出但输出不是可解析的 JSON——引擎协议/配置异常，属环境性失败。
				const msg = `${span.prefix}mxcadAssembly 输出无法解析（${
					outcome.rawFragment
				}）`;
				this.logger.error(`解析 MxCAD 输出失败: ${msg}`);
				if (span.debugNodeId) {
					await this.saveConversionDebugInfo({
						nodeId: span.debugNodeId,
						srcPath: span.absoluteSrcPath,
						commandStr: span.commandStr,
						exitCode: -1,
						stdout: span.stdout,
						stderr: span.stderr,
						errorMessage: "解析输出失败",
					});
				}
				return {
					isOk: false,
					ret: { code: -2, message: msg },
					error: msg,
					errorCategory: "output-unparseable",
					transient: isTransientFailure("output-unparseable"),
				};
			}

			default: {
				// content-error：引擎返回非 0 code，确定性内容失败，同一输入重试注定再失败。
				const ret = outcome.result ?? { code: -2, message: "转换失败" };
				this.logger.error(`${span.subject}失败: ${ret.message}`);
				if (span.debugNodeId && !this.isSkipDebugError(ret)) {
					await this.saveConversionDebugInfo({
						nodeId: span.debugNodeId,
						srcPath: span.absoluteSrcPath,
						commandStr: span.commandStr,
						exitCode: ret.code,
						stdout: span.stdout,
						stderr: span.stderr,
						errorMessage: ret.message || "转换失败",
					});
				}
				return {
					isOk: false,
					ret,
					error: ret.message,
					errorCategory: "content-error",
					transient: isTransientFailure("content-error"),
				};
			}
		}
	}

	/**
	 * 转发到独立转换服务（env=conversion-service 模式）。
	 *
	 * 经 IFunctionExecutor（此时为 HttpConversionExecutor）POST /v1/conversions/async/convertFile
	 * + 轮询终态，把执行器结果映射回 file-conversion 的 {isOk, ret, error} 形状。
	 *
	 * 传入的 param 即 camelCase 契约请求对象（srcPath/fileHash/outname/cmd/width/height...），
	 * 与进程内 buildEngineParams 的输入同源，保证两种部署模式转换结果等价。
	 * 独立服务的任务结果 = mxcadassembly 输出（含 code/newpath），metadata 承载该输出，
	 * 故 COMPLETED 时 ret 直接取 metadata（与进程内解析形状一致）。
	 */
	private async forwardViaExecutor(
		taskType: "convertFile" | "convertBinToMxweb",
		param: ConversionRequest,
		priority: 1 | 2 | 3,
		// 编排字段不进契约（pickContractFields 已剔除），调试信息落盘单独透传——
		// 否则转发模式失败时 saveConversionDebugInfo 永不执行，运维丢失失败现场
		debugNodeId?: string,
	): Promise<ConversionResult> {
		const taskId = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
		// taskType 是 ConversionTask 三元联合中「convertFile | convertBinToMxweb」两元子集，
		// 两分支 params 形状不同，无法由单一 ConversionRequest 静态对应到具体分支，故整体断言
		// （运行期字段形状由 buildEngineParams/pickContractFields 与调用方字面量保证）。
		const task = {
			id: taskId,
			type: taskType,
			params: param,
			priority,
			createdAt: new Date(),
		} as ConversionTask;
		const executor = this.getFunctionExecutor();
		if (!executor) {
			// 未接线（测试/未导入 FunctionExecutorModule）：按转换失败返回，调用方走既有错误处理。
			// 执行器缺失是部署/接线问题，重试可能成功 → 瞬态。
			const err = "conversion-service executor unavailable";
			this.logger.error(`转换服务执行器不可用（${taskType}）：${err}`);
			if (debugNodeId) {
				await this.saveConversionDebugInfo({
					nodeId: debugNodeId,
					srcPath: param.srcPath || "",
					commandStr: `forwarded to conversion-service (${taskType}), no local command`,
					exitCode: -1,
					stdout: "",
					stderr: "",
					errorMessage: err,
				});
			}
			return {
				isOk: false,
				ret: { code: -2, message: err },
				error: err,
				errorCategory: "unknown",
				transient: isTransientFailure("unknown"),
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
		// 失败性质由转换服务结构化下发（errorCategory），不再按错误文案反推——
		// 此前两侧靠中文字符串匹配，marker 是「进程被终止」而 runner 抛「转换进程被终止」，
		// 靠 includes 子串侥幸命中，runner 改文案即静默翻转 transient 语义。
		// errorCode 缺省回落 -1（与旧实现一致），缺分类按瞬态处理。
		const transient = isTransientFailure(result.errorCategory);
		if (debugNodeId) {
			// 转发模式失败现场落盘（与进程内路径对齐）：引擎输出在 metadata，无本地命令/stderr
			const metadata = result.metadata;
			await this.saveConversionDebugInfo({
				nodeId: debugNodeId,
				srcPath: param.srcPath || "",
				commandStr: `forwarded to conversion-service (${taskType}), no local command`,
				exitCode: result.errorCode ?? -1,
				stdout: metadata ? JSON.stringify(metadata) : "",
				stderr: "",
				errorMessage: result.error || "转换服务失败",
			});
		}
		return {
			isOk: false,
			ret: { code: result.errorCode ?? -1, message: result.error },
				error: result.error,
				errorCategory: result.errorCategory,
				transient,
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

	async convertServerFile(
		param: ConvertServerFileParam
	): Promise<MxCadConversionResult> {
		try {
			if (!param) {
				return { code: 12, message: 'param error' };
			}

			const conversionOptions: ConversionOptions = {
				// 引擎字段按 ENGINE_INPUT_FIELDS 唯一清单派生（全 21 字段，含裁剪框/
				// 打印角度/布局/压缩等），不再手写枚举——手写 12 字段曾让 11 个引擎
				// 字段经此入口永不可达（368ca55 同类事故：漏抄字段引擎静默回 "false"）。
				// srcPath/fileHash 兼容旧 API 小写命名，由下方显式值覆盖派生值。
				...pickEngineFields(param),
				srcPath: param.srcPath || param.srcpath || '',
				fileHash: param.fileHash || param.src_file_md5 || '',
				userId: param.userId,
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

			const binRequest: ConversionRequest = {
				srcPath: absoluteBinPath,
				outpath: absoluteOutputPath,
				outname: outName,
			};
			// 引擎参数由 buildEngineParams 翻译（带 outpath → bin→mxweb 分支：srcpath+outpath+outname，
			// 不写 src_file_md5），路径归一化也在其中完成；进程内与转发共用这一个请求对象。
			const param = buildEngineParams(binRequest);

			// 部署模式分支：conversion-service 模式转发到独立转换服务。
			// 同 convertFile：转换服务 MxcadRunner 按驼峰 srcPath 读源路径（非小写 srcpath），
			// binToMxweb 额外带 outpath（输出目录）。srcPath/outpath 用已解析绝对路径，
			// 转换服务 _resolvePath 原样返回。runner 按 outpath 有无区分 binToMxweb/convertFile。
			// 守卫同 convertFile 按 isRemote 判定（本地执行器不得转发，防递归死锁）。
			if (this.getFunctionExecutor()?.isRemote === true) {
				const result = await this.forwardViaExecutor(
					"convertBinToMxweb",
					binRequest,
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

			// 同 convertFile：结果解读集中在 interpretEngineRun（含超时救回与判定顺序）。
			// 产物路径按调用方给的 outputPath 回显，不做绝对化——调用方可能传相对路径，
			// 改形状会让返回值与历史行为不一致（runner 的 newpath 仅用于 convertFile）。
			const resultPath = path.join(outputPath, outName);
			const result = await this.toConversionResult(
				interpretEngineRun(runResult, { param }),
				{
					subject: "[convertBinToMxweb] 转换",
					prefix: "[convertBinToMxweb] ",
					absoluteSrcPath: absoluteBinPath,
					commandStr: cmd,
					stdout,
					stderr,
					timeoutMs: this.conversionTimeoutMs,
				},
			);
			return result.isOk
				? { success: true, outputPath: resultPath }
				: { success: false, error: result.error, transient: result.transient };
		} catch (error: unknown) {
			// 异常路径（如 spawn 失败）：stdout/stderr 已由 runMxcadAssembly 捕获（可能为空）
			const outputToCheck = stdout || stderr;

			// 检查 stdout 或 stderr 是否包含成功的结果（mxcadassembly 可能退出码非0但实际成功）
			const salvaged = outputToCheck ? salvageSuccessResult(outputToCheck) : null;
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
