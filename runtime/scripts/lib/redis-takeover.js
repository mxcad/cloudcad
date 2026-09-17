/**
 * @fileoverview Redis 旧实例自动发现与接管（升级路径：老无托管实例 → PM2 托管 #419）
 *
 * 背景：fillEmptySecrets 只把 REDIS_PASSWORD 写进 .env，从不触碰已运行的实例。
 * 老的无密码（或密码不一致）redis 实例若不在当前 PM2 daemon 名下，后端 AUTH
 * 恒失败（"ERR AUTH <password> called without any password configured"），
 * 且该实例不在 pm2 save/resurrect 恢复范围内。
 *
 * 归属判据：本部署的 redis 恒由 redis-manager 以 `--dir <PROJECT_ROOT>/data/redis`
 * 拉起，故占用进程 cmdline 含该绝对路径即确认为本部署旧实例（exe 路径可能因
 * 升级/替换而无法解析，故用 cmdline 而非 exe 判定）。确认后：
 * - 停掉旧实例（SIGTERM，redis 优雅退出前落盘 AOF；Windows taskkill /T）；
 * - 交 PM2 重启（redis-manager 按 .env REDIS_PASSWORD 以 --requirepass 拉起，
 *   密码持久化 + 纳入 PM2 托管）。
 * 非本部署实例（系统自带 redis / 其他部署目录）/ 归属未知 → 绝不触碰。
 *
 * 纯函数层（isOurRedisInstance / detectRedisOwnership）可注入 getCmdline 做
 * 0 依赖 node:test（见 redis-takeover.test.js）。
 */

const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const { IS_WINDOWS, DATA_DIR } = require('./context');

/**
 * 判定占用进程是否本部署的 redis 旧实例：
 * 本部署的 redis 恒由 redis-manager 以 `--dir <PROJECT_ROOT>/data/redis` 拉起，
 * 故 cmdline 含该绝对路径即视为本部署旧实例。
 * 归一化：Windows 反斜杠转正斜杠 + 全小写（路径大小写不敏感）。
 * @param {string} cmdline
 * @param {string} dataDir
 * @returns {boolean}
 */
function isOurRedisInstance(cmdline, dataDir) {
  const norm = (s) => (s || '').toLowerCase().replace(/\\/g, '/');
  const target = norm(dataDir);
  if (!target) return false;
  return norm(cmdline).includes(target);
}

/**
 * 读取进程命令行（Linux 走 /proc/<pid>/cmdline，Windows 走 wmic）。
 * 读取失败返回空串（调用方按"归属未知"处理，不触碰实例）。
 * @param {number|null} pid
 * @returns {string}
 */
function getProcessCmdline(pid) {
  if (!pid) return '';
  try {
    if (IS_WINDOWS) {
      const res = spawnSync(
        'wmic',
        ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine'],
        { encoding: 'utf8', shell: true, timeout: 5000, windowsHide: true }
      );
      return res.stdout || '';
    }
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return raw.split('\0').filter(Boolean).join(' ');
  } catch {
    return '';
  }
}

/**
 * 归属检测：
 * - pid 为空或 cmdline 不可读 → 'unknown'（归属未知，不触碰）
 * - cmdline 含本部署 data/redis 目录 → 'ours'（本部署旧实例，可接管）
 * - 其余 → 'foreign'（系统自带 / 其他部署目录，不触碰）
 * @param {number|null} [pid]
 * @param {string} [dataDir] 本部署 redis 数据目录（默认 data/redis）
 * @param {(pid: number) => string} [getCmdline] 注入用（测试）
 * @returns {'ours'|'foreign'|'unknown'}
 */
function detectRedisOwnership(
  pid,
  dataDir = path.join(DATA_DIR, 'redis'),
  getCmdline = getProcessCmdline
) {
  if (!pid) return 'unknown';
  const cmdline = getCmdline(pid);
  if (!cmdline) return 'unknown';
  return isOurRedisInstance(cmdline, dataDir) ? 'ours' : 'foreign';
}

/**
 * 停止单个 redis 进程（**按 PID 精确停止，不发进程组信号**）。
 *
 * 不能复用 lib/proc 的 killTree：killTree 向进程组发信号（-pid），而旧实例
 * 的 pgid 属于其启动方（可能是已退出的旧 PM2 daemon）——`process.kill(-pid)`
 * 会 ESRCH 被误判"成功"但实际未杀掉，端口仍被占，PM2 重启后新 redis-manager
 * 误判"已在运行"进入 keepAlive，旧实例继续无密码运行。
 * - Linux：SIGTERM 发给 pid 本身（redis 优雅退出，落盘 AOF 后再退出）；
 * - Windows：taskkill /PID /T /F（redis 无子进程，/T 等价单进程）。
 * @param {number|null} pid
 * @returns {boolean} 是否已停止（进程已不存在视为已停止）
 */
function stopRedisProcess(pid) {
  if (!pid) return false;
  try {
    if (IS_WINDOWS) {
      const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      // 退出码：0=成功终止；128=目标不存在（已退出，视为已停止）
      return result.status === 0 || result.status === 128;
    }
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (err) {
    // ESRCH = 进程已不存在，视为已停止；其余（EPERM 等）为真实失败
    return err.code === 'ESRCH';
  }
}

module.exports = {
  isOurRedisInstance,
  getProcessCmdline,
  detectRedisOwnership,
  stopRedisProcess,
};
