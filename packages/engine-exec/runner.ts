import path from 'node:path';
import {
  parseEngineOutput,
  type ConversionFailureCategory,
  type MxCadConversionResult,
  type MxCadEngineParams,
} from '@cloudcad/contracts';
import type { ManagedProcessResult } from './spawn';

/**
 * 引擎运行结果的统一解读结论。
 *
 * 只承载**结构化事实**：两侧 adapter（backend 进程内转换、conversion-service
 * 队列执行器）按各自的展示/传输需要渲染 message——backend 拼用户可见中文、conversion-service
 * 经 HTTP 下发给任务状态。category / code 从此同源，不存在「两侧各自解读引擎输出」的
 * 第二份逻辑。唯一例外是 `rawFragment`：输出无法解析时的诊断明细在此拼好（截断前 300 字符
 * + 回退文案），供两侧直接嵌入——否则每侧都要重写同一套截断与回退格式。
 *
 * 历史分叉的代价：超时救回曾两侧相反（同一慢转换，两种部署模式结论相反）、signal 分支
 * 救不救回输出靠手写注释对齐、产物路径补齐规则各写一遍。这些判定顺序现在只有一份。
 *
 * `transient`（可重试）刻意不存：由 adapter 用 `isTransientFailure(category)` 派生。
 * 唯一不可重试分类是 content-error，多存一份字段就有分叉风险。
 */
export interface EngineRunOutcome {
  /** 引擎是否报告成功（code=0，含超时救回的成功） */
  ok: boolean;
  /** 结果来自超时救回（引擎被掐在「已写完产物、未及退出」）。adapter 据此留诊断日志 */
  salvaged?: boolean;
  /** 引擎结果对象：成功时完整（含补齐后的 newpath）；content-error 时含 code/message；其余失败无 */
  result?: MxCadConversionResult;
  /** 失败性质分类（成功时无） */
  category?: ConversionFailureCategory;
  /** 输出无法解析时的诊断片段：解析器报错 + 原始输出前 300 字符 */
  rawFragment?: string;
  /** 终止信号（未正常退出时，如 SIGTERM/SIGKILL）；正常退出为 null */
  signal?: string | null;
}

/**
 * 解读一次运行所需的最小上下文。
 *
 * `param` 只用于推导 newpath 回落规则（见 `resolveEngineNewpath`），不参与成败判定；
 * `parse` 可注入以替换解析器（测试用），缺省为 @cloudcad/contracts 的 `parseEngineOutput`。
 */
export interface EngineRunContext {
  /** 引擎入参（camelCase → lowercase 翻译后的形状） */
  param: MxCadEngineParams;
  /** 可注入的输出解析器 */
  parse?: (raw: string) => MxCadConversionResult;
}

/**
 * 产物路径补齐：真实 mxcadAssembly 只回 code/message（无 newpath），调用方不能拿到空路径。
 *
 * 规则由**引擎入参**推导，不再由调用方各自计算：
 * - 有 `outpath`（bin→mxweb 方向）：产物 = outpath/outname
 * - 无 `outpath` 但有 `outname`（convertFile 方向）：引擎把 outname 写到 srcpath 同目录
 *   （batch 链路下游 `fs.createReadStream(filePath)` 依赖完整路径，纯文件名会按 cwd 解析 ENOENT）
 * - 无 `outname`：引擎自定产物名，位置不可推导 → `''`
 *
 * `newpath` 键**恒存在**（最差为 `''`），使结果自描述：消费方可以用同一个字段判断
 * 「产物落在哪」，不必区分「键缺失」与「键为空」。
 * 引擎已回 non-nullish 的 newpath 时优先采信引擎值，不覆盖。
 *
 * 注意：`''` 是**非 nullish**——`?? ` 回落拿不到它，必须用 `||`。backend 的
 * bin→mxweb 转发分支就踩过这个坑（`??` 拿到空串被调用方判失败且 error=undefined）。
 */
export function resolveEngineNewpath(
  result: MxCadConversionResult,
  param: MxCadEngineParams
): MxCadConversionResult {
  let computed = '';
  if (param.outname) {
    const base = param.outpath || path.dirname(param.srcpath);
    computed = path.join(base, param.outname);
  }
  return { ...result, newpath: result.newpath || computed };
}

/**
 * 采信「超时/异常线上已经完成的完整成功输出」。
 *
 * 引擎常被掐在「已写完产物、未及退出」的状态（大图纸尤其常见），此时 stdout 里已有完整
 * `{"code":0}`。完整 code=0 JSON 是引擎已完成转换的正证据，优先采信而非误报超时失败——
 * 超时是环境性失败（可重试），而这里引擎其实已经转完了。
 *
 * 引擎输出是动态 JSON，仅保证 code 字段，故此处只认 code===0；解析失败返回 null。
 */
export function salvageSuccessResult(
  rawOutput: string,
  parse: (raw: string) => MxCadConversionResult = parseEngineOutput
): MxCadConversionResult | null {
  try {
    const ret = parse(String(rawOutput ?? ''));
    return ret.code === 0 ? ret : null;
  } catch {
    return null;
  }
}

/**
 * 把一次受管子进程运行的原始结果解读为结构化结论——引擎结果解读的**唯一实现**。
 *
 * 判定顺序是引擎协议的一部分，不是各 adapter 的自由发挥：
 * 1. `timedOut` → 先救回完整成功输出，救不回才判 timeout
 * 2. `signal` 非空 → killed（用户取消 / OOM / 杀整组）。**不救回输出**：signal 意味着
 *    进程被外部终止，stdout 可能是不完整的中途产物，采信它比误报 killed 更危险
 * 3. `exitCode===null` → not-started（二进制缺失/无法启动）。必须先于解析判定，
 *    否则 ENOENT 的 stderr 会被误判成「输出无法解析」，掩盖真实的路径/部署问题
 * 4. 输出解析失败 → output-unparseable（截断/畸形/缺 code，环境性，可重试）
 * 5. `code===0` → 成功，补 newpath
 * 6. 其余 → content-error（引擎确定性拒绝，同一输入重试注定再失败）
 *
 * 本函数无 IO、无日志：adapter 自己决定打什么日志、拼什么文案、要不要落盘调试信息。
 */
export function interpretEngineRun(
  result: ManagedProcessResult,
  ctx: EngineRunContext
): EngineRunOutcome {
  const parse = ctx.parse || parseEngineOutput;

  if (result.timedOut) {
    const salvaged = salvageSuccessResult(result.stdout || result.stderr, parse);
    if (salvaged) {
      return {
        ok: true,
        salvaged: true,
        result: resolveEngineNewpath(salvaged, ctx.param),
      };
    }
    return { ok: false, category: 'timeout' };
  }

  if (result.signal || result.exitCode === null) {
    return {
      ok: false,
      category: result.signal ? 'killed' : 'not-started',
      signal: result.signal,
    };
  }

  const output = result.stdout || result.stderr || '';
  let ret: MxCadConversionResult;
  try {
    ret = parse(output);
  } catch (err) {
    return {
      ok: false,
      category: 'output-unparseable',
      rawFragment: `${(err as Error).message}，原始输出=${
        String(output).slice(0, 300) || '空'
      }`,
    };
  }

  if (ret.code === 0) {
    return { ok: true, result: resolveEngineNewpath(ret, ctx.param) };
  }

  return { ok: false, category: 'content-error', result: ret };
}
