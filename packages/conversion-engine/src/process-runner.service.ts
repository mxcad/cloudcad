///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Inject, Injectable, Logger } from '@nestjs/common';
import { spawn, execSync } from 'child_process';
import { CONVERSION_ENGINE_CONFIG, ConversionEngineConfig } from './interfaces/conversion-service.interface';

// ---------------------------------------------------------------------------
// Semaphore — 轻量信号量，用于控制最大并发数
// ---------------------------------------------------------------------------
class Semaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.current--;
    }
  }

  get running(): number {
    return this.current;
  }

  get waiting(): number {
    return this.queue.length;
  }
}

// ---------------------------------------------------------------------------
// ProcessError — 进程执行异常
// ---------------------------------------------------------------------------
export class ProcessError extends Error {
  public readonly binaryPath: string;
  public readonly durationMs: number;
  public readonly cause?: Error;

  constructor(
    message: string,
    binaryPath: string,
    durationMs: number,
    cause?: Error,
  ) {
    super(message);
    this.name = 'ProcessError';
    this.binaryPath = binaryPath;
    this.durationMs = durationMs;
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// 公开类型
// ---------------------------------------------------------------------------

/**
 * 进程执行结果
 */
export interface ProcessResult {
  /** 退出码，0 表示成功 */
  exitCode: number;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 实际耗时（毫秒） */
  durationMs: number;
}

/**
 * 进程执行选项
 */
export interface ProcessRunOptions {
  /** 命令行参数列表 */
  args: string[];
  /** 超时时间（毫秒），默认 300000 */
  timeoutMs?: number;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔（毫秒），默认 1000 */
  retryDelayMs?: number;
}

// ---------------------------------------------------------------------------
// ProcessRunnerService
// ---------------------------------------------------------------------------

/**
 * ProcessRunnerService
 *
 * 负责调用外部二进制（MxCAD 转换程序），包含：
 * - 信号量并发控制（默认最大 3，通过 ConversionEngineConfig 覆盖）
 * - 超时强杀机制（默认 300 秒）
 * - 错误捕获与日志记录
 * - 重试支持
 */
@Injectable()
export class ProcessRunnerService {
  private readonly logger = new Logger(ProcessRunnerService.name);
  private readonly semaphore: Semaphore;
  private readonly defaultTimeoutMs: number;

  constructor(
    @Inject(CONVERSION_ENGINE_CONFIG)
    config: ConversionEngineConfig,
  ) {
    const maxConcurrency = config.maxConcurrency ?? 3;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 300_000;
    this.semaphore = new Semaphore(maxConcurrency);
    this.logger.log(
      `ProcessRunnerService 初始化: 最大并发 ${maxConcurrency}, 默认超时 ${this.defaultTimeoutMs}ms`,
    );
  }

  /**
   * 执行外部进程（带并发队列 + 超时控制 + 错误捕获）
   *
   * 流程：
   *  1. 获取信号量许可（队列等待）
   *  2. child_process.spawn 启动进程
   *  3. 设置超时定时器，到期发送 SIGTERM，5 秒后未响应则 SIGKILL
   *  4. 收集 stdout / stderr
   *  5. 释放信号量许可
   *
   * @param binaryPath - 可执行文件路径
   * @param options   - 执行选项
   */
  async run(
    binaryPath: string,
    options: ProcessRunOptions,
  ): Promise<ProcessResult> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = options.maxRetries ?? 0;
    const retryDelayMs = options.retryDelayMs ?? 1_000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeOnce(binaryPath, options, timeoutMs);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          this.logger.warn(
            `执行失败 (第 ${attempt + 1}/${maxRetries + 1} 次): ${binaryPath} — ${lastError.message}`,
          );
          await this.delay(retryDelayMs);
        }
      }
    }

    throw lastError!;
  }

  /**
   * 单次执行（不含重试）
   */
  private async executeOnce(
    binaryPath: string,
    options: ProcessRunOptions,
    timeoutMs: number,
  ): Promise<ProcessResult> {
    const startTime = Date.now();

    await this.semaphore.acquire();
    this.logger.debug(
      `[running=${this.semaphore.running} queued=${this.semaphore.waiting}] 执行: ${binaryPath} ${options.args.join(' ')}`,
    );

    try {
      return await new Promise<ProcessResult>((resolve, reject) => {
        let timedOut = false;
        let settled = false;

        // ---- 启动子进程 ----
        const child = spawn(binaryPath, options.args, {
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        // ---- 超时定时器 ----
        const timer = setTimeout(() => {
          timedOut = true;
          this.logger.warn(
            `进程超时 (${timeoutMs}ms)，发送 SIGTERM: ${binaryPath}`,
          );
          child.kill('SIGTERM');

          // SIGTERM 无效则 5 秒后 SIGKILL
          setTimeout(() => {
            if (!child.killed && !settled) {
              this.logger.warn(`进程未响应 SIGTERM，发送 SIGKILL: ${binaryPath}`);
              child.kill('SIGKILL');
            }
          }, 5_000);
        }, timeoutMs);

        // ---- 进程启动失败（如二进制不存在） ----
        child.on('error', (err: NodeJS.ErrnoException) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const durationMs = Date.now() - startTime;
          reject(
            new ProcessError(
              `进程启动失败: ${err.message} (code=${err.code})`,
              binaryPath,
              durationMs,
              err,
            ),
          );
        });

        // ---- 进程退出 ----
        child.on('close', (exitCode, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const durationMs = Date.now() - startTime;

          if (timedOut) {
            reject(
              new ProcessError(
                `进程执行超时 (${timeoutMs}ms)`,
                binaryPath,
                durationMs,
              ),
            );
            return;
          }

          const code = exitCode ?? (signal ? -1 : 0);

          if (code !== 0) {
            const detail = stderr.trim() || stdout.trim() || `exitCode=${code}`;
            this.logger.warn(
              `进程退出码非零: ${binaryPath} — ${detail.slice(0, 200)}`,
            );
          }

          resolve({ exitCode: code, stdout, stderr, durationMs });
        });
      });
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * 同步执行外部进程（非并发控制，用于快速探测等场景）
   *
   * @param binaryPath - 可执行文件路径
   * @param args       - 参数列表
   * @param timeoutMs  - 超时时间
   */
  runSync(
    binaryPath: string,
    args: string[],
    timeoutMs?: number,
  ): ProcessResult {
    const startTime = Date.now();
    try {
      const stdout = execSync(
        `"${binaryPath}" ${args.map((a) => `"${a}"`).join(' ')}`,
        {
          timeout: timeoutMs ?? this.defaultTimeoutMs,
          windowsHide: true,
        },
      ).toString();
      return {
        exitCode: 0,
        stdout,
        stderr: '',
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const error = err as {
        status?: number;
        stdout?: Buffer;
        stderr?: Buffer;
        message?: string;
      };
      return {
        exitCode: error.status ?? -1,
        stdout: error.stdout?.toString() ?? '',
        stderr: error.stderr?.toString() ?? error.message ?? '',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * 安全地终止进程
   *
   * @param pid       - 进程 PID
   * @param signal    - 信号类型，默认 SIGKILL
   */
  async kill(pid: number, signal: NodeJS.Signals = 'SIGKILL'): Promise<void> {
    try {
      process.kill(pid, signal);
      this.logger.debug(`已发送 ${signal} 到进程 ${pid}`);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ESRCH') {
        this.logger.warn(`进程 ${pid} 不存在`);
      } else {
        throw new ProcessError(
          `终止进程失败 (pid=${pid}): ${error.message}`,
          '',
          0,
          error,
        );
      }
    }
  }

  /** 当前正在运行的进程数 */
  getRunningCount(): number {
    return this.semaphore.running;
  }

  /** 队列中等待的进程数 */
  getQueuedCount(): number {
    return this.semaphore.waiting;
  }

  /**
   * 解析进程输出中的 JSON
   *
   * MxCAD 转换程序通常在 stdout 的最后一行输出 JSON 格式的结果。
   * 此方法提取最后一行 JSON 进行解析，忽略之前的非 JSON 输出。
   *
   * @param stdout - 标准输出内容
   */
  parseJsonOutput<T = Record<string, unknown>>(stdout: string): T {
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    // 从后往前找第一个合法的 JSON
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]!) as T;
      } catch {
        continue;
      }
    }

    throw new ProcessError(
      'stdout 中未找到合法的 JSON 行',
      '',
      0,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
