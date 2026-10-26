/**
 * foreground/heartbeat.js 回归测试（node:test，0 外部依赖）
 *
 * 心跳子进程是关窗哨兵（sentinel.js）的「CLI 存活」信号源：它随控制台同亡
 * （Windows CTRL_CLOSE_EVENT / Linux SIGHUP），职责只有持续刷新存活文件 mtime。
 * 锁定三件事：
 * - 启动即写、周期性刷新（哨兵按 mtime 判陈旧，一次性写入会误判 CLI 已死）；
 * - 缺 aliveFile 参数 → 退出码 1（拉起方传错参数要能立刻发现）；
 * - 存活文件路径失效（如目录被删）→ 吞掉写失败、进程不退出（哨兵按
 *   「文件缺失 = 已死」判定，方向安全）。
 *
 * 运行：node --test runtime/scripts/foreground/heartbeat.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const HEARTBEAT_JS = path.join(__dirname, 'heartbeat.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 临时目录 + 其下的存活文件路径。 */
function tmpAliveFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-heartbeat-test-'));
  return { dir, aliveFile: path.join(dir, 'alive') };
}

/** 等到存活文件 mtime 晚于 from（超时抛错）。 */
function waitForFresh(aliveFile, from, timeoutMs = 8000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        const st = fs.statSync(aliveFile);
        if (st.mtimeMs > from) {
          clearInterval(timer);
          resolve(st);
        }
      } catch {
        /* 尚未写入 */
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('等待存活文件刷新超时'));
      }
    }, 100);
  });
}

test('heartbeat：启动即写存活文件，并按周期持续刷新', async () => {
  const { dir, aliveFile } = tmpAliveFile();
  const child = spawn(process.execPath, [HEARTBEAT_JS, aliveFile, '500'], {
    stdio: 'ignore',
  });
  try {
    const first = await waitForFresh(aliveFile, 0);
    // 第二次刷新（间隔 500ms）证明是周期刷新而非一次性写入
    const second = await waitForFresh(aliveFile, first.mtimeMs);
    assert.ok(second.mtimeMs > first.mtimeMs);
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('heartbeat：缺 aliveFile 参数 → 退出码 1', async () => {
  const child = spawn(process.execPath, [HEARTBEAT_JS], { stdio: 'ignore' });
  const code = await new Promise((r) => child.once('exit', (c) => r(c)));
  assert.equal(code, 1);
});

test('heartbeat：存活文件路径失效（目录被删）→ 吞掉写失败、进程不退出', async () => {
  const { dir } = tmpAliveFile();
  const goneFile = path.join(dir, 'no-such-dir', 'alive');
  const child = spawn(process.execPath, [HEARTBEAT_JS, goneFile, '500'], {
    stdio: 'ignore',
  });
  await sleep(1200);
  // 写失败被吞掉：进程仍存活（哨兵按「文件缺失 = 已死」判定，方向安全）
  assert.equal(child.exitCode, null);
  child.kill('SIGTERM');
  await new Promise((r) => child.once('exit', r));
  fs.rmSync(dir, { recursive: true, force: true });
});
