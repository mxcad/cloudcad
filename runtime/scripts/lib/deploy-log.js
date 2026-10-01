/**
 * @fileoverview 部署 / 升级过程日志落盘（console 镜像到 data/logs/deploy/）
 *
 * 此前 setup-offline / verify-deploy / deploy 只写控制台，部署现场无法事后
 * 追溯（data/ops-log 只有 start/exit 两行留痕）。本模块把目标机的控制台输出
 * 原样镜像一份到 data/logs/deploy/<名称>-<时间戳>.log，供「日志中心」打包。
 *
 * 实现：劫持 process.stdout/stderr.write（console.log/error 与一切终端输出
 * 的最低层入口），剥离 ANSI 色码后**同步追加**写入——用同步写是因为部署脚
 * 本大量使用 process.exit，异步流会在退出时丢尾部；部署输出量级（几百 KB）
 * 下同步追加无性能问题。镜像失败静默吞掉，绝不影响主流程。
 *
 * 用法：
 *   const stop = startDeployLog('deploy');  // 或 runWithDeployLog(name, fn)
 *   ...部署流程...
 *   stop();  // 恢复原始 write，结束镜像
 *
 * 依赖方向：lib → lib。
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('./context');
const { formatStamp } = require('./log-center');

// 活动镜像注册表：name -> 日志文件绝对路径。
// 运维中心（ADR-0071）的 job runner 借 getActiveLogFile('deploy') 拿到
// deployMode 自建 tee 的文件，用于进度流展示——避免二次劫持造成重复日志。
const activeLogFiles = new Map();

function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * 开始镜像控制台输出到 data/logs/deploy/<name>-<时间戳>.log。
 * 初始化失败（目录建不出/不可写）时返回 no-op stop——镜像绝不影响主流程。
 * @param {string} name 日志名（如 deploy / setup-offline / verify-deploy）
 * @param {{rootDir?: string, now?: Date}} [options]
 * @returns {() => void} stop —— 恢复原始输出并停止镜像（可安全重复调用）
 */
function startDeployLog(name, { rootDir = PROJECT_ROOT, now = new Date() } = {}) {
  const dir = path.join(rootDir, 'data', 'logs', 'deploy');
  const file = path.join(dir, `${name}-${formatStamp(now)}.log`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, ''); // 预创建文件，顺带探测可写
  } catch {
    return function noOpStop() {};
  }

  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stopped = false;

  const tee = (orig) => (chunk, encoding, cb) => {
    try {
      const text = typeof chunk === 'string' ? chunk : String(chunk);
      fs.appendFileSync(file, stripAnsi(text));
    } catch {
      // 日志镜像失败不影响主流程
    }
    return orig(chunk, encoding, cb);
  };

  process.stdout.write = tee(origOut);
  process.stderr.write = tee(origErr);
  activeLogFiles.set(name, file);

  return function stop() {
    if (stopped) return;
    stopped = true;
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    if (activeLogFiles.get(name) === file) activeLogFiles.delete(name);
  };
}

/**
 * 当前活动镜像的日志文件路径（无活动镜像时返回 null）。
 * 供运维中心 job runner 定位 deploy 进度日志（ADR-0071）。
 */
function getActiveLogFile(name) {
  return activeLogFiles.get(name) || null;
}

/**
 * 在镜像覆盖下执行一个异步函数，结束后（含异常路径）自动停止镜像。
 * @param {string} name 日志名
 * @param {() => Promise<any>} fn
 * @param {{rootDir?: string, now?: Date}} [options] 透传 startDeployLog
 */
async function runWithDeployLog(name, fn, options) {
  const stop = startDeployLog(name, options);
  try {
    return await fn();
  } finally {
    stop();
  }
}

module.exports = {
  startDeployLog,
  runWithDeployLog,
  getActiveLogFile,
  stripAnsi,
};
