import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMxcadAssembly } from '../mxcad-exec';
import type { TestContext } from 'node:test';

const isWindows = process.platform === 'win32';

// node:test 运行时支持 it(name, fn, options) 形式，但 @types/node 的 it 重载未覆盖该顺序
// （仅有 it(name, options, fn)）。此处补充该运行时签名以便带 timeout 的 it 调用通过类型检查。
const itWithOptions = it as unknown as (
  name: string,
  fn: (t: TestContext) => Promise<void>,
  options?: { timeout?: number }
) => Promise<void>;

interface KillCall {
  pid: number;
  signal: string | number | undefined;
}

interface FakeSpawn {
  child: any;
  calls: number;
  spawnOptions: Record<string, unknown> | undefined;
  fireClose: (code: number | null, signal: string | null) => void;
  fireError: (err: Error) => void;
  emitStdout: (data: string) => void;
  emitStderr: (data: string) => void;
}

/**
 * 构造可控的假 ChildProcess：用真实 EventEmitter 驱动 close/error/data 事件，
 * 由测试显式触发，避免依赖真实子进程与计时器（用于 Linux 进程组杀除路径）。
 * 通过 opts.spawnFn 注入，不用 mock child_process 模块。
 */
function makeFakeSpawn(pid = 12345): FakeSpawn {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = pid;
  return {
    child,
    calls: 0,
    spawnOptions: undefined,
    fireClose: (code, signal) => child.emit('close', code, signal),
    fireError: (err) => child.emit('error', err),
    emitStdout: (data) =>
      child.stdout.emit('data', Buffer.from(data, 'utf8')),
    emitStderr: (data) =>
      child.stderr.emit('data', Buffer.from(data, 'utf8')),
  };
}

function makeSpawnFn(state: FakeSpawn) {
  return (
    _bin: string,
    _args: string[],
    options?: Record<string, unknown>
  ): any => {
    state.calls += 1;
    state.spawnOptions = { ...options };
    return state.child;
  };
}

/**
 * 轮询等待条件成立（真定时器 + 足够宽的截止时间）。
 * 不用固定 setTimeout 猜测：SUT 的超时/升级计时器在 CPU 吃紧时会晚于测试侧的
 * 固定等待，导致断言在动作发生前执行而间歇性失败。
 */
