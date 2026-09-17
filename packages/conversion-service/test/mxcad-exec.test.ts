import { describe, it, before, after } from 'node:test';
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

/**
 * 构造可控的假 ChildProcess：用真实 EventEmitter 驱动 close/error/data 事件，
 * 由测试显式触发，避免依赖真实子进程与计时器（用于 Linux 进程组杀除路径）。
 */
function makeFakeChild(pid = 12345) {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = pid;
  return {
    child,
    fireClose: (code: number | null, signal: string | null) => child.emit('close', code, signal),
    fireError: (err: Error) => child.emit('error', err),
    emitStdout: (data: string) => child.stdout.emit('data', Buffer.from(data, 'utf8')),
  };
}

describe('runMxcadAssembly', () => {
  const originalPlatform = process.platform;
  let killSpy: (calls: KillCall[]) => () => void;

  before(() => {
    // 强制走 Linux 进程组杀除路径（事故平台），并 spy process.kill
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      configurable: true,
    });
    killSpy = (calls) => {
      const orig = process.kill;
      process.kill = (pid, signal) => {
        calls.push({ pid, signal });
        return true;
      };
      return () => {
        process.kill = orig;
      };
    };
  });

  after(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('正常退出：捕获 stdout，exitCode=0，timedOut=false，不杀进程组', async () => {
    const calls: KillCall[] = [];
    const restore = killSpy(calls);
    const fake = makeFakeChild(22222);

    const p = runMxcadAssembly('/bin/mxcadassembly', 'arg', {
      timeoutMs: 60000,
      spawnFn: () => fake.child,
    });
    fake.emitStdout('{"code":0}');
    fake.fireClose(0, null);

    const r = await p;
    assert.equal(r.stdout, '{"code":0}');
    assert.equal(r.exitCode, 0);
    assert.equal(r.timedOut, false);
    // 正常退出不应杀进程组
    assert.equal(calls.length, 0);
    restore();
  });

  it('Linux 超时：杀进程组（负 pid SIGTERM→SIGKILL），timedOut=true', async () => {
    const calls: KillCall[] = [];
    const restore = killSpy(calls);
    const fake = makeFakeChild(33333);

    const p = runMxcadAssembly('/bin/mxcadassembly', 'arg', {
      timeoutMs: 30,
      killEscalationMs: 20,
      spawnFn: () => fake.child,
    });

    // 等待超时 + 升级 SIGKILL 完成
    await new Promise((resolve) => setTimeout(resolve, 80));
    // 超时后进程组应被 SIGTERM + SIGKILL 杀掉（负 pid = 整组）
    assert.ok(
      calls.some((c) => c.pid === -33333 && c.signal === 'SIGTERM'),
      `应有 kill(-33333, SIGTERM)，实际=${JSON.stringify(calls)}`,
    );
    assert.ok(
      calls.some((c) => c.pid === -33333 && c.signal === 'SIGKILL'),
      `应有 kill(-33333, SIGKILL)，实际=${JSON.stringify(calls)}`,
    );

    // 超时后进程被杀 → close 事件带 SIGKILL 信号
    fake.fireClose(null, 'SIGKILL');
    const r = await p;
    assert.equal(r.timedOut, true);
    assert.equal(r.signal, 'SIGKILL');
    restore();
  });

  it('spawn 失败（ENOENT）：error 事件记入 stderr，exitCode=null', async () => {
    const fake = makeFakeChild(44444);

    const p = runMxcadAssembly('/nonexistent/mxcadassembly', 'arg', {
      timeoutMs: 60000,
      spawnFn: () => fake.child,
    });
    fake.fireError(new Error('spawn /nonexistent ENOENT'));

    const r = await p;
    assert.equal(r.exitCode, null);
    assert.equal(r.timedOut, false);
    assert.match(r.stderr, /ENOENT/);
  });
});

/**
 * 真实子进程对照测试（非 mock）：验证超时杀进程树真的生效，而非"进程能起来"。
 * 子进程 fork 一个 detached+unref 的孙进程（孙 PID 写入文件），若只杀直接子进程
 * 不杀树，孙进程会泄漏存活——本测试断言孙进程被一并杀掉。
 */
describe('runMxcadAssembly 真实子进程（进程树杀除）', () => {
  itWithOptions(
    '超时后直接子进程与 detached 孙进程都被杀（taskkill /T /F 或进程组 SIGKILL）',
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
          `const fs = require('fs');`,
          `const pidFile = ${JSON.stringify(pidFile)};`,
          "const g = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });",
          'fs.writeFileSync(pidFile, String(g.pid));',
          'setInterval(() => {}, 1000);',
        ].join('\n'),
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

      // 给 taskkill / 进程组 SIGKILL 一点时间完成
      await new Promise((r) => setTimeout(r, 600));

      const grandPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      assert.ok(grandPid > 0, `孙进程 PID 应为正数，实际=${grandPid}`);

      // 断言孙进程已不存在（若只杀直接子进程不杀树，它会存活）
      let alive: boolean;
      if (isWindows) {
        const out = execSync(`tasklist /FI "PID eq ${grandPid}"`, { encoding: 'utf8' });
        alive = out.includes(String(grandPid));
      } else {
        try {
          process.kill(grandPid, 0);
          alive = true;
        } catch (e) {
          alive = (e as NodeJS.ErrnoException).code !== 'EPERM'; // ESRCH = 不存在
        }
      }
      assert.equal(alive, false, `孙进程 ${grandPid} 应已被杀（进程树杀除生效）`);

      fs.rmSync(tmp, { recursive: true, force: true });
    },
    { timeout: 15000 },
  );
});
