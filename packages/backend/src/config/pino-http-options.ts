import { join } from 'path';

import { ClsServiceManager } from 'nestjs-cls';
import pino from 'pino';

import type { LogLevelPlan } from '@cloudcad/contracts';

/**
 * pinoHttp 配置构建（ADR-0055 §1 脱敏与多流输出 / ADR-0076 级别分裂）
 *
 * 从 app.module.ts 抽成纯函数：级别分裂的赋值点此前是模块顶层的内联对象字面量，
 * 只能靠启动整个 NestJS 应用加起 pino transport 子进程才能观测。抽出来后单测
 * 直接断言这份配置数据，不需要 import app.module.ts（那会连带求值上百个模块）。
 *
 * 返回类型刻意不标注 pino-http 的 Options——pino-http 不是本包的直接依赖，
 * 只由 nestjs-pino 传递引入，`import type` 解析不到；由调用点（LoggerModule.forRoot）
 * 做结构性检查即可。
 *
 * 注意：本函数只返回 pino 的**基础配置**（根级别 / 脱敏 / mixin），不含流。
 * 两条流的级别（stdout 实时 / pino-roll 落盘）与物化由
 * `buildPinoStreamDescriptors` + `buildPinoStreams` 承担——因为 Windows 中文系统
 * 控制台默认 GBK(936) 代码页，pino-pretty 若作为 transport 在 **worker 线程**写
 * stdout，Node 走字节路径输出 UTF-8，被 GBK 控制台按 GBK 解码即乱码
 * （`🚀` → `馃殌`）。修复 = stdout 的 pretty 输出放**主进程**、经
 * `process.stdout.write(string)`（Windows 控制台 TTY 走 `WriteConsoleW` UTF-16，
 * 无视代码页）写出。详见 buildPinoStreams。
 */

/**
 * 流描述（纯数据，供单测断言 ADR-0076 级别分裂；运行时对象由 buildPinoStreams 物化）
 */
export interface PinoStreamDescriptor {
  /** stdout-pretty = 开发主进程彩色输出；stdout-json = 生产 JSON 行到 stdout；roll = 按天轮转落盘 */
  kind: 'stdout-pretty' | 'stdout-json' | 'roll';
  /** 该流级别（ADR-0076：stdout 取 console 级、落盘取 file 级） */
  level: string;
  /** stdout-pretty 专属 */
  singleLine?: boolean;
  colorize?: boolean;
  /** roll 专属 */
  file?: string;
  frequency?: string;
  dateFormat?: string;
  mkdir?: boolean;
  limit?: { count: number };
}

/**
 * pino 基础配置：根级别 / 脱敏 / mixin（不含流）。
 * 根级别 = 文件级别：pino 实例级别是硬门槛，落盘流拿不到根级别之外的记录，
 * "文件记全量"才真正成立（此前根级别 warn 让 cleanup_run 等 info 日志在落盘前
 * 就被丢弃，#325 需临时 LOG_LEVEL=info 补救）。
 */
export function buildPinoHttpOptions(logLevels: LogLevelPlan) {
  return {
    // 根级别 = 文件级别
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

/**
 * 流描述（纯数据）：两条流 + 各自的级别（ADR-0076）。
 * 恰好两条：stdout 实时流 + pino-roll 落盘流，autoLogging 关闭避免第三条访问日志流。
 */
export function buildPinoStreamDescriptors(
  logLevels: LogLevelPlan,
  logDirAbs: string,
  logRetentionDays: number,
  isProduction: boolean,
): PinoStreamDescriptor[] {
  return [
    // 实时流（stdout）：开发彩色 pretty（主进程）、生产 JSON 行（主进程）
    isProduction
      ? { kind: 'stdout-json', level: logLevels.console }
      : { kind: 'stdout-pretty', level: logLevels.console, singleLine: true, colorize: true },
    // 落盘流：按天轮转，保留 LOG_RETENTION_DAYS 天
    {
      kind: 'roll',
      level: logLevels.file,
      file: join(logDirAbs, 'backend', 'app.log'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      mkdir: true,
      limit: { count: logRetentionDays },
    },
  ];
}

/**
 * 物化流描述为 pino.multistream。
 *
 * Windows 中文系统控制台乱码根因（本函数的核心动机）：pino-pretty 默认用
 * sonic-boom 写 fd 1 的**字节**（UTF-8）；作为 transport target 时它跑在
 * **worker 线程**，而 GBK(936) 控制台按 GBK 解码这些 UTF-8 字节 → `🚀` 变
 * `馃殌`。落盘文件（pino-roll）不受影响（写文件无代码页参与）。
 *
 * 修复：stdout 不交给 worker，改为主进程 stream——pino-pretty 传入
 * `destination: process.stdout`（带 `.write` 的流对象）后走
 * `process.stdout.write(string)`；主进程写 Windows 控制台 TTY 走 `WriteConsoleW`
 * （UTF-16，无视代码页），中文/emoji 恒正确。重定向/管道时 process.stdout 写
 * UTF-8 字节，文件侧查看仍为干净 UTF-8。pino-roll 保持 worker transport（写文件
 * 无编码问题，且轮转/保留逻辑在 worker 内运行）。
 */
export function buildPinoStreams(descriptors: PinoStreamDescriptor[]) {
  const streams = descriptors.map((d) => {
    if (d.kind === 'stdout-pretty') {
      // pino-pretty 是 devDependency，生产 `--prod` 安装不含它；只在开发分支惰性
      // require（旧 transport 字符串 target 语义一致：生产从不构建此流、从不加载它），
      // 避免顶层静态 import 让生产启动解析失败。
      const pretty = require('pino-pretty') as (
        opts: Record<string, unknown>,
      ) => NodeJS.WritableStream;
      return {
        level: d.level,
        stream: pretty({
          singleLine: d.singleLine,
          colorize: d.colorize,
          destination: process.stdout,
        }),
      };
    }
    if (d.kind === 'stdout-json') {
      // 生产：JSON 行直接写主进程 stdout（同样避免 worker 字节路径被 GBK 控制台误读）
      return { level: d.level, stream: process.stdout };
    }
    return {
      level: d.level,
      stream: pino.transport({
        targets: [
          {
            target: 'pino-roll',
            options: {
              file: d.file,
              frequency: d.frequency,
              dateFormat: d.dateFormat,
              mkdir: d.mkdir,
              limit: d.limit,
            },
            level: d.level,
          },
        ],
      }),
    };
  });
  return pino.multistream(streams);
}
