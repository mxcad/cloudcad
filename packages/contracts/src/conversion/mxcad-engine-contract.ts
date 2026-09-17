// mxcad 两级参数契约（唯一翻译点，ADR-0064 / ADR-0069）：
//
// 一次转换的参数在历史上被手写映射 4-5 次，且各份映射字段集不一致：
// - backend 进程内 spawn 一份（mxcadassembly lowercase 单参 JSON）；
// - backend → conversion-service 转发一份（camelCase HTTP 形状）；
// - conversion-service MxcadRunner._buildParam 一份；
// - 内容身份派生 CONTENT_KEY_FIELDS 一份手写列表。
// 代价已付两次：721fe02 转发分支误发 lowercase 参数 → 引擎收到 undefined → 崩溃；
// 368ca55 漏抄 bd_pt1_x/y、bd_pt2_x/y、open_file_md5、create_clip_block
// → cut_dwg / print_to_pdf 静默返回 {"message":"false"}。
//
// 本文件把「字段集合 + 构造 + 输出解析」各写成一次，backend 与 conversion-service
// 都是它的 adapter。纯 TypeScript、零外部依赖、无 IO、无副作用（准入标准见 ADR-0069）。
//
// 不进本文件的东西：路径绝对化/归一（各 adapter 的环境行为）、spawn 与 JSON 引号约定、
// 任务编排类型（ConversionTask 只有 backend 一个包消费，不达 2 包门槛）、
// 内容身份派生本身（deriveContentKey 与 conversion-service 的 task-store 耦合）。

/**
 * camelCase 侧（backend ↔ conversion-service 的 HTTP 契约）影响引擎产物的字段全集。
 *
 * 这是唯一事实源：
 * - 构造 mxcadassembly 参数的字段集（buildEngineParams 据此遍历）；
 * - backend → conversion-service 转发时的字段集（同源，不可能再漏抄）；
 * - 内容身份派生的字段集（CONTENT_KEY_FIELDS，见下）。
 *
 * 只增不改：新增引擎字段必须进本表，否则两侧行为静默分叉（368ca55 的成因）。
 * lowercase 引擎键（srcpath / src_file_md5 等）永不出现在本表中——那是低层接口。
 */
export const ENGINE_INPUT_FIELDS = [
  'srcPath',
  'fileHash',
  'createPreloadingData',
  'compression',
  'outpath',
  'outname',
  'cmd',
  'width',
  'height',
  'colorPolicy',
  'outjpg',
  'roate_angle',
  'view_angle',
  'dwgVersion',
  'layout_name',
  'bd_pt1_x',
  'bd_pt1_y',
  'bd_pt2_x',
  'bd_pt2_y',
  'open_file_md5',
  'create_clip_block',
] as const;

export type EngineInputField = (typeof ENGINE_INPUT_FIELDS)[number];

/**
 * 转换请求（backend ↔ conversion-service HTTP 契约的 camelCase 形状，ADR-0064）。
 *
 * 字段集 = 引擎影响字段全集（ENGINE_INPUT_FIELDS），即「发给引擎的东西」的封闭描述；
 * 编排字段（userId / timeout / priority / skipExportGate / debugNodeId / async /
 * resultposturl / traceid / nodeId）不在此列，它们留在 backend 的 ConversionOptions。
 *
 * 注意：backend 的 ConversionOptions 结构上是本类型的超集，可直接传入 buildEngineParams；
 * 但 ConversionOptions 历史上没有 outpath 字段而 binToMxweb 转发一直在用，本类型把它显式声明。
 */
export type ConversionRequest = {
  [Field in EngineInputField]?: Field extends 'width' | 'height'
    ? string | number
    : Field extends 'createPreloadingData' | 'compression' | 'create_clip_block'
      ? boolean
      : Field extends 'roate_angle' | 'view_angle' | 'dwgVersion'
        ? number
        : string;
} & {
  /** 源文件路径（必填；缺失时 adapter 须显式报错，而非交给引擎回 read file error） */
  srcPath: string;
};

