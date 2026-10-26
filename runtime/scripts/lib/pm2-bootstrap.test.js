/**
 * pm2-bootstrap.js 编排原语回归测试（node:test，0 外部依赖，不需要真实 PM2/服务）
 *
 * 锁定的是从 verify-deploy.js 抽出的三处决策口径——抽错口径会让断网验收门禁的
 * 行为漂移，而这些路径本地跑不到（验收器只在离线容器里被调用），故必须在单测里
 * 钉死：
 *   1. pm2 调用的 60s 超时兜底（runCommand 默认无超时，验收器非交互不能永久挂住）
 *   2. 就绪轮询的超时契约（窗口耗尽 resolve false 而非 reject、命中即返回 true、
 *      间隔/窗口默认值、时间不前进时的死循环防护）
 *   3. PM2 配置文件的字节形态（单应用/多应用两种历史口径都逐字节不变）
 *
 * 运行：node --test runtime/scripts/lib/pm2-bootstrap.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PM2_TIMEOUT,
  DEFAULT_SERVICE_WAIT,
  SERVICE_CHECK_INTERVAL,
  runPm2WithTimeout,
  waitForService,
  pm2AppConfigBody,
  writePm2AppConfig,
} = require('./pm2-bootstrap');

// ==================== 口径常量 ====================

test('就绪轮询默认口径保持 120s 窗口 / 2s 间隔 / pm2 调用 60s 超时', () => {
  assert.equal(PM2_TIMEOUT, 60000);
  assert.equal(DEFAULT_SERVICE_WAIT, 120000);
  assert.equal(SERVICE_CHECK_INTERVAL, 2000);
});

// ==================== runPm2WithTimeout ====================

test('pm2 包装：默认注入 60s 超时，调用方 options 可覆盖超时', () => {
  const calls = [];
  const fake = (args, options) => {
    calls.push({ args, options });
    return true;
  };

  assert.equal(runPm2WithTimeout(['start', 'a.js'], {}, { runPm2: fake }), true);
  assert.deepEqual(calls, [{ args: ['start', 'a.js'], options: { timeout: PM2_TIMEOUT } }]);

  assert.equal(
    runPm2WithTimeout(['delete', 'all'], { silent: true }, { runPm2: fake }),
    true
  );
  assert.deepEqual(calls[1].options, { timeout: PM2_TIMEOUT, silent: true });

  // 显式覆盖超时（对齐旧 runCommand 的「调用方说了算」）
  runPm2WithTimeout(['status'], { timeout: 5000 }, { runPm2: fake });
  assert.equal(calls[2].options.timeout, 5000);
});

test('pm2 包装：透传 runPm2 的返回，不自行判成败', () => {
  const fake = () => false;
  assert.equal(runPm2WithTimeout(['kill'], {}, { runPm2: fake }), false);
});

test('pm2 包装：从注入对象读实现（不在模块加载期绑定），便于替换', () => {
  const fake = () => true;
  const deps = { runPm2: fake };
  assert.equal(runPm2WithTimeout(['status'], {}, deps), true);
  // 换实现后立即生效，证明是调用期读取
  deps.runPm2 = () => false;
  assert.equal(runPm2WithTimeout(['status'], {}, deps), false);
});

// ==================== waitForService ====================

/**
 * 可控时钟：把「真实时间流逝」换成可断言的序列，避免测试真的等 2s/120s。
 *
 * now/advance 必须是箭头闭包而非对象方法——注入方以 `deps.now` 取出后直接调用，
 * 方法引用会丢 this，而 CommonJS 默认非严格模式下 `this.value` 静默变成 undefined
 * （`NaN < maxWait` 为 false → 循环一次不跑 → 返回 false），比抛错更难查。
 */
