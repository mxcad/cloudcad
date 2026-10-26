/**
 * @fileoverview PM2 启动编排原语 —— verify-deploy.js 与 commands/start.js 共用。
 *
 * 三个决策点原来各自在编排脚本里写一份：pm2 调用的超时口径（只在验收器里有）、
 * 就绪轮询循环（只在验收器里有）、PM2 配置文件序列化（验收器 4 处 + start.js 1 处，
 * 共 5 份字面量）。抽出后各自的口径只有一处，且都能在 node:test 里断言。
 *
 * 与 lib/health.js 的 waitForPort **刻意不合并**：waitForPort 是事件驱动的 TCP 就绪
 * 探测（只连 127.0.0.1、500ms 退避、超时 reject、内部打日志），waitForService 是
 * 编排脚本的通用就绪门（接受任意 checkFn——TCP 或 HTTP、2s 间隔、超时 resolve false
 * 不抛异常、不打日志）。两者超时契约相反，强行统一会让调用方的 `!(await …)` 判定
 * 变成未捕获异常。
 */

const fs = require('fs');
const { runPm2 } = require('./proc');

// 验收脚本非交互运行：pm2 命令挂起时不能让验收流程永久挂住。runCommand 默认不传
// timeout（spawnSync 的「无超时」语义），故这里显式兜底。
const PM2_TIMEOUT = 60000;

// 就绪轮询默认口径
const DEFAULT_SERVICE_WAIT = 120000;
const SERVICE_CHECK_INTERVAL = 2000;

/**
 * pm2 命令包装：lib/proc 的 runPm2 + 60s 超时。
 *
 * 调用方可用 `runPm2WithTimeout(args, opts, { runPm2: fake })` 注入实现做单测；
 * 不注入时用真实 runPm2。
 * @param {string[]} args
 * @param {object} [options]
 * @param {object} [deps] { runPm2: (args, options) => boolean }
 * @returns {boolean}
 */
function runPm2WithTimeout(args, options = {}, deps = {}) {
  const pm2Runner = deps.runPm2 || runPm2;
  return pm2Runner(args, { timeout: PM2_TIMEOUT, ...options });
}

/**
 * 等待服务就绪：在 maxWait 窗口内每 intervalMs 调一次 checkFn，为真即返回 true；
 * 窗口耗尽返回 false——**不抛异常**，调用方以 `!(await waitForService(...))` 判定失败。
 * name 仅用于签名可读性，不参与日志（各步骤自己打印）。
 *
 * 有界性依赖「now 单调前进」：若时钟停滞（now 恒返同一值），循环只在窗口外才退出，
 * 退化为无界自旋。原实现如此，抽取时保持原样——默认路径用 Date.now 不受影响；
 * 真要修需加轮询次数上限，那是一次行为变更，不属本次抽取范围。
 * 同理 deps.now 必须是可直接调用的零参函数：对象方法引用会丢 this，而本模块
 * 非严格模式下 `this.value` 静默成 undefined → `NaN < maxWait` 为 false → 一次
 * 不轮询就返回 false（比抛错更隐蔽）。
 *
 * @param {string} name
 * @param {() => (boolean|Promise<boolean>)} checkFn
 * @param {number} [maxWait]
 * @param {object} [deps] { now, sleep, intervalMs }
 * @returns {Promise<boolean>}
 */
async function waitForService(name, checkFn, maxWait = DEFAULT_SERVICE_WAIT, deps = {}) {
  const now = deps.now || Date.now;
  const sleep =
    deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const interval = deps.intervalMs ?? SERVICE_CHECK_INTERVAL;
  const startTime = now();

  while (now() - startTime < maxWait) {
    if (await checkFn()) return true;
    await sleep(interval);
  }
  return false;
}

/**
 * PM2 配置文件内容（module.exports 形态）。
 *
 * 序列化口径 `JSON.stringify(app) + ', '` 是历史约定，verify-deploy.js 与 start.js
 * 五处字面量逐字节一致——不要改分隔符或加引号转义，PM2 按 Node 语法 require 该文件，
 * 但调用方按字节比对临时配置是否变化。
 * @param {object[]} apps
 * @returns {string}
 */
function pm2AppConfigBody(apps) {
  return `module.exports = { apps: [${apps
    .map((a) => JSON.stringify(a))
    .join(', ')}] };`;
}

/**
 * 写 PM2 临时配置文件，返回写入路径。
 * @param {string} configPath
 * @param {object[]} apps
 * @param {object} [deps] { writeFileSync: (path, content) => void }
 * @returns {string}
 */
function writePm2AppConfig(configPath, apps, deps = {}) {
  const write =
    deps.writeFileSync || ((p, s) => fs.writeFileSync(p, s, 'utf8'));
  write(configPath, pm2AppConfigBody(apps));
  return configPath;
}

module.exports = {
  PM2_TIMEOUT,
  DEFAULT_SERVICE_WAIT,
  SERVICE_CHECK_INTERVAL,
  runPm2WithTimeout,
  waitForService,
  pm2AppConfigBody,
  writePm2AppConfig,
};