/**
 * mxcadassembly 二进制入参（单个 JSON 字符串参数，lowercase / 下划线命名）。
 *
 * 这是低层接口，不是 HTTP 契约。记忆锚点：看到 lowercase `srcpath` / `src_file_md5`
 * 是 mxcadassembly 二进制；看到 camelCase `srcPath` / `fileHash` 才是 HTTP 契约。
 */
export interface MxCadEngineParams {
  /** 源文件路径（正斜杠；绝对化由各 adapter 负责） */
  srcpath: string;
  /** bin→mxweb 方向的输出目录（正斜杠）。存在时替代 src_file_md5 / create_preloading_data */
  outpath?: string;
  /** 内容哈希（仅 convertFile 方向；binToMxweb 方向不携带） */
  src_file_md5?: string;
  /** 是否创建预加载数据（缺省 true） */
  create_preloading_data?: boolean;
  /** 关闭压缩时写 0 */
  compression?: 0;
  /** 输出文件名 */
  outname?: string;
  /** 命令类型（to_mxweb / toPdf / toDwg / print_to_pdf / cut_dwg 等） */
  cmd?: string;
  /** PDF 输出宽度 */
  width?: string;
  /** PDF 输出高度 */
  height?: string;
  /** 颜色策略（mono / color） */
  colorPolicy?: string;
  /** JPG 输出参数（透传给 cadtojpg） */
  outjpg?: string;
  /** 旋转角度（print_to_pdf） */
  roate_angle?: number;
  /** 视角角度（print_to_pdf） */
  view_angle?: number;
  /** DWG/DXF 版本号 */
  dwg_version?: number;
  /** 布局名称 */
  layout_name?: string;
  /** 裁剪框点 1 X（cut_dwg / print_to_pdf 区域） */
  bd_pt1_x?: string;
  /** 裁剪框点 1 Y */
  bd_pt1_y?: string;
  /** 裁剪框点 2 X */
  bd_pt2_x?: string;
  /** 裁剪框点 2 Y */
  bd_pt2_y?: string;
  /** 当前打开文件的 MD5 */
  open_file_md5?: string;
  /** 是否创建裁剪块 */
  create_clip_block?: boolean;
}

/**
 * 构造 mxcadassembly 入参对象：唯一一处 camelCase → lowercase 翻译（ADR-0064）。
 *
 * 纯函数：不解析路径、不查配置、不做引号约定。
 * 两个调用方（backend 进程内 spawn、conversion-service runner）各自在调用后修正
 * 自己的环境差异（srcpath / outpath 反斜杠转正斜杠），其余逐字段一致。
 *
 * 方向由 outpath 有无区分（与 ADR-0064 既有约定一致）：
 * - 有 outpath = binToMxweb：srcpath + outpath + outname，不携带内容哈希/预加载；
 * - 无 outpath = convertFile：srcpath + src_file_md5 + create_preloading_data + 可选参数。
 */
export function buildEngineParams(
  options: ConversionRequest
): MxCadEngineParams {
  const param: MxCadEngineParams = {
    srcpath: (options.srcPath ?? '').replace(/\\/g, '/'),
  };

  if (options.outpath !== undefined) {
    param.outpath = options.outpath.replace(/\\/g, '/');
  } else {
    param.src_file_md5 = options.fileHash ?? '';
    param.create_preloading_data = options.createPreloadingData !== false;
  }

  // 逐字段判定条件按「字段值的合法域」分三类，与重构前 backend 进程内 param 及
  // runner._buildParam 的既有行为一致（勿统一成一种判定，会改变空值语义）：
  // - 字符串字段（outname/cmd/colorPolicy/outjpg/layout_name/bd_pt*/open_file_md5）
  //   用真值判定：'' 不是合法值（空布局/空坐标/空 MD5），省略等价于引擎的「字段缺失」
  //   语义；若转发 ''，引擎按「有值但为空」处理，print_to_pdf/cut_dwg 会静默回 "false"。
  // - 数值字段（roate_angle/view_angle/dwgVersion）用「非 undefined」判定：0 是合法角度/版本。
  // - 布尔字段（create_clip_block）用「非 undefined」判定：false 是合法值（不创建裁剪块）。
  if (!options.compression) param.compression = 0;
  if (options.outname) param.outname = options.outname;
  if (options.cmd) param.cmd = options.cmd;
  if (options.width) param.width = String(options.width);
  if (options.height) param.height = String(options.height);
  if (options.colorPolicy) param.colorPolicy = options.colorPolicy;
  if (options.outjpg) param.outjpg = options.outjpg;
  if (options.roate_angle !== undefined)
    param.roate_angle = options.roate_angle;
  if (options.view_angle !== undefined) param.view_angle = options.view_angle;
  if (options.dwgVersion !== undefined) param.dwg_version = options.dwgVersion;
  if (options.layout_name) param.layout_name = options.layout_name;
  if (options.bd_pt1_x) param.bd_pt1_x = options.bd_pt1_x;
  if (options.bd_pt1_y) param.bd_pt1_y = options.bd_pt1_y;
  if (options.bd_pt2_x) param.bd_pt2_x = options.bd_pt2_x;
  if (options.bd_pt2_y) param.bd_pt2_y = options.bd_pt2_y;
  if (options.open_file_md5) param.open_file_md5 = options.open_file_md5;
  if (options.create_clip_block !== undefined) {
    param.create_clip_block = options.create_clip_block;
  }

  return param;
}

