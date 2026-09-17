/**
 * 运维 CLI 操作留痕（#418 边界防护 / #407 决策执行）
 *
 * 统一入口 cli.js 每次被调用时，向 data/ops-log/YYYYMM.ops.log 追加留痕：
 *   - 启动行：ISO 时间戳 + 执行者 uid + 命令行参数
 *   - 退出行：ISO 时间戳 + 退出码
 *
 * 留痕是安全审计的一部分（8.1.4.3 运维操作可追溯）：
 * 谁在何时执行了哪条运维命令、结果如何，均可在日志中还原。
 *
 * 设计取舍：
 * - 追加写（append），按月分文件（YYYYMM），便于轮转与留存。
 * - 任何异常静默吞掉：留痕失败不阻断运维命令本身（可用性优先）。
 * - Windows 下 uid 取 os.userInfo().username（无 getuid）。
 * - data/ 已在 .gitignore，留痕文件不入库。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./context');

const OPS_LOG_DIR = path.join(DATA_DIR, 'ops-log');

function getExecutor() {
  try {
    if (typeof process.getuid === 'function') {
      return `uid=${process.getuid()}`;
    }
  } catch (_) {}
  try {
    return `user=${os.userInfo().username}`;
  } catch (_) {
    return 'user=unknown';
  }
}

function currentLogFile() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  return path.join(OPS_LOG_DIR, `${ym}.ops.log`);
}

function appendLine(line) {
  try {
    fs.mkdirSync(OPS_LOG_DIR, { recursive: true });
    fs.appendFileSync(currentLogFile(), `${line}\n`, 'utf8');
  } catch (_) {
    // 留痕失败不阻断运维命令
  }
}

/**
 * 记录启动留痕行。
 * @param {string[]} argv 命令行参数（process.argv.slice(2)）
 */
function recordStart(argv) {
  const iso = new Date().toISOString();
  const cmd = argv.length ? argv.join(' ') : '(interactive)';
  appendLine(`${iso} start ${getExecutor()} cmd=${sanitizeCmd(cmd)}`);
}

/**
 * 参数含引号/反斜杠/换行时转义，防止留痕行被拆行或失真（审计用途）。
 * 无特殊字符时原样返回（常见路径零开销）。
 */
function sanitizeCmd(cmd) {
  if (!/[\\"]|\r|\n/.test(cmd)) return `"${cmd}"`;
  return JSON.stringify(cmd);
}

/**
 * 安装退出留痕钩子：进程退出时记录退出码。
 * 在 cli.js 顶层调用一次即可。
 *
 * 覆盖三类退出：
 * - 正常退出 / process.exit(n) → 'exit' 事件（code 为实际退出码）
 * - SIGTERM / SIGINT（Ctrl+C、kill、超时）→ 'exit' 事件不保证携带正确 code，
 *   故显式挂信号处理器：记录信号名后主动 exit，保证「被信号杀掉的命令」也有留痕行。
 */
function installExitHook() {
  let exitRecorded = false;
  const record = (codeOrSignal) => {
    if (exitRecorded) return;
    exitRecorded = true;
    const iso = new Date().toISOString();
    const field =
      typeof codeOrSignal === 'number' ? `code=${codeOrSignal}` : `signal=${codeOrSignal}`;
    appendLine(`${iso} exit ${getExecutor()} ${field}`);
  };

  process.on('exit', (code) => record(code));
  process.on('SIGTERM', () => {
    record('SIGTERM');
    process.exit(143); // 128 + 15
  });
  process.on('SIGINT', () => {
    record('SIGINT');
    process.exit(130); // 128 + 2
  });
}

module.exports = { recordStart, installExitHook, OPS_LOG_DIR };