function clock(initial) {
  let t = initial;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

test('waitForService：窗口内第一次探测通过即返回 true，且不再轮询', async () => {
  const clk = clock(0);
  let checked = 0;
  const sleeps = [];

  const ok = await waitForService(
    'PG',
    () => {
      checked += 1;
      return true;
    },
    120000,
    {
      now: clk.now,
      // sleep 同时推进时钟：真实路径里 setTimeout 的回调发生在未来
      sleep: (ms) => {
        sleeps.push(ms);
        clk.advance(ms);
      },
    }
  );

  assert.equal(ok, true);
  assert.equal(checked, 1, '命中即返回，不应继续轮询');
  assert.deepEqual(sleeps, [], '命中即返回，不应再 sleep');
});

test('waitForService：窗口耗尽返回 false 而非 reject（调用方靠 !await 判定）', async () => {
  const clk = clock(0);
  let checked = 0;

  // 用 await 包裹：若被测代码抛异常/不 resolve，本断言会失败——验证「超时不抛」契约。
  const ok = await waitForService(
    'PG',
    () => {
      checked += 1;
      return false;
    },
    1000,
    { now: clk.now, sleep: () => clk.advance(500), intervalMs: 500 }
  );

  assert.equal(ok, false);
  // t=0 判 false → sleep 500 → t=500 判 false → sleep 500 → t=1000 不 < 1000，退出
  assert.equal(checked, 2, '1000ms 窗口 / 500ms 间隔应轮询两次');
});

test('waitForService：等待中翻转即在第 N 次命中（默认 2000ms 间隔）', async () => {
  const clk = clock(0);
  let checked = 0;
  const sleeps = [];

  const ok = await waitForService(
    'Backend',
    () => {
      checked += 1;
      return checked === 3;
    },
    120000,
    {
      now: clk.now,
      sleep: (ms) => {
        sleeps.push(ms);
        clk.advance(ms);
      },
    }
  );

  assert.equal(ok, true);
  assert.equal(checked, 3);
  // 第 1、2 次未命中各等一个默认间隔，第 3 次命中即返回
  assert.deepEqual(sleeps, [2000, 2000], '两次未命中各等一个默认间隔');
});

test('waitForService：支持 async checkFn', async () => {
  const clk = clock(0);
  const ok = await waitForService(
    'Config-service',
    async () => false,
    1000,
    { now: clk.now, sleep: () => clk.advance(1000), intervalMs: 1000 }
  );
  assert.equal(ok, false);
});

test('waitForService：轮询有界——时钟推进到窗口外即退出（不会无限等）', async () => {
  const clk = clock(0);
  let checked = 0;

  // 每次 sleep 都推进一半窗口，时钟单调前进：窗口必在有限次内耗尽
  const ok = await waitForService(
    'Conversion',
    () => {
      checked += 1;
      return false;
    },
    10000,
    { now: clk.now, sleep: () => clk.advance(5000), intervalMs: 5000 }
  );

  assert.equal(ok, false);
  // t=0 判 → sleep 5000 → t=5000 判 → sleep 5000 → t=10000 不 < 10000，退出
  assert.equal(checked, 2, '两次判定后时钟越过窗口即退出');
});

// ==================== PM2 配置序列化 ====================

const SAMPLE_APP = {
  name: 'backend',
  script: 'D:\\deploy\\main.js',
  cwd: 'D:\\deploy\\packages\\backend',
  autorestart: true,
  watch: false,
  max_restarts: 10,
  env: { NODE_ENV: 'production' },
};

test('配置序列化：单应用逐字节等于 verify-deploy.js 的旧字面量口径', () => {
  assert.equal(
    pm2AppConfigBody([SAMPLE_APP]),
    `module.exports = { apps: [${JSON.stringify(SAMPLE_APP)}] };`
  );
});

test('配置序列化：多应用逐字节等于 start.js 的旧字面量口径', () => {
  const a = { name: 'backend', script: '/a' };
  const b = { name: 'frontend', script: '/b' };
  const c = { name: 'conversion', script: '/c' };

  // start.js 的旧字面量是 apps.map(JSON.stringify).join(', ')——分隔符为 ", "
  // （逗号+空格），不是 PM2 通常接受的纯逗号。钉死这个形态，避免谁「顺手美化」。
  assert.equal(
    pm2AppConfigBody([a, b]),
    `module.exports = { apps: [${JSON.stringify(a)}, ${JSON.stringify(b)}] };`
  );
  assert.equal(
    pm2AppConfigBody([a, b, c]),
    `module.exports = { apps: [${JSON.stringify(a)}, ${JSON.stringify(
      b
    )}, ${JSON.stringify(c)}] };`
  );
});

test('配置序列化：两个历史调用点的输出互不相同但各自不变', () => {
  // 单应用（verify-deploy.js 口径）与「同一 app 的数组」输出一致——
  // 这是抽取后 verify-deploy 从 JSON.stringify(cfg) 改为 [cfg] 仍零回归的依据
  const cfg = { name: 'backend', script: 'D:\\main.js' };
  assert.equal(pm2AppConfigBody([cfg]), `module.exports = { apps: [${JSON.stringify(cfg)}] };`);

  // 空数组是边界，当前无调用方依赖，但形态必须仍是合法 JS
  assert.equal(pm2AppConfigBody([]), 'module.exports = { apps: [] };');
});

test('writePm2AppConfig：写盘内容即序列化结果，返回路径，单应用可注入写器', () => {
  const written = [];
  const p = 'data\\pm2-backend.config.js';

  const ret = writePm2AppConfig(p, [SAMPLE_APP], {
    writeFileSync: (path, content) => written.push({ path, content }),
  });

  assert.equal(ret, p);
  assert.equal(written.length, 1);
  assert.equal(written[0].path, p);
  assert.equal(written[0].content, `module.exports = { apps: [${JSON.stringify(SAMPLE_APP)}] };`);
});

test('writePm2AppConfig：未注入时用真实 fs 写盘（默认 utf8，与原调用点一致）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm2-bootstrap-'));
  const p = path.join(dir, 'pm2-deploy.config.js');
  try {
    assert.equal(writePm2AppConfig(p, [SAMPLE_APP]), p);
    const onDisk = fs.readFileSync(p, 'utf8');
    assert.equal(
      onDisk,
      `module.exports = { apps: [${JSON.stringify(SAMPLE_APP)}] };`
    );
    // PM2 按 Node 语法 require 该文件——形态必须可解析
    const mod = require(p);
    assert.deepEqual(mod.apps, [SAMPLE_APP]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writePm2AppConfig：父目录不存在时按 fs.writeFileSync 语义抛错', () => {
  assert.throws(() => writePm2AppConfig(path.join(os.tmpdir(), 'no-such-dir-x', 'x.js'), [SAMPLE_APP]));
});