/**
 * mxcadassembly 二进制输出（stdout 里的 {"code":...}）。
 *
 * 引擎输出是动态 JSON，仅保证 code 字段；真实 mxcadassembly 实测只回 code/message，
 * 成败只认 code（成功/失败退出码恒 2123，勿按进程退出码判成败）。
 * newpath / tz 等字段由 engine 或上层补齐，其余走索引签名。
 */
export interface MxCadConversionResult {
  /** 结果码：0=成功，非 0=失败 */
  code: number;
  /** 结果消息（成功为 "ok"；引擎缺区域信息时会回字符串 "false"，是字符串非布尔） */
  message?: string;
  /** 产物路径 */
  newpath?: string;
  /** 是否包含图纸数据 */
  tz?: boolean;
  [key: string]: unknown;
}

/** 引擎输出前可能带日志噪音，真实 JSON 从最后一个 {"code" 开始 */
const ENGINE_OUTPUT_MARKER = '{"code"';

/**
 * 解析 mxcadassembly 原始输出为结构化结果。
 *
 * 纯函数、无容错：截断/畸形/缺 code 字段时抛错，由调用方决定降级方式
 * （conversion-service runner 降级为 {code:1, message:'转换输出格式错误', raw}；
 * backend 判定为瞬态失败 code=-2）。
 *
 * 「code 字段必须是数字」的校验是刻意保留的：引擎回 {"newpath":...} 这类缺 code 的
 * 输出必须被当解析失败，而不是当成成功（code 为 undefined）。
 */
export function parseEngineOutput(rawOutput: string): MxCadConversionResult {
  const output = String(rawOutput ?? '');
  const markerPos = output.lastIndexOf(ENGINE_OUTPUT_MARKER);
  if (markerPos === -1) {
    throw new Error(
      `引擎输出缺少结果 JSON（原始输出=${output.slice(0, 300) || '空'}）`
    );
  }

  const parsed: unknown = JSON.parse(output.substring(markerPos));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('引擎输出不是 JSON 对象');
  }
  const code = (parsed as { code?: unknown }).code;
  if (typeof code !== 'number') {
    throw new Error('引擎输出缺少 code 字段');
  }
  return parsed as MxCadConversionResult;
}

/**
 * 转换失败性质分类全集（结构化失败契约）。
 *
 * 背景：一次转换失败后，其「性质」历史上只能靠 error 字符串表达，backend 只能拿
 * 4 个中文字符串反推分类，且与 conversion-service 的实际文案靠子串侥幸匹配
 * （marker 是「进程被终止」，runner 抛的是「转换进程被终止」）——runner 改文案
 * 即静默翻转 transient 语义，上层「可重试 vs 确定性失败」的分支随之失效。
 * 分类改为结构化字段随任务状态一起下发后，两侧不再依赖任何文案。
 */
