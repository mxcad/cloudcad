import os from 'os';
import path from 'path';
import {
  buildEngineParams,
  isTransientFailure,
  parseEngineOutput,
} from '@cloudcad/contracts';
import type {
  ConversionFailureCategory,
  ConversionRequest,
  MxCadConversionResult,
  MxCadEngineParams,
} from '@cloudcad/contracts';
import { MXCAD_CONFIG } from '../lib/constants';
import { log } from '../lib/utils';
import { runMxcadAssembly } from '@cloudcad/engine-exec';

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
 * 转换入参形状（ConversionRequest / MxCadEngineParams）与输出形状（MxCadConversionResult）
 * 定义在 @cloudcad/contracts 的 conversion/mxcad-engine-contract.ts，与 backend 共用；
 * 本文件是它的 adapter：负责路径绝对化、spawn 与 JSON 引号约定等环境化行为。
 */

/**
 * MxCAD 转换执行器
 * 基于 FileConversionService.executeConversion 的逻辑。
 *
 * 以独立进程组运行 mxcadassembly（@cloudcad/engine-exec 的 runMxcadAssembly，
 * backend 进程内转换与转换服务共用同一实现）：超时/结束时杀整组，杜绝孤儿
 * mxcadassembly 进程累积（8-28 CPU 打满死机事故根因）。不用 `exec`（shell 包装）+
 * `process.chdir`（全局竞态），改用 `spawn` + per-spawn cwd + Windows verbatim 传参。
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
    // 与 backend file-conversion.service.ts 保持一致。
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

    // 超时：先救回已完整的引擎输出，再判失败。
    // 引擎常被超时掐在「已写完产物、未及退出」的状态（大图纸尤其常见），此时 stdout
    // 里已有完整 {"code":0}。不救回就把一次成功的转换判成 FAILED 并触发重试，
    // 与 backend 进程内路径（file-conversion.service 的超时救回）行为正好相反——
    // 同一个慢转换，两种部署模式结论相反。
    if (result.timedOut) {
      const salvaged = this._parseOutput(result.stdout || result.stderr || '');
      if (salvaged && salvaged.code === 0) {
        log(`[MxcadRunner] 超时但引擎输出已完整，采信成功结果: ${params.srcPath}`);
        return this._withNewpath(salvaged, params);
      }
      throw new ConversionExecutionError('转换超时', 'timeout');
    }

    // 进程被信号终止（用户取消 / OOM / 杀整组）：环境性失败，可重试。
    // 与 backend 进程内路径一致：signal 分支不救回输出（backend 只救回 timedOut）。
    if (result.signal) {
      throw new ConversionExecutionError(
        `转换进程被终止 (${result.signal})`,
        'killed'
      );
    }

    // spawn 失败（二进制缺失/无法启动，exitCode=null）：环境/瞬时错误。
    // 否则 ENOENT 的 stderr 会落进 _parseOutput 解析失败（误导的「转换输出格式错误」），
    // 掩盖真实的路径/部署问题。
    if (result.exitCode === null) {
      throw new ConversionExecutionError(
        `mxcadassembly 进程未正常启动（stderr: ${result.stderr.slice(0, 200) || '无'}）`,
        'not-started'
      );
    }

    const output = result.stdout || result.stderr || '';
    const parsed = this._parseOutput(output);
    if (!parsed) {
      // 输出截断/畸形：环境性失败（引擎可能被中途打断），按分类抛出让上层可重试
      throw new ConversionExecutionError(
        `转换输出格式错误（原始输出=${output.slice(0, 200) || '空'}）`,
        'output-unparseable'
      );
    }

    if (parsed.code === 0) {
      log(`[MxcadRunner] 转换成功: ${params.srcPath}`);
      return this._withNewpath(parsed, params);
    }

    // 内容失败（解析/格式错，mxcadassembly 返回非 0 code）
    // 记录引擎原始 stdout/stderr：引擎常只回 {"code":非0,"message":"false"}（"false" 无信息量），
    // 不记录则真因被吞，重试再失败也无从排查。
    // 带上 cmd（print_to_pdf/cut_dwg 等）便于定位是哪类命令失败。
    // 打出引擎实际收到的关键参数（含裁剪框 bd_pt*）：对照前端发的 box.param，
    // 能看出裁剪框到底有没有传到引擎（漏字段 vs 前端没发 vs 引擎不认）。
    log(
      `[MxcadRunner] 转换失败: cmd=${params.cmd || '-'} code=${parsed.code} message=${parsed.message} ` +
        `bd_pt1_x=${params.bd_pt1_x} bd_pt1_y=${params.bd_pt1_y} bd_pt2_x=${params.bd_pt2_x} bd_pt2_y=${params.bd_pt2_y} ` +
        `open_file_md5=${params.open_file_md5} width=${params.width} height=${params.height} outname=${params.outname} ` +
        `stdout=[${(result.stdout || '').slice(0, 500)}] ` +
        `stderr=[${(result.stderr || '').slice(0, 500)}]`
    );
    throw new ConversionExecutionError(
      parsed.message || `转换失败, code=${parsed.code}`,
      'content-error',
      parsed.code
    );
  }

  /**
   * 按引擎行为补齐产物路径，使任务结果自描述。
   *
   * 真实 mxcadassembly 只回 code/message（无 newpath）；单任务路径没有 worker-pool 的
   * outname 回落，消费方不能拿到空 newpath。抽出为方法，供正常成功与超时救回两条路径复用。
   * - binToMxweb（带 outpath）：产物 = outpath/outname
   * - convertFile（无 outpath，带 outname）：引擎把 outname 写到 srcpath 同目录
   *   （与 backend 进程内 convertInProcess 的 path.join(dirname(srcPath), outname) 一致，
   *   batch 链路下游 fs.createReadStream(filePath) 依赖完整路径，纯文件名会按 cwd 解析 ENOENT）
   * - 无 outname：引擎自定产物名，位置不可推导 → ''
   */
  _withNewpath(
    parsed: MxCadConversionResult,
    params: ConversionRequest
  ): MxCadConversionResult {
    let computedNewpath = '';
    if (params.outname) {
      const base = params.outpath
        ? this._resolvePath(params.outpath)
        : path.dirname(this._resolvePath(params.srcPath));
      computedNewpath = path.join(base, params.outname);
    }
    return { ...parsed, newpath: parsed.newpath || computedNewpath };
  }

  /**
   * 构建 mxcadassembly 参数对象。字段翻译与判定条件全部来自 @cloudcad/contracts 的
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

  /**
   * 解析引擎输出；无法解析时返回 null，由调用方决定分类。
   *
   * 旧实现在这里返回 `{code:1, message:'转换输出格式错误'}`，把「解析失败」伪装成
   * 一个引擎结果对象——失败性质随之下游丢失，上层只能靠 message 文案反推。
   * 现在解析失败返回 null，调用方按 'output-unparseable' 分类抛出。
   */
  _parseOutput(output: string): MxCadConversionResult | null {
    const strOutput = String(output ?? '');
    try {
      // marker 截取 + JSON.parse + code 校验集中在 @cloudcad/contracts 的 parseEngineOutput，
      // 与 backend 进程内解析同一实现（ADR-0064/0069）。
      return parseEngineOutput(strOutput);
    } catch (err) {
      log(`[MxcadRunner] 无法解析转换输出: ${(err as Error).message}`);
      return null;
    }
  }
}

export default MxcadRunner;
