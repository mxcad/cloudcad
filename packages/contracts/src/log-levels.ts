/**
 * 日志级别分裂解析（ADR-0076）——四个服务共享的唯一事实源。
 *
 * 两条流各自的级别独立可配：
 * - file：落盘流。backend 用 pino-roll，同时是 pino 实例的**根级别**——pino 的
 *   实例级别是硬门槛，落盘流永远拿不到根级别之外的记录，所以根级别必须抬到
 *   文件级别，"文件记全量"才真正成立。
 * - console：实时流（stdout）。生产默认 error，排障期用 LOG_CONSOLE_LEVEL 放开。
 *
 * 原先 backend / config-service / storage-service / conversion-service 各持一份
 * 同名实现（ADR-0076 记录的已知代价）。收敛后的两个语义约定：
 *
 * 1. 级别名按 **pino 全量刻度** 归一（trace < debug < info < warn < error <
 *    fatal < silent，与 pino 默认数值序一致）。它是三个手写 logger 自用的 4 级
 *    刻度（debug/info/warn/error）的超集，且对交集的四个级别索引完全相同，故
 *    收敛对 logger 侧零行为变化。
 * 2. `isAtLeast` 对**超集级别**给出正确语义而非丢弃：`silent` 排在最后，任何
 *    记录都不达标（= 静音，与 pino 一致）；`trace` 排在最前，任何记录都达标。
 *    手写 logger 从不发 `trace`/`fatal` 记录，故「设成 trace → 全放行、设成
 *    fatal → 全静默」与运维的直觉一致，不会出现设了一个没见过的级别名就静默
 *    丢全部日志的坑。
 *
 * 纯函数、无 IO、不触达运行时全局对象（过 scan:purity 门禁）：调用方必须显式传
 * env 快照。级别解析每次调用时读取快照，因此支持运行时覆盖（与各服务
 * `LOG_DIR` 同一约定），无需调用方自己缓存。
 */

const LEVEL_NAMES = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export type LogLevelName = (typeof LEVEL_NAMES)[number];

// indexOf 的入参是任意字符串，另存一份 string[] 供比较用
const LEVEL_ORDER: readonly string[] = LEVEL_NAMES;

/** 两个级别的解析结果 */
export interface LogLevelPlan {
  /** 落盘级别；backend 侧同时作为 pino 实例的根级别 */
  file: LogLevelName;
  /** 实时（stdout）级别 */
  console: LogLevelName;
}

/**
 * 取第一个合法值；全部非法时回落到调用方给的默认值。
 * 非法值不报错、静默回落：运维误写一个级别名不应让服务起不来。
 */
function pickLevel(
  fallback: LogLevelName,
  ...candidates: (string | undefined)[]
): LogLevelName {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const value = candidate.trim().toLowerCase();
    if (value && (LEVEL_NAMES as readonly string[]).includes(value)) {
      return value as LogLevelName;
    }
  }
  return fallback;
}

/**
 * 解析两条流各自的级别。
 *
 * @param env env 快照（必须显式传——本模块不得触达运行时全局对象，见 scan:purity）
 * @param isProduction 省略时按快照里的 NODE_ENV 判定，使 env 成为唯一事实来源；
 *   显式传入用于覆盖（backend 已自行解析出 isProduction）
 */
export function resolveLogLevels(
  env: Record<string, string | undefined>,
  isProduction = env.NODE_ENV === 'production',
): LogLevelPlan {
  // LOG_LEVEL 是 LOG_FILE_LEVEL 的旧别名：已部署实例的 .env 里写着显式
  // LOG_LEVEL=warn，删掉这个名字会让"想收敛落盘日志的人"静默升级成全量。
  const file = pickLevel('debug', env.LOG_FILE_LEVEL, env.LOG_LEVEL);
  // 实时流：显式配置优先；未配置时生产只放行 error，开发保留全量便于本地排障。
  const consoleLevel = pickLevel(
    isProduction ? 'error' : 'debug',
    env.LOG_CONSOLE_LEVEL,
  );
  return { file, console: consoleLevel };
}

/**
 * level 是否达到 threshold（含相等）。level 越靠后越严重，threshold 越靠后越严。
 * 未知级别返回 false：宁可静默丢弃一条无法判定的记录，也不让它漏进更严的流。
 */
export function isAtLeast(level: string, threshold: string): boolean {
  const i = LEVEL_ORDER.indexOf(String(level).toLowerCase());
  const t = LEVEL_ORDER.indexOf(String(threshold).toLowerCase());
  return i >= 0 && t >= 0 && i >= t;
}
