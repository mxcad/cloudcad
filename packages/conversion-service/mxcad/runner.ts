import os from 'os';
import path from 'path';
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
 * 转换任务参数（backend ↔ conversion-service HTTP 契约，camelCase ConversionOptions 形状，
 * 见 ADR-0064）。runner 消费的身份/输出字段显式建模；`[key: string]: unknown` 容纳
 * batch 子任务的 `id` 及未显式建模的透传字段（HTTP 边界本为松包，runner 运行时校验 srcPath）。
 */
export interface ConversionTaskParams {
  /** 源文件路径（必填，缺失时 _buildParam 显式报错） */
  srcPath: string;
  fileHash?: string;
  createPreloadingData?: boolean;
  outname?: string;
  cmd?: string;
  width?: string | number;
  height?: string | number;
  colorPolicy?: string;
  outjpg?: string;
  roate_angle?: number;
  view_angle?: number;
  dwgVersion?: number;
  layout_name?: string;
  compression?: boolean;
  /**
   * cut_dwg/print_to_pdf 的裁剪框/打印区域 + 引用原文件 + 是否建图块（mxcadassembly 小写
   * 透传字段）。721fe02 重构 serviceParam 时后端漏抄、_buildParam 也未转发，致这两命令
   * 缺区域信息回 {"message":"false"}；此处显式建模并转发，与进程内 spawn 等价。
   */
  bd_pt1_x?: string;
  bd_pt1_y?: string;
  bd_pt2_x?: string;
  bd_pt2_y?: string;
  open_file_md5?: string;
  create_clip_block?: boolean;
  /** binToMxweb 方向（.bin → .mxweb）的输出目录；存在时走 outpath 形状（无 src_file_md5） */
  outpath?: string;
  /** batch 子任务 ID / 未显式建模的透传字段 */
  [key: string]: unknown;
}

/**
 * 转换结果 = mxcadassembly 二进制 JSON 输出（stdout 里的 {"code":...}，成败只认 code、勿认退出码）
 * + runner 补充字段。真实 mxcadassembly 仅回 `code`/`message`（实测 stdout 只有这两键）；
 * `newpath`/`raw` 是 runner 层补充，非 mxcadassembly 字段。
 */
export interface MxcadConversionResult {
  /** mxcadassembly 结果码：0=成功，非 0=失败（勿按进程退出码判成败，恒 2123） */
  code: number;
  /** mxcadassembly 结果消息（成功为 "ok"） */
  message?: string;
  /**
   * 产物路径。真实 mxcadassembly 不返回该字段（只回 code/message），由 runner 按引擎行为补齐，
   * 使任务结果自描述（单任务路径无 worker-pool 的 outname 回落，消费方不能拿到空 newpath）：
   * binToMxweb（带 outpath）= `path.join(outpath, outname)`；convertFile（无 outpath，带 outname）
   * = `path.join(dirname(srcPath), outname)`（引擎把 outname 写到 srcpath 同目录）；
   * 无 outname 时引擎自定产物名、位置不可推导 → ''。仅测试 mock 会填真实值。
   */
  newpath?: string;
  /** 解析失败时保留的原始输出（调试用），非 mxcadassembly 字段 */
  raw?: string;
  [key: string]: unknown;
}

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
    params: ConversionTaskParams,
    timeout?: number,
    onChild?: (kill: () => void) => void,
    runFn: typeof runMxcadAssembly = runMxcadAssembly
  ): Promise<MxcadConversionResult> {
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
   * 构建 mxcadassembly 参数对象（纯函数，便于测试）。
   *
   * 入参为 ConversionOptions 驼峰形状（srcPath/fileHash/createPreloadingData/...）——
   * 与 backend 转发形状一致（backend 不再发 mxcadassembly 小写 srcpath/src_file_md5）。
   *
   * binToMxweb（带 outpath）：mxcadassembly 需 srcpath + outpath + outname，无 src_file_md5；
   * convertFile（无 outpath）：srcpath + src_file_md5 + create_preloading_data + 可选参数。
   * 两形状与 backend 进程内 spawn 参数一致，保证两部署模式转换结果等价。
   */
  _buildParam(params: ConversionTaskParams): Record<string, unknown> {
    const { srcPath, fileHash, createPreloadingData, outname, cmd, width, height, colorPolicy, outpath } = params;

    // 源路径缺失时显式报错（而非 _resolvePath 返回 undefined 后 .replace 崩溃成
    // "Cannot read properties of undefined (reading 'replace')" 无从定位）
    if (!srcPath) {
      throw new ConversionExecutionError('转换参数缺少 srcPath');
    }

    const absoluteSrcPath = this._resolvePath(srcPath);
    const param: Record<string, unknown> = {
      srcpath: absoluteSrcPath.replace(/\\/g, '/'),
    };
    if (outpath) {
      param.outpath = this._resolvePath(outpath).replace(/\\/g, '/');
    } else {
      param.src_file_md5 = fileHash || '';
      param.create_preloading_data = createPreloadingData !== false;
    }

    if (outname) param.outname = outname;
    if (cmd) param.cmd = cmd;
    if (width) param.width = String(width);
    if (height) param.height = String(height);
    if (colorPolicy) param.colorPolicy = colorPolicy;
    if (params.outjpg) param.outjpg = params.outjpg;
    if (params.roate_angle !== undefined) param.roate_angle = params.roate_angle;
    if (params.view_angle !== undefined) param.view_angle = params.view_angle;
    if (params.dwgVersion !== undefined) param.dwg_version = params.dwgVersion;
    if (params.layout_name) param.layout_name = params.layout_name;
    // cut_dwg/print_to_pdf 区域/引用字段（mxcadassembly 小写透传，与进程内 param 一致）
    if (params.bd_pt1_x !== undefined) param.bd_pt1_x = params.bd_pt1_x;
    if (params.bd_pt1_y !== undefined) param.bd_pt1_y = params.bd_pt1_y;
    if (params.bd_pt2_x !== undefined) param.bd_pt2_x = params.bd_pt2_x;
    if (params.bd_pt2_y !== undefined) param.bd_pt2_y = params.bd_pt2_y;
    if (params.open_file_md5 !== undefined) param.open_file_md5 = params.open_file_md5;
    if (params.create_clip_block !== undefined) param.create_clip_block = params.create_clip_block;
    if (params.compression === false) param.compression = 0;
    return param;
  }

  _resolvePath(inputPath: string): string {
    if (!inputPath) return inputPath;
    if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
    return path.resolve(process.cwd(), inputPath);
  }

  _parseOutput(output: string): MxcadConversionResult {
    let strOutput = String(output);
    const iPos = strOutput.lastIndexOf('{"code"');
    if (iPos !== -1) strOutput = strOutput.substring(iPos);
    try {
      // mxcadassembly 输出为动态 JSON，仅保证 code 字段；断言已知形状（其余字段走索引签名）
      return JSON.parse(strOutput) as MxcadConversionResult;
    } catch (err) {
      log(`[MxcadRunner] 无法解析转换输出: ${(err as Error).message}`);
      return { code: 1, message: '转换输出格式错误', raw: strOutput.slice(0, 500) };
    }
  }
}

export default MxcadRunner;