async function waitFor(
  cond: () => boolean,
  deadlineMs = 3000,
  intervalMs = 5
): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > deadlineMs) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('runMxcadAssembly', () => {
  const originalPlatform = process.platform;
  let killCalls: KillCall[];
  let killRestore: (() => void) | undefined;

  beforeEach(() => {
    // 强制走 Linux 进程组杀除路径（事故平台），并 spy process.kill
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    killCalls = [];
    const orig = process.kill;
    process.kill = (pid, signal) => {
      killCalls.push({ pid, signal });
      return true;
    };
    killRestore = () => {
      process.kill = orig;
    };
  });

  afterEach(() => {
    killRestore?.();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('正常退出：捕获 stdout/stderr，exitCode=0，signal=null，timedOut=false，不杀进程组', async () => {
    const fake = makeFakeSpawn(22222);

    const p = runMxcadAssembly('/bin/mxcadassembly', 'arg', {
      timeoutMs: 60000,
      spawnFn: makeSpawnFn(fake),
    });
    fake.emitStdout('{"code":0}');
    fake.emitStderr('diag');
    fake.fireClose(0, null);

    const r = await p;
    assert.equal(r.stdout, '{"code":0}');
    assert.equal(r.stderr, 'diag');
    assert.equal(r.exitCode, 0);
    assert.equal(r.signal, null);
    assert.equal(r.timedOut, false);
    // 正常退出不应杀进程组
    assert.equal(killCalls.length, 0);
    // Linux 下以 detached 方式 spawn（新进程组），且参数是单个 JSON 字符串
    assert.equal(fake.calls, 1);
    assert.deepEqual(fake.spawnOptions, {
      cwd: undefined,
      detached: true,
      windowsHide: true,
      windowsVerbatimArguments: false,
      env: process.env,
    });
  });

  it('超时：杀进程组（负 pid SIGTERM→SIGKILL），timedOut=true，logger 收到超时告警', async () => {
    const fake = makeFakeSpawn(33333);
    const warnings: string[] = [];

    const p = runMxcadAssembly('/bin/mxcadassembly', 'arg', {
      timeoutMs: 30,
      killEscalationMs: 20,
      logger: { warn: (m) => warnings.push(m) },
      spawnFn: makeSpawnFn(fake),
    });

    // 等到 SIGTERM + SIGKILL 两级都实际发出（不等固定时长）
    await waitFor(
      () =>
        killCalls.some((c) => c.pid === -33333 && c.signal === 'SIGTERM') &&
        killCalls.some((c) => c.pid === -33333 && c.signal === 'SIGKILL')
    );
    // 超时后进程组应被 SIGTERM + SIGKILL 杀掉（负 pid = 整组）
    assert.ok(
      killCalls.some((c) => c.pid === -33333 && c.signal === 'SIGTERM'),
      `应有 kill(-33333, SIGTERM)，实际=${JSON.stringify(killCalls)}`
    );
    assert.ok(
      killCalls.some((c) => c.pid === -33333 && c.signal === 'SIGKILL'),
      `应有 kill(-33333, SIGKILL)，实际=${JSON.stringify(killCalls)}`
    );

    // 超时后进程被杀 → close 事件带 SIGKILL 信号
    fake.fireClose(null, 'SIGKILL');
    const r = await p;
    assert.equal(r.timedOut, true);
    assert.equal(r.signal, 'SIGKILL');
    // 超时告警走 logger（backend 侧依赖此日志定位孤儿进程事故）
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /超时\(30ms\)/);
  });

  it('spawn 失败（ENOENT）：error 事件记入 stderr，exitCode=null，不超时', async () => {
    const fake = makeFakeSpawn(44444);

    const p = runMxcadAssembly('/nonexistent/mxcadassembly', 'arg', {
      timeoutMs: 60000,
      spawnFn: makeSpawnFn(fake),
    });
    fake.fireError(new Error('spawn /nonexistent ENOENT'));

    const r = await p;
    assert.equal(r.exitCode, null);
    assert.equal(r.timedOut, false);
    assert.match(r.stderr, /ENOENT/);
  });

  it('非零退出码但输出含成功标记：保留 stdout 供调用方解析', async () => {
    const fake = makeFakeSpawn(55555);

    const p = runMxcadAssembly('/bin/mxcadassembly', 'arg', {
      timeoutMs: 60000,
      spawnFn: makeSpawnFn(fake),
    });
    fake.emitStdout('{"code":0}');
    fake.fireClose(1, null);

    const r = await p;
    assert.equal(r.exitCode, 1);
    assert.equal(r.timedOut, false);
    assert.equal(r.stdout, '{"code":0}');
  });

  it('onChild 取消句柄：调用后杀进程组（SIGTERM→SIGKILL 升级）', async () => {
    const fake = makeFakeSpawn(66666);
    let cancel: (() => void) | undefined;

    const p = runMxcadAssembly('/bin/mxcadassembly', 'arg', {
      timeoutMs: 60000,
      killEscalationMs: 20,
      onChild: (kill) => {
        cancel = kill;
      },
      spawnFn: makeSpawnFn(fake),
    });

    assert.equal(typeof cancel, 'function', 'spawn 拉起后应回调 kill 句柄');
    cancel?.();
    // 等到 SIGTERM + SIGKILL 两级都实际发出
    await waitFor(
      () =>
        killCalls.some((c) => c.pid === -66666 && c.signal === 'SIGTERM') &&
        killCalls.some((c) => c.pid === -66666 && c.signal === 'SIGKILL')
    );
    assert.ok(
      killCalls.some((c) => c.pid === -66666 && c.signal === 'SIGTERM'),
      `取消应 kill(-66666, SIGTERM)，实际=${JSON.stringify(killCalls)}`
    );
    assert.ok(
      killCalls.some((c) => c.pid === -66666 && c.signal === 'SIGKILL'),
      `取消应升级到 kill(-66666, SIGKILL)，实际=${JSON.stringify(killCalls)}`
    );

    fake.fireClose(null, 'SIGKILL');
    const r = await p;
    // 取消不算超时
    assert.equal(r.timedOut, false);
  });
});

/**
 * 真实子进程对照测试（非 mock）：验证超时杀进程树真的生效，而非"进程能起来"。
 * 子进程 fork 一个孙进程（孙 PID 写入文件），若只杀直接子进程不杀树，
 * 孙进程会泄漏存活——本测试断言孙进程被一并杀掉。
 *
 * 本套测试不在 Linux 平台 mock 上运行：需走当前平台的真实 spawn/杀树语义。
 */
describe('runMxcadAssembly 真实子进程（进程树杀除）', () => {
  itWithOptions(
    '超时后直接子进程与孙进程都被杀（taskkill /T /F 或进程组 SIGKILL）',
    async (t: TestContext) => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mxcad-exec-'));
      const pidFile = path.join(tmp, 'grandchild.pid');
      // 子进程脚本：fork 一个「非 detached」孙进程（Linux 下继承主子的进程组，
      // Windows 下处于进程树内），写入孙 PID。若只杀直接子进程不杀树/组，孙进程会泄漏存活。
      const childScript = path.join(tmp, 'child.js');
      fs.writeFileSync(
        childScript,
        [
          "const { spawn } = require('child_process');",
          "const fs = require('fs');",
          `const pidFile = ${JSON.stringify(pidFile)};`,
          "const g = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });",
          'fs.writeFileSync(pidFile, String(g.pid));',
          'setInterval(() => {}, 1000);',
        ].join('\n')
      );

      // 真实 spawn（默认 spawnFn），短超时触发杀进程树。
      // runMxcadAssembly 内部 spawn(bin, [arg])，故 arg 传字符串 childScript → 跑 `node childScript.js`
      const result = await runMxcadAssembly(process.execPath, childScript, {
        timeoutMs: 500,
        killEscalationMs: 500,
      }).catch((e) => {
        t.diagnostic(`runMxcadAssembly 异常: ${(e as Error).message}`);
        return { timedOut: true, stdout: '', stderr: String(e) };
      });

      assert.equal(result.timedOut, true, '应因超时被杀');

      const grandPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      assert.ok(grandPid > 0, `孙进程 PID 应为正数，实际=${grandPid}`);

      // 轮询直到孙进程真的不存在（不等固定时长：进程回收与 taskkill 都非瞬时）
      const isAlive = (): boolean => {
        if (isWindows) {
          const out = execSync(`tasklist /FI "PID eq ${grandPid}"`, {
            encoding: 'utf8',
          });
          return out.includes(String(grandPid));
        }
        try {
          process.kill(grandPid, 0);
          return true;
        } catch (e) {
          return (e as NodeJS.ErrnoException).code !== 'EPERM'; // ESRCH = 不存在
        }
      };
      await waitFor(() => !isAlive(), 8000);

      // 断言孙进程已不存在（若只杀直接子进程不杀树，它会存活）
      assert.equal(isAlive(), false, `孙进程 ${grandPid} 应已被杀（进程树杀除生效）`);

      fs.rmSync(tmp, { recursive: true, force: true });
    },
    { timeout: 15000 }
  );
});
