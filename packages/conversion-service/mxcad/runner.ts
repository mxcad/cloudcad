import os from 'os';
import path from 'path';
import {
  buildEngineParams,
  isTransientFailure,
} from '@cloudcad/contracts';
import type {
  ConversionFailureCategory,
  ConversionRequest,
  MxCadConversionResult,
  MxCadEngineParams,
} from '@cloudcad/contracts';
import type { EngineRunOutcome } from '@cloudcad/engine-exec';
import {
  interpretEngineRun,
  runMxcadAssembly,
} from '@cloudcad/engine-exec';
import { MXCAD_CONFIG } from '../lib/constants';
import { log } from '../lib/utils';

/**
 * 转换执行错误：mxcadassembly 返回非 0 code / 超时 / 进程被杀 / 进程未启动 / 输出无法解析。
 * 失败一律作为普通失败返回，调用方按需重试。
 *
 * category 是结构化的失败性质（@cloudcad/contracts 的失败分类契约），随任务状态
 * 跨 HTTP 边界下发给 backend，让上层按字段而非错误文案判定「可重试 vs 确定性失败」；
 * message 只用于日志与 UI 展示，不再作分类依据。
 */
export class ConversionExecutionError extends Error {
  /** 失败性质分类 */
  category: ConversionFailureCategory;
  /** 引擎返回码（仅 content-error 时为非 0） */
  code?: number;

  /**
   * 是否瞬态（可重试）：由 category 派生，不单独存储。
   * 唯一不可重试分类是 content-error（引擎返回非 0 code，同一输入重试注定再失败）。
   */
  get transient(): boolean {
    return isTransientFailure(this.category);
  }

  constructor(
    message: string,
    category: ConversionFailureCategory = 'unknown',
    code?: number
  ) {
    super(message);
    this.name = 'ConversionExecutionError';
    this.category = category;
    this.code = code;
  }
}

/**
 * MxCAD 转换执行器 —— 对 @cloudcad/engine-exec 的 adapter。
 *
 * 以独立进程组运行 mxcadassembly（@cloudcad/engine-exec 的 runMxcadAssembly，
 * backend 进程内转换与转换服务共用同一 spawn 实现）：超时/结束时杀整组，杜绝孤儿
 * mxcadAssembly 进程累积（8-28 CPU 打满死机事故根因）。不用 `exec`（shell 包装）+
 * `process.chdir`（全局竞态），改用 `spawn` + per-spawn cwd + Windows verbatim 传参。
 *
 * 本类**不再自己解读引擎输出**：超时救回 / signal / exitCode===null / 解析失败 /
 * code 判定的顺序集中在 interpretEngineRun，backend 的 FileConversionService 调用
 * 同一个函数。此前两侧各写一份、靠手写注释维持「与 backend 一致」，超时救回甚至出现
 * 过两侧结论相反的缺陷。这里只保留 adapter 独有的三件事：
 * - 环境化路径解析与参数构建（_buildParam / _resolvePath）；
 * - spawn 侧的 Linux 单引号 JSON 与 cwd 约定；
 * - 把解读结论映射为跨 HTTP 边界的 ConversionExecutionError。
 */
class MxcadRunner {

