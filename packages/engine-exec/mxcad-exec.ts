import { spawn, exec } from 'child_process';

/**
 * 引擎执行日志的最小接口：只要求可选的 warn，避免本包对 @nestjs/common 产生依赖。
 * NestJS 的 Logger（warn(message, ...optional)）结构上满足此接口。
 */
export interface EngineExecLogger {
  warn?: (message: string) => void;
}

/**
 * 以独立进程组方式运行 mxcadassembly，超时或结束时杀掉整个进程组（含其 fork 的子进程）。
 *
 * 这是引擎协议（spawn/参数转义/超时杀树/输出捕获）的**唯一实现**：backend 的进程内转换
 * 与 conversion-service 的队列执行器共同调用，不再有各自一份副本。
 *
 * 修复 8-28 CPU 打满死机事故根因：此前两侧都用 `exec`（经 shell 包装）跑 mxcadassembly，
 * 超时只向 shell 子进程发 SIGTERM，原生 mxcadassembly 进程（及其子进程）没被真正杀掉，
 * 变成孤儿持续吃 CPU，反复转换大图纸时孤儿累积导致整机 CPU 打满。
 *
 * 本函数用 `spawn` 直接拉起 mxcadassembly（不经 shell）：
 * - Linux：`detached: true` 使子进程成为新进程组 leader，超时/结束时 `kill(-pid)` 杀整组；
 * - Windows：`taskkill /PID <pid> /T /F` 杀进程树。
 *
 * 始终 resolve（不 reject），由调用方解析 stdout/stderr 里的 `{"code":...}` 结果。
 */
export interface RunMxcadAssemblyOptions {
  /** 子进程工作目录（Linux 下 mxcadassembly 依赖其自身目录加载资源） */
  cwd?: string;
  /** 超时（毫秒） */
  timeoutMs: number;
  /** 超时后 SIGTERM→SIGKILL 的升级等待时长（毫秒），默认 2000 */
  killEscalationMs?: number;
  /** 可选日志器，用于记录超时杀组 */
  logger?: EngineExecLogger;
  /** 可注入的 spawn（测试用 fake child）；返回对象需具备 stdout/stderr/pid/on */
  spawnFn?: (
    bin: string,
    args: string[],
    options?: Record<string, unknown>
  ) => any;
  /** 子进程拉起后回调 kill 句柄（杀整个进程组），供取消机制使用（#431） */
  onChild?: (kill: () => void) => void;
}

export interface RunMxcadAssemblyResult {
  /** 子进程 stdout（utf8） */
  stdout: string;
  /** 子进程 stderr（utf8） */
  stderr: string;
  /** 退出码；被信号杀死或 spawn 失败时为 null */
  exitCode: number | null;
  /** 终止信号（如 SIGTERM/SIGKILL）；正常退出为 null */
  signal: string | null;
  /** 是否因超时被杀 */
  timedOut: boolean;
}

export function runMxcadAssembly(
  bin: string,
  arg: string,
  opts: RunMxcadAssemblyOptions
): Promise<RunMxcadAssemblyResult> {
  const isLinux = process.platform === 'linux';
  const spawnFn = opts.spawnFn || spawn;
  const escalationMs = opts.killEscalationMs ?? 2000;

  return new Promise<RunMxcadAssemblyResult>((resolve) => {
    // Windows 必须 windowsVerbatimArguments: true——arg 是含双引号的 JSON
    // （{"srcpath":"..."}），Node 默认转义会把内部 " 变成 \"，而 mxcadassembly
    // 按原始命令行解析、不认 \" 转义，导致解析不到 srcpath 报 read file error
    // (exit 2123)。verbatim 让 JSON 原样传入（等价 aaf2626 之前的 exec 行为）。
    // Linux 下该选项无效，且 execve 本就按 argv 原样传递，故置 false。
    const child = spawnFn(bin, [arg], {
      cwd: opts.cwd,
      detached: isLinux,
      windowsHide: true,
      windowsVerbatimArguments: !isLinux,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timeoutTimer: ReturnType<typeof setTimeout>;
    let escalateTimer: ReturnType<typeof setTimeout>;

    const killTree = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      if (isLinux) {
        // 负 pid = 杀整个进程组，覆盖 mxcadassembly 及其子进程
        try {
          process.kill(-child.pid, signal);
        } catch {
          /* 进程组已退出 */
        }
      } else {
        // Windows：杀进程树（/T 含子进程，/F 强制）
        try {
          exec(`taskkill /PID ${child.pid} /T /F`, () => {});
        } catch {
          /* ignore */
        }
      }
    };

    // 取消机制（#431）：子进程拉起后回调 kill 句柄，杀整个进程组（SIGTERM → SIGKILL 升级）。
    // 升级计时器 unref，不阻塞进程退出；子进程被杀后 close 事件触发 finish，重复 kill 无害。
    if (opts.onChild) {
      opts.onChild(() => {
        killTree('SIGTERM');
        const t = setTimeout(() => killTree('SIGKILL'), escalationMs);
        if (typeof t.unref === 'function') t.unref();
      });
    }

    const finish = (exitCode: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (escalateTimer) clearTimeout(escalateTimer);
      resolve({ stdout, stderr, exitCode, signal, timedOut });
    };

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });

    // 超时：先 SIGTERM 杀进程组，escalationMs 后仍未退出再 SIGKILL
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      opts.logger?.warn?.(`mxcadassembly 超时(${opts.timeoutMs}ms)，杀进程组`);
      killTree('SIGTERM');
      escalateTimer = setTimeout(() => killTree('SIGKILL'), escalationMs);
    }, opts.timeoutMs);

    child.on('error', (err: Error) => {
      // spawn 失败（如 ENOENT）：记入 stderr 后按异常退出结算
      stderr += `\n${err.message}`;
      finish(null, null);
    });

    child.on('close', (code: number | null, sig: NodeJS.Signals | null) => {
      finish(code, sig);
    });
  });
}
