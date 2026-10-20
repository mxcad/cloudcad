/**
 * 日志级别分裂解析（ADR-0076）
 *
 * 两条流各自的级别独立可配：
 * - file：落盘流（pino-roll）。同时是 pino 实例的**根级别**——pino 的实例级别是
 *   硬门槛，落盘流永远拿不到根级别之外的记录，所以根级别必须抬到文件级别，
 *   "文件记全量"才真正成立。
 * - console：实时流（stdout）。生产默认 error，排障期用 LOG_CONSOLE_LEVEL 临时放开。
 *
 * 纯函数、无 IO：入参是 env 快照，便于单测断言默认值与优先级。
 * config-service / storage-service / conversion-service 的 logger 各持有一份同名
 * 实现（4 份重复是已知接受的代价，收敛另立票据，见 ADR-0076）。
 */

const VALID_LEVELS = [
  'silent',
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const;

export type LogLevelName = (typeof VALID_LEVELS)[number];

/** 两个级别的解析结果 */
export interface LogLevelPlan {
  /** 落盘级别，同时作为 pino 实例的根级别 */
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
    if (value && (VALID_LEVELS as readonly string[]).includes(value)) {
      return value as LogLevelName;
    }
  }
  return fallback;
}

export function resolveLogLevels(
  env: NodeJS.ProcessEnv = process.env,
  isProduction = process.env.NODE_ENV === 'production',
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