  async execute(
    params: ConversionRequest,
    timeout?: number,
    onChild?: (kill: () => void) => void,
    runFn: typeof runMxcadAssembly = runMxcadAssembly
  ): Promise<MxCadConversionResult> {
    const param = this._buildParam(params);

    const isLinux = os.platform() === 'linux';
    // 参数序列化：Linux 用单引号 JSON（mxcadassembly 约定），Windows 用原始 JSON。
    const arg = isLinux
      ? JSON.stringify(param).replace(/"/g, "'")
      : JSON.stringify(param);
    // per-spawn cwd（不再 process.chdir 全局切目录，消除并发转换互相踩工作目录的竞态）：
    // Linux 下 mxcadassembly 依赖其自身目录加载资源。
    const cwd = isLinux ? MXCAD_CONFIG.binPath || undefined : undefined;

    const result = await runFn(MXCAD_CONFIG.assemblyPath, arg, {
      cwd,
      timeoutMs: timeout ?? 60000,
      onChild,
    });

    // 结果解读的唯一实现：超时救回 → signal → exitCode===null → 解析 → code 判定。
    // 引擎常被超时掐在「已写完产物、未及退出」的状态（大图纸尤其常见），此时 stdout 里
    // 已有完整 {"code":0}——不救回就把一次成功的转换判成 FAILED 并触发重试。
    const outcome = interpretEngineRun(result, { param });
    if (outcome.ok) {
      // salvaged = 引擎被超时掐在「已写完产物、未及退出」，结果从 stdout 救回。
      // 单独标注：否则日志里看不出这次成功是靠救回而非正常退出。
      log(
        outcome.salvaged
          ? `[MxcadRunner] 转换超时但已写完产物，采信成功结果: ${params.srcPath}`
          : `[MxcadRunner] 转换成功: ${params.srcPath}`
      );
      return outcome.result!;
    }

    if (outcome.category === 'content-error') {
      // 记录引擎原始 stdout/stderr：引擎常只回 {"code":非0,"message":"false"}（"false" 无信息量），
      // 不记录则真因被吞，重试再失败也无从排查。
      // 带上 cmd（print_to_pdf/cut_dwg 等）便于定位是哪类命令失败。
      // 打出引擎实际收到的关键参数（含裁剪框 bd_pt*）：对照前端发的 box.param，
      // 能看出裁剪框到底有没有传到引擎（漏字段 vs 前端没发 vs 引擎不认）。
      log(
        `[MxcadRunner] 转换失败: cmd=${params.cmd || '-'} ` +
          `code=${outcome.result?.code} message=${outcome.result?.message} ` +
          `bd_pt1_x=${params.bd_pt1_x} bd_pt1_y=${params.bd_pt1_y} ` +
          `bd_pt2_x=${params.bd_pt2_x} bd_pt2_y=${params.bd_pt2_y} ` +
          `open_file_md5=${params.open_file_md5} width=${params.width} ` +
          `height=${params.height} outname=${params.outname} ` +
          `stdout=[${(result.stdout || '').slice(0, 500)}] ` +
          `stderr=[${(result.stderr || '').slice(0, 500)}]`
      );
    }

    throw this.toExecutionError(outcome, result.stderr || '');
  }

  /**
   * 把解读结论映射为跨 HTTP 边界的错误。
   *
   * message 是本服务对 backend 的**展示文案**，与 backend 进程内转换的中文文案刻意不同
   * （两侧各自面向自己的日志与 UI），但 category 同源，判定依据从不依赖文案。
   */
  private toExecutionError(
    outcome: EngineRunOutcome,
    stderr: string
  ): ConversionExecutionError {
    switch (outcome.category) {
      case 'timeout':
        return new ConversionExecutionError('转换超时', 'timeout');

      case 'killed':
        return new ConversionExecutionError(
          `转换进程被终止 (${outcome.signal})`,
          'killed'
        );

      case 'not-started':
        // 否则 ENOENT 的 stderr 会落进解析失败（误导的「转换输出格式错误」），
        // 掩盖真实的路径/部署问题。
        return new ConversionExecutionError(
          `mxcadAssembly 进程未正常启动（stderr: ${
            stderr.slice(0, 200) || '无'
          }）`,
          'not-started'
        );

      case 'output-unparseable':
        return new ConversionExecutionError(
          `转换输出格式错误（${outcome.rawFragment}）`,
          'output-unparseable'
        );

      default:
        return new ConversionExecutionError(
          outcome.result?.message ||
            `转换失败, code=${outcome.result?.code ?? 'unknown'}`,
          'content-error',
          outcome.result?.code
        );
    }
  }

  /**
   * 构建 mxcadAssembly 参数对象。字段翻译与判定条件全部来自 @cloudcad/contracts 的
   * buildEngineParams（backend 与 conversion-service 共用，ADR-0064/0069）；本方法只做两件事：
   * 入参兜底校验 + 本服务的环境化路径解析。
   *
   * binToMxweb（带 outpath）：srcpath + outpath + outname，无 src_file_md5；
   * convertFile（无 outpath）：srcpath + src_file_md5 + create_preloading_data + 可选参数。
   */
  _buildParam(params: ConversionRequest): MxCadEngineParams {
    // 源路径缺失时显式报错（而非交给引擎回 read file error 无从定位）：
    // 契约上 srcPath 必填，但 HTTP 边界是松包（Record<string,unknown>），
    // 可能塞入缺 srcPath 的畸形对象。
    if (!params.srcPath) {
      throw new ConversionExecutionError('转换参数缺少 srcPath');
    }

    const param = buildEngineParams(params);
    // 入站路径先按本机 cwd 绝对化（_resolvePath），再交 buildEngineParams 归一为
    // 引擎约定的正斜杠；srcpath/outpath 之外的字段不含路径，无需二次处理。
    param.srcpath = this._resolvePath(params.srcPath).replace(/\\/g, '/');
    if (params.outpath) {
      param.outpath = this._resolvePath(params.outpath).replace(/\\/g, '/');
    }
    return param;
  }

  _resolvePath(inputPath: string): string {
    if (!inputPath) return inputPath;
    if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
    return path.resolve(process.cwd(), inputPath);
  }
}

export default MxcadRunner;
