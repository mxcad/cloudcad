import os from 'os';
import path from 'path';
import {
  buildEngineParams,
  parseEngineOutput,
} from '@cloudcad/contracts';
import type {
  ConversionRequest,
  MxCadConversionResult,
  MxCadEngineParams,
} from '@cloudcad/contracts';
import { MXCAD_CONFIG } from '../lib/constants';
import { log } from '../lib/utils';
import { runMxcadAssembly } from '../mxcad-exec';

/**
 * 转换执行错误：mxcadassembly 返回非 0 code / 超时 / 进程被杀 / 进程未启动 / 输出无法解析。
 * 失败一律作为普通失败返回，调用方按需重试。
 */
export class ConversionExecutionError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'ConversionExecutionError';
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
 * 以独立进程组运行 mxcadassembly（见 ../mxcad-exec.js 的 runMxcadAssembly，
 * 移植自 backend aaf2626 修复）：超时/结束时杀整组，杜绝孤儿 mxcadassembly
 * 进程累积（8-28 CPU 打满死机事故根因）。不再用 `exec`（shell 包装）+
 * `process.chdir`（全局竞态），改为 `spawn` + per-spawn cwd + Windows verbatim 传参。
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

    // 瞬时失败（超时 / 进程被杀）：可重试
    if (result.timedOut || result.signal) {
      throw new ConversionExecutionError(
        result.timedOut ? '转换超时' : `转换进程被终止 (${result.signal})`
      );
    }

    // spawn 失败（二进制缺失/无法启动，exitCode=null）：环境/瞬时错误。
    // 否则 ENOENT 的 stderr 会落进 _parseOutput 解析失败（误导的「转换输出格式错误」），
    // 掩盖真实的路径/部署问题。
    if (result.exitCode === null) {
      throw new ConversionExecutionError(
        `mxcadassembly 进程未正常启动（stderr: ${result.stderr.slice(0, 200) || '无'}）`
      );
    }

    const output = result.stdout || result.stderr || '';
    const parsed = this._parseOutput(output);

    if (parsed.code === 0) {
      log(`[MxcadRunner] 转换成功: ${params.srcPath}`);
      // 真实 mxcadassembly 只回 code/message（无 newpath），runner 按引擎行为补齐产物路径，
      // 使任务结果自描述（单任务路径无 worker-pool 的 outname 回落，消费方不能拿到空 newpath）：
      // - binToMxweb（带 outpath）：产物 = outpath/outname
      // - convertFile（无 outpath，带 outname）：引擎把 outname 写到 srcpath 同目录
      //   （与 backend 进程内 convertInProcess 的 path.join(dirname(srcPath), outname) 一致，
      //   batch 链路下游 fs.createReadStream(filePath) 依赖完整路径，纯文件名会按 cwd 解析 ENOENT）
      // - 无 outname：引擎自定产物名，位置不可推导 → ''
      let computedNewpath = '';
      if (params.outname) {
        const base = params.outpath
          ? this._resolvePath(params.outpath)
          : path.dirname(this._resolvePath(params.srcPath));
        computedNewpath = path.join(base, params.outname);
      }
      return { ...parsed, newpath: parsed.newpath || computedNewpath };
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
    throw new ConversionExecutionError(parsed.message || `转换失败, code=${parsed.code}`, parsed.code);
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

  _parseOutput(output: string): MxCadConversionResult {
    const strOutput = String(output ?? '');
    try {
      // marker 截取 + JSON.parse + code 校验集中在 @cloudcad/contracts 的 parseEngineOutput，
      // 与 backend 进程内解析同一实现（ADR-0064/0069）。
      return parseEngineOutput(strOutput);
    } catch (err) {
      log(`[MxcadRunner] 无法解析转换输出: ${(err as Error).message}`);
      return { code: 1, message: '转换输出格式错误', raw: strOutput.slice(0, 500) };
    }
  }
}

export default MxcadRunner;
