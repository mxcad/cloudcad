import { join } from 'path';

import { ClsServiceManager } from 'nestjs-cls';

import type { LogLevelPlan } from '@cloudcad/contracts';

/**
 * pinoHttp 配置构建（ADR-0055 §1 脱敏与多流输出 / ADR-0076 级别分裂）
 *
 * 从 app.module.ts 抽成纯函数：级别分裂的三个赋值点（根级别 / stdout 目标 /
 * pino-roll 目标）此前是模块顶层的内联对象字面量，只能靠启动整个 NestJS 应用
 * 加起 pino transport 子进程才能观测。抽出来后单测直接断言这份配置数据，
 * 不需要 import app.module.ts（那会连带求值上百个模块）。
 *
 * 返回类型刻意不标注 pino-http 的 Options——pino-http 不是本包的直接依赖，
 * 只由 nestjs-pino 传递引入，`import type` 解析不到；由调用点（LoggerModule.forRoot）
 * 做结构性检查即可。
 */
export function buildPinoHttpOptions(
  logLevels: LogLevelPlan,
  logDirAbs: string,
  logRetentionDays: number,
  isProduction: boolean,
) {
  return {
    // 根级别 = 文件级别：pino 实例级别是硬门槛，落盘流拿不到根级别之外的记录
    level: logLevels.file,
    autoLogging: false,
    // pino redact 全量脱敏（ADR-0055 §1）：password/token/authorization/cookie/验证码/手机号/邮箱 等
    redact: {
      paths: [
        'password',
        'passwd',
        'pwd',
        'token',
        'refreshToken',
        'secret',
        'authorization',
        'cookie',
        'set-cookie',
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.passwd',
        '*.pwd',
        '*.token',
        '*.refreshToken',
        '*.secret',
        '*.verificationCode',
        '*.code',
        '*.mobile',
        '*.phone',
        '*.email',
        '*.accessKey',
        '*.accessKeySecret',
        '*.apiKey',
      ],
      censor: '[Redacted]',
    },
    // 多流输出：stdout（容器/PM2 实时查看）+ pino-roll 按天轮转落盘（保留 LOG_RETENTION_DAYS 天）
    // 两个目标各自限级（ADR-0076）：stdout 只看 console 级别，落盘拿 file 级别全量。
    transport: {
      targets: [
        !isProduction
          ? {
              target: 'pino-pretty',
              options: { singleLine: true, colorize: true },
              level: logLevels.console,
            }
          : {
              target: 'pino/file',
              options: { destination: 1 },
              level: logLevels.console,
            },
        {
          target: 'pino-roll',
          options: {
            file: join(logDirAbs, 'backend', 'app.log'),
            frequency: 'daily',
            dateFormat: 'yyyy-MM-dd',
            mkdir: true,
            // 保留 N 个已轮转文件 + 当前文件（pino-roll@4 用 limit.count，非 maxFiles）
            limit: { count: logRetentionDays },
          },
          level: logLevels.file,
        },
      ],
    },
    mixin() {
      try {
        const cls = ClsServiceManager.getClsService();
        const traceId = cls?.get('traceId');
        const requestId = cls?.get('requestId');
        if (traceId || requestId) return { traceId, requestId };
      } catch {
        // CLS 未初始化时静默跳过
      }
      return {};
    },
  };
}
