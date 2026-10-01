/**
 * 运维中心回归测试（node:test，0 外部依赖）—— ADR-0071
 *
 * 覆盖两块纯逻辑：
 * - lib/job-runner.js：串行锁 / 进度行捕获与 ANSI 剥离 / 落盘恢复 /
 *   重启后 running → interrupted / 结果归一化（false 与 {ok:false} 均为失败）
 * - lib/ops.js 路径校验：日志 zip 名 / 打包名白名单 / viewLogFile 越权拒绝
 *
 * 运行：cd packages/config-service && npm test
 * （或 node --test test/ops.test.js）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createJobRunner, stripAnsi } = require('../lib/job-runner');
const {
  isValidLogZipName,
  isValidLogBundleName,
  viewLogFile,
} = require('../lib/ops');

function tmpTaskFile() {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'job-runner-test-')),
    'ops',
    'current-task.json'
  );
}

/** 临时接管 stdout 收集并转发（与 job-runner 的劫持链式兼容） */
function captureStdout(fn) {
  const chunks = [];
  const next = process.stdout.write;
  process.stdout.write = (chunk, enc, cb) => {
    chunks.push(String(chunk));
    return next.call(process.stdout, chunk, enc, cb);
  };
  try {
    return fn();
  } finally {
    process.stdout.write = next;
  }
}

test('stripAnsi 剥离 ANSI 色码', () => {
  assert.equal(stripAnsi('\x1b[31m红\x1b[0m'), '红');
});

test('startJob：执行成功、捕获输出行、落盘、结果为 success', async () => {
  const taskFile = tmpTaskFile();
  const runner = createJobRunner({ taskFile });

  const { started, task } = runner.startJob({
    kind: 'demo',
    label: '演示任务',
    fn: async () => {
      captureStdout(() => {
        console.log('任务内部输出');
        console.log('\x1b[32m[✓] 带颜色的输出\x1b[0m');
      });
      return { hello: true };
    },
  });
  assert.equal(started, true);
  assert.equal(task.status, 'running');

  // 等待异步任务收尾
  await new Promise((r) => setTimeout(r, 30));

  const done = runner.getCurrentTask();
  assert.equal(done.status, 'success');
  assert.deepEqual(done.result, { hello: true });
  assert.ok(done.lines.includes('任务内部输出'), '捕获任务输出');
  assert.ok(
    done.lines.some((l) => l.includes('[✓] 带颜色的输出')),
    'ANSI 已剥离但文本保留'
  );
  assert.ok(!done.lines.some((l) => l.includes('\x1b[')), '无 ANSI 残留');

  const persisted = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  assert.equal(persisted.status, 'success');
  assert.ok(persisted.finishedAt);
});

test('startJob：串行锁——运行中再启动返回 busy', async () => {
  const runner = createJobRunner({ taskFile: tmpTaskFile() });
  let release;
  const gate = new Promise((r) => (release = r));

  const first = runner.startJob({ kind: 'a', label: 'A', fn: () => gate });
  assert.equal(first.started, true);

  const second = runner.startJob({ kind: 'b', label: 'B', fn: async () => {} });
  assert.equal(second.started, false);
  assert.equal(second.reason, 'busy');
  assert.equal(second.task.kind, 'a');

  release(true);
  await new Promise((r) => setTimeout(r, 20));
  // 完成后可以再次启动
  const third = runner.startJob({ kind: 'b', label: 'B', fn: async () => true });
  assert.equal(third.started, true);
  await new Promise((r) => setTimeout(r, 20));
});

test('startJob：fn 返回 false / {ok:false} / 抛错 均判定失败', async () => {
  const runner = createJobRunner({ taskFile: tmpTaskFile() });

  runner.startJob({ kind: 'f1', label: 'F1', fn: async () => false });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(runner.getCurrentTask().status, 'failed');

  runner.startJob({
    kind: 'f2',
    label: 'F2',
    fn: async () => ({ ok: false, error: '备份失败' }),
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(runner.getCurrentTask().status, 'failed');
  assert.deepEqual(runner.getCurrentTask().result, { ok: false, error: '备份失败' });

  runner.startJob({
    kind: 'f3',
    label: 'F3',
    fn: async () => {
      throw new Error('boom');
    },
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(runner.getCurrentTask().status, 'failed');
  assert.match(runner.getCurrentTask().error, /boom/);
});

test('markInterruptedTasksOnBoot：遗留 running 态标记为 interrupted', () => {
  const taskFile = tmpTaskFile();
  fs.mkdirSync(path.dirname(taskFile), { recursive: true });
  fs.writeFileSync(
    taskFile,
    JSON.stringify({
      kind: 'stop-all',
      label: '完全停止',
      status: 'running',
      startedAt: '2026-10-01T00:00:00.000Z',
      lines: [],
    })
  );

  const runner = createJobRunner({ taskFile });
  runner.markInterruptedTasksOnBoot();

  const task = runner.getCurrentTask();
  assert.equal(task.status, 'interrupted');
  assert.match(task.error, /中断/);
  const persisted = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  assert.equal(persisted.status, 'interrupted');
});

test('isValidLogZipName：slug/单文件名.log 且防穿越', () => {
  assert.equal(isValidLogZipName('pm2/backend-out.log'), true);
  assert.equal(isValidLogZipName('backend/app-2026-10-01.log'), true);
  assert.equal(isValidLogZipName('no-slash.log'), false);
  assert.equal(isValidLogZipName('a/b/c.log'), false);
  assert.equal(isValidLogZipName('../secret.log'), false);
  assert.equal(isValidLogZipName('pm2/../../etc/passwd'), false);
  assert.equal(isValidLogZipName('pm2/x.txt'), false);
  assert.equal(isValidLogZipName('pm2/'), false);
  assert.equal(isValidLogZipName(42), false);
  assert.equal(isValidLogZipName('a\\b.log'), false);
});

test('isValidLogBundleName：仅接受 logs-<时间戳>.zip', () => {
  assert.equal(isValidLogBundleName('logs-20261001-112233.zip'), true);
  assert.equal(isValidLogBundleName('logs-20261001-112233.txt'), false);
  assert.equal(isValidLogBundleName('../../.env'), false);
  assert.equal(isValidLogBundleName(undefined), false);
});

test('viewLogFile：非法名 / 未知 slug 直接拒绝，不触盘', () => {
  assert.equal(viewLogFile('../package.json').ok, false);
  assert.equal(viewLogFile('unknown/foo.log').ok, false);
  // postgres 源有 filter（仅 postgres.log），其他文件拒绝
  assert.equal(viewLogFile('postgres/app.log').ok, false);
});
