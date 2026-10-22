/**
 * foreground/cleanup.js 的日志接线与退出码（回归测试）
 *
 * 本脚本由信号处理器派生为 detached + stdio:'ignore' 进程，控制台输出无处可见。
 * 此前「停不干净」只剩一个退出码、完全静默，关终端后无从排查；现借 lib/deploy-log
 * 镜像到 data/logs/deploy/foreground-cleanup-<时间戳>.log。锁定点：
 * - 必须以 'foreground-cleanup' 为名开启镜像（否则日志中心 / 现场都找不到它）
 * - stopInfrastructure 成功 → 退出码 0；返回 false 或抛错 → 退出码 1
 * - 抛错路径同样要落一条异常信息（不静默）
 *
 * 镜像落盘逻辑本身由 lib/deploy-log.test.js 覆盖，这里只验接线与退出码。
 *
 * 运行：node --test runtime/scripts/foreground/cleanup.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const stubs = new Map();

function stub(relPath, exports) {
  stubs.set(relPath, require.resolve(relPath));
  require.cache[require.resolve(relPath)] = {
    id: require.resolve(relPath),
    filename: require.resolve(relPath),
    loaded: true,
    exports,
  };
}

/**
 * 以给定的 stopInfrastructure 行为运行一次 cleanup.js，返回观测结果。
 *
 * cleanup.js 在模块加载时即执行 main() 且 main() 是 async、结尾 process.exit，
 * 故须：预置两个依赖的桩（真实 deploy-log 会劫持 process.stdout），
 * 临时把 process.exit 换成记录器（否则测试进程直接死掉），
 * 并等一个 setImmediate 让 main() 的微任务链跑完再还原。
 */
async function runCleanup(stopBehavior) {
  const logOpenings = [];
  const exitCodes = [];
  const stderrLines = [];

  stub('../lib/deploy-log', {
    startDeployLog: (name) => {
      logOpenings.push(name);
      return () => {};
    },
  });
  stub('../commands/stop', { stopInfrastructure: stopBehavior });

  const prevExit = process.exit;
  const prevError = console.error;
  process.exit = (code) => {
    exitCodes.push(code);
  };
  console.error = (...args) => {
    stderrLines.push(args.join(' '));
  };
  try {
    delete require.cache[require.resolve('./cleanup')];
    require('./cleanup');
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.exit = prevExit;
    console.error = prevError;
  }
  return { logOpenings, exitCodes, stderrLines };
}

test('stopInfrastructure 成功 → 开启 foreground-cleanup 镜像 + 退出码 0', async () => {
  const { logOpenings, exitCodes } = await runCleanup(async () => true);

  assert.deepEqual(logOpenings, ['foreground-cleanup']);
  assert.deepEqual(exitCodes, [0]);
});

test('stopInfrastructure 返回 false → 退出码 1（仍有残留）', async () => {
  const { logOpenings, exitCodes } = await runCleanup(async () => false);

  assert.deepEqual(logOpenings, ['foreground-cleanup']);
  assert.deepEqual(exitCodes, [1]);
});

test('stopInfrastructure 抛错 → 退出码 1 且异常信息落盘（不静默）', async () => {
  const { logOpenings, exitCodes, stderrLines } = await runCleanup(async () => {
    throw new Error('boom');
  });

  assert.deepEqual(logOpenings, ['foreground-cleanup']);
  assert.deepEqual(exitCodes, [1]);
  assert.ok(stderrLines.length === 1, '异常应被记录一条');
  assert.match(stderrLines[0], /boom/);
});

test.after(() => {
  for (const [rel, resolved] of stubs) delete require.cache[resolved];
});
