import * as fs from 'fs';
import * as path from 'path';
import { isConversionFailureCategory } from '@cloudcad/contracts';
import type {
  ConversionFailureCategory,
  ConversionRequest,
} from '@cloudcad/contracts';
import type { IMxcadConversionService } from '../../mxcad/interfaces/mxcad-conversion.interface';
import type { ConvertServerFileParam } from '../../mxcad/types/mxcad-context.types';

/**
 * 共享转换核心失败：区分「引擎返回非 0 code」与「产物缺失」，携带引擎原始信息。
 *
 * detail 是引擎原始信息（engine-failed 为引擎 message、artifact-missing 为 outname），
 * 不含调用方兜底文案——兜底由各调用方按自身语义补：
 * - 单文件下载（precomputeExport / downloadNodeWithFormat）→ 本地化 HTTP 异常；
 * - 批量下载（ConversionRunner）→ 折叠为失败结果（error 字段）。
 * 判定依据从不依赖文案，调用方按 kind 分流而非按 message 反推。
 */
export class ConversionCoreError extends Error {
  constructor(
    public readonly kind: 'engine-failed' | 'artifact-missing',
    public readonly detail: string,
    /**
     * 引擎失败分类（仅 engine-failed 携带）：调用方据此区分「可重试的环境性失败」
     * 与「确定性内容失败」（如批量下载的重试决策），不再按文案反推。
     */
    public readonly category?: ConversionFailureCategory,
  ) {
    super(detail);
    this.name = 'ConversionCoreError';
  }
}

export interface ConversionCoreInput {
  /** 已解析的转换服务（各调用方经 ModuleRef 惰性取 MXCAD_CONVERSION_SERVICE） */
  conversionService: IMxcadConversionService;
  /** 源文件绝对路径（正斜杠；内容寻址快照或工作副本） */
  srcPath: string;
  fileHash: string;
  nodeId: string;
  /** 发起转换的用户 ID（游客/匿名不传） */
  userId?: string;
  /** 调用方任务 id（node.taskId）：远端模式按 clientTaskId 别名登记，状态查询/取消/对账可解析 */
  taskId?: string;
  /** 输出文件名（含扩展名；版本绑定 {hash}-{paramKey}{ext} 或直取名） */
  outname: string;
  /**
   * 引擎参数——引擎影响字段全集（ENGINE_INPUT_FIELDS），不含 srcPath/fileHash/outname/
   * createPreloadingData（这几个由上方显式字段设定，Object.assign 会被其覆盖）。
   *
   * 取全集而非 FormatPolicy 的 OutputFormatParams 子集，是为了让调用方能透传客户端
   * 传入的裁剪框/打印角度/布局等字段而不必绕开本核心自己拼转换参数
   * （public-file 曾因此手写枚举 14 个引擎字段）。
   * FormatPolicy 输出的 OutputFormatParams 是它的子集，直接可传。
   */
  engineParams?: Partial<
    Omit<ConversionRequest, 'srcPath' | 'fileHash' | 'outname' | 'createPreloadingData'>
  >;
  /** 任务优先级（批量下载 'low'；单文件下载缺省 'high'） */
  priority?: 'high' | 'low';
}

/**
 * 共享转换核心：构造引擎参数 → 调 convertServerFile → 校验 code → 定位产物 → 校验就位。
 *
 * precomputeExport / downloadNodeWithFormat / 批量 ConversionRunner 的进程内转换共用此核心，
 * 避免「构造转换参数 → 调引擎 → 校验产物」三段各写一份漂移（字段漏抄即静默丢参数，
 * 368ca55 / 721fe02 同类事故）。
 *
 * 刻意不含（各调用方策略不同，留在调用方）：
 * - 配额占位与释放（占位点与释放时机各调用方不同）；
 * - 缓存归位（单文件 rename、批量 copy、下载流式清理）；
 * - 源文件解析（快照 vs fileHash 定位各调用方已有）；
 * - 日志与错误文案渲染（各调用方面向自己的日志与 UI）。
 *
 * 失败抛 ConversionCoreError（携带原始信息）；convertServerFile 自身异常（如 spawn 失败、
 * VIP 门控拒绝）原样向上抛，由调用方按自身语义处理。
 */
export async function runConversionCore(
  input: ConversionCoreInput
): Promise<{ artifactPath: string }> {
  const conversionOptions: ConvertServerFileParam = {
    srcPath: input.srcPath,
    fileHash: input.fileHash,
    nodeId: input.nodeId,
    userId: input.userId,
    outname: input.outname,
    createPreloadingData: false,
  };
  if (input.priority) conversionOptions.priority = input.priority;
  if (input.taskId) conversionOptions.taskId = input.taskId;
  if (input.engineParams) {
    Object.assign(conversionOptions, input.engineParams);
  }

  const result = await input.conversionService.convertServerFile(
    conversionOptions
  );

  if (result.code !== 0) {
    // errorCategory 结构化过线（此前失败只折 code+message，六值分类在此被丢弃，
    // 上层只能按文案反推「可重试 vs 确定性失败」）；非法值按缺省处理
    const category = isConversionFailureCategory(result.errorCategory)
      ? result.errorCategory
      : undefined;
    throw new ConversionCoreError(
      'engine-failed',
      result.message || '',
      category,
    );
  }

  // 引擎把 outname 写到 srcPath 同目录：产物 = dirname(srcPath)/outname
  const artifactPath = path.join(path.dirname(input.srcPath), input.outname);
  if (!fs.existsSync(artifactPath)) {
    throw new ConversionCoreError('artifact-missing', input.outname);
  }
  return { artifactPath };
}