export const CONVERSION_FAILURE_CATEGORIES = [
  /** 超时：进程组已被杀。stdout 可能已含完整 {"code":0}，调用方应先尝试救回再判失败 */
  'timeout',
  /** 进程被信号终止：用户取消、OOM killer、杀整组等 */
  'killed',
  /** spawn 失败：二进制缺失或无法启动（exitCode 为 null） */
  'not-started',
  /** 引擎输出无法解析：截断 / 畸形 / 缺 code 字段 */
  'output-unparseable',
  /** 引擎返回非 0 code：确定性内容失败，同一输入重试注定再失败 */
  'content-error',
  /** 未归类：HTTP 边界外的失败、上游提交超时等 */
  'unknown',
] as const;

export type ConversionFailureCategory =
  (typeof CONVERSION_FAILURE_CATEGORIES)[number];

/**
 * 可重试（瞬态）分类集合 = 全集 − content-error。
 *
 * transient=true  → 环境性失败，重试可能成功（引擎配置 / 路径 / 资源 / 排队问题）；
 * transient=false → 确定性内容失败（content-error），重试注定再失败。
 *
 * unknown 归为 transient 是刻意的：无 message / 无法归类时宁可多重试一次，
 * 也不要永久判死（与既有 `!message → true` 的语义一致）。
 */
export const TRANSIENT_FAILURE_CATEGORIES: readonly ConversionFailureCategory[] =
  ['timeout', 'killed', 'not-started', 'output-unparseable', 'unknown'];

/**
 * 判定失败分类是否瞬态（可重试）。
 *
 * 缺分类时返回 true：历史数据与未经过分类的失败（老版本 conversion-service、
 * 上游提交失败）默认按可重试处理，避免静默转成「永久失败」。
 */
export function isTransientFailure(
  category: ConversionFailureCategory | null | undefined
): boolean {
  return category == null || TRANSIENT_FAILURE_CATEGORIES.includes(category);
}

/**
 * 类型收窄：判断任意值是否为合法的失败分类。
 *
 * HTTP 边界传过来的 errorCategory 是松包 string（JSON 反序列化后无类型），
 * 两侧入口（conversion-service 落库、backend 读响应）都要先过这道校验；
 * 收敛成一个函数，避免各写一份 includes 且各写一种收窄写法。
 */
export function isConversionFailureCategory(
  value: unknown
): value is ConversionFailureCategory {
  return (
    typeof value === 'string' &&
    (CONVERSION_FAILURE_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * 转换失败的结构化描述（backend ↔ conversion-service 的 HTTP 边界契约）。
 *
 * 此前边界只传 message 字符串，失败性质在跨线时被丢弃，backend 只能按文案反推；
 * 现在 category / code 与 message 并列下发（errorCategory / errorCode 字段），
 * 判定依据从「文案匹配」变成「字段读取」。
 */
export interface ConversionFailureDetail {
  /** 人可读错误信息，用于日志与 UI 展示；不作分类依据 */
  message: string;
  /** 失败性质分类 */
  category: ConversionFailureCategory;
  /** 引擎返回码：仅 content-error 时为非 0，其余分类为 undefined */
  code?: number;
}

/**
 * 不参与内容身份派生的引擎输入字段。
 *
 * outpath 是产物落点（bin→mxweb 方向的输出目录），是转换宿主机的本地路径，不是内容身份：
 * 同一份内容换落点目录不应产生不同 key，否则去重恒失效。
 */
const NON_CONTENT_FIELDS: readonly EngineInputField[] = ['outpath'];

/**
 * 内容身份派生字段集 = 引擎输入字段全集 − 非内容字段。
 *
 * 派生而非手写：去重 key 与参数集合同源，引擎字段表更新时本集合自动跟进，
 * 不可能再出现「字段进了 buildEngineParams、没进 CONTENT_KEY_FIELDS」的分叉
 * （裁剪框字段曾因此缺失，两张仅裁剪框不同的 cut_dwg 会并入同一个在途任务互拿产物）。
 *
 * 判据：任一字段变化 → key 必须变；被排除的字段变化 → key 必须不变。
 * 约束由 conversion-service/test/content-dedup.test.ts 参数化测试锁定。
 */
export const CONTENT_KEY_FIELDS: readonly EngineInputField[] =
  ENGINE_INPUT_FIELDS.filter((field) => !NON_CONTENT_FIELDS.includes(field));
